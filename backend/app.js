import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, mkdirSync, createReadStream } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import archiver from 'archiver';
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
    const tempPath = path.join(CONFIG.albumsDir, 'temp');
    
    if (!existsSync(tempPath)) {
      mkdirSync(tempPath, { recursive: true });
    }
    
    cb(null, tempPath);
  },
  filename: (req, file, cb) => {
    // Preserve folder structure in filename (light/photo.jpg -> light___photo.jpg)
    const safeName = file.originalname
      .replace(/\\/g, '/')
      .replace(/\//g, '___');
    cb(null, sanitizeFilename(safeName));
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
    files: 2000, // Allow more files for light + max
  },
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function sanitizeFilename(filename) {
  let decoded = filename;
  try {
    decoded = decodeURIComponent(filename);
  } catch (e) {}
  
  const ext = path.extname(decoded);
  const name = path.basename(decoded, ext);
  
  const safeName = name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  
  return safeName + ext;
}

async function getUniqueFilename(dir, filename) {
  const ext = path.extname(filename);
  const name = path.basename(filename, ext);
  let finalName = filename;
  let counter = 1;
  
  while (existsSync(path.join(dir, finalName))) {
    finalName = `${name} (${counter})${ext}`;
    counter++;
  }
  
  return finalName;
}

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
// GET /api/albums/:id/download - Download album as ZIP
// ----------------------------------------
app.get('/api/albums/:id/download', async (req, res) => {
  try {
    const data = await readAlbumsData();
    const album = data.albums.find(a => a.id === req.params.id);
    
    if (!album) {
      return res.status(404).json({ error: 'Album nie znaleziony' });
    }
    
    const albumName = album.name;
    const albumPath = path.join(CONFIG.albumsDir, album.id);
    const lightPath = path.join(albumPath, 'light');
    const maxPath = path.join(albumPath, 'max');
    
    // Check if light/max structure exists
    const hasLightMax = existsSync(lightPath) && existsSync(maxPath);
    
    // Set response headers
    const zipFilename = `Lena ${albumName}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(zipFilename)}"`);
    
    // Create ZIP archive
    const archive = archiver('zip', { zlib: { level: 5 } });
    
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      res.status(500).json({ error: 'Błąd podczas tworzenia archiwum' });
    });
    
    archive.pipe(res);
    
    if (hasLightMax) {
      // New structure with light/max folders
      const lightFolderName = `Lena ${albumName} - Light - do dzielenia się w internecie`;
      const maxFolderName = `Lena ${albumName} - Max - do profesjonalnych wydruków`;
      
      // Add light folder
      archive.directory(lightPath, lightFolderName);
      
      // Add max folder
      archive.directory(maxPath, maxFolderName);
    } else {
      // Legacy structure - single folder with all photos
      const folderName = `Lena ${albumName}`;
      archive.directory(albumPath, folderName);
    }
    
    await archive.finalize();
    
  } catch (error) {
    console.error('Error downloading album:', error);
    res.status(500).json({ error: 'Błąd podczas pobierania albumu' });
  }
});

