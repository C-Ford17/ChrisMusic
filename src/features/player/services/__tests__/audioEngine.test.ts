import { describe, it, expect, vi, beforeEach } from 'vitest';
import { audioEngine } from '../audioEngine';

describe('AudioEngine', () => {
  beforeEach(() => {
    audioEngine.destroy();
  });

  it('should be a singleton', () => {
    const instance1 = audioEngine;
    const instance2 = audioEngine;
    expect(instance1).toBe(instance2);
  });

  it('should update readiness when a player is attached', () => {
    expect(audioEngine.isReady).toBe(false);
    
    // Mocking YT.Player
    const mockPlayer = {
      setVolume: vi.fn(),
      playVideo: vi.fn(),
      pauseVideo: vi.fn(),
      destroy: vi.fn(),
    } as any;

    audioEngine.setPlayer(mockPlayer);
    expect(audioEngine.isReady).toBe(true);
  });

  it('should call setVolume on the player', () => {
    const mockSetVolume = vi.fn();
    const mockPlayer = {
      setVolume: mockSetVolume,
    } as any;

    audioEngine.setPlayer(mockPlayer);
    audioEngine.setVolume(0.5);

    expect(mockSetVolume).toHaveBeenCalledWith(50);
  });
});
