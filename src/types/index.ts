// Types for the Gallery Application

export interface Photo {
  id: string;
  src: string;
  thumbnail?: string;
  title?: string;
  width?: number;
  height?: number;
}

export interface Album {
  id: string;
  name: string;
  thumbnail: string;
  photos: Photo[];
  createdAt?: Date;
}

export interface UploadedFile {
  file: File;
  preview: string;
  albumName: string;
}

export interface SliderItem {
  id: string;
  image: string;
  title?: string;
}
