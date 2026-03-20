'use client';

import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { useRouter, usePathname } from 'next/navigation';
import { usePlayerStore } from '@/features/player/store/playerStore';

export function AppEvents() {
  const router = useRouter();
  const pathname = usePathname();
  const setIsNowPlayingOpen = usePlayerStore((state) => state.setIsNowPlayingOpen);
  const isNowPlayingOpen = usePlayerStore((state) => state.isNowPlayingOpen);

  useEffect(() => {
    const setupListener = async () => {
      const listener = await App.addListener('backButton', () => {
        if (isNowPlayingOpen) {
          setIsNowPlayingOpen(false);
        } else if (pathname !== '/') {
          // Navigate back if possible, else go home
          if (window.history.length > 1) {
            router.back();
          } else {
            router.push('/');
          }
        } else {
          // Exit on home
          App.exitApp();
        }
      });
      return listener;
    };

    const handle = setupListener();

    return () => {
      handle.then(h => h.remove());
    };
  }, [isNowPlayingOpen, pathname, router, setIsNowPlayingOpen]);

  return null;
}
