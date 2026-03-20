'use client';

import { useState } from 'react';
import { usePlayerStore } from '@/features/player/store/playerStore';
import { ListPlus, Play, Clock, Sparkles } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/core/db/db';
import Image from 'next/image';
import { type Song } from '@/core/types/music';
import { AddToPlaylistModal } from '@/shared/components/AddToPlaylistModal';

export default function Home() {
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const { playSong } = usePlayerStore();

  // Recently played songs from history
  const recentHistory = useLiveQuery(
    () => db.history.orderBy('playedAt').reverse().limit(10).toArray(),
    []
  );

  return (
    <div className="flex flex-col min-h-screen pt-safe">
      <main className="flex-1 p-6 pb-32 max-w-5xl mx-auto w-full">
        {/* Header Section */}
        <section className="mt-10 mb-16 relative overflow-hidden rounded-[40px] bg-linear-to-br from-[#7C3AED] via-[#6D28D9] to-black p-10 md:p-14 text-white shadow-2xl shadow-[#7C3AED]/20 group">
          <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-[10px] font-black uppercase tracking-[0.2em]">ChrisMusic Premium</span>
              <Sparkles size={16} className="text-yellow-400" />
            </div>
            <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-none mb-4">
              Bienvenido a <br />
              <span className="text-white/80">tu universo musical.</span>
            </h1>
            <p className="text-lg md:text-xl text-white/60 font-medium max-w-lg leading-relaxed">
              Explora millones de canciones, descubre letras sincronizadas y lleva tu música a donde quieras.
            </p>
          </div>
          {/* Decorative shapes */}
          <div className="absolute -top-10 -right-10 w-64 h-64 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000" />
          <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-[#7C3AED]/30 rounded-full blur-3xl" />
        </section>

        {/* Recently Played */}
        <section className="mb-16">
          <div className="flex items-center justify-between mb-8 px-2">
            <h2 className="text-2xl font-black flex items-center gap-3 tracking-tighter uppercase text-xs tracking-widest text-black/50 dark:text-white/50">
              <Clock size={16} />
              Recientemente Escuchado
            </h2>
          </div>

          {!recentHistory || recentHistory.length === 0 ? (
            <div className="bg-black/5 dark:bg-white/5 rounded-[32px] p-20 text-center space-y-6 border border-dashed border-black/10 dark:border-white/10">
              <div className="w-20 h-20 bg-[#7C3AED]/10 text-[#7C3AED] rounded-full flex items-center justify-center mx-auto">
                <Play size={32} strokeWidth={3} fill="currentColor" />
              </div>
              <div className="space-y-2">
                <p className="text-xl font-black tracking-tighter opacity-70">Aún no has escuchado nada</p>
                <p className="text-xs font-bold uppercase tracking-widest opacity-30">Empieza tu viaje en el buscador</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recentHistory.map((item) => (
                <div 
                  key={item.id} 
                  className="flex items-center p-4 rounded-[28px] bg-black/[0.02] dark:bg-white/[0.02] hover:bg-white dark:hover:bg-white/5 border border-black/5 dark:border-white/5 cursor-pointer transition-all group active:scale-[0.98] shadow-sm hover:shadow-xl"
                  onClick={() => playSong(item.song as Song)}
                >
                  <div className="relative w-14 h-14 mr-5 shrink-0 bg-gray-200 dark:bg-gray-800 rounded-2xl overflow-hidden shadow-md">
                    <Image src={item.song.thumbnailUrl} alt={item.song.title} fill sizes="56px" className="object-cover group-hover:scale-110 transition-transform duration-500" />
                  </div>
                  <div className="flex-1 min-w-0 mr-4 text-left">
                    <h3 className="text-black dark:text-white font-black truncate group-hover:text-[#7C3AED] transition-colors tracking-tight text-lg">{item.song.title}</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-xs font-bold truncate mt-1 uppercase tracking-wider">{item.song.artistName}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSong(item.song as Song);
                        setIsModalOpen(true);
                      }}
                      className="w-10 h-10 flex items-center justify-center bg-black/5 dark:bg-white/5 text-gray-400 hover:text-[#7C3AED] hover:bg-[#7C3AED]/10 rounded-xl transition-all"
                      title="Añadir a playlist"
                    >
                      <ListPlus size={20} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <AddToPlaylistModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        song={selectedSong} 
      />
    </div>
  );
}

