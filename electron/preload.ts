import { ipcRenderer, contextBridge } from 'electron';


export interface GiftEvent {
  userId: string;
  username: string;
  nickname: string;
  giftId: string;
  giftName: string;
  giftCount: number;
  diamondCount: number;
  isComboEnd: boolean;
  giftPictureUrl?: string;
}

export interface ChatEvent {
  userId: string;
  username: string;
  nickname: string;
  message: string;
}

export interface MemberEvent {
  userId: string;
  username: string;
  nickname: string;
}

export interface AudioFileEntry {
  path: string;
  volume: number;
}

export interface GiftAudioMapping {
  giftId: string;
  giftName: string;
  audioPath?: string;
  audioFiles: AudioFileEntry[];
  enabled: boolean;
  customTimerAmount?: number;
  mediaPath?: string;
  mediaEnabled?: boolean;
}

export interface AppSettings {
  lastUsername: string;
  giftAudioMappings: Record<string, GiftAudioMapping>;
  overlayPort: number;
  showGiftAnimation: boolean;
  globalVolume: number;
  giftSortOrder: 'asc' | 'desc' | 'none';
  audioFileNames: Record<string, string>;
  audioFileVolumes: Record<string, number>;
  timerEnabled: boolean;
  timerInitialValue: number;
  timerSecondsPerCoin: number;
  overlayShowLeaderboard: boolean;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  nickname: string;
  score: number;
  count: number;
}

export interface LeaderboardData {
  gifters: LeaderboardEntry[];
  likers: LeaderboardEntry[];
  totalLikesLive: number;
}

export interface MonthlyHistory {
  month: string;
  topGiftSenders: LeaderboardEntry[];
  topLikers: LeaderboardEntry[];
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

const listenersMap = new WeakMap<Function, Function>();

const electronAPI = {

  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),

  setGlobalVolume: (volume: number): Promise<boolean> => ipcRenderer.invoke('settings:setGlobalVolume', volume),
  setGiftSortOrder: (order: 'asc' | 'desc' | 'none'): Promise<boolean> => ipcRenderer.invoke('settings:setGiftSortOrder', order),
  setTimerEnabled: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke('settings:setTimerEnabled', enabled),
  setTimerInitialValue: (value: number): Promise<boolean> => ipcRenderer.invoke('settings:setTimerInitialValue', value),
  setTimerSecondsPerCoin: (seconds: number): Promise<boolean> => ipcRenderer.invoke('settings:setTimerSecondsPerCoin', seconds),
  setOverlayShowLeaderboard: (enabled: boolean): Promise<boolean> => ipcRenderer.invoke('settings:setOverlayShowLeaderboard', enabled),

  toggleTimerPause: (): Promise<boolean> => ipcRenderer.invoke('timer:togglePause'),
  stopTimer: (): Promise<boolean> => ipcRenderer.invoke('timer:stop'),
  addManualTimer: (seconds: number): Promise<boolean> => ipcRenderer.invoke('timer:addManual', seconds),
  onTimerTick: (callback: (data: any) => void) => {
    ipcRenderer.on('timer:tick', (_event, data) => callback(data));
  },
  offTimerTick: (callback: (data: any) => void) => {
    ipcRenderer.removeListener('timer:tick', callback);
  },

  connect: (username: string): Promise<any> => ipcRenderer.invoke('tiktok:connect', username),
  disconnect: (): Promise<boolean> => ipcRenderer.invoke('tiktok:disconnect'),
  getStatus: (): Promise<ConnectionStatus> => ipcRenderer.invoke('tiktok:getStatus'),
  fetchGifts: (): Promise<any[]> => ipcRenderer.invoke('tiktok:fetchGifts'),


  setAudioMapping: (mapping: GiftAudioMapping): Promise<boolean> => ipcRenderer.invoke('audio:setMapping', mapping),
  removeAudioMapping: (giftId: string): Promise<boolean> => ipcRenderer.invoke('audio:removeMapping', giftId),
  getAudioMappings: (): Promise<Record<string, GiftAudioMapping>> => ipcRenderer.invoke('audio:getMappings'),
  selectAudioFile: (): Promise<string | null> => ipcRenderer.invoke('audio:selectFile'),
  renameAudioFile: (id: string, newName: string): Promise<boolean> => ipcRenderer.invoke('audioLibrary:rename', id, newName),
  setAudioVolume: (id: string, volume: number): Promise<boolean> => ipcRenderer.invoke('audioLibrary:setVolume', id, volume),


