import { Capacitor, registerPlugin } from '@capacitor/core';
import { type Song, type Artist, type Album, type SearchResult as MusicSearchResult } from '@/core/types/music';

interface YouTubeNativePlugin {
  init(): Promise<{ status: string; ffmpeg: string; ffmpegPath: string }>;
  getStreamUrl(options: { videoId: string }): Promise<{ url: string }>;
  search(options: { query: string; count?: number }): Promise<{ results: any[] }>;
  downloadToAdts(options: { videoId: string }): Promise<{ base64: string; format: string }>;
  updateYoutubeDL(): Promise<void>;
  getDiagnostics(): Promise<any>;
  forceReextraction(): Promise<void>;
}

export const YouTubeNative = registerPlugin<YouTubeNativePlugin>('YouTubeNative');

// ─── ExoPlayer Plugin ─────────────────────────────────────────────────────
import type { PluginListenerHandle } from '@capacitor/core';

export interface ExoStateChangeEvent {
  state: 'loading' | 'playing' | 'paused' | 'ended' | 'error';
  error?: string;
  errorCode?: number;
}

export interface ExoProgressEvent {
  current: number;   // seconds
  duration: number;  // seconds
}

interface ExoPlayerPlugin {
  load(options: { url: string; title: string; artist: string; artwork?: string; id?: string }): Promise<void>;
  addNextItem(options: { url: string; title: string; artist: string; artwork?: string; id: string }): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(options: { seconds: number }): Promise<void>;
  stop(): Promise<void>;
  setVolume(options: { volume: number }): Promise<void>;
  setRepeatMode(options: { mode: 'off' | 'one' | 'all' }): Promise<void>;
  setShuffleMode(options: { enabled: boolean }): Promise<void>;
  getRepeatMode(): Promise<{ mode: string }>;
  getPlaybackState(): Promise<{ 
    state: string; 
    isPlaying: boolean; 
    currentPosition: number; 
    duration: number; 
    mediaId?: string;
    url?: string;
    title?: string;
  }>;
  addListener(
    eventName: 'onStateChange',
    listenerFunc: (data: ExoStateChangeEvent) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'onProgress',
    listenerFunc: (data: ExoProgressEvent) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'onNativeNext',
    listenerFunc: () => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'onNativePrevious',
    listenerFunc: () => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'onNativeTrackChange',
    listenerFunc: (data: { id: string }) => void
  ): Promise<PluginListenerHandle>;
}

export const ExoPlayerNative = registerPlugin<ExoPlayerPlugin>('ExoPlayer');

export class YouTubeExtractionService {
  private static instance: YouTubeExtractionService;
  private yt: any = null;
  private isInitialized = false;

  private initPromise: Promise<void> | null = null;

  private constructor() {}

  public static getInstance(): YouTubeExtractionService {
    if (!YouTubeExtractionService.instance) {
      YouTubeExtractionService.instance = new YouTubeExtractionService();
    }
    return YouTubeExtractionService.instance;
  }

  /**
   * Returns native environment diagnostics.
   */
  async getDiagnostics() {
    if (!YouTubeExtractionService.isAndroid()) return { error: 'Diagnostics only available on Android' };
    return await YouTubeNative.getDiagnostics();
  }

  /**
   * Forces a re-extraction of native binaries.
   */
  async forceReextraction() {
    if (!YouTubeExtractionService.isAndroid()) return;
    await YouTubeNative.forceReextraction();
    this.isInitialized = false;
    this.initPromise = null;
    return await this.ensureInitialized();
  }

  public static isAndroid(): boolean {
    if (typeof window === 'undefined') return false;
    // Check for Capacitor Global
    return (window as any).Capacitor?.getPlatform() === 'android';
  }

  public static isTauri(): boolean {
    const isT = typeof window !== 'undefined' && (
      (window as any).__TAURI_INTERNALS__ !== undefined || 
      (window as any).__TAURI__ !== undefined ||
      (window as any).rpc !== undefined ||
      !!(window as any).__TAURI_METADATA__
    );
    return isT;
  }

