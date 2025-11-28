import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AnimatePresence, motion, PanInfo } from 'framer-motion';
import { 
  Settings, Upload, Camera, RefreshCw, Wifi, WifiOff, 
  Download, CheckSquare, Square, ChevronLeft, ChevronRight, X,
  Image, Menu, Maximize, Lock, Eye, EyeOff, RotateCcw, LogOut
} from 'lucide-react';

// Components
import AmbientBackground from '@/components/AmbientBackground';
import UploadZone from '@/components/UploadZone';

// API & Data
import { getAlbums, checkHealth, getImageUrl, getThumbnailUrl, deleteAlbum } from '@/api/albums';
import { mockAlbums } from '@/data/mockData';
import { downloadAlbum, downloadMultipleAlbums } from '@/utils/downloader';
import type { Album, Photo } from '@/types';

// ============================================
// HOOK: useIsMobile - Detect mobile devices
// ============================================
const useIsMobile = (): boolean => {
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768 || 
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsMobile(mobile);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  return isMobile;
};

// ============================================
// HOOK: useOrientation - Detect landscape vs portrait
// ============================================
const useOrientation = (): 'landscape' | 'portrait' => {
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>(() => 
    typeof window !== 'undefined' && window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'
  );
  
  useEffect(() => {
    const checkOrientation = () => {
      setOrientation(window.innerWidth > window.innerHeight ? 'landscape' : 'portrait');
    };
    
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);
  
  return orientation;
};

// ============================================
// ROTATE HINT - Shows briefly on portrait mobile
// ============================================
const RotateHint: React.FC = () => {
  const [visible, setVisible] = useState(true);
  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      setIsPortrait(window.innerHeight > window.innerWidth && window.innerWidth < 768);
    };
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    
    // Hide after 4 seconds
    const timer = setTimeout(() => setVisible(false), 4000);
    
    return () => {
      window.removeEventListener('resize', checkOrientation);
      clearTimeout(timer);
    };
  }, []);

  if (!isPortrait || !visible) return null;

  return (
    <motion.div
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 bg-black/70 backdrop-blur-md px-4 py-2 rounded-full"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: [0, 1, 1, 0], y: 0 }}
      transition={{ duration: 4, times: [0, 0.1, 0.8, 1] }}
    >
      <motion.div
        animate={{ rotate: [0, -90, -90, 0] }}
        transition={{ duration: 2, repeat: 1, repeatDelay: 0.5 }}
      >
        <RotateCcw className="w-5 h-5 text-white" />
      </motion.div>
      <span className="text-white/80 text-sm">Obróć dla lepszego widoku</span>
    </motion.div>
  );
};

// ============================================
// MOBILE CINEMA MODE - Full gesture support with pinch zoom
// ============================================
interface MobileCinemaModeProps {
  albums: Album[];
  initialAlbumIndex: number;
  initialPhotoIndex: number;
  onClose: () => void;
}

const MobileCinemaMode: React.FC<MobileCinemaModeProps> = ({
  albums,
  initialAlbumIndex,
  initialPhotoIndex,
  onClose,
}) => {
  const [albumIndex, setAlbumIndex] = useState(initialAlbumIndex);
  const [photoIndex, setPhotoIndex] = useState(initialPhotoIndex);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [_isFullscreen, setIsFullscreen] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement);
  const lastTapRef = useRef(0);
  const initialDistance = useRef(0);
  const initialScale = useRef(1);
  const isPinching = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);


  // Handle Android back button - close cinema mode instead of leaving page
  useEffect(() => {
    window.history.pushState({ cinemaMode: true }, '');
    const handlePopState = () => onClose();
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [onClose]);
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isNowFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isNowFullscreen);
      
      // Fix white bar after exiting fullscreen on mobile
      if (!isNowFullscreen) {
        setTimeout(() => {
          window.scrollTo(0, 0);
          document.body.style.height = '100vh';
          document.body.style.height = '100dvh';
          requestAnimationFrame(() => {
            document.body.style.height = '';
          });
        }, 100);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const currentAlbum = albums[albumIndex];
  const currentPhoto = currentAlbum?.photos[photoIndex];

  // Flatten all photos
  const allPhotos = useMemo(() => {
    return albums.flatMap((album, aIdx) => 
      album.photos.map((photo, pIdx) => ({ 
        photo, albumIndex: aIdx, photoIndex: pIdx, albumName: album.name 
      }))
    );
  }, [albums]);

  const currentFlatIndex = useMemo(() => {
    let idx = 0;
    for (let a = 0; a < albumIndex; a++) idx += albums[a].photos.length;
    return idx + photoIndex;
  }, [albums, albumIndex, photoIndex]);

  const goToFlatIndex = useCallback((flatIdx: number) => {
    if (flatIdx < 0 || flatIdx >= allPhotos.length) return;
    const target = allPhotos[flatIdx];
    setImageLoaded(false);
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setAlbumIndex(target.albumIndex);
    setPhotoIndex(target.photoIndex);
  }, [allPhotos]);

  // Double tap to zoom
  const handleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      // Double tap - toggle zoom
      if (scale > 1) {
        setScale(1);
        setPosition({ x: 0, y: 0 });
      } else {
        setScale(2.5);
      }
    }
    lastTapRef.current = now;
  }, [scale]);

  // Pinch to zoom - zachowuje pozycję po puszczeniu
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      isPinching.current = true;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      initialDistance.current = Math.hypot(dx, dy);
      initialScale.current = scale;
    } else if (e.touches.length === 1) {
      isPinching.current = false;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.hypot(dx, dy);
      const rawScale = initialScale.current * (distance / initialDistance.current);
      const clampedScale = Math.min(5, Math.max(1, rawScale));
      const normalizedScale = clampedScale <= 1.01 ? 1 : clampedScale;
      setScale(normalizedScale);
      if (normalizedScale === 1) {
        setPosition({ x: 0, y: 0 });
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (isPinching.current) {
      if (e.touches.length === 0) {
        isPinching.current = false;
      }
      lastTapRef.current = 0;
      return;
    }
    handleTap();
  };

  // Swipe navigation (when not zoomed)
  const handlePan = (_e: any, info: PanInfo) => {
    if (scale > 1) {
      // Pan zoomed image
      setPosition(prev => ({
        x: prev.x + info.delta.x,
        y: prev.y + info.delta.y
      }));
    }
  };

  const handlePanEnd = (_e: any, info: PanInfo) => {
    if (scale === 1) {
      const offsetX = info.offset.x;
      const offsetY = info.offset.y;
      const velocityX = info.velocity.x;
      
      // Check if vertical swipe is stronger (for portrait mode)
      if (Math.abs(offsetY) > Math.abs(offsetX) && Math.abs(offsetY) > 60) {
        // Swipe up = next, swipe down = prev
        const direction = offsetY < 0 ? 1 : -1;
        goToFlatIndex(currentFlatIndex + direction);
        return;
      }
      
      // Horizontal swipe
      if (Math.abs(velocityX) > 250 || Math.abs(offsetX) > 80) {
        const direction = offsetX > 0 ? -1 : 1;
        const offsetSteps = Math.round(Math.abs(offsetX) / 120);
        const velocitySteps = Math.round(Math.abs(velocityX) / 700);
        let totalSteps = offsetSteps + velocitySteps;
        if (totalSteps === 0) totalSteps = 1;
        goToFlatIndex(currentFlatIndex + direction * totalSteps);
      }
    } else {
      const bounds = containerRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const maxX = ((scale - 1) * bounds.width) / 2;
      const maxY = ((scale - 1) * bounds.height) / 2;
      setPosition(prev => ({
        x: Math.min(Math.max(prev.x, -maxX), maxX),
        y: Math.min(Math.max(prev.y, -maxY), maxY),
      }));
    }
  };

  // Handle tap on backdrop (outside photo) to close
  const handleBackdropClick = (e: React.MouseEvent) => {
    // Only close if clicking directly on backdrop, not on photo
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!currentPhoto) return null;

  return (
    <motion.div
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-black flex flex-col select-none touch-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top bar - minimalistyczny */}
      <div className="absolute top-0 left-0 right-0 z-20 p-3 flex items-center justify-between">
        {/* Counter */}
        <div className="bg-black/40 backdrop-blur-sm px-2 py-1 rounded-lg">
          <span className="text-white/70 text-xs">{currentFlatIndex + 1} / {allPhotos.length}</span>
        </div>
        
        {/* Right controls */}
        <div className="flex items-center gap-2">
          <motion.button
            className="p-2 bg-black/40 backdrop-blur-sm rounded-full"
            onClick={toggleFullscreen}
            whileTap={{ scale: 0.9 }}
          >
            <Maximize className="w-4 h-4 text-white/80" />
          </motion.button>
          <motion.button
            className="p-2 bg-black/40 backdrop-blur-sm rounded-full"
            onClick={onClose}
            whileTap={{ scale: 0.9 }}
          >
            <X className="w-5 h-5 text-white/80" />
          </motion.button>
        </div>
      </div>

      {/* Photo with gestures */}
      <motion.div
        className="flex-1 flex items-center justify-center overflow-hidden p-4"
        onPan={handlePan}
        onPanEnd={handlePanEnd}
        onClick={handleBackdropClick}
      >
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          </div>
        )}
        
        <motion.img
          key={`${albumIndex}-${photoIndex}`}
          src={currentPhoto.src}
          alt=""
          className="max-w-full max-h-full object-contain pointer-events-none"
          style={{
            scale,
            x: position.x,
            y: position.y,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: imageLoaded ? 1 : 0 }}
          transition={{ duration: 0.2 }}
          onLoad={() => setImageLoaded(true)}
          draggable={false}
        />
      </motion.div>

      {/* Bottom progress bar - minimalistyczny, bez instrukcji */}
      <div className="absolute bottom-0 left-0 right-0 h-1">
        <div className="h-full bg-white/10">
          <motion.div
            className="h-full bg-white/40"
            initial={{ width: 0 }}
            animate={{ width: `${((currentFlatIndex + 1) / allPhotos.length) * 100}%` }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          />
        </div>
        {/* Świetlisty wskaźnik */}
        <motion.div
          className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full shadow-[0_0_8px_2px_rgba(255,255,255,0.6)]"
          style={{ left: `${((currentFlatIndex + 1) / allPhotos.length) * 100}%` }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      </div>
    </motion.div>
  );
};

