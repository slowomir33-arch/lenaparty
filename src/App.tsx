import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { 
  Settings, Upload, Camera, RefreshCw, Wifi, WifiOff, 
  Download, CheckSquare, Square, ChevronLeft, ChevronRight, X,
  Image, Menu, Maximize, Lock, Eye, EyeOff
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

  const currentAlbum = albums[albumIndex];
  const currentPhoto = currentAlbum?.photos[photoIndex];
  const totalPhotosInAlbum = currentAlbum?.photos.length || 0;

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

  // Scrollbar click handler
  const handleScrollbarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrollbarRef.current) return;
    const rect = scrollbarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newIndex = Math.round(percentage * (allPhotos.length - 1));
    goToFlatIndex(Math.max(0, Math.min(newIndex, allPhotos.length - 1)));
  };

  if (!currentPhoto) return null;

  // Progress percentage for scrollbar
  const progressPercentage = allPhotos.length > 1 
    ? (currentFlatIndex / (allPhotos.length - 1)) * 100 
    : 0;

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex flex-col select-none overflow-hidden"
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

      {/* Top bar with controls */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4">
        {/* Album indicator */}
        <div className="text-white/60 text-sm bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-lg">
          <span className="text-white">{currentAlbum?.name}</span>
          <span className="mx-2">•</span>
          <span>{photoIndex + 1} / {totalPhotosInAlbum}</span>
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

      {/* Navigation arrows - always visible, same height */}
      <div className="absolute left-0 top-0 bottom-0 w-20 md:w-32 z-10 flex items-center justify-start pl-2 md:pl-4">
        {currentFlatIndex > 0 && (
          <motion.button
            className="p-4 md:p-5 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
            onClick={goPrev}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <ChevronLeft className="w-6 h-6 md:w-8 md:h-8 text-white" />
          </motion.button>
        )}
      </div>

      <div className="absolute right-0 top-0 bottom-0 w-20 md:w-32 z-10 flex items-center justify-end pr-2 md:pr-4">
        {currentFlatIndex < allPhotos.length - 1 && (
          <motion.button
            className="p-4 md:p-5 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
            onClick={goNext}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <ChevronRight className="w-6 h-6 md:w-8 md:h-8 text-white" />
          </motion.button>
        )}
      </div>

      {/* Photo container - centered with proper sizing */}
      <div 
        className="flex-1 relative z-[5] flex items-center justify-center cursor-grab active:cursor-grabbing p-4 md:p-8"
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
          className={`max-w-full max-h-[75vh] w-auto h-auto object-contain rounded-lg shadow-2xl pointer-events-none transition-opacity duration-300 ${
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

      {/* Bottom scrollbar/slider */}
      <div className="relative z-20 px-4 md:px-8 pb-4 md:pb-6">
        <div 
          ref={scrollbarRef}
          className="relative h-2 bg-white/10 rounded-full cursor-pointer overflow-hidden backdrop-blur-sm"
          onClick={handleScrollbarClick}
        >
          {/* Progress fill */}
          <motion.div 
            className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-white/40 to-white/60 rounded-full"
            style={{ width: `${progressPercentage}%` }}
            layoutId="cinema-progress"
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          />
          
          {/* Draggable thumb */}
          <motion.div
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg cursor-grab active:cursor-grabbing"
            style={{ left: `calc(${progressPercentage}% - 8px)` }}
            whileHover={{ scale: 1.3 }}
            whileTap={{ scale: 1.1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          />
        </div>
        
        {/* Photo counter below scrollbar */}
        <div className="flex justify-between items-center mt-2 text-xs text-white/40">
          <span>{currentFlatIndex + 1} / {allPhotos.length}</span>
          <span className="hidden md:inline">Kliknij tło aby zamknąć • Strzałki ← → nawigacja</span>
          <span className="md:hidden">Przesuń lub dotknij tło</span>
        </div>
      </div>
    </motion.div>
  );
};

// ============================================
// 3D SLIDER COMPONENT
// ============================================
interface SliderProps {
  photos: Photo[];
  onPhotoClick: (index: number) => void;
  activeIndex: number;
  onActiveChange: (index: number) => void;
}

const Slider3D: React.FC<SliderProps> = ({ photos, onPhotoClick, activeIndex, onActiveChange }) => {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const scrollbarRef = useRef<HTMLDivElement>(null);

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

  // Scrollbar click handler
  const handleScrollbarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrollbarRef.current || photos.length <= 1) return;
    const rect = scrollbarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newIndex = Math.round(percentage * (photos.length - 1));
    onActiveChange(Math.max(0, Math.min(newIndex, photos.length - 1)));
  };

  const getCardStyle = (index: number): React.CSSProperties => {
    const diff = (index - activeIndex + photos.length) % photos.length;
    const adjustedDiff = diff > photos.length / 2 ? diff - photos.length : diff;

    if (adjustedDiff === 0) {
      return {
        transform: 'translateX(0%) translateZ(100px) scale(1.75)',
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
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Slider container */}
      <div
        className="relative w-full h-[50vh] md:h-[70vh] flex items-center justify-center select-none"
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
            className="absolute w-full max-w-[85%] md:max-w-2xl px-2 md:px-4 transition-all duration-500 ease-out cursor-pointer"
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

      {/* Navigation buttons - fixed height containers for alignment */}
      {photos.length > 1 && (
        <>
          <div className="absolute left-0 top-0 bottom-0 w-16 md:w-24 z-40 flex items-center justify-start pl-1 md:pl-2">
            <button
              onClick={handlePrev}
              className="p-3 md:p-4 bg-white/10 hover:bg-white/20 rounded-full transition-colors backdrop-blur-sm"
              title="Poprzednie"
            >
              <ChevronLeft className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </button>
          </div>
          <div className="absolute right-0 top-0 bottom-0 w-16 md:w-24 z-40 flex items-center justify-end pr-1 md:pr-2">
            <button
              onClick={handleNext}
              className="p-3 md:p-4 bg-white/10 hover:bg-white/20 rounded-full transition-colors backdrop-blur-sm"
              title="Następne"
            >
              <ChevronRight className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </button>
          </div>
        </>
      )}

      {/* Bottom scrollbar/slider */}
      {photos.length > 1 && (
        <div className="absolute bottom-2 md:bottom-4 left-1/2 -translate-x-1/2 w-[60%] md:w-[50%] max-w-md z-40">
          <div 
            ref={scrollbarRef}
            className="relative h-1.5 md:h-2 bg-white/10 rounded-full cursor-pointer overflow-hidden backdrop-blur-sm"
            onClick={handleScrollbarClick}
          >
            {/* Progress fill */}
            <motion.div 
              className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-white/30 to-white/50 rounded-full"
              style={{ width: `${(activeIndex / (photos.length - 1)) * 100}%` }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
            
            {/* Draggable thumb */}
            <motion.div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 md:w-4 md:h-4 bg-white rounded-full shadow-lg cursor-grab active:cursor-grabbing"
              style={{ left: `calc(${(activeIndex / (photos.length - 1)) * 100}% - 6px)` }}
              whileHover={{ scale: 1.3 }}
              whileTap={{ scale: 1.1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            />
          </div>
          
          {/* Counter below scrollbar */}
          <div className="text-center mt-1">
            <span className="text-white/40 text-xs">
              {activeIndex + 1} / {photos.length}
            </span>
          </div>
        </div>
      )}
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

  const currentAlbum = albums[activeAlbumIndex];
  const canDownload = userRole === 'owner';

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
  const handleDownloadAlbum = async (album: Album) => {
    setIsDownloading(true);
    try {
      await downloadAlbum(album);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadSelected = async () => {
    if (selectedAlbums.size === 0) return;
    setIsDownloading(true);
    try {
      const albumsToDownload = albums.filter(a => selectedAlbums.has(a.id));
      await downloadMultipleAlbums(albumsToDownload);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadAll = async () => {
    setIsDownloading(true);
    try {
      await downloadMultipleAlbums(albums);
    } finally {
      setIsDownloading(false);
    }
  };

  // Open cinema mode
  const openCinemaMode = (photoIndex: number) => {
    setCinemaMode({ albumIndex: activeAlbumIndex, photoIndex });
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
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
      {/* Ambient Background */}
      <AnimatePresence mode="wait">
        <AmbientBackground key={ambientImage} imageSrc={ambientImage} />
      </AnimatePresence>

      {/* Mobile menu button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed top-4 left-4 z-50 p-2 bg-black/50 backdrop-blur-sm rounded-lg md:hidden"
      >
        <Menu className="w-6 h-6 text-white" />
      </button>

      {/* Left Panel - Album Thumbnails */}
      <motion.aside
        className={`fixed left-0 top-0 bottom-0 w-52 z-40 flex flex-col transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
        style={{
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(20px)',
          borderRight: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        {/* Album List */}
        <div className="flex-1 overflow-y-auto p-4 pt-16 md:pt-4 space-y-3">
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
                <p className="text-white text-sm font-medium truncate">{album.name}</p>
                <p className="text-white/60 text-xs">{album.photos.length} zdjęć</p>
              </div>

              {/* Selection checkbox */}
              {/* Selection checkbox - only for owners */}
              {canDownload && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleAlbumSelection(album.id);
                  }}
                  className="absolute top-2 right-2 p-1 bg-black/50 rounded-md hover:bg-black/70 transition-colors"
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
            {currentAlbum && (
              <button
                onClick={() => handleDownloadAlbum(currentAlbum)}
                disabled={isDownloading}
                className="w-full py-2.5 px-4 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                Pobierz album
              </button>
            )}

            {selectedAlbums.size > 0 && (
              <button
                onClick={handleDownloadSelected}
                disabled={isDownloading}
                className="w-full py-2.5 px-4 bg-green-600/80 hover:bg-green-600 rounded-lg text-white text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                Pobierz zaznaczone ({selectedAlbums.size})
              </button>
            )}

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

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Fullscreen button - desktop only */}
      <button
        onClick={toggleFullscreen}
        className="fixed top-4 right-4 z-50 p-2 bg-black/50 backdrop-blur-sm rounded-lg hidden md:flex items-center gap-2 text-white/70 hover:text-white hover:bg-black/70 transition-colors"
        title="Tryb pełnoekranowy"
      >
        <Maximize className="w-5 h-5" />
        <span className="text-sm">Pełny ekran</span>
      </button>

      {/* Main Content - 3D Slider */}
      <main className="md:ml-52 min-h-screen relative z-10 flex items-center justify-center p-4">
        {currentAlbum && (
          <Slider3D
            photos={currentAlbum.photos}
            activeIndex={activePhotoIndex}
            onActiveChange={setActivePhotoIndex}
            onPhotoClick={openCinemaMode}
          />
        )}
      </main>

      {/* Cinema Mode */}
      <AnimatePresence>
        {cinemaMode && (
          <CinemaMode
            albums={albums}
            initialAlbumIndex={cinemaMode.albumIndex}
            initialPhotoIndex={cinemaMode.photoIndex}
            onClose={() => setCinemaMode(null)}
          />
        )}
      </AnimatePresence>
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
