import { db, type LocalSong } from '@/core/db/db';
import { Song } from '@/core/types/music';

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
    await db.playlistEntries.add({
      playlistId,
      song: mapToLocalSong(song),
      addedAt: Date.now()
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
  async exportData(): Promise<string> {
    const playlists = await db.playlists.toArray();
    const favorites = await db.favorites.toArray();
    const history = await db.history.toArray();
    const playlistEntries = await db.playlistEntries.toArray();
    const lyrics = await db.lyrics.toArray();
    const searchHistory = await db.searchHistory.toArray();

    const data = {
      version: 1,
      timestamp: Date.now(),
      playlists,
      favorites,
      history,
      playlistEntries,
      lyrics,
      searchHistory
    };

    return JSON.stringify(data);
  },

  async importData(json: string): Promise<void> {
    const data = JSON.parse(json);
    
    // Simple validation
    if (!data.playlists || !data.favorites) {
      throw new Error("Invalid format");
    }

    // Use a transaction for safety
    await db.transaction('rw', [db.playlists, db.favorites, db.history, db.playlistEntries, db.lyrics], async () => {
      // We merge or replace? Let's replace for simplicity in this sprint 
      // or append? Let's append if ID doesn't exist.
      for (const p of data.playlists) {
         await db.playlists.put(p);
      }
      for (const f of data.favorites) {
         await db.favorites.put(f);
      }
      for (const h of data.history) {
         // History might not have unique IDs if they were auto-generated but let's try
         if (h.id) delete h.id; // Let Dexie generate new IDs for history to avoid conflict
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

  async clearHistory(): Promise<void> {
    await db.history.clear();
  },

  // Lyrics Management
  async saveLyrics(songId: string, data: any): Promise<void> {
    await db.lyrics.put({
      id: songId,
      data,
      updatedAt: Date.now()
    });
  },

  async getLyrics(songId: string): Promise<any | null> {
    const record = await db.lyrics.get(songId);
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
