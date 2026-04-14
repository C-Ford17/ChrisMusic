'use client';

import { Volume2, Volume1, VolumeX, Volume } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function VolumeControl({ className = "", isVertical = false }: { className?: string, isVertical?: boolean }) {
  const { volume, setVolume } = usePlayerStore();
  const [prevVolume, setPrevVolume] = useState(volume);
  const [isHovered, setIsHovered] = useState(false);
  const [showVerticalSlider, setShowVerticalSlider] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);

  const toggleMute = () => {
    if (volume > 0) {
      setPrevVolume(volume);
      setVolume(0);
    } else {
      setVolume(prevVolume > 0 ? prevVolume : 0.5);
    }
  };

  const getVolumeIcon = () => {
    if (volume === 0) return <VolumeX size={24} className="text-red-500" />;
    return (
      <div className="text-white/70 group-hover:text-white transition-colors">
        {volume < 0.3 ? <Volume size={24} /> : volume < 0.7 ? <Volume1 size={24} /> : <Volume2 size={24} />}
      </div>
    );
  };

  // Close vertical slider on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sliderRef.current && !sliderRef.current.contains(event.target as Node)) {
        setShowVerticalSlider(false);
      }
    };
    if (showVerticalSlider) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showVerticalSlider]);

  const handleSliderClick = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const offsetY = clientY - rect.top;
    const height = rect.height;
    // Invertimos el cálculo: (altura - offset) / altura porque el 0 de clientY es arriba
    const newVolume = Math.max(0, Math.min(1, (height - offsetY) / height));
    setVolume(newVolume);
  };

  return (
    <div 
      className={`relative flex items-center group ${className}`}
      onMouseEnter={() => !isVertical && setIsHovered(true)}
      onMouseLeave={() => !isVertical && setIsHovered(false)}
    >
      <button 
        onClick={() => {
          if (isVertical) {
            setShowVerticalSlider(!showVerticalSlider);
          } else {
            toggleMute();
          }
        }}
        className="p-2 text-white/50 hover:text-white transition-all active:scale-90"
      >
        {getVolumeIcon()}
      </button>
      
      {/* Vertical Slider Popover */}
      <AnimatePresence>
        {showVerticalSlider && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 p-4 bg-black/80 backdrop-blur-3xl border border-white/10 rounded-2xl shadow-2xl z-50 flex flex-col items-center gap-4 h-52 w-14"
            ref={sliderRef}
          >
            <div 
              className="flex-1 w-2 bg-white/10 rounded-full relative cursor-pointer overflow-hidden flex items-end"
              onClick={handleSliderClick}
              onTouchStart={handleSliderClick}
              onTouchMove={handleSliderClick}
            >
              <motion.div 
                className="w-full bg-[var(--accent-primary)] shadow-[0_0_15px_var(--accent-primary)]"
                style={{ height: `${volume * 100}%` }}
                layoutId="volume-bar"
              />
            </div>
            <span className="text-[10px] font-black text-white/50 w-full text-center">{Math.round(volume * 100)}%</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop Horizontal Slider (Original mini-player behavior) */}
      {!isVertical && (
        <div className={`
          hidden md:flex items-center gap-3 transition-all duration-300 origin-left
          ${isHovered ? 'w-32 opacity-100' : 'w-0 opacity-0 overflow-hidden ml-0'}
        `}>
          <div className="relative flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden flex items-center">
            <div 
              className="h-full bg-[var(--accent-primary)] transition-all"
              style={{ width: `${volume * 100}%` }}
            />
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>
          <span className="text-[11px] font-bold text-white/40">{Math.round(volume * 100)}%</span>
        </div>
      )}
    </div>
  );
}
