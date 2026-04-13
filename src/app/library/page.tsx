'use client';

import { useState } from 'react';
import { Plus, Play, Heart, Clock, X, Music, Download, Trash2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/db/db';
import { usePlayerStore } from '@/features/player/store/playerStore';
import Image from 'next/image';
import Link from 'next/link';
import { type Song } from '@/core/types/music';
import { LibraryService } from '@/features/library/services/libraryService';
import { MarqueeText } from '@/shared/components/MarqueeText';
import { YouTubeExtractionService } from '@/features/player/services/youtubeExtractionService';

export default function LibraryPage() {
  const [activeTab, setActiveTab] = useState<'playlists' | 'favorites' | 'history' | 'offline'>('playlists');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  const { playSongInQueue, toggleDownload } = usePlayerStore();

  const favorites = useLiveQuery(() => db.favorites.orderBy('addedAt').reverse().toArray(), []) || [];
  const history = useLiveQuery(() => db.history.orderBy('playedAt').reverse().toArray(), []) || [];
  const playlists = useLiveQuery(() => db.playlists.orderBy('createdAt').reverse().toArray(), []) || [];
  const offlineSongs = useLiveQuery(() => db.offlineSongs.orderBy('downloadedAt').reverse().toArray(), []) || [];

  const filteredPlaylists = playlists.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredFavorites = favorites.filter(f => 
    f.song.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    f.song.artistName.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredHistory = history.filter(h => 
    h.song.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    h.song.artistName.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredOffline = offlineSongs.filter(o => 
    o.song.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    o.song.artistName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <main className="flex-1 p-6 pb-40 min-h-screen pt-safe bg-white dark:bg-[#0A0A0A] transition-colors duration-500">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-4xl font-black tracking-tighter text-black dark:text-white">Tu Biblioteca</h1>
        <Link href="/settings" className="p-3 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-2xl transition-all group">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-settings text-black/40 dark:text-white/40 group-hover:rotate-90 transition-transform duration-500"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
        </Link>
      </div>

      {/* Search Input */}
      <div className="mb-8 relative">
          <input 
            type="text" 
            placeholder={`Buscar en ${activeTab === 'playlists' ? 'playlists' : activeTab === 'favorites' ? 'favoritos' : activeTab === 'history' ? 'historial' : 'descargas'}...`}
            className="w-full bg-black/[0.03] dark:bg-white/[0.05] border border-black/5 dark:border-white/10 rounded-2xl py-4 pl-14 pr-4 text-black dark:text-white placeholder:text-black/20 dark:placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/20 focus:bg-white dark:focus:bg-white/10 transition-all font-medium"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <div className="absolute left-5 top-1/2 -translate-y-1/2 text-black/20 dark:text-white/20">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-search"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          </div>
          {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-5 top-1/2 -translate-y-1/2 text-black/20 dark:text-white/30 hover:text-red-500 transition-all"
              >
                  <X size={20} />
              </button>
          )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-black/5 dark:border-white/10 mb-8 overflow-x-auto no-scrollbar scroll-smooth">
        <button 
          className={`pb-4 px-6 text-[10px] whitespace-nowrap font-black uppercase tracking-[0.2em] transition-all relative ${activeTab === 'playlists' ? 'text-[var(--accent-primary)]' : 'text-black/30 dark:text-gray-400 hover:text-black dark:hover:text-white'}`}
          onClick={() => setActiveTab('playlists')}
        >
          Mezclas
          {activeTab === 'playlists' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-[var(--accent-primary)] rounded-t-full shadow-[0_0_10px_var(--accent-primary)]/50" />}
        </button>
        <button 
          className={`pb-4 px-6 text-[10px] whitespace-nowrap font-black uppercase tracking-[0.2em] transition-all relative ${activeTab === 'favorites' ? 'text-[var(--accent-primary)]' : 'text-black/30 dark:text-gray-400 hover:text-black dark:hover:text-white'}`}
          onClick={() => setActiveTab('favorites')}
        >
          Favoritos
          {activeTab === 'favorites' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-[var(--accent-primary)] rounded-t-full shadow-[0_0_10px_var(--accent-primary)]/50" />}
        </button>
        <button 
          className={`pb-4 px-6 text-[10px] whitespace-nowrap font-black uppercase tracking-[0.2em] transition-all relative ${activeTab === 'offline' ? 'text-[var(--accent-primary)]' : 'text-black/30 dark:text-gray-400 hover:text-black dark:hover:text-white'}`}
          onClick={() => setActiveTab('offline')}
        >
          Descargas
          {activeTab === 'offline' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-[var(--accent-primary)] rounded-t-full shadow-[0_0_10px_var(--accent-primary)]/50" />}
        </button>
        <button 
          className={`pb-4 px-6 text-[10px] whitespace-nowrap font-black uppercase tracking-[0.2em] transition-all relative ${activeTab === 'history' ? 'text-[var(--accent-primary)]' : 'text-black/30 dark:text-gray-400 hover:text-black dark:hover:text-white'}`}
          onClick={() => setActiveTab('history')}
        >
          Historia
          {activeTab === 'history' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-[var(--accent-primary)] rounded-t-full shadow-[0_0_10px_var(--accent-primary)]/50" />}
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'playlists' && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {/* Create Playlist Button */}
          <div 
            onClick={() => setIsModalOpen(true)}
            className="aspect-square bg-black/[0.02] dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-3xl flex flex-col items-center justify-center cursor-pointer hover:bg-[var(--accent-primary)]/5 hover:border-[var(--accent-primary)]/20 transition-all group shadow-sm hover:shadow-xl"
          >
            <div className="w-16 h-16 rounded-full bg-[var(--accent-primary)] flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 group-hover:rotate-90 transition-all">
              <Plus size={32} className="text-white" />
            </div>
            <span className="font-black text-[10px] uppercase tracking-widest text-black/50 dark:text-gray-400 group-hover:text-[var(--accent-primary)]">Nueva Mezcla</span>
          </div>

          {/* Liked Songs Tile */}
          <div 
            className="aspect-square bg-gradient-to-br from-[var(--accent-primary)] to-indigo-900 rounded-3xl p-6 flex flex-col justify-end cursor-pointer shadow-xl relative overflow-hidden group"
            onClick={() => setActiveTab('favorites')}
          >
            <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-all" />
            <Heart size={40} className="absolute top-6 right-6 opacity-30 text-white group-hover:scale-125 transition-transform" fill="currentColor" />
            <h3 className="font-black relative z-10 text-xl text-white tracking-tighter">Me Gusta</h3>
            <p className="text-white/60 text-xs font-bold relative z-10 mt-1 uppercase tracking-widest">{favorites.length} Pistas</p>
          </div>

          {/* User Playlists */}
          {filteredPlaylists.map((playlist) => (
            <Link href={`/library/playlist?id=${playlist.id}`} key={playlist.id}>
              <div className="aspect-square bg-black/[0.02] dark:bg-white/5 rounded-3xl p-6 flex flex-col justify-end cursor-pointer hover:bg-white dark:hover:bg-white/10 transition-all relative overflow-hidden group border border-black/5 dark:border-white/10 hover:border-[var(--accent-primary)]/30 shadow-sm hover:shadow-2xl">
                <Music size={40} className="absolute top-6 right-6 opacity-[0.05] dark:opacity-20 text-black dark:text-white group-hover:scale-110 group-hover:text-[var(--accent-primary)] group-hover:opacity-40 transition-all" />
                <h3 className="font-black relative z-10 text-lg text-black dark:text-white truncate tracking-tighter">{playlist.name}</h3>
                <p className="text-black/30 dark:text-white/40 text-[10px] font-black relative z-10 mt-1 uppercase tracking-widest">Playlist</p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {activeTab === 'favorites' && (
        <div className="flex flex-col gap-3">
          {favorites.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-32 opacity-20">
              <Heart size={80} className="mb-6" />
              <p className="mb-2 text-2xl font-black tracking-tighter text-black dark:text-white">Sin favoritos</p>
              <p className="text-sm font-medium text-black/50 dark:text-white/50">Pulsa el corazón en cualquier canción.</p>
            </div>
          ) : (
            filteredFavorites.map((fav) => (
              <div 
                key={fav.id} 
                className="group flex items-center justify-between p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] hover:bg-white dark:hover:bg-white/5 border border-transparent hover:border-black/5 dark:hover:border-white/5 shadow-sm hover:shadow-xl transition-all cursor-pointer" 
                onClick={() => playSongInQueue(fav.song as Song, filteredFavorites.map(f => f.song as Song))}
              >
                <div className="flex items-center min-w-0 pr-4">
                  <div className="relative w-12 h-12 mr-4 shrink-0 bg-black rounded overflow-hidden shadow">
                    <Image src={YouTubeExtractionService.normalizeUrl(fav.song.thumbnailUrl)} alt={fav.song.title} fill sizes="48px" className="object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Play size={20} className="text-white" fill="currentColor" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-black dark:text-white font-bold text-sm overflow-hidden">
                      <MarqueeText text={fav.song.title} />
                    </h4>
                    <p className="text-black/40 dark:text-gray-400 text-xs font-medium truncate">{fav.song.artistName}</p>
                  </div>
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    LibraryService.removeFavorite(fav.id);
                  }}
                  className="p-3 text-black/20 dark:text-white/20 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-all"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'offline' && (
        <div className="flex flex-col gap-3">
          {offlineSongs.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-32 opacity-20">
              <Download size={80} className="mb-6" />
              <p className="mb-2 text-2xl font-black tracking-tighter text-black dark:text-white">Sin descargas</p>
              <p className="text-sm font-medium text-black/50 dark:text-white/50">Busca canciones y descárgalas para usarlas offline.</p>
            </div>
          ) : (
            filteredOffline.map((item) => (
              <div 
                key={item.id} 
                className="group flex items-center justify-between p-4 rounded-3xl bg-black/[0.02] dark:bg-white/[0.02] hover:bg-white dark:hover:bg-white/5 border border-transparent hover:border-black/5 dark:hover:border-white/5 shadow-sm hover:shadow-xl transition-all cursor-pointer" 
                onClick={() => playSongInQueue(item.song as Song, filteredOffline.map(o => o.song as Song))}
              >
                <div className="flex items-center min-w-0 pr-4">
                  <div className="relative w-14 h-14 mr-4 shrink-0 bg-gray-200 dark:bg-black rounded-2xl overflow-hidden shadow-sm">
                    <Image src={YouTubeExtractionService.normalizeUrl(item.song.thumbnailUrl)} alt={item.song.title} fill sizes="56px" className="object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Play size={24} className="text-white" fill="currentColor" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-black dark:text-white font-bold text-base overflow-hidden tracking-tight">
                      <MarqueeText text={item.song.title} />
                    </h4>
                    <p className="text-black/40 dark:text-gray-400 text-xs font-medium truncate mt-0.5 uppercase tracking-wider">{item.song.artistName}</p>
                  </div>
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDownload(item.song as Song);
                  }}
                  className="p-3 text-black/20 dark:text-white/20 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-all"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="flex flex-col gap-3">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-32 opacity-20">
              <Clock size={80} className="mb-6" />
              <p className="mb-2 text-2xl font-black tracking-tighter text-black dark:text-white">Sin historia</p>
              <p className="text-sm font-medium text-black/50 dark:text-white/50">Las canciones que escuches aparecerán aquí.</p>
            </div>
          ) : (
            filteredHistory.map((hist) => (
              <div 
                key={hist.id} 
                className="group flex items-center justify-between p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] hover:bg-white dark:hover:bg-white/5 border border-transparent hover:border-black/5 dark:hover:border-white/5 shadow-sm hover:shadow-xl transition-all cursor-pointer" 
                onClick={() => playSongInQueue(hist.song as Song, filteredHistory.map(h => h.song as Song))}
              >
                <div className="flex items-center min-w-0 pr-4">
                  <div className="relative w-14 h-14 mr-4 shrink-0 bg-gray-200 dark:bg-black rounded-xl overflow-hidden shadow-sm group-hover:scale-105 transition-transform">
                    <Image src={YouTubeExtractionService.normalizeUrl(hist.song.thumbnailUrl)} alt={hist.song.title} fill sizes="56px" className="object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                      <Play size={24} className="text-white" fill="currentColor" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 opacity-80 group-hover:opacity-100 transition-opacity">
                    <h4 className="text-black dark:text-white font-bold text-sm overflow-hidden">
                      <MarqueeText text={hist.song.title} />
                    </h4>
                    <p className="text-black/40 dark:text-gray-400 text-xs font-medium truncate mt-0.5">
                      {hist.song.artistName} • {new Date(hist.playedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Create Playlist Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-110 bg-black/40 dark:bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#181818] border border-black/5 dark:border-white/10 p-8 rounded-[32px] w-full max-w-sm shadow-2xl relative transition-all">
            <button 
              onClick={() => setIsModalOpen(false)}
              className="absolute top-6 right-6 p-2 bg-black/5 dark:bg-white/5 rounded-full text-black/40 dark:text-white/50 hover:text-red-500 transition-all"
            >
              <X size={20} />
            </button>
            
            <h2 className="text-2xl font-black mb-6 text-black dark:text-white tracking-tight">Nueva Mezcla</h2>
            <input 
              type="text" 
              placeholder="Nombre de la playlist" 
              className="w-full bg-black/5 dark:bg-black/50 border border-black/5 dark:border-white/10 rounded-xl px-4 py-4 text-black dark:text-white mb-8 focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/50 transition-all placeholder:text-black/20 dark:placeholder:text-white/20"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              autoFocus
            />
            
            <div className="flex gap-4">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-4 rounded-xl font-bold text-black/40 dark:text-white/50 hover:bg-black/5 dark:hover:bg-white/5 transition-all text-sm uppercase tracking-widest"
              >
                Cancelar
              </button>
              <button 
                onClick={async () => {
                  if (newPlaylistName.trim()) {
                    await LibraryService.createPlaylist(newPlaylistName.trim());
                    setNewPlaylistName('');
                    setIsModalOpen(false);
                  }
                }}
                disabled={!newPlaylistName.trim()}
                className="flex-1 py-4 rounded-xl font-black bg-[var(--accent-primary)] text-white hover:brightness-110 shadow-lg shadow-[var(--accent-primary)]/20 disabled:opacity-50 transition-all text-sm uppercase tracking-widest"
              >
                Crear
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
