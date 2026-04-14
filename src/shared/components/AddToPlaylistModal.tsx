import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/db/db';
import { LibraryService } from '@/features/library/services/libraryService';
import { type Song } from '@/core/types/music';
import { X, Plus, Music, Check } from 'lucide-react';

interface AddToPlaylistModalProps {
  song: Song | null;
  isOpen: boolean;
  onClose: () => void;
}

export function AddToPlaylistModal({ song, isOpen, onClose }: AddToPlaylistModalProps) {
  const playlists = useLiveQuery(() => db.playlists.orderBy('createdAt').reverse().toArray(), []) || [];
  const [newPlaylistName, setNewPlaylistName] = useState('');

  // Detectar en qué playlists ya está esta canción
  const playlistsWithSong = useLiveQuery(async () => {
    if (!song) return new Set<string>();
    const entries = await db.playlistEntries.where('playlistId').notEqual('').toArray();
    return new Set(entries.filter(e => e.song.id === song.id).map(e => e.playlistId));
  }, [song?.id]) || new Set<string>();

  if (!isOpen || !song) return null;

  const handleCreate = async () => {
    if (newPlaylistName.trim()) {
      const id = await LibraryService.createPlaylist(newPlaylistName.trim());
      await LibraryService.addSongToPlaylist(id, song);
      setNewPlaylistName('');
      onClose();
    }
  };

  const handleSelect = async (playlistId: string) => {
    if (playlistsWithSong.has(playlistId)) return; // ya está, no hacer nada
    await LibraryService.addSongToPlaylist(playlistId, song);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/40 dark:bg-black/60 backdrop-blur-md flex items-center justify-center p-4 overflow-hidden overflow-y-auto transition-all" onClick={onClose}>
      <div 
        className="bg-white dark:bg-[#181818] border border-black/5 dark:border-white/10 flex flex-col p-8 rounded-[32px] w-full max-w-sm shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] dark:shadow-2xl relative max-h-[85vh] overflow-hidden transition-colors" 
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-6 right-6 p-2 bg-black/5 dark:bg-white/5 rounded-full text-black/40 dark:text-white/50 hover:text-red-500 transition-all">
          <X size={20} />
        </button>
        <h2 className="text-2xl font-black mb-1 text-black dark:text-white tracking-tight">Agregar a Playlist</h2>
        <p className="text-xs text-black/30 dark:text-white/30 font-bold mb-6 truncate">{song.title}</p>
        
        {/* Playlist List */}
        <div className="flex-1 overflow-y-auto mb-6 space-y-2 pr-1 custom-scrollbar">
          {playlists.map(pl => {
            const alreadyAdded = playlistsWithSong.has(pl.id);
            return (
              <button
                key={pl.id}
                onClick={() => handleSelect(pl.id)}
                disabled={alreadyAdded}
                className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all text-left group
                  ${alreadyAdded
                    ? 'bg-[var(--accent-primary)]/5 border-[var(--accent-primary)]/20 cursor-not-allowed opacity-70'
                    : 'bg-black/[0.02] dark:bg-white/[0.02] hover:bg-black/[0.05] dark:hover:bg-white/[0.05] border-black/5 dark:border-white/5'
                  }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-all
                  ${alreadyAdded
                    ? 'bg-[var(--accent-primary)]/10'
                    : 'bg-gray-100 dark:bg-white/5 group-hover:scale-110'
                  }`}>
                  {alreadyAdded
                    ? <Check size={20} className="text-[var(--accent-primary)]" />
                    : <Music size={20} className="text-[var(--accent-primary)]" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <span className={`font-bold truncate text-sm block ${alreadyAdded ? 'text-[var(--accent-primary)]' : 'text-black/70 dark:text-white/70 group-hover:text-black dark:group-hover:text-white'}`}>
                    {pl.name}
                  </span>
                  {alreadyAdded && (
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--accent-primary)]/60">
                      Ya añadida
                    </span>
                  )}
                </div>
              </button>
            );
          })}
          {playlists.length === 0 && (
             <div className="py-12 text-center space-y-3">
               <div className="w-16 h-16 bg-black/5 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                 <Music size={24} className="text-black/10 dark:text-white/10" />
               </div>
               <p className="text-black/40 dark:text-white/40 text-sm font-bold">Aún no tienes playlists.</p>
             </div>
          )}
        </div>

        {/* Create new inline */}
        <div className="pt-6 border-t border-black/5 dark:border-white/10">
          <p className="text-[10px] text-black/20 dark:text-white/30 mb-3 font-black uppercase tracking-[0.2em]">Crear nueva</p>
          <div className="flex gap-2">
            <input 
              type="text" 
              placeholder="Mi nueva mezcla..." 
              className="flex-1 bg-black/5 dark:bg-black/50 border border-black/5 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] transition-all placeholder:text-black/20 dark:placeholder:text-white/20"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
            />
            <button 
              onClick={handleCreate}
              disabled={!newPlaylistName.trim()}
              className="w-12 h-12 flex items-center justify-center rounded-xl bg-[var(--accent-primary)] text-white hover:brightness-110 shadow-lg shadow-[var(--accent-primary)]/20 disabled:opacity-50 transition-all shrink-0 active:scale-90"
              title="Crear y añadir"
            >
              <Plus size={24} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
