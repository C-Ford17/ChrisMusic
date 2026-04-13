import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type ThemeMode = 'dark' | 'light' | 'system';
export type AudioQuality = 'low' | 'normal' | 'high';

interface SettingsState {
  theme: ThemeMode;
  autoplay: boolean;
  audioQuality: AudioQuality;
  isForcedOffline: boolean;
  isDebugMode: boolean;
  accentColor: string;
  
  // Shutdown Timer
  shutdownTimerDuration: number;
  shutdownTimerEndsAt: number | null;
  isShutdownTimerActive: boolean;
  
  // Actions
  setTheme: (theme: ThemeMode) => void;
  setAccentColor: (color: string) => void;
  setAutoplay: (autoplay: boolean) => void;
  setAudioQuality: (quality: AudioQuality) => void;
  setForcedOffline: (offline: boolean) => void;
  setDebugMode: (debug: boolean) => void;
  startShutdownTimer: (durationMs: number) => void;
  cancelShutdownTimer: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      autoplay: true,
      audioQuality: 'high',
      isForcedOffline: false,
      isDebugMode: false,
      accentColor: '#7C3AED',
      shutdownTimerDuration: 60000,
      shutdownTimerEndsAt: null,
      isShutdownTimerActive: false,

      setTheme: (theme) => set({ theme }),
      setAccentColor: (accentColor) => set({ accentColor }),
      setAutoplay: (autoplay) => set({ autoplay }),
      setAudioQuality: (audioQuality) => set({ audioQuality }),
      setForcedOffline: (isForcedOffline) => set({ isForcedOffline }),
      setDebugMode: (isDebugMode) => set({ isDebugMode }),
      
      startShutdownTimer: (durationMs: number) => {
        const endsAt = Date.now() + durationMs;
        set({ shutdownTimerDuration: durationMs, shutdownTimerEndsAt: endsAt, isShutdownTimerActive: true });
      },
      
      cancelShutdownTimer: () => {
        set({ shutdownTimerEndsAt: null, isShutdownTimerActive: false });
      },
    }),
    {
      name: 'chrismusic-settings-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        theme: state.theme,
        autoplay: state.autoplay,
        audioQuality: state.audioQuality,
        isForcedOffline: state.isForcedOffline,
        isDebugMode: state.isDebugMode,
        accentColor: state.accentColor,
      }),
    }
  )
);
