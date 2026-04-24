'use client';

import { usePlayerStore } from '@/features/player/store/playerStore';
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Music, Clock as ClockIcon, X, Check } from 'lucide-react';
import { lyricsService, type LyricsData } from '@/features/lyrics/services/lrclibService';

export function LyricsPanel() {
  const { lyrics, progress, isLyricsLoading, currentSong, updateLyrics, seekTo, isSearchingLyrics: isSearching, setIsSearchingLyrics: setIsSearching } = usePlayerStore();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [activeLineIndex, setActiveLineIndex] = useState(-1);
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
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute inset-0 z-30 bg-black/40 backdrop-blur-[40px] flex flex-col overflow-hidden"
          >
            {/* Header Sticky */}
            <div className="shrink-0 p-6 sm:p-10 flex justify-between items-center bg-linear-to-b from-black/20 to-transparent">
              <div className="flex flex-col">
                <h3 className="text-2xl sm:text-4xl font-black text-white flex items-center gap-4 tracking-tighter uppercase italic">
                  <Search size={28} className="text-[var(--accent-primary)]" strokeWidth={3} />
                  Búsqueda Manual
                </h3>
                <p className="text-[10px] sm:text-xs font-bold text-white/40 uppercase tracking-[0.3em] mt-1 ml-11">Encuentra la letra perfecta</p>
              </div>
              <button 
                onClick={() => setIsSearching(false)} 
                className="w-12 h-12 flex items-center justify-center bg-white/5 hover:bg-red-500/20 text-white/60 hover:text-red-500 rounded-full transition-all border border-white/10 active:scale-90"
              >
                <X size={24} />
              </button>
            </div>

            {/* Content Scrollable to handle keyboard on mobile */}
            <div className="flex-1 overflow-y-auto px-6 sm:px-10 pb-10 custom-scrollbar">
              <div className="max-w-3xl mx-auto space-y-8">
                {/* Search Form */}
                <div className="grid grid-cols-1 gap-4 p-1">
                  <div className="relative group">
                    <input 
                      value={query.title} 
                      onChange={e => setQuery({...query, title: e.target.value})}
                      placeholder="Nombre de la canción..."
                      className="w-full bg-white/5 border border-white/10 rounded-3xl px-8 py-5 text-lg text-white placeholder:text-white/20 focus:outline-none focus:ring-4 focus:ring-[var(--accent-primary)]/20 focus:border-[var(--accent-primary)]/40 transition-all font-bold shadow-2xl"
                    />
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 text-white/10 group-focus-within:text-[var(--accent-primary)]/30 transition-colors">
                       <Music size={24} />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4">
                    <input 
                      value={query.artist} 
                      onChange={e => setQuery({...query, artist: e.target.value})}
                      placeholder="Artista..."
                      className="flex-1 bg-white/5 border border-white/10 rounded-3xl px-8 py-5 text-lg text-white placeholder:text-white/20 focus:outline-none focus:ring-4 focus:ring-[var(--accent-primary)]/20 focus:border-[var(--accent-primary)]/40 transition-all font-bold shadow-2xl"
                    />
                    <button 
                      onClick={handleSearch}
                      disabled={isSearchingOnline}
                      className="bg-[var(--accent-primary)] hover:brightness-125 disabled:opacity-50 text-white rounded-3xl px-10 py-5 font-black transition-all shadow-2xl shadow-[var(--accent-primary)]/40 active:scale-95 flex items-center justify-center gap-3 uppercase text-xs tracking-[0.2em] min-w-[160px]"
                    >
                      {isSearchingOnline ? (
                        <div className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <Search size={20} strokeWidth={3} />
                          <span>Buscar</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Results Section */}
                <div className="space-y-4 pt-4">
                  {searchResults.length > 0 ? (
                    searchResults.map((res, idx) => (
                      <motion.button 
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        key={res.id} 
                        onClick={() => selectLyric(res)}
                        className="w-full flex items-center justify-between p-6 bg-white/3 hover:bg-white/10 border border-white/5 hover:border-white/20 rounded-[32px] transition-all group text-left shadow-lg hover:shadow-2xl"
                      >
                        <div className="flex-1 min-w-0 pr-6">
                          <h4 className="text-white font-black text-xl sm:text-2xl truncate group-hover:text-[var(--accent-primary)] transition-colors tracking-tighter">
                            {res.trackName}
                          </h4>
                          <div className="flex items-center gap-2 mt-2">
                             <p className="text-[var(--accent-primary)] text-[10px] font-black uppercase tracking-widest brightness-150">{res.artistName}</p>
                             {res.albumName && <span className="text-white/20 text-[10px] font-black">•</span>}
                             <p className="text-white/40 text-[10px] font-bold truncate uppercase tracking-wider">{res.albumName}</p>
                          </div>
                          
                          <div className="flex items-center gap-4 mt-4">
                            <span className="text-[10px] font-bold text-white/30 flex items-center gap-1.5 bg-white/5 px-3 py-1.5 rounded-full">
                              <ClockIcon size={12} /> {formatDuration(res.duration)}
                            </span>
                            {res.syncedLyrics && (
                              <span className="text-[10px] bg-[var(--accent-primary)] text-white px-3 py-1.5 rounded-full font-black tracking-widest flex items-center gap-1.5 shadow-lg shadow-[var(--accent-primary)]/20">
                                <Check size={12} strokeWidth={4} /> SINCRONIZADA
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="w-14 h-14 flex items-center justify-center bg-white/5 group-hover:bg-[var(--accent-primary)] text-white rounded-2xl transition-all scale-90 group-hover:scale-100 shadow-xl border border-white/10 group-hover:border-transparent">
                          <Music size={24} />
                        </div>
                      </motion.button>
                    ))
                  ) : !isSearchingOnline && (
                    <div className="text-center py-20 opacity-20 space-y-6">
                      <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mx-auto border border-white/10 animate-pulse">
                        <Search size={40} />
                      </div>
                      <p className="text-xl font-black tracking-tighter uppercase italic">Explora la base de datos</p>
                    </div>
                  )}
                </div>
              </div>
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
