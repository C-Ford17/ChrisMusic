/**
 * AudioEngine Service (Singleton)
 * Centralizes all playback logic for ChrisMusic.
 * Decoupled from React to enable high-quality unit testing.
 */
class AudioEngine {
  private static instance: AudioEngine;
  private ytPlayer: YT.Player | null = null;
  private htmlPlayer: HTMLAudioElement | null = null;
  public isReady = false;
  private volume = 1;
  private currentSource: 'youtube' | 'local' = 'youtube';
  private onStateChange: ((state: number) => void) | null = null;

  private constructor() {
    if (typeof window !== 'undefined') {
      this.htmlPlayer = new Audio();
      this.isReady = true; // Local player is always ready once initialized
      this.htmlPlayer.addEventListener('ended', () => {
        if (this.onStateChange) this.onStateChange(0); // State 0 = Ended
      });
      this.htmlPlayer.addEventListener('play', () => {
        if (this.onStateChange) this.onStateChange(1); // State 1 = Playing
      });
      this.htmlPlayer.addEventListener('pause', () => {
        if (this.onStateChange) this.onStateChange(2); // State 2 = Paused
      });
      // New listeners for metadata and progressive updates
      this.htmlPlayer.addEventListener('loadedmetadata', () => {
        if (this.onStateChange) this.onStateChange(1); // Force update once duration is known
      });
      this.htmlPlayer.addEventListener('timeupdate', () => {
        // This helps react-based timers stay in sync with the hidden audio element
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

  public setPlayer(player: YT.Player) {
    this.ytPlayer = player;
    this.isReady = true;
    this.syncVolume();
  }

  public play() {
    if (this.currentSource === 'local') {
      this.htmlPlayer?.play();
    } else {
      this.ytPlayer?.playVideo();
    }
  }

  public pause() {
    if (this.currentSource === 'local') {
      this.htmlPlayer?.pause();
    } else {
      this.ytPlayer?.pauseVideo();
    }
  }

  public seekTo(seconds: number) {
    if (this.currentSource === 'local' && this.htmlPlayer) {
      this.htmlPlayer.currentTime = seconds;
    } else if (this.ytPlayer?.seekTo) {
      this.ytPlayer.seekTo(seconds, true);
    }
  }

  public setVolume(volume: number) {
    this.volume = volume;
    this.syncVolume();
  }

  private syncVolume() {
    if (this.htmlPlayer) {
      this.htmlPlayer.volume = this.volume;
    }
    if (this.ytPlayer?.setVolume) {
      this.ytPlayer.setVolume(this.volume * 100);
    }
  }

  public loadSong(songId: string, startSeconds: number = 0, autoplay: boolean = true, localUrl?: string) {
    if (localUrl) {
      this.currentSource = 'local';
      this.ytPlayer?.pauseVideo(); // Stop YouTube if playing
      if (this.htmlPlayer) {
        this.htmlPlayer.src = localUrl;
        this.htmlPlayer.currentTime = startSeconds;
        if (autoplay) this.htmlPlayer.play();
      }
    } else {
      this.currentSource = 'youtube';
      this.htmlPlayer?.pause(); // Stop Local if playing
      if (this.ytPlayer?.loadVideoById && autoplay) {
        this.ytPlayer.loadVideoById({ videoId: songId, startSeconds });
      } else if (this.ytPlayer?.cueVideoById) {
        this.ytPlayer.cueVideoById({ videoId: songId, startSeconds });
      }
    }
  }

  public getDuration(): number {
    if (this.currentSource === 'local') {
      return this.htmlPlayer?.duration || 0;
    }
    return this.ytPlayer?.getDuration ? this.ytPlayer.getDuration() : 0;
  }

  public getCurrentTime(): number {
    if (this.currentSource === 'local') {
      return this.htmlPlayer?.currentTime || 0;
    }
    return this.ytPlayer?.getCurrentTime ? this.ytPlayer.getCurrentTime() : 0;
  }

  public getPlayerState(): number {
    if (this.currentSource === 'local') {
      if (this.htmlPlayer?.paused) return 2; // Paused
      if (this.htmlPlayer?.ended) return 0; // Ended
      return 1; // Playing
    }
    return this.ytPlayer?.getPlayerState ? this.ytPlayer.getPlayerState() : -1;
  }

  public destroy() {
    this.ytPlayer?.destroy?.();
    this.htmlPlayer?.pause();
    if (this.htmlPlayer) this.htmlPlayer.src = '';
    this.ytPlayer = null;
    this.isReady = false;
  }
}

export const audioEngine = AudioEngine.getInstance();
