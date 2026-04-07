/**
 * MaintenanceService
 * Handles YouTube cookie updates and synchronization between Desktop and API.
 */
import { toast } from 'sonner';

export const MaintenanceService = {
  /**
   * Saves cookies to the local Tauri application folder.
   */
  async saveCookiesLocally(contents: string): Promise<boolean> {
    try {
      // Check if Tauri is available
      const isTauri = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__;
      
      if (!isTauri) {
        console.warn('saveCookiesLocally only works on Desktop (Tauri)');
        return false;
      }

      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('save_cookies_cmd', { contents });
      return true;
    } catch (error) {
      console.error('Failed to save cookies locally:', error);
      throw error;
    }
  },

  /**
   * Syncs cookies with the remote Python API.
   */
  async syncCookiesWithApi(contents: string): Promise<boolean> {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://192.168.1.195:5000";
      const response = await fetch(`${apiUrl}/update-cookies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ contents }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      return true;
    } catch (error) {
      console.error('Failed to sync cookies with API:', error);
      throw error;
    }
  },

  /**
   * Clears the entire application cache (DB and Filesystem).
   */
  async clearAppCache(): Promise<void> {
    try {
      const { db } = await import('@/core/db/db');
      
      // 1. Clear IndexedDB Cache
      console.log('[MaintenanceService] Clearing IndexedDB cachedSongs...');
      await db.cachedSongs.clear();
      
      // 2. Clear Filesystem Cache (Capacitor)
      if (typeof window !== 'undefined' && (window as any).Capacitor?.isNativePlatform()) {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        console.log('[MaintenanceService] Clearing Filesystem Cache...');
        
        try {
          const files = await Filesystem.readdir({
            path: '',
            directory: Directory.Cache
          });
          
          for (const file of files.files) {
            await Filesystem.deleteFile({
              path: file.name,
              directory: Directory.Cache
            });
          }
        } catch (fsError) {
          console.warn('[MaintenanceService] Filesystem cache was already empty or inaccessible:', fsError);
        }
      }
      
      toast.success('Caché del sistema liberado correctamente');
    } catch (error) {
      console.error('Failed to clear app cache:', error);
      toast.error('Error al liberar caché');
      throw error;
    }
  }
};
