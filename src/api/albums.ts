import type { Album, Photo } from '@/types';

// ============================================
// API CONFIGURATION
// ============================================

const DEFAULT_API_URL = (() => {
  if (typeof window !== 'undefined') {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return isLocalhost ? 'http://localhost:3001' : 'https://backend.lenaparty.pl';
  }
  return 'https://backend.lenaparty.pl';
})();

const API_BASE_URL = import.meta.env.VITE_API_URL || DEFAULT_API_URL;

// ============================================
// HELPER FUNCTIONS
// ============================================

async function fetchAPI<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Błąd połączenia z serwerem' }));
    throw new Error(error.error || `HTTP Error: ${response.status}`);
  }

  return response.json();
}

// ============================================
// ALBUMS API
// ============================================

/**
 * Get all albums
 */
export async function getAlbums(): Promise<Album[]> {
  return fetchAPI<Album[]>('/api/albums');
}

/**
 * Get single album by ID
 */
export async function getAlbumById(id: string): Promise<Album> {
  return fetchAPI<Album>(`/api/albums/${id}`);
}

/**
 * Create new album
 */
export async function createAlbum(name: string): Promise<Album> {
  return fetchAPI<Album>('/api/albums', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

/**
 * Update album
 */
export async function updateAlbum(id: string, name: string): Promise<Album> {
  return fetchAPI<Album>(`/api/albums/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

/**
 * Delete album
 */
export async function deleteAlbum(id: string): Promise<{ message: string; id: string }> {
  return fetchAPI(`/api/albums/${id}`, {
    method: 'DELETE',
  });
}

// ============================================
// PHOTOS API
// ============================================

/**
 * Upload photos to existing album
 */
export async function uploadPhotosToAlbum(
  albumId: string,
  files: File[],
  onProgress?: (progress: number) => void
): Promise<{ message: string; photos: Photo[] }> {
  const formData = new FormData();
  
  files.forEach((file) => {
    formData.append('photos', file);
  });

  // Using XMLHttpRequest for progress tracking
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    xhr.open('POST', `${API_BASE_URL}/api/albums/${albumId}/photos`);
    
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const progress = (event.loaded / event.total) * 100;
        onProgress(progress);
      }
    };
    
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
          reject(new Error(error.error || 'Upload failed'));
        } catch {
          reject(new Error('Upload failed'));
        }
      }
    };
    
    xhr.onerror = () => reject(new Error('Network error'));
    
    xhr.send(formData);
  });
}

/**
 * Delete photo from album
 */
export async function deletePhoto(
  albumId: string,
  photoId: string
): Promise<{ message: string; id: string }> {
  return fetchAPI(`/api/albums/${albumId}/photos/${photoId}`, {
    method: 'DELETE',
  });
}

// ============================================
// BULK UPLOAD (Create album + upload photos)
// ============================================

const BATCH_SIZE = 30; // Upload 30 files at a time to avoid HTTP/2 errors

/**
 * Upload a single batch of files
 */
async function uploadBatch(
  url: string,
  formData: FormData,
  onProgress?: (loaded: number, total: number) => void
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    xhr.open('POST', url);
    
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded, event.total);
      }
    };
    
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
          reject(new Error(error.error || 'Upload failed'));
        } catch {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      }
    };
    
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.ontimeout = () => reject(new Error('Upload timeout'));
    
    xhr.timeout = 300000; // 5 minutes timeout per batch
    xhr.send(formData);
  });
}

/**
 * Upload entire album (creates album + uploads all photos in batches)
 */
export async function uploadAlbum(
  albumName: string,
  files: File[],
  onProgress?: (progress: number) => void
): Promise<{ message: string; album: Album }> {
  
  // If small number of files, upload directly
  if (files.length <= BATCH_SIZE) {
    const formData = new FormData();
    formData.append('albumName', albumName);
    files.forEach((file) => formData.append('photos', file));
    
    const result = await uploadBatch(
      `${API_BASE_URL}/api/upload`,
      formData,
      (loaded, total) => onProgress?.(loaded / total * 100)
    );
    return result as { message: string; album: Album };
  }
  
  // For large uploads, use batch upload
  console.log(`📦 Batch upload: ${files.length} files in batches of ${BATCH_SIZE}`);
  
  // Step 1: Create album with first batch
  const firstBatch = files.slice(0, BATCH_SIZE);
  const formData = new FormData();
  formData.append('albumName', albumName);
  firstBatch.forEach((file) => formData.append('photos', file));
  
  let totalUploaded = 0;
  const totalFiles = files.length;
  
  const createResult = await uploadBatch(
    `${API_BASE_URL}/api/upload`,
    formData,
    (loaded, total) => {
      const batchProgress = loaded / total;
      const overallProgress = (totalUploaded + batchProgress * firstBatch.length) / totalFiles * 100;
      onProgress?.(overallProgress);
    }
  ) as { message: string; album: Album };
  
  totalUploaded += firstBatch.length;
  onProgress?.((totalUploaded / totalFiles) * 100);
  
  const albumId = createResult.album.id;
  
  // Step 2: Upload remaining files in batches
  const remainingFiles = files.slice(BATCH_SIZE);
  
  for (let i = 0; i < remainingFiles.length; i += BATCH_SIZE) {
    const batch = remainingFiles.slice(i, i + BATCH_SIZE);
    const batchFormData = new FormData();
    batch.forEach((file) => batchFormData.append('photos', file));
    
    await uploadBatch(
      `${API_BASE_URL}/api/albums/${albumId}/photos`,
      batchFormData,
      (loaded, total) => {
        const batchProgress = loaded / total;
        const overallProgress = (totalUploaded + batchProgress * batch.length) / totalFiles * 100;
        onProgress?.(overallProgress);
      }
    );
    
    totalUploaded += batch.length;
    onProgress?.((totalUploaded / totalFiles) * 100);
    
    console.log(`✅ Batch ${Math.ceil((i + BATCH_SIZE) / BATCH_SIZE) + 1}: ${totalUploaded}/${totalFiles} files`);
  }
  
  // Fetch final album state
  const finalAlbum = await getAlbumById(albumId);
  
  return {
    message: `Album "${albumName}" utworzony z ${finalAlbum.photos.length} zdjęciami`,
    album: finalAlbum,
  };
}

// ============================================
// HEALTH CHECK
// ============================================

/**
 * Check if backend is available
 */
export async function checkHealth(): Promise<boolean> {
  try {
    await fetchAPI('/api/health');
    return true;
  } catch {
    return false;
  }
}

// ============================================
// URL HELPERS
// ============================================

/**
 * Get full URL for image src
 */
export function getImageUrl(src: string): string {
  if (src.startsWith('http')) {
    return src;
  }
  return `${API_BASE_URL}${src}`;
}

/**
 * Get full URL for thumbnail
 */
export function getThumbnailUrl(thumbnail: string): string {
  if (thumbnail.startsWith('http')) {
    return thumbnail;
  }
  return `${API_BASE_URL}${thumbnail}`;
}

/**
 * Get download URL for album
 */
export function getAlbumDownloadUrl(albumId: string): string {
  return `${API_BASE_URL}/api/albums/${albumId}/download`;
}

/**
 * Download multiple albums - returns blob URL
 */
export async function downloadMultipleAlbumsFromBackend(albumIds: string[]): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/api/download-multiple`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ albumIds }),
  });
  
  if (!response.ok) {
    throw new Error('Błąd podczas pobierania albumów');
  }
  
  return response.blob();
}
