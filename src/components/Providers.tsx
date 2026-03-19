'use client';

import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "sonner";
import { PlayerOverlay } from "@/features/player/components/PlayerOverlay";
import { BottomNav } from "@/shared/components/BottomNav";
import { YouTubePlayer } from "@/features/player/components/YouTubePlayer";
import { OfflineDetector } from "@/components/OfflineDetector";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
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
