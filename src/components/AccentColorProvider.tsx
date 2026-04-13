'use client';

import { useSettingsStore } from "@/features/settings/store/settingsStore";
import { useEffect } from "react";

export function AccentColorProvider({ children }: { children: React.ReactNode }) {
  const accentColor = useSettingsStore((state) => state.accentColor);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--accent-primary', accentColor);
      
      // Also update meta theme color for mobile status bars if needed
      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        // metaThemeColor.setAttribute('content', accentColor);
      }
    }
  }, [accentColor]);

  return <>{children}</>;
}
