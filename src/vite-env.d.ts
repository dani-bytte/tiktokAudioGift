

/// <reference types="vite/client" />

declare module '*.css';


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
  overlayShowLeaderboard?: boolean;
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface ElectronAPI {

  getSettings: () => Promise<AppSettings>;
  setApiKey: (key: string) => Promise<boolean>;
  setGlobalVolume: (volume: number) => Promise<boolean>;
  setTimerEnabled: (enabled: boolean) => Promise<boolean>;
  setTimerInitialValue: (value: number) => Promise<boolean>;
  setTimerSecondsPerCoin: (seconds: number) => Promise<boolean>;
  setOverlayShowLeaderboard: (enabled: boolean) => Promise<boolean>;

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
  getTimerOverlayUrl: () => Promise<string>;
  getOverlayConnectedCount: () => Promise<number>;


  triggerTestGift: (giftName: string) => Promise<boolean>;

  getLeaderboard: () => Promise<{ gifters: LeaderboardEntry[]; likers: LeaderboardEntry[]; totalLikesLive: number }>;
  getMonthlyHistory: () => Promise<MonthlyHistory[]>;
  resetLeaderboard: () => Promise<boolean>;


  on: (channel: string, callback: (...args: any[]) => void) => void;
  off: (channel: string, callback: (...args: any[]) => void) => void;
}

interface LeaderboardEntry {
  userId: string;
  username: string;
  nickname: string;
  score: number;
  count: number;
}

interface MonthlyHistory {
  month: string;
  topGiftSenders: LeaderboardEntry[];
  topLikers: LeaderboardEntry[];
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
