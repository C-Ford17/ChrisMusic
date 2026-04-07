import { describe, it, expect } from 'vitest';
import { audioEngine } from '../audioEngine';

/**
 * AudioEngine unit tests — ExoPlayer strategy branch.
 *
 * NOTE: Full playback tests require a real Android device / emulator.
 * These tests cover the singleton contract and web fallback state queries.
 */

describe('AudioEngine', () => {
  it('should be a singleton', () => {
    // The module export is always the same instance
    expect(audioEngine).toBe(audioEngine);
    expect(audioEngine).toBeDefined();
  });

  it('should expose playback API', () => {
    expect(typeof audioEngine.play).toBe('function');
    expect(typeof audioEngine.pause).toBe('function');
    expect(typeof audioEngine.seekTo).toBe('function');
    expect(typeof audioEngine.setVolume).toBe('function');
    expect(typeof audioEngine.loadSong).toBe('function');
    expect(typeof audioEngine.reset).toBe('function');
  });

  it('should expose state queries', () => {
    expect(typeof audioEngine.getDuration).toBe('function');
    expect(typeof audioEngine.getCurrentTime).toBe('function');
    expect(typeof audioEngine.getPlayerState).toBe('function');
    expect(typeof audioEngine.isPlayingNative).toBe('function');
    expect(typeof audioEngine.hasSource).toBe('function');
  });

  it('getCurrentTime() returns 0 when no song loaded (web)', () => {
    // In a jsdom environment (no Android), htmlPlayer is fresh
    expect(audioEngine.getCurrentTime()).toBe(0);
  });

  it('getDuration() returns 0 when no song loaded (web)', () => {
    expect(audioEngine.getDuration()).toBe(0);
  });

  it('hasSource() returns false when no song loaded (web)', () => {
    expect(audioEngine.hasSource()).toBe(false);
  });

  it('getPlayerState() returns 2 (paused) when idle', () => {
    // State.PAUSED = 2
    expect(audioEngine.getPlayerState()).toBe(2);
  });
});
