import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, ZoomIn, X } from 'lucide-react';
import type { Photo } from '@/types';

interface ThreeDSliderProps {
  photos: Photo[];
  onActiveIndexChange?: (index: number) => void;
  autoPlay?: boolean;
  autoPlayInterval?: number;
  showNavigation?: boolean;
  showDots?: boolean;
  centerScale?: number;
  sideScale?: number;
  sideOpacity?: number;
  transitionDuration?: number;
  className?: string;
}

const ThreeDSlider: React.FC<ThreeDSliderProps> = ({
  photos = [],
  onActiveIndexChange,
  autoPlay = false,
  autoPlayInterval = 5000,
  showNavigation = true,
  showDots = true,
  centerScale = 1.05,
  sideScale = 0.75,
  sideOpacity = 0.6,
  transitionDuration = 700,
  className = '',
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [scrollZoom, setScrollZoom] = useState(1);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const mouseStartX = useRef(0);
  const mouseEndX = useRef(0);
  const autoPlayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalItems = photos.length;

  // Reset auto-play timer
  const resetAutoPlayTimer = useCallback(() => {
    if (autoPlayTimerRef.current) {
      clearInterval(autoPlayTimerRef.current);
    }
    if (autoPlay && totalItems > 1) {
      autoPlayTimerRef.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % totalItems);
      }, autoPlayInterval);
    }
  }, [autoPlay, totalItems, autoPlayInterval]);

  // Navigation handlers
  const handleNext = useCallback(() => {
    if (isAnimating || totalItems === 0) return;
    setIsAnimating(true);
    setCurrentIndex((prev) => (prev + 1) % totalItems);
    setTimeout(() => setIsAnimating(false), transitionDuration);
    resetAutoPlayTimer();
  }, [isAnimating, totalItems, transitionDuration, resetAutoPlayTimer]);

  const handlePrev = useCallback(() => {
    if (isAnimating || totalItems === 0) return;
    setIsAnimating(true);
    setCurrentIndex((prev) => (prev - 1 + totalItems) % totalItems);
    setTimeout(() => setIsAnimating(false), transitionDuration);
    resetAutoPlayTimer();
  }, [isAnimating, totalItems, transitionDuration, resetAutoPlayTimer]);

  const goToSlide = useCallback((index: number) => {
    if (isAnimating || index === currentIndex || totalItems === 0) return;
    setIsAnimating(true);
    setCurrentIndex(index);
    setTimeout(() => setIsAnimating(false), transitionDuration);
    resetAutoPlayTimer();
  }, [isAnimating, currentIndex, totalItems, transitionDuration, resetAutoPlayTimer]);

  // Notify parent of active index change
  useEffect(() => {
    if (onActiveIndexChange) {
      onActiveIndexChange(currentIndex);
    }
  }, [currentIndex, onActiveIndexChange]);

  // Auto-play functionality
  useEffect(() => {
    if (autoPlay && totalItems > 1) {
      autoPlayTimerRef.current = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % totalItems);
      }, autoPlayInterval);

      return () => {
        if (autoPlayTimerRef.current) {
          clearInterval(autoPlayTimerRef.current);
        }
      };
    }
  }, [autoPlay, autoPlayInterval, totalItems]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'Escape' && selectedPhoto) {
        setSelectedPhoto(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev, selectedPhoto]);

  // Scroll zoom effect for center card
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      const delta = e.deltaY;
      setScrollZoom((prev) => {
        const newZoom = prev + (delta > 0 ? -0.02 : 0.02);
        return Math.max(0.9, Math.min(1.15, newZoom));
      });

      scrollTimeoutRef.current = setTimeout(() => {
        setScrollZoom(1);
      }, 500);
    };

    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => {
      window.removeEventListener('wheel', handleWheel);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    const diff = touchStartX.current - touchEndX.current;
    const threshold = 50;

    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }
  };

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    mouseStartX.current = e.clientX;
    mouseEndX.current = e.clientX;
    e.preventDefault();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    mouseEndX.current = e.clientX;
  };

  const handleMouseUp = () => {
    if (!isDragging) return;
    
    const diff = mouseStartX.current - mouseEndX.current;
    const threshold = 50;

    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }
    
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    if (isDragging) {
      setIsDragging(false);
    }
  };

  // Calculate position and style for each card
  const getCardStyle = (index: number): React.CSSProperties => {
    const diff = (index - currentIndex + totalItems) % totalItems;
    const adjustedDiff = diff > totalItems / 2 ? diff - totalItems : diff;

    let transform = '';
    let opacity = 0;
    let zIndex = 0;
    let pointerEvents: 'none' | 'auto' = 'none';
    let filter = '';

    if (adjustedDiff === 0) {
      // Center card with scroll zoom
      transform = `translateX(0%) translateZ(100px) scale(${centerScale * scrollZoom}) rotateY(0deg)`;
      opacity = 1;
      zIndex = 30;
      pointerEvents = 'auto';
      filter = 'blur(0px)';
    } else if (adjustedDiff === 1) {
      // Right card
      transform = `translateX(65%) translateZ(-50px) scale(${sideScale}) rotateY(-35deg)`;
      opacity = sideOpacity;
      zIndex = 20;
      pointerEvents = 'auto';
      filter = 'blur(2px)';
    } else if (adjustedDiff === -1) {
      // Left card
      transform = `translateX(-65%) translateZ(-50px) scale(${sideScale}) rotateY(35deg)`;
      opacity = sideOpacity;
      zIndex = 20;
      pointerEvents = 'auto';
      filter = 'blur(2px)';
    } else {
      // Hidden cards
      transform = adjustedDiff > 0 
        ? `translateX(150%) translateZ(-100px) scale(0.5) rotateY(-45deg)` 
        : `translateX(-150%) translateZ(-100px) scale(0.5) rotateY(45deg)`;
      opacity = 0;
      zIndex = 10;
      filter = 'blur(4px)';
    }

    return {
      transform,
      opacity,
      zIndex,
      pointerEvents,
      filter,
      transition: `all ${transitionDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`,
    };
  };

  if (totalItems === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-white/60">
        <p className="text-lg">Brak zdjęć do wyświetlenia</p>
      </div>
    );
  }

  return (
    <div className={`relative w-full ${className}`}>
      {/* Main slider container */}
      <div 
        className={`relative w-full h-[400px] md:h-[550px] lg:h-[650px] flex items-center justify-center overflow-visible px-4 md:px-0 select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        style={{ 
          perspective: '2000px',
          transformStyle: 'preserve-3d',
          userSelect: 'none',
        }}
      >
        {photos.map((photo, index) => {
          const cardStyle = getCardStyle(index);
          const isCenter = index === currentIndex;

          return (
            <div
              key={photo.id}
              className="absolute w-full max-w-3xl px-4 md:px-0 select-none"
              style={{
                ...cardStyle,
                transformStyle: 'preserve-3d',
                backfaceVisibility: 'hidden',
              }}
            >
              <div 
                className={`
                  group/card relative overflow-hidden rounded-2xl md:rounded-3xl
                  transition-all duration-300
                  ${isCenter ? 'shadow-2xl shadow-black/50' : 'shadow-xl shadow-black/30'}
                  glass-elevated
                `}
                onClick={() => isCenter && setSelectedPhoto(photo)}
                style={{
                  aspectRatio: '3/2',
                }}
              >
                {/* Hover shine effect */}
                <div 
                  className="card-shine"
                  style={{
                    background: 'linear-gradient(120deg, transparent, rgba(255, 255, 255, 0.4) 40%, rgba(255, 255, 255, 0.6) 50%, rgba(255, 255, 255, 0.4) 60%, transparent)',
                  }}
                />

                {/* Sparkle effects */}
                <div className="sparkle top-4 right-4" style={{ animationDelay: '0s' }} />
                <div className="sparkle top-8 right-12 w-2 h-2" style={{ animationDelay: '0.3s' }} />
                <div className="sparkle bottom-6 left-8 w-2.5 h-2.5" style={{ animationDelay: '0.6s' }} />

                {/* Image */}
                <img 
                  src={photo.src} 
                  alt={photo.title || `Photo ${index + 1}`}
                  className="w-full h-full object-cover slider-card-image"
                  loading={Math.abs(index - currentIndex) <= 2 ? 'eager' : 'lazy'}
                  draggable={false}
                />

                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-300" />

                {/* Zoom indicator for center card */}
                {isCenter && (
                  <motion.div 
                    className="absolute bottom-4 right-4 p-3 glass rounded-full opacity-0 group-hover/card:opacity-100 transition-opacity duration-300"
                    whileHover={{ scale: 1.1 }}
                  >
                    <ZoomIn className="w-5 h-5 text-white" />
                  </motion.div>
                )}

                {/* Photo title */}
                {photo.title && isCenter && (
                  <div className="absolute bottom-4 left-4 opacity-0 group-hover/card:opacity-100 transition-opacity duration-300">
                    <p className="text-white text-lg font-medium drop-shadow-lg">{photo.title}</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Navigation buttons */}
      {showNavigation && totalItems > 1 && (
        <>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            className="absolute left-2 md:left-8 top-1/2 -translate-y-1/2 z-40 p-3 md:p-4 glass-button rounded-full"
            onClick={handlePrev}
            disabled={isAnimating}
            aria-label="Previous slide"
          >
            <ChevronLeft className="w-5 h-5 md:w-6 md:h-6 text-white" />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            className="absolute right-2 md:right-8 top-1/2 -translate-y-1/2 z-40 p-3 md:p-4 glass-button rounded-full"
            onClick={handleNext}
            disabled={isAnimating}
            aria-label="Next slide"
          >
            <ChevronRight className="w-5 h-5 md:w-6 md:h-6 text-white" />
          </motion.button>
        </>
      )}

      {/* Dots navigation */}
      {showDots && totalItems > 1 && (
        <div className="flex justify-center gap-2 mt-8">
          {photos.map((_, index) => (
            <motion.button
              key={index}
              onClick={() => goToSlide(index)}
              disabled={isAnimating}
              className={`h-2 rounded-full transition-all duration-300 ${
                index === currentIndex 
                  ? 'w-8 bg-white' 
                  : 'w-2 bg-white/30 hover:bg-white/50'
              }`}
              aria-label={`Go to slide ${index + 1}`}
              whileHover={{ scale: 1.2 }}
              whileTap={{ scale: 0.9 }}
            />
          ))}
        </div>
      )}

      {/* Photo counter */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 glass-subtle px-4 py-2 rounded-full">
        <span className="text-white/80 text-sm font-medium">
          {currentIndex + 1} / {totalItems}
        </span>
      </div>

      {/* Fullscreen Modal */}
      <AnimatePresence>
        {selectedPhoto && (
          <motion.div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              background: 'rgba(0, 0, 0, 0.9)',
              backdropFilter: 'blur(20px)',
            }}
            onClick={() => setSelectedPhoto(null)}
          >
            {/* Close button */}
            <motion.button
              className="absolute top-4 right-4 z-10 p-3 glass rounded-full"
              onClick={() => setSelectedPhoto(null)}
              aria-label="Close"
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
            >
              <X className="w-6 h-6 text-white" />
            </motion.button>

            {/* Full-size image */}
            <motion.img
              src={selectedPhoto.src}
              alt={selectedPhoto.title || 'Full size photo'}
              className="max-w-full max-h-full object-contain rounded-lg"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 25 }}
              onClick={(e) => e.stopPropagation()}
            />

            {/* Navigation in modal */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              className="absolute left-4 top-1/2 -translate-y-1/2 p-3 glass rounded-full"
              onClick={(e) => {
                e.stopPropagation();
                const newIndex = (currentIndex - 1 + totalItems) % totalItems;
                setCurrentIndex(newIndex);
                setSelectedPhoto(photos[newIndex]);
              }}
            >
              <ChevronLeft className="w-6 h-6 text-white" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-3 glass rounded-full"
              onClick={(e) => {
                e.stopPropagation();
                const newIndex = (currentIndex + 1) % totalItems;
                setCurrentIndex(newIndex);
                setSelectedPhoto(photos[newIndex]);
              }}
            >
              <ChevronRight className="w-6 h-6 text-white" />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ThreeDSlider;
