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

  async getOfflineUrl(songId: string): Promise<string | null> {
    const offlineSong = await db.offlineSongs.get(songId);
    if (!offlineSong || !offlineSong.audioBlob) return null;
    return URL.createObjectURL(offlineSong.audioBlob);
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
    return URL.createObjectURL(cached.audioBlob);
  }

  async getAllDownloaded(): Promise<OfflineSong[]> {
    return await db.offlineSongs.toArray();
  }
}

export const offlineService = OfflineService.getInstance();
