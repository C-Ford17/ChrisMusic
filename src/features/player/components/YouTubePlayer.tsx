'use client';

import { useEffect, useCallback, useRef } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { audioEngine } from '../services/audioEngine';

export function YouTubePlayer() {
  const { 
    isPlaying, 
    play, pause, playNext, playPrevious,
    setProgress, setDuration,
    volume
  } = usePlayerStore();
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

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
    // Bridge AudioEngine events to Store
    const handleStateChange = (state: number) => {
      if (state === 1) { // Playing
        play();
        setDuration(Math.floor(audioEngine.getDuration()));
        startIndexing();
      } else if (state === 2 || state === 0) { // Paused or Ended
        pause();
        stopIndexing();
        if (state === 0) playNext();
      }
    };

    audioEngine.setOnStateChange(handleStateChange);

    return () => {
      stopIndexing();
      // We don't destroy here because it might be a component re-mount
    };
  }, [play, pause, setDuration, playNext, startIndexing, stopIndexing]);

  // Handle Play/Pause synchronization
  useEffect(() => {
    if (isPlaying) {
      audioEngine.play();
    } else {
      audioEngine.pause();
    }
  }, [isPlaying]);

  // Handle Volume
  useEffect(() => {
    audioEngine.setVolume(volume);
  }, [volume]);

  // Register MediaSession actions (Mobile + Web)
  useEffect(() => {
    audioEngine.setMediaSessionActions({
      onPlay: () => play(),
      onPause: () => pause(),
      onNext: () => playNext(),
      onPrevious: () => playPrevious(),
    });
  }, [play, pause, playNext, playPrevious]);

  return null; // No need for an iframe container anymore
}
