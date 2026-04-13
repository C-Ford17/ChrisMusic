'use client';

import { usePlayerStore } from '@/features/player/store/playerStore';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Music, Clock as ClockIcon, X, Check } from 'lucide-react';
import { lyricsService, type LyricsData } from '@/features/lyrics/services/lrclibService';

export function LyricsPanel() {
  const { lyrics, progress, isLyricsLoading, currentSong, updateLyrics, seekTo } = usePlayerStore();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [activeLineIndex, setActiveLineIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [query, setQuery] = useState({ 
    title: currentSong?.title || '', 
    artist: currentSong?.artistName || '' 
  });
  const [searchResults, setSearchResults] = useState<LyricsData[]>([]);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);

  useEffect(() => {
    if (!lyrics || lyrics.length === 0) return;

    const index = lyrics.findIndex((line, i) => {
      const nextLine = lyrics[i + 1];
      return progress >= line.time && (!nextLine || progress < nextLine.time);
    });

    if (index !== -1 && index !== activeLineIndex) {
      setActiveLineIndex(index);
      
      if (scrollContainerRef.current) {
        const activeElement = scrollContainerRef.current.children[index] as HTMLElement;
        if (activeElement) {
          const containerHeight = scrollContainerRef.current.clientHeight;
          const offsetTop = activeElement.offsetTop;
          const elementHeight = activeElement.clientHeight;
          
          scrollContainerRef.current.scrollTo({
            top: offsetTop - containerHeight / 2 + elementHeight / 2,
            behavior: 'smooth'
          });
        }
      }
    }
  }, [progress, lyrics, activeLineIndex]);

  const handleSearch = async () => {
    if (!query.title.trim()) return;
    setIsSearchingOnline(true);
    try {
      const url = new URL('https://lrclib.net/api/search');
      url.searchParams.append('q', `${query.artist} ${query.title}`);
      const response = await fetch(url.toString());
      if (response.ok) {
        const results = await response.json();
        setSearchResults(results);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearchingOnline(false);
    }
  };

  const selectLyric = (res: LyricsData) => {
    updateLyrics(res);
    setIsSearching(false);
  };

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (isLyricsLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white/40 gap-4">
        <div className="w-8 h-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium animate-pulse tracking-widest uppercase">Buscando letras...</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full flex flex-col">
      {!isSearching && (
        <button 
          onClick={() => {
            setIsSearching(true);
            setQuery({ title: currentSong?.title || '', artist: currentSong?.artistName || '' });
          }}
          className="absolute top-6 right-6 z-20 p-3 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-2xl text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-all backdrop-blur-md shadow-sm"
          title="Buscar letras manualmente"
        >
          <Search size={22} />
        </button>
      )}

      <AnimatePresence mode="wait">
        {isSearching ? (
          <motion.div 
            key="search-panel"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-0 z-30 bg-white/80 dark:bg-[#0A0A0A]/80 backdrop-blur-xl p-4 sm:p-8 flex flex-col overflow-hidden transition-colors"
          >
            <div className="flex justify-between items-center mb-4 sm:mb-8 shrink-0">
              <h3 className="text-xl sm:text-2xl font-black text-black dark:text-white flex items-center gap-3 tracking-tighter">
                <Search size={24} className="text-[var(--accent-primary)]" />
                Búsqueda Manual
              </h3>
              <button onClick={() => setIsSearching(false)} className="p-2.5 bg-black/5 dark:bg-white/5 text-black/40 dark:text-white/40 hover:text-red-500 rounded-full transition-all">
                <X size={22} />
              </button>
            </div>

            <div className="space-y-3 sm:space-y-4 mb-6 sm:mb-8 shrink-0">
              <input 
                value={query.title} 
                onChange={e => setQuery({...query, title: e.target.value})}
                placeholder="Título de la canción..."
                className="w-full bg-black/3 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-2xl px-5 py-3.5 sm:py-4 text-sm sm:text-base text-black dark:text-white placeholder:text-black/20 dark:placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20 transition-all font-bold"
              />
              <div className="flex gap-2 sm:gap-3">
                <input 
                  value={query.artist} 
                  onChange={e => setQuery({...query, artist: e.target.value})}
                  placeholder="Artista..."
                  className="flex-1 bg-black/3 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-2xl px-5 py-3.5 sm:py-4 text-sm sm:text-base text-black dark:text-white placeholder:text-black/20 dark:placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20 transition-all font-bold"
                />
                <button 
                  onClick={handleSearch}
                  disabled={isSearchingOnline}
                  className="bg-[var(--accent-primary)] hover:bg-[#6D28D9] disabled:opacity-50 text-white rounded-2xl px-6 sm:px-8 font-black transition-all shadow-xl shadow-[var(--accent-primary)]/20 active:scale-95 flex items-center gap-2 uppercase text-[10px] sm:text-xs tracking-widest"
                >
                  {isSearchingOnline ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Search size={18} />}
                  <span className="hidden sm:inline">Buscar</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
              {searchResults.length > 0 ? (
                searchResults.map((res) => (
                  <button 
                    key={res.id} 
                    onClick={() => selectLyric(res)}
                    className="w-full flex items-center justify-between p-5 bg-black/2 dark:bg-white/2 hover:bg-white dark:hover:bg-white/5 border border-black/5 dark:border-white/5 rounded-[24px] transition-all group text-left shadow-sm hover:shadow-xl"
                  >
                    <div className="flex-1 min-w-0 pr-6">
                      <p className="text-black dark:text-white font-black text-lg truncate group-hover:text-[var(--accent-primary)] transition-colors tracking-tight">{res.trackName}</p>
                      <p className="text-black/40 dark:text-white/40 text-xs font-bold truncate mt-1 uppercase tracking-wider">{res.artistName} {res.albumName ? `• ${res.albumName}` : ''}</p>
                      <div className="flex items-center gap-3 mt-3">
                        <span className="text-[10px] bg-black/5 dark:bg-white/5 text-black/40 dark:text-white/40 px-2.5 py-1 rounded-lg flex items-center gap-1.5 font-bold">
                          <ClockIcon size={12} /> {formatDuration(res.duration)}
                        </span>
                        {res.syncedLyrics && (
                          <span className="text-[10px] bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] px-2.5 py-1 rounded-lg font-black tracking-widest flex items-center gap-1.5 border border-[var(--accent-primary)]/20">
                            <Check size={12} strokeWidth={4} /> SINCRONIZADA
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="w-12 h-12 flex items-center justify-center bg-[var(--accent-primary)] text-white rounded-xl shadow-lg opacity-0 lg:group-hover:opacity-100 transition-all scale-75 group-hover:scale-100">
                      <Music size={20} />
                    </div>
                  </button>
                ))
              ) : !isSearchingOnline && (
                <div className="text-center py-32 opacity-10 space-y-6">
                  <div className="w-24 h-24 bg-black/5 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto">
                    <Search size={48} />
                  </div>
                  <p className="text-xl font-black tracking-tighter">Explora las letras</p>
                </div>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-6 md:px-14 py-32 text-center space-y-12 select-none snap-y snap-mandatory hide-scrollbar group transition-all"
        style={{ scrollSnapType: 'y proximity' }}
      >
        {lyrics && lyrics.length > 0 ? (
          lyrics.map((line, index) => (
            <p
              key={index}
              onClick={() => line.time !== undefined && seekTo(line.time)}
              className={`text-xl md:text-2xl lg:text-4xl font-bold leading-relaxed transition-colors duration-150 cursor-pointer snap-center tracking-tight ${
                activeLineIndex === index 
                ? 'text-white drop-shadow-lg' 
                : 'text-white/40 hover:text-white/80'
              }`}
            >
              {line.text}
            </p>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-full opacity-20 space-y-8 py-20">
            <div className="w-24 h-24 bg-black/5 dark:bg-white/5 rounded-full flex items-center justify-center animate-bounce">
              <Music size={48} className="text-[var(--accent-primary)]" />
            </div>
            <div className="space-y-2">
              <p className="text-3xl font-black tracking-tighter text-black dark:text-white">Sin letras todavía</p>
              <p className="text-sm font-bold uppercase tracking-widest text-black/50 dark:text-white/50">¿Quieres que las busque?</p>
            </div>
            <button 
              onClick={() => {
                setIsSearching(true);
                setQuery({ title: currentSong?.title || '', artist: currentSong?.artistName || '' });
              }}
              className="px-10 py-4 bg-[var(--accent-primary)] hover:brightness-110 rounded-2xl text-white text-xs font-black uppercase tracking-[0.2em] shadow-xl shadow-[var(--accent-primary)]/20 transition-all border border-transparent active:scale-95"
            >
              Buscar ahora
            </button>
          </div>
        )}
      </div>

      {/* Removed the background gradients that looked like a box */}
    </div>
  );
}
