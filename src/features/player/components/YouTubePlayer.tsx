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
    // Bridge AudioEngine → Store.
    //
    // ⚠️ ANDROID FEEDBACK LOOP PREVENTION:
    // ExoPlayer fires onStateChange(playing) →
    //   handleStateChange sets enginePlayingRef=true, updates store isPlaying=true →
    //   isPlaying effect below sees enginePlayingRef already=true, SKIPS audioEngine.play() ✓
    //
    // Without this guard:
    //   ExoPlayer fires → store → audioEngine.play() → ExoPlayer fires again → ∞ loop
    const handleStateChange = (state: number) => {
      if (state === 1) { // Playing
        enginePlayingRef.current = true;
        setIsBuffering(false);
        const actualDuration = Math.floor(audioEngine.getDuration());
        if (actualDuration > 0) {
          setDuration(actualDuration);
          if (currentSong && Math.abs((currentSong.duration || 0) - actualDuration) > 2) {
            usePlayerStore.setState(st => ({
              currentSong: st.currentSong ? { ...st.currentSong, duration: actualDuration } : null
            }));
          }
        }
        usePlayerStore.setState({ isPlaying: true, isBuffering: false });
        startIndexing();
      } else if (state === 3) { // Buffering/Loading
        setIsBuffering(true);
        usePlayerStore.setState({ isBuffering: true });
      } else if (state === 2 || state === 0) { // Paused or Ended
        enginePlayingRef.current = false;
        setIsBuffering(false);
        usePlayerStore.setState({ isPlaying: false, isBuffering: false });
        stopIndexing();
        if (state === 0) playNext(true);
      }
    };

    audioEngine.setOnStateChange(handleStateChange);
    return () => { stopIndexing(); };
  }, [playNext, startIndexing, stopIndexing, currentSong, setIsBuffering, setDuration]);

  // Sync store isPlaying → engine (for user-initiated play/pause button taps).
  // We use enginePlayingRef to skip the engine call when the change was triggered
  // BY the engine itself (to break the feedback loop).
  useEffect(() => {
    if (isPlaying && !enginePlayingRef.current) {
      // User pressed play — engine doesn't know yet, tell it
      enginePlayingRef.current = true;
      audioEngine.play();
    } else if (!isPlaying && enginePlayingRef.current) {
      // User pressed pause — engine doesn't know yet, tell it
      enginePlayingRef.current = false;
      audioEngine.pause();
    }
    // If enginePlayingRef already matches isPlaying, the change came from the engine
    // itself — no need to send a redundant command back.
  }, [isPlaying]);

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