  importAudioFile: (): Promise<any> => ipcRenderer.invoke('audioLibrary:import'),
  listAudioFiles: (): Promise<any[]> => ipcRenderer.invoke('audioLibrary:list'),
  deleteAudioFile: (filename: string): Promise<boolean> => ipcRenderer.invoke('audioLibrary:delete', filename),

  importMediaFile: (): Promise<any> => ipcRenderer.invoke('mediaLibrary:import'),
  listMediaFiles: (): Promise<any[]> => ipcRenderer.invoke('mediaLibrary:list'),
  deleteMediaFile: (filename: string): Promise<boolean> => ipcRenderer.invoke('mediaLibrary:delete', filename),
  selectMediaFile: (): Promise<string | null> => ipcRenderer.invoke('mediaLibrary:selectFile'),
  getMediaOverlayUrlForPath: (mediaPath: string): Promise<string | null> => ipcRenderer.invoke('mediaLibrary:getOverlayUrlForPath', mediaPath),

  getOverlayUrl: (): Promise<string> => ipcRenderer.invoke('overlay:getUrl'),
  getMediaAudioOverlayUrl: (): Promise<string> => ipcRenderer.invoke('overlay:getMediaAudioUrl'),
  getLeaderboardOverlayUrl: (): Promise<string> => ipcRenderer.invoke('overlay:getLeaderboardUrl'),
  getTimerOverlayUrl: (): Promise<string> => ipcRenderer.invoke('overlay:getTimerUrl'),
  getOverlayConnectedCount: (): Promise<number> => ipcRenderer.invoke('overlay:getConnectedCount'),
  getOverlayQueueSize: (): Promise<number> => ipcRenderer.invoke('overlay:getQueueSize'),
  getOverlayQueueProgress: (): Promise<{ current: number; total: number; remaining: number; estimatedSeconds: number }> => ipcRenderer.invoke('overlay:getQueueProgress'),
  clearOverlayQueue: (): Promise<boolean> => ipcRenderer.invoke('overlay:clearQueue'),


  triggerTestGift: (giftName: string): Promise<boolean> => ipcRenderer.invoke('test:triggerGift', giftName),

  getLeaderboard: (): Promise<LeaderboardData> => ipcRenderer.invoke('leaderboard:get'),
  getGiftLeaderboard: (): Promise<LeaderboardEntry[]> => ipcRenderer.invoke('leaderboard:getGift'),
  getLikeLeaderboard: (): Promise<LeaderboardEntry[]> => ipcRenderer.invoke('leaderboard:getLike'),
  getMonthlyHistory: (): Promise<MonthlyHistory[]> => ipcRenderer.invoke('leaderboard:getMonthlyHistory'),
  resetLeaderboard: (): Promise<boolean> => ipcRenderer.invoke('leaderboard:reset'),


  on: (channel: string, callback: (...args: any[]) => void) => {
    const validChannels = [
      'tiktok:status',
      'tiktok:connected',
      'tiktok:disconnected',
      'tiktok:error',
      'tiktok:gift',
      'tiktok:like',
      'tiktok:chat',
      'tiktok:member',
      'tiktok:roomStats',
      'audio:played',
      'main-process-ready',
    ];
    if (validChannels.includes(channel)) {
      const subscription = (_event: any, ...args: any[]) => callback(...args);
      listenersMap.set(callback, subscription);
      ipcRenderer.on(channel, subscription);
    }
  },
  off: (channel: string, callback: (...args: any[]) => void) => {
    const subscription = listenersMap.get(callback);
    if (subscription) {
      ipcRenderer.removeListener(channel, subscription as any);
      listenersMap.delete(callback);
    }
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);


declare global {
  interface Window {
    electronAPI: typeof electronAPI & {
      renameAudioFile: (id: string, newName: string) => Promise<boolean>;
      getGiftLeaderboard: () => Promise<LeaderboardEntry[]>;
      getLikeLeaderboard: () => Promise<LeaderboardEntry[]>;
      importMediaFile: () => Promise<any>;
      listMediaFiles: () => Promise<any[]>;
      deleteMediaFile: (filename: string) => Promise<boolean>;
      selectMediaFile: () => Promise<string | null>;
      getMediaOverlayUrlForPath: (mediaPath: string) => Promise<string | null>;
      getMediaAudioOverlayUrl: () => Promise<string>;
      getLeaderboardOverlayUrl: () => Promise<string>;
    };
  }
}