  public static getEnv(): string {
    if (this.isAndroid()) return 'ANDROID';
    if (this.isTauri()) return 'TAURI/DESKTOP';
    return 'WEB/PROXY';
  }

  /**
   * Normalizes a URL for the current platform.
   * On Android, converts file:// URIs to local-server URIs that the WebView can access.
   * On Desktop, if it detects an Android local path, it fallbacks to the YouTube URL using the songId.
   */
  static normalizeUrl(url?: string, songId?: string): string {
    if (!url) return songId ? `https://i.ytimg.com/vi/${songId}/mqdefault.jpg` : '';
    
    const isAndroidPath = url.includes('_capacitor_file_') || url.startsWith('capacitor:') || url.startsWith('http://localhost');
    const isDesktopPath = url.startsWith('asset:') || url.startsWith('http://asset.localhost');
    const isBlob = url.startsWith('blob:');

    // Case 1: On Android, fixing Desktop paths
    if (this.isAndroid()) {
      if (url.startsWith('file://')) {
        try { return Capacitor.convertFileSrc(url); } catch { return url; }
      }
      // If we see a desktop-only path on Android, we fallback to YouTube
      if (isDesktopPath && songId) {
        return `https://i.ytimg.com/vi/${songId}/mqdefault.jpg`;
      }
      return url;
    }

    // Case 2: On Desktop (Tauri), fixing Android paths
    if (this.isTauri()) {
      // If we see an android-only path on PC, we fallback to YouTube
      if ((isAndroidPath || url.startsWith('file://')) && songId) {
        return `https://i.ytimg.com/vi/${songId}/mqdefault.jpg`;
      }
      return url;
    }

    return url;
  }

  /**
   * Instance method for normalizeUrl (calls static version) 
   */
  normalizeUrl(url?: string): string {
    return YouTubeExtractionService.normalizeUrl(url);
  }

  /**
   * Returns the highest resolution thumbnail possible for a YouTube video.
   */
  public static getHighResThumbnail(songId?: string, fallbackUrl?: string): string {
    // If we have a local/blob URL, keep it as is
    if (fallbackUrl && (
      fallbackUrl.includes('_capacitor_file_') || 
      fallbackUrl.startsWith('http://localhost') || 
      fallbackUrl.startsWith('https://localhost') || 
      fallbackUrl.startsWith('blob:') || 
      fallbackUrl.startsWith('file:') || 
      fallbackUrl.startsWith('capacitor:')
    )) {
      return fallbackUrl;
    }
    if (!songId) return fallbackUrl || '';
    // Use maxresdefault for the player to ensure maximum resolution (1280x720)
    return `https://i.ytimg.com/vi/${songId}/maxresdefault.jpg`;
  }

  public static getFallbackThumbnail(songId?: string, fallbackUrl?: string): string {
    // If we already have a specialized local/blob URL, don't override it
    if (fallbackUrl && (fallbackUrl.includes('_capacitor_file_') || fallbackUrl.startsWith('http://localhost') || fallbackUrl.startsWith('https://localhost') || fallbackUrl.startsWith('blob:') || fallbackUrl.startsWith('file:') || fallbackUrl.startsWith('capacitor:'))) {
      return fallbackUrl;
    }

    // For lists/mini-player, use square YT Music art upscaled to 544x544 if available
    if (fallbackUrl && (fallbackUrl.includes('googleusercontent.com') || fallbackUrl.includes('ggpht.com'))) {
      return fallbackUrl.replace(/-w\d+-h\d+/, '-w544-h544').replace(/=w\d+-h\d+/, '=w544-h544');
    }

    if (!songId) return fallbackUrl || '';

    // If it's already a square thumbnail from search, keep it to avoid borders
    if (fallbackUrl && !fallbackUrl.includes('ytimg.com/vi/')) {
      return fallbackUrl;
    }

    return `https://i.ytimg.com/vi/${songId}/hqdefault.jpg`;
  }

