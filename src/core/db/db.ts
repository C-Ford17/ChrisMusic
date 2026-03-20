import Dexie, { type EntityTable } from 'dexie';

// Define the shape of our Song objects in the local database
export interface LocalSong {
  id: string; // YouTube Video ID
  title: string;
  artistName: string;
  thumbnailUrl: string;
  sourceType: string;
  duration?: number;
}

export interface Favorite {
  id: string; // Same as YouTube Video ID
  song: LocalSong;
  addedAt: number;
}

export interface PlayHistory {
  id?: number; // Auto-incremented ID for indexedDB
  song: LocalSong;
  playedAt: number;
}

export interface UserPlaylist {
  id: string; // UUID representation
  name: string;
  createdAt: number;
}

export interface PlaylistEntry {
  id?: number; // Auto-incremented
  playlistId: string; // ID referencing UserPlaylist
  song: LocalSong;
  addedAt: number;
}

export interface LyricsRecord {
  id: string; // YouTube Video ID
  data: unknown; // The full LyricsData from the API
  updatedAt: number;
}

export interface SearchHistory {
  query: string; // The search term
  timestamp: number;
}

export interface OfflineSong {
  id: string; // YouTube Video ID
  song: LocalSong;
  audioBlob?: Blob; // Optional for Web (PWA)
  filePath?: string; // Optional for Native (Tauri)
  downloadedAt: number;
}

export interface CachedSong {
  id: string; // YouTube Video ID
  song: LocalSong;
  audioBlob?: Blob; // Added for Web/Capacitor
  filePath?: string; // Optional for Native (Tauri)
  cachedAt: number;
}

export class ChrisMusicDB extends Dexie {
  favorites!: EntityTable<Favorite, 'id'>;
  history!: EntityTable<PlayHistory, 'id'>;
  playlists!: EntityTable<UserPlaylist, 'id'>;
  playlistEntries!: EntityTable<PlaylistEntry, 'id'>;
  lyrics!: EntityTable<LyricsRecord, 'id'>;
  searchHistory!: EntityTable<SearchHistory, 'query'>;
  offlineSongs!: EntityTable<OfflineSong, 'id'>;
  cachedSongs!: EntityTable<CachedSong, 'id'>;

  constructor() {
    super('ChrisMusicDB');
    
    // Version 1 
    this.version(1).stores({
      favorites: 'id, addedAt',
      history: '++id, playedAt',
      playlists: 'id, createdAt',
      playlistEntries: '++id, playlistId, addedAt'
    });

    // Version 2: Added lyrics storage
    this.version(2).stores({
      lyrics: 'id, updatedAt'
    });

    // Version 3: Added search history
    this.version(3).stores({
      searchHistory: 'query, timestamp'
    });

    // Version 4: Offline songs
    this.version(4).stores({
      offlineSongs: 'id, downloadedAt'
    });

    // Version 5: Added filePath for native storage
    this.version(5).stores({
      offlineSongs: 'id, downloadedAt'
    });

    // Version 6: Cached songs
    this.version(6).stores({
      cachedSongs: 'id, cachedAt'
    });
  }
}

// Export a singleton instance of the database
export const db = new ChrisMusicDB();
