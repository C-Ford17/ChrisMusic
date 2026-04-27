export interface Song {
  id: string;
  title: string;
  artistName: string;
  thumbnailUrl: string;
  thumbnailHighResUrl?: string;
  sourceType: string;
  duration?: number;
  durationText?: string;
  isExplicit?: boolean;
  viewCountText?: string;
  viewCount?: number;
  rawInfo?: string;
  albumId?: string;
  artistId?: string;
  resultType?: string;
}

export interface Artist {
  id: string;
  name: string;
  thumbnailUrl: string;
  subscribers?: string;
  description?: string;
  topSongs?: Song[];
  albums?: Album[];
  resultType?: string;
}

export interface Album {
  id: string;
  title: string;
  artistName: string;
  artistId?: string;
  thumbnailUrl: string;
  releaseYear?: string;
  trackCount?: number;
  duration?: string;
  songs?: Song[];
  resultType?: string;
}

export type SearchResult = Song | Artist | Album;
