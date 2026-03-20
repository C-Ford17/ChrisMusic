'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/db/db';
import { ChevronLeft, Play, X, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { usePlayerStore } from '@/features/player/store/playerStore';
import { LibraryService } from '@/features/library/services/libraryService';
import { type Song } from '@/core/types/music';
import { Suspense } from 'react';

function PlaylistContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const playlistId = searchParams.get('id') || '';
  
  const { playSongInQueue } = usePlayerStore();

  const playlist = useLiveQuery(() => db.playlists.get(playlistId), [playlistId]);
  const entries = useLiveQuery(() => db.playlistEntries.where('playlistId').equals(playlistId).sortBy('addedAt'), [playlistId]) || [];

  if (!playlistId) {
    router.push('/library');
    return null;
  }
  
  if (playlist === undefined) return <div className="p-4 flex-1 pb-32 text-center text-white/50">Loading...</div>;
  if (playlist === null) return <div className="p-4 flex-1 pb-32 text-center text-red-400">Playlist not found</div>;

  return (
    <main className="flex-1 pb-32 min-h-screen flex flex-col pt-safe">
      {/* Header */}
      <div className="px-4 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
           <button onClick={() => router.back()} className="p-2 -ml-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors">
             <ChevronLeft size={28} />
           </button>
           <h1 className="text-2xl font-bold truncate max-w-[200px] sm:max-w-md">{playlist.name}</h1>
        </div>
        <button 
          onClick={async () => {
            if (confirm('Are you sure you want to delete this playlist?')) {
              await LibraryService.deletePlaylist(playlist.id);
              router.push('/library');
            }
          }}
          className="p-2 text-red-500/70 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-colors"
          title="Delete Playlist"
        >
          <Trash2 size={20} />
        </button>
      </div>

      {/* Playlist Content */}
      <div className="px-4 flex flex-col gap-2">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20 opacity-50">
            <p className="mb-2 text-lg">Playlist is empty</p>
            <p className="text-sm">Find songs and add them to this playlist.</p>
          </div>
        ) : (
          entries.map((entry) => (
            <div 
              key={entry.id} 
              className="group flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-colors cursor-pointer" 
              onClick={() => playSongInQueue(entry.song as Song, entries.map(e => e.song as Song))}
            >
              <div className="flex items-center min-w-0 pr-4">
                <div className="relative w-12 h-12 mr-4 shrink-0 bg-black rounded overflow-hidden shadow">
                  <Image src={entry.song.thumbnailUrl} alt={entry.song.title} fill sizes="48px" className="object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                    <Play size={20} className="text-white" fill="currentColor" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-white font-medium text-sm truncate">{entry.song.title}</h4>
                  <p className="text-gray-400 text-xs truncate">{entry.song.artistName}</p>
                </div>
              </div>
              
              {/* Remove Song Action */}
              <button 
                  className="text-gray-500 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity p-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    LibraryService.removeSongFromPlaylist(entry.id!);
                  }}
                  title="Remove from Playlist"
                >
                  <X size={16} />
              </button>
            </div>
          ))
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
