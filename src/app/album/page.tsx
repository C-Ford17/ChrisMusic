'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { youtubeExtractionService } from '@/features/player/services/youtubeExtractionService';
import { usePlayerStore } from '@/features/player/store/playerStore';
import { type Album, type Song } from '@/core/types/music';
import { ArrowLeft, Play, Bookmark, BookmarkCheck, ListPlus, Download, Check, Loader2, Music, Shuffle } from 'lucide-react';
import Image from 'next/image';
import { MarqueeText } from '@/shared/components/MarqueeText';
import { LibraryService } from '@/features/library/services/libraryService';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/db/db';

function AlbumContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const router = useRouter();
  const [album, setAlbum] = useState<Album | null>(null);
  const [loading, setLoading] = useState(true);
  const { playSong, currentSong, isBuffering, toggleDownload, downloadingSongs, setQueue } = usePlayerStore();

  const isSaved = useLiveQuery(
    async () => {
      if (!id) return false;
      const albumEntry = await db.savedAlbums.get(id as string);
      return !!albumEntry;
    },
    [id]
  );

  const downloadedIds = useLiveQuery(
    async () => {
      const all = await db.offlineSongs.toArray();
      return new Set(all.map(s => s.id));
    },
    []
  ) || new Set<string>();

  useEffect(() => {
    if (id) {
      youtubeExtractionService.getAlbumDetails(id as string)
        .then(details => {
          setAlbum(details);
          setLoading(false);
        })
        .catch(err => {
          console.error("Error loading album details:", err);
          setLoading(false);
        });
    }
  }, [id]);

  const toggleSave = async () => {
    if (!album) return;
    if (isSaved) {
      await db.savedAlbums.delete(album.id);
    } else {
      await db.savedAlbums.add({
        id: album.id,
        title: album.title,
        artistName: album.artistName,
        thumbnailUrl: album.thumbnailUrl,
        savedAt: Date.now()
      });
    }
  };

  const playAlbum = (shuffle = false) => {
    if (!album?.songs || album.songs.length === 0) return;
    
    let songsToPlay = [...album.songs];
    if (shuffle) {
      songsToPlay = songsToPlay.sort(() => Math.random() - 0.5);
    }
    
    setQueue(songsToPlay);
    playSong(songsToPlay[0]);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="w-12 h-12 border-4 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-black uppercase tracking-widest opacity-50">Cargando álbum...</p>
      </div>
    );
  }

  if (!album) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
        <h2 className="text-2xl font-black mb-4">Álbum no encontrado</h2>
        <button onClick={() => router.back()} className="flex items-center gap-2 text-[#7C3AED] font-bold">
          <ArrowLeft size={20} /> Volver
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black pb-40">
      {/* Header */}
      <div className="relative pt-12 px-6 max-w-5xl mx-auto">
        <button 
          onClick={() => router.back()}
          className="mb-8 p-3 bg-black/5 dark:bg-white/5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-all inline-flex"
        >
          <ArrowLeft size={24} />
        </button>

        <div className="flex flex-col md:flex-row gap-10 items-center md:items-end">
          <div className="relative w-64 h-64 shrink-0 rounded-[48px] overflow-hidden shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
            <Image src={youtubeExtractionService.normalizeUrl(album.thumbnailUrl)} alt={album.title} fill className="object-cover" />
          </div>

          <div className="flex-1 text-center md:text-left">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#7C3AED] mb-2">Álbum</p>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter mb-4 leading-tight">{album.title}</h1>
            <div className="flex items-center justify-center md:justify-start gap-4 mb-8">
              <span className="font-bold text-gray-500 hover:text-black dark:hover:text-white cursor-pointer transition-colors">{album.artistName}</span>
              <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-700" />
              <span className="text-gray-400 font-medium">{album.songs?.length || 0} canciones</span>
            </div>

            <div className="flex items-center justify-center md:justify-start gap-3">
              <button 
                onClick={() => playAlbum(false)}
                className="flex items-center gap-2 bg-[#7C3AED] text-white px-8 py-3.5 rounded-full font-black uppercase tracking-widest shadow-xl shadow-[#7C3AED]/20 hover:scale-105 active:scale-95 transition-all"
              >
                <Play size={20} fill="currentColor" />
                Reproducir
              </button>
              <button 
                onClick={() => playAlbum(true)}
                className="p-3.5 bg-black/5 dark:bg-white/5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-all border border-black/5 dark:border-white/5"
              >
                <Shuffle size={20} />
              </button>
              <button 
                onClick={toggleSave}
                className={`p-3.5 rounded-full transition-all border ${
                  isSaved 
                    ? 'bg-[#7C3AED]/10 border-[#7C3AED] text-[#7C3AED]' 
                    : 'bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/5 text-gray-500'
                }`}
              >
                {isSaved ? <BookmarkCheck size={20} /> : <Bookmark size={20} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tracklist */}
      <div className="max-w-5xl mx-auto px-6 mt-12">
        <div className="flex flex-col gap-1">
          {album.songs?.map((song, index) => {
            const isPlaying = currentSong?.id === song.id;
            const isDownloaded = downloadedIds.has(song.id);
            const isDownloading = downloadingSongs.has(song.id);

            return (
              <div 
                key={song.id}
                onClick={() => playSong(song)}
                className={`flex items-center gap-4 p-3 rounded-[24px] cursor-pointer group transition-all ${
                  isPlaying ? 'bg-[#7C3AED]/10' : 'hover:bg-black/5 dark:hover:bg-white/5'
                }`}
              >
                <span className="w-8 text-center text-xs font-black opacity-20 group-hover:opacity-100 transition-opacity">
                  {index + 1}
                </span>
                
                <div className="flex-1 min-w-0 pr-4">
                  <MarqueeText text={song.title} className={`font-bold text-sm ${isPlaying ? 'text-[#7C3AED]' : ''}`} />
                  <p className="text-[10px] text-gray-500 font-medium uppercase tracking-widest mt-0.5">{album.artistName}</p>
                </div>

                <div className="flex items-center gap-1 ml-auto">
                  <button 
                    onClick={(e) => { e.stopPropagation(); toggleDownload(song); }}
                    className={`p-2 rounded-full transition-all ${
                      isDownloaded ? 'text-[#7C3AED] bg-[#7C3AED]/5' : 'text-gray-400 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    {isDownloading ? <Loader2 size={16} className="animate-spin" /> : isDownloaded ? <Check size={16} /> : <Download size={16} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function AlbumPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="w-12 h-12 border-4 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-black uppercase tracking-widest opacity-50">Cargando...</p>
      </div>
    }>
      <AlbumContent />
    </Suspense>
  );
}
