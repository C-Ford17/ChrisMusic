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
}

export interface ExoProgressEvent {
  current: number;   // seconds
  duration: number;  // seconds
}

interface ExoPlayerPlugin {
  load(options: { url: string; title: string; artist: string; artwork?: string }): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(options: { seconds: number }): Promise<void>;
  stop(): Promise<void>;
  setVolume(options: { volume: number }): Promise<void>;
  getCurrentState(): Promise<{ isPlaying: boolean; current: number; duration: number }>;
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
    return Capacitor.getPlatform() === 'android';
  }

  public static isTauri(): boolean {
    return typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__ !== undefined;
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

    // Strategy 1: Native yt-dlp (Android) - MOST STABLE
    if (YouTubeExtractionService.isAndroid()) {
      try {
        console.log(`[YouTubeExtractionService] Using Native yt-dlp for: ${videoId}`);
        const result = await YouTubeNative.getStreamUrl({ videoId });
        if (result.url) return result.url;
      } catch (e) {
        console.warn('[YouTubeExtractionService] Native extraction failed, failing back to Railway:', e);
      }
    }

    // Strategy 2: Tauri (Native Rust)
    if (YouTubeExtractionService.isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_streaming_url', { videoId });
    }

    // Strategy 3: Railway Proxy (Web Fallback)
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
    const response = await fetch(`${apiUrl}/stream?id=${videoId}`);
    const data = await response.json();
    if (data.url) return data.url;

    throw new Error('Could not extract stream URL');
  }
}

export const youtubeExtractionService = YouTubeExtractionService.getInstance();
