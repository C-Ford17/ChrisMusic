import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { type Song } from '@/core/types/music';
import { LibraryService } from '@/features/library/services/libraryService';
import { lyricsService, type LyricsLine, type LyricsData } from '@/features/lyrics/services/lrclibService';
import { OfflineService } from '@/features/library/services/offlineService';
import { audioEngine } from '@/features/player/services/audioEngine';
import { toast } from 'sonner';

interface PlayerState {
  currentSong: Song | null;
  queue: Song[];
  isPlaying: boolean;
  volume: number;
  progress: number; // in seconds
  duration: number; // in seconds
  seekPosition: number | null;
  isNowPlayingOpen: boolean;
  isShuffle: boolean;
  repeatMode: 'off' | 'all' | 'one';

  // Lyrics State
  lyrics: LyricsLine[] | null;
  isLyricsLoading: boolean;
  showLyrics: boolean;
  isCaching: string | null; // ID of the song being cached
  isBuffering: boolean;

  // Offline State
  downloadingSongs: Set<string>;

  // Actions
  toggleDownload: (song: Song) => Promise<void>;
  toggleShuffle: () => void;
  toggleRepeatMode: () => void;
  playSong: (song: Song, startSeconds?: number) => void;
  playSongInQueue: (song: Song, queue: Song[], startSeconds?: number) => void;
  addToQueue: (song: Song) => void;
  removeFromQueue: (index: number) => void;
  playFromQueue: (index: number) => void;
  play: () => void;
  pause: () => void;
  togglePlayPause: () => void;
  playNext: (isAuto?: boolean) => void;
  playPrevious: () => void;
  setVolume: (volume: number) => void;
  setProgress: (progress: number) => void;
  setDuration: (duration: number) => void;
  seekTo: (time: number) => void;
  syncState: () => void;
  setIsNowPlayingOpen: (isOpen: boolean) => void;

  // Lyrics Actions
  fetchLyrics: (song: Song) => Promise<void>;
  updateLyrics: (data: LyricsData) => Promise<void>;
  setShowLyrics: (show: boolean) => void;
  setIsBuffering: (isBuffering: boolean) => void;
  clearPlayerState: () => void;
}

