/**
 * AudioEngine Service (Singleton)
 * Centralizes all playback logic for ChrisMusic.
 *
 * ExoPlayer strategy (feature/exoplayer branch):
 *   - On Android: delegates ALL playback to ExoPlayerNative plugin (Media3 ExoPlayer).
 *     HTMLAudioElement is NOT used on Android.
 *   - On Web/PWA: uses HTMLAudioElement as before.
 *
 * State from ExoPlayer flows back via event listeners → onStateChange callback.
 */
import { youtubeExtractionService, YouTubeExtractionService, ExoPlayerNative, YouTubeNative } from './youtubeExtractionService';
import type { ExoStateChangeEvent, ExoProgressEvent } from './youtubeExtractionService';
import type { Song } from '@/core/types/music';
import type { PluginListenerHandle } from '@capacitor/core';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

type StateCallback = (state: number) => void;
type TrackChangeCallback = (id: string) => void;
type ProgressCallback = (data: { current: number; duration: number }) => void;
type ErrorCallback = (error: string) => void;
type SourceCallback = (source: 'web' | 'cache' | 'download' | 'youtube' | 'local' | 'unknown') => void;

/**
 * Player state codes (same as before for store compatibility):
 * 0 = ended, 1 = playing, 2 = paused, 3 = loading/buffering
 */
const STATE = {
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  LOADING: 3,
} as const;

// ─── AudioEngine ──────────────────────────────────────────────────────────────

class AudioEngine {
  private static instance: AudioEngine;

  // Web fallback
  private htmlPlayer: HTMLAudioElement | null = null;

  // ExoPlayer state tracking
  private exoCurrentTime = 0;
  private exoDuration = 0;
  private exoPlaying = false;
  private exoLoading = false; // Guard to prevent state collisions during transition
  private exoState: string = 'none';
  private exoListeners: PluginListenerHandle[] = [];

  private onStateChange: StateCallback | null = null;
  private onTrackChange: TrackChangeCallback | null = null;
  public onProgress: ProgressCallback | null = null; // Public so store can set it
  private onError: ErrorCallback | null = null;
  public onSourceChange: SourceCallback | null = null;
  private mediaSessionActions: any = null;
  private currentSongTitle = 'ChrisMusic';
  private currentSongId: string | null = null;
  private currentLoadId = 0;
  public currentUrlSource: 'web' | 'cache' | 'download' | 'youtube' | 'local' | 'unknown' = 'unknown';
  public currentUrl: string = '';

  private constructor() {
    if (typeof window === 'undefined') return;

    if (YouTubeExtractionService.isAndroid()) {
      // Android: wire up ExoPlayer event listeners (async — fire and forget)
      this.attachExoListeners();
    } else {
      // Web/PWA: use HTMLAudioElement
      this.htmlPlayer = new Audio();
      this.htmlPlayer.addEventListener('ended', () => this.emit(STATE.ENDED));
      this.htmlPlayer.addEventListener('play', () => this.emit(STATE.PLAYING));
      this.htmlPlayer.addEventListener('pause', () => this.emit(STATE.PAUSED));
      this.htmlPlayer.addEventListener('waiting', () => this.emit(STATE.LOADING));
      this.htmlPlayer.addEventListener('playing', () => this.emit(STATE.PLAYING));
      this.htmlPlayer.addEventListener('timeupdate', () => this.emit(this.getPlayerState()));
    }
  }

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  // ─── Event wiring ──────────────────────────────────────────────────────────