  public static isCapacitor(): boolean {
    return Capacitor.isNativePlatform();
  }

  /**
   * Ensuring the engine is initialized before any call.
   */
  async ensureInitialized() {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;
    
    this.initPromise = this.init();
    return this.initPromise;
  }

  /**
   * Initializes the extraction engine.
   * On Android, it initializes the native yt-dlp binary.
   */
  private async init() {
    if (YouTubeExtractionService.isAndroid()) {
      try {
        console.log('[YouTubeExtractionService] Initializing Native Engine (yt-dlp + FFmpeg)...');
        const res = await YouTubeNative.init();
        this.isInitialized = true;
        console.log('[YouTubeExtractionService] Native engine READY. FFmpeg state:', res.ffmpeg);
      } catch (e) {
        console.error('[YouTubeExtractionService] Native init failed:', e);
        this.initPromise = null;
        throw e;
      }
    } else {
      // Legacy JS/Tauri initialization
      try {
        // For Tauri, we skip Innertube frontend init because we rely on Rust backend
        if (YouTubeExtractionService.isTauri()) {
          console.log('[YouTubeExtractionService] Tauri detected - using native commands for extraction');
          this.isInitialized = true;
          return;
        }

        const { Innertube } = await import('youtubei.js');
        this.isInitialized = true;
        this.yt = await Innertube.create();
      } catch (e) {
        console.error('[YouTubeExtractionService] JS init failed:', e);
        this.initPromise = null;
      }
    }
  }

  /**
   * Native ADTS Transcoding (Android only)
   */
  async downloadToAdts(videoId: string): Promise<{ base64: string; format: string }> {
    await this.ensureInitialized();
    if (!YouTubeExtractionService.isAndroid()) {
      throw new Error('Native ADTS transcoding is only available on Android');
    }
    return await YouTubeNative.downloadToAdts({ videoId });
  }