// ----------------------------------------
// POST /api/download-multiple - Download multiple albums as ZIP
// ----------------------------------------
app.post('/api/download-multiple', async (req, res) => {
  try {
    const { albumIds } = req.body;
    
    if (!albumIds || !Array.isArray(albumIds) || albumIds.length === 0) {
      return res.status(400).json({ error: 'Brak albumów do pobrania' });
    }
    
    const data = await readAlbumsData();
    const albumsToDownload = data.albums.filter(a => albumIds.includes(a.id));
    
    if (albumsToDownload.length === 0) {
      return res.status(404).json({ error: 'Nie znaleziono albumów' });
    }
    
    // Set response headers
    const zipFilename = albumsToDownload.length === 1 
      ? `Lena ${albumsToDownload[0].name}.zip`
      : `Lena Galeria.zip`;
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(zipFilename)}"`);
    
    // Create ZIP archive
    const archive = archiver('zip', { zlib: { level: 5 } });
    
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      res.status(500).json({ error: 'Błąd podczas tworzenia archiwum' });
    });
    
    archive.pipe(res);
    
    for (const album of albumsToDownload) {
      const albumPath = path.join(CONFIG.albumsDir, album.id);
      const lightPath = path.join(albumPath, 'light');
      const maxPath = path.join(albumPath, 'max');
      
      const hasLightMax = existsSync(lightPath) && existsSync(maxPath);
      
      if (hasLightMax) {
        const lightFolderName = `Lena ${album.name} - Light - do dzielenia się w internecie`;
        const maxFolderName = `Lena ${album.name} - Max - do profesjonalnych wydruków`;
        
        archive.directory(lightPath, lightFolderName);
        archive.directory(maxPath, maxFolderName);
      } else {
        archive.directory(albumPath, `Lena ${album.name}`);
      }
    }
    
    await archive.finalize();
    
  } catch (error) {
    console.error('Error downloading albums:', error);
    res.status(500).json({ error: 'Błąd podczas pobierania albumów' });
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
      hasLightMax: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    // Create album directory with light/max subfolders
    const albumPath = path.join(CONFIG.albumsDir, newAlbum.id);
    mkdirSync(path.join(albumPath, 'light'), { recursive: true });
    mkdirSync(path.join(albumPath, 'max'), { recursive: true });
    
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
// POST /api/albums/:id/photos - Add photos to existing album (for batch upload)
// ----------------------------------------
app.post('/api/albums/:id/photos', upload.array('photos', 100), async (req, res) => {
  try {
    const data = await readAlbumsData();
    const albumIndex = data.albums.findIndex(a => a.id === req.params.id);
    
    if (albumIndex === -1) {
      return res.status(404).json({ error: 'Album nie znaleziony' });
    }
    
    const album = data.albums[albumIndex];
    const albumPath = path.join(CONFIG.albumsDir, album.id);
    const lightPath = path.join(albumPath, 'light');
    const maxPath = path.join(albumPath, 'max');
    
    // Ensure directories exist
    if (!existsSync(lightPath)) mkdirSync(lightPath, { recursive: true });
    if (!existsSync(maxPath)) mkdirSync(maxPath, { recursive: true });
    
    const newPhotos = [];
    
    // Separate files by folder prefix
    const lightFiles = [];
    const maxFiles = [];
    const otherFiles = [];
    
    for (const file of req.files) {
      const filename = file.filename;
      if (filename.startsWith('light___')) {
        lightFiles.push({ ...file, cleanName: filename.replace('light___', '') });
      } else if (filename.startsWith('max___')) {
        maxFiles.push({ ...file, cleanName: filename.replace('max___', '') });
      } else {
        otherFiles.push(file);
      }
    }
    
    const hasLightMax = lightFiles.length > 0 && maxFiles.length > 0;
    
    if (hasLightMax) {
      // Move light files
      for (const file of lightFiles) {
        const targetPath = path.join(lightPath, file.cleanName);
        await fs.rename(file.path, targetPath);
      }
      // Move max files
      for (const file of maxFiles) {
        const targetPath = path.join(maxPath, file.cleanName);
        await fs.rename(file.path, targetPath);
      }
      
      // Create photo entries from light files
      for (const file of lightFiles) {
        const photoId = uuidv4();
        const imagePath = path.join(lightPath, file.cleanName);
        const thumbFilename = path.basename(file.cleanName, path.extname(file.cleanName)) + '.jpg';
        await generateThumbnail(imagePath, album.id, thumbFilename);
        const dimensions = await getImageDimensions(imagePath);
        
        newPhotos.push({
          id: photoId,
          src: `/uploads/albums/${album.id}/light/${file.cleanName}`,
          thumbnail: `/uploads/thumbnails/${album.id}/${thumbFilename}`,
          title: file.cleanName.replace(/\.[^/.]+$/, ''),
          width: dimensions.width,
          height: dimensions.height,
          uploadedAt: new Date().toISOString(),
        });
      }
      
      album.hasLightMax = true;
    } else {
      // Flat structure
      for (const file of otherFiles.length > 0 ? otherFiles : req.files) {
        const photoId = uuidv4();
        const safeFilename = sanitizeFilename(file.originalname);
        const uniqueFilename = await getUniqueFilename(albumPath, safeFilename);
        const newPath = path.join(albumPath, uniqueFilename);
        
        await fs.rename(file.path, newPath);
        
        const thumbFilename = path.basename(uniqueFilename, path.extname(uniqueFilename)) + '.jpg';
        await generateThumbnail(newPath, album.id, thumbFilename);
        const dimensions = await getImageDimensions(newPath);
        
        newPhotos.push({
          id: photoId,
          src: `/uploads/albums/${album.id}/${uniqueFilename}`,
          thumbnail: `/uploads/thumbnails/${album.id}/${thumbFilename}`,
          title: file.originalname.replace(/\.[^/.]+$/, ''),
          width: dimensions.width,
          height: dimensions.height,
          uploadedAt: new Date().toISOString(),
        });
      }
    }
    
    // Add new photos to album
    album.photos.push(...newPhotos);
    
    // Update thumbnail if album had none
    if (!album.thumbnail && newPhotos.length > 0) {
      album.thumbnail = newPhotos[0].thumbnail;
    }
    
    album.updatedAt = new Date().toISOString();
    await writeAlbumsData(data);
    
    res.status(201).json({
      message: `Dodano ${newPhotos.length} zdjęć do albumu`,
      photos: newPhotos,
    });
  } catch (error) {
    console.error('Error adding photos:', error);
    res.status(500).json({ error: 'Błąd podczas dodawania zdjęć' });
  }
});

// ----------------------------------------
// POST /api/upload - Bulk upload (create album + photos)
// Supports both:
// - Old format: flat list of photos
// - New format: photos with light/max folder structure
// ----------------------------------------
app.post('/api/upload', upload.array('photos', 2000), async (req, res) => {
  try {
    const { albumName } = req.body;
    
    if (!albumName || albumName.trim() === '') {
      return res.status(400).json({ error: 'Nazwa albumu jest wymagana' });
    }
    
    const data = await readAlbumsData();
    
    // Create new album
    const albumId = uuidv4();
    const albumPath = path.join(CONFIG.albumsDir, albumId);
    const lightPath = path.join(albumPath, 'light');
    const maxPath = path.join(albumPath, 'max');
    
    mkdirSync(lightPath, { recursive: true });
    mkdirSync(maxPath, { recursive: true });
    
    // Separate files by folder prefix (light___ or max___)
    const lightFiles = [];
    const maxFiles = [];
    const otherFiles = [];
    
    for (const file of req.files) {
      const filename = file.filename;
      
      if (filename.startsWith('light___')) {
        lightFiles.push({
          ...file,
          cleanName: filename.replace('light___', ''),
        });
      } else if (filename.startsWith('max___')) {
        maxFiles.push({
          ...file,
          cleanName: filename.replace('max___', ''),
        });
      } else {
        otherFiles.push(file);
      }
    }
    
    const hasLightMax = lightFiles.length > 0 && maxFiles.length > 0;
    
    const newAlbum = {
      id: albumId,
      name: albumName.trim(),
      thumbnail: '',
      photos: [],
      hasLightMax,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    // Process files
    if (hasLightMax) {
      // New format: light/max structure
      console.log(`📁 Processing ${lightFiles.length} light + ${maxFiles.length} max files`);
      
      // Move light files
      for (const file of lightFiles) {
        const targetPath = path.join(lightPath, file.cleanName);
        await fs.rename(file.path, targetPath);
      }
      
      // Move max files
      for (const file of maxFiles) {
        const targetPath = path.join(maxPath, file.cleanName);
        await fs.rename(file.path, targetPath);
      }
      
      // Create photo entries from light files (they're the preview versions)
      for (const file of lightFiles) {
        const photoId = uuidv4();
        const imagePath = path.join(lightPath, file.cleanName);
        
        // Generate thumbnail
        const thumbFilename = path.basename(file.cleanName, path.extname(file.cleanName)) + '.jpg';
        await generateThumbnail(imagePath, albumId, thumbFilename);
        
        // Get dimensions
        const dimensions = await getImageDimensions(imagePath);
        
        newAlbum.photos.push({
          id: photoId,
          src: `/uploads/albums/${albumId}/light/${file.cleanName}`,
          thumbnail: `/uploads/thumbnails/${albumId}/${thumbFilename}`,
          title: file.cleanName.replace(/\.[^/.]+$/, ''),
          width: dimensions.width,
          height: dimensions.height,
          uploadedAt: new Date().toISOString(),
        });
      }
    } else {
      // Old format: flat structure (or only other files)
      const filesToProcess = otherFiles.length > 0 ? otherFiles : req.files;
      
      for (const file of filesToProcess) {
        const photoId = uuidv4();
        const safeFilename = sanitizeFilename(file.originalname);
        const uniqueFilename = await getUniqueFilename(albumPath, safeFilename);
        const newPath = path.join(albumPath, uniqueFilename);
        
        await fs.rename(file.path, newPath);
        
        // Generate thumbnail
        const thumbFilename = path.basename(uniqueFilename, path.extname(uniqueFilename)) + '.jpg';
        await generateThumbnail(newPath, albumId, thumbFilename);
        
        // Get dimensions
        const dimensions = await getImageDimensions(newPath);
        
        newAlbum.photos.push({
          id: photoId,
          src: `/uploads/albums/${albumId}/${uniqueFilename}`,
          thumbnail: `/uploads/thumbnails/${albumId}/${thumbFilename}`,
          title: file.originalname.replace(/\.[^/.]+$/, ''),
          width: dimensions.width,
          height: dimensions.height,
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
      structure: hasLightMax ? 'light/max' : 'flat',
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
║   Storage mode: ${USE_FTP ? '📡 FTP' : '💾 Local storage'}
║                                                            ║
║   Endpoints:                                               ║
║   • GET    /api/health              - Status serwera       ║
║   • GET    /api/albums              - Lista albumów        ║
║   • GET    /api/albums/:id          - Szczegóły albumu     ║
║   • GET    /api/albums/:id/download - Pobierz album (ZIP)  ║
║   • POST   /api/download-multiple   - Pobierz wiele (ZIP)  ║
║   • POST   /api/albums              - Utwórz album         ║
║   • PUT    /api/albums/:id          - Edytuj album         ║
║   • DELETE /api/albums/:id          - Usuń album           ║
║   • POST   /api/upload              - Upload albumu        ║
║                                                            ║
║   Upload format: light/ + max/ folders                     ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
});
