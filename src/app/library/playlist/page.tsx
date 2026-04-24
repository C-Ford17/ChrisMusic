'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/db/db';
import { ChevronLeft, Play, Trash2, Download, Music } from 'lucide-react';
import Image from 'next/image';
import { usePlayerStore } from '@/features/player/store/playerStore';
import { LibraryService } from '@/features/library/services/libraryService';
import { type Song } from '@/core/types/music';
import { Suspense } from 'react';
import { MarqueeText } from '@/shared/components/MarqueeText';
import { SortableSongList } from '@/shared/components/SortableSongList';

function PlaylistContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const playlistId = searchParams.get('id') || '';
  
  const { playSongInQueue, downloadMultiple } = usePlayerStore();

  const playlist = useLiveQuery(() => db.playlists.get(playlistId), [playlistId]);
  const entries = useLiveQuery(() => db.playlistEntries.where('playlistId').equals(playlistId).sortBy('orderIndex'), [playlistId]) || [];

  const handleReorder = async (newOrder: any[]) => {
    await LibraryService.updatePlaylistOrder(playlistId, newOrder.map(e => e.id));
  };

  if (!playlistId) {
    router.push('/library');
    return null;
  }
  
  if (playlist === undefined) return <div className="p-4 flex-1 pb-32 text-center text-white/50">Loading...</div>;
  if (playlist === null) return <div className="p-4 flex-1 pb-32 text-center text-red-400">Playlist not found</div>;

  return (
    <main className="flex-1 pb-32 min-h-screen flex flex-col pt-safe bg-white dark:bg-[#0A0A0A] transition-colors duration-500">
      {/* Header */}
      <div className="px-6 mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
           <button onClick={() => router.back()} className="p-3 -ml-3 text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 rounded-2xl transition-all">
             <ChevronLeft size={32} strokeWidth={2.5} />
           </button>
           <div>
            <h1 className="text-3xl font-black text-black dark:text-white tracking-tighter leading-none">{playlist.name}</h1>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-black/30 dark:text-white/30 mt-2">Mezcla Personalizada</p>
           </div>
        </div>
        <button 
          onClick={async () => {
            if (confirm('¿Estás seguro de que quieres eliminar esta mezcla?')) {
              await LibraryService.deletePlaylist(playlist.id);
              router.push('/library');
            }
          }}
          className="p-3 text-red-500/40 hover:text-red-500 hover:bg-red-500/10 rounded-2xl transition-all"
          title="Eliminar Mezcla"
        >
          <Trash2 size={24} strokeWidth={2.5} />
        </button>
      </div>

      {/* Playlist Content */}
      <div className="px-6 flex flex-col gap-2">
        {entries.length > 0 && (
          <div className="flex justify-end mb-4">
            <button 
              onClick={() => downloadMultiple(entries.map(e => e.song as Song))}
              className="flex items-center gap-2 px-6 py-3 bg-black/5 dark:bg-white/5 text-black dark:text-white hover:bg-[var(--accent-primary)] hover:text-white rounded-full text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
            >
              <Download size={16} /> Descargar Todas
            </button>
          </div>
        )}
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-32 opacity-20">
            <Music size={80} className="mb-6" />
            <p className="mb-2 text-2xl font-black tracking-tighter text-black dark:text-white">Esta mezcla está vacía</p>
            <p className="text-sm font-medium">Busca canciones y añádelas aquí.</p>
          </div>
        ) : (
          <SortableSongList 
            songs={entries}
            onReorder={handleReorder}
            onPlay={playSongInQueue}
            onRemove={(id) => LibraryService.removeSongFromPlaylist(Number(id))}
            type="playlist"
          />
        )}
      </div>
    </main>
  );
}

export default function PlaylistPage() {
  return (
    <Suspense fallback={<div className="p-4 flex-1 pb-32 text-center text-white/50">Loading...</div>}>
      <PlaylistContent />
    </Suspense>
  );
}
