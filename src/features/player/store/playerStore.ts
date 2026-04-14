import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { type Song } from '@/core/types/music';
import { LibraryService } from '@/features/library/services/libraryService';
import { lyricsService, type LyricsLine, type LyricsData } from '@/features/lyrics/services/lrclibService';
import { offlineService } from '@/features/library/services/offlineService';
import { audioEngine } from '@/features/player/services/audioEngine';
import { youtubeExtractionService, YouTubeExtractionService } from '@/features/player/services/youtubeExtractionService';
import { db } from '@/core/db/db';
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
  prefetchingId: string | null;

  // Offline State
  downloadingSongs: Set<string>;

  // Actions
  toggleDownload: (song: Song) => Promise<void>;
  downloadMultiple: (songs: Song[]) => Promise<void>;
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
  prefetchNext: () => Promise<void>;
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
      prefetchingId: null,
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

      downloadMultiple: async (songs: Song[]) => {
        const { downloadingSongs } = get();
        const toDownload: Song[] = [];
        
        // Find which songs are not downloaded and not currently downloading
        for (const song of songs) {
          if (!downloadingSongs.has(song.id)) {
            if (!(await offlineService.isDownloaded(song.id))) {
              toDownload.push(song);
            }
          }
        }

        if (toDownload.length === 0) {
          toast.info('Todas las canciones ya están descargadas');
          return;
        }

        toast.info(`Iniciando descarga de ${toDownload.length} canciones...`);

        // Add all to downloading status immediately so UI updates
        const newDownloading = new Set(get().downloadingSongs);
        toDownload.forEach(s => newDownloading.add(s.id));
        set({ downloadingSongs: newDownloading });

        // Background download loop
        let successCount = 0;
        for (const song of toDownload) {
          try {
            await offlineService.downloadSong(song);
            successCount++;
          } catch (error) {
            console.error(error);
            toast.error(`Error al descargar: ${song.title}`);
          } finally {
            // Remove from downloading status one by one as they finish
            setTimeout(() => {
              const nextSet = new Set(get().downloadingSongs);
              nextSet.delete(song.id);
              set({ downloadingSongs: nextSet });
            }, 100);
          }
        }
        
        if (successCount > 0) {
          toast.success(`Se descargaron ${successCount} canciones correctamente`);
        }
      },


      toggleShuffle: () => {
        const nextShuffle = !get().isShuffle;
        set({ isShuffle: nextShuffle });
        audioEngine.setShuffleMode(nextShuffle);
      },

      toggleRepeatMode: () => {
        const { repeatMode } = get();
        let nextMode: 'off' | 'one' | 'all' = 'off';
        if (repeatMode === 'off') nextMode = 'all';
        else if (repeatMode === 'all') nextMode = 'one';
        else if (repeatMode === 'one') nextMode = 'off';

        set({ repeatMode: nextMode });
        audioEngine.setRepeatMode(nextMode);
      },

      playSong: async (song: Song, startSeconds: number = 0) => {
        // Prevent double loading the same song if already buffering, unless we need to reload (rehydration)
        if (get().currentSong?.id === song.id && get().isBuffering && audioEngine.hasSource()) {
          console.log('[PlayerStore] Already buffering:', song.title);
          return;
        }

        // Build "Smart Queue" from history (excluding downloaded songs)
        let dynamicQueue: Song[] = [song];
        try {
          const recentPlays = await db.history
            .orderBy('playedAt')
            .reverse()
            .limit(20) // Take more to account for filtering
            .toArray();
            
          const downloaded = await db.offlineSongs.toArray();
          const offlineIds = new Set(downloaded.map((os: any) => os.id));
          
          const historySongs: Song[] = [];
          const seenIds = new Set([song.id]);

          for (const entry of recentPlays) {
            const s = entry.song as Song;
            if (!seenIds.has(s.id) && !offlineIds.has(s.id)) {
              historySongs.push(s);
              seenIds.add(s.id);
              if (historySongs.length >= 10) break;
            }
          }
          
          dynamicQueue = [song, ...historySongs];
          console.log(`[PlayerStore] Smart Queue: Added ${historySongs.length} recent songs.`);
        } catch (e) {
          console.warn('[PlayerStore] Could not build smart queue from history:', e);
        }

        set({ 
          currentSong: song, 
          isPlaying: true, 
          isBuffering: true,
          queue: dynamicQueue, 
          lyrics: null, 
          progress: startSeconds 
        });
        LibraryService.recordPlay(song);
        get().fetchLyrics(song);

        // Handle Offline/Cache resolution (including images)
        const { song: resolvedSong, audioUrl } = await offlineService.resolveOfflineSong(song);
        
        if (audioUrl) {
          console.log('[PlayerStore] Source: Offline/Cache');
          set({ currentSong: resolvedSong }); // Update with local thumbnail
          await audioEngine.loadSong(resolvedSong, startSeconds, true, audioUrl);
          get().prefetchNext();
          return;
        }

        const isMarkedOffline = await offlineService.isDownloaded(song.id);
        if (isMarkedOffline) {
          console.warn('[PlayerStore] Song is marked as downloaded but local file could not be resolved. Falling back to stream.');
        }

        try {
          // 3. Extraction + Streaming
          await audioEngine.loadSong(song, startSeconds, get().isPlaying);
          
          // Background: Cache this song for future plays
          offlineService.cacheSong(song);
          
          // Background: Prefetch next song
          get().prefetchNext();

          // Sync repeat mode natively (especially for "Repeat One")
          const { repeatMode } = get();
          audioEngine.setRepeatMode(repeatMode);
        } catch (e) {
          console.error('[PlayerStore] playSong failed:', e);
          set({ isBuffering: false, isPlaying: false });
          toast.error('No se pudo reproducir', { description: (e as Error)?.message });
        }
      },

      playSongInQueue: async (song: Song, queue: Song[], startSeconds: number = 0) => {
        // Prevent double loading
        if (get().currentSong?.id === song.id && get().isBuffering) {
          console.log('[PlayerStore] Already buffering in queue:', song.title);
          return;
        }

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

        // 1. Handle Offline/Cache resolution (including images)
        const { song: resolvedSong, audioUrl } = await offlineService.resolveOfflineSong(song);

        if (audioUrl) {
          console.log('[PlayerStore] Source: Offline/Cache');
          set({ currentSong: resolvedSong }); // Update with local thumbnail
          await audioEngine.loadSong(resolvedSong, startSeconds, true, audioUrl);
          get().prefetchNext();
          return;
        }

        const isMarkedOffline = await offlineService.isDownloaded(song.id);
        if (isMarkedOffline) {
          console.warn('[PlayerStore] Song is marked as downloaded but local file could not be resolved. Falling back to stream.');
        }

        try {
          // 3. Extraction + Streaming
          await audioEngine.loadSong(song, startSeconds, get().isPlaying);
          
          // Background: Cache this song
          offlineService.cacheSong(song);
          
          // Background: Prefetch next
          get().prefetchNext();
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

      play: async () => {
        const { currentSong, queue, progress } = get();
        if (!currentSong) return;

        // On Android, if we re-enter the app, we need to check if the engine 
        // is already playing this song before triggering a full reload.
        if (YouTubeExtractionService.isAndroid()) {
          const isNativePlaying = await audioEngine.isPlayingNative();
          const nativeSource = (audioEngine as any).hasSource?.();
          
          if (isNativePlaying || nativeSource) {
            console.log('[PlayerStore] Native engine already has a source or is playing. Just sending play command.');
            set({ isPlaying: true });
            audioEngine.play();
            return;
          }
        }

        if (!audioEngine.hasSource()) {
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
      
      prefetchNext: async () => {
        const { queue, currentSong, prefetchingId } = get();
        if (!currentSong || queue.length === 0) return;

        const currentIndex = queue.findIndex(s => s.id === currentSong.id);
        if (currentIndex === -1 || currentIndex === queue.length - 1) return;

        const nextSong = queue[currentIndex + 1];
        if (prefetchingId === nextSong.id) return; // Already prefetching

        // Handle Offline/Cache resolution for prefetching
        const { song: resolvedNext, audioUrl } = await offlineService.resolveOfflineSong(nextSong);
        
        if (audioUrl) {
          console.log('[PlayerStore] Prefetch: Song is offline, registering native next track');
          await audioEngine.addNextTrack(resolvedNext, audioUrl);
          return;
        }

        set({ prefetchingId: nextSong.id });
        try {
          const url = await youtubeExtractionService.getStreamUrl(nextSong.id);
          if (url) {
            console.log('[PlayerStore] Prefetch: Extracted URL, registering native next track');
            await audioEngine.addNextTrack(nextSong, url);
          }
        } catch (e) {
          console.warn('[PlayerStore] Prefetch failed:', e);
        } finally {
          set({ prefetchingId: null });
        }
      },

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

// ─── Global Audio Listener Setup ─────────────────────────────────────────────

/**
 * Initializes global synchronization between the AudioEngine and the playerStore.
 * This should be called once at app startup.
 */
export const initPlayerStoreSync = () => {
  const store = usePlayerStore.getState();

  // 1. Sync Playback State (Playing, Paused, Loading)
  audioEngine.setOnStateChange((state) => {
    const isPlaying = state === 1;
    const isBuffering = state === 3;
    const isEnded = state === 0;

    usePlayerStore.setState({ 
      isPlaying, 
      isBuffering 
    });

    if (isEnded) {
      console.log('[PlayerStoreSync] Song ended natively, triggering playNext fallback.');
      usePlayerStore.getState().playNext(true);
    }
  });

  // 2. Sync Native Track Changes (for Background Playlist support)
  audioEngine.setOnTrackChange((id) => {
    const { currentSong, queue, isPlaying } = usePlayerStore.getState();
    
    // If the native engine changed song without JS knowing (background)
    if (currentSong?.id !== id) {
      console.log('[PlayerStoreSync] Native track change detected:', id);
      
      const nextIndex = queue.findIndex(s => s.id === id);
      if (nextIndex !== -1) {
        usePlayerStore.setState({ 
          currentSong: queue[nextIndex],
          progress: 0,
          isBuffering: false,
          isPlaying: true // If it changed natively, it's likely playing
        });
        
        // Update lyrics for the new song
        usePlayerStore.getState().fetchLyrics(queue[nextIndex]);
        
        // Prepare NEXT one for native playlist
        usePlayerStore.getState().prefetchNext();
      }
    }
  });

  // 3. Sync Progress and Duration
  // (The plugin already sends onProgress events which AudioEngine handles internally)
  audioEngine.onProgress = (data) => {
    const currentState = usePlayerStore.getState();
    
    // Evitar que el progreso retroceda por micro-errores del reproductor nativo, a menos que sea un salto grande (ej. usando la barra) o empiece de nuevo
    if (data.current < currentState.progress && (currentState.progress - data.current) < 1.0) {
      return; // Ignorar si es un retroceso menor a 1 segundo (bug de micro-stutter)
    }

    usePlayerStore.setState({
      progress: data.current, // Usar precisión decimal para las letras
      duration: data.duration > 0 ? data.duration : currentState.duration
    });
  };

  // 4. Sync Native Errors (Auto-Recovery)
  audioEngine.setOnError(async (error) => {
    const { currentSong, progress } = usePlayerStore.getState();
    console.warn('[PlayerStoreSync] Native error received, attempting auto-recovery:', error);
    
    if (currentSong) {
      // Small buffer to ensure the old track is dead
      await new Promise(r => setTimeout(r, 500));
      // Re-load song at last known position
      await usePlayerStore.getState().playSong(currentSong, progress);
    }
  });
};

export const initializePlayerSession = async () => {
  const state = usePlayerStore.getState();
  if (state.currentSong && state.progress > 0) {
    console.log('[PlayerStore] Initializing session, loading song (paused):', state.currentSong.title);
    
    // Try offline first, then cache, then YouTube
    const { song: resolvedSong, audioUrl } = await offlineService.resolveOfflineSong(state.currentSong);
    
    if (audioUrl) {
      console.log('[PlayerStore] Source: Offline/Cache');
      await audioEngine.loadSong(resolvedSong, state.progress, false, audioUrl);
    } else {
      await audioEngine.loadSong(state.currentSong, state.progress, false);
    }
  }
};
