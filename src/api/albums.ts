import type { Album, Photo } from '@/types';

// ============================================
// API CONFIGURATION
// ============================================

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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

/**
 * Upload entire album (creates album + uploads all photos)
 */
export async function uploadAlbum(
  albumName: string,
  files: File[],
  onProgress?: (progress: number) => void
): Promise<{ message: string; album: Album }> {
  const formData = new FormData();
  formData.append('albumName', albumName);
  
  files.forEach((file) => {
    formData.append('photos', file);
  });

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    
    xhr.open('POST', `${API_BASE_URL}/api/upload`);
    
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
