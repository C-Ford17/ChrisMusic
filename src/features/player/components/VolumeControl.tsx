'use client';

import { Volume2, Volume1, VolumeX, Volume } from 'lucide-react';
import { usePlayerStore } from '../store/playerStore';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function VolumeControl({ className = "" }: { className?: string }) {
  const { volume, setVolume } = usePlayerStore();
  const [prevVolume, setPrevVolume] = useState(volume);
  const [isHovered, setIsHovered] = useState(false);
  const [showMobileSlider, setShowMobileSlider] = useState(false);

  const toggleMute = () => {
    if (volume > 0) {
      setPrevVolume(volume);
      setVolume(0);
    } else {
      setVolume(prevVolume > 0 ? prevVolume : 0.5);
    }
  };

  const getVolumeIcon = () => {
    if (volume === 0) return <VolumeX size={20} className="text-red-500" />;
    return (
      <div className="text-black/60 dark:text-white/70 group-hover/vol:text-black dark:group-hover/vol:text-white transition-colors">
        {volume < 0.3 ? <Volume size={20} /> : volume < 0.7 ? <Volume1 size={20} /> : <Volume2 size={20} />}
      </div>
    );
  };

  return (
    <div 
      className={`relative flex items-center gap-3 group/vol ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Mobile Popover Slider */}
      <AnimatePresence>
        {showMobileSlider && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 md:hidden pointer-events-auto bg-black/5 dark:bg-black/20 backdrop-blur-sm"
              onClick={() => setShowMobileSlider(false)}
            />
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 p-5 bg-white dark:bg-[#282828] border border-black/5 dark:border-white/10 rounded-3xl shadow-2xl z-50 md:hidden flex items-center gap-4"
            >
              <div className="w-32 h-2 relative flex items-center">
                 <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="w-full h-2 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-[#7C3AED] shadow-[0_0_8px_rgba(124,58,237,0.4)]" style={{ width: `${volume * 100}%` }} />
                </div>
              </div>
              <span className="text-[10px] font-black text-black/40 dark:text-white/50 w-8">{Math.round(volume * 100)}%</span>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <button 
        onClick={() => {
          if (window.innerWidth < 768) {
            setShowMobileSlider(!showMobileSlider);
          } else {
            toggleMute();
          }
        }}
        className="p-3 bg-black/5 dark:bg-white/5 rounded-xl transition-all relative z-10 flex items-center justify-center"
      >
        {getVolumeIcon()}
      </button>
      
      {/* Desktop Slider */}
      <div className={`
        hidden md:flex items-center gap-3 transition-all duration-300 origin-left
        ${isHovered ? 'w-32 opacity-100' : 'w-0 opacity-0 overflow-hidden ml-0'}
      `}>
        <div className="relative flex-1 h-2 flex items-center group/slider">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
          <div className="w-full h-1.5 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden flex items-center group-hover/slider:h-2 transition-all">
            <div 
              className="h-full bg-[#7C3AED] transition-all"
              style={{ width: `${volume * 100}%` }}
            />
          </div>
        </div>
        <span className="text-[9px] font-black text-black/20 dark:text-white/30 w-8 inline-block">
          {Math.round(volume * 100)}%
        </span>
      </div>
    </div>
  );
}
