import type { Album, Photo } from '@/types';

// Mock data for demonstration
// In production, this would be loaded from an API or file system

const createMockPhotos = (albumId: string, count: number): Photo[] => {
  // Using high-quality Unsplash images for demo
  const unsplashIds = [
    'photo-1682687220742-aba13b6e50ba',
    'photo-1682687221038-404cb8830901',
    'photo-1682695796497-31a44224d6d6',
    'photo-1682695797221-8164ff1fafc9',
    'photo-1682695794947-17061dc284dd',
    'photo-1682687220199-d0124f48f95b',
    'photo-1682687220063-4742bd7fd538',
    'photo-1682687219573-3fd75f982217',
    'photo-1682687220509-2c4e5e4c5a0c',
    'photo-1682687220015-4c0c2e2c5f5c',
    'photo-1506905925346-21bda4d32df4',
    'photo-1469474968028-56623f02e42e',
    'photo-1447752875215-b2761acb3c5d',
    'photo-1433086966358-54859d0ed716',
    'photo-1501854140801-50d01698950b',
  ];

  return Array.from({ length: count }, (_, i) => ({
    id: `${albumId}-photo-${i + 1}`,
    src: `https://images.unsplash.com/${unsplashIds[i % unsplashIds.length]}?w=1600&q=80`,
    thumbnail: `https://images.unsplash.com/${unsplashIds[i % unsplashIds.length]}?w=400&q=60`,
    title: `Photo ${i + 1}`,
    width: 1600,
    height: 1067,
  }));
};

export const mockAlbums: Album[] = [
  {
    id: 'album-1',
    name: 'Sesja Ślubna',
    thumbnail: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=400&q=60',
    photos: createMockPhotos('album-1', 12),
    createdAt: new Date('2024-03-15'),
  },
  {
    id: 'album-2',
    name: 'Portret Artystyczny',
    thumbnail: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400&q=60',
    photos: createMockPhotos('album-2', 8),
    createdAt: new Date('2024-03-10'),
  },
  {
    id: 'album-3',
    name: 'Krajobraz',
    thumbnail: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400&q=60',
    photos: createMockPhotos('album-3', 15),
    createdAt: new Date('2024-03-05'),
  },
  {
    id: 'album-4',
    name: 'Architektura',
    thumbnail: 'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=400&q=60',
    photos: createMockPhotos('album-4', 10),
    createdAt: new Date('2024-02-28'),
  },
  {
    id: 'album-5',
    name: 'Street Photography',
    thumbnail: 'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=400&q=60',
    photos: createMockPhotos('album-5', 9),
    createdAt: new Date('2024-02-20'),
  },
];

export const getAlbumById = (id: string): Album | undefined => {
  return mockAlbums.find((album) => album.id === id);
};
