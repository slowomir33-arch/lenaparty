import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import ftpUploader from './ftp-uploader.js';

const app = express();
const PORT = process.env.PORT || 3001;
const USE_FTP = ftpUploader.isConfigured();

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  uploadsDir: './uploads',
  albumsDir: './uploads/albums',
  thumbnailsDir: './uploads/thumbnails',
  dataFile: './data/albums.json',
  thumbnailSize: 400,
  maxFileSize: 50 * 1024 * 1024, // 50MB
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
};

// Ensure directories exist
[CONFIG.uploadsDir, CONFIG.albumsDir, CONFIG.thumbnailsDir, './data'].forEach(dir => {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
});

// Initialize albums.json if not exists
if (!existsSync(CONFIG.dataFile)) {
  await fs.writeFile(CONFIG.dataFile, JSON.stringify({ albums: [] }, null, 2));
}

// ============================================
// MIDDLEWARE
// ============================================

// Serve .well-known for SSL certificate validation (Let's Encrypt)
app.use('/.well-known', express.static('.well-known'));

// Manual CORS headers to ensure they are always set
app.use((req, res, next) => {
  const origin = req.headers.origin;
  res.header('Access-Control-Allow-Origin', origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json());

// Serve static files (uploaded images)
app.use('/uploads', express.static(CONFIG.uploadsDir));

// ============================================
// MULTER CONFIGURATION (File Upload)
// ============================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Always use temp directory first, files will be moved after processing
    const tempPath = path.join(CONFIG.albumsDir, 'temp');
    
    if (!existsSync(tempPath)) {
      mkdirSync(tempPath, { recursive: true });
    }
    
    cb(null, tempPath);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  if (CONFIG.allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Niedozwolony typ pliku: ${file.mimetype}`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { 
    fileSize: CONFIG.maxFileSize,
    files: 1000, // Maximum number of files
  },
});

// ============================================
// HELPER FUNCTIONS
// ============================================

async function readAlbumsData() {
  try {
    const data = await fs.readFile(CONFIG.dataFile, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return { albums: [] };
  }
}

async function writeAlbumsData(data) {
  await fs.writeFile(CONFIG.dataFile, JSON.stringify(data, null, 2));
}

async function generateThumbnail(imagePath, albumId, filename) {
  const thumbnailDir = path.join(CONFIG.thumbnailsDir, albumId);
  
  if (!existsSync(thumbnailDir)) {
    mkdirSync(thumbnailDir, { recursive: true });
  }
  
  const thumbnailPath = path.join(thumbnailDir, filename.replace(path.extname(filename), '.jpg'));
  
  await sharp(imagePath)
    .resize(CONFIG.thumbnailSize, CONFIG.thumbnailSize, {
      fit: 'cover',
      position: 'center',
    })
    .jpeg({ quality: 80 })
    .toFile(thumbnailPath);
  
  return thumbnailPath;
}

async function getImageDimensions(imagePath) {
  try {
    const metadata = await sharp(imagePath).metadata();
    return { width: metadata.width, height: metadata.height };
  } catch {
    return { width: 0, height: 0 };
  }
}

// ============================================
// API ROUTES
// ============================================

// Health check
app.get('/api/health', async (req, res) => {
  const ftpStatus = USE_FTP ? await ftpUploader.testConnection() : { configured: false };
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    ftp: USE_FTP ? ftpStatus : { configured: false, message: 'FTP not configured, using local storage' }
  });
});

// Test FTP connection
app.get('/api/ftp/test', async (req, res) => {
  if (!USE_FTP) {
    return res.json({ configured: false, message: 'FTP not configured' });
  }
  const result = await ftpUploader.testConnection();
  res.json(result);
});

// ----------------------------------------
// GET /api/albums - Get all albums
// ----------------------------------------
app.get('/api/albums', async (req, res) => {
  try {
    const data = await readAlbumsData();
    res.json(data.albums);
  } catch (error) {
    console.error('Error fetching albums:', error);
    res.status(500).json({ error: 'Błąd podczas pobierania albumów' });
  }
});

// ----------------------------------------
// GET /api/albums/:id - Get single album
// ----------------------------------------
app.get('/api/albums/:id', async (req, res) => {
  try {
    const data = await readAlbumsData();
    const album = data.albums.find(a => a.id === req.params.id);
    
    if (!album) {
      return res.status(404).json({ error: 'Album nie znaleziony' });
    }
    
    res.json(album);
  } catch (error) {
    console.error('Error fetching album:', error);
    res.status(500).json({ error: 'Błąd podczas pobierania albumu' });
  }
});

// ----------------------------------------
// POST /api/albums - Create new album
// ----------------------------------------
app.post('/api/albums', async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Nazwa albumu jest wymagana' });
    }
    
    const data = await readAlbumsData();
    
    const newAlbum = {
      id: uuidv4(),
      name: name.trim(),
      thumbnail: '',
      photos: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    // Create album directory
    const albumPath = path.join(CONFIG.albumsDir, newAlbum.id);
    if (!existsSync(albumPath)) {
      mkdirSync(albumPath, { recursive: true });
    }
    
    data.albums.push(newAlbum);
    await writeAlbumsData(data);
    
    res.status(201).json(newAlbum);
  } catch (error) {
    console.error('Error creating album:', error);
    res.status(500).json({ error: 'Błąd podczas tworzenia albumu' });
  }
});

// ----------------------------------------
// PUT /api/albums/:id - Update album
// ----------------------------------------
app.put('/api/albums/:id', async (req, res) => {
  try {
    const { name } = req.body;
    const data = await readAlbumsData();
    
    const albumIndex = data.albums.findIndex(a => a.id === req.params.id);
    
    if (albumIndex === -1) {
      return res.status(404).json({ error: 'Album nie znaleziony' });
    }
    
    if (name) {
      data.albums[albumIndex].name = name.trim();
    }
    
    data.albums[albumIndex].updatedAt = new Date().toISOString();
    
    await writeAlbumsData(data);
    
    res.json(data.albums[albumIndex]);
  } catch (error) {
    console.error('Error updating album:', error);
    res.status(500).json({ error: 'Błąd podczas aktualizacji albumu' });
  }
});

// ----------------------------------------
// DELETE /api/albums/:id - Delete album
// ----------------------------------------
app.delete('/api/albums/:id', async (req, res) => {
  try {
    const data = await readAlbumsData();
    
    const albumIndex = data.albums.findIndex(a => a.id === req.params.id);
    
    if (albumIndex === -1) {
      return res.status(404).json({ error: 'Album nie znaleziony' });
    }
    
    const album = data.albums[albumIndex];
    
    // Delete album files
    const albumPath = path.join(CONFIG.albumsDir, album.id);
    const thumbnailPath = path.join(CONFIG.thumbnailsDir, album.id);
    
    try {
      await fs.rm(albumPath, { recursive: true, force: true });
      await fs.rm(thumbnailPath, { recursive: true, force: true });
    } catch (err) {
      console.warn('Could not delete album files:', err);
    }
    
    data.albums.splice(albumIndex, 1);
    await writeAlbumsData(data);
    
    res.json({ message: 'Album usunięty', id: req.params.id });
  } catch (error) {
    console.error('Error deleting album:', error);
    res.status(500).json({ error: 'Błąd podczas usuwania albumu' });
  }
});

// ----------------------------------------
// POST /api/albums/:albumId/photos - Upload photos to album
// ----------------------------------------
app.post('/api/albums/:albumId/photos', upload.array('photos', 1000), async (req, res) => {
  try {
    const { albumId } = req.params;
    const data = await readAlbumsData();
    
    const albumIndex = data.albums.findIndex(a => a.id === albumId);
    
    if (albumIndex === -1) {
      return res.status(404).json({ error: 'Album nie znaleziony' });
    }
    
    const uploadedPhotos = [];
    
    for (const file of req.files) {
      const photoId = uuidv4();
      const imagePath = file.path;
      
      // Generate thumbnail
      const thumbnailFilename = `${photoId}.jpg`;
      await generateThumbnail(imagePath, albumId, thumbnailFilename);
      
      // Get dimensions
      const dimensions = await getImageDimensions(imagePath);
      
      const photo = {
        id: photoId,
        src: `/uploads/albums/${albumId}/${file.filename}`,
        thumbnail: `/uploads/thumbnails/${albumId}/${thumbnailFilename}`,
        title: file.originalname.replace(/\.[^/.]+$/, ''),
        width: dimensions.width,
        height: dimensions.height,
        uploadedAt: new Date().toISOString(),
      };
      
      uploadedPhotos.push(photo);
      data.albums[albumIndex].photos.push(photo);
    }
    
    // Set first photo as album thumbnail if not set
    if (!data.albums[albumIndex].thumbnail && uploadedPhotos.length > 0) {
      data.albums[albumIndex].thumbnail = uploadedPhotos[0].thumbnail;
    }
    
    data.albums[albumIndex].updatedAt = new Date().toISOString();
    
    await writeAlbumsData(data);
    
    res.status(201).json({
      message: `Przesłano ${uploadedPhotos.length} zdjęć`,
      photos: uploadedPhotos,
    });
  } catch (error) {
    console.error('Error uploading photos:', error);
    res.status(500).json({ error: 'Błąd podczas przesyłania zdjęć' });
  }
});

// ----------------------------------------
// DELETE /api/albums/:albumId/photos/:photoId - Delete photo
// ----------------------------------------
app.delete('/api/albums/:albumId/photos/:photoId', async (req, res) => {
  try {
    const { albumId, photoId } = req.params;
    const data = await readAlbumsData();
    
    const albumIndex = data.albums.findIndex(a => a.id === albumId);
    
    if (albumIndex === -1) {
      return res.status(404).json({ error: 'Album nie znaleziony' });
    }
    
    const photoIndex = data.albums[albumIndex].photos.findIndex(p => p.id === photoId);
    
    if (photoIndex === -1) {
      return res.status(404).json({ error: 'Zdjęcie nie znalezione' });
    }
    
    const photo = data.albums[albumIndex].photos[photoIndex];
    
    // Delete files
    try {
      const imagePath = path.join('.', photo.src);
      const thumbnailPath = path.join('.', photo.thumbnail);
      await fs.unlink(imagePath);
      await fs.unlink(thumbnailPath);
    } catch (err) {
      console.warn('Could not delete photo files:', err);
    }
    
    data.albums[albumIndex].photos.splice(photoIndex, 1);
    data.albums[albumIndex].updatedAt = new Date().toISOString();
    
    // Update album thumbnail if needed
    if (data.albums[albumIndex].thumbnail === photo.thumbnail) {
      data.albums[albumIndex].thumbnail = 
        data.albums[albumIndex].photos[0]?.thumbnail || '';
    }
    
    await writeAlbumsData(data);
    
    res.json({ message: 'Zdjęcie usunięte', id: photoId });
  } catch (error) {
    console.error('Error deleting photo:', error);
    res.status(500).json({ error: 'Błąd podczas usuwania zdjęcia' });
  }
});

// ----------------------------------------
// POST /api/upload - Bulk upload (create album + photos)
// ----------------------------------------
app.post('/api/upload', upload.array('photos', 1000), async (req, res) => {
  try {
    const { albumName } = req.body;
    
    if (!albumName || albumName.trim() === '') {
      return res.status(400).json({ error: 'Nazwa albumu jest wymagana' });
    }
    
    const data = await readAlbumsData();
    
    // Create new album
    const albumId = uuidv4();
    const newAlbum = {
      id: albumId,
      name: albumName.trim(),
      thumbnail: '',
      photos: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    // Move files to album directory
    const albumPath = path.join(CONFIG.albumsDir, albumId);
    if (!existsSync(albumPath)) {
      mkdirSync(albumPath, { recursive: true });
    }
    
    // Prepare photos for FTP upload
    const ftpPhotos = [];
    
    for (const file of req.files) {
      const photoId = uuidv4();
      const newFilename = `${photoId}${path.extname(file.originalname)}`;
      const newPath = path.join(albumPath, newFilename);
      
      // Move file
      await fs.rename(file.path, newPath);
      
      // Generate thumbnail
      const thumbnailFilename = `${photoId}.jpg`;
      const thumbPath = await generateThumbnail(newPath, albumId, thumbnailFilename);
      
      // Get dimensions
      const dimensions = await getImageDimensions(newPath);
      
      // Add to FTP upload queue
      ftpPhotos.push({
        photoPath: newPath,
        thumbPath: thumbPath,
        filename: newFilename,
        thumbFilename: thumbnailFilename,
        photoId,
        originalName: file.originalname,
        dimensions,
      });
    }
    
    // Upload to FTP if configured
    if (USE_FTP) {
      console.log(`📡 Uploading ${ftpPhotos.length} photos to FTP...`);
      
      const ftpResults = await ftpUploader.uploadAlbum(albumId, ftpPhotos.map(p => ({
        photoPath: p.photoPath,
        thumbPath: p.thumbPath,
        filename: p.filename,
      })));
      
      // Use FTP URLs
      for (let i = 0; i < ftpPhotos.length; i++) {
        const p = ftpPhotos[i];
        const ftpResult = ftpResults[i];
        
        newAlbum.photos.push({
          id: p.photoId,
          src: ftpResult.photoUrl,
          thumbnail: ftpResult.thumbUrl,
          title: p.originalName.replace(/\.[^/.]+$/, ''),
          width: p.dimensions.width,
          height: p.dimensions.height,
          uploadedAt: new Date().toISOString(),
        });
      }
    } else {
      // Use local URLs
      for (const p of ftpPhotos) {
        newAlbum.photos.push({
          id: p.photoId,
          src: `/uploads/albums/${albumId}/${p.filename}`,
          thumbnail: `/uploads/thumbnails/${albumId}/${p.thumbFilename}`,
          title: p.originalName.replace(/\.[^/.]+$/, ''),
          width: p.dimensions.width,
          height: p.dimensions.height,
          uploadedAt: new Date().toISOString(),
        });
      }
    }
    
    // Set album thumbnail
    if (newAlbum.photos.length > 0) {
      newAlbum.thumbnail = newAlbum.photos[0].thumbnail;
    }
    
    data.albums.push(newAlbum);
    await writeAlbumsData(data);
    
    res.status(201).json({
      message: `Album "${albumName}" utworzony z ${newAlbum.photos.length} zdjęciami`,
      album: newAlbum,
      storage: USE_FTP ? 'FTP' : 'local',
    });
  } catch (error) {
    console.error('Error in bulk upload:', error);
    res.status(500).json({ error: 'Błąd podczas przesyłania albumu' });
  }
});

// ============================================
// ERROR HANDLING
// ============================================

app.use((error, req, res, next) => {
  console.error('Server error:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Plik jest za duży (max 50MB)' });
    }
    return res.status(400).json({ error: `Błąd uploadu: ${error.message}` });
  }
  
  res.status(500).json({ error: error.message || 'Wewnętrzny błąd serwera' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint nie znaleziony' });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🖼️  GALERIA ONLINE - Backend API                         ║
║                                                            ║
║   Server running at: http://localhost:${PORT}                ║
║   Storage mode: ${USE_FTP ? '📡 FTP (' + process.env.FTP_HOST + ')' : '💾 Local storage'}
║                                                            ║
║   Endpoints:                                               ║
║   • GET    /api/health           - Status serwera          ║
║   • GET    /api/ftp/test         - Test połączenia FTP     ║
║   • GET    /api/albums           - Lista albumów           ║
║   • GET    /api/albums/:id       - Szczegóły albumu        ║
║   • POST   /api/albums           - Utwórz album            ║
║   • PUT    /api/albums/:id       - Edytuj album            ║
║   • DELETE /api/albums/:id       - Usuń album              ║
║   • POST   /api/albums/:id/photos - Dodaj zdjęcia          ║
║   • DELETE /api/albums/:id/photos/:photoId - Usuń zdjęcie  ║
║   • POST   /api/upload           - Upload albumu (bulk)    ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
});