// ============================================
// MOBILE GALLERY VIEW - Orientation-aware: Landscape slider / Portrait masonry
// ============================================
interface MobileGalleryProps {
  albums: Album[];
  activeAlbumIndex: number;
  activePhotoIndex: number;
  onAlbumChange: (index: number) => void;
  onPhotoChange: (index: number) => void;
  onPhotoClick: (index: number) => void;
}

// Helper: Generate random size multiplier for masonry (seeded by photo id for consistency)
const getRandomSize = (photoId: string): number => {
  let hash = 0;
  for (let i = 0; i < photoId.length; i++) {
    hash = ((hash << 5) - hash) + photoId.charCodeAt(i);
    hash = hash & hash;
  }
  // Range: 0.5 to 1.3
  return 0.5 + (Math.abs(hash) % 80) / 100;
};

// ============================================
// MOBILE LANDSCAPE SLIDER - 3D effect like desktop
// ============================================
interface MobileLandscapeSliderProps {
  photos: Photo[];
  activeIndex: number;
  onActiveChange: (index: number) => void;
  onPhotoClick: (index: number) => void;
}

const MobileLandscapeSlider: React.FC<MobileLandscapeSliderProps> = ({
  photos,
  activeIndex,
  onActiveChange,
  onPhotoClick,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);

  const handlePrev = useCallback(() => {
    if (photos.length === 0) return;
    const newIndex = (activeIndex - 1 + photos.length) % photos.length;
    onActiveChange(newIndex);
  }, [activeIndex, photos.length, onActiveChange]);

  const handleNext = useCallback(() => {
    if (photos.length === 0) return;
    const newIndex = (activeIndex + 1) % photos.length;
    onActiveChange(newIndex);
  }, [activeIndex, photos.length, onActiveChange]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    dragStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const diff = dragStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) {
      if (diff > 0) handleNext();
      else handlePrev();
    }
    setIsDragging(false);
  };

  const getCardStyle = (index: number): React.CSSProperties => {
    const diff = (index - activeIndex + photos.length) % photos.length;
    const adjustedDiff = diff > photos.length / 2 ? diff - photos.length : diff;

    if (adjustedDiff === 0) {
      return {
        transform: 'translateX(0%) translateZ(80px) scale(1.04)',
        opacity: 1,
        zIndex: 30,
        filter: 'blur(0px)',
      };
    } else if (adjustedDiff === 1) {
      return {
        transform: 'translateX(75%) translateZ(-40px) scale(0.45) rotateY(-25deg)',
        opacity: 0.5,
        zIndex: 20,
        filter: 'blur(2px)',
      };
    } else if (adjustedDiff === -1) {
      return {
        transform: 'translateX(-75%) translateZ(-40px) scale(0.45) rotateY(25deg)',
        opacity: 0.5,
        zIndex: 20,
        filter: 'blur(2px)',
      };
    }
    return {
      transform: adjustedDiff > 0 ? 'translateX(130%) scale(0.3)' : 'translateX(-130%) scale(0.3)',
      opacity: 0,
      zIndex: 10,
    };
  };

  if (photos.length === 0) return null;

  return (
    <div className="w-full h-full flex items-center justify-center">
      {/* Navigation buttons */}
      {photos.length > 1 && (
        <>
          <button
            onClick={handlePrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-50 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors backdrop-blur-sm"
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <button
            onClick={handleNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-50 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors backdrop-blur-sm"
          >
            <ChevronRight className="w-5 h-5 text-white" />
          </button>
        </>
      )}

      {/* 3D Slider */}
      <div
        className="relative w-full h-full flex items-center justify-center select-none"
        style={{ perspective: '1000px' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {photos.map((photo, index) => (
          <div
            key={photo.id}
            className="absolute w-full max-w-[55%] transition-all duration-400 ease-out cursor-pointer"
            style={{
              ...getCardStyle(index),
              transformStyle: 'preserve-3d',
              maxHeight: '70%',
            }}
            onClick={() => index === activeIndex && onPhotoClick(activeIndex)}
          >
            <div className="relative rounded-lg overflow-hidden shadow-2xl shadow-black/50">
              <img
                src={photo.src}
                alt={photo.title || ''}
                className="w-full h-full object-cover"
                style={{ maxHeight: '70vh', aspectRatio: '3/2' }}
                draggable={false}
                loading="lazy"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================
// MOBILE PORTRAIT MASONRY - Floating grid with fade mask
// ============================================
interface MobilePortraitMasonryProps {
  photos: Photo[];
  onPhotoClick: (index: number) => void;
  activePhotoIndex: number;
  onActiveChange: (index: number) => void;
}

const MobilePortraitMasonry: React.FC<MobilePortraitMasonryProps> = ({
  photos,
  onPhotoClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = useState(0);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [isDrifting, setIsDrifting] = useState(false);
  const driftAnimationRef = useRef<number | null>(null);
  const driftStartTime = useRef<number>(0);
  const driftStartScroll = useRef<number>(0);
  const userScrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const isScrollbarDragging = useRef(false);

  const DRIFT_DURATION = 15000; // 15 seconds
  const PAUSE_AFTER_INTERACTION = 5000; // 5 seconds

  // Calculate total height and photo positions
  const baseSize = 100; // Base size in pixels for calculations
  const columnCount = 3;
  const gap = 6;

  const photoData = useMemo(() => {
    const columns: { height: number; items: { photo: Photo; index: number; size: number; top: number }[] }[] = 
      Array.from({ length: columnCount }, () => ({ height: 0, items: [] }));

    photos.forEach((photo, index) => {
      const size = getRandomSize(photo.id);
      const height = baseSize * size;
      
      // Find shortest column
      let shortestCol = 0;
      for (let i = 1; i < columnCount; i++) {
        if (columns[i].height < columns[shortestCol].height) {
          shortestCol = i;
        }
      }
      
      columns[shortestCol].items.push({
        photo,
        index,
        size,
        top: columns[shortestCol].height,
      });
      columns[shortestCol].height += height + gap;
    });

    return columns;
  }, [photos]);

  const totalHeight = useMemo(() => {
    return Math.max(...photoData.map(col => col.height));
  }, [photoData]);

  // Ease in-out function
  const easeInOutCubic = (t: number): number => {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

  // Start drift animation
  const startDrift = useCallback(() => {
    if (!containerRef.current || isUserScrolling) return;
    
    setIsDrifting(true);
    driftStartTime.current = performance.now();
    driftStartScroll.current = containerRef.current.scrollTop;
    
    const maxScroll = totalHeight - containerRef.current.clientHeight;
    const scrollDistance = maxScroll * 0.3; // Drift 30% of scrollable area
    
    const animate = (currentTime: number) => {
      if (!containerRef.current || isUserScrolling) {
        setIsDrifting(false);
        return;
      }
      
      const elapsed = currentTime - driftStartTime.current;
      const progress = Math.min(elapsed / DRIFT_DURATION, 1);
      const easedProgress = easeInOutCubic(progress);
      
      let newScroll = driftStartScroll.current + scrollDistance * easedProgress;
      
      // Loop back if reaching end
      if (newScroll >= maxScroll) {
        newScroll = newScroll - maxScroll;
      }
      
      containerRef.current.scrollTop = newScroll;
      
      if (progress < 1) {
        driftAnimationRef.current = requestAnimationFrame(animate);
      } else {
        // Drift complete, start new one
        setIsDrifting(false);
        driftAnimationRef.current = requestAnimationFrame(() => startDrift());
      }
    };
    
    driftAnimationRef.current = requestAnimationFrame(animate);
  }, [isUserScrolling, totalHeight]);

  // Auto-start drift on mount and after user interaction pause
  useEffect(() => {
    if (!isUserScrolling && !isDrifting) {
      const timeout = setTimeout(() => {
        startDrift();
      }, 500);
      return () => clearTimeout(timeout);
    }
    
    return () => {
      if (driftAnimationRef.current) {
        cancelAnimationFrame(driftAnimationRef.current);
      }
    };
  }, [isUserScrolling, isDrifting, startDrift]);

  // Handle user interaction
  const handleTouchStart = () => {
    setIsUserScrolling(true);
    setIsDrifting(false);
    if (driftAnimationRef.current) {
      cancelAnimationFrame(driftAnimationRef.current);
    }
    if (userScrollTimeout.current) {
      clearTimeout(userScrollTimeout.current);
    }
  };

  const handleTouchEnd = () => {
    userScrollTimeout.current = setTimeout(() => {
      setIsUserScrolling(false);
      // Will trigger useEffect to start drift again
    }, PAUSE_AFTER_INTERACTION);
  };

  const handleScroll = () => {
    if (containerRef.current) {
      setScrollY(containerRef.current.scrollTop);
    }
  };

  // Scrollbar navigation
  const updateScrollFromScrollbar = useCallback((clientY: number) => {
    if (!scrollbarRef.current || !containerRef.current) return;
    const rect = scrollbarRef.current.getBoundingClientRect();
    const ratio = (clientY - rect.top) / rect.height;
    const clamped = Math.min(Math.max(ratio, 0), 1);
    const maxScroll = totalHeight - containerRef.current.clientHeight;
    containerRef.current.scrollTop = clamped * maxScroll;
  }, [totalHeight]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!isScrollbarDragging.current) return;
      event.preventDefault();
      updateScrollFromScrollbar(event.clientY);
    };

    const handlePointerUp = () => {
      isScrollbarDragging.current = false;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [updateScrollFromScrollbar]);

  const handleScrollbarPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    isScrollbarDragging.current = true;
    setIsUserScrolling(true);
    updateScrollFromScrollbar(event.clientY);
    
    if (userScrollTimeout.current) {
      clearTimeout(userScrollTimeout.current);
    }
    userScrollTimeout.current = setTimeout(() => {
      setIsUserScrolling(false);
    }, 3000);
  };

  // Calculate visibility for fade effect
  const getPhotoOpacity = (top: number, height: number): number => {
    if (!containerRef.current) return 1;
    const viewportHeight = containerRef.current.clientHeight;
    const photoCenter = top + height / 2 - scrollY;
    const viewportCenter = viewportHeight / 2;
    const distance = Math.abs(photoCenter - viewportCenter);
    const maxDistance = viewportHeight / 2;
    
    // Full opacity in middle 60%, fade at edges
    if (distance < maxDistance * 0.3) return 1;
    if (distance > maxDistance) return 0;
    return 1 - ((distance - maxDistance * 0.3) / (maxDistance * 0.7));
  };

  const scrollProgress = containerRef.current 
    ? scrollY / Math.max(totalHeight - containerRef.current.clientHeight, 1) 
    : 0;

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Gradient masks for fade effect */}
      <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-black via-black/80 to-transparent z-10 pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black via-black/80 to-transparent z-10 pointer-events-none" />

      {/* Masonry container */}
      <div
        ref={containerRef}
        className="w-full h-full overflow-y-auto scrollbar-hide px-2"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onScroll={handleScroll}
        style={{ scrollBehavior: isUserScrolling ? 'auto' : 'smooth' }}
      >
        <div className="relative" style={{ height: totalHeight + 100 }}>
          <div className="flex gap-1.5 pt-16 pb-16">
            {photoData.map((column, colIndex) => (
              <div 
                key={colIndex} 
                className="flex-1 flex flex-col gap-1.5"
              >
                {column.items.map(({ photo, index, size, top }) => {
                  const height = baseSize * size;
                  const opacity = getPhotoOpacity(top, height);
                  
                  return (
                    <motion.div
                      key={photo.id}
                      className="relative overflow-hidden rounded-lg cursor-pointer"
                      style={{ 
                        height,
                        opacity,
                      }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => onPhotoClick(index)}
                    >
                      <img
                        src={photo.thumbnail || photo.src}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                        draggable={false}
                      />
                    </motion.div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Vertical scrollbar */}
      <div 
        ref={scrollbarRef}
        className="absolute right-2 top-20 bottom-20 w-1 bg-white/10 rounded-full z-20 cursor-pointer"
        onPointerDown={handleScrollbarPointerDown}
      >
        <motion.div
          className="absolute w-3 h-3 bg-white rounded-full shadow-[0_0_8px_2px_rgba(255,255,255,0.5)] -left-1"
          style={{ top: `calc(${scrollProgress * 100}% - 6px)` }}
          whileHover={{ scale: 1.3 }}
          whileTap={{ scale: 1.1 }}
        />
      </div>
    </div>
  );
};

// ============================================
// MOBILE GALLERY - Main wrapper with orientation detection
// ============================================
const MobileGallery: React.FC<MobileGalleryProps> = ({
  albums,
  activeAlbumIndex,
  activePhotoIndex,
  onAlbumChange,
  onPhotoChange,
  onPhotoClick,
}) => {
  const orientation = useOrientation();
  const currentAlbum = albums[activeAlbumIndex];
  const photos = currentAlbum?.photos || [];
  const [_isFullscreen, setIsFullscreen] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isNowFullscreen = !!document.fullscreenElement;
      setIsFullscreen(isNowFullscreen);
      
      // Fix white bar after exiting fullscreen on mobile
      if (!isNowFullscreen) {
        setTimeout(() => {
          window.scrollTo(0, 0);
          document.body.style.height = '100vh';
          document.body.style.height = '100dvh';
          requestAnimationFrame(() => {
            document.body.style.height = '';
          });
        }, 100);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  if (!currentAlbum || photos.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center text-white/40">
        <div className="text-center">
          <Image className="w-12 h-12 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Wybierz album</p>
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {orientation === 'landscape' ? (
        <motion.div
          key="landscape"
          className="h-screen flex relative"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Main slider area - 90% */}
          <div className="flex-1 relative overflow-hidden" style={{ width: '90%' }}>
            {/* Counter */}
            <div className="absolute top-3 left-3 z-20 bg-black/50 backdrop-blur-sm px-2 py-1 rounded-lg">
              <span className="text-white/70 text-xs">
                {activePhotoIndex + 1} / {photos.length}
              </span>
            </div>

            {/* Fullscreen toggle */}
            <button
              onClick={toggleFullscreen}
              className="absolute top-3 right-3 z-20 p-1.5 bg-black/50 backdrop-blur-sm rounded-lg text-white/70"
            >
              <Maximize className="w-4 h-4" />
            </button>

            {/* 3D Slider */}
            <div className="w-full h-full pt-2 pb-4 pl-3 pr-2">
              <MobileLandscapeSlider
                photos={photos}
                activeIndex={activePhotoIndex}
                onActiveChange={onPhotoChange}
                onPhotoClick={onPhotoClick}
              />
            </div>

            {/* Bottom progress bar */}
            <div className="absolute bottom-2 left-4 right-4 h-1 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-white/40 rounded-full"
                animate={{ width: `${((activePhotoIndex + 1) / photos.length) * 100}%` }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              />
            </div>
          </div>

          {/* Album thumbnails - 10% */}
          <div className="w-[10%] min-w-[50px] bg-black/50 backdrop-blur-md flex flex-col py-2 gap-1.5 overflow-y-auto">
            {albums.map((album, index) => (
              <motion.button
                key={album.id}
                className={`mx-1 aspect-square rounded-md overflow-hidden transition-all ${
                  index === activeAlbumIndex ? 'ring-2 ring-white shadow-lg' : 'opacity-40'
                }`}
                onClick={() => {
                  onAlbumChange(index);
                  onPhotoChange(0);
                }}
                whileTap={{ scale: 0.85 }}
              >
                {album.thumbnail ? (
                  <img src={album.thumbnail} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                    <Image className="w-3 h-3 text-white/30" />
                  </div>
                )}
              </motion.button>
            ))}
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="portrait"
          className="h-screen relative"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Album selector at top */}
          <div className="absolute top-0 left-0 right-0 z-20 pt-4 pb-2 px-[22%] bg-gradient-to-b from-black via-black/80 to-transparent">
            <div className="flex gap-2 overflow-x-auto py-1 scrollbar-hide justify-center">
              {albums.map((album, index) => (
                <motion.button
                  key={album.id}
                  className={`flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden transition-all ${
                    index === activeAlbumIndex ? 'ring-2 ring-white shadow-lg' : 'opacity-40'
                  }`}
                  onClick={() => {
                    onAlbumChange(index);
                    onPhotoChange(0);
                  }}
                  whileTap={{ scale: 0.85 }}
                >
                  {album.thumbnail ? (
                    <img src={album.thumbnail} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                      <Image className="w-3 h-3 text-white/30" />
                    </div>
                  )}
                </motion.button>
              ))}
            </div>
            <button
              onClick={toggleFullscreen}
              className="p-2 bg-black/50 backdrop-blur-sm rounded-lg text-white/70"
            >
              <Maximize className="w-4 h-4" />
            </button>
          </div>

          {/* Masonry grid */}
          <MobilePortraitMasonry
            photos={photos}
            activePhotoIndex={activePhotoIndex}
            onActiveChange={onPhotoChange}
            onPhotoClick={onPhotoClick}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ============================================
// CINEMA MODE - Fullscreen Photo Viewer
// ============================================
interface CinemaModeProps {
  albums: Album[];
  initialAlbumIndex: number;
  initialPhotoIndex: number;
  onClose: () => void;
}

const CinemaMode: React.FC<CinemaModeProps> = ({
  albums,
  initialAlbumIndex,
  initialPhotoIndex,
  onClose,
}) => {
  const [albumIndex, setAlbumIndex] = useState(initialAlbumIndex);
  const [photoIndex, setPhotoIndex] = useState(initialPhotoIndex);
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const [imageLoaded, setImageLoaded] = useState(false);
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const isScrollbarDragging = useRef(false);

  const currentAlbum = albums[albumIndex];
  const currentPhoto = currentAlbum?.photos[photoIndex];

  // Flatten all photos for seamless navigation
  const allPhotos = useMemo(() => {
    return albums.flatMap((album, aIdx) => 
      album.photos.map((photo, pIdx) => ({ 
        photo, 
        albumIndex: aIdx, 
        photoIndex: pIdx,
        albumName: album.name 
      }))
    );
  }, [albums]);

  // Find current position in flattened array
  const currentFlatIndex = useMemo(() => {
    let idx = 0;
    for (let a = 0; a < albumIndex; a++) {
      idx += albums[a].photos.length;
    }
    return idx + photoIndex;
  }, [albums, albumIndex, photoIndex]);

  const goToFlatIndex = useCallback((flatIdx: number) => {
    if (flatIdx < 0 || flatIdx >= allPhotos.length) return;
    const target = allPhotos[flatIdx];
    setImageLoaded(false); // Reset loading state
    setAlbumIndex(target.albumIndex);
    setPhotoIndex(target.photoIndex);
  }, [allPhotos]);

  const goNext = useCallback(() => {
    goToFlatIndex(currentFlatIndex + 1);
  }, [currentFlatIndex, goToFlatIndex]);

  const goPrev = useCallback(() => {
    goToFlatIndex(currentFlatIndex - 1);
  }, [currentFlatIndex, goToFlatIndex]);

  // Close handler
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev, handleClose]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  // Touch/swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart) return;
    const deltaX = e.touches[0].clientX - touchStart.x;
    setDragOffset(deltaX);
  };

  const handleTouchEnd = () => {
    if (!touchStart) return;
    const threshold = 80;
    if (dragOffset > threshold) goPrev();
    else if (dragOffset < -threshold) goNext();
    setTouchStart(null);
    setDragOffset(0);
  };

  // Mouse drag handlers for photo area only
  const handlePhotoDragStart = (e: React.MouseEvent) => {
    setTouchStart({ x: e.clientX, y: e.clientY });
  };

  const handlePhotoDragMove = (e: React.MouseEvent) => {
    if (!touchStart) return;
    const deltaX = e.clientX - touchStart.x;
    setDragOffset(deltaX);
  };

  const handlePhotoDragEnd = () => {
    if (!touchStart) return;
    const threshold = 80;
    if (dragOffset > threshold) goPrev();
    else if (dragOffset < -threshold) goNext();
    setTouchStart(null);
    setDragOffset(0);
  };

  const updateCinemaScrollbar = useCallback((clientX: number) => {
    if (!scrollbarRef.current || allPhotos.length <= 1) return;
    const rect = scrollbarRef.current.getBoundingClientRect();
    if (rect.width === 0) return;
    const ratio = (clientX - rect.left) / rect.width;
    const clamped = Math.min(Math.max(ratio, 0), 1);
    const newIndex = Math.round(clamped * (allPhotos.length - 1));
    goToFlatIndex(newIndex);
  }, [allPhotos.length, goToFlatIndex]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!isScrollbarDragging.current) return;
      event.preventDefault();
      updateCinemaScrollbar(event.clientX);
    };

    const handlePointerUp = () => {
      if (isScrollbarDragging.current) {
        isScrollbarDragging.current = false;
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [updateCinemaScrollbar]);

  const handleScrollbarPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (allPhotos.length <= 1) return;
    event.preventDefault();
    isScrollbarDragging.current = true;
    updateCinemaScrollbar(event.clientX);
  };

  if (!currentPhoto) return null;

  // Progress percentage for scrollbar
  const progressPercentage = allPhotos.length > 1 
    ? (currentFlatIndex / (allPhotos.length - 1)) * 100 
    : 0;

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex flex-col select-none overflow-hidden bg-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Ambient background - blurred photo */}
      <motion.div
        key={`bg-${albumIndex}-${photoIndex}`}
        className="absolute inset-0 z-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        <img
          src={currentPhoto.src}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            filter: 'blur(80px) saturate(1.5) brightness(0.4)',
            transform: 'scale(1.2)',
          }}
        />
        {/* Dark overlay for better contrast */}
        <div className="absolute inset-0 bg-black/50" />
      </motion.div>

      {/* Clickable backdrop to close */}
      <div 
        className="absolute inset-0 z-[1] cursor-pointer"
        onClick={handleClose}
      />

      {/* Top bar with controls - minimalistyczny */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4">
        {/* Photo counter only - bez nazwy albumu */}
        <div className="text-white/50 text-sm bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-lg">
          {currentFlatIndex + 1} / {allPhotos.length}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          {/* Fullscreen button */}
          <motion.button
            className="p-2.5 bg-black/30 hover:bg-black/50 backdrop-blur-sm rounded-full transition-colors"
            onClick={toggleFullscreen}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title={isFullscreen ? "Wyłącz pełny ekran" : "Pełny ekran"}
          >
            <Maximize className="w-5 h-5 text-white/70" />
          </motion.button>

          {/* Close button */}
          <motion.button
            className="p-2.5 bg-black/30 hover:bg-red-500/70 backdrop-blur-sm rounded-full transition-colors"
            onClick={handleClose}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <X className="w-5 h-5 text-white" />
          </motion.button>
        </div>
      </div>

      {/* Navigation arrows - subtle, same size */}
      <div className="absolute left-0 top-0 bottom-0 w-16 md:w-20 z-10 flex items-center justify-start pl-2 md:pl-3">
        {currentFlatIndex > 0 && (
          <motion.button
            className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
            onClick={goPrev}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <ChevronLeft className="w-4 h-4 text-white" />
          </motion.button>
        )}
      </div>

      <div className="absolute right-0 top-0 bottom-0 w-16 md:w-20 z-10 flex items-center justify-end pr-2 md:pr-3">
        {currentFlatIndex < allPhotos.length - 1 && (
          <motion.button
            className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
            onClick={goNext}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <ChevronRight className="w-4 h-4 text-white" />
          </motion.button>
        )}
      </div>

      {/* Photo container - maksymalna wielkość */}
      <div 
        className="flex-1 relative z-[5] flex items-center justify-center cursor-grab active:cursor-grabbing p-1 pb-4"
        onMouseDown={handlePhotoDragStart}
        onMouseMove={handlePhotoDragMove}
        onMouseUp={handlePhotoDragEnd}
        onMouseLeave={handlePhotoDragEnd}
      >
        {/* Loading placeholder */}
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 border-4 border-white/20 border-t-white/60 rounded-full animate-spin" />
          </div>
        )}
        
        <motion.img
          key={`${albumIndex}-${photoIndex}`}
          src={currentPhoto.src}
          alt={currentPhoto.title || ''}
          className={`max-w-full max-h-[92vh] w-auto h-auto object-contain rounded-lg shadow-2xl pointer-events-none transition-opacity duration-300 ${
            imageLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            transform: `translateX(${dragOffset * 0.3}px)`,
            transition: dragOffset === 0 ? 'transform 0.2s ease-out' : 'none',
          }}
          draggable={false}
          onLoad={() => setImageLoaded(true)}
          onError={(e) => {
            console.error('Failed to load image:', currentPhoto.src);
            setImageLoaded(true);
            if (currentPhoto.thumbnail) {
              (e.target as HTMLImageElement).src = currentPhoto.thumbnail;
            }
          }}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: imageLoaded ? 1 : 0, scale: 1 }}
          transition={{ duration: 0.2 }}
        />
      </div>

      {/* Bottom scrollbar - minimalistyczny, cienki z podziałkami wewnątrz */}
      <div className="absolute bottom-3 left-0 right-0 z-20 px-8">
        <div 
          ref={scrollbarRef}
          className="relative h-1 bg-white/15 rounded-full cursor-pointer"
          onPointerDown={handleScrollbarPointerDown}
        >
          {/* Album markers - podziałki wewnątrz paska */}
          {albums.map((album, idx) => {
            if (idx === 0) return null;
            let photosBeforeAlbum = 0;
            for (let i = 0; i < idx; i++) {
              photosBeforeAlbum += albums[i].photos.length;
            }
            const markerPosition = (photosBeforeAlbum / allPhotos.length) * 100;
            return (
              <div
                key={album.id}
                className="absolute top-0 w-px h-full bg-white/40"
                style={{ left: `${markerPosition}%` }}
              />
            );
          })}
          
          {/* Progress fill */}
          <motion.div 
            className="absolute left-0 top-0 bottom-0 bg-white/30 rounded-full"
            animate={{ width: `${progressPercentage}%` }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          />
          
          {/* Świetlisty punkt - środek zawsze na linii */}
          <motion.div
            className="absolute w-4 h-4 bg-white rounded-full shadow-[0_0_10px_3px_rgba(255,255,255,0.6)] cursor-grab active:cursor-grabbing z-20"
            style={{ top: '50%', marginTop: '-8px' }}
            animate={{ left: `calc(${progressPercentage}% - 8px)` }}
            whileHover={{ scale: 1.2, boxShadow: '0 0 15px 5px rgba(255,255,255,0.8)' }}
            whileTap={{ scale: 1.1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          />
        </div>
      </div>
    </motion.div>
  );
};

interface SliderProps {
  photos: Photo[];
  onPhotoClick: (index: number) => void;
  activeIndex: number;
  onActiveChange: (index: number) => void;
  className?: string;
}

const Slider3D: React.FC<SliderProps> = ({ photos, onPhotoClick, activeIndex, onActiveChange, className = '' }) => {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);

  const handlePrev = useCallback(() => {
    if (photos.length === 0) return;
    const newIndex = (activeIndex - 1 + photos.length) % photos.length;
    onActiveChange(newIndex);
  }, [activeIndex, photos.length, onActiveChange]);

  const handleNext = useCallback(() => {
    if (photos.length === 0) return;
    const newIndex = (activeIndex + 1) % photos.length;
    onActiveChange(newIndex);
  }, [activeIndex, photos.length, onActiveChange]);

  // Mouse drag
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartX.current = e.clientX;
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const diff = dragStartX.current - e.clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) handleNext();
      else handlePrev();
    }
    setIsDragging(false);
  };

  // Touch
  const handleTouchStart = (e: React.TouchEvent) => {
    dragStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = dragStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) handleNext();
      else handlePrev();
    }
  };

  // Keyboard
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') handlePrev();
      else if (e.key === 'ArrowRight') handleNext();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handlePrev, handleNext]);

  const getCardStyle = (index: number): React.CSSProperties => {
    const diff = (index - activeIndex + photos.length) % photos.length;
    const adjustedDiff = diff > photos.length / 2 ? diff - photos.length : diff;

    if (adjustedDiff === 0) {
      return {
        transform: 'translateX(0%) translateZ(100px) scale(1.45)',
        opacity: 1,
        zIndex: 30,
        filter: 'blur(0px)',
      };
    } else if (adjustedDiff === 1) {
      return {
        transform: 'translateX(85%) translateZ(-50px) scale(0.6) rotateY(-30deg)',
        opacity: 0.5,
        zIndex: 20,
        filter: 'blur(3px)',
      };
    } else if (adjustedDiff === -1) {
      return {
        transform: 'translateX(-85%) translateZ(-50px) scale(0.6) rotateY(30deg)',
        opacity: 0.5,
        zIndex: 20,
        filter: 'blur(3px)',
      };
    }
    return {
      transform: adjustedDiff > 0 
        ? 'translateX(150%) scale(0.4)' 
        : 'translateX(-150%) scale(0.4)',
      opacity: 0,
      zIndex: 10,
    };
  };

  if (photos.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-white/40">
        <div className="text-center">
          <Image className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p>Wybierz album</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full h-full ${className}`}>
      {/* Image area only - navigation buttons moved to GalleryPage */}
      <div
        className="relative w-full h-full flex items-center justify-center select-none"
        style={{ perspective: '1500px' }}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => setIsDragging(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {photos.map((photo, index) => (
          <div
            key={photo.id}
            className="absolute w-full max-w-[65%] md:max-w-[500px] lg:max-w-[580px] transition-all duration-500 ease-out cursor-pointer"
            style={{
              ...getCardStyle(index),
              transformStyle: 'preserve-3d',
            }}
            onClick={() => index === activeIndex && onPhotoClick(activeIndex)}
          >
            <div className="relative rounded-xl md:rounded-2xl overflow-hidden shadow-2xl shadow-black/50">
              <img
                src={photo.src}
                alt={photo.title || ''}
                className="w-full aspect-[3/2] object-cover"
                draggable={false}
                loading="lazy"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================
// GALLERY PAGE - Clean UI
// ============================================
const PASSWORD_OWNER = 'lena2025!';  // Pełny dostęp z pobieraniem
const PASSWORD_GUEST = 'lenka2025';   // Tylko podgląd, bez pobierania

type UserRole = 'owner' | 'guest' | null;

const GalleryPage: React.FC = () => {
  const isMobile = useIsMobile();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [activeAlbumIndex, setActiveAlbumIndex] = useState(0);
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAlbums, setSelectedAlbums] = useState<Set<string>>(new Set());
  const [cinemaMode, setCinemaMode] = useState<{ albumIndex: number; photoIndex: number } | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userRole, setUserRole] = useState<UserRole>(() => {
    const saved = sessionStorage.getItem('gallery_role');
    return (saved === 'owner' || saved === 'guest') ? saved : null;
  });
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Scrollbar dragging refs
  const galleryScrollbarRef = useRef<HTMLDivElement>(null);
  const isGalleryScrollbarDragging = useRef(false);

  const currentAlbum = albums[activeAlbumIndex];
  const canDownload = userRole === 'owner';
  const selectedCount = selectedAlbums.size;

  // Password check
  const handleLogin = () => {
    if (passwordInput === PASSWORD_OWNER) {
      setUserRole('owner');
      sessionStorage.setItem('gallery_role', 'owner');
      setPasswordError(false);
    } else if (passwordInput === PASSWORD_GUEST) {
      setUserRole('guest');
      sessionStorage.setItem('gallery_role', 'guest');
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  };

  // Fetch albums
  const fetchAlbums = useCallback(async () => {
    setIsLoading(true);
    try {
      const backendAvailable = await checkHealth();
      if (backendAvailable) {
        const data = await getAlbums();
        const transformed = data.map(album => ({
          ...album,
          thumbnail: getThumbnailUrl(album.thumbnail),
          photos: album.photos.map(photo => ({
            ...photo,
            src: getImageUrl(photo.src),
            thumbnail: photo.thumbnail ? getThumbnailUrl(photo.thumbnail) : undefined,
          })),
        }));
        setAlbums(transformed);
      } else {
        setAlbums(mockAlbums);
      }
    } catch {
      setAlbums(mockAlbums);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAlbums(); }, []);

  // Scrollbar dragging logic for gallery
  const updateGalleryScrollbar = useCallback((clientX: number) => {
    if (!galleryScrollbarRef.current || !currentAlbum || currentAlbum.photos.length <= 1) return;
    const rect = galleryScrollbarRef.current.getBoundingClientRect();
    if (rect.width === 0) return;
    const ratio = (clientX - rect.left) / rect.width;
    const clamped = Math.min(Math.max(ratio, 0), 1);
    const nextIndex = Math.round(clamped * (currentAlbum.photos.length - 1));
    setActivePhotoIndex(nextIndex);
  }, [currentAlbum]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!isGalleryScrollbarDragging.current) return;
      event.preventDefault();
      updateGalleryScrollbar(event.clientX);
    };

    const handlePointerUp = () => {
      if (isGalleryScrollbarDragging.current) {
        isGalleryScrollbarDragging.current = false;
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [updateGalleryScrollbar]);

  const handleGalleryScrollbarPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!currentAlbum || currentAlbum.photos.length <= 1) return;
    event.preventDefault();
    isGalleryScrollbarDragging.current = true;
    updateGalleryScrollbar(event.clientX);
  };

  // Ambient image
  const ambientImage = useMemo(() => {
    if (currentAlbum?.photos[activePhotoIndex]) {
      return currentAlbum.photos[activePhotoIndex].src;
    }
    return currentAlbum?.thumbnail || '';
  }, [currentAlbum, activePhotoIndex]);

  // Album selection toggle
  const toggleAlbumSelection = (albumId: string) => {
    setSelectedAlbums(prev => {
      const newSet = new Set(prev);
      if (newSet.has(albumId)) newSet.delete(albumId);
      else newSet.add(albumId);
      return newSet;
    });
  };

  // Download handlers
  const handleDownloadAll = async () => {
    setIsDownloading(true);
    try {
      await downloadMultipleAlbums(albums);
    } finally {
      setIsDownloading(false);
    }
  };

  const downloadButtonLabel = useMemo(() => {
    if (selectedCount === 0) return 'Zaznacz album do pobrania';
    if (selectedCount === 1) return 'Pobierz album';
    return 'Pobierz albumy';
  }, [selectedCount]);

  const handlePrimaryDownload = async () => {
    if (selectedCount === 0) return;
    setIsDownloading(true);
    try {
      if (selectedCount === 1) {
        const targetId = Array.from(selectedAlbums)[0];
        const selectedAlbum = albums.find(album => album.id === targetId);
        if (selectedAlbum) {
          await downloadAlbum(selectedAlbum);
        }
      } else {
        const albumsToDownload = albums.filter(album => selectedAlbums.has(album.id));
        await downloadMultipleAlbums(albumsToDownload);
      }
    } finally {
      setIsDownloading(false);
    }
  };

  // Open cinema mode
  const openCinemaMode = (photoIndex: number) => {
    setCinemaMode({ albumIndex: activeAlbumIndex, photoIndex });
  };

  // Logout handler
  const handleLogout = () => {
    sessionStorage.removeItem('gallery_role');
    setUserRole(null);
    setPasswordInput('');
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (typeof document === 'undefined') return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  // Password screen
  if (!userRole) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/5 backdrop-blur-xl rounded-2xl p-8 w-full max-w-sm border border-white/10"
        >
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-white/10 rounded-full">
              <Lock className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white text-center mb-2">Galeria</h1>
          <p className="text-white/50 text-center text-sm mb-6">Wprowadź hasło aby kontynuować</p>
          
          {/* Password input with eye toggle */}
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={passwordInput}
              onChange={(e) => {
                setPasswordInput(e.target.value);
                setPasswordError(false);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="Hasło"
              className={`w-full px-4 py-3 pr-12 bg-white/10 border rounded-lg text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 ${
                passwordError ? 'border-red-500' : 'border-white/20'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/50 hover:text-white/80 transition-colors"
              title={showPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
            >
              {showPassword ? (
                <EyeOff className="w-5 h-5" />
              ) : (
                <Eye className="w-5 h-5" />
              )}
            </button>
          </div>
          
          {passwordError && (
            <p className="text-red-400 text-sm mt-2">Nieprawidłowe hasło</p>
          )}
          <button
            onClick={handleLogin}
            className="w-full mt-4 py-3 bg-white text-black font-medium rounded-lg hover:bg-white/90 transition-colors"
          >
            Wejdź
          </button>
        </motion.div>
      </div>
    );
  }

  // Close sidebar on mobile when album selected
  const handleAlbumSelect = (index: number) => {
    setActiveAlbumIndex(index);
    setActivePhotoIndex(0);
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <RefreshCw className="w-10 h-10 text-white/50 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Ambient Background - Desktop only */}
      {!isMobile && (
        <AnimatePresence mode="wait">
          <AmbientBackground key={ambientImage} imageSrc={ambientImage} />
        </AnimatePresence>
      )}

      {/* MOBILE VERSION - Completely different layout */}
      {isMobile ? (
        <>
          <RotateHint />
          {/* Mobile ambient - simpler */}
          <div className="fixed inset-0 z-0">
            {currentAlbum?.photos[activePhotoIndex] && (
              <img
                src={currentAlbum.photos[activePhotoIndex].src}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                style={{
                  filter: 'blur(60px) saturate(1.2) brightness(0.3)',
                  transform: 'scale(1.2)',
                }}
              />
            )}
            <div className="absolute inset-0 bg-black/60" />
          </div>
          
          <MobileGallery
            albums={albums}
            activeAlbumIndex={activeAlbumIndex}
            activePhotoIndex={activePhotoIndex}
            onAlbumChange={(index) => {
              setActiveAlbumIndex(index);
              setActivePhotoIndex(0);
            }}
            onPhotoChange={setActivePhotoIndex}
            onPhotoClick={openCinemaMode}
          />
        </>
      ) : (
        /* DESKTOP VERSION */
        <>
          {/* Mobile menu button - hidden on mobile now */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="fixed top-4 left-4 z-50 p-2 bg-black/50 backdrop-blur-sm rounded-lg hidden"
            aria-label="Przełącz panel albumów"
          >
            <Menu className="w-6 h-6 text-white" />
          </button>

          {/* Left Panel - Album Thumbnails - Desktop only */}
          <motion.aside
            className="fixed left-0 top-0 bottom-0 w-52 z-40 flex flex-col"
            style={{
              background: 'rgba(0, 0, 0, 0.7)',
              backdropFilter: 'blur(20px)',
              borderRight: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            {/* Album List */}
            <div className="flex-1 overflow-y-auto p-4 pt-4 space-y-3">
              {albums.map((album, index) => (
                <motion.div
                  key={album.id}
                  className={`relative rounded-xl overflow-hidden cursor-pointer transition-all ${
                    index === activeAlbumIndex 
                      ? 'ring-2 ring-white shadow-lg' 
                      : 'opacity-70 hover:opacity-100'
                  }`}
                  onClick={() => handleAlbumSelect(index)}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {/* Thumbnail */}
                  <div className="aspect-[4/3] bg-gray-800">
                    {album.thumbnail ? (
                      <img
                        src={album.thumbnail}
                        alt={album.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Image className="w-8 h-8 text-white/30" />
                      </div>
                    )}
                  </div>

                  {/* Album info overlay */}
                  <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                    <p className="text-white text-xs font-medium">{album.photos.length} zdjęć</p>
                  </div>

                  {/* Selection checkbox - only for owners */}
                  {canDownload && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleAlbumSelection(album.id);
                      }}
                      className="absolute top-2 right-2 p-1 bg-black/50 rounded-md hover:bg-black/70 transition-colors"
                      title="Zaznacz album"
                    >
                      {selectedAlbums.has(album.id) ? (
                        <CheckSquare className="w-5 h-5 text-green-400" />
                      ) : (
                        <Square className="w-5 h-5 text-white/60" />
                      )}
                    </button>
                  )}
                </motion.div>
              ))}
            </div>

            {/* Download Section - only for owners */}
            {canDownload && (
              <div className="p-4 border-t border-white/10 space-y-2">
                <button
                  onClick={handlePrimaryDownload}
                  disabled={isDownloading || selectedCount === 0}
                  className="w-full py-2.5 px-4 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  {downloadButtonLabel}
                </button>

                <button
                  onClick={handleDownloadAll}
                  disabled={isDownloading || albums.length === 0}
                  className="w-full py-2.5 px-4 bg-white/5 hover:bg-white/10 rounded-lg text-white/70 text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  Pobierz całość
                </button>
              </div>
            )}
          </motion.aside>

      {/* Fullscreen button - desktop only */}
      <button
        onClick={toggleFullscreen}
        className="fixed top-4 right-4 z-50 p-2 bg-black/50 backdrop-blur-sm rounded-lg flex items-center gap-2 text-white/70 hover:text-white hover:bg-black/70 transition-colors"
        title="Tryb pełnoekranowy"
      >
        <Maximize className="w-5 h-5" />
        <span className="text-sm">Pełny ekran</span>
      </button>

      {/* Main Content - Desktop 3D Slider */}
      <main className="ml-52 h-screen relative z-10 flex items-center justify-center overflow-hidden">
        {currentAlbum && (
          <div className="w-full max-w-4xl flex flex-col items-center justify-center h-full">
            <div className="w-full" style={{ height: '55vh' }}>
              <Slider3D
                photos={currentAlbum.photos}
                activeIndex={activePhotoIndex}
                onActiveChange={setActivePhotoIndex}
                onPhotoClick={openCinemaMode}
              />
            </div>
          </div>
        )}
      </main>

      {/* Fixed navigation buttons - outside slider */}
      {currentAlbum && currentAlbum.photos.length > 1 && (
        <>
          <button
            onClick={() => setActivePhotoIndex((activePhotoIndex - 1 + currentAlbum.photos.length) % currentAlbum.photos.length)}
            className="fixed left-56 top-1/2 -translate-y-1/2 z-50 p-3 md:p-4 bg-white/10 hover:bg-white/20 rounded-full transition-colors backdrop-blur-sm"
            title="Poprzednie"
          >
            <ChevronLeft className="w-5 h-5 md:w-6 md:h-6 text-white" />
          </button>
          <button
            onClick={() => setActivePhotoIndex((activePhotoIndex + 1) % currentAlbum.photos.length)}
            className="fixed right-6 top-1/2 -translate-y-1/2 z-50 p-3 md:p-4 bg-white/10 hover:bg-white/20 rounded-full transition-colors backdrop-blur-sm"
            title="Następne"
          >
            <ChevronRight className="w-5 h-5 md:w-6 md:h-6 text-white" />
          </button>
        </>
      )}

      {/* Fixed bottom scrollbar - desktop only */}
      {currentAlbum && currentAlbum.photos.length > 1 && (
        <div className="fixed bottom-6 left-52 right-4 z-40 px-8 md:px-16">
          <div 
            ref={galleryScrollbarRef}
            className="relative h-1.5 bg-white/15 rounded-full cursor-pointer mx-auto max-w-2xl"
            onPointerDown={handleGalleryScrollbarPointerDown}
          >
            {/* Progress fill */}
            <motion.div 
              className="absolute left-0 top-0 bottom-0 bg-white/30 rounded-full pointer-events-none"
              animate={{ width: `${(activePhotoIndex / Math.max(currentAlbum.photos.length - 1, 1)) * 100}%` }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
            
            {/* Świetlisty punkt - środek zawsze na linii */}
            <motion.div
              className="absolute w-4 h-4 bg-white rounded-full shadow-[0_0_10px_3px_rgba(255,255,255,0.5)] cursor-grab active:cursor-grabbing"
              style={{ top: '50%', marginTop: '-8px' }}
              animate={{ left: `calc(${(activePhotoIndex / Math.max(currentAlbum.photos.length - 1, 1)) * 100}% - 8px)` }}
              whileHover={{ scale: 1.2, boxShadow: '0 0 15px 5px rgba(255,255,255,0.7)' }}
              whileTap={{ scale: 1.1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              onPointerDown={(e) => {
                e.stopPropagation();
                handleGalleryScrollbarPointerDown(e);
              }}
            />
          </div>
          
          {/* Counter */}
          <div className="text-center mt-2">
            <span className="text-white/40 text-xs">
              {activePhotoIndex + 1} / {currentAlbum.photos.length}
            </span>
          </div>
        </div>
      )}
        </>
      )}

      {/* Cinema Mode - Conditional Mobile/Desktop */}
      <AnimatePresence>
        {cinemaMode && (
          isMobile ? (
            <MobileCinemaMode
              albums={albums}
              initialAlbumIndex={cinemaMode.albumIndex}
              initialPhotoIndex={cinemaMode.photoIndex}
              onClose={() => setCinemaMode(null)}
            />
          ) : (
            <CinemaMode
              albums={albums}
              initialAlbumIndex={cinemaMode.albumIndex}
              initialPhotoIndex={cinemaMode.photoIndex}
              onClose={() => setCinemaMode(null)}
            />
          )
        )}
      </AnimatePresence>

      {/* Logout button - prawy dolny róg, minimalistyczny */}
      <motion.button
        onClick={handleLogout}
        className="fixed bottom-4 right-4 z-50 px-3 py-2 bg-black/40 hover:bg-black/60 backdrop-blur-sm rounded-lg text-white/60 hover:text-white text-xs flex items-center gap-2 transition-colors"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        title="Wyloguj"
      >
        <LogOut className="w-4 h-4" />
        <span className="hidden md:inline">Wyjdź</span>
      </motion.button>
    </div>
  );
};

// ============================================
// ADMIN PAGE
// ============================================
const AdminPage: React.FC = () => {
  const [showUploadZone, setShowUploadZone] = useState(false);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);

  const fetchAlbums = useCallback(async () => {
    setIsLoading(true);
    try {
      const backendAvailable = await checkHealth();
      setIsOnline(backendAvailable);
      if (backendAvailable) {
        const data = await getAlbums();
        const transformed = data.map(album => ({
          ...album,
          thumbnail: getThumbnailUrl(album.thumbnail),
          photos: album.photos.map(photo => ({
            ...photo,
            src: getImageUrl(photo.src),
            thumbnail: photo.thumbnail ? getThumbnailUrl(photo.thumbnail) : undefined,
          })),
        }));
        setAlbums(transformed);
      } else {
        setAlbums(mockAlbums);
      }
    } catch {
      setAlbums(mockAlbums);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAlbums(); }, []);

  const handleDeleteAlbum = async (albumId: string) => {
    if (!confirm('Czy na pewno chcesz usunąć ten album?')) return;
    try {
      await deleteAlbum(albumId);
      fetchAlbums();
    } catch {
      alert('Nie udało się usunąć albumu');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
      {/* Header */}
      <header className="p-4 md:p-6 flex items-center justify-between border-b border-white/10">
        <div className="flex items-center gap-3">
          <Settings className="w-5 h-5 md:w-6 md:h-6 text-white" />
          <div>
            <h1 className="text-lg md:text-xl font-bold text-white">Panel Administratora</h1>

            <p className="text-xs text-white/50 flex items-center gap-1">
              {isOnline ? (
                <><Wifi className="w-3 h-3 text-green-400" /> Online</>
              ) : (
                <><WifiOff className="w-3 h-3 text-red-400" /> Offline</>
              )}
            </p>
          </div>
        </div>

        <div className="flex gap-2 md:gap-3">
          <button
            onClick={fetchAlbums}
            className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
            aria-label="Odśwież listę albumów"
          >
            <RefreshCw className="w-4 h-4 md:w-5 md:h-5 text-white" />
          </button>
          <button
            onClick={() => setShowUploadZone(true)}
            disabled={!isOnline}
            className="px-3 md:px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white flex items-center gap-2 transition-colors disabled:opacity-50 text-sm"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Nowy Upload</span>
          </button>
          <a
            href="/"
            className="px-3 md:px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white flex items-center gap-2 transition-colors text-sm"
          >
            <Camera className="w-4 h-4" />
            <span className="hidden sm:inline">Galeria</span>
          </a>
        </div>
      </header>

      {/* Albums Grid */}
      <main className="p-4 md:p-6">
        <h2 className="text-lg font-semibold text-white mb-4">
          Albumy ({albums.length})
        </h2>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <RefreshCw className="w-8 h-8 text-white/50 animate-spin" />
          </div>
        ) : albums.length === 0 ? (
          <div className="text-center py-12 text-white/50">
            <Camera className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p>Brak albumów</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
            {albums.map((album) => (
              <div
                key={album.id}
                className="relative group bg-white/5 rounded-xl overflow-hidden"
              >
                {isOnline && (
                  <button
                    onClick={() => handleDeleteAlbum(album.id)}
                    className="absolute top-2 right-2 z-10 p-1.5 bg-red-500/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Usuń album"
                  >
                    <X className="w-3 h-3 md:w-4 md:h-4 text-white" />
                  </button>
                )}
                <div className="aspect-square">
                  {album.thumbnail ? (
                    <img
                      src={album.thumbnail}
                      alt={album.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-800">
                      <Image className="w-8 h-8 text-white/30" />
                    </div>
                  )}
                </div>
                <div className="p-2 md:p-3">
                  <p className="text-white text-xs md:text-sm font-medium truncate">{album.name}</p>
                  <p className="text-white/50 text-xs">{album.photos.length} zdjęć</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Upload Zone Modal */}
      <AnimatePresence>
        {showUploadZone && (
          <UploadZone
            onClose={() => setShowUploadZone(false)}
            onUpload={() => {
              setShowUploadZone(false);
              fetchAlbums();
            }}
            useBackend={isOnline}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// ============================================
// MAIN APP
// ============================================
const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<GalleryPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
