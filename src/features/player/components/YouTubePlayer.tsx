'use client';

import { useEffect, useCallback, useRef } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { audioEngine } from '../services/audioEngine';

export function YouTubePlayer() {
  const { 
    isPlaying, 
    play, pause, playNext, playPrevious,
    setProgress, setDuration,
    setIsBuffering,
    volume,
    currentSong
  } = usePlayerStore();
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  // Track engine's own playing state to avoid feedback loops.
  // When ExoPlayer fires onStateChange(playing), enginePlayingRef is set true.
  // The isPlaying store effect then sees the ref already matches and skips calling
  // audioEngine.play() — preventing an ExoPlayer → store → engine → ExoPlayer loop.
  const enginePlayingRef = useRef<boolean>(false);

  const stopIndexing = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  const startIndexing = useCallback(() => {
    stopIndexing();
    intervalRef.current = setInterval(() => {
      setProgress(Math.floor(audioEngine.getCurrentTime()));
      audioEngine.updateMediaSessionPosition();
    }, 1000);
  }, [stopIndexing, setProgress]);

  useEffect(() => {
    // Audio engine state and track transitions are now handled GLOBALLY 
    // in playerStore.ts (via initPlayerStoreSync).
    // This allows background updates even when this component is unmounted.
    return () => { stopIndexing(); };
  }, [stopIndexing]);

  // Play/Pause sync
  useEffect(() => {
    // Only call audioEngine if the store state differs from engine's last known state
    if (isPlaying && !enginePlayingRef.current) {
      audioEngine.play();
    } else if (!isPlaying && enginePlayingRef.current) {
      audioEngine.pause();
    }
  }, [isPlaying]);

  // Source sync removed - playerStore handles this during playSong/playSongInQueue
  // This prevents the "Restart" bug where the component would trigger a second load.

  // Handle Volume
  useEffect(() => {
    audioEngine.setVolume(volume);
  }, [volume]);

  // Register MediaSession actions
  useEffect(() => {
    audioEngine.setMediaSessionActions({
      onPlay: () => play(),
      onPause: () => pause(),
      onNext: () => playNext(),
      onPrevious: () => playPrevious(),
    });
  }, [play, pause, playNext, playPrevious]);

  return null;
}
