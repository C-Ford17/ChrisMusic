'use client';

export interface LyricsData {
  id: number;
  name: string;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number;
  instrumental: boolean;
  plainLyrics: string;
  syncedLyrics: string;
}

export interface LyricsLine {
  time: number; // seconds
  text: string;
}

export const lyricsService = {
  /**
   * Cleans artist and title from YouTube noise like (Official Video), [Slowed], etc.
   */
  cleanMetadata(text: string): string {
    return text
      .replace(/\s*[\(\[][^)]*video[^)]*[\)\]]/gi, '') // (Official Video), [Official Video]
      .replace(/\s*[\(\[][^)]*audio[^)]*[\)\]]/gi, '') // (Official Audio)
      .replace(/\s*[\(\[][^)]*lyrics?[^)]*[\)\]]/gi, '') // (Lyrics), [Lyric Video]
      .replace(/\s*[\(\[][^)]*slowed[^)]*[\)\]]/gi, '') // (Slowed), [Slowed + Reverb]
      .replace(/\s*[\(\[][^)]*reverb[^)]*[\)\]]/gi, '')
      .replace(/\s*[\(\[][^)]*edit[^)]*[\)\]]/gi, '')
      .replace(/\s*[\(\[][^)]*remix[^)]*[\)\]]/gi, '')
      .replace(/\s*[\(\[][^)]*hd[^)]*[\)\]]/gi, '')
      .replace(/\s*[\(\[][^)]*4k[^)]*[\)\]]/gi, '')
      .replace(/\s*[\(\[][^)]*1080p[^)]*[\)\]]/gi, '')
      .replace(/- topic/gi, '') // Many YouTube artists have "- Topic"
      .replace(/\|.*/g, '') // Remove everything after |
      .trim();
  },

  /**
   * Search for lyrics on LRCLib with fallback strategies
   */
  async getLyrics(artist: string, title: string, duration?: number): Promise<LyricsData | null> {
    try {
      const cleanArtist = this.cleanMetadata(artist);
      let cleanTitle = this.cleanMetadata(title);

      // Remove artist from title if present (e.g. "Farruko - Pepas" -> "Pepas")
      const artistPrefix = new RegExp(`^${cleanArtist}\\s*-\\s*`, 'i');
      cleanTitle = cleanTitle.replace(artistPrefix, '').trim();

      // Strategy 1: Exact match with duration
      let url = new URL('https://lrclib.net/api/get');
      url.searchParams.append('artist_name', cleanArtist);
      url.searchParams.append('track_name', cleanTitle);
      if (duration) url.searchParams.append('duration', Math.round(duration).toString());

      let response = await fetch(url.toString());
      if (response.ok) return await response.json();

      // Strategy 2: Exact match without duration (more flexible)
      url = new URL('https://lrclib.net/api/get');
      url.searchParams.append('artist_name', cleanArtist);
      url.searchParams.append('track_name', cleanTitle);
      
      response = await fetch(url.toString());
      if (response.ok) return await response.json();

      // Strategy 3: Global Search (last resort)
      const searchUrl = new URL('https://lrclib.net/api/search');
      searchUrl.searchParams.append('q', `${cleanArtist} ${cleanTitle}`);
      
      response = await fetch(searchUrl.toString());
      if (response.ok) {
        const results = await response.json();
        if (Array.isArray(results) && results.length > 0) {
          // Find the result that has synced lyrics if possible
          const bestMatch = results.find((r: LyricsData) => r.syncedLyrics) || results[0];
          return bestMatch;
        }
      }

      return null;
    } catch (error) {
      console.error('Error fetching lyrics:', error);
      return null;
    }
  },

  /**
   * Parse [mm:ss.xx] formatted lyrics into an array of objects
   */
  parseSyncedLyrics(lrc: string): LyricsLine[] {
    if (!lrc) return [];

    const lines = lrc.split('\n');
    const parsedLines: LyricsLine[] = [];

    // Robust Regex: [mm:ss.xx] or [m:ss.xx] or [mm:ss] or [mm:ss:xx]
    // Group 1: Minutes, Group 2: Seconds, Group 3: Optional separator (. or :), Group 4: Optional fractional part, Group 5: Text
    const lrcRegex = /\[(\d{1,2}):(\d{2})(?:([.:])(\d{2,3}))?\](.*)/;

    lines.forEach(line => {
      const match = line.match(lrcRegex);
      if (match) {
        const minutes = parseInt(match[1]);
        const seconds = parseInt(match[2]);
        const separator = match[3];
        const fractional = match[4];
        const text = match[5].trim();

        let time = minutes * 60 + seconds;

        if (fractional) {
          const val = parseInt(fractional);
          if (separator === '.') {
            // .xx is centiseconds (1/100) or .xxx is milliseconds (1/1000)
            const divisor = fractional.length === 3 ? 1000 : 100;
            time += val / divisor;
          } else if (separator === ':') {
            // :xx is sometimes used for frames or centiseconds
            time += val / 100;
          }
        }

        // Only add if there is actual text or if it's an empty line used for timing
        // (Some LRCs use empty text lines to "clear" the previous lyric)
        parsedLines.push({ time, text });
      }
    });

    // Sort by time just in case the LRC is out of order
    return parsedLines.sort((a, b) => a.time - b.time);
  }
};
