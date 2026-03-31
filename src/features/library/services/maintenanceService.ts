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
  }
};
