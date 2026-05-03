import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type ThemeMode = 'dark' | 'light' | 'system';
export type AudioQuality = 'low' | 'normal' | 'high';
export type DoHProvider = 'none' | 'google' | 'cloudflare' | 'opendns' | 'adguard' | 'custom';
export type ProxyType = 'http' | 'socks4' | 'socks5';

interface SettingsState {
  theme: ThemeMode;
  autoplay: boolean;
  audioQuality: AudioQuality;
  isForcedOffline: boolean;
  isDebugMode: boolean;
  accentColor: string;
  autoCache: boolean;
  forceIPv4: boolean;
  
  // Network Settings
  enableProxy: boolean;
  proxyType: ProxyType;
  proxyHost: string;
  proxyPort: string;
  proxyUrl: string; // Keeping for backward compatibility/unified url
  dohProvider: DoHProvider;
  customDohUrl: string;
  
  // Shutdown Timer
  shutdownTimerDuration: number;
  shutdownTimerEndsAt: number | null;
  isShutdownTimerActive: boolean;
  
  // Actions
  setTheme: (theme: ThemeMode) => void;
  setAccentColor: (color: string) => void;
  setAutoplay: (autoplay: boolean) => void;
  setAutoCache: (autoCache: boolean) => void;
  setForceIPv4: (force: boolean) => void;
  setAudioQuality: (quality: AudioQuality) => void;
  setForcedOffline: (offline: boolean) => void;
  setDebugMode: (debug: boolean) => void;
  setEnableProxy: (enable: boolean) => void;
  setProxyType: (type: ProxyType) => void;
  setProxyHost: (host: string) => void;
  setProxyPort: (port: string) => void;
  setProxyUrl: (url: string) => void;
  setDohProvider: (provider: DoHProvider) => void;
  setCustomDohUrl: (url: string) => void;
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
      autoCache: true,
      forceIPv4: false,
      
      // Network defaults
      enableProxy: false,
      proxyType: 'http',
      proxyHost: '',
      proxyPort: '',
      proxyUrl: '',
      dohProvider: 'none',
      customDohUrl: '',

      shutdownTimerDuration: 60000,
      shutdownTimerEndsAt: null,
      isShutdownTimerActive: false,

      setTheme: (theme) => set({ theme }),
      setAccentColor: (accentColor) => set({ accentColor }),
      setAutoplay: (autoplay) => set({ autoplay }),
      setAutoCache: (autoCache) => set({ autoCache }),
      setForceIPv4: (forceIPv4) => set({ forceIPv4 }),
      setAudioQuality: (audioQuality) => set({ audioQuality }),
      setForcedOffline: (isForcedOffline) => set({ isForcedOffline }),
      setDebugMode: (isDebugMode) => set({ isDebugMode }),
      
      setEnableProxy: (enableProxy) => set({ enableProxy }),
      setProxyType: (proxyType) => set({ proxyType }),
      setProxyHost: (proxyHost) => set({ proxyHost }),
      setProxyPort: (proxyPort) => set({ proxyPort }),
      setProxyUrl: (proxyUrl) => set({ proxyUrl }),
      setDohProvider: (dohProvider) => set({ dohProvider }),
      setCustomDohUrl: (customDohUrl) => set({ customDohUrl }),
      
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
        enableProxy: state.enableProxy,
        proxyType: state.proxyType,
        proxyHost: state.proxyHost,
        proxyPort: state.proxyPort,
        proxyUrl: state.proxyUrl,
        dohProvider: state.dohProvider,
        customDohUrl: state.customDohUrl,
        autoCache: state.autoCache,
        forceIPv4: state.forceIPv4,
      }),
    }
  )
);