  /**
   * Updates PO Token and Visitor Data for extraction.
   * Stored in localStorage for persistent use.
   */
  async updateTokens(poToken: string, visitorData: string) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('yt_po_token', poToken);
      localStorage.setItem('yt_visitor_data', visitorData);
      console.log('[YouTubeExtractionService] Tokens updated');
    }
  }

  async search(query: string, count: number = 15): Promise<Song[]> {
    await this.ensureInitialized();
    try {
      const { results } = await this.searchWithType(query, 'song', count);
      return results.map(r => ({
        id: r.id,
        title: (r as any).title || (r as any).name || '',
        artistName: (r as any).artistName || '',
        thumbnailUrl: r.thumbnailUrl,
        duration: 0,
        sourceType: 'youtube'
      }));
    } catch (err) {
      console.error('[YouTubeExtractionService] SearchWithType failed, using fallback:', err);
      if (this.yt) {
        const results = await this.yt.search(query);
        return results.videos.map((v: any) => ({
          id: v.id,
          title: v.title.text,
          artistName: v.author.name,
          thumbnailUrl: v.thumbnails[0].url,
          duration: v.duration.seconds,
          sourceType: 'youtube'
        }));
      }
      return [];
    }
  }

  /**
   * Fetches search suggestions for a given query from YouTube.
   */
  async getSuggestions(query: string): Promise<string[]> {
    if (!query || query.trim().length < 2) return [];

    try {
      let response;
      const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`;
      
      if (YouTubeExtractionService.isTauri()) {
        // Use Tauri HTTP plugin to bypass CORS
        const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
        response = await tauriFetch(url);
      } else {
        // Standard browser fetch
        response = await fetch(url);
      }
      
      if (!response.ok) return [];
      
      const data = await response.json();
      if (Array.isArray(data) && data[1] && Array.isArray(data[1])) {
        return data[1];
      }
    } catch (error) {
      console.error('[YouTubeExtractionService] Error fetching suggestions:', error);
    }
    
    return [];
  }

  async getStreamUrl(videoId: string): Promise<string> {
    await this.ensureInitialized();
    const isNative = YouTubeExtractionService.isAndroid() || YouTubeExtractionService.isTauri();

    console.log(`[YouTubeExtractionService] Fetching stream for ${videoId}. Env: ${YouTubeExtractionService.getEnv()}`);

    // Strategy 1: Native yt-dlp (Android)
    if (YouTubeExtractionService.isAndroid()) {
      try {
        const result = await YouTubeNative.getStreamUrl({ videoId });
        if (result.url) return result.url;
      } catch (e) {
        console.error('[YouTubeExtractionService] Android native extraction failed:', e);
      }
    }

    // Strategy 2: Tauri (Native Rust)
    if (YouTubeExtractionService.isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const url = await invoke('get_streaming_url', { videoId });
        if (url) return url as string;
      } catch (e) {
        console.error('[YouTubeExtractionService] Tauri native extraction failed:', e);
      }
    }

    throw new Error(`Could not extract stream URL for ${videoId} in ${YouTubeExtractionService.getEnv()} environment.`);
  }

  async searchWithType(query: string, filter: 'song' | 'artist' | 'album' | 'playlist', count: number = 20, continuation?: string): Promise<{ results: MusicSearchResult[], continuation?: string }> {
    // ── Tauri (Desktop) ──────────────────────────────────────────────────────
    if (YouTubeExtractionService.isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const response: any = await invoke('search_youtube_native_cmd', { query, count, filter, continuation });
        return {
          results: response.results.map((item: any) => ({ ...item, sourceType: 'youtube' })),
          continuation: response.continuation
        };
      } catch (error) {
        console.error('Tauri SearchWithType Error:', error);
        return { results: [] };
      }
    }

    // ── Android / Web — InnerTube direct ─────────────────────────────────────
    try {
      const PARAMS: Record<string, string> = {
        song:     'EgWKAQIIAWoMEAMQDhAKEAkQBRAV',
        album:    'EgWKAQIYAWoMEAMQDhAKEAkQBRAV',
        artist:   'EgWKAQIgAWoMEAMQDhAKEAkQBRAV',
        playlist: 'EgWKAQIoAWoMEAMQDhAKEAkQBRAV',
      };
      const context = {
        client: { clientName: 'WEB_REMIX', clientVersion: '1.20241028.01.00', hl: 'es', gl: 'US' }
      };
      const body: any = continuation
        ? { continuation }
        : { query, params: PARAMS[filter] ?? '' };

      const data = await this.innerTubeRequest(continuation ? 'browse' : 'search', body);

      const results: MusicSearchResult[] = [];
      const seen = new Set<string>();
      let nextContinuation: string | undefined;

      // Resolve root node
      const root = data?.contents?.tabbedSearchResultsRenderer
        ? data.contents.tabbedSearchResultsRenderer.tabs?.[0]?.tabRenderer?.content
        : (data?.continuationContents ?? data);

      const queue: any[] = [root ?? data];

      while (queue.length > 0) {
        const cur = queue.pop();
        if (!cur || typeof cur !== 'object') continue;

        if (Array.isArray(cur)) { queue.push(...[...cur].reverse()); continue; }

        // Continuation token
        const contToken =
          cur?.nextContinuationData?.continuation ??
          cur?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token ??
          cur?.musicShelfRenderer?.continuations?.[0]?.nextContinuationData?.continuation;
        if (contToken) nextContinuation = contToken;

        // musicShelfRenderer → song list items
        if (cur.musicShelfRenderer) {
          queue.push(...[...(cur.musicShelfRenderer.contents ?? [])].reverse());
          continue;
        }

        // musicCardShelfRenderer → Top Result card
        if (cur.musicCardShelfRenderer) {
          queue.push(...[...(cur.musicCardShelfRenderer.contents ?? [])].reverse());
          continue;
        }

        // musicResponsiveListItemRenderer → songs / albums / artists / playlists (list view)
        if (cur.musicResponsiveListItemRenderer) {
          const r = cur.musicResponsiveListItemRenderer;
          const flexCols: any[] = r.flexColumns ?? [];
          const title = flexCols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text ?? '';
          const videoId = r.playlistItemData?.videoId
            ?? r.navigationEndpoint?.watchEndpoint?.videoId ?? '';
          const browseId = r.navigationEndpoint?.browseEndpoint?.browseId ?? '';

          let actualType = filter === 'playlist' ? 'playlist' : 'song';
          let artistName = '';
          for (const col of flexCols) {
            for (const run of col?.musicResponsiveListItemFlexColumnRenderer?.text?.runs ?? []) {
              const t = (run.text ?? '').trim().toLowerCase();
              if (t === 'álbum' || t === 'album') actualType = 'album';
              else if (t === 'artista' || t === 'artist') actualType = 'artist';
              else if (t === 'lista de reproducción' || t === 'playlist') actualType = 'playlist';
              const bId = run.navigationEndpoint?.browseEndpoint?.browseId ?? '';
              if ((bId.startsWith('UC') || bId.startsWith('FMr')) && !artistName) {
                artistName = run.text ?? '';
              }
            }
          }

          const thumb = r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url ?? '';
          const id = videoId || browseId;
          if (!id || seen.has(id)) continue;
          seen.add(id);

          results.push({
            id,
            title,
            artistName: artistName || title,
            thumbnailUrl: videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : thumb,
            sourceType: 'youtube',
            resultType: actualType,
          } as any);
          if (results.length >= count) break;
          continue;
        }

        // musicTwoRowItemRenderer → albums / artists / playlists (card view)
        if (cur.musicTwoRowItemRenderer) {
          const r = cur.musicTwoRowItemRenderer;
          const title = r.title?.runs?.[0]?.text ?? '';
          const browseId = r.navigationEndpoint?.browseEndpoint?.browseId ?? '';
          if (!browseId || seen.has(browseId)) continue;

          const isArtist = browseId.startsWith('UC') || browseId.startsWith('FMr');
          const isPlaylist = browseId.startsWith('VL') || browseId.startsWith('PL');
          const resType = isArtist ? 'artist' : isPlaylist ? 'playlist' : 'album';

          // Skip if doesn't match requested filter
          if (filter === 'album'    && resType !== 'album')    { seen.add(browseId); continue; }
          if (filter === 'artist'   && resType !== 'artist')   { seen.add(browseId); continue; }
          if (filter === 'playlist' && resType !== 'playlist') { seen.add(browseId); continue; }
          if (filter === 'song'     && (resType === 'album' || resType === 'artist')) { seen.add(browseId); continue; }

          const thumb = r.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails?.slice(-1)[0]?.url ?? '';
          let artistName = title;
          for (const run of r.subtitle?.runs ?? []) {
            const bId = run.navigationEndpoint?.browseEndpoint?.browseId ?? '';
            if (bId.startsWith('UC') || bId.startsWith('FMr')) { artistName = run.text ?? artistName; break; }
            if (isPlaylist && run.text && run.text.trim() !== '•' && artistName === title) {
              artistName = run.text.trim();
            }
          }

          seen.add(browseId);
          results.push({
            id: browseId,
            title,
            artistName,
            thumbnailUrl: thumb,
            sourceType: 'youtube',
            resultType: resType,
            name: isArtist ? title : undefined,
          } as any);
          if (results.length >= count) break;
          continue;
        }

        // musicTwoRowItemRenderer → alternative card view
        if (cur.musicTwoRowItemRenderer) {
          const r = cur.musicTwoRowItemRenderer;
          const title = r.title?.runs?.[0]?.text ?? '';
          const videoId = r.navigationEndpoint?.watchEndpoint?.videoId ?? '';
          const browseId = r.navigationEndpoint?.browseEndpoint?.browseId ?? '';
          const thumbArr: any[] = r.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails ?? r.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ?? [];
          const thumb = thumbArr[thumbArr.length - 1]?.url ?? '';
          const id = videoId || browseId;

          if (id && !results.some(x => x.id === id)) {
            let actualType = filter === 'playlist' ? 'playlist' : 'song';
            const subtitle = r.subtitle?.runs?.[0]?.text?.toLowerCase() ?? '';
            if (subtitle.includes('artista') || subtitle.includes('artist')) actualType = 'artist';
            else if (subtitle.includes('álbum') || subtitle.includes('album')) actualType = 'album';
            else if (subtitle.includes('lista') || subtitle.includes('playlist')) actualType = 'playlist';

            results.push({
              id,
              title,
              artistName: r.subtitle?.runs?.find((x: any) => x.navigationEndpoint?.browseEndpoint?.browseId?.startsWith('UC'))?.text ?? r.subtitle?.runs?.[2]?.text ?? '',
              thumbnailUrl: thumb,
              sourceType: 'youtube',
              resultType: actualType
            });
          }
          continue;
        }

        // Generic: recurse into object values
        queue.push(...Object.values(cur).filter(v => v && typeof v === 'object').reverse());
      }

      return { results, continuation: nextContinuation };
    } catch (err) {
      console.error('[searchWithType] InnerTube fallback error:', err);
      return { results: [] };
    }
  }


  async getArtistDetails(id: string): Promise<Artist | null> {
    if (YouTubeExtractionService.isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke('get_artist_details_cmd', { artistId: id });
      } catch (error) {
        console.error('getArtistDetails Error:', error);
      }
    }
    // Android / Web — InnerTube browse
    try {
      const data = await this.innerTubeRequest('browse', { browseId: id });

      // Header
      const header = data?.header?.musicImmersiveHeaderRenderer ?? data?.header?.musicVisualHeaderRenderer ?? null;
      const name: string = header?.title?.runs?.[0]?.text ?? '';
      const thumbs: any[] = header?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails
        ?? header?.foregroundThumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ?? [];
      const thumbnailUrl: string = thumbs[thumbs.length - 1]?.url ?? '';

      // Biography
      let biography: string | undefined;
      const descShelf = data?.sections?.find?.((s: any) => s?.musicDescriptionShelfRenderer)?.musicDescriptionShelfRenderer;
      if (descShelf?.description?.runs?.[0]?.text) biography = descShelf.description.runs[0].text;

      // Sections (topSongs, albums, singles, playlists)
      const topSongs: any[] = [];
      const albums: any[] = [];
      const singles: any[] = [];
      const playlists: any[] = [];

      const sections: any[] = data?.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents ?? [];
      for (const section of sections) {
        const shelf = section?.musicShelfRenderer ?? section?.musicCarouselShelfRenderer;
        if (!shelf) continue;
        const headerText = (shelf?.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs?.[0]?.text ?? '').toLowerCase();
        const isSongs = !!section?.musicShelfRenderer;
        const isAlbum = headerText.includes('álbum') || headerText.includes('album');
        const isSingle = headerText.includes('single') || headerText.includes('ep');
        const isPlaylist = headerText.includes('lista') || headerText.includes('playlist');

        for (const item of shelf?.contents ?? []) {
          const li = item?.musicTwoRowItemRenderer ?? item?.musicResponsiveListItemRenderer;
          if (!li) continue;
          const itemTitle = li?.title?.runs?.[0]?.text ?? li?.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text ?? '';
          const browseId = li?.navigationEndpoint?.browseEndpoint?.browseId ?? li?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchPlaylistEndpoint?.playlistId ?? '';
          const videoId = li?.navigationEndpoint?.watchEndpoint?.videoId ?? li?.overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint?.watchEndpoint?.videoId ?? '';
          const thumbArr: any[] = li?.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails ?? li?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ?? [];
          const itemThumb = thumbArr[thumbArr.length - 1]?.url ?? '';

          if (isSongs && videoId) {
            topSongs.push({ id: videoId, title: itemTitle, artistName: name, thumbnailUrl: itemThumb || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`, sourceType: 'youtube', resultType: 'song' });
          } else if (browseId) {
            const entry = { id: browseId, title: itemTitle, artistName: name, thumbnailUrl: itemThumb, sourceType: 'youtube', resultType: isPlaylist ? 'playlist' : isAlbum ? 'album' : isSingle ? 'album' : 'album' };
            if (isPlaylist) playlists.push(entry);
            else if (isSingle) singles.push(entry);
            else albums.push(entry);
          }
        }
      }

      if (!name) return null;
      return { id, name, thumbnailUrl, biography, topSongs, albums, singles, playlists } as any;
    } catch (e) {
      console.error('[getArtistDetails] InnerTube error:', e);
      return null;
    }
  }

  async getAlbumDetails(id: string): Promise<Album | null> {
    if (YouTubeExtractionService.isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke('get_album_details_cmd', { albumId: id });
      } catch (error) {
        console.error('getAlbumDetails Error:', error);
      }
    }
    // Android / Web — InnerTube browse
    try {
      const data = await this.innerTubeRequest('browse', { browseId: id });

      // Header
      const hdr = data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]
        ?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.musicResponsiveHeaderRenderer;
      const title: string = hdr?.title?.runs?.[0]?.text ?? data?.microformat?.microformatDataRenderer?.title?.split(' - ')?.[0] ?? 'Unknown';
      let artist = 'Unknown Artist';
      for (const run of hdr?.straplineTextOne?.runs ?? []) {
        if (run.text && run.text.trim() !== '•') { artist = run.text.trim(); break; }
      }
      if (artist === 'Unknown Artist') {
        artist = data?.microformat?.microformatDataRenderer?.pageOwnerDetails?.name ?? artist;
      }
      const thumbArr: any[] = hdr?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails
        ?? data?.background?.musicThumbnailRenderer?.thumbnail?.thumbnails ?? [];
      const thumbnailUrl: string = thumbArr[thumbArr.length - 1]?.url ?? '';

      // Songs — traverse secondaryContents
      const songs: any[] = [];
      const sec = data?.contents?.twoColumnBrowseResultsRenderer?.secondaryContents;
      const queue: any[] = [sec];
      while (queue.length > 0) {
        const cur = queue.pop();
        if (!cur || typeof cur !== 'object') continue;
        if (Array.isArray(cur)) { queue.push(...[...cur].reverse()); continue; }
        if (cur.musicResponsiveListItemRenderer) {
          const r = cur.musicResponsiveListItemRenderer;
          const sTitle = r.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text ?? '';
          const videoId = r.playlistItemData?.videoId ?? '';
          if (videoId && sTitle) {
            let dText: string | undefined;
            for (const col of r.fixedColumns ?? []) {
              for (const run of col?.musicResponsiveListItemFixedColumnRenderer?.text?.runs ?? []) {
                if (run.text?.includes(':') && /^[\d:]+$/.test(run.text)) { dText = run.text; break; }
              }
            }
            songs.push({ id: videoId, title: sTitle, artistName: artist, thumbnailUrl: thumbnailUrl || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`, sourceType: 'youtube', resultType: 'song', durationText: dText });
          }
        } else {
          queue.push(...Object.values(cur).filter(v => v && typeof v === 'object').reverse());
        }
      }

      return { id, title, artistName: artist, thumbnailUrl, songs } as any;
    } catch (e) {
      console.error('[getAlbumDetails] InnerTube error:', e);
      return null;
    }
  }

  /**
   * Internal helper for InnerTube API calls. 
   * Uses CapacitorHttp on Android to bypass CORS.
   */
  private async innerTubeRequest(endpoint: string, body: any) {
    const url = `https://music.youtube.com/youtubei/v1/${endpoint}`;
    const context = { client: { clientName: 'WEB_REMIX', clientVersion: '1.20241028.01.00', hl: 'es', gl: 'US' } };
    const fullBody = { context, ...body };

    if (YouTubeExtractionService.isAndroid()) {
      try {
        const { CapacitorHttp } = await import('@capacitor/core');
        const response = await CapacitorHttp.request({
          method: 'POST',
          url,
          headers: { 'Content-Type': 'application/json' },
          data: fullBody
        });
        return response.data;
      } catch (e) {
        console.error(`[innerTubeRequest] CapacitorHttp failed for ${endpoint}:`, e);
        throw e;
      }
    }

    // Web/Browser/Fallback
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fullBody)
    });
    if (!res.ok) throw new Error(`InnerTube Error ${res.status}`);
    return await res.json();
  }

  /**
   * Resolves a YouTube URL to its metadata.
   */
  async getSongDetails(videoId: string): Promise<Song | null> {
    // ── Tauri (Desktop) ──────────────────────────────────────────────────────
    if (YouTubeExtractionService.isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const details: any = await invoke('get_song_details_cmd', { videoId });
        return {
          ...details,
          sourceType: 'youtube',
          resultType: 'song'
        };
      } catch (error) {
        console.error('Tauri getSongDetails Error:', error);
      }
    }

    // ── Android / Web ────────────────────────────────────────────────────────
    try {
      const data = await this.innerTubeRequest('next', { videoId });
      let panel = data?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabRenderer?.content?.musicQueueRenderer?.content?.playlistPanelRenderer;
      
      // Try alternate path if first fails
      if (!panel) {
        panel = data?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.musicQueueRenderer?.content?.playlistPanelRenderer;
      }

      const videoEntry = panel?.contents?.find((c: any) => c?.playlistPanelVideoRenderer?.videoId === videoId)?.playlistPanelVideoRenderer
                      ?? panel?.contents?.[0]?.playlistPanelVideoRenderer;

      if (!videoEntry) throw new Error("No video entry found in panel");

      return {
        id: videoId,
        title: videoEntry.title?.runs?.[0]?.text ?? '',
        artistName: videoEntry.longBylineText?.runs?.[0]?.text ?? videoEntry.shortBylineText?.runs?.[0]?.text ?? '',
        thumbnailUrl: videoEntry.thumbnail?.thumbnails?.slice(-1)[0]?.url ?? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        sourceType: 'youtube',
        resultType: 'song',
        durationText: videoEntry.lengthText?.runs?.[0]?.text ?? ''
      } as any;
    } catch (e) {
      console.error('[getSongDetails] Error:', e);
      // Fallback: Return a skeleton if we have the ID but couldn't fetch details
      return {
        id: videoId,
        title: `YouTube Music (ID: ${videoId})`,
        artistName: 'Unknown Artist',
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        sourceType: 'youtube',
        resultType: 'song'
      } as any;
    }
  }

  /**
   * Intercepts a URL and returns type/id.
   */
  resolveUrl(url: string): { type: 'song' | 'playlist' | 'album' | 'artist', id: string } | null {
    if (!url.includes('http') && url.length !== 11) return null;
    
    const videoIdMatch = url.match(/(?:v=|youtu\.be\/|vi\/|watch\/)([^&?#/ ]{11})/);
    const playlistIdMatch = url.match(/[&?]list=([^&?#/ ]+)/);
    const browseIdMatch = url.match(/browse\/([^&?#/ ]+)/);
    const channelIdMatch = url.match(/channel\/([^&?#/ ]+)/);

    if (videoIdMatch) return { type: 'song', id: videoIdMatch[1] };
    if (playlistIdMatch) return { type: 'playlist', id: playlistIdMatch[1] };
    if (browseIdMatch) {
       const id = browseIdMatch[1];
       if (id.startsWith('UC') || id.startsWith('FMr')) return { type: 'artist', id };
       return { type: 'album', id };
    }
    if (channelIdMatch) return { type: 'artist', id: channelIdMatch[1] };
    
    // Check if it's a raw video ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return { type: 'song', id: url };

    return null;
  }
}

export const youtubeExtractionService = YouTubeExtractionService.getInstance();
