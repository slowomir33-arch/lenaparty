/**
 * FTP Upload Module for Galeria Online (ES Module)
 * Handles uploading photos to FTP server
 */

import * as ftp from 'basic-ftp';
import path from 'path';

class FTPUploader {
  constructor() {
    this.config = {
      host: process.env.FTP_HOST,
      port: parseInt(process.env.FTP_PORT) || 21,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASSWORD,
      secure: false,
    };
    this.basePath = process.env.FTP_BASE_PATH || '/';
    this.publicUrl = process.env.FTP_PUBLIC_URL || '';
  }

  async connect() {
    const client = new ftp.Client();
    client.ftp.verbose = false;
    
    try {
      await client.access(this.config);
      console.log(`✅ Connected to FTP: ${this.config.host}`);
      return client;
    } catch (err) {
      console.error(`❌ FTP connection failed:`, err.message);
      throw err;
    }
  }

  async ensureDir(client, remotePath) {
    try {
      await client.ensureDir(remotePath);
    } catch (err) {
      console.error(`Failed to create directory ${remotePath}:`, err.message);
      throw err;
    }
  }

  async uploadFile(localPath, remotePath) {
    const client = await this.connect();
    
    try {
      const fullRemotePath = path.posix.join(this.basePath, remotePath);
      const remoteDir = path.posix.dirname(fullRemotePath);
      
      await this.ensureDir(client, remoteDir);
      await client.uploadFrom(localPath, fullRemotePath);
      console.log(`📤 Uploaded: ${remotePath}`);
      
      return `${this.publicUrl}/${remotePath}`;
    } finally {
      client.close();
    }
  }

  async uploadAlbum(albumId, photos) {
    const client = await this.connect();
    const results = [];
    
    try {
      const albumDir = path.posix.join(this.basePath, 'albums', albumId);
      const thumbDir = path.posix.join(this.basePath, 'thumbnails', albumId);
      
      await this.ensureDir(client, albumDir);
      await this.ensureDir(client, thumbDir);
      
      for (const photo of photos) {
        const photoRemote = path.posix.join(albumDir, photo.filename);
        await client.uploadFrom(photo.photoPath, photoRemote);
        console.log(`📤 Photo: ${photo.filename}`);
        
        const thumbRemote = path.posix.join(thumbDir, photo.filename);
        await client.uploadFrom(photo.thumbPath, thumbRemote);
        console.log(`📤 Thumb: ${photo.filename}`);
        
        results.push({
          filename: photo.filename,
          photoUrl: `${this.publicUrl}/albums/${albumId}/${photo.filename}`,
          thumbUrl: `${this.publicUrl}/thumbnails/${albumId}/${photo.filename}`,
        });
      }
      
      return results;
    } finally {
      client.close();
    }
  }

  async deleteAlbum(albumId) {
    const client = await this.connect();
    
    try {
      const albumDir = path.posix.join(this.basePath, 'albums', albumId);
      const thumbDir = path.posix.join(this.basePath, 'thumbnails', albumId);
      
      try {
        await client.removeDir(albumDir);
        console.log(`🗑️ Deleted album folder: ${albumDir}`);
      } catch (err) {
        console.log(`Album folder not found: ${albumDir}`);
      }
      
      try {
        await client.removeDir(thumbDir);
        console.log(`🗑️ Deleted thumbnails folder: ${thumbDir}`);
      } catch (err) {
        console.log(`Thumbnails folder not found: ${thumbDir}`);
      }
    } finally {
      client.close();
    }
  }

  async deletePhoto(albumId, filename) {
    const client = await this.connect();
    
    try {
      const photoPath = path.posix.join(this.basePath, 'albums', albumId, filename);
      const thumbPath = path.posix.join(this.basePath, 'thumbnails', albumId, filename);
      
      try {
        await client.remove(photoPath);
        console.log(`🗑️ Deleted photo: ${photoPath}`);
      } catch (err) {
        console.log(`Photo not found: ${photoPath}`);
      }
      
      try {
        await client.remove(thumbPath);
        console.log(`🗑️ Deleted thumbnail: ${thumbPath}`);
      } catch (err) {
        console.log(`Thumbnail not found: ${thumbPath}`);
      }
    } finally {
      client.close();
    }
  }

  async testConnection() {
    try {
      const client = await this.connect();
      const list = await client.list(this.basePath);
      client.close();
      return { success: true, message: 'FTP connection successful', files: list.length };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  isConfigured() {
    return !!(this.config.host && this.config.user && this.config.password);
  }

  getPublicUrl(relativePath) {
    return `${this.publicUrl}/${relativePath}`;
  }
}

export default new FTPUploader();