  private async attachExoListeners() {
    // Remove old listeners first (hot-reload safety)
    for (const handle of this.exoListeners) {
      await handle.remove();
    }
    this.exoListeners = [];

    const stateHandle = await ExoPlayerNative.addListener(
      'onStateChange',
      (data: ExoStateChangeEvent) => {
        this.exoState = data.state;
        switch (data.state) {
          case 'playing':
            this.exoPlaying = true;
            this.emit(STATE.PLAYING);
            break;
          case 'paused':
            if (this.exoLoading) {
              console.log('[AudioEngine] Ignoring technical pause during load sequence');
              return;
            }
            this.exoPlaying = false;
            this.emit(STATE.PAUSED);
            break;
          case 'loading':
            this.emit(STATE.LOADING);
            break;
          case 'ended':
            this.exoPlaying = false;
            this.emit(STATE.ENDED);
            break;
          case 'error':
            this.exoPlaying = false;
            this.handleNativeError(data.error || 'Native engine error');
            break;
        }
      }
    );

    const progressHandle = await ExoPlayerNative.addListener(
      'onProgress',
      (data: ExoProgressEvent) => {
        this.exoCurrentTime = data.current;
        this.exoDuration = data.duration;
        if (this.onProgress) this.onProgress(data);
      }
    );

    const nextHandle = await ExoPlayerNative.addListener(
      'onNativeNext',
      () => {
        if (this.mediaSessionActions?.onNext) {
          this.mediaSessionActions.onNext();
        }
      }
    );

    const prevHandle = await ExoPlayerNative.addListener(
      'onNativePrevious',
      () => {
        if (this.mediaSessionActions?.onPrevious) {
          this.mediaSessionActions.onPrevious();
        }
      }
    );

    const trackChangeHandle = await ExoPlayerNative.addListener(
      'onNativeTrackChange',
      (data: { id: string }) => {
        console.log('[AudioEngine] Native track change detected in background:', data.id);
        this.currentSongId = data.id;
        if (this.onTrackChange) this.onTrackChange(data.id);
      }
    );

    this.exoListeners = [stateHandle, progressHandle, nextHandle, prevHandle, trackChangeHandle];
    
    // Perform initial sync after listeners are attached
    this.syncWithNative();
  }

  /**
   * Syncs the internal state with the native ExoPlayer engine.
   * Useful on app startup or re-entry to recognize existing playback.
   */
  public async syncWithNative() {
    if (!YouTubeExtractionService.isAndroid()) return;
    try {
      const state = await ExoPlayerNative.getPlaybackState();
      console.log('[AudioEngine] Initial native sync:', state);
      
      if (state.mediaId) this.currentSongId = state.mediaId;
      if (state.url) {
        this.currentUrlSource = this.determineSource(state.url);
      }
      if (state.currentPosition) this.exoCurrentTime = state.currentPosition;
      if (state.duration) this.exoDuration = state.duration;
      if (state.isPlaying) this.exoPlaying = state.isPlaying;
      if (state.state) {
        this.exoState = state.state;
        // Map native state string to our numeric codes for store sync
        const stateMap: Record<string, number> = { 'playing': 1, 'paused': 2, 'loading': 3, 'ended': 0 };
        this.emit(stateMap[state.state] ?? STATE.PAUSED);
      }
    } catch (e) {
      console.error('[AudioEngine] syncWithNative failed:', e);
    }
  }

  /**
   * Handles fatal native errors (like the I/O error on re-entry).
   * Attempts to reload the current song at the last known position.
   */
  private async handleNativeError(errorMsg: string) {
    console.warn('[AudioEngine] Recovering from native error:', errorMsg);
    
    // Notify JS state as loading during recovery
    this.emit(STATE.LOADING);
    
    // Visual feedback for the user
    toast.error('Recuperando audio...', { 
      description: 'El motor de audio se ha reiniciado por un error del sistema.',
      duration: 3000
    });

    try {
      if (this.currentSongId) {
        if (this.onError) this.onError(errorMsg);
      } else {
        this.emit(STATE.PAUSED);
      }
    } catch (e) {
      console.error('[AudioEngine] Recovery failed:', e);
      this.emit(STATE.PAUSED);
    }
  }

  private emit(state: number) {
    if (this.onStateChange) this.onStateChange(state);
  }

  public setOnStateChange(callback: StateCallback) {
    this.onStateChange = callback;
  }

