import React, { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, FolderOpen } from 'lucide-react';
import type { Album } from '@/types';

interface AlbumHeaderProps {
  albums: Album[];
  activeAlbumId: string;
  onAlbumSelect: (albumId: string) => void;
}

const AlbumHeader: React.FC<AlbumHeaderProps> = ({
  albums,
  activeAlbumId,
  onAlbumSelect,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Check scroll position
  const checkScrollPosition = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  useEffect(() => {
    checkScrollPosition();
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', checkScrollPosition);
      window.addEventListener('resize', checkScrollPosition);
      return () => {
        container.removeEventListener('scroll', checkScrollPosition);
        window.removeEventListener('resize', checkScrollPosition);
      };
    }
  }, [albums]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = 250;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  if (albums.length === 0) {
    return (
      <div className="glass-subtle px-6 py-8 text-center">
        <FolderOpen className="w-12 h-12 mx-auto mb-3 text-white/40" />
        <p className="text-white/60">Brak albumów do wyświetlenia</p>
      </div>
    );
  }

  return (
    <div className="relative w-full">
      {/* Header Title */}
      <div className="px-4 md:px-8 mb-4">
        <h2 className="text-lg md:text-xl font-semibold text-white/80">
          Wybierz album
        </h2>
        <p className="text-sm text-white/50">
          {albums.length} {albums.length === 1 ? 'album' : albums.length < 5 ? 'albumy' : 'albumów'}
        </p>
      </div>

      {/* Scroll Container */}
      <div className="relative group">
        {/* Left Scroll Button */}
        {canScrollLeft && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute left-0 top-0 bottom-0 z-20 w-16 flex items-center justify-start pl-2
                       bg-gradient-to-r from-black/60 to-transparent"
            onClick={() => scroll('left')}
          >
            <motion.div
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              className="p-2 glass rounded-full"
            >
              <ChevronLeft className="w-5 h-5 text-white" />
            </motion.div>
          </motion.button>
        )}

        {/* Right Scroll Button */}
        {canScrollRight && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute right-0 top-0 bottom-0 z-20 w-16 flex items-center justify-end pr-2
                       bg-gradient-to-l from-black/60 to-transparent"
            onClick={() => scroll('right')}
          >
            <motion.div
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              className="p-2 glass rounded-full"
            >
              <ChevronRight className="w-5 h-5 text-white" />
            </motion.div>
          </motion.button>
        )}

        {/* Albums Scroll Area */}
        <div
          ref={scrollContainerRef}
          className="flex gap-4 overflow-x-auto px-4 md:px-8 pb-4 album-scroll scrollbar-hide"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {albums.map((album, index) => (
            <motion.button
              key={album.id}
              onClick={() => onAlbumSelect(album.id)}
              className={`album-capsule flex-shrink-0 ${
                activeAlbumId === album.id ? 'active' : ''
              }`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-center gap-3">
                {/* Album Thumbnail */}
                <div className="relative w-14 h-14 md:w-16 md:h-16 rounded-xl overflow-hidden">
                  <img
                    src={album.thumbnail}
                    alt={album.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {/* Active Indicator Glow */}
                  {activeAlbumId === album.id && (
                    <motion.div
                      className="absolute inset-0 border-2 border-white/50 rounded-xl"
                      layoutId="activeAlbum"
                      transition={{ type: 'spring', damping: 25 }}
                    />
                  )}
                </div>

                {/* Album Info */}
                <div className="text-left pr-2">
                  <h3 className={`font-medium text-sm md:text-base whitespace-nowrap ${
                    activeAlbumId === album.id ? 'text-white' : 'text-white/80'
                  }`}>
                    {album.name}
                  </h3>
                  <p className="text-xs text-white/50">
                    {album.photos.length} {album.photos.length === 1 ? 'zdjęcie' : 
                      album.photos.length < 5 ? 'zdjęcia' : 'zdjęć'}
                  </p>
                </div>
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Bottom Gradient Fade */}
      <div className="h-4 bg-gradient-to-b from-transparent to-black/20" />
    </div>
  );
};

export default AlbumHeader;
