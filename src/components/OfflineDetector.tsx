'use client';

import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '@/features/settings/store/settingsStore';

export function OfflineDetector() {
  const isForcedOffline = useSettingsStore(state => state.isForcedOffline);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    // Current status calculation
    const currentOffline = !navigator.onLine || isForcedOffline;
    setIsOffline(currentOffline);

    const handleOnline = () => {
      if (!isForcedOffline) setIsOffline(false);
    };
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isForcedOffline]);

  return (
    <AnimatePresence>
      {isOffline && (
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[200]"
        >
          <div className="bg-black/80 dark:bg-white/10 backdrop-blur-xl border border-white/10 dark:border-white/5 text-white dark:text-gray-300 px-4 py-2 rounded-2xl shadow-2xl flex items-center gap-2 text-sm font-medium">
            <WifiOff size={16} className="text-red-400" />
            <span>Sin conexión (Modo Offline)</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