export const usePlayerStore = create<PlayerState>()(
  persist(
    (set, get) => ({
      currentSong: null,
      queue: [],
      isPlaying: false,
      volume: 1,
      progress: 0,
      duration: 0,
      seekPosition: null,
      isNowPlayingOpen: false,
      isShuffle: false,
      repeatMode: 'off',
      lyrics: null,
      isLyricsLoading: false,
      showLyrics: false,
      isCaching: null,
      isBuffering: false,
      downloadingSongs: new Set(),

      toggleDownload: async (song: Song) => {
        const { downloadingSongs } = get();
        if (downloadingSongs.has(song.id)) return;

        if (await OfflineService.isDownloaded(song.id)) {
          await OfflineService.removeDownload(song.id);
          toast.success('Descarga eliminada');
          set({ downloadingSongs: new Set(get().downloadingSongs) });
          return;
        }

        set((state) => ({
          downloadingSongs: new Set(state.downloadingSongs).add(song.id)
        }));

        try {
          await OfflineService.downloadSong(song);
          toast.success('Canción descargada', { description: song.title });
        } catch (error) {
          console.error(error);
          toast.error('Error al descargar');
        } finally {
          setTimeout(() => {
            const nextSet = new Set(get().downloadingSongs);
            nextSet.delete(song.id);
            set({ downloadingSongs: nextSet });
          }, 500);
        }
      },

      toggleShuffle: () => set((state) => ({ isShuffle: !state.isShuffle })),

      toggleRepeatMode: () => set((state) => {
        const modes: ('off' | 'all' | 'one')[] = ['off', 'all', 'one'];
        const nextIndex = (modes.indexOf(state.repeatMode) + 1) % modes.length;
        return { repeatMode: modes[nextIndex] };
      }),

      playSong: async (song: Song, startSeconds: number = 0) => {
        set({ 
          currentSong: song, 
          isPlaying: true, 
          isBuffering: true, 
          queue: [song], 
          lyrics: null, 
          progress: startSeconds 
        });
        LibraryService.recordPlay(song);
        get().fetchLyrics(song);
        const finalUrl = await OfflineService.getOfflineUrl(song.id);
        if (finalUrl) {
          audioEngine.loadSong(song, startSeconds, true, finalUrl);
          return;
        }
        audioEngine.loadSong(song, startSeconds, true);
        const isTauri = typeof window !== 'undefined' && (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
        if (isTauri) {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            const streamUrl = await invoke('get_streaming_url', { videoId: song.id });
            if (get().currentSong?.id === song.id && streamUrl) {
              audioEngine.loadSong(song, startSeconds, get().isPlaying, streamUrl as string);
              OfflineService.cacheSong(song);
            }
          } catch (e) {
            console.error('Tauri streaming extraction failed:', e);
          }
        } else {
          try {
            const { CapacitorHttp } = await import('@capacitor/core');
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://192.168.1.195:5000";
            const response = await CapacitorHttp.get({
              url: `${apiUrl}/stream`,
              params: { id: song.id }
            });
            if (response.status === 200 && response.data.url) {
              if (get().currentSong?.id === song.id) {
                audioEngine.loadSong(song, startSeconds, get().isPlaying, response.data.url);
                
                // Aggressive cache + Auto Swap
                set({ isCaching: song.id });
                OfflineService.cacheSong(song).then(async () => {
                  // Swap to local blob if same song still playing and not already local
                  if (get().currentSong?.id === song.id && !audioEngine.hasLocalSource()) {
                    const localUrl = await OfflineService.getCachedUrl(song.id);
                    if (localUrl) {
                      console.log('[PlayerStore] Auto Hot-Swap triggered!');
                      audioEngine.swapSource(localUrl, get().isPlaying);
                    }
                  }
                  if (get().isCaching === song.id) {
                    set({ isCaching: null });
                    toast.success('✅ Canción en caché', { 
                      description: 'Cambio automático a modo seguro — ya puedes salir.',
                      duration: 4000
                    });
                  }
                }).catch(() => set({ isCaching: null }));
              }
            }
          } catch (e) {
            console.error('Capacitor streaming extraction failed:', e);
          }
        }
      },

      playSongInQueue: async (song: Song, queue: Song[], startSeconds: number = 0) => {
        set({ 
          currentSong: song, 
          isPlaying: true, 
          isBuffering: true, 
          queue, 
          lyrics: null, 
          progress: startSeconds 
        });
        LibraryService.recordPlay(song);
        get().fetchLyrics(song);
        const offlineUrl = await OfflineService.getOfflineUrl(song.id);
        if (offlineUrl) {
          audioEngine.loadSong(song, startSeconds, true, offlineUrl);
          return;
        }
        const cachedUrl = await OfflineService.getCachedUrl(song.id);
        if (cachedUrl) {
          audioEngine.loadSong(song, startSeconds, true, cachedUrl);
          return;
        }
        const isTauri = typeof window !== 'undefined' && (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
        if (isTauri) {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            const streamUrl = await invoke('get_streaming_url', { videoId: song.id });
            if (get().currentSong?.id === song.id && streamUrl) {
              audioEngine.loadSong(song, startSeconds, get().isPlaying, streamUrl as string);
              OfflineService.cacheSong(song);
            }
          } catch (e) {
            console.error('Tauri streaming extraction failed:', e);
          }
        } else {
          try {
            const { CapacitorHttp } = await import('@capacitor/core');
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://192.168.1.195:5000";
            const response = await CapacitorHttp.get({
              url: `${apiUrl}/stream`,
              params: { id: song.id }
            });
            if (response.status === 200 && response.data.url) {
              if (get().currentSong?.id === song.id) {
                audioEngine.loadSong(song, startSeconds, get().isPlaying, response.data.url);
                
                // Aggressive cache + Auto Swap
                set({ isCaching: song.id });
                OfflineService.cacheSong(song).then(async () => {
                  // Swap to local blob if same song still playing and not already local
                  if (get().currentSong?.id === song.id && !audioEngine.hasLocalSource()) {
                    const localUrl = await OfflineService.getCachedUrl(song.id);
                    if (localUrl) {
                      console.log('[PlayerStore] Auto Hot-Swap triggered (queue)!');
                      audioEngine.swapSource(localUrl, get().isPlaying);
                    }
                  }
                  if (get().isCaching === song.id) {
                    set({ isCaching: null });
                    toast.success('✅ Canción en caché', { 
                      description: 'Cambio automático a modo seguro — ya puedes salir.',
                      duration: 4000
                    });
                  }
                }).catch(() => set({ isCaching: null }));
              }
            }
          } catch (e) {
            console.error('Capacitor streaming extraction failed:', e);
          }
        }
      },

      addToQueue: (song: Song) => set((state) => {
        if (!state.currentSong) {
          LibraryService.recordPlay(song);
          get().fetchLyrics(song);
          return { currentSong: song, isPlaying: true, queue: [song], lyrics: null };
        }
        return { queue: [...state.queue, song] };
      }),

      removeFromQueue: (index: number) => set((state) => {
        const newQueue = [...state.queue];
        newQueue.splice(index, 1);
        return { queue: newQueue };
      }),

      playFromQueue: (index: number) => {
        const { queue } = get();
        const newSong = queue[index];
        if (!newSong) return;
        get().playSongInQueue(newSong, queue);
      },

      play: () => {
        const { currentSong, queue, progress } = get();
        if (currentSong && !audioEngine.hasSource()) {
          get().playSongInQueue(currentSong, queue, progress);
          return;
        }
        set({ isPlaying: true });
      },

      pause: () => set({ isPlaying: false }),

      togglePlayPause: () => {
        const { isPlaying } = get();
        if (isPlaying) {
          get().pause();
        } else {
          get().play();
        }
      },

      playNext: (isAuto: boolean = false) => {
        const { currentSong, queue, isShuffle, repeatMode } = get();
        if (!currentSong || queue.length === 0) return;

        if (isAuto && repeatMode === 'one') {
          get().seekTo(0);
          get().play();
          return;
        }

        const currentIndex = queue.findIndex(s => s.id === currentSong.id);
        let nextIndex = -1;

        if (isShuffle && queue.length > 1) {
          do {
            nextIndex = Math.floor(Math.random() * queue.length);
          } while (nextIndex === currentIndex);
        } else {
          if (currentIndex >= 0 && currentIndex < queue.length - 1) {
            nextIndex = currentIndex + 1;
          } else if (repeatMode === 'all') {
            nextIndex = 0;
          }
        }

        if (nextIndex !== -1) {
          const nextSong = queue[nextIndex];
          get().playSongInQueue(nextSong, queue);
        }
      },

      playPrevious: () => {
        const { currentSong, queue, progress, repeatMode, isShuffle } = get();
        if (!currentSong || queue.length === 0) return;

        if (progress > 3) {
          get().seekTo(0);
          return;
        }

        if (queue.length <= 1) {
          get().seekTo(0);
          return;
        }

        const currentIndex = queue.findIndex(s => s.id === currentSong.id);
        let prevIndex = -1;

        if (isShuffle) {
          prevIndex = Math.floor(Math.random() * queue.length);
        } else {
          if (currentIndex > 0) {
            prevIndex = currentIndex - 1;
          } else if (repeatMode === 'all') {
            prevIndex = queue.length - 1;
          }
        }

        if (prevIndex !== -1) {
          const prevSong = queue[prevIndex];
          get().playSongInQueue(prevSong, queue);
        } else {
          get().seekTo(0);
        }
      },

      setVolume: (volume: number) => set({ volume }),
      setProgress: (progress: number) => set({ progress }),
      setDuration: (duration: number) => set({ duration }),
      seekTo: (time: number) => {
        set({ seekPosition: time, progress: time });
        audioEngine.seekTo(time);
      },
      setIsNowPlayingOpen: (isOpen: boolean) => set({ isNowPlayingOpen: isOpen }),

      syncState: async () => {
        set({
          progress: audioEngine.getCurrentTime(),
          duration: audioEngine.getDuration(),
          isPlaying: await audioEngine.isPlayingNative()
        });
      },

      fetchLyrics: async (song: Song) => {
        set({ isLyricsLoading: true });
        try {
          const localData = await LibraryService.getLyrics(song.id);
          let data = localData;

          if (!data) {
            data = await lyricsService.getLyrics(song.artistName, song.title, song.duration);
            if (data) {
              await LibraryService.saveLyrics(song.id, data);
            }
          }

          if (data?.syncedLyrics) {
            const parsed = lyricsService.parseSyncedLyrics(data.syncedLyrics);
            set({ lyrics: parsed });
          } else if (data?.plainLyrics) {
            const plain = data.plainLyrics.split('\n').map((line: string) => ({ time: 0, text: line }));
            set({ lyrics: plain });
          } else {
            set({ lyrics: null });
          }
        } catch (error) {
          console.error('Lyrics fetch error:', error);
          set({ lyrics: null });
        } finally {
          set({ isLyricsLoading: false });
        }
      },

      updateLyrics: async (data: LyricsData) => {
        const { currentSong } = get();
        if (currentSong) {
          await LibraryService.saveLyrics(currentSong.id, data);
          toast.success('Letra guardada para esta canción');
        }

        if (data?.syncedLyrics) {
          const parsed = lyricsService.parseSyncedLyrics(data.syncedLyrics);
          set({ lyrics: parsed });
        } else if (data?.plainLyrics) {
          const plain = data.plainLyrics.split('\n').map((line: string) => ({ time: 0, text: line }));
          set({ lyrics: plain });
        } else {
          set({ lyrics: null });
        }
      },

      setShowLyrics: (show: boolean) => set({ showLyrics: show }),
      setIsBuffering: (isBuffering: boolean) => set({ isBuffering }),
      clearPlayerState: () => {
        audioEngine.pause();
        set({
          currentSong: null,
          queue: [],
          isPlaying: false,
          progress: 0,
          duration: 0,
          lyrics: null,
          isNowPlayingOpen: false
        });
      },
    }),
    {
      name: 'chrismusic-player-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        currentSong: state.currentSong,
        queue: state.queue,
        volume: state.volume,
        progress: state.progress,
        duration: state.duration,
        isShuffle: state.isShuffle,
        repeatMode: state.repeatMode,
        showLyrics: state.showLyrics,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isPlaying = false;
          state.isBuffering = false;
        }
      },
    }
  )
);
