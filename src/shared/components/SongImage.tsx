'use client';

import React from 'react';
import Image, { ImageProps } from 'next/image';
import { useLiveQuery } from 'dexie-react-hooks';
import { offlineService } from '@/features/library/services/offlineService';
import { YouTubeExtractionService } from '@/features/player/services/youtubeExtractionService';

interface SongImageProps extends Omit<ImageProps, 'src'> {
  songId: string;
  fallbackUrl?: string;
  preferHighRes?: boolean;
}

/**
 * A smart Image component that automatically resolves to a local/offline thumbnail
 * if the song is downloaded or cached.
 */
export function SongImage({ songId, fallbackUrl, preferHighRes = false, ...props }: SongImageProps) {
  const [error, setError] = React.useState(false);

  // Check if we have an offline version of the image
  const offlineThumbnail = useLiveQuery(
    () => offlineService.getOfflineThumbnail(songId, preferHighRes),
    [songId, preferHighRes]
  );

  // If high-res was requested but not found offline, we might want to fallback to standard offline before YouTube
  const standardOffline = useLiveQuery(
    () => preferHighRes ? offlineService.getOfflineThumbnail(songId, false) : Promise.resolve(null),
    [songId, preferHighRes]
  );

  const resolvedThumbnail = offlineThumbnail || standardOffline;

  // Use the offline thumbnail if found, otherwise use the fallback (usually YouTube URL)
  let finalSrc = YouTubeExtractionService.normalizeUrl(resolvedThumbnail || fallbackUrl, songId);

  // If we had an error or it's a known small placeholder, try standard YouTube resolution
  if (error && !resolvedThumbnail && fallbackUrl) {
    finalSrc = YouTubeExtractionService.getFallbackThumbnail(songId, fallbackUrl);
  }

  return (
    <Image 
      key={`${songId}-${preferHighRes}-${error}`}
      src={finalSrc} 
      {...props}
      onLoad={(e) => {
        const img = e.target as HTMLImageElement;
        // YouTube returns a 120x90 placeholder if maxres doesn't exist.
        // If we requested high-res and got a tiny image from YouTube, it's a placeholder.
        if (!resolvedThumbnail && preferHighRes && img.naturalWidth > 0 && img.naturalWidth < 400) {
          setError(true);
        }
      }}
      onError={() => setError(true)}
    />
  );
}
