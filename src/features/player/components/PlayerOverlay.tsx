'use client';

import React, { useState, useEffect } from 'react';
import { usePlayerStore } from '../store/playerStore';
import { audioEngine } from '../services/audioEngine';
import { 
  Play, Pause, SkipForward, SkipBack, Shuffle, Heart, 
  ChevronDown, ListMusic, Repeat, Repeat1, Plus, X, Mic2,
  Download, Check, Loader2
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
    syncState
  } = usePlayerStore();

  const { isDebugMode } = useSettingsStore();

  const [showQueue, setShowQueue] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      syncState();
    }, 500);

    return () => clearInterval(interval);
  }, [syncState]);

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

  const loadFormats = async () => {
    if (!currentSong) return;
    setLoadingFormats(true);
    setShowFormats(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://192.168.1.195:5000";
      const { CapacitorHttp } = await import('@capacitor/core');
      const res = await CapacitorHttp.get({
        url: `${apiUrl}/formats`,
        params: { id: currentSong.id }
      });
      if (res.status === 200 && res.data.formats) {
        setFormats(res.data.formats);
      }
    } catch (e) {
      console.error(e);
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
              className="absolute left-0 top-0 bottom-0 bg-[#7C3AED]/5 pointer-events-none z-0 transition-all duration-300" 
              style={{ width: `${progressPercent}%` }} 
            />

            <div className="relative z-10 w-12 h-12 sm:w-16 sm:h-16 mr-3 shrink-0 bg-gray-200 dark:bg-black rounded-lg sm:rounded-xl shadow-sm overflow-hidden group">
              <Image 
                src={YouTubeExtractionService.normalizeUrl(currentSong.thumbnailUrl)} 
                alt={currentSong.title} 
                fill 
                sizes="(min-width: 640px) 64px, 48px" 
                className="object-cover group-hover:scale-110 transition-transform" 
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
                 <button onClick={playPrevious} className="text-gray-400 hover:text-[#7C3AED] transition-all active:scale-90"><SkipBack size={22} fill="currentColor" /></button>
                 <button 
                    onClick={togglePlayPause}
                    className="w-11 h-11 bg-black dark:bg-white rounded-full flex items-center justify-center text-white dark:text-black hover:scale-110 active:scale-90 transition-all shadow-lg"
                 >
                    {isBuffering
                      ? <Loader2 size={20} className="animate-spin" />
                      : isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
                 </button>
                 <button onClick={() => playNext()} className="text-gray-400 hover:text-[#7C3AED] transition-all active:scale-90"><SkipForward size={22} fill="currentColor" /></button>
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
                   <div className="h-full bg-[#7C3AED] rounded-full transition-all pointer-events-none shadow-[0_0_10px_rgba(124,58,237,0.3)]" style={{ width: `${progressPercent}%` }} />
                 </div>
                 <span className="w-10">{formatTime(duration)}</span>
               </div>
            </div>

             <div className="hidden sm:flex items-center gap-4 min-w-[240px] justify-end" onClick={(e) => e.stopPropagation()}>
                <div className="hidden lg:flex items-center gap-4 bg-black/2 dark:bg-white/3 border border-black/5 dark:border-white/5 p-3 rounded-2xl">
                  <VolumeControl />
                </div>
                <button onClick={handleToggleFavorite} className="p-3 bg-black/5 dark:bg-white/5 hover:bg-[#7C3AED]/10 rounded-xl transition-all group">
                    <Heart size={20} fill={isFavorite ? "#7C3AED" : "none"} className={isFavorite ? "text-[#7C3AED]" : "text-gray-400 group-hover:text-black dark:group-hover:text-white"} />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); toggleDownload(currentSong); }}
                  disabled={isDownloading}
                  className={`p-3 rounded-xl transition-all group ${
                    isDownloaded 
                      ? 'bg-[#7C3AED]/10 text-[#7C3AED]' 
                      : isDownloading 
                        ? 'bg-black/5 dark:bg-white/5 text-gray-400'
                        : 'bg-black/5 dark:bg-white/5 hover:bg-[#7C3AED]/10 text-gray-400 group-hover:text-black dark:group-hover:text-white'
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
            className="fixed inset-0 z-100 bg-white dark:bg-[#0A0A0A] sm:bg-white/95 sm:dark:bg-[#0A0A0A]/95 sm:backdrop-blur-3xl flex justify-center overflow-hidden transition-colors duration-500"
          >
            <div className="w-full h-full flex flex-col xl:max-w-7xl xl:px-8">
              <div className="flex items-center justify-between p-4 pb-0 pt-6">
                <button onClick={() => setIsNowPlayingOpen(false)} className="p-2 -ml-2 text-black/40 dark:text-white/70 hover:text-black dark:hover:text-white transition-colors"><ChevronDown size={32} /></button>
                <span className="text-[10px] font-black tracking-[0.3em] text-[#7C3AED] uppercase">Ahora Suena</span>
                <div className="w-10" />
              </div>

              <div className="flex-1 flex flex-col md:flex-row gap-6 md:gap-16 px-4 md:px-0 py-2 sm:py-6 overflow-hidden items-center md:items-start relative">
                
                <div className="flex-1 flex flex-col w-full max-w-[400px] md:max-w-none md:justify-center h-full min-h-0">
                  <div className={`w-full ${showLyrics || (showQueue) ? 'h-full flex-1' : 'aspect-square max-w-[500px] mx-auto'} bg-gradient-to-br from-[#7C3AED] to-black/20 dark:to-black rounded-3xl relative shadow-2xl overflow-hidden mb-4 sm:mb-8 group flex items-center justify-center border border-black/5 dark:border-white/5 transition-all duration-300`}>
                    <AnimatePresence mode="wait">
                      {showQueue ? (
                        <motion.div key="queue-central" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20">
                          <div className="md:hidden h-full w-full bg-white dark:bg-[#0A0A0A] p-6 flex flex-col">
                            <div className="flex justify-between items-center mb-6 shrink-0">
                              <h3 className="font-black text-xl text-black dark:text-white flex items-center gap-3 tracking-tighter"><ListMusic className="text-[#7C3AED]" size={24} /> Siguiente</h3>
                              <button onClick={() => setShowQueue(false)} className="p-2 bg-black/5 dark:bg-white/5 rounded-xl text-black/40 dark:text-white/50 hover:text-red-500 transition-colors"><X size={18} /></button>
                            </div>
                            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar pb-safe">
                              {queue.map((song, idx) => (
                                <div key={`${song.id}-${idx}`} className={`flex items-center justify-between p-3 rounded-xl transition-all ${currentSong.id === song.id ? 'bg-[#7C3AED]/10' : 'bg-black/2 dark:bg-white/2 hover:bg-black/5 dark:hover:bg-white/5'}`} onClick={() => playFromQueue(idx)}>
                                  <div className="flex items-center min-w-0">
                                    <div className="relative w-10 h-10 mr-3 shrink-0 bg-gray-200 dark:bg-black rounded-lg overflow-hidden shadow-sm">
                                      <Image src={YouTubeExtractionService.normalizeUrl(song.thumbnailUrl)} alt={song.title} fill sizes="40px" className="object-cover" />
                                    </div>
                                    <div className="min-w-0">
                                      <h4 className={`text-[11px] font-bold truncate ${currentSong.id === song.id ? 'text-[#7C3AED]' : 'text-black dark:text-white'}`}>{song.title}</h4>
                                      <p className="text-black/40 dark:text-white/40 text-[9px] truncate font-bold">{song.artistName}</p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="hidden md:block h-full w-full relative">
                            {showLyrics ? (
                              <LyricsPanel />
                            ) : (
                              <>
                                <Image 
                                  src={YouTubeExtractionService.normalizeUrl(currentSong.thumbnailUrl)} 
                                  alt={currentSong.title} 
                                  fill 
                                  sizes="(min-width: 768px) 500px, 100vw" 
                                  className="object-cover opacity-90 transition-transform duration-700 group-hover:scale-110" 
                                />
                                <div className="absolute inset-0 bg-linear-to-t from-black/20 to-transparent" />
                              </>
                            )}
                          </div>
                        </motion.div>
                      ) : showLyrics ? (
                        <motion.div key="lyrics" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-10 bg-white/40 dark:bg-black/40 backdrop-blur-md">
                          <LyricsPanel />
                        </motion.div>
                      ) : (
                        <motion.div key="art" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0">
                          <Image src={YouTubeExtractionService.normalizeUrl(currentSong.thumbnailUrl)} alt={currentSong.title} fill sizes="(min-width: 768px) 500px, 100vw" className="object-cover opacity-90 transition-transform duration-700 group-hover:scale-110" />
                          <div className="absolute inset-0 bg-linear-to-t from-black/20 to-transparent" />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="hidden md:block w-full max-w-2xl mx-auto">
                    <div className="flex justify-between items-center mb-6">
                      <div className="flex-1 min-w-0 pr-4">
                        <h2 className="text-3xl lg:text-4xl font-black text-black dark:text-white overflow-hidden tracking-tight">
                          <MarqueeText text={currentSong.title} />
                        </h2>
                        <p className="text-lg lg:text-xl text-black/50 dark:text-white/50 font-bold truncate mt-1">{currentSong.artistName}</p>
                      </div>
                      <div className="flex gap-4">
                        <button onClick={handleToggleFavorite} className="p-3 rounded-2xl bg-black/5 dark:bg-white/5 hover:bg-[#7C3AED]/10 transition-all"><Heart size={28} fill={isFavorite ? "#7C3AED" : "none"} className={isFavorite ? "text-[#7C3AED]" : "text-black/40 dark:text-white/40"} /></button>
                        <button onClick={() => setIsPlaylistModalOpen(true)} className="p-3 rounded-2xl bg-black/5 dark:bg-white/5 hover:bg-[#7C3AED]/10 text-black/40 dark:text-white/40 transition-all"><Plus size={28} /></button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); toggleDownload(currentSong); }}
                          disabled={isDownloading}
                          className={`p-3 rounded-2xl transition-all ${
                            isDownloaded 
                              ? 'bg-[#7C3AED]/10 text-[#7C3AED]' 
                              : isDownloading 
                                ? 'bg-black/5 dark:bg-white/5 text-gray-400'
                                : 'bg-black/5 dark:bg-white/5 hover:bg-[#7C3AED]/10 text-black/40 dark:text-white/40'
                          }`}
                        >
                          {isDownloading ? <Loader2 size={28} className="animate-spin" /> : isDownloaded ? <Check size={28} /> : <Download size={28} />}
                        </button>
                      </div>
                    </div>

                    <div className="mb-8 relative group/progress">
                      <input
                        type="range" min="0" max={duration || 100} value={progress || 0}
                        onChange={(e) => seekTo(Number(e.target.value))}
                        className="absolute inset-0 w-full h-4 -top-1.5 opacity-0 cursor-pointer z-10"
                      />
                      <div className="h-2 w-full bg-black/5 dark:bg-white/10 rounded-full overflow-hidden relative pointer-events-none transition-all">
                        <div className="h-full bg-[#7C3AED] rounded-full absolute top-0 left-0 shadow-[0_0_15px_rgba(124,58,237,0.5)]" style={{ width: `${progressPercent}%` }} />
                      </div>
                      <div className="flex justify-between text-[11px] text-black/30 dark:text-white/40 mt-4 font-black uppercase tracking-widest">
                        <span>{formatTime(progress)}</span>
                        <span>{formatTime(duration)}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-4">
                      <div className="w-1/4 flex justify-start"><VolumeControl /></div>
                      <div className="flex items-center gap-10">
                        <button onClick={toggleShuffle} className={`transition-all hover:scale-110 ${isShuffle ? 'text-[#7C3AED]' : 'text-black/20 dark:text-white/40 hover:text-black dark:hover:text-white'}`}><Shuffle size={24} /></button>
                        <button onClick={playPrevious} className="text-black dark:text-white hover:text-[#7C3AED] transition-all"><SkipBack size={36} fill="currentColor" /></button>
                        <button onClick={togglePlayPause} className="w-20 h-20 bg-black dark:bg-white text-white dark:text-black rounded-full flex items-center justify-center shadow-2xl hover:scale-110 active:scale-90 transition-all">
                          {isBuffering 
                            ? <Loader2 size={32} className="animate-spin" />
                            : isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />
                          }
                        </button>
                        <button onClick={() => playNext()} className="text-black dark:text-white hover:text-[#7C3AED] transition-all"><SkipForward size={36} fill="currentColor" /></button>
                        <button onClick={toggleRepeatMode} className={`transition-all hover:scale-110 ${repeatMode !== 'off' ? 'text-[#7C3AED]' : 'text-black/20 dark:text-white/40 hover:text-black dark:hover:text-white'}`}>
                          {repeatMode === 'one' ? <Repeat1 size={24} /> : <Repeat size={24} />}
                        </button>
                      </div>
                      <div className="w-1/4 flex justify-end items-center gap-3">
                        <button onClick={() => setShowLyrics(!showLyrics)} className={`p-3 rounded-2xl transition-all ${showLyrics ? 'bg-[#7C3AED]/20 text-[#7C3AED]' : 'bg-black/5 dark:bg-white/5 text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white'}`}><Mic2 size={24} /></button>
                        <button onClick={() => setShowQueue(!showQueue)} className={`p-3 rounded-2xl transition-all ${showQueue ? 'bg-[#7C3AED]/20 text-[#7C3AED]' : 'bg-black/5 dark:bg-white/5 text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white'}`}><ListMusic size={24} /></button>
                      </div>
                    </div>
                  </div>
                </div>

                <AnimatePresence>
                  {showQueue && (
                    <motion.div initial={{ x: 300, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 300, opacity: 0 }} className="hidden md:flex relative w-1/3 min-w-[380px] bg-black/[0.02] dark:bg-white/[0.03] backdrop-blur-xl rounded-[40px] p-8 border border-black/5 dark:border-white/5 flex-col h-full overflow-hidden shadow-2xl">
                      <div className="flex justify-between items-center mb-8 shrink-0">
                        <h3 className="font-black text-2xl text-black dark:text-white flex items-center gap-4 tracking-tighter"><ListMusic className="text-[#7C3AED]" size={28} /> Siguiente</h3>
                        <button onClick={() => setShowQueue(false)} className="p-3 bg-black/5 dark:bg-white/5 rounded-2xl text-black/40 dark:text-white/50 hover:text-red-500 transition-all"><X size={20} /></button>
                      </div>
                      <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                        {queue.map((song, idx) => (
                          <div key={`${song.id}-${idx}`} className={`group flex items-center justify-between p-4 rounded-2xl transition-all cursor-pointer border ${currentSong.id === song.id ? 'bg-[#7C3AED]/10 border-[#7C3AED]/20' : 'bg-transparent border-transparent hover:bg-black/5 dark:hover:bg-white/5 hover:border-black/5 dark:hover:border-white/5'}`} onClick={() => playFromQueue(idx)}>
                            <div className="flex items-center min-w-0 pr-2">
                               <div className="relative w-12 h-12 mr-4 shrink-0 bg-gray-200 dark:bg-black rounded-xl overflow-hidden shadow-sm">
                                 <Image 
                                   src={YouTubeExtractionService.normalizeUrl(song.thumbnailUrl)} 
                                   alt={song.title} 
                                   fill 
                                   sizes="48px" 
                                   className="object-cover" 
                                 />
                               </div>
                               <div className="min-w-0">
                                 <h4 className={`text-sm font-bold overflow-hidden ${currentSong.id === song.id ? 'text-[#7C3AED]' : 'text-black dark:text-white'}`}>
                                   <MarqueeText text={song.title} />
                                 </h4>
                                 <p className="text-black/40 dark:text-white/40 text-xs font-semibold truncate mt-0.5">{song.artistName}</p>
                               </div>
                            </div>
                            <button className="text-black/20 dark:text-white/20 hover:text-red-500 p-2 opacity-0 group-hover:opacity-100 transition-all" onClick={(e) => { e.stopPropagation(); if(currentSong.id !== song.id) removeFromQueue(idx); }}><X size={18} /></button>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="md:hidden w-full flex flex-col mt-auto gap-3 sm:gap-8 mb-4">
                  <div className="flex justify-between items-center px-2">
                    <div className="flex-1 min-w-0 pr-6">
                      <h2 className="text-2xl font-black text-black dark:text-white overflow-hidden tracking-tight">
                        <MarqueeText text={currentSong.title} />
                      </h2>
                      <p className="text-lg text-black/40 dark:text-white/50 font-bold truncate">{currentSong.artistName}</p>
                        {isDebugMode && (
                          <p className="text-xs text-red-500 font-mono mt-2 bg-black/10 dark:bg-white/10 p-2 rounded-lg break-all">
                            ENGINE: {typeof window !== 'undefined' && (audioEngine as any).isNativeEngine?.() ? 'ExoPlayer (Android)' : 'HTMLAudio (Web)'}<br/>
                            {typeof window !== 'undefined' && (audioEngine as any).isNativeEngine?.() ? (
                              <>
                            SOURCE: {(audioEngine as any).currentUrlSource?.toUpperCase()}<br/>
                            EXO TIME: {(audioEngine as any).exoCurrentTime?.toFixed(1)}s / {(audioEngine as any).exoDuration?.toFixed(1)}s<br/>
                            EXO PLAYING: {String((audioEngine as any).exoPlaying)}
                              </>
                            ) : (
                              <>
                                SRC: {(audioEngine as any).htmlPlayer?.src?.substring(0, 50) ?? 'undefined'}<br/>
                                PAUSED: {String((audioEngine as any).htmlPlayer?.paused)}
                              </>
                            )}
                          <div className="flex gap-2">
                            <button onClick={(e) => { e.stopPropagation(); loadFormats(); }} className="mt-1.5 flex-1 bg-[#7C3AED] text-white py-1.5 rounded text-[10px] font-bold uppercase">🔎 Web</button>
                            <button onClick={(e) => { e.stopPropagation(); inspectLocalBlob(); }} className="mt-1.5 flex-1 bg-red-500 text-white py-1.5 rounded text-[10px] font-bold uppercase">🔬 Local</button>
                          </div>
                          </p>
                        )}
                    </div>
                    <div className="flex gap-4">
                      <button onClick={handleToggleFavorite} className="p-2"><Heart size={28} fill={isFavorite ? "#7C3AED" : "none"} className={isFavorite ? "text-[#7C3AED]" : "text-black/40 dark:text-white/40"} /></button>
                      <button onClick={() => setIsPlaylistModalOpen(true)} className="p-2"><Plus size={28} className="text-black/40 dark:text-white/40" /></button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); toggleDownload(currentSong); }}
                        disabled={isDownloading}
                        className={`p-2 transition-all ${
                          isDownloaded 
                            ? 'text-[#7C3AED]' 
                            : isDownloading 
                              ? 'text-gray-400'
                              : 'text-black/40 dark:text-white/40'
                        }`}
                      >
                        {isDownloading ? <Loader2 size={28} className="animate-spin" /> : isDownloaded ? <Check size={28} /> : <Download size={28} />}
                      </button>
                    </div>
                  </div>
                  <div className="relative group px-2">
                    <input type="range" min="0" max={duration || 100} value={progress || 0} onChange={(e) => seekTo(Number(e.target.value))} className="absolute inset-0 w-full h-4 -top-1.5 opacity-0 cursor-pointer z-10" />
                    <div className="h-2 w-full bg-black/5 dark:bg-white/10 rounded-full overflow-hidden relative"><div className="h-full bg-[#7C3AED] rounded-full absolute top-0 left-0" style={{ width: `${progressPercent}%` }} /></div>
                    <div className="flex justify-between text-[10px] text-black/30 dark:text-white/40 mt-3 font-black uppercase tracking-widest"><span>{formatTime(progress)}</span><span>{formatTime(duration)}</span></div>
                  </div>
                  <div className="flex items-center justify-center gap-10">
                    <button onClick={playPrevious} className="text-black dark:text-white"><SkipBack size={40} fill="currentColor" /></button>
                    <button onClick={togglePlayPause} className="w-20 h-20 bg-black dark:bg-white text-white dark:text-black rounded-full flex items-center justify-center shadow-xl">
                      {isBuffering
                        ? <Loader2 size={36} className="animate-spin" />
                        : isPlaying ? <Pause size={36} fill="currentColor" /> : <Play size={36} fill="currentColor" className="ml-1" />}
                    </button>
                    <button onClick={() => playNext()} className="text-black dark:text-white"><SkipForward size={40} fill="currentColor" /></button>
                  </div>
                  <div className="flex justify-between items-center px-4 mt-4 pb-safe">
                    <button onClick={toggleShuffle} className={`p-2 transition-all ${isShuffle ? 'text-[#7C3AED]' : 'text-black/20 dark:text-white/40'}`}><Shuffle size={24} /></button>
                    <div className="flex items-center gap-8">
                      <VolumeControl />
                      <button onClick={() => setShowLyrics(!showLyrics)} className={`p-2 transition-all ${showLyrics ? 'text-[#7C3AED]' : 'text-black/20 dark:text-white/40'}`}><Mic2 size={24} /></button>
                      <button onClick={toggleRepeatMode} className={`p-2 transition-all ${repeatMode !== 'off' ? 'text-[#7C3AED]' : 'text-black/20 dark:text-white/40'}`}>{repeatMode === 'one' ? <Repeat1 size={24} /> : <Repeat size={24} />}</button>
                    </div>
                    <button onClick={() => setShowQueue(!showQueue)} className={`p-2 transition-all ${showQueue ? 'text-[#7C3AED]' : 'text-black/20 dark:text-white/40'}`}><ListMusic size={24} /></button>
                  </div>
                </div>

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
                <div className="flex-1 flex items-center justify-center min-h-[200px]"><Loader2 className="animate-spin text-[#7C3AED]" size={36} /></div>
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
                      className="w-full text-left p-4 rounded-2xl bg-black/5 dark:bg-white/5 hover:bg-[#7C3AED]/20 transition-all group border border-black/5 dark:border-white/5"
                    >
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-black text-lg text-[#7C3AED]">{f.format_id}</span>
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
    </>
  );
}
