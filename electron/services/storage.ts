import Store from 'electron-store';

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

export interface CachedGift {
  id: number;
  name: string;
  diamondCount: number;
  imageUrl: string;
}

export interface AppSettings {
  lastUsername: string;
  giftAudioMappings: Record<string, GiftAudioMapping>;
  overlayPort: number;
  showGiftAnimation: boolean;
  globalVolume: number;
  cachedGifts: CachedGift[];
  giftSortOrder: 'asc' | 'desc' | 'none';
  audioFileNames: Record<string, string>; 
  audioFileVolumes: Record<string, number>; 
}

const defaultSettings: AppSettings = {
  lastUsername: '',
  giftAudioMappings: {},
  overlayPort: 3847,
  showGiftAnimation: true,
  globalVolume: 1.0,
  cachedGifts: [],
  giftSortOrder: 'none',
  audioFileNames: {},
  audioFileVolumes: {},
};

class StorageService {
  private store: Store<AppSettings>;

  constructor() {
    this.store = new Store<AppSettings>({
      name: 'tiktok-audio-gift-settings',
      defaults: defaultSettings,
    });
  }

  getSettings(): AppSettings {
    const settings = {
        lastUsername: this.store.get('lastUsername', ''),
        giftAudioMappings: this.store.get('giftAudioMappings', {}),
        overlayPort: this.store.get('overlayPort', 3847),
        showGiftAnimation: this.store.get('showGiftAnimation', true),
        globalVolume: this.store.get('globalVolume', 1.0),
        cachedGifts: this.store.get('cachedGifts', []),
        giftSortOrder: this.store.get('giftSortOrder', 'none'),
        audioFileNames: this.store.get('audioFileNames', {}),
        audioFileVolumes: this.store.get('audioFileVolumes', {}),
    };

    
    for (const key in settings.giftAudioMappings) {
        const mapping = settings.giftAudioMappings[key] as any;
        if (!mapping.audioFiles) {
            
            mapping.audioFiles = mapping.audioPath 
                ? [{ path: mapping.audioPath, volume: mapping.volume || 1.0 }] 
                : [];
        } else if (mapping.audioFiles.length > 0 && typeof mapping.audioFiles[0] === 'string') {
            
            const oldVolume = mapping.volume || 1.0;
            mapping.audioFiles = (mapping.audioFiles as string[]).map((path: string) => ({ 
                path, 
                volume: oldVolume 
            }));
        }
    }

    return settings;
  }

  setAudioName(id: string, name: string): void {
    const names = this.store.get('audioFileNames', {});
    names[id] = name;
    this.store.set('audioFileNames', names);
  }

  getAudioName(id: string): string | undefined {
    const names = this.store.get('audioFileNames', {});
    return names[id];
  }

  setAudioVolume(id: string, volume: number): void {
    const volumes = this.store.get('audioFileVolumes', {});
    volumes[id] = Math.max(0, Math.min(1, volume)); 
    this.store.set('audioFileVolumes', volumes);
  }

  getAudioVolume(id: string): number {
    const volumes = this.store.get('audioFileVolumes', {});
    return volumes[id] ?? 1.0; 
  }

  setLastUsername(username: string): void {
    this.store.set('lastUsername', username);
  }



  setOverlayPort(port: number): void {
    this.store.set('overlayPort', port);
  }

  setGlobalVolume(volume: number): void {
    this.store.set('globalVolume', volume);
  }

  setGiftSortOrder(order: 'asc' | 'desc' | 'none'): void {
    this.store.set('giftSortOrder', order);
  }

  setGiftAudio(mapping: GiftAudioMapping): void {
    const mappings = this.store.get('giftAudioMappings', {});
    mappings[mapping.giftId] = mapping;
    this.store.set('giftAudioMappings', mappings);
  }

  removeGiftAudio(giftId: string): void {
    const mappings = this.store.get('giftAudioMappings', {});
    delete mappings[giftId];
    this.store.set('giftAudioMappings', mappings);
  }

  removeAudioFromMappings(audioPath: string): void {
    const mappings = this.store.get('giftAudioMappings', {});
    let hasChanges = false;

    for (const key in mappings) {
      const mapping = mappings[key] as any;
      if (mapping.audioFiles && Array.isArray(mapping.audioFiles)) {
        const originalLength = mapping.audioFiles.length;
        mapping.audioFiles = mapping.audioFiles.filter((file: any) => {
          if (typeof file === 'string') return file !== audioPath;
          return file.path !== audioPath;
        });

        if (mapping.audioFiles.length !== originalLength) {
          hasChanges = true;
          // If no files left, maybe we should remove the mapping or leave it empty?
          // Leaving it empty for now so user can add new files
        }
      }
    }

    if (hasChanges) {
      this.store.set('giftAudioMappings', mappings);
    }
  }

  getGiftAudio(giftId: string): GiftAudioMapping | undefined {
    const mappings = this.store.get('giftAudioMappings', {});
    return mappings[giftId];
  }

  getAllGiftMappings(): Record<string, GiftAudioMapping> {
    return this.store.get('giftAudioMappings', {});
  }

  
  setCachedGifts(gifts: CachedGift[]): void {
    this.store.set('cachedGifts', gifts);
  }

  getCachedGifts(): CachedGift[] {
    return this.store.get('cachedGifts', []);
  }

  getGiftName(giftId: string): string | undefined {
    const gifts = this.getCachedGifts();
    const gift = gifts.find(g => g.id.toString() === giftId);
    return gift?.name;
  }

  // Audio duration storage
  setAudioDuration(audioId: string, duration: number): void {
    const durations = this.store.get('audioFileDurations', {} as Record<string, number>);
    durations[audioId] = duration;
    this.store.set('audioFileDurations', durations);
  }

  getAudioDuration(audioId: string): number | undefined {
    const durations = this.store.get('audioFileDurations', {} as Record<string, number>);
    return durations[audioId];
  }
}

export const storageService = new StorageService();
