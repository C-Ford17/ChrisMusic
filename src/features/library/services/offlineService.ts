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
    console.log('[OfflineService] GET_OFFLINE_URL for ID:', songId);
    const offlineSong = await db.offlineSongs.get(songId);
    if (!offlineSong) {
      console.log('[OfflineService] No offline song record found in DB for ID:', songId);
      return null;
    }

    // Native Android/Tauri Optimization: Use stored file path if available
    if (offlineSong.filePath && YouTubeExtractionService.isAndroid()) {
      try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        // Extract filename from URI (file:///.../cache/offline_ID.aac)
        const parts = offlineSong.filePath.split('/');
        const fileName = parts[parts.length - 1];
        
        await Filesystem.stat({
          path: fileName,
          directory: Directory.Cache
        });
        console.log('[OfflineService] Using cached native URI for:', songId);
        return offlineSong.filePath;
      } catch (e) {
        console.log('[OfflineService] Stored native file missing, re-generating...', songId);
      }
    }

    if (!offlineSong.audioBlob) return null;

    if (YouTubeExtractionService.isAndroid()) {
      const uri = await this.blobToNativeFileUri(offlineSong.audioBlob, `offline_${songId}`);
      if (uri) {
        // Save the URI back to the database for future use
        await db.offlineSongs.update(songId, { filePath: uri });
      }
      return uri;
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

      // Determine extension from MIME type or fileName prefix hint
      let ext = 'aac';
      if (blob.type.includes('image/')) ext = 'jpg';
      else if (fileName.startsWith('thumb_')) ext = 'jpg'; 
      else if (blob.type.includes('audio/')) ext = 'aac';
      
      if (blob.type.includes('webm')) ext = 'webm';
      else if (blob.type.includes('ogg')) ext = 'ogg';
      else if (blob.type.includes('mpeg') || blob.type.includes('mp3')) ext = 'mp3';
      else if (blob.type.includes('jpeg')) ext = 'jpg';
      else if (blob.type.includes('png')) ext = 'png';
      else if (blob.type.includes('webp')) ext = 'webp';
      else if (blob.type.includes('avif')) ext = 'avif';

      console.log(`[OfflineService] blobToNativeFileUri: Identified extension .${ext} for MIME ${blob.type}`);
      const fullName = `${fileName}.${ext}`;

      // OPTIMIZATION: Check if the file already exists in cache
      try {
        const { uri } = await Filesystem.getUri({
          path: fullName,
          directory: Directory.Cache,
        });
        
        // Use stat to verify the file actually exists and has content
        const stats = await Filesystem.stat({
          path: fullName,
          directory: Directory.Cache
        });

        if (stats.size > 0) {
          console.log('[OfflineService] Using existing file from disk cache:', fullName);
          return uri;
        }
      } catch (statError) {
        // File doesn't exist or error getting stat, proceed to write it
        console.log('[OfflineService] File not in disk cache, writing new:', fullName);
      }

      // Convert Blob → base64 (Expensive operation blocker)
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

      console.log('[OfflineService] Successfully written new file to disk:', uri);
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
      
      // Parallel fetch for audio and thumbnails
      let audioBlob: Blob;
      let thumbBlob: Blob | undefined;
      let thumbHighResBlob: Blob | undefined;

      const hqThumbUrl = YouTubeExtractionService.getFallbackThumbnail(song.id, song.thumbnailUrl);
      const maxResThumbUrl = YouTubeExtractionService.getHighResThumbnail(song.id, song.thumbnailUrl);

      // Use local extraction for Android native app
      if (YouTubeExtractionService.isAndroid()) {
        console.log('[OfflineService] Android detected. Performing native extraction for:', song.id);
        const [audio, thumb, thumbHigh] = await Promise.all([
          this.fetchNativeBlob('', song.id),
          this.fetchNativeBlob(hqThumbUrl).catch(() => undefined),
          this.fetchNativeBlob(maxResThumbUrl).catch(() => undefined)
        ]);
        audioBlob = audio;
        thumbBlob = thumb;
        thumbHighResBlob = thumbHigh;
      } else if (YouTubeExtractionService.isTauri()) {
        console.log('[OfflineService] Tauri detected. Fetching stream URL for download:', song.id);
        const streamUrl = await youtubeExtractionService.getStreamUrl(song.id);
        const [audio, thumb, thumbHigh] = await Promise.all([
          this.fetchNativeBlob(streamUrl),
          this.fetchNativeBlob(hqThumbUrl).catch(() => undefined),
          this.fetchNativeBlob(maxResThumbUrl).catch(() => undefined)
        ]);
        audioBlob = audio;
        thumbBlob = thumb;
        thumbHighResBlob = thumbHigh;
      } else {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://chrismusic-production.up.railway.app";
        const [audio, thumb, thumbHigh] = await Promise.all([
          this.fetchNativeBlob(`${apiUrl}/proxy?id=${song.id}`),
          this.fetchNativeBlob(hqThumbUrl).catch(() => undefined),
          this.fetchNativeBlob(maxResThumbUrl).catch(() => undefined)
        ]);
        audioBlob = audio;
        thumbBlob = thumb;
        thumbHighResBlob = thumbHigh;
      }

      const last = await db.offlineSongs.orderBy('orderIndex').last();
      const nextIndex = (last?.orderIndex ?? 0) + 1;

      const offlineSongData: OfflineSong = {
        id: song.id,
        song: song,
        audioBlob,
        thumbnailBlob: thumbBlob,
        thumbnailHighResBlob: thumbHighResBlob,
        downloadedAt: Date.now(),
        orderIndex: nextIndex
      };

      await db.offlineSongs.put(offlineSongData);
      console.log(`[OfflineService] Download complete for: ${song.title}`);

      // Background: Fetch and save lyrics for offline use
      try {
        const { lyricsService } = await import('@/features/lyrics/services/lrclibService');
        const lyrics = await lyricsService.getLyrics(song.artistName, song.title, song.duration);
        if (lyrics) {
          const { LibraryService } = await import('@/features/library/services/libraryService');
          await LibraryService.saveLyrics(song.id, lyrics);
          console.log(`[OfflineService] Lyrics saved for: ${song.title}`);
        }
      } catch (e) {
        console.warn('[OfflineService] Failed to fetch lyrics during download:', e);
      }
    } catch (error) {
      console.error('[OfflineService] Download error:', error);
      throw error;
    }
  }

  async updateOfflineOrder(songIds: string[]): Promise<void> {
    await db.transaction('rw', db.offlineSongs, async () => {
      for (let i = 0; i < songIds.length; i++) {
        await db.offlineSongs.update(songIds[i], { orderIndex: i });
      }
    });
  }

  async removeDownload(songId: string): Promise<void> {
    await db.offlineSongs.delete(songId);
  }

  // Cache compatibility methods (Rolling cache for last 10 songs)
  private readonly CACHE_LIMIT = 10;

  async cacheSong(song: Song): Promise<void> {
    try {
      // 1. Skip if it's already downloaded permanently
      if (await this.isDownloaded(song.id)) {
        return;
      }

      // 2. Check if already in cache to update timestamp
      const existing = await db.cachedSongs.get(song.id);
      if (existing) {
        await db.cachedSongs.update(song.id, { cachedAt: Date.now() });
        return;
      }

      console.log(`[OfflineService] Caching song: ${song.title}`);
      let audioBlob: Blob;
      let thumbBlob: Blob | undefined;
      let thumbHighResBlob: Blob | undefined;

      const hqThumbUrl = YouTubeExtractionService.getFallbackThumbnail(song.id, song.thumbnailUrl);
      const maxResThumbUrl = YouTubeExtractionService.getHighResThumbnail(song.id, song.thumbnailUrl);
      
      if (YouTubeExtractionService.isAndroid()) {
        const [audio, thumb, thumbHigh] = await Promise.all([
          this.fetchNativeBlob('', song.id),
          this.fetchNativeBlob(hqThumbUrl).catch(() => undefined),
          this.fetchNativeBlob(maxResThumbUrl).catch(() => undefined)
        ]);
        audioBlob = audio;
        thumbBlob = thumb;
        thumbHighResBlob = thumbHigh;
      } else if (YouTubeExtractionService.isTauri()) {
        const streamUrl = await youtubeExtractionService.getStreamUrl(song.id);
        const [audio, thumb, thumbHigh] = await Promise.all([
          this.fetchNativeBlob(streamUrl),
          this.fetchNativeBlob(hqThumbUrl).catch(() => undefined),
          this.fetchNativeBlob(maxResThumbUrl).catch(() => undefined)
        ]);
        audioBlob = audio;
        thumbBlob = thumb;
        thumbHighResBlob = thumbHigh;
      } else {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://chrismusic-production.up.railway.app";
        const [audio, thumb, thumbHigh] = await Promise.all([
          this.fetchNativeBlob(`${apiUrl}/proxy?id=${song.id}`),
          this.fetchNativeBlob(hqThumbUrl).catch(() => undefined),
          this.fetchNativeBlob(maxResThumbUrl).catch(() => undefined)
        ]);
        audioBlob = audio;
        thumbBlob = thumb;
        thumbHighResBlob = thumbHigh;
      }

      const cachedSong: CachedSong = {
        id: song.id,
        song: song,
        audioBlob,
        thumbnailBlob: thumbBlob,
        thumbnailHighResBlob: thumbHighResBlob,
        cachedAt: Date.now()
      };
      
      await db.cachedSongs.put(cachedSong);

      // Background: Fetch and save lyrics for offline use
      try {
        const { lyricsService } = await import('@/features/lyrics/services/lrclibService');
        const lyrics = await lyricsService.getLyrics(song.artistName, song.title, song.duration);
        if (lyrics) {
          const { LibraryService } = await import('@/features/library/services/libraryService');
          await LibraryService.saveLyrics(song.id, lyrics);
          console.log(`[OfflineService] Lyrics saved to cache for: ${song.title}`);
        }
      } catch (e) {
        console.warn('[OfflineService] Failed to fetch lyrics during caching:', e);
      }
      
      // 3. Clean up oldest entries
      await this.cleanupCache();
    } catch (e) {
      console.warn('[OfflineService] Caching failed:', e);
    }
  }

  /**
   * Maintains the cache limit by deleting oldest entries.
   */
  private async cleanupCache(): Promise<void> {
    try {
      const count = await db.cachedSongs.count();
      if (count <= this.CACHE_LIMIT) return;

      const excess = count - this.CACHE_LIMIT;
      const oldestEntries = await db.cachedSongs
        .orderBy('cachedAt')
        .limit(excess)
        .toArray();

      for (const entry of oldestEntries) {
        console.log(`[OfflineService] Cleaning up old cache entry: ${entry.song.title}`);
        await db.cachedSongs.delete(entry.id);
      }
    } catch (e) {
      console.error('[OfflineService] cleanupCache failed:', e);
    }
  }

  async getCachedUrl(songId: string): Promise<string | null> {
    console.log('[OfflineService] GET_CACHED_URL for ID:', songId);
    const cached = await db.cachedSongs.get(songId);
    if (!cached) {
      console.log('[OfflineService] No cached song record found in DB for ID:', songId);
      return null;
    }

    // Native Optimization: Use stored file path if available
    if (cached.filePath && YouTubeExtractionService.isAndroid()) {
      try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const parts = cached.filePath.split('/');
        const fileName = parts[parts.length - 1];
        
        await Filesystem.stat({
          path: fileName,
          directory: Directory.Cache
        });
        console.log('[OfflineService] Using cached native URI for cache entry:', songId);
        return cached.filePath;
      } catch (e) {
        // Missing or error, fallback to regeneration
      }
    }

    if (!cached.audioBlob) return null;

    if (YouTubeExtractionService.isAndroid()) {
      const uri = await this.blobToNativeFileUri(cached.audioBlob, `cached_${songId}`);
      if (uri) {
        await db.cachedSongs.update(songId, { filePath: uri });
      }
      return uri;
    }
    return URL.createObjectURL(cached.audioBlob);
  }

  async getAllDownloaded(): Promise<OfflineSong[]> {
    return await db.offlineSongs.toArray();
  }

  /**
   * Resolves a song to use local URLs for both audio and thumbnail if available.
   * This ensures playback and UI work perfectly offline.
   */
  async resolveOfflineSong(song: Song): Promise<{ song: Song, audioUrl: string | null }> {
    // 1. Check permanent download
    let record: OfflineSong | CachedSong | undefined = await db.offlineSongs.get(song.id);
    let isCached = false;

    // 2. Check temporary cache
    if (!record) {
      record = await db.cachedSongs.get(song.id);
      isCached = true;
    }

    if (!record) return { song, audioUrl: null };

    const resolvedSong = { ...song };

    // Resolve Thumbnail (Standard and High Res)
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const isAndroid = YouTubeExtractionService.isAndroid();

      const resolveThumbnail = async (
        blob: Blob | undefined, 
        existingPath: string | undefined, 
        prefix: string,
        dbField: 'thumbnailFilePath' | 'thumbnailHighResFilePath'
      ): Promise<string | undefined> => {
        if (existingPath && isAndroid) {
          try {
            const fileName = existingPath.split('/').pop() || '';
            await Filesystem.stat({ path: fileName, directory: Directory.Cache });
            if (!existingPath.endsWith('.aac')) return existingPath;
          } catch (e) { /* missing or corrupted */ }
        }

        if (blob) {
          if (isAndroid) {
            const uri = await this.blobToNativeFileUri(blob, `${prefix}_${song.id}`);
            if (uri) {
              const updateObj = { [dbField]: uri };
              if (isCached) await db.cachedSongs.update(song.id, updateObj);
              else await db.offlineSongs.update(song.id, updateObj);
              return uri;
            }
          } else {
            return URL.createObjectURL(blob);
          }
        }
        return undefined;
      };

      // Resolve Standard Thumbnail
      const stdPath = await resolveThumbnail(record.thumbnailBlob, record.thumbnailFilePath, 'thumb', 'thumbnailFilePath');
      if (stdPath) resolvedSong.thumbnailUrl = stdPath;

      // Resolve High Res Thumbnail
      const highPath = await resolveThumbnail(record.thumbnailHighResBlob, record.thumbnailHighResFilePath, 'thumb_high', 'thumbnailHighResFilePath');
      if (highPath) resolvedSong.thumbnailHighResUrl = highPath;
      else if (stdPath) resolvedSong.thumbnailHighResUrl = stdPath; // Fallback to std if high-res missing
    } catch (e) {
      console.warn('[OfflineService] Failed to resolve local thumbnails:', e);
    }

    // Resolve Audio URL
    const audioUrl = isCached ? await this.getCachedUrl(song.id) : await this.getOfflineUrl(song.id);

    return { song: resolvedSong, audioUrl };
  }

  /**
   * Quick check for a song's offline thumbnail without resolving audio.
   * Useful for UI lists.
   */
  async getOfflineThumbnail(songId: string, preferHighRes: boolean = false): Promise<string | null> {
    const record = await db.offlineSongs.get(songId) || await db.cachedSongs.get(songId);
    if (!record) return null;

    if (preferHighRes && (record.thumbnailHighResFilePath || record.thumbnailHighResBlob)) {
      if (record.thumbnailHighResFilePath && YouTubeExtractionService.isAndroid()) return record.thumbnailHighResFilePath;
      if (record.thumbnailHighResBlob) return URL.createObjectURL(record.thumbnailHighResBlob);
    }

    if (record.thumbnailFilePath && YouTubeExtractionService.isAndroid()) return record.thumbnailFilePath;
    return record.thumbnailBlob ? URL.createObjectURL(record.thumbnailBlob) : null;
  }

  /**
   * Scans all offline and cached songs to fetch missing high-res thumbnails and lyrics.
   * Useful for users with existing downloads before these features were added.
   */
  async repairMetadata(onProgress?: (current: number, total: number, songTitle: string) => void): Promise<void> {
    const offline = await db.offlineSongs.toArray();
    const cached = await db.cachedSongs.toArray();
    const all = [...offline, ...cached];
    
    console.log(`[OfflineService] Starting metadata repair for ${all.length} songs`);
    
    const { lyricsService } = await import('@/features/lyrics/services/lrclibService');
    const { LibraryService } = await import('@/features/library/services/libraryService');

    let current = 0;
    for (const record of all) {
      current++;
      const song = record.song;
      if (onProgress) onProgress(current, all.length, song.title);

      const needsHighRes = !record.thumbnailHighResBlob && !record.thumbnailHighResFilePath;
      const lyrics = await LibraryService.getLyrics(song.id);
      const needsLyrics = !lyrics;

      if (!needsHighRes && !needsLyrics) continue;

      try {
        const promises: Promise<any>[] = [];

        // 1. Fetch High-Res Thumbnail if missing
        if (needsHighRes) {
          const maxResUrl = YouTubeExtractionService.getHighResThumbnail(song.id, song.thumbnailUrl);
          promises.push(
            this.fetchNativeBlob(maxResUrl)
              .then(async (blob) => {
                if (blob) {
                  const updateObj: any = { thumbnailHighResBlob: blob };
                  if (YouTubeExtractionService.isAndroid()) {
                    const uri = await this.blobToNativeFileUri(blob, `thumb_high_${song.id}`);
                    if (uri) updateObj.thumbnailHighResFilePath = uri;
                  }
                  
                  if ('downloadedAt' in record) {
                    await db.offlineSongs.update(song.id, updateObj);
                  } else {
                    await db.cachedSongs.update(song.id, updateObj);
                  }
                }
              })
              .catch(() => console.warn(`[OfflineService] Could not fetch high-res thumb for ${song.title}`))
          );
        }

        // 2. Fetch Lyrics if missing
        if (needsLyrics) {
          promises.push(
            lyricsService.getLyrics(song.artistName, song.title, song.duration)
              .then(async (l) => {
                if (l) await LibraryService.saveLyrics(song.id, l);
              })
              .catch(() => console.warn(`[OfflineService] Could not fetch lyrics for ${song.title}`))
          );
        }

        await Promise.all(promises);
      } catch (e) {
        console.error(`[OfflineService] Error repairing ${song.title}:`, e);
      }
    }
    
    console.log('[OfflineService] Metadata repair complete');
  }
}

export const offlineService = OfflineService.getInstance();
