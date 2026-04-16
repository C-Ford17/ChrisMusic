import { Capacitor, registerPlugin } from '@capacitor/core';
import { type Song } from '@/core/types/music';

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
   */
  static normalizeUrl(url?: string): string {
    if (!url) return '';
    if (this.isAndroid() && url.startsWith('file://')) {
      try {
        return Capacitor.convertFileSrc(url);
      } catch (e) {
        console.warn('[YouTubeExtractionService] Failed to normalize native URL:', e);
      }
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
    return `https://i.ytimg.com/vi/${songId}/maxresdefault.jpg`;
  }

  public static getFallbackThumbnail(songId?: string, fallbackUrl?: string): string {
    // If we already have a specialized local/blob URL, don't override it
    if (fallbackUrl && (fallbackUrl.includes('_capacitor_file_') || fallbackUrl.startsWith('http://localhost') || fallbackUrl.startsWith('https://localhost') || fallbackUrl.startsWith('blob:') || fallbackUrl.startsWith('file:') || fallbackUrl.startsWith('capacitor:'))) {
      return fallbackUrl;
    }
    if (!songId) return fallbackUrl || '';
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

    if (YouTubeExtractionService.isAndroid()) {
      try {
        console.log(`[YouTubeExtractionService] Using Native ytsearch for: ${query}`);
        const result = await YouTubeNative.search({ query, count });
        return result.results.map((item: any) => ({
          id: item.id,
          title: item.title,
          artistName: item.artistName,
          thumbnailUrl: item.thumbnailUrl,
          duration: item.duration,
          sourceType: 'youtube'
        }));
      } catch (e) {
        console.error('[YouTubeExtractionService] Native search failed:', e);
        throw e;
      }
    }

    // Tauri Native Search
    if (YouTubeExtractionService.isTauri()) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const result: any[] = await invoke('search_youtube_native_cmd', { query });
        return result.map((item: any) => ({
          id: item.id,
          title: item.title,
          artistName: item.artistName,
          thumbnailUrl: item.thumbnailUrl,
          duration: 0, // Tauri search doesn't return duration yet
          sourceType: 'youtube'
        }));
      } catch (e) {
        console.error('[YouTubeExtractionService] Tauri search failed:', e);
        throw e;
      }
    }

    // Fallback for JS web
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

    // Strategy 3: Railway Proxy (Web Fallback) - ONLY if NOT Native
    if (!isNative) {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://chrismusic-production.up.railway.app";
        const response = await fetch(`${apiUrl}/stream?id=${videoId}`);
        const data = await response.json();
        if (data.url) return data.url;
      } catch (e) {
        console.error('[YouTubeExtractionService] Railway fallback failed:', e);
      }
    }

    throw new Error(`Could not extract stream URL for ${videoId} in ${YouTubeExtractionService.getEnv()} environment.`);
  }
}

export const youtubeExtractionService = YouTubeExtractionService.getInstance();
