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
  filePath?: string; // Optional for Native (Capacitor)
  thumbnailBlob?: Blob; // Image for offline display
  thumbnailFilePath?: string; // Image for native notification
  downloadedAt: number;
}

export interface CachedSong {
  id: string; // YouTube Video ID
  song: LocalSong;
  audioBlob?: Blob; // Added for Web/Capacitor
  filePath?: string; // Optional for Native (Capacitor)
  thumbnailBlob?: Blob;
  thumbnailFilePath?: string;
  cachedAt: number;
}

export interface FollowedArtist {
  id: string; // Artist ID
  name: string;
  thumbnailUrl: string;
  followedAt: number;
}

export interface SavedAlbum {
  id: string; // Album ID
  title: string;
  artistName: string;
  thumbnailUrl: string;
  savedAt: number;
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
  followedArtists!: EntityTable<FollowedArtist, 'id'>;
  savedAlbums!: EntityTable<SavedAlbum, 'id'>;

  constructor() {
    super('ChrisMusicDB');
    
    // Version 1 
    this.version(1).stores({
      favorites: 'id, addedAt',
      history: '++id, playedAt',
      playlists: 'id, createdAt',
      playlistEntries: '++id, playlistId, addedAt'
    });

    // Version 2-6 were incremental but incomplete (Dexie requires full schema in each version)
    // Consolidating everything in Version 7
    // Version 8: Added thumbnail storage
    // Version 9: Added FollowedArtists and SavedAlbums
    this.version(9).stores({
      favorites: 'id, addedAt',
      history: '++id, playedAt',
      playlists: 'id, createdAt',
      playlistEntries: '++id, playlistId, addedAt',
      lyrics: 'id, updatedAt',
      searchHistory: 'query, timestamp',
      offlineSongs: 'id, downloadedAt',
      cachedSongs: 'id, cachedAt',
      followedArtists: 'id, followedAt',
      savedAlbums: 'id, savedAt'
    });
  }

}

// Export a singleton instance of the database
export const db = new ChrisMusicDB();
