import { app, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { optimizeMedia } from './mediaOptimizer';

export interface MediaFile {
  id: string;
  name: string;
  filename: string;
  path: string;
  mimeType: string;
  isGif: boolean;
  isVideo: boolean;
  createdAt: number;
}

const MEDIA_EXTENSIONS = ['gif', 'mp4', 'webm'];
const MIME_MAP: Record<string, string> = {
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

class MediaLibraryService {
  private libraryPath: string = '';

  constructor() {
    this.init();
  }

  private init() {
    try {
      this.libraryPath = path.join(app.getPath('documents'), 'tiktokAudioGift', 'media');
      if (!fs.existsSync(this.libraryPath)) {
        fs.mkdirSync(this.libraryPath, { recursive: true });
      }
    } catch (e) {
      console.error('Failed to initialize MediaLibraryService:', e);
    }
  }

  ensureLibraryDir(): string {
    if (!this.libraryPath) this.init();
    if (!fs.existsSync(this.libraryPath)) {
      fs.mkdirSync(this.libraryPath, { recursive: true });
    }
    return this.libraryPath;
  }

  async importFile(): Promise<MediaFile | null> {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        {
          name: 'Media (GIF/MP4/WebM)',
          extensions: MEDIA_EXTENSIONS,
        },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) return null;
    return this.copyFileToLibrary(result.filePaths[0]);
  }

  async copyFileToLibrary(sourcePath: string): Promise<MediaFile | null> {
    try {
      const ext = path.extname(sourcePath).toLowerCase();
      if (!MIME_MAP[ext]) {
        console.error(`[MediaLibrary] Unsupported media extension: ${ext}`);
        return null;
      }

      const id = uuidv4();
      const filename = `${id}${ext}`;
      const destPath = path.join(this.ensureLibraryDir(), filename);
      const originalName = path.basename(sourcePath, ext);

      fs.copyFileSync(sourcePath, destPath);

      const isGif = ext === '.gif';
      const isVideo = ext === '.mp4' || ext === '.webm';

      // Trigger optimization in background (don't await)
      if (isGif || isVideo) {
        optimizeMedia(destPath).then((result) => {
          if (result.wasTranscoded) {
            console.log(`[MediaLibrary] Optimized: ${path.basename(destPath)} -> ${path.basename(result.optimizedPath!)}`);
          }
        }).catch((e) => {
          console.warn('[MediaLibrary] Background optimization failed:', e?.message);
        });
      }

      return {
        id,
        name: originalName,
        filename,
        path: destPath,
        mimeType: MIME_MAP[ext],
        isGif,
        isVideo,
        createdAt: Date.now(),
      };
    } catch (e) {
      console.error('[MediaLibrary] Error importing file:', e);
      return null;
    }
  }

  getFiles(): MediaFile[] {
    try {
      const dir = this.ensureLibraryDir();
      const files = fs.readdirSync(dir);

      const extRegex = new RegExp(`\\.(${MEDIA_EXTENSIONS.join('|')})$`, 'i');
      return files
        .filter(file => extRegex.test(file))
        .map(file => {
          const ext = path.extname(file).toLowerCase();
          const id = path.basename(file, ext);
          const filePath = path.join(dir, file);

          return {
            id,
            name: id,
            filename: file,
            path: filePath,
            mimeType: MIME_MAP[ext] || 'application/octet-stream',
            isGif: ext === '.gif',
            isVideo: ext === '.mp4' || ext === '.webm',
            createdAt: 0,
          };
        });
    } catch (e) {
      console.error('[MediaLibrary] Error listing files:', e);
      return [];
    }
  }

  deleteFile(filename: string): boolean {
    try {
      const filePath = path.join(this.ensureLibraryDir(), filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    } catch (e) {
      console.error('[MediaLibrary] Error deleting file:', e);
      return false;
    }
  }
}

export const mediaLibraryService = new MediaLibraryService();