  public setOnTrackChange(callback: TrackChangeCallback) {
    this.onTrackChange = callback;
  }

  public setOnError(callback: ErrorCallback) {
    this.onError = callback;
  }

  // ─── Core playback API ─────────────────────────────────────────────────────

  public async play() {
    if (YouTubeExtractionService.isAndroid()) {
      // Idempotency check: if we think we're playing, don't spam native
      if (this.exoPlaying) {
        console.log('[AudioEngine] Already playing on Android, skipping redundant play call');
        return;
      }
      try {
        await ExoPlayerNative.play();
        this.exoPlaying = true; 
      } catch (e) {
        // If it's "Already playing" in our state but NOT in native, 
        // this allows us to recover if we try again later.
        this.exoPlaying = true;
        console.error('[AudioEngine] ExoPlayer play error:', e);
      }
      return;
    }

    // Web fallback
    try {
      if (this.htmlPlayer?.src && this.htmlPlayer.src !== window.location.href) {
        await this.htmlPlayer.play();
        this.updateMediaSessionState('playing');
        this.updateMediaSessionPosition();
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error('[AudioEngine] HTMLAudio play error:', error);
    }
  }

  public async pause() {
    if (YouTubeExtractionService.isAndroid()) {
      try {
        await ExoPlayerNative.pause();
      } catch (e) {
        console.error('[AudioEngine] Android native pause failed:', e);
      }
      return;
    }

    // Web fallback
    this.htmlPlayer?.pause();
    this.updateMediaSessionState('paused');
  }

  public seekTo(seconds: number) {
    if (YouTubeExtractionService.isAndroid()) {
      ExoPlayerNative.seek({ seconds }).catch(e =>
        console.error('[AudioEngine] ExoPlayer seek error:', e)
      );
      this.exoCurrentTime = seconds;
      return;
    }
    if (this.htmlPlayer) this.htmlPlayer.currentTime = seconds;
  }

  public setVolume(volume: number) {
    if (YouTubeExtractionService.isAndroid()) {
      ExoPlayerNative.setVolume({ volume }).catch(e =>
        console.error('[AudioEngine] ExoPlayer setVolume error:', e)
      );
      return;
    }
    if (this.htmlPlayer) this.htmlPlayer.volume = volume;
  }

  public hasLocalSource(): boolean {
    if (YouTubeExtractionService.isAndroid()) {
      // ExoPlayer always streams directly — local sources are loaded the same way
      return false;
    }
    return !!(
      this.htmlPlayer?.src &&
      (this.htmlPlayer.src.startsWith('blob:') || this.htmlPlayer.src.startsWith('data:'))
    );
  }

  public hasSource(): boolean {
    if (YouTubeExtractionService.isAndroid()) {
      // Assume ExoPlayer has a source if it's playing or paused (not idle)
      return this.exoPlaying || this.exoCurrentTime > 0 || this.exoDuration > 0;
    }
    return !!(
      this.htmlPlayer?.src &&
      this.htmlPlayer.src !== window.location.href &&
      this.htmlPlayer.src !== ''
    );
  }

  /**
   * Hot-swap source mid-playback (web fallback only).
   * On Android ExoPlayer handles buffering natively — no hot-swap needed.
   */
  public swapSource(newUrl: string, wasPlaying: boolean): void {
    if (YouTubeExtractionService.isAndroid()) {
      // Not needed with ExoPlayer — it buffers the remote stream natively.
      console.log('[AudioEngine] swapSource called on Android (no-op, ExoPlayer is self-sufficient)');
      return;
    }

    if (!this.htmlPlayer) return;
    const savedTime = this.htmlPlayer.currentTime;
    this.htmlPlayer.src = newUrl;
    this.htmlPlayer.load();

    const onLoaded = () => {
      if (this.htmlPlayer) {
        this.htmlPlayer.currentTime = savedTime;
        if (wasPlaying) this.htmlPlayer.play().catch(e => console.error('[AudioEngine] swap play error:', e));
        this.htmlPlayer.removeEventListener('loadedmetadata', onLoaded);
      }
    };
    this.htmlPlayer.addEventListener('loadedmetadata', onLoaded);
  }

  public async reset() {
    if (YouTubeExtractionService.isAndroid()) {
      try {
        await ExoPlayerNative.stop();
      } catch (e) { /* ignore */ }
      this.exoCurrentTime = 0;
      this.exoDuration = 0;
      this.exoPlaying = false;
      this.exoLoading = false; // Ensure guard is cleared on reset
      return;
    }

    // Web fallback
    if (this.htmlPlayer) {
      this.htmlPlayer.pause();
      this.htmlPlayer.removeAttribute('src');
      this.htmlPlayer.load();
      this.htmlPlayer.currentTime = 0;
    }

    if (YouTubeExtractionService.isCapacitor()) {
      try { await this.updateMediaSessionState('none'); } catch (_e) { }
    }
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
    }
  }

