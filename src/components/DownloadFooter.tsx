import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Loader2, CheckCircle } from 'lucide-react';
import { downloadAlbum } from '@/utils/downloader';
import type { Album } from '@/types';

interface DownloadFooterProps {
  album: Album | null;
}

const DownloadFooter: React.FC<DownloadFooterProps> = ({ album }) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadComplete, setDownloadComplete] = useState(false);

  const handleDownload = async () => {
    if (!album || isDownloading) return;

    setIsDownloading(true);
    setDownloadComplete(false);

    try {
      await downloadAlbum(album);
      setDownloadComplete(true);
      setTimeout(() => setDownloadComplete(false), 3000);
    } catch (error) {
      console.error('Download error:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  if (!album) return null;

  return (
    <motion.footer
      className="fixed bottom-0 left-0 right-0 z-40"
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', damping: 25 }}
    >
      {/* Gradient backdrop */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none" />

      {/* Content */}
      <div className="relative max-w-4xl mx-auto px-4 py-6 md:py-8">
        {/* Album info */}
        <div className="text-center mb-4">
          <p className="text-white/60 text-sm">
            Album: <span className="text-white font-medium">{album.name}</span>
          </p>
          <p className="text-white/40 text-xs">
            {album.photos.length} {album.photos.length === 1 ? 'zdjęcie' : album.photos.length < 5 ? 'zdjęcia' : 'zdjęć'}
          </p>
        </div>

        {/* Download Button */}
        <motion.button
          onClick={handleDownload}
          disabled={isDownloading}
          className="w-full max-w-md mx-auto block glass-button-primary relative overflow-hidden"
          whileHover={{ scale: isDownloading ? 1 : 1.02 }}
          whileTap={{ scale: isDownloading ? 1 : 0.98 }}
        >
          {/* Button content */}
          <span className="relative flex items-center justify-center gap-3">
            {isDownloading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Pobieranie...
              </>
            ) : downloadComplete ? (
              <>
                <CheckCircle className="w-5 h-5 text-green-400" />
                Pobrano!
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                Pobierz cały album
              </>
            )}
          </span>

          {/* Shimmer effect when not downloading */}
          {!isDownloading && !downloadComplete && (
            <motion.div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent)',
              }}
              animate={{
                x: ['-100%', '100%'],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                repeatDelay: 1,
              }}
            />
          )}
        </motion.button>

        {/* Additional info */}
        <p className="text-center text-white/30 text-xs mt-4">
          Wszystkie zdjęcia zostaną pobrane jako plik ZIP
        </p>
      </div>
    </motion.footer>
  );
};

export default DownloadFooter;
