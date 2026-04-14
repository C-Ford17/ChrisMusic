'use client';

import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "sonner";
import { PlayerOverlay } from "@/features/player/components/PlayerOverlay";
import { BottomNav } from "@/shared/components/BottomNav";
import { YouTubePlayer } from "@/features/player/components/YouTubePlayer";
import { OfflineDetector } from "@/components/OfflineDetector";
import { UpdaterComponent } from "@/components/UpdaterComponent";

import { usePlayerStore, initPlayerStoreSync, initializePlayerSession } from "@/features/player/store/playerStore";
import { useEffect } from "react";
import { audioEngine } from "@/features/player/services/audioEngine";
import { AppEvents } from './AppEvents';

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Global sync between native engine and store
    initPlayerStoreSync();

    // Initialize session from persisted state (after sync is ready)
    setTimeout(() => {
      initializePlayerSession();
    }, 100);

    // MediaSession initialization
    audioEngine.setMediaSessionActions({
      onPlay: () => usePlayerStore.getState().play(),
      onPause: () => usePlayerStore.getState().pause(),
      onNext: () => usePlayerStore.getState().playNext(),
      onPrevious: () => usePlayerStore.getState().playPrevious(),
    });
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <AppEvents />
      <Toaster position="top-center" richColors />
      <OfflineDetector />
      <UpdaterComponent />
      <YouTubePlayer />
      <main className="flex-1">
        {children}
      </main>
      <BottomNav />
      <PlayerOverlay />
    </ThemeProvider>
  );
}
