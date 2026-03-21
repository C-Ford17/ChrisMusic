/**
 * AudioEngine Service (Singleton)
 * Centralizes all playback logic for ChrisMusic.
 * Integrates with Capacitor MediaSession for native Android notifications.
 *
 * - **Cambio**: El botón "Play" ahora detecta si la sesión fue restaurada y solicita automáticamente un nuevo enlace de streaming si es necesario, retomando exactamente desde el segundo donde te quedaste.
 *
 * ## 5. Notificación Nativa y Segundo Plano (Android)
 * Hemos implementado una solución robusta para que la música no se detenga y la notificación sea siempre visible:
 * - **Plugins Nativos**: Integramos `@jofr/capacitor-media-session` y `capacitor-plugin-backgroundservice`.
 * - **Foreground Service**: La app ahora corre como un "Servicio de Primer Plano" (mediaPlayback), lo que evita que Android la cierre al bloquear el teléfono.
 * - **Permisos**: Añadimos permisos de `POST_NOTIFICATIONS` y `FOREGROUND_SERVICE` para cumplir con las últimas versiones de Android (13 y 14).
 *
 * ## 6. Descargas de Alta Velocidad (CapacitorHttp)
 */
class AudioEngine {
  private static instance: AudioEngine;
  private htmlPlayer: HTMLAudioElement | null = null;
  public isReady = false;
  private volume = 1;
  private onStateChange: ((state: number) => void) | null = null;


  private constructor() {
    if (typeof window !== 'undefined') {
      this.htmlPlayer = new Audio();
      this.isReady = true;
      this.htmlPlayer.addEventListener('ended', () => {
        if (this.onStateChange) this.onStateChange(0); // State 0 = Ended
      });
      this.htmlPlayer.addEventListener('play', () => {
        if (this.onStateChange) this.onStateChange(1); // State 1 = Playing
      });
      this.htmlPlayer.addEventListener('pause', () => {
        if (this.onStateChange) this.onStateChange(2); // State 2 = Paused
      });
      this.htmlPlayer.addEventListener('loadedmetadata', () => {
        if (this.onStateChange) this.onStateChange(1);
      });
      this.htmlPlayer.addEventListener('timeupdate', () => {
        if (this.onStateChange) this.onStateChange(this.getPlayerState());
      });
    }
  }