  private loadingSongId: string | null = null;

  /**
   * Load a song for playback.
   *
   * Android path:
   *   1. Extract stream URL via yt-dlp (YouTubeNativePlugin.getStreamUrl)
   *   2. Pass URL to ExoPlayerNative.load() — ExoPlayer plays it natively
   *
   * Web path:
   *   Same as before — HTMLAudioElement.
   */
  public async loadSong(
    song: { id?: string; title: string; artistName: string; albumName?: string; thumbnailUrl?: string; streamUrl?: string },
    startSeconds = 0,
    autoplay = true,
    localUrl?: string
  ) {
    // Android/Native guard: already playing or loading the same song
    if (this.currentSongId === song.id && (this.exoState === 'playing' || this.exoLoading)) {
      console.log('[AudioEngine] Song already playing or loading:', song.title);
      return;
    }

    // Extraction in progress guard
    if (song.id && this.loadingSongId === song.id) {
      console.log('[AudioEngine] Duplicate load requested but already extracting:', song.title);
      return;
    }

    console.log(`[AudioEngine] Loading song: ${song.title} (${song.id}) from ${localUrl ? 'LOCAL' : 'REMOTE'}`);
    this.loadingSongId = song.id || null;
    const loadId = ++this.currentLoadId;

    try {
      this.currentSongId = song.id || null;
      await this.reset();
      
      // Safety check after reset
      if (this.currentLoadId !== loadId) {
        console.log(`[AudioEngine] [#${loadId}] Request abandoned during reset`);
        return;
      }

      this.currentSongTitle = song.title;

      if (YouTubeExtractionService.isAndroid()) {
        await this.loadSongExoPlayer(song, startSeconds, autoplay, localUrl, loadId);
        return;
      }

      // ── Web / PWA ──────────────────────────────────────────────────────────
      let src = localUrl || song.streamUrl;

      if (!src && song.id) {
        try {
          src = await youtubeExtractionService.getStreamUrl(song.id);
          if (this.currentLoadId !== loadId) return;
        } catch (e) {
          console.error('[AudioEngine] Web stream extraction failed:', e);
        }
      }

      if (src && this.htmlPlayer) {
        if (this.currentLoadId !== loadId) return;
        this.currentUrl = src;
        this.currentUrlSource = this.determineSource(src);
        if (this.onSourceChange) this.onSourceChange(this.currentUrlSource);
        
        this.htmlPlayer.src = src;
        this.htmlPlayer.load();

        const onCanPlay = () => {
          if (this.htmlPlayer) {
            if (this.currentLoadId !== loadId) {
              this.htmlPlayer.removeEventListener('canplay', onCanPlay);
              return;
            }
            this.htmlPlayer.currentTime = startSeconds;
            if (autoplay) {
              this.play();
            } else {
              this.emit(STATE.PAUSED);
            }
            this.updateMediaSessionPosition();
            this.htmlPlayer.removeEventListener('canplay', onCanPlay);
          }
        };
        this.htmlPlayer.addEventListener('canplay', onCanPlay);
        this.setWebMediaSession(song, autoplay);
      }
    } finally {
      if (this.currentLoadId === loadId) {
        this.loadingSongId = null;
      }
    }
  }

