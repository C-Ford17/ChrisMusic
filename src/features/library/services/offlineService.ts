import { db, type OfflineSong, type LocalSong } from '@/core/db/db';
import { type Song } from '@/core/types/music';
import { LibraryService } from './libraryService';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';

// Helper to convert blob to base64 for Filesystem
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

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
      
      if (Capacitor.isNativePlatform()) {
        return Capacitor.convertFileSrc(offlineSong.filePath);
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

      if (Capacitor.isNativePlatform()) {
        return Capacitor.convertFileSrc(cachedSong.filePath);
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
        
        console.log(`[OfflineService] Fetching stream URL from: ${apiUrl}`);
        // Step 1: Get high quality audio URL from Flask API
        const streamRes = await CapacitorHttp.get({
          url: `${apiUrl}/stream`,
          params: { id: song.id }
        });

        if (streamRes.status !== 200 || !streamRes.data.url) {
          throw new Error('Could not get streaming URL from API.');
        }

        const audioUrl = streamRes.data.url;
        console.log(`[OfflineService] Audio URL obtained, starting binary download...`);

        // Step 2: Download the audio via CapacitorHttp to bypass CORS
        const audioRes = await CapacitorHttp.get({
          url: audioUrl,
          responseType: 'blob'
        });

        if (audioRes.status !== 200) throw new Error('Failed to download audio file via native layer.');

        console.log(`[OfflineService] Binary data received, converting to Blob...`);
        // Capacitor returns base64 string for 'blob' responseType
        const base64Data = audioRes.data;
        
        if (Capacitor.isNativePlatform()) {
          const fileName = `offline_${song.id}.m4a`;
          const saveResult = await Filesystem.writeFile({
            path: fileName,
            data: base64Data,
            directory: Directory.Data
          });

          await db.offlineSongs.put({
            id: song.id,
            song: song as LocalSong,
            filePath: saveResult.uri,
            downloadedAt: Date.now()
          });
        } else {
          const blob = await fetch(`data:audio/mp4;base64,${base64Data}`).then(res => res.blob());
          await db.offlineSongs.put({
            id: song.id,
            song: song as LocalSong,
            audioBlob: blob,
            downloadedAt: Date.now()
          });
        }
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
      // Capacitor / Android Caching
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://192.168.1.195:5000";
        const { CapacitorHttp } = await import('@capacitor/core');
        
        const streamRes = await CapacitorHttp.get({
          url: `${apiUrl}/stream`,
          params: { id: song.id }
        });

        if (streamRes.status === 200 && streamRes.data.url) {
          const audioRes = await CapacitorHttp.get({
            url: streamRes.data.url,
            responseType: 'blob'
          });

          if (audioRes.status === 200) {
            const base64Data = audioRes.data;
            
            if (Capacitor.isNativePlatform()) {
              const fileName = `cache_${song.id}.m4a`;
              const saveResult = await Filesystem.writeFile({
                path: fileName,
                data: base64Data,
                directory: Directory.Cache
              });

              await db.cachedSongs.put({
                id: song.id,
                song: song as LocalSong,
                filePath: saveResult.uri,
                cachedAt: Date.now()
              });
              return saveResult.uri;
            } else {
              const blob = await fetch(`data:audio/mp4;base64,${base64Data}`).then(res => res.blob());
              await db.cachedSongs.put({
                id: song.id,
                song: song as LocalSong,
                audioBlob: blob,
                cachedAt: Date.now()
              });
              return 'blob';
            }
          }
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