  public setOnStateChange(callback: (state: number) => void) {
    this.onStateChange = callback;
  }


  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }


  private async updateMediaSessionState(state: 'playing' | 'paused' | 'none') {
    const isMobile = typeof window !== 'undefined' && (window as any).Capacitor;
    if (isMobile) {
      try {
        const { MediaSession: CapMediaSession } = await import('@jofr/capacitor-media-session');
        await CapMediaSession.setPlaybackState({ playbackState: state });
      } catch (e) { }
    }
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = state;
    }
  }


  public async play() {
    try {
      if (this.htmlPlayer && this.htmlPlayer.src && this.htmlPlayer.src !== window.location.href) {
        await this.htmlPlayer.play();
        await this.updateMediaSessionState('playing');
        this.updateMediaSessionPosition();
      }
    } catch (error) {
      console.error('AudioEngine playback error:', error);
    }
  }


  public async pause() {
    this.htmlPlayer?.pause();
    await this.updateMediaSessionState('paused');
  }


  public seekTo(seconds: number) {
    if (this.htmlPlayer) {
      this.htmlPlayer.currentTime = seconds;
    }
  }


  public setVolume(volume: number) {
    this.volume = volume;
    if (this.htmlPlayer) {
      this.htmlPlayer.volume = this.volume;
    }
  }


  public hasSource(): boolean {
    return !!(this.htmlPlayer && this.htmlPlayer.src && this.htmlPlayer.src !== window.location.href && this.htmlPlayer.src !== '');
  }


  public async reset() {
    if (this.htmlPlayer) {
      this.htmlPlayer.pause();
      this.htmlPlayer.removeAttribute('src');
      this.htmlPlayer.load();
      this.htmlPlayer.currentTime = 0;
    }


    const isMobile = typeof window !== 'undefined' && (window as any).Capacitor;
    if (isMobile) {
      try {
        await this.updateMediaSessionState('none');
      } catch (_e) { }
    }


    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
    }
  }


  public async loadSong(song: any, startSeconds: number = 0, autoplay: boolean = true, localUrl?: string) {
    await this.reset();


    const src = localUrl || (song as any).streamUrl;
    if (src && this.htmlPlayer) {
      this.htmlPlayer.src = src;
      this.htmlPlayer.load();

      const onCanPlay = () => {
        if (this.htmlPlayer) {
          this.htmlPlayer.currentTime = startSeconds;
          if (autoplay) this.play();
          this.updateMediaSessionPosition();
          this.htmlPlayer.removeEventListener('canplay', onCanPlay);
        }
      };


      this.htmlPlayer.addEventListener('canplay', onCanPlay);


      // Update MediaSession (Native + Web)
      const isMobile = typeof window !== 'undefined' && (window as any).Capacitor;

      const metadata = {
        title: song.title,
        artist: song.artistName,
        album: song.albumName || 'ChrisMusic',
        artwork: [
          { src: song.thumbnailUrl || '/icon-192x192.png', sizes: '192x192', type: 'image/jpeg' },
          { src: song.thumbnailUrl || '/icon-512x512.png', sizes: '512x512', type: 'image/jpeg' },
        ]
      };


      if (isMobile) {
        try {
          const { MediaSession: CapMediaSession } = await import('@jofr/capacitor-media-session');
          await CapMediaSession.setMetadata(metadata);
          await this.updateMediaSessionState(autoplay ? 'playing' : 'paused');
        } catch (_e) {
          console.error('Capacitor MediaSession error:', _e);
        }
      }


      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata(metadata);
        await this.updateMediaSessionState(autoplay ? 'playing' : 'paused');
      }
    }
  }


  public async setMediaSessionActions(actions: { onPlay?: () => void, onPause?: () => void, onNext?: () => void, onPrevious?: () => void }) {
    const isMobile = typeof window !== 'undefined' && (window as any).Capacitor;


    if (isMobile) {
      try {
        const { MediaSession: CapMediaSession } = await import('@jofr/capacitor-media-session');
        await CapMediaSession.setActionHandler({ action: 'play' }, async () => {
          await this.play();
          if (actions.onPlay) actions.onPlay();
        });
        await CapMediaSession.setActionHandler({ action: 'pause' }, async () => {
          await this.pause();
          if (actions.onPause) actions.onPause();
        });
        await CapMediaSession.setActionHandler({ action: 'nexttrack' }, actions.onNext || null);
        await CapMediaSession.setActionHandler({ action: 'previoustrack' }, actions.onPrevious || null);
        await CapMediaSession.setActionHandler({ action: 'seekto' }, (details) => {
          if (typeof details.seekTime === 'number') this.seekTo(details.seekTime);
        });
      } catch (e) {
        console.error('Capacitor MediaSession Actions error:', e);
      }
    }


    if ('mediaSession' in navigator) {
      if (actions.onPlay) {
        navigator.mediaSession.setActionHandler('play', async () => {
          await this.play();
          if (actions.onPlay) actions.onPlay();
        });
      }
      if (actions.onPause) {
        navigator.mediaSession.setActionHandler('pause', () => {
          this.pause();
          if (actions.onPause) actions.onPause();
        });
      }
      if (actions.onNext) navigator.mediaSession.setActionHandler('nexttrack', actions.onNext);
      if (actions.onPrevious) navigator.mediaSession.setActionHandler('previoustrack', actions.onPrevious);

      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime !== undefined) {
          this.seekTo(details.seekTime);
        }
      });
    }
  }


  public getDuration(): number {
    return this.htmlPlayer?.duration || 0;
  }


  public getCurrentTime(): number {
    return this.htmlPlayer?.currentTime || 0;
  }


  public getPlayerState(): number {
    if (this.htmlPlayer?.paused) return 2; // Paused
    if (this.htmlPlayer?.ended) return 0; // Ended
    return 1; // Playing
  }


  public async isPlayingNative(): Promise<boolean> {
    return !this.htmlPlayer?.paused;
  }


  public async updateMediaSessionPosition() {
    if (this.htmlPlayer) {
      const positionState = {
        duration: isFinite(this.htmlPlayer.duration) ? this.htmlPlayer.duration : 0,
        playbackRate: this.htmlPlayer.playbackRate,
        position: isFinite(this.htmlPlayer.currentTime) ? this.htmlPlayer.currentTime : 0,
      };


      const isMobile = typeof window !== 'undefined' && (window as any).Capacitor;
      if (isMobile) {
        try {
          const { MediaSession: CapMediaSession } = await import('@jofr/capacitor-media-session');
          CapMediaSession.setPositionState(positionState).catch(() => { });
        } catch (e) { }
      }


      if ('mediaSession' in navigator) {
        try {
          navigator.mediaSession.setPositionState(positionState);
        } catch (e) { }
      }
    }
  }
}


export const audioEngine = AudioEngine.getInstance();