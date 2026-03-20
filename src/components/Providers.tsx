'use client';

import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "sonner";
import { PlayerOverlay } from "@/features/player/components/PlayerOverlay";
import { BottomNav } from "@/shared/components/BottomNav";
import { YouTubePlayer } from "@/features/player/components/YouTubePlayer";
import { OfflineDetector } from "@/components/OfflineDetector";

import { usePlayerStore } from "@/features/player/store/playerStore";
import { useEffect } from "react";
import { audioEngine } from "@/features/player/services/audioEngine";
import { AppEvents } from './AppEvents';

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
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
      <YouTubePlayer />
      <main className="flex-1">
        {children}
      </main>
      <BottomNav />
      <PlayerOverlay />
      <Toaster position="bottom-center" />
    </ThemeProvider>
  );
}
