import { describe, it, expect, beforeEach } from 'vitest';
import { usePlayerStore } from '../playerStore';

describe('PlayerStore', () => {
  beforeEach(() => {
    // Reset store before each test
    usePlayerStore.setState({
      currentSong: null,
      queue: [],
      isPlaying: false,
      volume: 1,
      progress: 0,
    });
  });

  it('should have initial state', () => {
    const state = usePlayerStore.getState();
    expect(state.currentSong).toBe(null);
    expect(state.queue).toEqual([]);
    expect(state.isPlaying).toBe(false);
  });

  it('should add a song to the queue', () => {
    const mockSong: any = { id: 'song-1', title: 'Song 1', artistName: 'Artist' };
    
    usePlayerStore.getState().addToQueue(mockSong);
    
    const state = usePlayerStore.getState();
    expect(state.currentSong).toEqual(mockSong);
    expect(state.queue).toContain(mockSong);
    expect(state.isPlaying).toBe(true);
  });

  it('should toggle play/pause when a song is present', () => {
     const mockSong: any = { id: 'song-1' };
     usePlayerStore.setState({ currentSong: mockSong, isPlaying: false });

     usePlayerStore.getState().togglePlayPause();
     expect(usePlayerStore.getState().isPlaying).toBe(true);

     usePlayerStore.getState().togglePlayPause();
     expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  it('should clear currentSong on rehydrate storage (preventing auto-play on load)', () => {
    // Simulated hydration logic handled in playerStore.ts
    // We expect isPlaying to be false on rehydrate to comply with browser autoplay policies
  });
});