  // ─── ExoPlayer-specific song loading ──────────────────────────────────────

  private async loadSongExoPlayer(
    song: { id?: string; title: string; artistName: string; thumbnailUrl?: string; streamUrl?: string },
    startSeconds: number,
    autoplay: boolean,
    localUrl?: string,
    loadId?: number
  ) {
    const url = localUrl || song.streamUrl;
    this.currentUrl = url || '';

    // If we have a local/offline file — load it directly
    if (url) {
      console.log('[AudioEngine] Loading offline/local file into ExoPlayer');
      this.exoLoading = true;
      this.emit(STATE.LOADING);
      
      this.currentUrlSource = this.determineSource(url);
      if (this.onSourceChange) this.onSourceChange(this.currentUrlSource);

      try {
        const artworkUrl = YouTubeExtractionService.getFallbackThumbnail(song.id, song.thumbnailUrl);
        await this.callExoLoad(url, song.title, song.artistName, artworkUrl, song.id);
        
        if (loadId && this.currentLoadId !== loadId) {
           console.log(`[AudioEngine] [#${loadId}] Offline song loaded but request is stale. Stop.`);
           await ExoPlayerNative.stop();
           return;
        }

        if (startSeconds > 0) this.seekTo(startSeconds);
        if (!autoplay) await ExoPlayerNative.pause();
      } finally {
        this.exoLoading = false;
      }
      return;
    }

    // Otherwise extract via yt-dlp
    this.currentUrlSource = 'youtube';

    // Otherwise extract via yt-dlp (native only — Railway URLs are not compatible with ExoPlayer)
    if (!song.id) {
      console.error('[AudioEngine] Cannot load song on Android: no ID and no URL');
      this.emit(STATE.PAUSED);
      return;
    }

    try {
      console.log(`[AudioEngine] Requesting stream URL from native yt-dlp for ${song.id}...`);

      this.exoLoading = true;
      this.emit(STATE.LOADING); // Immediate feedback

      const result = await YouTubeNative.getStreamUrl({ videoId: song.id });
      
      if (loadId && this.currentLoadId !== loadId) {
        console.log(`[AudioEngine] [#${loadId}] Extraction finished but song was changed. Aborting.`);
        return;
      }

      const streamUrl = result?.url;

      if (!streamUrl) {
        throw new Error('yt-dlp returned empty URL');
      }

      console.log(`[AudioEngine] [#${loadId}] Got stream URL, handing off to ExoPlayer`);
      this.currentUrlSource = 'youtube';
      if (this.onSourceChange) this.onSourceChange('youtube');

      const artworkUrl = YouTubeExtractionService.getFallbackThumbnail(song.id, song.thumbnailUrl);
      await this.callExoLoad(streamUrl, song.title, song.artistName, artworkUrl);
      
      if (loadId && this.currentLoadId !== loadId) {
        console.log(`[AudioEngine] [#${loadId}] Stale request after actual load call. Stopping.`);
        await ExoPlayerNative.stop();
        return;
      }

      if (startSeconds > 0) this.seekTo(startSeconds);
      if (!autoplay) {
        await ExoPlayerNative.pause();
      }
      
      this.exoLoading = false;
    } catch (e) {
      this.exoLoading = false;
      console.error('[AudioEngine] ExoPlayer load failed:', e);
      this.emit(STATE.PAUSED);
      throw e;
    }
  }

  private async callExoLoad(url: string, title: string, artist: string, artwork?: string, id?: string) {
    this.currentUrl = url;
    await ExoPlayerNative.load({ url, title, artist, artwork: artwork ?? '', id: id ?? '' });
  }

  // ─── MediaSession (Web only) ───────────────────────────────────────────────

