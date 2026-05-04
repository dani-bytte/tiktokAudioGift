import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { tiktokService, GiftEvent, LikeEvent } from './services/tiktok';
import { overlayServer } from './services/overlay';
import { storageService } from './services/storage';
import { audioLibraryService } from './services/audioLibrary';
import { leaderboardService } from './services/leaderboard';
import { mediaLibraryService } from './services/mediaLibrary';

const __dirname = path.dirname(fileURLToPath(import.meta.url));


process.env.APP_ROOT = path.join(__dirname, '..');

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST;

let win: BrowserWindow | null;
let leaderboardBroadcastInterval: NodeJS.Timeout | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1450,
    height: 800,
    minWidth: 1450,
    minHeight: 760,
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

function resolveAudioPath(audioPath: string): string {
  if (fs.existsSync(audioPath)) return audioPath;

  const filename = audioPath.split(/[/\\]/).pop();
  if (!filename) return audioPath;

  const libraryFiles = audioLibraryService.getFiles();
  const byFilename = libraryFiles.find((file) => file.filename === filename);
  if (byFilename?.path && fs.existsSync(byFilename.path)) {
    return byFilename.path;
  }

  return audioPath;
}

function resolveMediaPath(mediaPath: string): string {
  if (fs.existsSync(mediaPath)) return mediaPath;

  const filename = mediaPath.split(/[/\\]/).pop();
  if (!filename) return mediaPath;

  const mediaFiles = mediaLibraryService.getFiles();
  const byFilename = mediaFiles.find((file) => file.filename === filename);
  if (byFilename?.path && fs.existsSync(byFilename.path)) {
    return byFilename.path;
  }

  return mediaPath;
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

    const cachedDiamondCount = storageService
      .getCachedGifts()
      .find((g) => g.id.toString() === event.giftId)?.diamondCount || 0;
    const effectiveDiamondCount = event.diamondCount > 0 ? event.diamondCount : cachedDiamondCount;

    leaderboardService.addGift(
      event.userId,
      event.username,
      event.nickname,
      effectiveDiamondCount,
      event.giftCount,
    );


    safeSend('tiktok:gift', enrichedEvent);

    const mapping = storageService.getGiftAudio(event.giftId);

    const settings = storageService.getSettings();
    if (settings.timerEnabled) {
      // Check if gift has a custom override amount (stored in minutes)
      if (mapping && mapping.customTimerAmount !== undefined && mapping.customTimerAmount > 0) {
        const secondsToAdd = Number(mapping.customTimerAmount) * 60 * event.giftCount;
        overlayServer.addTimerTime(secondsToAdd);
        console.log(`[Timer] Added ${secondsToAdd}s (Custom Override of ${mapping.customTimerAmount}m) for ${event.giftName} x${event.giftCount}`);
      } else {
        // Fallback to global coin multiplier
        const coins = event.giftCount * event.diamondCount;
        if (coins > 0) {
          const secondsToAdd = coins * settings.timerSecondsPerCoin;
          overlayServer.addTimerTime(secondsToAdd);
          console.log(`[Timer] Added ${secondsToAdd}s for ${coins} coins (${event.giftName} x${event.giftCount})`);
        }
      }
    }


    if (mapping && mapping.enabled) {
      const getMediaForGift = () => {
        if (!mapping.mediaEnabled || !mapping.mediaPath) return undefined;

        const mediaFullPath = resolveMediaPath(mapping.mediaPath);
        if (!fs.existsSync(mediaFullPath)) {
          console.warn(`[Media] File not found for gift ${giftName}: ${mapping.mediaPath}`);
          return undefined;
        }

        const mediaExt = path.extname(mediaFullPath).toLowerCase();
        const mimeMap: Record<string, string> = {
          '.gif': 'image/gif',
          '.mp4': 'video/mp4',
          '.webm': 'video/webm',
        };
        const mime = mimeMap[mediaExt] || 'video/mp4';
        return { mediaPath: mediaFullPath, mimeType: mime };
      };

      const mediaForGift = getMediaForGift();

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
        audioPathToPlay = resolveAudioPath(audioPathToPlay);
        const settings = storageService.getSettings();
        const globalVolume = settings.globalVolume;

        const filename = audioPathToPlay.split(/[/\\]/).pop() || '';
        const audioId = filename.replace(/\.[^/.]+$/, '');
        const audioVolume = storageService.getAudioVolume(audioId);
        const audioDuration = storageService.getAudioDuration(audioId) || 0;

        console.log(`[Audio] File: ${filename}, ID: ${audioId}, Audio Volume: ${audioVolume}, Global: ${globalVolume}`);

        const finalVolume = audioVolume * globalVolume;
        const repeatCount = Math.min(event.giftCount, 20);
        const delayMs = 250;

        console.log(`[Audio] Playing "${giftName}" x${repeatCount} (Original count: ${event.giftCount}) - File: ${audioPathToPlay} @ ${Math.round(audioVolume * 100)}% vol`);

        // Play first audio + media
        overlayServer.playAudio(event.giftId, giftName, event.nickname, audioPathToPlay, finalVolume, audioDuration, mediaForGift);
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
              nextAudioPath = resolveAudioPath(nextAudioPath);

              const nextFilename = nextAudioPath.split(/[/\\]/).pop() || '';
              const nextAudioId = nextFilename.replace(/\.[^/.]+$/, '');
              const nextAudioVolume = storageService.getAudioVolume(nextAudioId);
              nextVolume = nextAudioVolume * globalVolume;
            }

            const nextFilename = nextAudioPath.split(/[/\\]/).pop() || '';
            const nextAudioIdForDuration = nextFilename.replace(/\.[^/.]+$/, '');
            const nextDuration = storageService.getAudioDuration(nextAudioIdForDuration) || 0;

            console.log(`[Audio] Playing repetition ${played + 1}/${repeatCount} for ${giftName} - File: ${nextAudioPath.split(/[/\\]/).pop()}`);
            overlayServer.playAudio(event.giftId, giftName, event.nickname, nextAudioPath, nextVolume, nextDuration, mediaForGift);
            played++;
          }, delayMs);
        }
      } else if (mediaForGift) {
        const repeatCount = Math.min(event.giftCount, 20);
        for (let i = 0; i < repeatCount; i++) {
          overlayServer.playMedia(
            mediaForGift.mediaPath,
            mediaForGift.mimeType,
            giftName,
            event.nickname,
          );
        }
      }
    }
  });

  tiktokService.on('chat', (event) => {
    win?.webContents.send('tiktok:chat', event);
  });

  tiktokService.on('like', (event: LikeEvent) => {
    if (!event.userId) return;

    leaderboardService.addLike(
      event.userId,
      event.username,
      event.nickname,
      event.likeCount,
      event.totalLikeCount,
    );

    safeSend('tiktok:like', event);
  });

  tiktokService.on('member', (event) => {
    win?.webContents.send('tiktok:member', event);
  });

  tiktokService.on('roomStats', (stats) => {
    win?.webContents.send('tiktok:roomStats', stats);
  });

  // Seed leaderboard with historical top gifters from TikTok on first ROOM_USER
  let seededHistory = false;
  tiktokService.on('roomTopGifters', (ranks: any[]) => {
    if (seededHistory) return;
    seededHistory = true;

    console.log(`[Leaderboard] Seeding ${ranks.length} historical top gifters from room`);
    for (const rank of ranks) {
      const user = rank.user || rank;
      const userId = user.userId?.toString() || user.id?.toString() || `rank-${rank.score}`;
      const username = user.uniqueId || '';
      const nickname = user.nickname || user.uniqueId || 'Anonymous';
      const score = rank.score || 0;

      if (score > 0) {
        leaderboardService.addGift(userId, username, nickname, score, 1);
      }
    }
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

  ipcMain.handle('settings:setTimerEnabled', (_, enabled: boolean) => {
    storageService.setTimerEnabled(enabled);
    overlayServer.broadcastTimerState(enabled, storageService.getSettings().timerInitialValue);
    return true;
  });

  ipcMain.handle('settings:setTimerInitialValue', (_, seconds: number) => {
    storageService.setTimerInitialValue(seconds);
    overlayServer.broadcastTimerState(storageService.getSettings().timerEnabled, seconds);
    return true;
  });

  ipcMain.handle('settings:setTimerSecondsPerCoin', (_, seconds: number) => {
    storageService.setTimerSecondsPerCoin(seconds);
    return true;
  });

  ipcMain.handle('settings:setOverlayShowLeaderboard', (_, enabled: boolean) => {
    storageService.setOverlayShowLeaderboard(enabled);
    overlayServer.setLeaderboardVisibility(enabled);
    return true;
  });

  ipcMain.handle('timer:togglePause', () => {
    overlayServer.toggleTimerPause();
    return true;
  });

  ipcMain.handle('timer:stop', () => {
    overlayServer.stopTimer();
    return true;
  });

  ipcMain.handle('timer:addManual', (_, seconds: number) => {
    overlayServer.addTimerTime(seconds);
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

  ipcMain.handle('mediaLibrary:import', async () => {
    return await mediaLibraryService.importFile();
  });

  ipcMain.handle('mediaLibrary:list', () => {
    return mediaLibraryService.getFiles();
  });

  ipcMain.handle('mediaLibrary:delete', (_, filename: string) => {
    return mediaLibraryService.deleteFile(filename);
  });

  ipcMain.handle('mediaLibrary:selectFile', async () => {
    const result = await dialog.showOpenDialog(win!, {
      title: 'Select Media File',
      filters: [
        { name: 'Media Files', extensions: ['gif', 'mp4', 'webm'] },
      ],
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const imported = await mediaLibraryService.copyFileToLibrary(result.filePaths[0]);
    return imported?.path || null;
  });

  ipcMain.handle('mediaLibrary:getOverlayUrlForPath', (_, mediaPath: string) => {
    if (!mediaPath || typeof mediaPath !== 'string') return null;

    const resolvedPath = resolveMediaPath(mediaPath);
    if (!fs.existsSync(resolvedPath)) return null;

    const ext = path.extname(resolvedPath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.gif': 'image/gif',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
    };
    const mime = mimeMap[ext];
    if (!mime) return null;

    const route = overlayServer.registerMediaFile(resolvedPath, mime);
    if (!route) return null;
    return `${overlayServer.getUrl()}${route}`;
  });

  ipcMain.handle('tiktok:connect', async (_, username: string) => {
    if (!username || typeof username !== 'string') throw new Error('Invalid username');

    storageService.setLastUsername(username);
    leaderboardService.onSessionStart();
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

  ipcMain.handle('leaderboard:get', () => {
    return leaderboardService.getFullData();
  });

  ipcMain.handle('leaderboard:getGift', () => {
    return leaderboardService.getTopGiftSenders(50);
  });

  ipcMain.handle('leaderboard:getLike', () => {
    return leaderboardService.getTopLikers(50);
  });

  ipcMain.handle('leaderboard:getMonthlyHistory', () => {
    return leaderboardService.getMonthlyHistory();
  });

  ipcMain.handle('leaderboard:reset', () => {
    leaderboardService.resetSession();
    return true;
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
    if (result.canceled || result.filePaths.length === 0) return null;

    const imported = await audioLibraryService.copyFileToLibrary(result.filePaths[0]);
    return imported?.path || null;
  });


  ipcMain.handle('overlay:getUrl', () => {
    return overlayServer.getUrl();
  });

  ipcMain.handle('overlay:getMediaAudioUrl', () => {
    return overlayServer.getMediaAudioUrl();
  });

  ipcMain.handle('overlay:getLeaderboardUrl', () => {
    return overlayServer.getLeaderboardUrl();
  });

  ipcMain.handle('overlay:getTimerUrl', () => {
    return overlayServer.getTimerUrl();
  });

  ipcMain.handle('overlay:getConnectedCount', () => {
    return overlayServer.getConnectedCount();
  });


  ipcMain.handle('test:triggerGift', (_, giftName: string) => {
    const mappings = storageService.getAllGiftMappings();


    for (const mapping of Object.values(mappings)) {
      if (mapping.giftName.toLowerCase() === giftName.toLowerCase() && mapping.enabled && (mapping.audioPath || (mapping.audioFiles && mapping.audioFiles.length > 0))) {


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
    if (leaderboardBroadcastInterval) {
      clearInterval(leaderboardBroadcastInterval);
      leaderboardBroadcastInterval = null;
    }
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

  overlayServer.on('clientConnected', () => {
    const settings = storageService.getSettings();
    overlayServer.broadcastTimerState(settings.timerEnabled, settings.timerInitialValue);
    overlayServer.setLeaderboardVisibility(settings.overlayShowLeaderboard ?? true);
  });

  overlayServer.on('timer-tick', (data) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('timer:tick', data);
    }
  });

  leaderboardBroadcastInterval = setInterval(() => {
    overlayServer.broadcast({
      type: 'leaderboard-update',
      data: leaderboardService.getOverlayData(),
    });
  }, 5000);

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
