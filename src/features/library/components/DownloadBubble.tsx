'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useAnimation, useMotionValue } from 'framer-motion';
import { Download, CheckCircle2, XCircle, ChevronDown, RefreshCw, X } from 'lucide-react';
import { useDownloadStore } from '@/features/library/store/downloadStore';
import { offlineService } from '@/features/library/services/offlineService';
import { cn } from '@/lib/utils';
import { Capacitor } from '@capacitor/core';

export const DownloadBubble: React.FC = () => {
  const { items, totalProgress, clearCompleted, removeItem } = useDownloadStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [dockedSide, setDockedSide] = useState<'left' | 'right'>('right');
  const [dockedV, setDockedV] = useState<'top' | 'bottom'>('bottom');
  
  const controls = useAnimation();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  
  const SIDE_PADDING = 20; 
  const TOP_PADDING = 60; 
  const BOTTOM_PADDING = 100;

  const [isDragging, setIsDragging] = useState(false);
  const total = totalProgress();

  useEffect(() => {
    if (items.length === 0) {
      setIsExpanded(false);
    }
  }, [items.length]);

  useEffect(() => {
    const allCompleted = items.length > 0 && items.every(i => i.status === 'completed');
    const anyError = items.some(i => i.status === 'error');
    
    setHasError(anyError);

    if (allCompleted && !isDone) {
      setIsDone(true);
      const timer = setTimeout(() => {
        setIsDone(false);
        clearCompleted();
        setDockedSide('right');
        setDockedV('bottom');
        controls.start({ x: 0, y: 0 });
      }, 5000);
      return () => clearTimeout(timer);
    } else if (!allCompleted) {
      setIsDone(false);
    }
  }, [items, isDone, clearCompleted, controls]);

  const handleDragStart = () => {
    setIsDragging(true);
    if (isExpanded) setIsExpanded(false);
  };

  const handleDragEnd = (_: any, info: any) => {
    setIsDragging(false);
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    
    // Check for dismissal (Messenger style)
    // Area: Bottom center
    const dropX = info.point.x;
    const dropY = info.point.y;
    
    const dismissZoneX = screenWidth / 2;
    const dismissZoneY = screenHeight - 120;
    
    const distance = Math.sqrt(Math.pow(dropX - dismissZoneX, 2) + Math.pow(dropY - dismissZoneY, 2));
    
    if (distance < 80) {
      // Dismiss all
      items.forEach(item => removeItem(item.id));
      clearCompleted();
      return;
    }

    const currentX = info.point.x;
    const currentY = info.point.y;
    
    const isLeftSide = currentX < screenWidth / 2;
    const isTopSide = currentY < screenHeight / 2;
    
    setDockedSide(isLeftSide ? 'left' : 'right');
    setDockedV(isTopSide ? 'top' : 'bottom');

    const bubbleWidth = 56;
    const rightInitialPadding = 24; 
    
    let targetX = 0;
    if (isLeftSide) {
      targetX = -(screenWidth - bubbleWidth - (SIDE_PADDING + rightInitialPadding));
    } else {
      targetX = 0;
    }

    controls.start({
      x: targetX,
      y: 0, // Spring back vertically too
      transition: { type: 'spring', stiffness: 250, damping: 25 }
    });
  };

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (total / 100) * circumference;

  useEffect(() => {
    if (items.length > 0) {
      controls.start({ scale: 1, opacity: 1 });
    }
  }, [items.length, controls]);

  return (
    <div className="fixed z-[100] pointer-events-none inset-0 overflow-hidden">
      {/* Zona de Eliminación (Messenger Style) */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.5 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.5 }}
            className="absolute bottom-20 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-10"
          >
            <div className="w-16 h-16 rounded-full bg-red-500/20 backdrop-blur-xl border border-red-500/50 flex items-center justify-center text-red-500 shadow-[0_0_30px_rgba(239,68,68,0.3)]">
              <X className="w-8 h-8" />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-red-500/60">Soltar para cerrar</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {items.length > 0 && (
          <motion.div
            key="download-bubble"
            drag
            dragMomentum={false}
            dragElastic={0.05}
            dragConstraints={{
              top: -(window.innerHeight - 96 - 56 - TOP_PADDING),
              bottom: 120,
              left: -(window.innerWidth - 56 - SIDE_PADDING - 24),
              right: 0
            }}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            style={{ x, y, touchAction: 'none' }}
            className={cn(
              "absolute right-6 pointer-events-auto",
              Capacitor.isNativePlatform() ? "bottom-24" : "bottom-8"
            )}
          >
            {/* Botón de la Burbuja */}
            <button
              onClick={toggleExpand}
              className={cn(
                "relative w-14 h-14 rounded-full flex items-center justify-center shadow-2xl transition-all duration-500 group",
                hasError ? "bg-red-500/20" : isDone ? "bg-blue-500/20" : "bg-black/60",
                "backdrop-blur-xl border border-white/10 active:scale-95",
                isDragging && "scale-110 shadow-[0_0_30px_rgba(255,255,255,0.2)]"
              )}
            >
              <svg className="absolute inset-0 w-full h-full -rotate-90">
                <circle cx="28" cy="28" r={radius} fill="transparent" stroke="currentColor" strokeWidth="3" className="text-white/5" />
                <motion.circle
                  cx="28" cy="28" r={radius} fill="transparent" stroke="currentColor" strokeWidth="3"
                  strokeDasharray={circumference}
                  animate={{ strokeDashoffset }}
                  transition={{ duration: 0.5 }}
                  className={cn(
                    "transition-colors duration-500",
                    hasError ? "text-red-500" : isDone ? "text-blue-500" : "text-green-500"
                  )}
                  strokeLinecap="round"
                />
              </svg>

              <div className={cn("relative z-10 transition-transform", isDone && !hasError && "animate-pulse", isDragging && "scale-110")}>
                {hasError ? <XCircle className="w-6 h-6 text-red-500" /> : isDone ? <CheckCircle2 className="w-6 h-6 text-blue-500" /> : <Download className="w-6 h-6 text-white" />}
              </div>
            </button>

            {/* Vista Expandida */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  key="download-modal"
                  initial={{ 
                    opacity: 0, 
                    scale: 0.8, 
                    y: dockedV === 'bottom' ? 20 : -20 
                  }}
                  animate={{ 
                    opacity: 1, 
                    scale: 1, 
                    y: dockedV === 'bottom' ? -70 : 70,
                    x: 0 
                  }}
                  exit={{ 
                    opacity: 0, 
                    scale: 0.8, 
                    y: dockedV === 'bottom' ? 20 : -20 
                  }}
                  className={cn(
                    "absolute w-[85vw] max-w-72 max-h-[450px] bg-neutral-900/95 backdrop-blur-2xl rounded-[32px] border border-white/10 shadow-2xl overflow-hidden flex flex-col",
                    dockedV === 'bottom' ? "bottom-0" : "top-0",
                    dockedSide === 'right' ? "right-0 origin-bottom-right" : "left-0 origin-bottom-left",
                    dockedV === 'top' && (dockedSide === 'right' ? "origin-top-right" : "origin-top-left")
                  )}
                >
                  <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/5">
                    <div className="flex flex-col">
                      <h3 className="text-sm font-black uppercase tracking-widest text-white/90">Descargas</h3>
                      <p className="text-[9px] text-white/40 font-bold uppercase tracking-tighter mt-0.5">{items.length} elementos en curso</p>
                    </div>
                    <button 
                      onClick={() => {
                        items.forEach(i => removeItem(i.id));
                        clearCompleted();
                      }}
                      className="p-2 hover:bg-red-500/20 text-white/40 hover:text-red-500 rounded-full transition-all"
                      title="Cerrar todo"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                    {items.map((item) => (
                      <div key={item.id} className="p-3 bg-white/5 rounded-2xl flex items-center gap-3 group/item border border-transparent hover:border-white/5 transition-all">
                        <div className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-white/10">
                          <img src={item.song.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{item.song.title}</p>
                          <div className="mt-1 flex items-center gap-2">
                            <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                              <motion.div 
                                className={cn("h-full rounded-full", item.status === 'error' ? "bg-red-500" : item.status === 'completed' ? "bg-blue-500" : "bg-green-500")}
                                initial={{ width: 0 }}
                                animate={{ width: `${item.progress}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-white/40 font-mono w-8 text-right">{Math.round(item.progress)}%</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {item.status === 'error' && (
                            <button onClick={() => offlineService.retryDownloadSong(item.song)} className="p-2 hover:bg-white/10 rounded-full text-red-400">
                              <RefreshCw className="w-4 h-4" />
                            </button>
                          )}
                          {item.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-blue-500" />}
                          <button onClick={() => removeItem(item.id)} className="p-2 hover:bg-white/10 rounded-full text-white/20 hover:text-white/60">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