  private async setWebMediaSession(
    song: { id?: string; title: string; artistName: string; albumName?: string; thumbnailUrl?: string },
    autoplay: boolean
  ) {
    if (!('mediaSession' in navigator)) return;
    const artworkUrl = YouTubeExtractionService.getFallbackThumbnail(song.id, song.thumbnailUrl);
    
    const metadata = {
      title: song.title,
      artist: song.artistName,
      album: song.albumName || 'ChrisMusic',
      artwork: [
        { src: artworkUrl || '/icon-192x192.png', sizes: '192x192', type: 'image/jpeg' },
        { src: artworkUrl || '/icon-512x512.png', sizes: '512x512', type: 'image/jpeg' },
      ],
    };

    if (YouTubeExtractionService.isCapacitor()) {
      try {
        const { MediaSession: CapMediaSession } = await import('@jofr/capacitor-media-session');
        await CapMediaSession.setMetadata(metadata);
        await this.updateMediaSessionState(autoplay ? 'playing' : 'paused');
      } catch (_e) { }
    }

    navigator.mediaSession.metadata = new MediaMetadata(metadata);
    this.updateMediaSessionState(autoplay ? 'playing' : 'paused');
  }

  private async updateMediaSessionState(state: 'playing' | 'paused' | 'none') {
    if (YouTubeExtractionService.isCapacitor()) {
      try {
        const { MediaSession: CapMediaSession } = await import('@jofr/capacitor-media-session');
        await CapMediaSession.setPlaybackState({ playbackState: state });
      } catch (_e) { }
    }
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = state;
    }
  }

  public async setMediaSessionActions(actions: {
    onPlay?: () => void;
    onPause?: () => void;
    onNext?: () => void;
    onPrevious?: () => void;
  }) {
    this.mediaSessionActions = actions;
    
    // ExoPlayer on Android: media session is managed natively by MusicPlayerService.
    // JS MediaSession hooks are still wired for web fallback.
    if (YouTubeExtractionService.isCapacitor()) {
      try {
        const { MediaSession: CapMediaSession } = await import('@jofr/capacitor-media-session');
        await CapMediaSession.setActionHandler({ action: 'play' }, async () => {
          await this.play();
          actions.onPlay?.();
        });
        await CapMediaSession.setActionHandler({ action: 'pause' }, async () => {
          await this.pause();
          actions.onPause?.();
        });
        await CapMediaSession.setActionHandler({ action: 'nexttrack' }, actions.onNext ?? null);
        await CapMediaSession.setActionHandler({ action: 'previoustrack' }, actions.onPrevious ?? null);
        await CapMediaSession.setActionHandler({ action: 'seekto' }, (details) => {
          if (typeof details.seekTime === 'number') this.seekTo(details.seekTime);
        });
      } catch (_e) { }
    }

    if ('mediaSession' in navigator) {
      if (actions.onPlay) {
        navigator.mediaSession.setActionHandler('play', async () => {
          await this.play();
          actions.onPlay?.();
        });
      }
      if (actions.onPause) {
        navigator.mediaSession.setActionHandler('pause', () => {
          this.pause();
          actions.onPause?.();
        });
      }
      if (actions.onNext) navigator.mediaSession.setActionHandler('nexttrack', actions.onNext);
      if (actions.onPrevious) navigator.mediaSession.setActionHandler('previoustrack', actions.onPrevious);
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) this.seekTo(details.seekTime);
      });
    }
  }

  // ─── State queries ─────────────────────────────────────────────────────────

  public getDuration(): number {
    if (YouTubeExtractionService.isAndroid()) return this.exoDuration;
    return this.htmlPlayer?.duration || 0;
  }

  public getCurrentTime(): number {
    if (YouTubeExtractionService.isAndroid()) return this.exoCurrentTime;
    return this.htmlPlayer?.currentTime || 0;
  }

  public getPlayerState(): number {
    if (YouTubeExtractionService.isAndroid()) {
      return this.exoPlaying ? STATE.PLAYING : STATE.PAUSED;
    }
    if (this.htmlPlayer?.paused) return STATE.PAUSED;
    if (this.htmlPlayer?.ended) return STATE.ENDED;
    return STATE.PLAYING;
  }

  public async isPlayingNative(): Promise<boolean> {
    if (YouTubeExtractionService.isAndroid()) return this.exoPlaying;
    return !this.htmlPlayer?.paused;
  }

  /** Returns true when playback is managed by a native engine (ExoPlayer on Android).
   *  On native engines, play/pause events flow from the engine → JS, not the other way.
   *  Sending play/pause commands BACK in response to those events creates a feedback loop.
   */
  public isNativeEngine(): boolean {
    return YouTubeExtractionService.isAndroid();
  }

  public async updateMediaSessionPosition() {
    if (YouTubeExtractionService.isAndroid()) return; // ExoPlayer handles this natively
    if (!this.htmlPlayer) return;

    const positionState = {
      duration: isFinite(this.htmlPlayer.duration) ? this.htmlPlayer.duration : 0,
      playbackRate: this.htmlPlayer.playbackRate,
      position: isFinite(this.htmlPlayer.currentTime) ? this.htmlPlayer.currentTime : 0,
    };

    if (YouTubeExtractionService.isCapacitor()) {
      try {
        const { MediaSession: CapMediaSession } = await import('@jofr/capacitor-media-session');
        CapMediaSession.setPositionState(positionState).catch(() => {});
      } catch (_e) { }
    }

    if ('mediaSession' in navigator) {
      try { navigator.mediaSession.setPositionState(positionState); } catch (_e) { }
    }
  }

  /**
   * Adds a next track to the native playlist for seamless background transition.
   */
  async addNextTrack(song: Song, url: string) {
    if (!YouTubeExtractionService.isAndroid()) return;
    
    try {
      console.log('[AudioEngine] Setting native next track:', song.title);
      await ExoPlayerNative.addNextItem({
        id: song.id,
        url,
        title: song.title,
        artist: song.artistName,
        artwork: YouTubeExtractionService.getFallbackThumbnail(song.id, song.thumbnailUrl)
      });
    } catch (e) {
      console.error('[AudioEngine] Failed to add next track natively:', e);
    }
  }

  async setRepeatMode(mode: 'off' | 'one' | 'all') {
    if (YouTubeExtractionService.isAndroid()) {
      await ExoPlayerNative.setRepeatMode({ mode });
    }
  }

  async setShuffleMode(enabled: boolean) {
    if (YouTubeExtractionService.isAndroid()) {
      await ExoPlayerNative.setShuffleMode({ enabled });
    }
  }

  /**
   * Helper to determine the source type based on the URL.
   */
  private determineSource(url: string): 'web' | 'cache' | 'download' | 'youtube' | 'local' | 'unknown' {
    if (!url) return 'unknown';
    
    // Normalized Capacitor URLs or direct file access
    if (url.includes('_capacitor_file_') || url.startsWith('file://') || url.startsWith('capacitor://')) {
      if (url.includes('offline-songs')) return 'download';
      if (url.includes('cache') || url.startsWith('blob:')) return 'cache';
      return 'local';
    }
    
    if (url.startsWith('blob:')) return 'cache';
    if (url.includes('localhost') || url.includes('127.0.0.1')) {
      if (url.includes('offline-songs')) return 'download';
      return 'cache';
    }

    if (url.includes('youtube.com') || url.includes('googlevideo.com') || url.includes('googleusercontent.com') || url.startsWith('http')) {
       // Si es una URL remota y no es nuestro proxy local, es youtube
       const isLocalProxy = url.includes('localhost') || url.includes('127.0.0.1');
       return isLocalProxy ? 'cache' : 'youtube';
    }
    
    return 'unknown';
  }
}

export const audioEngine = AudioEngine.getInstance();