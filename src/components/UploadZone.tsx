import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FolderUp, X, Image, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { uploadAlbum } from '@/api/albums';

interface UploadedFolder {
  name: string;
  files: File[];
  previews: string[];
}

interface UploadZoneProps {
  onUpload?: (folders: UploadedFolder[]) => void;
  onClose?: () => void;
  useBackend?: boolean;
}

const UploadZone: React.FC<UploadZoneProps> = ({
  onUpload,
  onClose,
  useBackend = true,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadedFolders, setUploadedFolders] = useState<UploadedFolder[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper function to recursively read all files from a directory
  const readAllFilesFromDirectory = async (
    dirEntry: FileSystemDirectoryEntry
  ): Promise<File[]> => {
    const files: File[] = [];
    const dirReader = dirEntry.createReader();

    // Read all entries (readEntries may need multiple calls for large directories)
    const readAllEntries = async (): Promise<FileSystemEntry[]> => {
      const allEntries: FileSystemEntry[] = [];
      
      const readBatch = (): Promise<FileSystemEntry[]> => {
        return new Promise((resolve) => {
          dirReader.readEntries((entries) => resolve(entries));
        });
      };

      let batch = await readBatch();
      while (batch.length > 0) {
        allEntries.push(...batch);
        batch = await readBatch();
      }
      
      return allEntries;
    };

    const entries = await readAllEntries();

    for (const entry of entries) {
      if (entry.isFile) {
        const file = await new Promise<File>((resolve) => {
          (entry as FileSystemFileEntry).file(resolve);
        });
        if (file.type.startsWith('image/')) {
          files.push(file);
        }
      } else if (entry.isDirectory) {
        // Recursively read subdirectories
        const subFiles = await readAllFilesFromDirectory(entry as FileSystemDirectoryEntry);
        files.push(...subFiles);
      }
    }

    return files;
  };

  // Handle file/folder drop
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const items = Array.from(e.dataTransfer.items);
    const folders: UploadedFolder[] = [];

    // Process all items in parallel for better performance
    const processingPromises = items.map(async (item) => {
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry?.();
        
        if (entry?.isDirectory) {
          // Handle folder - read all files recursively
          const files = await readAllFilesFromDirectory(entry as FileSystemDirectoryEntry);
          
          if (files.length > 0) {
            // Sort files by name for consistent ordering
            files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
            
            // Create previews (limit to first 10 for performance)
            const previews = files.slice(0, 10).map(file => URL.createObjectURL(file));
            
            return {
              name: entry.name,
              files,
              previews,
            };
          }
        } else {
          // Handle single file
          const file = item.getAsFile();
          if (file && file.type.startsWith('image/')) {
            return {
              isSingleFile: true as const,
              file: file,
            };
          }
        }
      }
      return null;
    });

    const results = await Promise.all(processingPromises);

    // Collect single files into "Nowy Album"
    const singleFiles: File[] = [];
    
    for (const result of results) {
      if (result === null) continue;
      
      if ('isSingleFile' in result && result.file) {
        singleFiles.push(result.file);
      } else {
        folders.push(result);
      }
    }

    // Group single files into one album
    if (singleFiles.length > 0) {
      folders.push({
        name: 'Nowy Album',
        files: singleFiles,
        previews: singleFiles.slice(0, 10).map(f => URL.createObjectURL(f)),
      });
    }

    if (folders.length > 0) {
      setUploadedFolders(prev => [...prev, ...folders]);
    }
  }, []);

  // Handle folder input change (for button click)
  const handleFolderSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Group files by their folder path
    const folderMap = new Map<string, { files: File[]; previews: string[] }>();

    files.forEach((file) => {
      // Get folder name from path
      const pathParts = file.webkitRelativePath?.split('/') || [file.name];
      const folderName = pathParts.length > 1 ? pathParts[0] : 'Nowy Album';

      if (file.type.startsWith('image/')) {
        if (!folderMap.has(folderName)) {
          folderMap.set(folderName, { files: [], previews: [] });
        }
        const folder = folderMap.get(folderName)!;
        folder.files.push(file);
        folder.previews.push(URL.createObjectURL(file));
      }
    });

    const newFolders: UploadedFolder[] = Array.from(folderMap.entries()).map(
      ([name, data]) => ({
        name,
        files: data.files,
        previews: data.previews,
      })
    );

    setUploadedFolders(prev => [...prev, ...newFolders]);
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // Handle drag events
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  // Remove folder
  const removeFolder = useCallback((index: number) => {
    setUploadedFolders(prev => {
      const folder = prev[index];
      // Clean up preview URLs
      folder.previews.forEach(url => URL.revokeObjectURL(url));
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  // Upload to server
  const handleUpload = useCallback(async () => {
    if (uploadedFolders.length === 0) return;

    setIsUploading(true);
    setUploadStatus('idle');
    setUploadProgress(0);

    try {
      const totalFolders = uploadedFolders.length;
      let completedFolders = 0;

      for (const folder of uploadedFolders) {
        if (useBackend) {
          // Upload to real backend
          await uploadAlbum(
            folder.name,
            folder.files,
            (progress) => {
              // Calculate overall progress
              const folderProgress = (completedFolders + progress / 100) / totalFolders;
              setUploadProgress(Math.round(folderProgress * 100));
            }
          );
        } else {
          // Simulate upload when backend is not available
          console.log(`[Mock] Uploading album "${folder.name}" with ${folder.files.length} files`);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        completedFolders++;
        setUploadProgress(Math.round((completedFolders / totalFolders) * 100));
      }

      setUploadStatus('success');
      
      if (onUpload) {
        onUpload(uploadedFolders);
      }

      // Clear after successful upload
      setTimeout(() => {
        setUploadedFolders([]);
        setUploadStatus('idle');
      }, 2000);
    } catch (error) {
      console.error('Upload error:', error);
      setUploadStatus('error');
    } finally {
      setIsUploading(false);
    }
  }, [uploadedFolders, useBackend, onUpload]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(20px)',
      }}
    >
      <motion.div
        className="w-full max-w-3xl glass-elevated p-6 md:p-8"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Upload Albumów</h2>
            <p className="text-white/60 text-sm mt-1">
              Przeciągnij wiele folderów naraz lub wybierz je z dysku
            </p>
          </div>
          {onClose && (
            <motion.button
              onClick={onClose}
              className="p-2 glass rounded-full"
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
            >
              <X className="w-5 h-5 text-white" />
            </motion.button>
          )}
        </div>

        {/* Drop Zone */}
        <div
          className={`upload-zone p-8 md:p-12 ${isDragOver ? 'drag-over' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <div className="text-center">
            <motion.div
              animate={{ y: isDragOver ? -10 : 0 }}
              transition={{ type: 'spring', damping: 15 }}
            >
              {isDragOver ? (
                <FolderUp className="w-16 h-16 mx-auto mb-4 text-white/80" />
              ) : (
                <Upload className="w-16 h-16 mx-auto mb-4 text-white/40" />
              )}
            </motion.div>
            
            <h3 className="text-lg font-medium text-white mb-2">
              {isDragOver ? 'Upuść tutaj!' : 'Przeciągnij foldery ze zdjęciami'}
            </h3>
            <p className="text-white/50 text-sm mb-6">
              Możesz przeciągnąć wiele folderów naraz • Jeden folder = Jeden album
            </p>

            {/* Folder Select Button */}
            <input
              ref={fileInputRef}
              type="file"
              // @ts-expect-error - webkitdirectory is not in the type definition
              webkitdirectory="true"
              directory=""
              multiple
              onChange={handleFolderSelect}
              className="hidden"
              accept="image/*"
            />
            <motion.button
              onClick={() => fileInputRef.current?.click()}
              className="glass-button px-6 py-3 inline-flex items-center gap-2"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <FolderUp className="w-5 h-5" />
              Wybierz folder
            </motion.button>
          </div>
        </div>

        {/* Uploaded Folders Preview */}
        <AnimatePresence>
          {uploadedFolders.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-6 overflow-hidden"
            >
              <h3 className="text-white font-medium mb-4">
                Przygotowane do uploadu ({uploadedFolders.length} {uploadedFolders.length === 1 ? 'album' : 'albumy'})
              </h3>
              
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {uploadedFolders.map((folder, index) => (
                  <motion.div
                    key={`${folder.name}-${index}`}
                    className="glass-subtle p-4 flex items-center gap-4"
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 20, opacity: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    {/* Preview Thumbnails */}
                    <div className="flex -space-x-3">
                      {folder.previews.slice(0, 3).map((preview, i) => (
                        <div
                          key={i}
                          className="w-12 h-12 rounded-lg border-2 border-white/20 overflow-hidden"
                          style={{ zIndex: 3 - i }}
                        >
                          <img
                            src={preview}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                      {folder.files.length > 3 && (
                        <div className="w-12 h-12 rounded-lg border-2 border-white/20 glass flex items-center justify-center text-xs text-white">
                          +{folder.files.length - 3}
                        </div>
                      )}
                    </div>

                    {/* Folder Info */}
                    <div className="flex-1">
                      <h4 className="text-white font-medium">{folder.name}</h4>
                      <p className="text-white/50 text-sm flex items-center gap-1">
                        <Image className="w-3 h-3" />
                        {folder.files.length} zdjęć
                      </p>
                    </div>

                    {/* Remove Button */}
                    <motion.button
                      onClick={() => removeFolder(index)}
                      className="p-2 hover:bg-white/10 rounded-full transition-colors"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      <X className="w-4 h-4 text-white/60" />
                    </motion.button>
                  </motion.div>
                ))}
              </div>

              {/* Upload Button */}
              <motion.button
                onClick={handleUpload}
                disabled={isUploading || uploadStatus === 'success'}
                className="w-full mt-6 glass-button-primary flex items-center justify-center gap-3"
                whileHover={{ scale: isUploading ? 1 : 1.02 }}
                whileTap={{ scale: isUploading ? 1 : 0.98 }}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Przesyłanie... {uploadProgress}%
                  </>
                ) : uploadStatus === 'success' ? (
                  <>
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    Sukces!
                  </>
                ) : uploadStatus === 'error' ? (
                  <>
                    <AlertCircle className="w-5 h-5 text-red-400" />
                    Błąd - spróbuj ponownie
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    Prześlij albumy
                  </>
                )}
              </motion.button>

              {/* Progress Bar */}
              {isUploading && (
                <div className="mt-3 h-2 bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${uploadProgress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              )}

              {/* Info Note */}
              <p className="text-center text-white/40 text-xs mt-4">
                Zdjęcia zostaną przesłane na serwer FTP
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
};

export default UploadZone;
