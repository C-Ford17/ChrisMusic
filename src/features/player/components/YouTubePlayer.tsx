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
        setIsBuffering(false);
        const actualDuration = Math.floor(audioEngine.getDuration());
        if (actualDuration > 0) {
          setDuration(actualDuration);
          
          // Sync currentSong duration if mismatch > 2 seconds
          if (currentSong && Math.abs((currentSong.duration || 0) - actualDuration) > 2) {
            console.log(`[YouTubePlayer] Syncing duration: ${currentSong.duration} -> ${actualDuration}`);
            usePlayerStore.setState(state => ({
              currentSong: state.currentSong ? { ...state.currentSong, duration: actualDuration } : null
            }));
          }
        }
        play();
        startIndexing();
      } else if (state === 3) { // Buffering
        setIsBuffering(true);
      } else if (state === 2 || state === 0) { // Paused or Ended
        setIsBuffering(false);
        pause();
        stopIndexing();
        if (state === 0) playNext(true);
      }
    };

    audioEngine.setOnStateChange(handleStateChange);

    return () => {
      stopIndexing();
      // We don't destroy here because it might be a component re-mount
    };
  }, [play, pause, setDuration, playNext, startIndexing, stopIndexing, currentSong, setIsBuffering]);

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
