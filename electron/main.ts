import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { tiktokService, GiftEvent } from './services/tiktok';
import { overlayServer } from './services/overlay';
import { storageService } from './services/storage';
import { audioLibraryService } from './services/audioLibrary';

const __dirname = path.dirname(fileURLToPath(import.meta.url));


process.env.APP_ROOT = path.join(__dirname, '..');

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST;

let win: BrowserWindow | null;

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 600,
    icon: path.join(process.env.VITE_PUBLIC, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'default',
    backgroundColor: '#0f0f1a',
  });

  
  Menu.setApplicationMenu(null);

  
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-ready');
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}


// Helper to safely send messages to renderer
function safeSend(channel: string, ...args: unknown[]) {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, ...args);
  }
}

function setupTikTokEvents() {
  tiktokService.on('status', (status) => {
    safeSend('tiktok:status', status);
  });

  tiktokService.on('connected', (info) => {
    safeSend('tiktok:connected', info);
  });

  tiktokService.on('disconnected', () => {
    safeSend('tiktok:disconnected');
  });

  tiktokService.on('error', (error) => {
    safeSend('tiktok:error', error);
  });

  
  tiktokService.on('giftFinal', (event: GiftEvent) => {
    
    const giftName = event.giftName === 'Gift' 
      ? storageService.getGiftName(event.giftId) || event.giftName
      : event.giftName;
    
    const enrichedEvent = { ...event, giftName };
    
    
    safeSend('tiktok:gift', enrichedEvent);

    
    
    const mapping = storageService.getGiftAudio(event.giftId);
    
    
    if (mapping && mapping.enabled) {
      
      let audioPathToPlay: string | undefined = mapping.audioPath; 
      
      if (mapping.audioFiles && mapping.audioFiles.length > 0) {
        const randomIndex = Math.floor(Math.random() * mapping.audioFiles.length);
        const selectedAudio = mapping.audioFiles[randomIndex];
        console.log(`[Audio] Selecting random audio: index ${randomIndex} of ${mapping.audioFiles.length} files`);
        
        if (typeof selectedAudio === 'string') {
          audioPathToPlay = selectedAudio;
        } else {
          audioPathToPlay = selectedAudio.path;
        }
      }

      if (audioPathToPlay) {
        const settings = storageService.getSettings();
        const globalVolume = settings.globalVolume;
        
        
        const filename = audioPathToPlay.split(/[/\\]/).pop() || '';
        const audioId = filename.replace(/\.[^/.]+$/, "");
        const audioVolume = storageService.getAudioVolume(audioId);
        const audioDuration = storageService.getAudioDuration(audioId) || 0;
        
        console.log(`[Audio] File: ${filename}, ID: ${audioId}, Audio Volume: ${audioVolume}, Global: ${globalVolume}`);
        
        const finalVolume = audioVolume * globalVolume;
        
        
        
        const repeatCount = Math.min(event.giftCount, 20);
        const delayMs = 250; 

        console.log(`[Audio] Playing "${giftName}" x${repeatCount} (Original count: ${event.giftCount}) - File: ${audioPathToPlay} @ ${Math.round(audioVolume * 100)}% vol`);

        // Play first audio with duration
        overlayServer.playAudio(event.giftId, giftName, event.nickname, audioPathToPlay, finalVolume, audioDuration);
        win?.webContents.send('audio:played', { giftId: event.giftId, giftName });

        
        if (repeatCount > 1) {
            let played = 1;
            const interval = setInterval(() => {
                if (played >= repeatCount) {
                    clearInterval(interval);
                    return;
                }
                
                
                let nextAudioPath = audioPathToPlay!;
                let nextVolume = finalVolume;
                
                if (mapping.audioFiles && mapping.audioFiles.length > 1) {
                    const nextRandomIndex = Math.floor(Math.random() * mapping.audioFiles.length);
                    const nextAudio = mapping.audioFiles[nextRandomIndex];
                    if (typeof nextAudio === 'string') {
                        nextAudioPath = nextAudio;
                    } else {
                        nextAudioPath = nextAudio.path;
                    }
                    
                    const nextFilename = nextAudioPath.split(/[/\\]/).pop() || '';
                    const nextAudioId = nextFilename.replace(/\.[^/.]+$/, "");
                    const nextAudioVolume = storageService.getAudioVolume(nextAudioId);
                    nextVolume = nextAudioVolume * globalVolume;
                }
                
                const nextFilename = nextAudioPath.split(/[/\\]/).pop() || '';
                const nextAudioIdForDuration = nextFilename.replace(/\.[^/.]+$/, "");
                const nextDuration = storageService.getAudioDuration(nextAudioIdForDuration) || 0;
                
                console.log(`[Audio] Playing repetition ${played + 1}/${repeatCount} for ${giftName} - File: ${nextAudioPath.split(/[/\\]/).pop()}`);
                overlayServer.playAudio(event.giftId, giftName, event.nickname, nextAudioPath, nextVolume, nextDuration);
                played++;
            }, delayMs);
        }
      }
    }
  });

  tiktokService.on('chat', (event) => {
    win?.webContents.send('tiktok:chat', event);
  });

  tiktokService.on('member', (event) => {
    win?.webContents.send('tiktok:member', event);
  });

  tiktokService.on('roomStats', (stats) => {
    win?.webContents.send('tiktok:roomStats', stats);
  });
}


