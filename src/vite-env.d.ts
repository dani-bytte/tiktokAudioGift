


interface GiftAudioMapping {
  giftId: string;
  giftName: string;
  audioPath: string;
  volume: number;
  enabled: boolean;
  customTimerAmount?: number;
}

interface AppSettings {
  lastUsername: string;
  giftAudioMappings: Record<string, GiftAudioMapping>;
  overlayPort: number;
  showGiftAnimation: boolean;
  globalVolume: number;
  signApiKey: string;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface ElectronAPI {

  getSettings: () => Promise<AppSettings>;
  setApiKey: (key: string) => Promise<boolean>;
  setGlobalVolume: (volume: number) => Promise<boolean>;
  setTimerEnabled: (enabled: boolean) => Promise<boolean>;
  setTimerInitialValue: (value: number) => Promise<boolean>;
  setTimerSecondsPerCoin: (seconds: number) => Promise<boolean>;

  toggleTimerPause: () => Promise<boolean>;
  stopTimer: () => Promise<boolean>;


  connect: (username: string) => Promise<any>;
  disconnect: () => Promise<boolean>;
  getStatus: () => Promise<ConnectionStatus>;
  fetchGifts: () => Promise<any[]>;


  setAudioMapping: (mapping: GiftAudioMapping) => Promise<boolean>;
  removeAudioMapping: (giftId: string) => Promise<boolean>;
  getAudioMappings: () => Promise<Record<string, GiftAudioMapping>>;
  selectAudioFile: () => Promise<string | null>;


  getOverlayUrl: () => Promise<string>;
  getOverlayConnectedCount: () => Promise<number>;


  triggerTestGift: (giftName: string) => Promise<boolean>;


  on: (channel: string, callback: (...args: any[]) => void) => void;
  off: (channel: string, callback: (...args: any[]) => void) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
