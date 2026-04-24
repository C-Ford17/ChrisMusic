'use client';

import React, { useState } from 'react';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  TouchSensor
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { GripVertical, Play, Trash2, ArrowUpDown, Type, User } from 'lucide-react';
import Image from 'next/image';
import { Song } from '@/core/types/music';
import { MarqueeText } from './MarqueeText';
import { YouTubeExtractionService } from '@/features/player/services/youtubeExtractionService';

interface SortableSongItemProps {
  id: string;
  song: Song;
  isEditing: boolean;
  onPlay: (song: Song) => void;
  onRemove?: (id: string) => void;
}

function SortableSongItem({ id, song, isEditing, onPlay, onRemove }: SortableSongItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.8 : 1,
    scale: isDragging ? '1.02' : '1',
    boxShadow: isDragging ? '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)' : 'none',
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className={`group flex items-center justify-between p-4 rounded-3xl bg-black/[0.02] dark:bg-white/[0.02] hover:bg-white dark:hover:bg-white/5 border border-transparent hover:border-black/5 dark:hover:border-white/5 shadow-sm hover:shadow-xl transition-all cursor-pointer ${isDragging ? 'shadow-2xl' : ''}`}
      onClick={() => !isEditing && onPlay(song)}
    >
      <div className="flex items-center min-w-0 pr-4">
        {isEditing && (
          <div 
            {...attributes} 
            {...listeners}
            style={{ touchAction: 'none' }}
            className="p-3 -m-1 mr-1 text-black/30 dark:text-white/30 cursor-grab active:cursor-grabbing hover:text-[var(--accent-primary)] transition-colors"
          >
            <GripVertical size={24} strokeWidth={2.5} />
          </div>
        )}
        <div className="relative w-14 h-14 mr-4 shrink-0 bg-gray-200 dark:bg-black rounded-2xl overflow-hidden shadow-sm">
          <Image 
            src={YouTubeExtractionService.normalizeUrl(song.thumbnailUrl, song.id)} 
            alt={song.title} 
            fill 
            sizes="56px" 
            className="object-cover" 
          />
          {!isEditing && (
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <Play size={24} className="text-white" fill="currentColor" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-black dark:text-white font-bold text-base overflow-hidden tracking-tight">
            <MarqueeText text={song.title} />
          </h4>
          <p className="text-black/40 dark:text-gray-400 text-xs font-medium truncate mt-0.5 uppercase tracking-wider">{song.artistName}</p>
        </div>
      </div>
      
      {onRemove && (
        <button 
          onClick={(e) => {
            e.stopPropagation();
            onRemove(id);
          }}
          className="p-3 text-black/20 dark:text-white/20 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-all"
        >
          <Trash2 size={18} />
        </button>
      )}
    </div>
  );
}

interface SortableSongListProps {
  songs: any[]; // items from DB (Favorite, OfflineSong, PlaylistEntry)
  onReorder: (newOrder: any[]) => void;
  onPlay: (song: Song, list: Song[]) => void;
  onRemove?: (id: string) => void;
  type: 'favorites' | 'offline' | 'playlist';
}

export function SortableSongList({ songs, onReorder, onPlay, onRemove, type }: SortableSongListProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // Sensibilidad equilibrada
      },
    }),
    useSensor(TouchSensor, {
        activationConstraint: {
          distance: 5, // Instantáneo al mover 5px, sin delay
        },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = songs.findIndex((s) => {
        const sid = s.id?.toString() || (s.playlistId + s.song.id);
        return sid === active.id;
      });
      const newIndex = songs.findIndex((s) => {
        const sid = s.id?.toString() || (s.playlistId + s.song.id);
        return sid === over.id;
      });
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(songs, oldIndex, newIndex);
        onReorder(newOrder);
      }
    }
  };

  const sortByTitle = () => {
    const sorted = [...songs].sort((a, b) => a.song.title.localeCompare(b.song.title));
    onReorder(sorted);
    setShowSortMenu(false);
  };

  const sortByArtist = () => {
    const sorted = [...songs].sort((a, b) => a.song.artistName.localeCompare(b.song.artistName));
    onReorder(sorted);
    setShowSortMenu(false);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Controls Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex gap-2">
          <div className="relative">
            <button 
              onClick={() => setShowSortMenu(!showSortMenu)}
              className="flex items-center gap-2 px-4 py-2 bg-black/[0.03] dark:bg-white/[0.05] text-black/60 dark:text-white/60 hover:text-[var(--accent-primary)] rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
            >
              <ArrowUpDown size={14} /> Ordenar
            </button>
            
            {showSortMenu && (
              <div className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-[#181818] border border-black/5 dark:border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl">
                <button 
                  onClick={sortByTitle}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-bold text-black/60 dark:text-white/60 hover:bg-[var(--accent-primary)]/10 hover:text-[var(--accent-primary)] transition-all"
                >
                  <Type size={16} /> Por Título (A-Z)
                </button>
                <button 
                  onClick={sortByArtist}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left text-xs font-bold text-black/60 dark:text-white/60 hover:bg-[var(--accent-primary)]/10 hover:text-[var(--accent-primary)] transition-all"
                >
                  <User size={16} /> Por Artista (A-Z)
                </button>
              </div>
            )}
          </div>
        </div>

        <button 
          onClick={() => setIsEditing(!isEditing)}
          className={`flex items-center gap-2 px-6 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${isEditing ? 'bg-[var(--accent-primary)] text-white shadow-lg shadow-[var(--accent-primary)]/20' : 'bg-black/[0.03] dark:bg-white/[0.05] text-black/60 dark:text-white/60'}`}
        >
          {isEditing ? 'Guardar Orden' : 'Manual / Arrastrar'}
        </button>
      </div>

      <DndContext 
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToVerticalAxis]}
      >
        <SortableContext 
          items={songs.map(s => s.id?.toString() || (s.playlistId + s.song.id))} 
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-3">
            {songs.map((item) => {
              const itemId = item.id?.toString() || (item.playlistId + item.song.id);
              return (
                <SortableSongItem 
                  key={itemId}
                  id={itemId}
                  song={item.song}
                  isEditing={isEditing}
                  onPlay={(s) => onPlay(s, songs.map(i => i.song))}
                  onRemove={onRemove}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
