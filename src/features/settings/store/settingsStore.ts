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
  
  // Actions
  setTheme: (theme: ThemeMode) => void;
  setAutoplay: (autoplay: boolean) => void;
  setAudioQuality: (quality: AudioQuality) => void;
  setForcedOffline: (offline: boolean) => void;
  setDebugMode: (debug: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      autoplay: true,
      audioQuality: 'high',
      isForcedOffline: false,
      isDebugMode: false,

      setTheme: (theme) => set({ theme }),
      setAutoplay: (autoplay) => set({ autoplay }),
      setAudioQuality: (audioQuality) => set({ audioQuality }),
      setForcedOffline: (isForcedOffline) => set({ isForcedOffline }),
      setDebugMode: (isDebugMode) => set({ isDebugMode }),
    }),
    {
      name: 'chrismusic-settings-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
