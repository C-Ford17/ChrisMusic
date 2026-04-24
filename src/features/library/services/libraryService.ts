import JSZip from 'jszip';
import { db, type LocalSong } from '@/core/db/db';
import { Song } from '@/core/types/music';
import { type LyricsData } from '@/features/lyrics/services/lrclibService';

// Converts our global Song type nicely to LocalSong for Dexie
function mapToLocalSong(song: Song): LocalSong {
  return {
    id: song.id,
    title: song.title,
    artistName: song.artistName,
    thumbnailUrl: song.thumbnailUrl,
    sourceType: song.sourceType,
    duration: song.duration
  };
}

export const LibraryService = {
  // Favorites
  async toggleFavorite(song: Song): Promise<boolean> {
    const exists = await db.favorites.get(song.id);
    if (exists) {
      await db.favorites.delete(song.id);
      return false; // Now false
    } else {
      await db.favorites.add({
        id: song.id,
        song: mapToLocalSong(song),
        addedAt: Date.now()
      });
      return true; // Now true
    }
  },

  async isFavorite(songId: string): Promise<boolean> {
    const count = await db.favorites.where('id').equals(songId).count();
    return count > 0;
  },

  async removeFavorite(songId: string): Promise<void> {
    await db.favorites.delete(songId);
  },

  async updateFavoritesOrder(songIds: string[]): Promise<void> {
    await db.transaction('rw', db.favorites, async () => {
      for (let i = 0; i < songIds.length; i++) {
        await db.favorites.update(songIds[i], { orderIndex: i });
      }
    });
  },

  // History (Saves play to IndexedDB)
  async recordPlay(song: Song): Promise<void> {
    try {
      // Remove any previous history entries for this exact song to prevent duplicates
      // and effectively "bump" it to the top.
      const existingEntries = await db.history.filter(h => h.song.id === song.id).toArray();
      if (existingEntries.length > 0) {
        const idsToDelete = existingEntries.map(e => e.id).filter((id): id is number => id !== undefined);
        if (idsToDelete.length > 0) {
          await db.history.bulkDelete(idsToDelete);
        }
      }

      await db.history.add({
        song: mapToLocalSong(song),
        playedAt: Date.now()
      });
      
      const historyCount = await db.history.count();
      if (historyCount > 100) {
        const itemsToDelete = await db.history.orderBy('playedAt').limit(historyCount - 100).toArray();
        if(itemsToDelete.length > 0) {
          await db.history.bulkDelete(itemsToDelete.map(x => x.id!).filter(id => id !== undefined));
        }
      }
    } catch (e) {
      console.error("Failed to record play history", e);
    }
  },

  // Playlists
  async createPlaylist(name: string): Promise<string> {
    // Generate simple ID if crypto.randomUUID is not available
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString();
    await db.playlists.add({
      id,
      name,
      createdAt: Date.now()
    });
    return id;
  },

  async addSongToPlaylist(playlistId: string, song: Song): Promise<void> {
    const entries = await db.playlistEntries.where('playlistId').equals(playlistId).toArray();
    const nextIndex = entries.length > 0 ? Math.max(...entries.map(e => e.orderIndex ?? 0)) + 1 : 0;

    await db.playlistEntries.add({
      playlistId,
      song: mapToLocalSong(song),
      addedAt: Date.now(),
      orderIndex: nextIndex
    });
  },

  async updatePlaylistOrder(playlistId: string, entryIds: number[]): Promise<void> {
    await db.transaction('rw', db.playlistEntries, async () => {
      for (let i = 0; i < entryIds.length; i++) {
        await db.playlistEntries.update(entryIds[i], { orderIndex: i });
      }
    });
  },

  async removeSongFromPlaylist(entryId: number): Promise<void> {
    await db.playlistEntries.delete(entryId);
  },

  async deletePlaylist(playlistId: string): Promise<void> {
    await db.playlists.delete(playlistId);
    // Also delete all entries
    const entries = await db.playlistEntries.where('playlistId').equals(playlistId).toArray();
    await db.playlistEntries.bulkDelete(entries.map(e => e.id as number));
  },

  // Export / Import
  async exportData(): Promise<Blob> {
    const playlists = await db.playlists.toArray();
    const favorites = await db.favorites.toArray();
    const history = await db.history.toArray();
    const playlistEntries = await db.playlistEntries.toArray();
    const lyrics = await db.lyrics.toArray();
    const searchHistory = await db.searchHistory.toArray();

    const data = {
      version: 2, // Upgraded version for ZIP format
      timestamp: Date.now(),
      playlists,
      favorites,
      history,
      playlistEntries,
      lyrics,
      searchHistory
    };

    const zip = new JSZip();
    zip.file("db.json", JSON.stringify(data));
    
    return await zip.generateAsync({ type: "blob" });
  },

  async importData(fileData: Blob | ArrayBuffer): Promise<void> {
    const zip = new JSZip();
    const contents = await zip.loadAsync(fileData);
    const dbFile = contents.file("db.json");
    
    if (!dbFile) {
      throw new Error("Archivo de base de datos no encontrado en el ZIP");
    }

    const json = await dbFile.async("string");
    const data = JSON.parse(json);
    
    // Simple validation
    if (!data.playlists || !data.favorites) {
      throw new Error("Formato de datos no válido");
    }

    // Use a transaction for safety
    await db.transaction('rw', [db.playlists, db.favorites, db.history, db.playlistEntries, db.lyrics, db.searchHistory], async () => {
      // Merge strategy: Put for uniquely identified items, Add for others
      for (const p of data.playlists) {
         await db.playlists.put(p);
      }
      for (const f of data.favorites) {
         await db.favorites.put(f);
      }
      for (const h of data.history) {
         if (h.id) delete h.id; 
         await db.history.add(h);
      }
      for (const e of data.playlistEntries) {
         if (e.id) delete e.id; 
         await db.playlistEntries.add(e);
      }
      if (data.lyrics) {
        for (const l of data.lyrics) {
          await db.lyrics.put(l);
        }
      }
      if (data.searchHistory) {
        for (const s of data.searchHistory) {
          await db.searchHistory.put(s);
        }
      }
    });
  },

  async clearAllData(): Promise<void> {
    await db.transaction('rw', [
      db.favorites, 
      db.history, 
      db.playlists, 
      db.playlistEntries, 
      db.lyrics, 
      db.searchHistory,
      db.offlineSongs,
      db.cachedSongs
    ], async () => {
      await Promise.all([
        db.favorites.clear(),
        db.history.clear(),
        db.playlists.clear(),
        db.playlistEntries.clear(),
        db.lyrics.clear(),
        db.searchHistory.clear(),
        db.offlineSongs.clear(),
        db.cachedSongs.clear()
      ]);
    });
  },

  // Lyrics Management
  async saveLyrics(songId: string, data: LyricsData): Promise<void> {
    await db.lyrics.put({
      id: songId,
      data,
      updatedAt: Date.now()
    });
  },

  async getLyrics(songId: string): Promise<LyricsData | null> {
    const record = await db.lyrics.get(songId) as { data: LyricsData } | undefined;
    return record ? record.data : null;
  },

  // Search History
  async recordSearch(query: string): Promise<void> {
    if (!query.trim()) return;
    await db.searchHistory.put({
      query: query.trim(),
      timestamp: Date.now()
    });
    
    // Limit to 20 last searches
    const count = await db.searchHistory.count();
    if (count > 20) {
      const oldest = await db.searchHistory.orderBy('timestamp').limit(count - 20).toArray();
      await db.searchHistory.bulkDelete(oldest.map(s => s.query));
    }
  },

  async getSearchHistory(): Promise<string[]> {
    const history = await db.searchHistory.orderBy('timestamp').reverse().toArray();
    return history.map(h => h.query);
  },

  async clearSearchHistory(): Promise<void> {
    await db.searchHistory.clear();
  }
};
