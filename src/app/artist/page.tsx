'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { youtubeExtractionService } from '@/features/player/services/youtubeExtractionService';
import { usePlayerStore } from '@/features/player/store/playerStore';
import { type Artist, type Song, type Album } from '@/core/types/music';
import { ArrowLeft, Play, UserPlus, UserCheck, ChevronRight, ChevronDown, Download, Check, Loader2, Music, ListMusic } from 'lucide-react';
import Image from 'next/image';
import { MarqueeText } from '@/shared/components/MarqueeText';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/db/db';

interface ArtistFull {
  id: string;
  name: string;
  thumbnailUrl: string;
  biography?: string;
  topSongs: Song[];
  albums: Album[];
  singles: Album[];
  playlists: Album[];
}

function SectionHeader({ title, onSeeAll }: { title: string; onSeeAll?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-5 px-1">
      <h2 className="text-xl font-black tracking-tight">{title}</h2>
      {onSeeAll && (
        <button
          onClick={onSeeAll}
          className="flex items-center gap-1 text-[#7C3AED] text-xs font-bold uppercase tracking-widest hover:opacity-70 transition-opacity"
        >
          Ver todo <ChevronRight size={14} />
        </button>
      )}
    </div>
  );
}

function AlbumCard({ item, onClick }: { item: any; onClick: () => void }) {
  const thumb = youtubeExtractionService.normalizeUrl(item.thumbnailUrl || item.thumbnail_url || '');
  const isPlaylist = item.resultType === 'playlist' || item.result_type === 'playlist';
  return (
    <div onClick={onClick} className="group cursor-pointer shrink-0 w-36">
      <div className={`relative w-36 h-36 overflow-hidden shadow-lg mb-3 group-hover:scale-105 transition-transform duration-300 ring-1 ring-black/5 dark:ring-white/5 ${isPlaylist ? 'rounded-[20px]' : 'rounded-[28px]'}`}>
        {thumb ? (
          <Image src={thumb} alt={item.title || item.name || ''} fill className="object-cover" />
        ) : (
          <div className="w-full h-full bg-black/10 dark:bg-white/10 flex items-center justify-center">
            <ListMusic size={32} className="opacity-20" />
          </div>
        )}
        {isPlaylist && (
          <div className="absolute bottom-2 right-2 bg-black/60 rounded-full p-1">
            <ListMusic size={12} className="text-white" />
          </div>
        )}
      </div>
      <p className="font-bold text-xs line-clamp-2 leading-tight group-hover:text-[#7C3AED] transition-colors">
        {item.title || item.name}
      </p>
      {item.durationText && (
        <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-1">{item.durationText}</p>
      )}
    </div>
  );
}

function ArtistContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const router = useRouter();
  const [artist, setArtist] = useState<ArtistFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAllSongs, setShowAllSongs] = useState(false);
  const [showFullBio, setShowFullBio] = useState(false);
  const { playSong, currentSong, isBuffering, toggleDownload, downloadingSongs, setQueue } = usePlayerStore();

  const isFollowed = useLiveQuery(
    async () => {
      if (!id) return false;
      return !!(await db.followedArtists.get(id as string));
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
      youtubeExtractionService.getArtistDetails(id as string)
        .then((details: any) => { setArtist(details); setLoading(false); })
        .catch(() => setLoading(false));
    }
  }, [id]);

  const toggleFollow = async () => {
    if (!artist) return;
    if (isFollowed) {
      await db.followedArtists.delete(artist.id);
    } else {
      await db.followedArtists.add({ id: artist.id, name: artist.name, thumbnailUrl: artist.thumbnailUrl, followedAt: Date.now() });
    }
  };

  const playAll = () => {
    if (!artist?.topSongs?.length) return;
    setQueue(artist.topSongs);
    playSong(artist.topSongs[0]);
  };

  const displayedSongs = artist?.topSongs;

  const goToAllSongs = () => {
    if (!artist) return;
    router.push(`/search?q=${encodeURIComponent(artist.name)}&tab=song`);
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <div className="w-12 h-12 border-4 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />
      <p className="text-xs font-black uppercase tracking-widest opacity-50">Cargando artista...</p>
    </div>
  );

  if (!artist) return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
      <h2 className="text-2xl font-black mb-4">Artista no encontrado</h2>
      <button onClick={() => router.back()} className="flex items-center gap-2 text-[#7C3AED] font-bold">
        <ArrowLeft size={20} /> Volver
      </button>
    </div>
  );

  const thumb = youtubeExtractionService.normalizeUrl(artist.thumbnailUrl);

  return (
    <div className="min-h-screen bg-white dark:bg-black pb-40">
      {/* Hero Header */}
      <div className="relative h-[45vh] w-full overflow-hidden">
        {thumb && (
          <>
            <Image src={thumb} alt={artist.name} fill className="object-cover blur-xl opacity-25 scale-110" />
            <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-black via-transparent to-black/20" />
          </>
        )}

        <button
          onClick={() => router.back()}
          className="absolute top-8 left-5 z-10 p-3 bg-black/20 dark:bg-white/10 backdrop-blur-md rounded-full hover:bg-black/30 dark:hover:bg-white/20 transition-all"
        >
          <ArrowLeft size={22} className="text-white" />
        </button>

        <div className="absolute inset-0 flex flex-col items-center justify-end pb-8 text-center">
          <div className="relative w-28 h-28 md:w-36 md:h-36 rounded-full overflow-hidden shadow-2xl mb-4 ring-4 ring-white/20">
            {thumb && <Image src={thumb} alt={artist.name} fill className="object-cover" />}
          </div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white drop-shadow-lg">{artist.name}</h1>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-center gap-3 pt-6 pb-2 px-6">
        <button
          onClick={playAll}
          className="flex items-center gap-2 bg-[#7C3AED] text-white px-8 py-3.5 rounded-full font-black uppercase tracking-widest shadow-xl shadow-[#7C3AED]/25 hover:scale-105 active:scale-95 transition-all"
        >
          <Play size={18} fill="currentColor" /> Reproducir
        </button>
        <button
          onClick={toggleFollow}
          className={`flex items-center gap-2 px-6 py-3.5 rounded-full font-black uppercase tracking-widest border-2 transition-all hover:scale-105 active:scale-95 ${
            isFollowed
              ? 'border-[#7C3AED] text-[#7C3AED] bg-[#7C3AED]/5'
              : 'border-black/10 dark:border-white/10 text-black dark:text-white bg-black/5 dark:bg-white/5'
          }`}
        >
          {isFollowed ? <UserCheck size={18} /> : <UserPlus size={18} />}
          {isFollowed ? 'Siguiendo' : 'Seguir'}
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-5 mt-8 space-y-12">

        {/* Biography */}
        {artist.biography && (
          <div className="bg-black/3 dark:bg-white/3 rounded-[28px] p-5">
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-black/40 dark:text-white/40 mb-3">Información</h2>
            <p className={`text-sm leading-relaxed text-black/70 dark:text-white/70 ${!showFullBio ? 'line-clamp-3' : ''}`}>
              {artist.biography}
            </p>
            <button
              onClick={() => setShowFullBio(v => !v)}
              className="mt-2 text-xs font-bold text-[#7C3AED] hover:opacity-70 transition-opacity flex items-center gap-1"
            >
              {showFullBio ? 'Ver menos' : 'Ver más'} <ChevronDown size={12} className={`transition-transform ${showFullBio ? 'rotate-180' : ''}`} />
            </button>
          </div>
        )}

        {/* Top Songs */}
        {artist.topSongs && artist.topSongs.length > 0 && (
          <div>
            <SectionHeader
              title="Top canciones"
              onSeeAll={goToAllSongs}
            />
            <div className="flex flex-col gap-1">
              {displayedSongs?.map((song, index) => {
                const isPlaying = currentSong?.id === song.id;
                const isDownloaded = downloadedIds.has(song.id);
                const isDownloading = downloadingSongs.has(song.id);
                return (
                  <div
                    key={song.id}
                    onClick={() => { setQueue(artist.topSongs); playSong(song); }}
                    className={`flex items-center gap-4 p-3 rounded-[20px] cursor-pointer group transition-all ${
                      isPlaying ? 'bg-[#7C3AED]/10' : 'hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    <span className="w-5 text-center text-xs font-black opacity-20 group-hover:opacity-60 transition-opacity shrink-0">
                      {isPlaying
                        ? (isBuffering ? <Loader2 size={12} className="animate-spin text-[#7C3AED]" /> : <Music size={12} className="text-[#7C3AED] animate-pulse" />)
                        : index + 1}
                    </span>
                    <div className="relative w-12 h-12 shrink-0 rounded-[14px] overflow-hidden">
                      <Image src={youtubeExtractionService.normalizeUrl(song.thumbnailUrl)} alt={song.title} fill className="object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <MarqueeText text={song.title} className={`font-bold text-sm ${isPlaying ? 'text-[#7C3AED]' : ''}`} />
                      <p className="text-[10px] text-gray-400 font-medium mt-0.5">{artist.name}</p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); toggleDownload(song); }}
                      className={`p-2 rounded-full transition-all shrink-0 ${
                        isDownloaded ? 'text-[#7C3AED] bg-[#7C3AED]/5' : 'text-gray-400 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5'
                      }`}
                    >
                      {isDownloading ? <Loader2 size={15} className="animate-spin" /> : isDownloaded ? <Check size={15} /> : <Download size={15} />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Albums */}
        {artist.albums && artist.albums.length > 0 && (
          <div>
            <SectionHeader title="Álbumes" />
            <div className="flex gap-5 overflow-x-auto pb-3 scrollbar-hide -mx-1 px-1">
              {artist.albums.map(album => (
                <AlbumCard
                  key={album.id}
                  item={album}
                  onClick={() => router.push(`/album?id=${album.id}`)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Singles & EPs */}
        {artist.singles && artist.singles.length > 0 && (
          <div>
            <SectionHeader title="Singles y EPs" />
            <div className="flex gap-5 overflow-x-auto pb-3 scrollbar-hide -mx-1 px-1">
              {artist.singles.map(single => (
                <AlbumCard
                  key={single.id}
                  item={single}
                  onClick={() => router.push(`/album?id=${single.id}`)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Playlists */}
        {artist.playlists && artist.playlists.length > 0 && (
          <div>
            <SectionHeader title="Listas de reproducción" />
            <div className="flex gap-5 overflow-x-auto pb-3 scrollbar-hide -mx-1 px-1">
              {artist.playlists.map(pl => (
                <AlbumCard
                  key={pl.id}
                  item={pl}
                  onClick={() => router.push(`/album?id=${pl.id}`)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ArtistPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <div className="w-12 h-12 border-4 border-[#7C3AED] border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-black uppercase tracking-widest opacity-50">Cargando...</p>
      </div>
    }>
      <ArtistContent />
    </Suspense>
  );
}
