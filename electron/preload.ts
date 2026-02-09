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
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';


const electronAPI = {
  
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),

  setGlobalVolume: (volume: number): Promise<boolean> => ipcRenderer.invoke('settings:setGlobalVolume', volume),
  setGiftSortOrder: (order: 'asc' | 'desc' | 'none'): Promise<boolean> => ipcRenderer.invoke('settings:setGiftSortOrder', order),

  
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

  
  getOverlayUrl: (): Promise<string> => ipcRenderer.invoke('overlay:getUrl'),
  getOverlayConnectedCount: (): Promise<number> => ipcRenderer.invoke('overlay:getConnectedCount'),
  getOverlayQueueSize: (): Promise<number> => ipcRenderer.invoke('overlay:getQueueSize'),
  getOverlayQueueProgress: (): Promise<{ current: number; total: number; remaining: number; estimatedSeconds: number }> => ipcRenderer.invoke('overlay:getQueueProgress'),
  clearOverlayQueue: (): Promise<boolean> => ipcRenderer.invoke('overlay:clearQueue'),

  
  triggerTestGift: (giftName: string): Promise<boolean> => ipcRenderer.invoke('test:triggerGift', giftName),

  
  on: (channel: string, callback: (...args: any[]) => void) => {
    const validChannels = [
      'tiktok:status',
      'tiktok:connected',
      'tiktok:disconnected',
      'tiktok:error',
      'tiktok:gift',
      'tiktok:chat',
      'tiktok:member',
      'tiktok:roomStats',
      'audio:played',
      'main-process-ready',
    ];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },
  off: (channel: string, callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener(channel, callback);
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);


declare global {
  interface Window {
    electronAPI: typeof electronAPI & {
      renameAudioFile: (id: string, newName: string) => Promise<boolean>;
    };
  }
}
