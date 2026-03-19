'use client';

import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

interface MarqueeTextProps {
  text: string;
  className?: string;
  speed?: number; // seconds per 100px
}

export function MarqueeText({ text, className, speed = 5 }: MarqueeTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [shouldScroll, setShouldScroll] = useState(false);
  const [distance, setDistance] = useState(0);

  useEffect(() => {
    const checkScroll = () => {
      if (containerRef.current && textRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const textWidth = textRef.current.offsetWidth;
        const needsScroll = textWidth > containerWidth;
        setShouldScroll(needsScroll);
        if (needsScroll) {
          setDistance(textWidth - containerWidth + 20); // 20px extra padding for clearance
        }
      }
    };

    checkScroll();
    // Re-check on window resize
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [text]);

  return (
    <div 
      ref={containerRef} 
      className={`overflow-hidden whitespace-nowrap relative ${className}`}
    >
      <motion.span
        ref={textRef}
        animate={shouldScroll ? { x: [0, -distance, 0] } : { x: 0 }}
        transition={{
          duration: (distance / 100) * speed + 2, // dynamic duration based on length
          repeat: Infinity,
          repeatDelay: 3,
          ease: "linear",
          times: [0, 0.8, 1] // stay at the end for a bit
        }}
        className="inline-block"
      >
        {text}
      </motion.span>
      
      {/* Subtle fade effect on edges when scrolling */}
      {shouldScroll && (
        <>
          <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-inherit to-transparent z-10 pointer-events-none" />
          <div className="absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-inherit to-transparent z-10 pointer-events-none" />
        </>
      )}
    </div>
  );
}
