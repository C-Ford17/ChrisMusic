import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { type Song } from '@/core/types/music';
import { LibraryService } from '@/features/library/services/libraryService';
import { lyricsService, type LyricsLine, type LyricsData } from '@/features/lyrics/services/lrclibService';
import { offlineService } from '@/features/library/services/offlineService';
import { audioEngine } from '@/features/player/services/audioEngine';
import { youtubeExtractionService } from '@/features/player/services/youtubeExtractionService';
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

        if (await offlineService.isDownloaded(song.id)) {
          await offlineService.removeDownload(song.id);
          toast.success('Descarga eliminada');
          set({ downloadingSongs: new Set(get().downloadingSongs) });
          return;
        }

        set((state) => ({
          downloadingSongs: new Set(state.downloadingSongs).add(song.id)
        }));

        try {
          await offlineService.downloadSong(song);
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

        // Check for already-downloaded offline file first
        const finalUrl = await offlineService.getOfflineUrl(song.id);
        if (finalUrl) {
          audioEngine.loadSong(song, startSeconds, true, finalUrl);
          return;
        }

        try {
          // On Android: ExoPlayer extracts+plays natively — no ADTS caching needed.
          // On Web/PWA: HTMLAudioElement plays the stream URL directly.
          await audioEngine.loadSong(song, startSeconds, get().isPlaying);
        } catch (e) {
          console.error('[PlayerStore] playSong failed:', e);
          set({ isBuffering: false, isPlaying: false });
          toast.error('No se pudo reproducir', { description: (e as Error)?.message });
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

        // Offline/downloaded takes priority
        const offlineUrl = await offlineService.getOfflineUrl(song.id);
        if (offlineUrl) {
          audioEngine.loadSong(song, startSeconds, true, offlineUrl);
          return;
        }

        try {
          // On Android: ExoPlayer extracts+plays natively — no ADTS caching needed.
          // On Web/PWA: HTMLAudioElement plays the stream URL directly.
          await audioEngine.loadSong(song, startSeconds, get().isPlaying);
        } catch (e) {
          console.error('[PlayerStore] playSongInQueue failed:', e);
          set({ isBuffering: false, isPlaying: false });
          toast.error('No se pudo reproducir', { description: (e as Error)?.message });
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
        audioEngine.play();
      },

      pause: () => {
        set({ isPlaying: false });
        audioEngine.pause();
      },

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

      setVolume: (volume: number) => {
        set({ volume });
        audioEngine.setVolume(volume);
      },
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

// Initial initialization for Native Android/Tauri engine
if (typeof window !== 'undefined') {
  youtubeExtractionService.ensureInitialized().catch((err: any) => {
    console.log('[PlayerStore] Initial native init deferred or failed:', err);
  });
}