function setupIpcHandlers() {
  
  ipcMain.handle('settings:get', () => {
    return storageService.getSettings();
  });



  ipcMain.handle('settings:setGlobalVolume', (_, volume: number) => {
    if (typeof volume !== 'number' || volume < 0 || volume > 1) return false;
    storageService.setGlobalVolume(volume);
    return true;
  });

  ipcMain.handle('settings:setGiftSortOrder', (_, order: 'asc' | 'desc' | 'none') => {
    storageService.setGiftSortOrder(order);
    return true;
  });

  
  ipcMain.handle('audioLibrary:import', async () => {
    return await audioLibraryService.importFile();
  });

  ipcMain.handle('audioLibrary:list', () => {
    return audioLibraryService.getFiles();
  });

  ipcMain.handle('audioLibrary:delete', (_, filename: string) => {
    return audioLibraryService.deleteFile(filename);
  });

  ipcMain.handle('audioLibrary:rename', (_, id: string, newName: string) => {
    return audioLibraryService.renameFile(id, newName);
  });

  ipcMain.handle('audioLibrary:setVolume', (_, id: string, volume: number) => {
    if (typeof id !== 'string' || typeof volume !== 'number') return false;
    storageService.setAudioVolume(id, volume);
    return true;
  });

  
  ipcMain.handle('tiktok:connect', async (_, username: string) => {
    if (!username || typeof username !== 'string') throw new Error('Invalid username');

    storageService.setLastUsername(username);
    return await tiktokService.connect(username);
  });

  ipcMain.handle('tiktok:disconnect', async () => {
    await tiktokService.disconnect();
    return true;
  });

  ipcMain.handle('tiktok:getStatus', () => {
    return tiktokService.getStatus();
  });

  ipcMain.handle('tiktok:fetchGifts', async () => {
    
    const cachedGifts = storageService.getCachedGifts();
    if (cachedGifts.length > 0) {
      return cachedGifts;
    }
    
    
    const rawGifts = await tiktokService.fetchAvailableGifts();
    const cachedData = rawGifts.map((g: any) => ({
      id: g.id,
      name: g.name,
      diamondCount: g.diamondCount || g.diamond_count || 0,
      imageUrl: g.image?.url_list?.[0] || '',
    }));
    storageService.setCachedGifts(cachedData);
    return cachedData;
  });

  ipcMain.handle('overlay:getQueueProgress', () => {
    return overlayServer.getQueueProgress();
  });

  ipcMain.handle('overlay:clearQueue', () => {
    overlayServer.clearQueue();
    return true;
  });

  
  ipcMain.handle('audio:setMapping', (_, mapping) => {
    storageService.setGiftAudio(mapping);
    return true;
  });

  ipcMain.handle('audio:removeMapping', (_, giftId: string) => {
    storageService.removeGiftAudio(giftId);
    return true;
  });

  ipcMain.handle('audio:getMappings', () => {
    return storageService.getAllGiftMappings();
  });

  ipcMain.handle('audio:selectFile', async () => {
    const result = await dialog.showOpenDialog(win!, {
      title: 'Select Audio File',
      filters: [
        { name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  
  ipcMain.handle('overlay:getUrl', () => {
    return overlayServer.getUrl();
  });

  ipcMain.handle('overlay:getConnectedCount', () => {
    return overlayServer.getConnectedCount();
  });

  
  ipcMain.handle('test:triggerGift', (_, giftName: string) => {
    const mappings = storageService.getAllGiftMappings();
    
    
    for (const mapping of Object.values(mappings)) {
      if (mapping.giftName.toLowerCase() === giftName.toLowerCase() && mapping.enabled && mapping.audioPath) {
        
        
        const count = 3; 
        
        const mockEvent: GiftEvent = {
          userId: 'test-user',
          username: 'test_user',
          nickname: 'Test User',
          giftId: mapping.giftId,
          giftName: mapping.giftName,
          giftCount: count,
          diamondCount: 1,
          isComboEnd: true,
          giftPictureUrl: ''
        };

        console.log(`[Test] Emitting mock gift event for ${mapping.giftName} x${count}`);
        tiktokService.emit('giftFinal', mockEvent);
        return true;
      }
    }
    return false;
  });
}


app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    tiktokService.disconnect();
    overlayServer.stop();
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(async () => {
  setupTikTokEvents();
  setupIpcHandlers();

  // Create window first for faster perceived startup
  createWindow();

  // Start services in background after window is visible
  const settings = storageService.getSettings();
  
  try {
    const libraryPath = audioLibraryService.ensureLibraryDir();
    await overlayServer.start(settings.overlayPort, libraryPath);
    console.log('[Main] Overlay server started successfully');
  } catch (e) {
    console.error('Failed to start overlay server:', e);
  }
});
