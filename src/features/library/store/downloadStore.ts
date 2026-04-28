import { create } from 'zustand';
import { type Song } from '@/core/types/music';

export interface DownloadItem {
  id: string;
  song: Song;
  progress: number;
  status: 'downloading' | 'completed' | 'error';
  error?: string;
}

interface DownloadState {
  items: DownloadItem[];
  addDownload: (song: Song) => void;
  updateProgress: (id: string, progress: number) => void;
  setCompleted: (id: string) => void;
  setError: (id: string, error: string) => void;
  retryDownload: (id: string) => void;
  removeItem: (id: string) => void;
  clearCompleted: () => void;
  hasActiveDownloads: () => boolean;
  totalProgress: () => number;
}

export const useDownloadStore = create<DownloadState>((set, get) => ({
  items: [],
  
  addDownload: (song) => set((state) => {
    // If it's already in the list and errored, we might want to reset it
    const existing = state.items.find(i => i.id === song.id);
    if (existing) {
      if (existing.status === 'error') {
        return {
          items: state.items.map(i => i.id === song.id ? { ...i, status: 'downloading', progress: 0, error: undefined } : i)
        };
      }
      return state; // Already downloading or completed
    }
    return {
      items: [...state.items, { id: song.id, song, progress: 0, status: 'downloading' }]
    };
  }),

  updateProgress: (id, progress) => set((state) => ({
    items: state.items.map((item) =>
      item.id === id ? { ...item, progress } : item
    ),
  })),

  setCompleted: (id) => set((state) => ({
    items: state.items.map((item) =>
      item.id === id ? { ...item, status: 'completed', progress: 100 } : item
    ),
  })),

  setError: (id, error) => set((state) => ({
    items: state.items.map((item) =>
      item.id === id ? { ...item, status: 'error', error } : item
    ),
  })),

  retryDownload: (id) => {
    const item = get().items.find(i => i.id === id);
    if (item) {
      // Logic for retry will be handled by the service/caller
      set((state) => ({
        items: state.items.map(i => i.id === id ? { ...i, status: 'downloading', progress: 0, error: undefined } : i)
      }));
    }
  },

  removeItem: (id) => set((state) => ({
    items: state.items.filter(i => i.id !== id)
  })),

  clearCompleted: () => set((state) => ({
    items: state.items.filter(i => i.status !== 'completed')
  })),

  hasActiveDownloads: () => {
    const items = get().items;
    return items.some(i => i.status === 'downloading' || i.status === 'error');
  },

  totalProgress: () => {
    const items = get().items;
    if (items.length === 0) return 0;
    
    // Calculate total progress as average of all items
    const total = items.reduce((acc, item) => acc + item.progress, 0);
    return total / items.length;
  }
}));
