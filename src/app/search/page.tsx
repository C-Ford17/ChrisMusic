'use client';

import { useEffect, useState, useRef } from 'react';
import { usePlayerStore } from '@/features/player/store/playerStore';
import { Search, Plus, ListPlus, Music, Clock, Trash2, Download, Check, Loader2, ArrowUpLeft } from 'lucide-react';
import { toast } from 'sonner';
import Image from 'next/image';
import { type Song } from '@/core/types/music';
import { AddToPlaylistModal } from '@/shared/components/AddToPlaylistModal';
import { LibraryService } from '@/features/library/services/libraryService';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/db/db';
import { youtubeExtractionService } from '@/features/player/services/youtubeExtractionService';

const PAGE_SIZE = 15;

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Song[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Suggestion states
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [lastSearchedQuery, setLastSearchedQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const { playSong, addToQueue, toggleDownload, downloadingSongs, currentSong, isBuffering } = usePlayerStore();

  const searchHistory = useLiveQuery(
    () => db.searchHistory.orderBy('timestamp').reverse().limit(10).toArray(),
    []
  );

  const downloadedIds = useLiveQuery(
    async () => {
      const all = await db.offlineSongs.toArray();
      return new Set(all.map(s => s.id));
    },
    []
  ) || new Set<string>();

  // Fetch suggestions with debounce
  useEffect(() => {
    const timer = setTimeout(async () => {
      const trimmedQuery = query.trim();
      // Show suggestions if:
      // 1. Length >= 2
      // 2. Input is focused
      // 3. Not currently loading search results
      // 4. Current query is different from what we JUST searched
      if (trimmedQuery.length >= 2 && isFocused && !loading && trimmedQuery !== lastSearchedQuery) {
        const results = await youtubeExtractionService.getSuggestions(query);
        setSuggestions(results);
        if (results.length > 0) {
          setShowSuggestions(true);
        }
      } else {
        setShowSuggestions(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, loading, isFocused, lastSearchedQuery]);

  // Click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const performSearch = async (searchTerm: string) => {
    if (!searchTerm.trim()) return;
    setLoading(true);
    setShowSuggestions(false);
    setLastSearchedQuery(searchTerm.trim());

    try {
      console.log(`[SearchPage] Searching for: ${searchTerm}`);
      const searchResults = await youtubeExtractionService.search(searchTerm, PAGE_SIZE);
      
      if (searchResults && searchResults.length > 0) {
        setResults(searchResults);
        LibraryService.recordSearch(searchTerm);
      } else {
        toast.error("No se encontraron resultados");
        setResults([]);
      }
    } catch (err: any) {
      console.error("[SearchPage] Search error:", err);
      toast.error(`Error en la búsqueda: ${err.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(query);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    performSearch(suggestion);
  };

  const clearHistory = async () => {
    await LibraryService.clearSearchHistory();
    toast.success('Historial borrado');
  };

  return (
    <div className="flex flex-col min-h-screen pt-safe">
      <main className="flex-1 p-6 pb-40 max-w-5xl mx-auto w-full">
        <div className="mb-10">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-4xl font-black tracking-tighter">Buscador</h1>
            {searchHistory && searchHistory.length > 0 && results.length === 0 && !query && (
              <button
                onClick={clearHistory}
                className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-red-500/50 hover:text-red-500 transition-colors p-2"
              >
                <Trash2 size={14} />
                Limpiar
              </button>
            )}
          </div>

          <div ref={containerRef} className="relative group">
            <form
              onSubmit={onSearchSubmit}
              action="javascript:void(0)"
              className="relative"
            >
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#7C3AED] transition-colors z-10" size={24} />
              <input
                type="text"
                enterKeyHint="search"
                placeholder="¿Qué quieres escuchar hoy?"
                className="w-full bg-black/5 dark:bg-white/5 text-black dark:text-white rounded-[24px] py-6 px-16 outline-none focus:ring-4 focus:ring-[#7C3AED]/20 border border-black/5 dark:border-white/10 transition-all placeholder:text-gray-500 font-bold text-lg relative z-0"
                value={query}
                onFocus={() => {
                  setIsFocused(true);
                  if (query.trim().length >= 2 && suggestions.length > 0 && query.trim() !== lastSearchedQuery) {
                    setShowSuggestions(true);
                  }
                }}
                onBlur={() => {
                  // Small delay to allow clicking suggestions before they're unmounted
                  setTimeout(() => setIsFocused(false), 200);
                }}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (!e.target.value) {
                    setResults([]);
                    setShowSuggestions(false);
                    setLastSearchedQuery('');
                  }
                }}
              />
            </form>

            {/* Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white/80 dark:bg-[#121212]/90 backdrop-blur-xl border border-black/5 dark:border-white/10 rounded-[24px] shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="py-2">
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      onClick={() => handleSuggestionClick(suggestion)}
                      className="w-full flex items-center gap-4 px-6 py-4 hover:bg-[#7C3AED]/10 text-left transition-colors group"
                    >
                      <Search size={18} className="text-gray-400 group-hover:text-[#7C3AED] shrink-0" />
                      <span className="flex-1 font-bold text-black dark:text-white line-clamp-1">{suggestion}</span>
                      <ArrowUpLeft size={18} className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Search History Chips */}
          {!query && searchHistory && searchHistory.length > 0 && (
            <div className="mt-8 animate-in fade-in slide-in-from-top-4 duration-500">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-black/30 dark:text-white/30 mb-4 px-2">Búsquedas recientes</h3>
              <div className="flex flex-wrap gap-2">
                {searchHistory.map((item) => (
                  <button
                    key={item.query}
                    onClick={() => {
                      setQuery(item.query);
                      performSearch(item.query);
                    }}
                    className="flex items-center gap-2 px-5 py-2.5 bg-black/5 dark:bg-white/5 hover:bg-[#7C3AED]/10 hover:text-[#7C3AED] border border-black/5 dark:border-white/5 rounded-full text-sm font-bold transition-all active:scale-95"
                  >
                    <Clock size={14} className="opacity-40" />
                    {item.query}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Loading spinner */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
            <div className="w-10 h-10 border-4 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-black tracking-[0.2em] uppercase">Buscando en YouTube Music...</span>
          </div>
        )}

        {/* Results grid */}
        {!loading && results.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in duration-700">
            {results.map((song) => {
              const isDownloaded = downloadedIds.has(song.id);
              const isDownloading = downloadingSongs.has(song.id);
              return (
                <div
                  key={song.id}
                  className="flex flex-col p-4 rounded-[32px] bg-black/[0.02] dark:bg-white/[0.02] hover:bg-white dark:hover:bg-white/5 border border-black/5 dark:border-white/5 cursor-pointer transition-all group active:scale-[0.98] shadow-sm hover:shadow-xl relative overflow-hidden"
                  onClick={() => playSong(song)}
                >
                  <div className="relative w-full aspect-square mb-4 bg-gray-200 dark:bg-gray-800 rounded-[24px] overflow-hidden shadow-md">
                    <Image src={youtubeExtractionService.normalizeUrl(song.thumbnailUrl)} alt={song.title} fill sizes="(max-width: 768px) 100vw, 300px" className="object-cover group-hover:scale-110 transition-transform duration-700" />
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-black shadow-xl scale-90 group-hover:scale-100 transition-transform">
                        {(currentSong?.id === song.id && isBuffering) ? (
                          <Loader2 size={24} className="animate-spin" />
                        ) : (
                          <Music size={24} fill="currentColor" />
                        )}
                      </div>
                    </div>
                    {currentSong?.id === song.id && isBuffering && (
                       <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-black shadow-xl">
                             <Loader2 size={24} className="animate-spin" />
                          </div>
                       </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 px-1">
                    <h3 className="text-black dark:text-white font-black line-clamp-2 group-hover:text-[#7C3AED] transition-colors tracking-tight text-lg leading-tight min-h-[3rem] overflow-hidden">{song.title}</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-xs font-bold truncate mt-1 uppercase tracking-wider">{song.artistName}</p>
                  </div>
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-black/5 dark:border-white/5">
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); addToQueue(song); toast.success('A la cola', { description: song.title }); }}
                        className="w-10 h-10 flex items-center justify-center bg-black/5 dark:bg-white/5 text-gray-500 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10 rounded-full transition-all"
                      >
                        <Plus size={20} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setSelectedSong(song); setIsModalOpen(true); }}
                        className="w-10 h-10 flex items-center justify-center bg-black/5 dark:bg-white/5 text-gray-500 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10 rounded-full transition-all"
                      >
                        <ListPlus size={20} />
                      </button>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleDownload(song); }}
                      className={`w-10 h-10 flex items-center justify-center rounded-full transition-all ${
                        isDownloaded ? 'bg-[#7C3AED]/10 text-[#7C3AED]'
                        : isDownloading ? 'bg-black/5 dark:bg-white/5 text-gray-400'
                        : 'bg-black/5 dark:bg-white/5 text-gray-500 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10'
                      }`}
                      disabled={isDownloading}
                    >
                      {isDownloading ? <Loader2 size={18} className="animate-spin" /> : isDownloaded ? <Check size={18} /> : <Download size={18} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* No results message */}
        {!loading && results.length === 0 && query && (
          <div className="text-center py-32 opacity-20 space-y-4">
            <Music size={64} className="mx-auto mb-4" />
            <p className="text-2xl font-black tracking-tighter">No encontramos nada con &quot;{query}&quot;</p>
          </div>
        )}

        {/* Empty state */}
        {!query && (!searchHistory || searchHistory.length === 0) && (
          <div className="text-center py-40 opacity-10 space-y-8">
            <div className="w-24 h-24 bg-black/5 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto">
              <Search size={48} />
            </div>
            <p className="text-2xl font-black tracking-tighter italic">Busca tu música favorita...</p>
          </div>
        )}
      </main>

      <AddToPlaylistModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        song={selectedSong}
      />
    </div>
  );
}
