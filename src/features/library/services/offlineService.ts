import { db, type OfflineSong, type CachedSong } from '@/core/db/db';
import { type Song } from '@/core/types/music';
import { youtubeExtractionService, YouTubeExtractionService } from '@/features/player/services/youtubeExtractionService';
import { toast } from 'sonner';

export class OfflineService {
  private static instance: OfflineService;

  private constructor() {}

  public static getInstance(): OfflineService {
    if (!OfflineService.instance) {
      OfflineService.instance = new OfflineService();
    }
    return OfflineService.instance;
  }

  async isDownloaded(songId: string): Promise<boolean> {
    const offlineSong = await db.offlineSongs.get(songId);
    return !!offlineSong;
  }

  /**
   * Returns a URL suitable for playback.
   * - Web: blob: URL (works with HTMLAudioElement)
   * - Android: file:// URI written to cache dir (required for ExoPlayer — it cannot
   *   access blob: URLs that exist only in the WebView's JS context)
   */
  async getOfflineUrl(songId: string): Promise<string | null> {
    const offlineSong = await db.offlineSongs.get(songId);
    if (!offlineSong || !offlineSong.audioBlob) return null;
    if (YouTubeExtractionService.isAndroid()) {
      return this.blobToNativeFileUri(offlineSong.audioBlob, `offline_${songId}`);
    }
    return URL.createObjectURL(offlineSong.audioBlob);
  }

  /**
   * Converts a Blob to a native file:// URI via @capacitor/filesystem.
   * Written to Directory.Cache so the OS can reclaim space if needed.
   * Returns null and logs on failure.
   */
  private async blobToNativeFileUri(blob: Blob, fileName: string): Promise<string | null> {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');

      // Determine extension from MIME type
      const ext = blob.type.includes('webm') ? 'webm'
                : blob.type.includes('ogg')  ? 'ogg'
                : 'aac'; // default for audio/aac or audio/mp4
      const fullName = `${fileName}.${ext}`;

      // Convert Blob → base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Strip data:...;base64, prefix
          resolve(result.split(',')[1]);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });

      // Write to cache
      await Filesystem.writeFile({
        path: fullName,
        data: base64,
        directory: Directory.Cache,
      });

      // Get native URI (file:///data/user/0/...)
      const { uri } = await Filesystem.getUri({
        path: fullName,
        directory: Directory.Cache,
      });

      console.log('[OfflineService] Written offline file to:', uri);
      return uri;
    } catch (e) {
      console.error('[OfflineService] blobToNativeFileUri failed:', e);
      return null;
    }
  }

  /**
   * Fetches binary data using the most appropriate native fetcher for the platform.
   * This bypasses CORS and works in both Tauri and Capacitor.
   */
  async fetchNativeBlob(url: string, songId?: string): Promise<Blob> {
    if (YouTubeExtractionService.isTauri()) {
      try {
        const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
        const res = await tauriFetch(url, { method: 'GET' });
        if (!res.ok) throw new Error(`Tauri fetch failed: ${res.status}`);
        return await res.blob();
      } catch (e) {
        console.warn('[OfflineService] Tauri native fetch failed, trying window.fetch');
      }
    } else if (YouTubeExtractionService.isAndroid() && songId) {
      try {
        console.log('[OfflineService] Using Native ADTS Transcoder for:', songId, 'URL:', url.substring(0, 30) + '...');
        console.log('[OfflineService] Using Native ADTS Transcoder for:', songId, 'URL:', url.substring(0, 30) + '...');
        const res = await youtubeExtractionService.downloadToAdts(songId);

        if (res.base64) {
          const binaryString = window.atob(res.base64);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          return new Blob([bytes], { type: 'audio/aac' });
        }
      } catch (e: any) {
        const errorMsg = e.message || 'Error desconocido en el motor nativo';
        toast.error('Fallo de Transcodificación Nativa', { description: errorMsg });
        console.error('[OfflineService] Native ADTS transcoding failed:', e);
        // ON ANDROID: We DON'T fallback to direct download because it gives moov/MP4 which fails in background
        throw e;
      }
    } else if (YouTubeExtractionService.isCapacitor()) {
      try {
        const { CapacitorHttp } = await import('@capacitor/core');
        const res = await CapacitorHttp.request({
          url,
          method: 'GET',
          responseType: 'blob'
        });
        
        if (res.status >= 200 && res.status < 300) {
          // CapacitorHttp returns base64 for blob responseType
          const base64 = res.data;
          const dataUrl = `data:application/octet-stream;base64,${base64}`;
          const response = await fetch(dataUrl);
          return await response.blob();
        }
        throw new Error(`Capacitor fetch failed: ${res.status}`);
      } catch (e) {
        console.warn('[OfflineService] Capacitor native fetch failed:', e);
      }
    }

    // Fallback for Web or if native fails
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Standard fetch failed: ${res.status}`);
    return await res.blob();
  }

  async downloadSong(song: Song): Promise<void> {
    if (await this.isDownloaded(song.id)) return;

    try {
      console.log(`[OfflineService] Starting download for: ${song.title} (${song.id})`);
      
      let blob: Blob;

      // Use local extraction for native apps
      if (YouTubeExtractionService.isAndroid()) {
        console.log('[OfflineService] Android detected. Performing single-pass native extraction...');
        blob = await this.fetchNativeBlob('', song.id);
      } else {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
        blob = await this.fetchNativeBlob(`${apiUrl}/proxy?id=${song.id}`);
      }

      const offlineSongData: OfflineSong = {
        id: song.id,
        song: song,
        audioBlob: blob,
        downloadedAt: Date.now()
      };

      await db.offlineSongs.put(offlineSongData);
    } catch (error) {
      console.error('[OfflineService] Download error:', error);
      throw error;
    }
  }

  async removeDownload(songId: string): Promise<void> {
    await db.offlineSongs.delete(songId);
  }

  // Cache compatibility methods (Aggressive caching)
  async cacheSong(song: Song): Promise<void> {
    try {
      const isCached = await db.cachedSongs.get(song.id);
      if (isCached) return;

      console.log(`[OfflineService] Caching song: ${song.title}`);
      let blob: Blob;
      
      if (YouTubeExtractionService.isAndroid()) {
        blob = await this.fetchNativeBlob('', song.id);
      } else {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
        blob = await this.fetchNativeBlob(`${apiUrl}/proxy?id=${song.id}`);
      }

      const cachedSong: CachedSong = {
        id: song.id,
        song: song,
        audioBlob: blob,
        cachedAt: Date.now()
      };
      await db.cachedSongs.put(cachedSong);
    } catch (e) {
      console.warn('[OfflineService] Caching failed:', e);
    }
  }

  async getCachedUrl(songId: string): Promise<string | null> {
    const cached = await db.cachedSongs.get(songId);
    if (!cached || !cached.audioBlob) return null;
    if (YouTubeExtractionService.isAndroid()) {
      return this.blobToNativeFileUri(cached.audioBlob, `cached_${songId}`);
    }
    return URL.createObjectURL(cached.audioBlob);
  }

  async getAllDownloaded(): Promise<OfflineSong[]> {
    return await db.offlineSongs.toArray();
  }
}

export const offlineService = OfflineService.getInstance();
