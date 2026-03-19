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
    return URL.createObjectURL(offlineSong.audioBlob);
  },

  async downloadSong(song: Song): Promise<void> {
    if (await this.isDownloaded(song.id)) return;

    try {
      // Step 1: Request discovery via our private server engine
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: song.id })
      });

      if (!response.ok) {
        throw new Error('Our internal download engine failed to generate a link.');
      }

      const data = await response.json();
      const downloadUrl = data.url;

      if (!downloadUrl) {
        throw new Error('No audio URL found for this video.');
      }

      // Step 2: Download the final audio blob (passing through proxy to ensure CORS bypass)
      const audioProxyUrl = `/api/proxy/piped?url=${encodeURIComponent(downloadUrl)}`;
      const audioRes = await fetch(audioProxyUrl);
      if (!audioRes.ok) throw new Error('CORS bypass proxy failed to fetch audio file.');

      const blob = await audioRes.blob();
      
      await db.offlineSongs.put({
        id: song.id,
        song: song as LocalSong,
        audioBlob: blob,
        downloadedAt: Date.now()
      });

      // Step 3: Fetch and save lyrics for offline use
      try {
        const lyricsRes = await fetch(`/api/youtube/lyrics?videoId=${song.id}`);
        if (lyricsRes.ok) {
          const lyricsData = await lyricsRes.ok ? await lyricsRes.json() : null;
          if (lyricsData) {
            await LibraryService.saveLyrics(song.id, lyricsData);
          }
        }
      } catch (e) {
        console.warn('Failed to fetch lyrics for offline use, skipping.', e);
      }

    } catch (error: any) {
      console.error('Download error:', error.message);
      throw error;
    }
  },

  async removeDownload(songId: string): Promise<void> {
    await db.offlineSongs.delete(songId);
  },

  async getAllDownloaded(): Promise<OfflineSong[]> {
    return await db.offlineSongs.toArray();
  }
};
