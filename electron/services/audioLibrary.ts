import { app, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { storageService } from './storage';
import { parseFile } from 'music-metadata';

export interface AudioFile {
  id: string;
  name: string;
  filename: string;
  path: string;
  createdAt: number;
  duration?: number; // Duration in seconds
}

class AudioLibraryService {
  private libraryPath: string = '';

  constructor() {
    this.init();
  }

  private init() {

    try {
      this.libraryPath = path.join(app.getPath('documents'), 'tiktokAudioGift', 'musics');
      if (!fs.existsSync(this.libraryPath)) {
        fs.mkdirSync(this.libraryPath, { recursive: true });
      }
    } catch (e) {
      console.error('Failed to initialize AudioLibraryService:', e);
    }
  }

  ensureLibraryDir(): string {
    if (!this.libraryPath) {
      this.init();
    }
    if (!fs.existsSync(this.libraryPath)) {
      fs.mkdirSync(this.libraryPath, { recursive: true });
    }
    return this.libraryPath;
  }

  async importFile(): Promise<AudioFile | null> {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg'] }],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const sourcePath = result.filePaths[0];
    return this.copyFileToLibrary(sourcePath);
  }

  
  async copyFileToLibrary(sourcePath: string): Promise<AudioFile | null> {
    try {
      const ext = path.extname(sourcePath);
      const id = uuidv4();
      const filename = `${id}${ext}`; 
      const destPath = path.join(this.ensureLibraryDir(), filename);
      const originalName = path.basename(sourcePath, ext); 

      fs.copyFileSync(sourcePath, destPath);

      // Read audio duration
      let duration = 0;
      try {
        const metadata = await parseFile(destPath);
        duration = metadata.format.duration || 0;
      } catch (e) {
        console.warn('Could not read audio duration:', e);
      }
      
      // Ensure minimum duration of 1 second for progress tracking
      if (duration < 1) {
        duration = 1;
      }

      storageService.setAudioName(id, originalName);
      storageService.setAudioDuration(id, duration);

      return {
        id,
        name: originalName,
        filename,
        path: destPath,
        createdAt: Date.now(),
        duration,
      };
    } catch (e) {
      console.error('Error importing file:', e);
      return null;
    }
  }

  getFiles(): AudioFile[] {
    try {
      const dir = this.ensureLibraryDir();
      const files = fs.readdirSync(dir);
      
      return files
        .filter(file => /\.(mp3|wav|ogg)$/i.test(file))
        .map(file => {
          const filePath = path.join(dir, file);
          const stats = fs.statSync(filePath);
          const ext = path.extname(file);
          const id = path.basename(file, ext); 
          
          
          const displayName = storageService.getAudioName(id) || id;
          const duration = storageService.getAudioDuration(id) || 0;

          return {
            id,
            name: displayName, 
            filename: file,
            path: filePath,
            createdAt: stats.birthtimeMs,
            duration,
          };
        })
        .sort((a, b) => b.createdAt - a.createdAt);
    } catch (e) {
      console.error('Error listing files:', e);
      return [];
    }
  }

  deleteFile(filename: string): boolean {
    const filePath = path.join(this.ensureLibraryDir(), filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        // Clean up from playlists
        storageService.removeAudioFromMappings(filePath);
        return true;
      } catch (error) {
        console.error('Error deleting file:', error);
        return false;
      }
    }
    return false;
  }

  renameFile(id: string, newName: string): boolean {
    try {
      storageService.setAudioName(id, newName);
      return true;
    } catch (e) {
      console.error('Error renaming file:', e);
      return false;
    }
  }
}

export const audioLibraryService = new AudioLibraryService();
