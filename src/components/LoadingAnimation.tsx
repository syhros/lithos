import React, { useEffect, useState } from 'react';

interface LoadingAnimationProps {
  isVisible: boolean;
  onComplete?: () => void;
}

export const LoadingAnimation: React.FC<LoadingAnimationProps> = ({ isVisible, onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    if (!isVisible) return;

    setProgress(0);
    setIsTransitioning(false);

    const animateProgress = () => {
      setProgress(prev => {
        if (prev >= 95) {
          return 95;
        }

        const increment = Math.random() * 3.5;
        return Math.min(prev + increment, 95);
      });
    };

    const interval = setInterval(animateProgress, 30 + Math.random() * 40);

    return () => clearInterval(interval);
  }, [isVisible]);

  useEffect(() => {
    if (isVisible && progress >= 95) {
      const timer = setTimeout(() => {
        setProgress(100);
        setIsTransitioning(true);
        setTimeout(() => {
          onComplete?.();
        }, 1200);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [isVisible, progress, onComplete]);

  const displayProgress = Math.floor(progress);
  const decimalPart = (progress % 1).toFixed(2).substring(2);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0b] transition-opacity duration-1200 ${
        isTransitioning ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <svg className="absolute inset-0 w-full h-full opacity-10" xmlns="http://www.w3.org/2000/svg">
        <filter id="noiseFilter">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#noiseFilter)" fill="#fff" />
      </svg>

      <div className="relative z-10 flex flex-col items-center">
        <div className="mb-12 relative px-8">
          <div className="flex items-baseline gap-1">
            <span
              className="text-8xl font-black tracking-tighter bg-gradient-to-b from-white via-yellow-100 to-amber-500 bg-clip-text text-transparent transition-all duration-100"
              style={{
                filter: `drop-shadow(0 0 ${15 + progress * 0.3}px rgba(255, 193, 7, ${0.3 + progress / 300}))`,
              }}
            >
              {displayProgress.toString().padStart(2, '0')}
            </span>

            <div className="flex items-baseline gap-0.5">
              <span className="text-2xl font-mono text-amber-600 font-light opacity-60 leading-none">
                .{decimalPart}
              </span>
              <span className="text-xs font-mono text-amber-700/60 uppercase tracking-widest leading-none">
                %
              </span>
            </div>
          </div>
        </div>

        <div className="w-96 h-px bg-white/10 relative overflow-visible mb-8">
          <div
            className="absolute left-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-amber-500 transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full blur-sm" />
          </div>
        </div>

        <div className="flex gap-6 text-xs font-mono text-white/40 uppercase tracking-wider">
          <div className="flex items-center gap-2">
            <div className="w-1 h-1 bg-amber-500 rounded-full animate-pulse" />
            <span>Syncing Data</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1 h-1 bg-amber-500 rounded-full animate-pulse" />
            <span>Loading Prices</span>
          </div>
        </div>
      </div>
    </div>
  );
};
