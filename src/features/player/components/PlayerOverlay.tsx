'use client';

import React, { useState, useEffect } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { audioEngine } from '../services/audioEngine';
import { 
  Play, Pause, SkipForward, SkipBack, Shuffle, Heart, 
  ChevronDown, ListMusic, Repeat, Repeat1, Plus, X, Mic2,
  Download, Check, Loader2, Timer
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/db/db';
import { LibraryService } from '@/features/library/services/libraryService';
import { AddToPlaylistModal } from '@/shared/components/AddToPlaylistModal';
import { VolumeControl } from './VolumeControl';
import { LyricsPanel } from '@/features/lyrics/components/LyricsPanel';
import { MarqueeText } from '@/shared/components/MarqueeText';
import Image from 'next/image';
import { useSettingsStore } from '@/features/settings/store/settingsStore';
import { YouTubeExtractionService } from '@/features/player/services/youtubeExtractionService';

function formatTime(seconds: number) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function PlayerOverlay() {
  const { 
    currentSong, isPlaying, togglePlayPause,
    progress, duration, isNowPlayingOpen, setIsNowPlayingOpen,
    playNext, playPrevious, queue, seekTo, playFromQueue, removeFromQueue,
    isShuffle, repeatMode, toggleShuffle, toggleRepeatMode,
    showLyrics, setShowLyrics,
    toggleDownload, downloadingSongs,
    isBuffering,
    audioSource,
    syncState
  } = usePlayerStore();

  const { isDebugMode, isShutdownTimerActive, shutdownTimerEndsAt, startShutdownTimer, cancelShutdownTimer } = useSettingsStore();

  const [showTimerModal, setShowTimerModal] = useState(false);
  const [timerRemaining, setTimerRemaining] = useState<number | null>(null);

  const [showQueue, setShowQueue] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      syncState();
    }, 500);

    return () => clearInterval(interval);
  }, [syncState]);

  useEffect(() => {
    if (!isShutdownTimerActive || !shutdownTimerEndsAt) {
      setTimerRemaining(null);
      return;
    }

    const updateTimer = () => {
      const remaining = Math.max(0, shutdownTimerEndsAt - Date.now());
      setTimerRemaining(remaining);

      if (remaining <= 0) {
        cancelShutdownTimer();
        usePlayerStore.getState().pause();
        import('@capacitor/app').then(({ App }) => {
          App.exitApp();
        }).catch(() => {
          const win = window as any;
          if (win.Cordova?.exitApp) {
            win.Cordova.exitApp();
          } else {
            win.close?.();
          }
        });
      }
    };

    updateTimer();
    const timerInterval = setInterval(updateTimer, 1000);
    return () => clearInterval(timerInterval);
  }, [isShutdownTimerActive, shutdownTimerEndsAt, cancelShutdownTimer]);

  const isFavorite = useLiveQuery(
    () => db.favorites.where('id').equals(currentSong?.id || '').count(),
    [currentSong?.id]
  ) ?? 0;

  const isDownloaded = useLiveQuery(
    async () => {
      if (!currentSong) return false;
      const song = await db.offlineSongs.get(currentSong.id);
      return !!song;
    },
    [currentSong?.id]
  ) || false;

  const isDownloading = currentSong ? downloadingSongs.has(currentSong.id) : false;

  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);
  const [swipeDeltaX, setSwipeDeltaX] = useState(0);
  const touchStartX = React.useRef<number | null>(null);
  const SWIPE_THRESHOLD = 60;

  const handleMiniTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    setSwipeDeltaX(0);
  };

  const handleMiniTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.touches[0].clientX - touchStartX.current;
    setSwipeDeltaX(delta);
  };

  const handleMiniTouchEnd = () => {
    if (touchStartX.current === null) return;
    if (swipeDeltaX > SWIPE_THRESHOLD) {
      playPrevious();
    } else if (swipeDeltaX < -SWIPE_THRESHOLD) {
      playNext();
    }
    touchStartX.current = null;
    setSwipeDeltaX(0);
  };



  const [formats, setFormats] = useState<any[]>([]);
  const [loadingFormats, setLoadingFormats] = useState(false);
  const [showFormats, setShowFormats] = useState(false);
  const [thumbError, setThumbError] = useState(false);

  useEffect(() => {
    setThumbError(false); // Reset al cambiar de canción
  }, [currentSong?.id]);

  const loadFormats = async () => {
    if (!currentSong) return;
    setLoadingFormats(true);
    setShowFormats(true);
    try {
      const isAndroid = typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform();
      const isTauri = typeof window !== 'undefined' && (!!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI_METADATA__);

      // Native modes (Android / Tauri Desktop) don't use Railway API,
      // and we don't have a direct "get formats matrix" command yet.
      if (isAndroid || isTauri) {
        setFormats([{ 
           itag: isAndroid ? 'Android' : 'Desktop', 
           mimeType: 'audio/mp4; Native yt-dlp', 
           qualityLabel: 'Auto-Best',
           bitrate: 'Highest available'
        }]);
        setLoadingFormats(false);
        return;
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://chrismusic-production.up.railway.app";
      const url = `${apiUrl}/formats?id=${currentSong.id}`;

      let formatsData = [];
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.formats) formatsData = data.formats;
      }
      setFormats(formatsData);
    } catch (e) {
      console.error('[Debug Panel] Error loading formats:', e);
      setFormats([{ itag: 'Error', mimeType: 'Failed to fetch', qualityLabel: 'API Offline' }]);
    } finally {
      setLoadingFormats(false);
    }
  };

  const inspectLocalBlob = async () => {
    if (!currentSong) return;
    try {
      const offlineSong = await db.offlineSongs.get(currentSong.id);
      const cachedSong = await db.cachedSongs.get(currentSong.id);
      const songRecord = offlineSong || cachedSong;
      
      if (!songRecord || !songRecord.audioBlob) {
        alert("Esta canción no está guardada como Blob local.");
        return;
      }
      
      const blob = songRecord.audioBlob as Blob;
      const buffer = await blob.slice(0, 100).arrayBuffer();
      const bytes = new Uint8Array(buffer);
      
      const hex = Array.from(bytes).slice(0, 32).map(b => b.toString(16).padStart(2, '0')).join(' ');
      const ascii = Array.from(bytes).slice(0, 32).map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('');

      alert(`📋 CÓDIGO HEXADECIMAL:\nHEX: ${hex}\n\nASCII: ${ascii}\n\nEnvía una foto de esto!`);
    } catch(e: any) {
      alert("Error analizando: " + e.message);
    }
  };

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentSong) {
      await LibraryService.toggleFavorite(currentSong);
    }
  };

  // Reset thumbnail error when song changes
  useEffect(() => {
    setThumbError(false);
  }, [currentSong?.id]);

  if (!currentSong) return null;

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;
  
  return (
    <>
      <AnimatePresence>
        {!isNowPlayingOpen && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1, x: swipeDeltaX * 0.4 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ x: { type: 'spring', stiffness: 300, damping: 30 } }}
            className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] left-2 right-2 sm:bottom-0 sm:left-0 sm:right-0 sm:w-full sm:rounded-none sm:h-24 bg-white/95 dark:bg-[#181818]/95 sm:bg-white sm:dark:bg-[#181818] backdrop-blur-xl border border-black/5 dark:border-white/10 sm:border-x-0 sm:border-b-0 rounded-2xl p-2 sm:px-6 flex items-center shadow-2xl sm:shadow-none z-50 cursor-pointer overflow-hidden transition-colors duration-300"
            style={{ touchAction: 'pan-y' }}
            onClick={() => setIsNowPlayingOpen(true)}
            onTouchStart={handleMiniTouchStart}
            onTouchMove={handleMiniTouchMove}
            onTouchEnd={handleMiniTouchEnd}
          >
            <div 
              className="absolute left-0 top-0 bottom-0 bg-[var(--accent-primary)]/5 pointer-events-none z-0 transition-all duration-300" 
              style={{ width: `${progressPercent}%` }} 
            />

            <div className="relative z-10 w-12 h-12 sm:w-16 sm:h-16 mr-3 shrink-0 bg-gray-200 dark:bg-black rounded-lg sm:rounded-xl shadow-sm overflow-hidden group">
              <Image 
                key={`${currentSong.id}-mini-${thumbError}`}
                src={thumbError 
                  ? YouTubeExtractionService.getFallbackThumbnail(currentSong.id)
                  : YouTubeExtractionService.normalizeUrl(currentSong.thumbnailUrl, currentSong.id)
                } 
                alt={currentSong.title} 
                fill 
                sizes="(min-width: 640px) 64px, 48px" 
                className="object-cover group-hover:scale-110 transition-transform"
                onError={() => setThumbError(true)}
              />
            </div>
            <div className="relative z-10 flex-1 min-w-0 mr-4 sm:max-w-xs">
              <h4 className="text-black dark:text-white font-bold text-sm sm:text-base overflow-hidden">
                <MarqueeText text={currentSong.title} />
              </h4>
              <p className="text-gray-500 dark:text-gray-400 text-xs sm:text-sm truncate font-medium">{currentSong.artistName}</p>
            </div>
            
            <div className="hidden sm:flex flex-1 flex-col justify-center items-center gap-2 max-w-2xl mx-auto px-4" onClick={(e) => e.stopPropagation()}>
               <div className="flex items-center gap-8">
                 <button onClick={playPrevious} className="text-gray-400 hover:text-[var(--accent-primary)] transition-all active:scale-90"><SkipBack size={22} fill="currentColor" /></button>
                 <button 
                    onClick={togglePlayPause}
                    className="w-11 h-11 bg-black dark:bg-white rounded-full flex items-center justify-center text-white dark:text-black hover:scale-110 active:scale-90 transition-all shadow-lg"
                 >
                    {isBuffering
                      ? <Loader2 size={20} className="animate-spin" />
                      : isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
                 </button>
                 <button onClick={() => playNext()} className="text-gray-400 hover:text-[var(--accent-primary)] transition-all active:scale-90"><SkipForward size={22} fill="currentColor" /></button>
               </div>
               
               <div className="w-full flex items-center gap-3 text-[11px] text-gray-400 font-bold tracking-tighter group">
                 <span className="w-10 text-right">{formatTime(progress)}</span>
                 <div className="relative flex-1 h-1.5 bg-black/5 dark:bg-white/10 rounded-full flex items-center group-hover:h-2 transition-all cursor-pointer">
                   <input
                     type="range"
                     min="0"
                     max={duration || 100}
                     value={progress || 0}
                     onChange={(e) => seekTo(Number(e.target.value))}
                     className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                   />
                   <div className="h-full bg-[var(--accent-primary)] rounded-full transition-all pointer-events-none shadow-[0_0_10px_rgba(124,58,237,0.3)]" style={{ width: `${progressPercent}%` }} />
                 </div>
                 <span className="w-10">{formatTime(duration)}</span>
               </div>
            </div>

             <div className="hidden sm:flex items-center gap-4 min-w-[240px] justify-end" onClick={(e) => e.stopPropagation()}>
                <div className="hidden lg:flex items-center gap-4 bg-black/2 dark:bg-white/3 border border-black/5 dark:border-white/5 p-3 rounded-2xl">
                  <VolumeControl />
                </div>
                <button onClick={handleToggleFavorite} className="p-3 bg-black/5 dark:bg-white/5 hover:bg-[var(--accent-primary)]/10 rounded-xl transition-all group">
                    <Heart size={20} fill={isFavorite ? "var(--accent-primary)" : "none"} className={isFavorite ? "text-[var(--accent-primary)]" : "text-gray-400 group-hover:text-black dark:group-hover:text-white"} />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); toggleDownload(currentSong); }}
                  disabled={isDownloading}
                  className={`p-3 rounded-xl transition-all group ${
                    isDownloaded 
                      ? 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]' 
                      : isDownloading 
                        ? 'bg-black/5 dark:bg-white/5 text-gray-400'
                        : 'bg-black/5 dark:bg-white/5 hover:bg-[var(--accent-primary)]/10 text-gray-400 group-hover:text-black dark:group-hover:text-white'
                  }`}
                >
                  {isDownloading ? <Loader2 size={20} className="animate-spin" /> : isDownloaded ? <Check size={20} /> : <Download size={20} />}
                </button>
             </div>
             
            <button 
              onClick={(e) => { e.stopPropagation(); togglePlayPause(); }}
              className="relative z-10 sm:hidden w-11 h-11 flex items-center justify-center text-black dark:text-white bg-black/5 dark:bg-white/5 rounded-full"
            >
              {isBuffering
                ? <Loader2 size={24} className="animate-spin" />
                : isPlaying ? <Pause fill="currentColor" size={24} /> : <Play fill="currentColor" size={24} className="ml-1" />}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isNowPlayingOpen && (
          <motion.div 
            initial={{ y: '100%' }}
            animate={{ y: '0%' }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-100 bg-black flex justify-center overflow-hidden"
          >
            {/* Fondo Inmersivo: Imagen Completa Sharp/Blur */}
            <AnimatePresence mode="wait">
              <motion.div
                key={currentSong.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1 }}
                className="absolute inset-0 z-0 overflow-hidden"
              >
                <div className="absolute inset-0 bg-black z-0" />
                <motion.div
                  animate={{ 
                    filter: showLyrics ? 'blur(10px) brightness(0.4)' : 'blur(0px) brightness(0.6)',
                    scale: showLyrics ? 1.05 : 1
                  }}
                  className="absolute inset-0 transition-all duration-1000"
                >
                  <Image 
                    key={`${currentSong.id}-full-${thumbError}`}
                    src={thumbError 
                      ? YouTubeExtractionService.normalizeUrl(currentSong.thumbnailUrl, currentSong.id)
                      : YouTubeExtractionService.getHighResThumbnail(currentSong.id)
                    }
                    alt="" 
                    fill 
                    className="object-cover object-center"
                    priority
                    onLoad={(e) => {
                      const img = e.target as HTMLImageElement;
                      // YouTube returns a 120x90 placeholder if maxres doesn't exist.
                      // Anything under 400px wide is likely not the high-res artwork we want.
                      if (!thumbError && img.naturalWidth > 0 && img.naturalWidth < 400) {
                        console.log('[PlayerOverlay] Detected small YouTube placeholder, falling back...');
                        setThumbError(true);
                      }
                    }}
                    onError={() => {
                      console.log('[PlayerOverlay] Image load error, falling back...');
                      setThumbError(true);
                    }}
                  />
                </motion.div>
                {/* Degradados de legibilidad: Muy suaves */}
                <div className="absolute inset-0 bg-linear-to-b from-black/30 via-transparent to-black/60 z-10" />
              </motion.div>
            </AnimatePresence>

            {/* Contenido UI */}
            <div className="w-full h-full flex flex-col relative z-20">
              
              {/* Header: Totalmente transparente */}
                <div className="flex items-center justify-between p-6 px-8 pt-safe">
                  <button onClick={() => setIsNowPlayingOpen(false)} className="p-2 -ml-2 text-white/70 hover:text-white transition-colors"><ChevronDown size={32} /></button>
                  <div className="flex flex-col items-center">
                    <span className="text-[10px] font-black tracking-[0.4em] text-white/90 uppercase drop-shadow-lg">Reproduciendo</span>
                    {isDebugMode && (
                      <span className="text-[8px] font-mono text-[var(--accent-primary)] mt-1 bg-black/40 px-2 py-0.5 rounded-full">DEBUG ON • {currentSong.id}</span>
                    )}
                  </div>
                  <button onClick={() => setShowTimerModal(true)} className={`p-2 rounded-xl transition-all ${isShutdownTimerActive ? 'bg-[var(--accent-primary)]/40 text-white' : 'text-white/70 hover:text-white'}`}>
                    <Timer size={24} />
                  </button>
                </div>

                {isDebugMode && (
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="absolute top-24 left-6 z-[100] p-4 bg-black/60 backdrop-blur-3xl rounded-3xl border border-white/10 text-[10px] font-mono text-white/80 space-y-2 pointer-events-none"
                  >
                    <p className="font-black text-[var(--accent-primary)]">SISTEMA INFO</p>
                    <p>ID: {currentSong.id}</p>
                    <p>TYPE: {isDownloaded ? 'OFFLINE' : 'STREAM'}</p>
                    <p>STATE: {isPlaying ? 'PLAYING' : 'PAUSED'}</p>
                    <p>SOURCE: <span className="text-white font-black">{audioSource?.toUpperCase() || 'UNKNOWN'}</span></p>
                    <p>PROGRESS: {Math.floor(progress)}s / {Math.floor(duration)}s</p>
                    <div className="max-w-[200px] overflow-hidden">
                       <p className="truncate">URL: {audioEngine.currentUrl || 'NONE'}</p>
                    </div>
                    <div className="flex gap-2 mt-2">
                       <button className="px-2 py-1 bg-white/10 rounded-md pointer-events-auto" onClick={inspectLocalBlob}>BLOB HEX</button>
                       <button className="px-2 py-1 bg-white/10 rounded-md pointer-events-auto" onClick={loadFormats}>FORMATS</button>
                    </div>
                  </motion.div>
                )}

              <div className="flex-1 flex flex-col px-4 md:px-0 py-2 sm:py-6 overflow-hidden relative">
                
                {/* Contenido Central: Letras o Espacio para Fondo Sharp */}
                <div className="flex-1 flex flex-col w-full h-full min-h-0 relative z-20">
                    <AnimatePresence mode="wait">
                      {showLyrics ? (
                        <motion.div key="lyrics" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="absolute inset-0 z-30 pt-4">
                          <LyricsPanel />
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                </div>

                {/* Panel de Controles Multifila Estilo RiMusic */}
                <motion.div 
                  className={`w-full max-w-2xl mx-auto flex flex-col px-8 mt-auto pb-safe transition-all duration-500 ${showLyrics ? 'gap-4 pb-4 sm:pb-6' : 'gap-6 sm:gap-8 pb-10 sm:pb-16'}`}
                >
                  
                  {/* Fila 1: Metadatos y Acciones Básicas */}
                  <div className="flex items-end justify-between gap-4">
                    <div className="flex-1 min-w-0 pr-2">
                      <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tighter leading-tight drop-shadow-2xl">
                        <MarqueeText text={currentSong.title} />
                      </h2>
                      <p className="text-lg sm:text-2xl text-[var(--accent-primary)] font-bold truncate mt-1 drop-shadow-md brightness-150">{currentSong.artistName}</p>
                    </div>
                    <div className="flex items-center shrink-0">
                      <button onClick={handleToggleFavorite} className="p-2 transition-all active:scale-90"><Heart size={28} fill={isFavorite ? "var(--accent-primary)" : "none"} className={isFavorite ? "text-[var(--accent-primary)] drop-shadow-md" : "text-white/70 hover:text-white"} /></button>
                    </div>
                  </div>

                  {/* Fila 2: Barra de Progreso */}
                  <div className="relative group/progress">
                    <input
                      type="range" min="0" max={duration || 100} value={progress || 0}
                      onChange={(e) => seekTo(Number(e.target.value))}
                      className="absolute inset-x-0 w-full h-10 -top-4 opacity-0 cursor-pointer z-50"
                    />
                    <div className="h-2.5 w-full bg-white/10 rounded-full overflow-hidden relative pointer-events-none backdrop-blur-sm">
                      <div className="h-full bg-[var(--accent-primary)] rounded-full absolute top-0 left-0 shadow-[0_0_20px_var(--accent-primary)]" style={{ width: `${progressPercent}%` }} />
                    </div>
                    <div className="flex justify-between text-[11px] text-white/40 mt-3 font-bold uppercase tracking-widest ">
                      <span>{formatTime(progress)}</span>
                      <span>{formatTime(duration)}</span>
                    </div>
                  </div>

                  {/* Fila 3: Controles Principales Hero */}
                  <div className="flex items-center justify-center py-1">
                    <div className="flex items-center gap-8 sm:gap-14">
                      <button onClick={playPrevious} className="text-white hover:text-[var(--accent-primary)] transition-all transform active:scale-75"><SkipBack size={44} fill="currentColor" /></button>
                      <button onClick={togglePlayPause} className={`bg-white text-black rounded-full flex items-center justify-center shadow-2xl hover:scale-105 active:scale-90 transition-all ${showLyrics ? 'w-20 h-20' : 'w-24 h-24 sm:w-28 sm:h-28'}`}>
                        {isBuffering 
                          ? <Loader2 size={36} className="animate-spin" />
                          : isPlaying ? <Pause size={showLyrics ? 32 : 40} fill="currentColor" /> : <Play size={showLyrics ? 32 : 40} fill="currentColor" className="ml-1.5" />
                        }
                      </button>
                      <button onClick={() => playNext()} className="text-white hover:text-[var(--accent-primary)] transition-all transform active:scale-75"><SkipForward size={44} fill="currentColor" /></button>
                    </div>
                  </div>

                  {/* Fila 4: Utilidades (Shuffle, Add, Mic, Queue, Download, Repeat) */}
                  <div className="flex items-center justify-between pt-1 w-full px-1">
                     <button onClick={toggleShuffle} className={`transition-all hover:scale-110 p-2 ${isShuffle ? 'text-[var(--accent-primary)] drop-shadow-md' : 'text-white/50 hover:text-white'}`}><Shuffle size={22} /></button>
                     
                     <button onClick={() => setIsPlaylistModalOpen(true)} className="p-2 transition-all hover:scale-110 text-white/50 hover:text-white">
                        <Plus size={24} />
                     </button>

                     <button onClick={() => setShowLyrics(!showLyrics)} className={`transition-all hover:scale-110 p-2 ${showLyrics ? 'text-[var(--accent-primary)] drop-shadow-md' : 'text-white/50 hover:text-white'}`}>
                       <Mic2 size={24} />
                     </button>

                     <button onClick={() => setShowQueue(!showQueue)} className={`transition-all hover:scale-110 p-2 ${showQueue ? 'text-[var(--accent-primary)] drop-shadow-md' : 'text-white/50 hover:text-white'}`}>
                       <ListMusic size={24} />
                     </button>

                     <VolumeControl isVertical={true} />

                     <button 
                         onClick={(e) => { e.stopPropagation(); toggleDownload(currentSong); }}
                         disabled={isDownloading}
                         className={`p-2 transition-all hover:scale-110 ${isDownloaded ? 'text-[var(--accent-primary)] drop-shadow-md' : 'text-white/50 hover:text-white'}`}
                      >
                         {isDownloading ? <Loader2 size={24} className="animate-spin" /> : isDownloaded ? <Check size={24} /> : <Download size={24} />}
                     </button>

                     <button onClick={toggleRepeatMode} className={`transition-all hover:scale-110 p-2 ${repeatMode !== 'off' ? 'text-[var(--accent-primary)] drop-shadow-md' : 'text-white/50 hover:text-white'}`}>
                       {repeatMode === 'one' ? <Repeat1 size={22} /> : <Repeat size={22} />}
                     </button>
                  </div>
                </motion.div>

                <AnimatePresence>
                  {showQueue && (
                    <motion.div initial={{ y: 300, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 300, opacity: 0 }} className="absolute bottom-0 inset-x-0 z-[100] h-3/4 bg-black/80 backdrop-blur-3xl rounded-t-[50px] border-t border-white/10 shadow-2xl overflow-hidden flex flex-col p-8 sm:p-12">
                      <div className="flex justify-between items-center mb-10 shrink-0">
                        <h3 className="font-black text-3xl text-white flex items-center gap-5 tracking-tighter"><ListMusic className="text-[var(--accent-primary)]" size={32} /> Siguiente Mezcla</h3>
                        <button onClick={() => setShowQueue(false)} className="p-4 bg-white/5 rounded-2xl text-white/40 hover:text-red-500 transition-all"><X size={24} /></button>
                      </div>
                      <div className="flex-1 overflow-y-auto space-y-4 pr-3 custom-scrollbar pb-safe">
                        {queue.map((song, idx) => (
                           <div key={`${song.id}-${idx}`} className={`group flex items-center justify-between p-5 rounded-[25px] transition-all cursor-pointer border ${currentSong.id === song.id ? 'bg-[var(--accent-primary)]/20 border-[var(--accent-primary)]/40 shadow-[0_10px_30px_var(--accent-primary)]/20' : 'bg-white/2 border-white/5 hover:bg-white/10 hover:border-white/20'}`} onClick={() => playFromQueue(idx)}>
                             <div className="flex items-center min-w-0 pr-4">
                               <div className="relative w-14 h-14 mr-5 shrink-0 rounded-2xl overflow-hidden shadow-xl">
                                 <Image src={YouTubeExtractionService.normalizeUrl(song.thumbnailUrl, song.id)} alt={song.title} fill sizes="56px" className="object-cover" />
                               </div>
                               <div className="min-w-0">
                                 <h4 className={`text-base font-bold truncate ${currentSong.id === song.id ? 'text-[var(--accent-primary)]' : 'text-white'}`}>{song.title}</h4>
                                 <p className="text-white/40 text-sm font-semibold truncate mt-1">{song.artistName}</p>
                               </div>
                             </div>
                             {currentSong.id !== song.id && (
                               <button className="text-white/20 hover:text-red-500 p-2 opacity-0 group-hover:opacity-100 transition-all" onClick={(e) => { e.stopPropagation(); removeFromQueue(idx); }}><X size={20} /></button>
                             )}
                           </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>



              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showFormats && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowFormats(false)}
          >
            <div className="bg-white dark:bg-[#181818] p-6 rounded-3xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold dark:text-white">Explorador de Formatos</h3>
                <button onClick={() => setShowFormats(false)}><X size={24} className="dark:text-white/50" /></button>
              </div>
              
              {loadingFormats ? (
                <div className="flex-1 flex items-center justify-center min-h-[200px]"><Loader2 className="animate-spin text-[var(--accent-primary)]" size={36} /></div>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar pb-safe">
                  {formats.map((f, i) => (
                    <button 
                      key={i} 
                      onClick={() => {
                         if ((audioEngine as any)?.htmlPlayer) {
                           (audioEngine as any).htmlPlayer.src = f.url;
                           (audioEngine as any).htmlPlayer.play();
                           setShowFormats(false);
                         }
                      }}
                      className="w-full text-left p-4 rounded-2xl bg-black/5 dark:bg-white/5 hover:bg-[var(--accent-primary)]/20 transition-all group border border-black/5 dark:border-white/5"
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-black text-lg text-[var(--accent-primary)]">{f.format_id}</span>
                        <span className="text-sm font-bold bg-black/10 dark:bg-white/10 px-2 py-0.5 rounded-md text-black/60 dark:text-white/60">{f.ext}</span>
                      </div>
                      <div className="text-xs text-black/60 dark:text-white/60 space-y-1 font-mono">
                        <p>VCODEC: <strong className={f.vcodec !== 'none' ? 'text-red-500' : 'text-green-500'}>{f.vcodec}</strong></p>
                        <p>ACODEC: <strong>{f.acodec}</strong></p>
                        <p>SIZE: <strong>{f.filesize ? (f.filesize / 1024 / 1024).toFixed(2) + ' MB' : 'DASH'}</strong></p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AddToPlaylistModal 
        isOpen={isPlaylistModalOpen} 
        onClose={() => setIsPlaylistModalOpen(false)} 
        song={currentSong} 
      />

      <AnimatePresence>
        {showTimerModal && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowTimerModal(false)}
          >
            <div className="bg-white dark:bg-[#181818] p-6 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold dark:text-white flex items-center gap-2">
                  <Timer className="text-[var(--accent-primary)]" size={24} />
                  Temporizador
                </h3>
                <button onClick={() => setShowTimerModal(false)}><X size={24} className="dark:text-white/50" /></button>
              </div>

              {isShutdownTimerActive && timerRemaining !== null && (
                <div className="mb-6 p-4 bg-[var(--accent-primary)]/10 rounded-2xl text-center">
                  <p className="text-xs font-bold uppercase text-[var(--accent-primary)] mb-1">Apagando en</p>
                  <p className="text-3xl font-black text-[var(--accent-primary)]">
                    {Math.floor(timerRemaining / 60000)}:{String(Math.floor((timerRemaining % 60000) / 1000)).padStart(2, '0')}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                {[5, 15, 30, 60].map((mins) => (
                  <button
                    key={mins}
                    onClick={() => {
                      startShutdownTimer(mins * 60 * 1000);
                      setShowTimerModal(false);
                    }}
                    className="w-full text-left p-4 rounded-2xl bg-black/5 dark:bg-white/5 hover:bg-[#7C3AED]/20 transition-all font-bold text-black dark:text-white flex justify-between items-center"
                  >
                    <span>{mins} minuto{mins > 1 ? 's' : ''}</span>
                    {isShutdownTimerActive && shutdownTimerEndsAt && Math.ceil((shutdownTimerEndsAt - Date.now()) / 60000) === mins && (
                      <span className="text-[#7C3AED]">●</span>
                    )}
                  </button>
                ))}

                {isShutdownTimerActive && (
                  <button
                    onClick={() => {
                      cancelShutdownTimer();
                      setShowTimerModal(false);
                    }}
                    className="w-full text-left p-4 rounded-2xl bg-red-500/10 hover:bg-red-500/20 transition-all font-bold text-red-500"
                  >
                    Cancelar temporizador
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
