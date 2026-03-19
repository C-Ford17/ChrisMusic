'use client';

import { useEffect, useRef, useState } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { audioEngine } from '../services/audioEngine';

export function YouTubePlayer() {
  const { 
    currentSong, isPlaying, 
    play, pause, playNext,
    setProgress, setDuration, seekPosition,
    volume
  } = usePlayerStore();
  
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const prevSongIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = () => initPlayer();
    } else {
      initPlayer();
    }

    function initPlayer() {
      if (!containerRef.current) return;
      
      const handleStateChange = (state: number) => {
        if (state === 1) { // Playing
          play();
          audioEngine.setVolume(usePlayerStore.getState().volume);
          setDuration(Math.floor(audioEngine.getDuration()));
          startIndexing();
        } else if (state === 2 || state === 5) { // Paused or Cued
          pause();
          stopIndexing();
        } else if (state === 0) { // Ended
          stopIndexing();
          playNext();
        }
      };

      // Set global bridge for both YT and Local
      audioEngine.setOnStateChange(handleStateChange);

      new window.YT.Player(containerRef.current, {
        height: '0',
        width: '0',
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          playsinline: 1,
        },
        events: {
          onReady: (event: YT.OnReadyEvent) => {
            audioEngine.setPlayer(event.target);
            audioEngine.setVolume(usePlayerStore.getState().volume);

            if (currentSong) {
              prevSongIdRef.current = currentSong.id;
              // Check if we should load local or YT on init
              (async () => {
                const { OfflineService } = await import('../../library/services/offlineService');
                const localUrl = await OfflineService.getOfflineUrl(currentSong.id);
                audioEngine.loadSong(currentSong.id, usePlayerStore.getState().progress, isPlaying, localUrl || undefined);
              })();
            }
          },
          onStateChange: (event: YT.OnStateChangeEvent) => {
            handleStateChange(event.data);
          },
        },
      });
    }

    return () => {
      stopIndexing();
      audioEngine.destroy();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startIndexing() {
    stopIndexing();
    intervalRef.current = setInterval(() => {
      setProgress(Math.floor(audioEngine.getCurrentTime()));
    }, 1000);
  }

  function stopIndexing() {
    if (intervalRef.current) clearInterval(intervalRef.current);
  }

  // Handle song changes
  useEffect(() => {
    if (audioEngine.isReady && currentSong && currentSong.id !== prevSongIdRef.current) {
      prevSongIdRef.current = currentSong.id;
      audioEngine.loadSong(currentSong.id, 0, true);
    }
  }, [currentSong]);

  // Handle Play/Pause
  useEffect(() => {
    if (audioEngine.isReady) {
      const state = audioEngine.getPlayerState();
      // Ensure window.YT is available before checking state constants
      const YT_PLAYING = window.YT?.PlayerState?.PLAYING;
      const YT_BUFFERING = window.YT?.PlayerState?.BUFFERING;
      const YT_CUED = window.YT?.PlayerState?.CUED;
      const YT_UNSTARTED = window.YT?.PlayerState?.UNSTARTED;

      if (isPlaying) {
        if (state === YT_CUED || state === YT_UNSTARTED) {
          if (currentSong) audioEngine.loadSong(currentSong.id, usePlayerStore.getState().progress, true);
        } else if (state !== YT_PLAYING && state !== YT_BUFFERING) {
           audioEngine.play();
        }
      } else {
        if (state === YT_PLAYING || state === YT_BUFFERING) {
           audioEngine.pause();
        }
      }
    }
  }, [isPlaying, currentSong]);

  // Handle Seek
  useEffect(() => {
    if (seekPosition !== null) {
      audioEngine.seekTo(seekPosition);
    }
  }, [seekPosition]);

  // Handle Volume
  useEffect(() => {
    if (audioEngine.isReady) {
      audioEngine.setVolume(volume);
    }
  }, [volume]);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <div 
      className="opacity-0 pointer-events-none absolute left-0 top-0 w-0 h-0 overflow-hidden" 
      aria-hidden="true"
    >
      <div ref={containerRef} />
    </div>
  );
}

declare global {
  namespace YT {
    interface Player {
      loadVideoById(args: string | { videoId: string; startSeconds?: number }): void;
      cueVideoById(args: { videoId: string; startSeconds?: number }): void;
      playVideo(): void;
      pauseVideo(): void;
      seekTo(seconds: number, allowSeekAhead: boolean): void;
      getCurrentTime(): number;
      getDuration(): number;
      getPlayerState(): number;
      setVolume(volume: number): void;
      getVolume(): number;
      destroy(): void;
    }
    interface OnStateChangeEvent { data: number; }
    interface OnReadyEvent { target: Player; }
  }
  interface Window {
    YT: {
      Player: new (container: HTMLElement, options: object) => YT.Player;
      PlayerState: {
        UNSTARTED: number; ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number;
      };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

