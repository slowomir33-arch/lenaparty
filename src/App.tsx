import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Settings, Upload, Camera, Sparkles, RefreshCw, AlertCircle, Wifi, WifiOff } from 'lucide-react';

// Components
import ThreeDSlider from '@/components/ThreeDSlider';
import AlbumHeader from '@/components/AlbumHeader';
import DownloadFooter from '@/components/DownloadFooter';
import AmbientBackground from '@/components/AmbientBackground';
import UploadZone from '@/components/UploadZone';

// API & Data
import { getAlbums, checkHealth, getImageUrl, getThumbnailUrl, deleteAlbum } from '@/api/albums';
import { mockAlbums } from '@/data/mockData';
import type { Album } from '@/types';

// ============================================
// GALLERY PAGE - Main Client View
// ============================================
const GalleryPage: React.FC = () => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [activeAlbumId, setActiveAlbumId] = useState<string>('');
  const [activePhotoIndex, setActivePhotoIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch albums from backend
  const fetchAlbums = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Check if backend is available
      const backendAvailable = await checkHealth();
      setIsOnline(backendAvailable);
      
      if (backendAvailable) {
        const data = await getAlbums();
        // Transform URLs to full paths
        const transformedAlbums = data.map(album => ({
          ...album,
          thumbnail: getThumbnailUrl(album.thumbnail),
          photos: album.photos.map(photo => ({
            ...photo,
            src: getImageUrl(photo.src),
            thumbnail: photo.thumbnail ? getThumbnailUrl(photo.thumbnail) : undefined,
          })),
        }));
        setAlbums(transformedAlbums);
        
        if (transformedAlbums.length > 0 && !activeAlbumId) {
          setActiveAlbumId(transformedAlbums[0].id);
        }
      } else {
        // Fallback to mock data
        console.log('Backend unavailable, using mock data');
        setAlbums(mockAlbums);
        if (mockAlbums.length > 0 && !activeAlbumId) {
          setActiveAlbumId(mockAlbums[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching albums:', err);
      setError('Nie udało się załadować albumów');
      // Fallback to mock data
      setAlbums(mockAlbums);
      if (mockAlbums.length > 0) {
        setActiveAlbumId(mockAlbums[0].id);
      }
    } finally {
      setIsLoading(false);
    }
  }, [activeAlbumId]);

  useEffect(() => {
    fetchAlbums();
  }, []);

  // Get current album
  const currentAlbum = useMemo(() => {
    return albums.find(album => album.id === activeAlbumId) || null;
  }, [albums, activeAlbumId]);

  // Get current ambient image (active photo or album thumbnail)
  const ambientImage = useMemo(() => {
    if (currentAlbum && currentAlbum.photos[activePhotoIndex]) {
      return currentAlbum.photos[activePhotoIndex].src;
    }
    return currentAlbum?.thumbnail || '';
  }, [currentAlbum, activePhotoIndex]);

  // Handle album selection
  const handleAlbumSelect = useCallback((albumId: string) => {
    setActiveAlbumId(albumId);
    setActivePhotoIndex(0);
  }, []);

  // Handle active photo change (for ambient background)
  const handleActiveIndexChange = useCallback((index: number) => {
    setActivePhotoIndex(index);
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <motion.div
          className="text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <RefreshCw className="w-12 h-12 text-white/50 mx-auto mb-4 animate-spin" />
          <p className="text-white/60">Ładowanie galerii...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      {/* Ambient Background - changes with active photo */}
      <AnimatePresence mode="wait">
        <AmbientBackground key={ambientImage} imageSrc={ambientImage} />
      </AnimatePresence>

      {/* Header with Logo and Admin Link */}
      <header className="relative z-30 pt-6 pb-4 px-4 md:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Logo */}
          <motion.div 
            className="flex items-center gap-3"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <div className="p-2 glass rounded-xl">
              <Camera className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
                Galeria Online
              </h1>
              <p className="text-xs text-white/50 hidden sm:block">
                {isOnline ? 'Połączono z serwerem' : 'Tryb offline (dane demo)'}
              </p>
            </div>
          </motion.div>

          {/* Actions */}
          <motion.div
            className="flex items-center gap-3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <motion.button
              onClick={fetchAlbums}
              className="p-2 glass rounded-full"
              whileHover={{ scale: 1.1, rotate: 180 }}
              whileTap={{ scale: 0.9 }}
              title="Odśwież"
            >
              <RefreshCw className="w-4 h-4 text-white" />
            </motion.button>
            <Link
              to="/admin"
              className="glass-button px-4 py-2 flex items-center gap-2 text-sm"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Admin</span>
            </Link>
          </motion.div>
        </div>
      </header>

      {/* Error Message */}
      {error && (
        <motion.div
          className="relative z-20 mx-4 md:mx-8 mb-4"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="max-w-7xl mx-auto glass-subtle p-4 flex items-center gap-3 text-yellow-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        </motion.div>
      )}

      {/* Album Selector */}
      <motion.section
        className="relative z-20 mb-6"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <AlbumHeader
          albums={albums}
          activeAlbumId={activeAlbumId}
          onAlbumSelect={handleAlbumSelect}
        />
      </motion.section>

      {/* Main 3D Slider */}
      <motion.main
        className="relative z-10 pb-40"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3 }}
      >
        {currentAlbum && currentAlbum.photos.length > 0 ? (
          <ThreeDSlider
            photos={currentAlbum.photos}
            onActiveIndexChange={handleActiveIndexChange}
            autoPlay={false}
            showNavigation={true}
            showDots={true}
            centerScale={1.08}
            sideScale={0.72}
            sideOpacity={0.5}
            transitionDuration={700}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-96 text-white/60">
            <Camera className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-lg">Brak zdjęć w tym albumie</p>
            <p className="text-sm mt-2">Dodaj zdjęcia w panelu administratora</p>
          </div>
        )}
      </motion.main>

      {/* Download Footer */}
      <DownloadFooter album={currentAlbum} />

      {/* Decorative Elements */}
      <motion.div
        className="fixed top-20 right-10 text-white/5 pointer-events-none"
        animate={{ rotate: 360 }}
        transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
      >
        <Sparkles className="w-32 h-32" />
      </motion.div>
    </div>
  );
};

