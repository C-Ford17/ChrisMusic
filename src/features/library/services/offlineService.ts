import { db, type OfflineSong, type LocalSong } from '@/core/db/db';
import { type Song } from '@/core/types/music';
import { LibraryService } from './libraryService';

export const OfflineService = {
  async isDownloaded(songId: string): Promise<boolean> {
    const song = await db.offlineSongs.get(songId);
    return !!song;
  },

  async getOfflineUrl(songId: string): Promise<string | null> {
    const offlineSong = await db.offlineSongs.get(songId);
    if (!offlineSong) return null;
    
    if (offlineSong.filePath) {
      if (typeof window !== 'undefined' && (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
        const { convertFileSrc } = await import('@tauri-apps/api/core');
        return convertFileSrc(offlineSong.filePath);
      }
    }

    if (offlineSong.audioBlob) {
      return URL.createObjectURL(offlineSong.audioBlob);
    }

    return null;
  },

  async getCachedUrl(songId: string): Promise<string | null> {
    const cachedSong = await db.cachedSongs.get(songId);
    if (!cachedSong) return null;
    
    if (cachedSong.filePath) {
      if (typeof window !== 'undefined' && (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
        const { convertFileSrc } = await import('@tauri-apps/api/core');
        return convertFileSrc(cachedSong.filePath);
      }
    }

    if (cachedSong.audioBlob) {
      return URL.createObjectURL(cachedSong.audioBlob);
    }

    return null;
  },

  async downloadSong(song: Song): Promise<void> {
    if (await this.isDownloaded(song.id)) return;

    try {
      console.log(`[OfflineService] Starting download for: ${song.title} (${song.id})`);
      const isTauri = typeof window !== 'undefined' && (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
      
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        const filePath = await invoke('download_to_disk', { 
          videoId: song.id,
          title: song.title,
          isCache: false
        }) as string;
        
        if (!filePath) throw new Error('Native download engine failed.');

        await db.offlineSongs.put({
          id: song.id,
          song: song as LocalSong,
          filePath: filePath,
          downloadedAt: Date.now()
        });
      } else {
        // Capacitor / Web fallback
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
        const { CapacitorHttp } = await import('@capacitor/core');
        
        console.log(`[OfflineService] Downloading audio from /proxy endpoint...`);
        // /proxy runs FFmpeg which strips video and gives pure audio
        const audioRes = await CapacitorHttp.get({
          url: `${apiUrl}/proxy?id=${song.id}`,
          responseType: 'blob'
        });

        if (audioRes.status !== 200) throw new Error(`Proxy download failed: HTTP ${audioRes.status}`);

        console.log(`[OfflineService] Binary data received, converting to Blob...`);
        const base64Data = audioRes.data;
        
        // Fallback to storing as Blob in all environments (reverted to Strategy Blob)
        const blob = await fetch(`data:audio/aac;base64,${base64Data}`).then(res => res.blob());
        await db.offlineSongs.put({
          id: song.id,
          song: song as LocalSong,
          audioBlob: blob,
          downloadedAt: Date.now()
        });
      }

      // Step 3: Lyrics
      try {
        console.log(`[OfflineService] Syncing lyrics for offline use...`);
        const { lyricsService } = await import('@/features/lyrics/services/lrclibService');
        const data = await lyricsService.getLyrics(song.artistName, song.title, song.duration);
        if (data) {
          await LibraryService.saveLyrics(song.id, data);
          console.log(`[OfflineService] Lyrics saved.`);
        }
      } catch (e) {
        console.warn('[OfflineService] Lyrics offline sync failed', e);
      }

      console.log(`[OfflineService] Download process COMPLETE for: ${song.title}`);

    } catch (error: unknown) {
      console.error('[OfflineService] Download error:', error);
      throw error;
    }
  },

  async cacheSong(song: Song): Promise<string | null> {
    const isTauri = typeof window !== 'undefined' && (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const filePath = await invoke('download_to_disk', { 
          videoId: song.id,
          title: song.title,
          isCache: true
        }) as string;

        if (filePath) {
          await db.cachedSongs.put({
            id: song.id,
            song: song as LocalSong,
            filePath: filePath,
            cachedAt: Date.now()
          });
          return filePath;
        }
      } catch (e) {
        console.warn('Tauri Caching failed:', e);
      }
    } else {
      // Capacitor / Android Caching - uses /proxy to get audio-only AAC blob
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://192.168.1.195:5000";
        const { CapacitorHttp } = await import('@capacitor/core');
        
        // Download directly from proxy: FFmpeg strips video → safe background blob
        const audioRes = await CapacitorHttp.get({
          url: `${apiUrl}/proxy?id=${song.id}`,
          responseType: 'blob'
        });

        if (audioRes.status === 200) {
          const base64Data = audioRes.data;
          
          // Blob storage fallback
          const blob = await fetch(`data:audio/aac;base64,${base64Data}`).then(res => res.blob());
          await db.cachedSongs.put({
            id: song.id,
            song: song as LocalSong,
            audioBlob: blob,
            cachedAt: Date.now()
          });
          return 'blob';
        } else {
          console.warn(`[OfflineService] Proxy returned status ${audioRes.status}`);
        }
      } catch (e) {
        console.warn('Capacitor Caching failed:', e);
      }
    }
    return null;
  },

  async removeDownload(songId: string): Promise<void> {
    const offlineSong = await db.offlineSongs.get(songId);
    if (!offlineSong) return;

    if (offlineSong.filePath) {
      if (typeof window !== 'undefined' && (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
        try {
          const { exists, remove } = await import('@tauri-apps/plugin-fs');
          if (await exists(offlineSong.filePath)) {
            await remove(offlineSong.filePath);
          }
        } catch (e) {
          console.error('File removal failed:', e);
        }
      }
    }

    await db.offlineSongs.delete(songId);
  },

  async getAllDownloaded(): Promise<OfflineSong[]> {
    return await db.offlineSongs.toArray();
  }
};
