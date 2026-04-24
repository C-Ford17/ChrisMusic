'use client';

import { useEffect, useState, useRef } from 'react';
import { usePlayerStore } from '@/features/player/store/playerStore';
import { useSettingsStore } from '@/features/settings/store/settingsStore';
import { Search, Plus, ListPlus, Music, Clock, Trash2, Download, Check, Loader2, ArrowUpLeft, X, Heart, Edit2, ListMusic } from 'lucide-react';
import { formatDuration } from '@/lib/utils';
import { toast } from 'sonner';
import Image from 'next/image';
import { type Song, type Artist, type Album, type SearchResult } from '@/core/types/music';
import { AddToPlaylistModal } from '@/shared/components/AddToPlaylistModal';
import { MarqueeText } from '@/shared/components/MarqueeText';
import { LibraryService } from '@/features/library/services/libraryService';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/db/db';
import { youtubeExtractionService, YouTubeExtractionService } from '@/features/player/services/youtubeExtractionService';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

const PAGE_SIZE = 15;

export function SearchContent() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'song' | 'album' | 'artist' | 'playlist'>('song');
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [hasMore, setHasMore] = useState(true);
  const loaderRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  
  // Suggestion states
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [lastSearchedQuery, setLastSearchedQuery] = useState('');
  const [topResult, setTopResult] = useState<Song | null>(null);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  const { isDebugMode } = useSettingsStore();
  const { playSong, addToQueue, toggleDownload, downloadingSongs, currentSong, isBuffering } = usePlayerStore();

  const searchHistory = useLiveQuery(
    () => db.searchHistory.orderBy('timestamp').reverse().limit(10).toArray(),
    []
  );

  const favoriteIds = useLiveQuery(
    async () => {
      const all = await db.favorites.toArray();
      return new Set(all.map(s => s.id));
    },
    []
  ) || new Set<string>();

  const downloadedIds = useLiveQuery(
    async () => {
      const all = await db.offlineSongs.toArray();
      return new Set(all.map(s => s.id));
    },
    []
  ) || new Set<string>();

  useEffect(() => {
    const timer = setTimeout(async () => {
      const trimmedQuery = query.trim();
      if (trimmedQuery === lastSearchedQuery) {
        setShowSuggestions(false);
        return;
      }
      if (trimmedQuery.length >= 2 && isFocused && !loading) {
        setLoadingSuggestions(true);
        
        // 1. Fetch text suggestions immediately and show them
        youtubeExtractionService.getSuggestions(trimmedQuery)
          .then(suggests => {
            setSuggestions(suggests);
            if (suggests.length > 0) setShowSuggestions(true);
          })
          .catch(err => console.error("Error fetching text suggestions:", err));

        // 2. Fetch top result separately
        youtubeExtractionService.search(trimmedQuery, 1)
          .then(topSongs => {
            if (topSongs && topSongs.length > 0) {
              setTopResult(topSongs[0]);
              setShowSuggestions(true);
            } else {
              setTopResult(null);
            }
          })
          .catch(err => console.error("Error fetching top result:", err))
          .finally(() => setLoadingSuggestions(false));
          
      } else {
        setShowSuggestions(false);
        setTopResult(null);
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

  const [continuationToken, setContinuationToken] = useState<string | undefined>(undefined);
  
  // Sync URL to State on Mount
  useEffect(() => {
    const q = searchParams.get('q');
    const t = searchParams.get('tab') as any;
    if (q) {
      setQuery(q);
      if (t) setActiveTab(t);
      // We use setTimeout to ensure states are set before performing search
      // though performSearch uses arguments now so it's safer
      performSearch(q, false, t || activeTab);
    }
  }, []);
  const performSearch = async (searchTerm: string, isAppend: boolean = false, tabOverride?: 'song' | 'album' | 'artist' | 'playlist') => {
    if (!searchTerm.trim()) return;
    const targetTab = tabOverride || activeTab;
    setLoading(true);
    setShowSuggestions(false);
    setTopResult(null);
    setLastSearchedQuery(searchTerm.trim());

    // Update URL
    const params = new URLSearchParams();
    params.set('q', searchTerm.trim());
    params.set('tab', targetTab);
    router.replace(`/search?${params.toString()}`);

    try {
      const tokenToUse = isAppend ? continuationToken : undefined;
      console.log(`[SearchPage] ${isAppend ? 'Loading more' : 'New search'} for: ${searchTerm} in tab: ${targetTab}`);
      
      const response = await youtubeExtractionService.searchWithType(searchTerm, targetTab, PAGE_SIZE, tokenToUse);
      
      if (response.results && response.results.length > 0) {
        let newItems = response.results;
        
        // Boost exact matches for artists
        if (targetTab === 'artist') {
          newItems = [...newItems].sort((a, b) => {
            const ai = a as any;
            const bi = b as any;
            const aName = (ai.name || ai.title || "").toLowerCase();
            const bName = (bi.name || bi.title || "").toLowerCase();
            const term = searchTerm.toLowerCase();
            if (aName === term && bName !== term) return -1;
            if (bName === term && aName !== term) return 1;
            return 0;
          });
        }

        if (isAppend) {
          // Append and unique by ID
          setResults(prev => {
            const combined = [...prev, ...newItems];
            const uniqueMap = new Map();
            combined.forEach(item => uniqueMap.set(item.id, item));
            return Array.from(uniqueMap.values());
          });
        } else {
          setResults(newItems);
          LibraryService.recordSearch(searchTerm);
        }
        
        setContinuationToken(response.continuation);
        setHasMore(!!response.continuation);
      } else {
        if (!isAppend) {
          toast.error("No se encontraron resultados");
          setResults([]);
        }
        setHasMore(false);
      }
    } catch (err: any) {
      console.error("[SearchPage] Search error:", err);
      toast.error(`Error en la búsqueda: ${err.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  };
// ... rest of the component UI ...

  const loadMore = () => {
    if (loading || !hasMore || !lastSearchedQuery) return;
    performSearch(lastSearchedQuery, true);
  };

  // Scroll listener for infinite scroll (Only for Android)
  useEffect(() => {
    // Strict platform check: only run on Android
    if (typeof window === 'undefined' || !YouTubeExtractionService.isAndroid()) return;

    const handleScroll = () => {
      if (loading || !hasMore || !lastSearchedQuery) return;
      const scrollHeight = document.documentElement.scrollHeight;
      const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
      const clientHeight = document.documentElement.clientHeight;
      if (scrollHeight - scrollTop - clientHeight < 800) {
        loadMore();
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [hasMore, loading, lastSearchedQuery, visibleCount]);

  // Intersection Observer for infinite scroll (Only for Android)
  useEffect(() => {
    // Strict platform check: only run on Android
    if (typeof window === 'undefined' || !YouTubeExtractionService.isAndroid() || !loaderRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && lastSearchedQuery) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, lastSearchedQuery, visibleCount]);


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
              {query && (
                <div className="absolute right-5 top-1/2 -translate-y-1/2 flex items-center gap-2 z-10">
                  {loadingSuggestions && (
                    <Loader2 size={18} className="animate-spin text-[#7C3AED]" />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setResults([]);
                      setShowSuggestions(false);
                      setLastSearchedQuery('');
                      setTopResult(null);
                    }}
                    className="p-2 text-gray-400 hover:text-black dark:hover:text-white transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>
              )}

            </form>

            {/* Search Tabs */}
            <div className="flex gap-2 mt-4 px-2 overflow-x-auto scrollbar-hide">
              {[
                { id: 'song', label: 'Canciones', icon: Music },
                { id: 'album', label: 'Álbumes', icon: ListPlus },
                { id: 'artist', label: 'Artistas', icon: Heart },
                { id: 'playlist', label: 'Playlists', icon: ListMusic },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as any);
                    if (lastSearchedQuery) performSearch(lastSearchedQuery, false, tab.id as any);
                  }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all shrink-0 ${
                    activeTab === tab.id
                      ? 'bg-[#7C3AED] text-white shadow-lg shadow-[#7C3AED]/20 scale-105'
                      : 'bg-black/5 dark:bg-white/5 text-gray-500 hover:bg-black/10 dark:hover:bg-white/10'
                  }`}
                >
                  <tab.icon size={14} />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Suggestions Dropdown */}
            {showSuggestions && (suggestions.length > 0 || topResult) && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white/80 dark:bg-[#121212]/90 backdrop-blur-2xl border border-black/5 dark:border-white/10 rounded-[24px] shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-300 max-h-[70vh] overflow-y-auto">
                <div className="py-2">
                  {/* Top Result Song */}
                  {topResult && (
                    <div className="px-4 py-2 border-b border-black/5 dark:border-white/5 mb-2">
                       <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-black/30 dark:text-white/30 mb-2 px-2">Mejor resultado</h3>
                       <div 
                         className="flex items-center gap-4 p-3 hover:bg-[#7C3AED]/10 rounded-2xl cursor-pointer transition-colors group"
                         onClick={() => {
                           playSong(topResult);
                           setShowSuggestions(false);
                         }}
                       >
                         <div className="relative w-14 h-14 shrink-0 rounded-xl overflow-hidden shadow-sm">
                           <Image 
                             src={youtubeExtractionService.normalizeUrl(topResult.thumbnailUrl)} 
                             alt={topResult.title} 
                             fill 
                             className="object-cover"
                           />
                         </div>
                         <div className="flex-1 min-w-0">
                           <MarqueeText 
                             text={topResult.title} 
                             className="font-bold text-black dark:text-white group-hover:text-[#7C3AED] transition-colors" 
                           />
                           <MarqueeText 
                             text={topResult.artistName} 
                             className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mt-0.5" 
                           />
                         </div>
                         <div className="flex gap-1 shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleDownload(topResult);
                              }}
                              className="p-1.5 text-gray-400 hover:text-[#7C3AED] transition-colors"
                            >
                              {downloadingSongs.has(topResult.id) ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : downloadedIds.has(topResult.id) ? (
                                <Check size={16} className="text-[#7C3AED]" />
                              ) : (
                                <Download size={16} />
                              )}
                            </button>
                         </div>

                       </div>
                    </div>
                  )}

                  {/* Text Suggestions */}
                  {suggestions.length > 0 && (
                    <>
                      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-black/30 dark:text-white/30 mt-2 mb-2 px-6">Sugerencias</h3>
                      {suggestions.map((suggestion, index) => (
                        <button
                          key={index}
                          onClick={() => handleSuggestionClick(suggestion)}
                          className="w-full flex items-center gap-4 px-6 py-3.5 hover:bg-[#7C3AED]/10 text-left transition-colors group"
                        >
                          <Search size={16} className="text-gray-400 group-hover:text-[#7C3AED] shrink-0" />
                          <span className="flex-1 font-bold text-black dark:text-white line-clamp-1">{suggestion}</span>
                          <Edit2 size={16} className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      ))}
                    </>
                  )}
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

        {/* Loading spinner (Only on initial search) */}
        {loading && results.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
            <div className="w-10 h-10 border-4 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-black tracking-[0.2em] uppercase">Buscando en YouTube Music...</span>
          </div>
        )}

        {/* Results List */}
        {results.length > 0 && (
          <div className="flex flex-col gap-1 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-black/30 dark:text-white/30 mb-4 px-2">
              {activeTab === 'song' ? 'Canciones' : activeTab === 'album' ? 'Álbumes' : activeTab === 'playlist' ? 'Playlists' : 'Artistas'} encontrados
            </h2>
            {results.filter(item => {
              const rt = (item as any).type || (item as any).resultType || 'song';
              const id: string = (item as any).id || '';
              // Safety: items whose ID starts with VL/PL are always playlists
              const idImpliesPlaylist = id.startsWith('VL') || id.startsWith('PL');
              if (activeTab === 'song') return (rt === 'song' || rt === 'video') && !idImpliesPlaylist;
              if (activeTab === 'album') return rt === 'album' && !idImpliesPlaylist;
              if (activeTab === 'artist') return rt === 'artist';
              if (activeTab === 'playlist') return rt === 'playlist' || idImpliesPlaylist;
              return true;
            }).map((item) => {
              const id: string = (item as any).id || '';
              const idImpliesPlaylist = id.startsWith('VL') || id.startsWith('PL');
              const resultType = idImpliesPlaylist ? 'playlist' : ((item as any).type || (item as any).resultType || 'song');
              
              if (resultType === 'artist') {
                const artist = item as Artist;
                return (
                  <div
                    key={artist.id}
                    className="flex items-center gap-4 p-3 rounded-[24px] hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer group active:scale-[0.99]"
                    onClick={() => router.push(`/artist?id=${artist.id}`)}
                  >
                    <div className="relative w-16 h-16 shrink-0 rounded-full overflow-hidden shadow-sm bg-black/5 dark:bg-white/5">
                      <Image 
                        src={youtubeExtractionService.normalizeUrl(artist.thumbnailUrl) || 'https://music.youtube.com/img/on_music_logo_mono.svg'} 
                        alt={artist.name} 
                        fill 
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-lg text-black dark:text-white truncate">{artist.name || (artist as any).artistName || (artist as any).title}</h3>
                      <p className="text-[10px] text-gray-500 font-medium uppercase tracking-widest">Artista</p>
                    </div>
                  </div>
                );
              }

              if (resultType === 'album') {
                const album = item as Album;
                return (
                  <div
                    key={album.id}
                    className="flex items-center gap-4 p-3 rounded-[24px] hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer group active:scale-[0.99]"
                    onClick={() => router.push(`/album?id=${album.id}`)}
                  >
                    <div className="relative w-16 h-16 shrink-0 rounded-[18px] overflow-hidden shadow-sm bg-black/5 dark:bg-white/5">
                      <Image 
                        src={youtubeExtractionService.normalizeUrl(album.thumbnailUrl) || 'https://music.youtube.com/img/on_music_logo_mono.svg'} 
                        alt={album.title} 
                        fill 
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-sm text-black dark:text-white truncate">{album.title}</h3>
                      <p className="text-[10px] text-gray-500 font-medium uppercase tracking-widest">{album.artistName}</p>
                    </div>
                  </div>
                );
              }
              if (resultType === 'playlist') {
                const pl = item as any;
                return (
                  <div
                    key={pl.id}
                    className="flex items-center gap-4 p-3 rounded-[24px] hover:bg-black/5 dark:hover:bg-white/5 transition-all cursor-pointer group active:scale-[0.99]"
                    onClick={() => router.push(`/album?id=${pl.id}`)}
                  >
                    <div className="relative w-16 h-16 shrink-0 rounded-[18px] overflow-hidden shadow-sm bg-black/5 dark:bg-white/5">
                      <Image
                        src={youtubeExtractionService.normalizeUrl(pl.thumbnailUrl) || 'https://music.youtube.com/img/on_music_logo_mono.svg'}
                        alt={pl.title || pl.name || ''}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                      <div className="absolute bottom-1 right-1 bg-black/60 backdrop-blur-sm rounded-full p-0.5">
                        <ListMusic size={10} className="text-white" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-sm text-black dark:text-white truncate">{pl.title || pl.name}</h3>
                      <p className="text-[10px] text-gray-500 font-medium uppercase tracking-widest">{pl.artistName || 'Playlist'}</p>
                    </div>
                    <ListMusic size={16} className="text-gray-300 dark:text-gray-600 shrink-0" />
                  </div>
                );
              }

              const song = item as Song;
              const isDownloaded = downloadedIds.has(song.id);
              const isDownloading = downloadingSongs.has(song.id);
              const isFavorite = favoriteIds.has(song.id);
              const isPlaying = currentSong?.id === song.id;
              
              return (
                <div
                  key={song.id}
                  className={`flex items-center gap-4 p-3 rounded-[24px] transition-all cursor-pointer group active:scale-[0.99] ${
                    isPlaying ? 'bg-[#7C3AED]/10' : 'hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                  onClick={() => playSong(song)}
                >
                  {/* Thumbnail */}
                  <div className="relative w-16 h-16 shrink-0 rounded-[18px] overflow-hidden shadow-sm bg-black/5 dark:bg-white/5">
                    <Image 
                      src={youtubeExtractionService.normalizeUrl(song.thumbnailUrl) || 'https://music.youtube.com/img/on_music_logo_mono.svg'} 
                      alt={song.title} 
                      fill 
                      sizes="64px"
                      unoptimized
                      className={`object-cover transition-transform duration-500 ${isPlaying ? 'scale-110' : 'group-hover:scale-110'}`} 
                    />
                    {isPlaying && (
                       <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                         {isBuffering ? (
                           <Loader2 size={20} className="text-white animate-spin" />
                         ) : (
                           <Music size={20} className="text-white animate-pulse" />
                         )}
                       </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      {song.isExplicit && (
                        <span className="shrink-0 flex items-center justify-center w-3.5 h-3.5 bg-black/10 dark:bg-white/10 rounded-[2px] text-[8px] font-black text-black/60 dark:text-white/60 border border-black/5 dark:border-white/5">
                          E
                        </span>
                      )}
                      <MarqueeText
                        text={song.title}
                        className={`font-bold text-sm leading-tight transition-colors ${
                          isPlaying ? 'text-[#7C3AED]' : 'text-black dark:text-white'
                        }`}
                      />
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <MarqueeText
                        text={song.artistName}
                        className="text-[10px] text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider max-w-[120px]"
                      />
                    {song.viewCountText && (
                         <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                          <span className="w-0.5 h-0.5 rounded-full bg-gray-300 dark:bg-gray-600 shrink-0" />
                          <p className="text-[9px] text-gray-400 font-medium shrink-0 italic">{song.viewCountText}</p>
                         </div>
                      )}
                      {(song.durationText || song.duration) && (
                        <>
                          <span className="w-0.5 h-0.5 rounded-full bg-gray-300 dark:bg-gray-600 shrink-0" />
                          <p className="text-[9px] text-gray-400 font-black shrink-0">
                            {song.durationText || formatDuration(song.duration || 0)}
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 sm:gap-1 ml-auto">
                    <button
                      onClick={(e) => { e.stopPropagation(); LibraryService.toggleFavorite(song); }}
                      className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${
                        isFavorite ? 'text-[var(--accent-primary)] bg-[var(--accent-primary)]/10' : 'text-gray-400 hover:bg-black/10 dark:hover:bg-white/10'
                      }`}
                    >
                      <Heart size={16} fill={isFavorite ? "currentColor" : "none"} />
                    </button>
                    
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelectedSong(song); setIsModalOpen(true); }}
                      className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10 rounded-full transition-all"
                    >
                      <ListPlus size={16} />
                    </button>

                    <button
                      onClick={(e) => { e.stopPropagation(); toggleDownload(song); }}
                      className={`w-8 h-8 flex items-center justify-center rounded-full transition-all ${
                        isDownloaded ? 'text-[#7C3AED] bg-[#7C3AED]/10'
                        : isDownloading ? 'text-gray-300'
                        : 'text-gray-400 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10'
                      }`}
                      disabled={isDownloading}
                    >
                      {isDownloading ? <Loader2 size={14} className="animate-spin" /> : isDownloaded ? <Check size={14} /> : <Download size={16} />}
                    </button>

                    {isDebugMode && song.rawInfo && (
                      <button
                        onClick={(e) => { 
                          e.stopPropagation(); 
                          console.log('CHRIS_DEBUG_RAW_INFO:', JSON.parse(song.rawInfo || '{}'));
                          toast.info('Info enviada a la consola');
                        }}
                        className="w-8 h-8 flex items-center justify-center text-xs font-bold text-gray-400 hover:text-black dark:hover:text-white hover:bg-black/10 dark:hover:bg-white/10 rounded-full transition-all"
                        title="Ver Info Raw"
                      >
                        JSON
                      </button>
                    )}
                  </div>

                </div>
              );
            })}
            
            {/* Infinite Scroll Loader / Skeletons / Load More Button */}
            {hasMore && lastSearchedQuery && (
              <div ref={loaderRef} className="py-12 flex flex-col items-center justify-center">
                {loading ? (
                   <div className="flex flex-col gap-1 w-full">
                     {[1, 2, 3].map((i) => (
                       <div key={i} className="flex items-center gap-4 p-3 rounded-[24px] opacity-40 animate-pulse">
                         <div className="w-16 h-16 bg-gray-200 dark:bg-white/10 rounded-[18px]" />
                         <div className="flex-1 space-y-2">
                           <div className="h-4 bg-gray-200 dark:bg-white/10 rounded w-2/3" />
                           <div className="h-3 bg-gray-200 dark:bg-white/10 rounded w-1/3" />
                         </div>
                       </div>
                     ))}
                   </div>
                ) : (
                  <>
                    {!YouTubeExtractionService.isAndroid() ? (
                      <button
                        onClick={loadMore}
                        className="flex items-center gap-2 px-8 py-4 bg-[#7C3AED]/10 hover:bg-[#7C3AED]/20 text-[#7C3AED] rounded-full text-sm font-black uppercase tracking-widest transition-all scale-100 hover:scale-105 active:scale-95"
                      >
                        <ListPlus size={18} />
                        Cargar más resultados
                      </button>
                    ) : (
                      <div className="h-10" /> // Spacer for observer on mobile
                    )}
                  </>
                )}
              </div>
            )}
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

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center opacity-50 flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <Loader2 className="animate-spin text-[#7C3AED]" size={40} />
      <span className="font-black uppercase tracking-widest text-xs">Iniciando buscador...</span>
    </div>}>
      <SearchContent />
    </Suspense>
  );
}