// ============================================
// ADMIN PAGE - Upload Mode
// ============================================
const AdminPage: React.FC = () => {
  const [showUploadZone, setShowUploadZone] = useState(false);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);

  // Fetch albums
  const fetchAlbums = useCallback(async () => {
    setIsLoading(true);
    try {
      const backendAvailable = await checkHealth();
      setIsOnline(backendAvailable);
      
      if (backendAvailable) {
        const data = await getAlbums();
        const transformedAlbums = data.map(album => ({
          ...album,
          thumbnail: getThumbnailUrl(album.thumbnail),
          photos: album.photos.map(photo => ({
            ...photo,
            src: getImageUrl(photo.src),
            thumbnail: photo.thumbnail ? getThumbnailUrl(photo.thumbnail) : undefined,
          })),
        }));
        setAlbums(transformedAlbums);
      } else {
        setAlbums(mockAlbums);
      }
    } catch (err) {
      console.error('Error:', err);
      setAlbums(mockAlbums);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlbums();
  }, []);

  // Handle album deletion
  const handleDeleteAlbum = async (albumId: string) => {
    if (!confirm('Czy na pewno chcesz usunąć ten album?')) return;
    
    try {
      await deleteAlbum(albumId);
      fetchAlbums();
    } catch (err) {
      console.error('Delete error:', err);
      alert('Nie udało się usunąć albumu');
    }
  };

  return (
    <div className="min-h-screen relative bg-gradient-to-br from-gray-900 via-black to-gray-900">
      {/* Background Pattern */}
      <div 
        className="fixed inset-0 opacity-5"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />

      {/* Header */}
      <header className="relative z-30 pt-6 pb-4 px-4 md:px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <motion.div 
            className="flex items-center gap-3"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <div className="p-2 glass rounded-xl">
              <Settings className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
                Panel Administratora
              </h1>
              <p className="text-xs text-white/50 flex items-center gap-1">
                {isOnline ? (
                  <><Wifi className="w-3 h-3 text-green-400" /><span className="text-green-400">Backend połączony</span></>
                ) : (
                  <><WifiOff className="w-3 h-3 text-red-400" /><span className="text-red-400">Backend niedostępny</span></>
                )}
              </p>
            </div>
          </motion.div>

          <motion.div
            className="flex gap-3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <motion.button
              onClick={fetchAlbums}
              className="p-2 glass rounded-full"
              whileHover={{ scale: 1.1, rotate: 180 }}
              whileTap={{ scale: 0.9 }}
              title="Odśwież"
            >
              <RefreshCw className="w-4 h-4 text-white" />
            </motion.button>
            <button
              onClick={() => setShowUploadZone(true)}
              className="glass-button px-4 py-2 flex items-center gap-2 text-sm"
              disabled={!isOnline}
            >
              <Upload className="w-4 h-4" />
              <span className="hidden sm:inline">Nowy Upload</span>
            </button>
            <Link
              to="/"
              className="glass-button px-4 py-2 flex items-center gap-2 text-sm"
            >
              <Camera className="w-4 h-4" />
              <span className="hidden sm:inline">Galeria</span>
            </Link>
          </motion.div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 py-8">
        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <motion.div
            className="glass p-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <h3 className="text-lg font-semibold text-white mb-2">Upload Folderów</h3>
            <p className="text-white/60 text-sm">
              Przeciągnij całe foldery ze zdjęciami. Każdy folder stanie się osobnym albumem.
            </p>
          </motion.div>

          <motion.div
            className="glass p-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h3 className="text-lg font-semibold text-white mb-2">Automatyczne nazwy</h3>
            <p className="text-white/60 text-sm">
              Nazwa folderu automatycznie staje się nazwą albumu w galerii.
            </p>
          </motion.div>

          <motion.div
            className="glass p-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <h3 className="text-lg font-semibold text-white mb-2">
              Status: {isOnline ? 'Online' : 'Offline'}
            </h3>
            <p className="text-white/60 text-sm">
              {isOnline 
                ? 'Zdjęcia są zapisywane na serwerze.' 
                : 'Uruchom backend: cd backend && npm run dev'}
            </p>
          </motion.div>
        </div>

        {/* Existing Albums */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <h2 className="text-xl font-semibold text-white mb-4">
            Istniejące albumy ({albums.length})
          </h2>
          
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 text-white/50 animate-spin" />
            </div>
          ) : albums.length === 0 ? (
            <div className="glass-subtle p-12 text-center">
              <Camera className="w-16 h-16 mx-auto mb-4 text-white/30" />
              <p className="text-white/60">Brak albumów</p>
              <p className="text-white/40 text-sm mt-2">
                Kliknij "Nowy Upload" aby dodać pierwszy album
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {albums.map((album, index) => (
                <motion.div
                  key={album.id}
                  className="glass-subtle p-3 group cursor-pointer relative"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.05 * index }}
                  whileHover={{ scale: 1.05 }}
                >
                  {/* Delete button */}
                  {isOnline && (
                    <motion.button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteAlbum(album.id);
                      }}
                      className="absolute top-1 right-1 p-1.5 bg-red-500/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <span className="text-white text-xs font-bold">✕</span>
                    </motion.button>
                  )}
                  
                  <div className="aspect-square rounded-lg overflow-hidden mb-3">
                    <img
                      src={album.thumbnail || 'https://via.placeholder.com/400?text=No+Image'}
                      alt={album.name}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    />
                  </div>
                  <h3 className="text-white text-sm font-medium truncate">{album.name}</h3>
                  <p className="text-white/50 text-xs">{album.photos.length} zdjęć</p>
                </motion.div>
              ))}
            </div>
          )}
        </motion.section>
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
// MAIN APP - Router
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
