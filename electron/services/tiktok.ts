import { TikTokLiveConnection, ControlEvent, WebcastEvent } from 'tiktok-live-connector';
import { EventEmitter } from 'events';

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

export interface LikeEvent {
  userId: string;
  username: string;
  nickname: string;
  likeCount: number;
  totalLikeCount?: number;
}

export interface RoomInfo {
  roomId: string;
  title: string;
  viewerCount: number;
  nickname: string;
  profilePictureUrl: string;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

class TikTokService extends EventEmitter {
  private connection: TikTokLiveConnection | null = null;
  private status: ConnectionStatus = 'disconnected';
  private currentUsername: string = '';
  
  private recentGifts: Map<string, number> = new Map();
  private readonly DEDUP_WINDOW_MS = 5000; 
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    
    this.cleanupInterval = setInterval(() => {
        const now = Date.now();
        for (const [k, timestamp] of this.recentGifts.entries()) {
            if (now - timestamp > this.DEDUP_WINDOW_MS + 1000) {
                this.recentGifts.delete(k);
            }
        }
    }, 60000);
    
    
    this.cleanupInterval.unref();
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  getCurrentUsername(): string {
    return this.currentUsername;
  }

  private isDuplicateGift(userId: string, giftId: string, repeatCount: number): boolean {
    const key = `${userId}-${giftId}-${repeatCount}`;
    const now = Date.now();
    const lastSeen = this.recentGifts.get(key);
    
    
    if (lastSeen && now - lastSeen < this.DEDUP_WINDOW_MS) {
      return true; 
    }
    
    this.recentGifts.set(key, now);
    return false;
  }

  private normalizeUsername(input: string): string {
    const trimmed = input.trim();
    const withoutQuery = trimmed.split('?')[0];
    const fromUrl = withoutQuery.match(/tiktok\.com\/@([^/]+)/i);
    const candidate = fromUrl?.[1] || withoutQuery;
    return candidate.replace(/^@/, '').trim();
  }

  private getProfilePictureUrl(owner: any): string {
    if (!owner) return '';

    const resolved = (
      owner?.avatarLarger?.urlList?.[0] ||
      owner?.avatarLarger?.url_list?.[0] ||
      owner?.avatar_larger?.url_list?.[0] ||
      owner?.avatarMedium?.urlList?.[0] ||
      owner?.avatarMedium?.url_list?.[0] ||
      owner?.avatar_medium?.url_list?.[0] ||
      owner?.avatarThumb?.urlList?.[0] ||
      owner?.avatarThumb?.url_list?.[0] ||
      owner?.avatar_thumb?.url_list?.[0] ||
      owner?.avatar?.urlList?.[0] ||
      owner?.avatar?.url_list?.[0] ||
      ''
    );

    return resolved;
  }

  private getRoomCoverUrl(roomInfo: any): string {
    const cover = this.getRoomInfoValue(roomInfo, 'cover');
    return (
      cover?.url_list?.[0] ||
      cover?.urlList?.[0] ||
      ''
    );
  }

  private getRoomInfoValue(roomInfo: any, key: string): any {
    if (!roomInfo) return undefined;
    if (roomInfo[key] !== undefined) return roomInfo[key];
    if (roomInfo?.data?.[key] !== undefined) return roomInfo.data[key];
    return undefined;
  }

  private async hydrateRoomInfoIfMissing(state: any): Promise<any> {
    const roomInfo = state?.roomInfo;
    const owner = this.getRoomInfoValue(roomInfo, 'owner');
    const hasOwner = Boolean(owner && Object.keys(owner).length > 0);

    if (hasOwner) return roomInfo;

    try {
      if (this.connection && typeof (this.connection as any).fetchRoomInfo === 'function') {
        const fetched = await (this.connection as any).fetchRoomInfo();
        if (fetched) {
          return fetched;
        }
      }
    } catch (e) {
      console.warn('[TikTok] fetchRoomInfo fallback failed:', e);
    }

    return roomInfo;
  }

  private bindConnectionEvents(connection: TikTokLiveConnection): void {
    connection.on(ControlEvent.CONNECTED, async (state) => {
      const roomInfo = await this.hydrateRoomInfoIfMissing(state);
      const owner = this.getRoomInfoValue(roomInfo, 'owner');
      const title = this.getRoomInfoValue(roomInfo, 'title') || '';
      const stats = this.getRoomInfoValue(roomInfo, 'stats') || {};
      const userCount = this.getRoomInfoValue(roomInfo, 'user_count');
      const profilePictureUrl = this.getProfilePictureUrl(owner) || this.getRoomCoverUrl(roomInfo);
      this.status = 'connected';
      this.emit('status', this.status);
      this.emit('connected', {
        roomId: state?.roomId?.toString() || '',
        title,
        viewerCount: stats?.total_user || userCount || 0,
        nickname: owner?.nickname || this.currentUsername,
        profilePictureUrl,
      });
    });

    connection.on(ControlEvent.DISCONNECTED, () => {
      this.status = 'disconnected';
      this.emit('status', this.status);
      this.emit('disconnected');
    });

    connection.on(ControlEvent.ERROR, (error) => {
      console.error('TikTok connection error:', error);
      this.emit('error', 'Connection failed. Please check username and try again.');
    });

    connection.on(WebcastEvent.GIFT, (rawData) => {
      const data = rawData as any;
      const user = data.user || {};
      const imageUrl = data.image?.urlList?.[0] || data.giftPictureUrl || '';
      const userId = user.userId?.toString() || user.id?.toString() || '';
      const giftId = data.giftId?.toString() || '';
      const repeatCount = data.repeatCount || 1;
      const isFinalGift = data.repeatEnd === undefined || data.repeatEnd === null || Boolean(data.repeatEnd);

      const giftEvent: GiftEvent = {
        userId,
        username: user.uniqueId || '',
        nickname: user.nickname || user.uniqueId || 'Anonymous',
        giftId,
        giftName: data.name || data.giftName || 'Gift',
        giftCount: repeatCount,
        diamondCount: data.diamondCount || 0,
        isComboEnd: isFinalGift,
        giftPictureUrl: imageUrl,
      };

      if (isFinalGift && !this.isDuplicateGift(userId, giftId, repeatCount)) {
        this.emit('giftFinal', giftEvent);
      }
    });

    connection.on(WebcastEvent.CHAT, (rawData) => {
      const data = rawData as any;
      const user = data.user || {};
      const chatEvent: ChatEvent = {
        userId: user.userId?.toString() || '',
        username: user.uniqueId || '',
        nickname: user.nickname || user.uniqueId || '',
        message: data.comment || '',
      };
      this.emit('chat', chatEvent);
    });

    connection.on(WebcastEvent.MEMBER, (rawData) => {
      const data = rawData as any;
      const user = data.user || {};
      const memberEvent: MemberEvent = {
        userId: user.userId?.toString() || '',
        username: user.uniqueId || '',
        nickname: user.nickname || user.uniqueId || '',
      };
      this.emit('member', memberEvent);
    });

    connection.on(WebcastEvent.ROOM_USER, (rawData) => {
      const data = rawData as any;
      this.emit('roomStats', {
        viewerCount: data.total || 0,
      });

      // Extract top gifters from ROOM_USER ranks
      if (data.ranks && Array.isArray(data.ranks)) {
        this.emit('roomTopGifters', data.ranks.slice(0, 50));
      }
    });

    connection.on(WebcastEvent.LIKE, (rawData) => {
      const data = rawData as any;
      const user = data.user || {};
      const likeEvent: LikeEvent = {
        userId: user.userId?.toString() || user.id?.toString() || '',
        username: user.uniqueId || '',
        nickname: user.nickname || user.uniqueId || 'Anonymous',
        likeCount: Number(data.count || 0),
        totalLikeCount: Number(data.total || 0),
      };

      if (likeEvent.likeCount > 0) {
        this.emit('like', likeEvent);
      }
    });
  }

  async connect(username: string): Promise<RoomInfo> {
    if (this.connection) {
      await this.disconnect();
    }

    this.status = 'connecting';
    const normalizedUsername = this.normalizeUsername(username);
    this.currentUsername = normalizedUsername;
    this.emit('status', this.status);

    try {
      const baseOptions: any = {
        enableExtendedGiftInfo: true,
        wsClientOptions: {
          handshakeTimeout: 10000,
        },
      };

      const attempts: Array<{ label: string; options: any }> = [
        {
          label: 'default-with-unique-id',
          options: {
            ...baseOptions,
            connectWithUniqueId: true,
          },
        },
        {
          label: 'scrape-roomid-no-unique-id',
          options: {
            ...baseOptions,
            connectWithUniqueId: false,
          },
        },
        {
          label: 'polling-friendly-fallback',
          options: {
            ...baseOptions,
            connectWithUniqueId: false,
            fetchRoomInfoOnConnect: false,
            processInitialData: false,
            requestPollingIntervalMs: 2000,
          },
        },
      ];

      let state: any = null;
      let lastError: any = null;

      for (const attempt of attempts) {
        try {
          console.log(`[TikTok] Connect attempt: ${attempt.label}`);
          this.connection = new TikTokLiveConnection(normalizedUsername, attempt.options);
          this.bindConnectionEvents(this.connection);
          state = await this.connection.connect();
          break;
        } catch (attemptError: any) {
          lastError = attemptError;
          const message = String(attemptError?.message || '');
          console.warn(`[TikTok] Attempt failed (${attempt.label}): ${message}`);

          if (!message.includes('Unexpected server response: 200')) {
            throw attemptError;
          }
        }
      }

      if (!state) {
        throw lastError || new Error('Failed to connect after all attempts');
      }

      this.status = 'connected';
      this.emit('status', this.status);
      
      const roomInfo = await this.hydrateRoomInfoIfMissing(state);
      const owner = this.getRoomInfoValue(roomInfo, 'owner');
      const title = this.getRoomInfoValue(roomInfo, 'title') || '';
      const stats = this.getRoomInfoValue(roomInfo, 'stats') || {};
      const userCount = this.getRoomInfoValue(roomInfo, 'user_count');
      const profilePictureUrl = this.getProfilePictureUrl(owner) || this.getRoomCoverUrl(roomInfo);

      return {
        roomId: state?.roomId?.toString() || '',
        title,
        viewerCount: stats?.total_user || userCount || 0,
        nickname: owner?.nickname || this.currentUsername,
        profilePictureUrl,
      };
    } catch (error: any) {
      console.error('Connection error:', error);
      this.status = 'error';
      this.emit('status', this.status);
      this.emit('error', error?.message || 'Failed to connect');
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      try {
        this.connection.disconnect();
      } catch (e) {
        
      }
      this.connection = null;
    }
    this.status = 'disconnected';
    this.currentUsername = '';
    this.emit('status', this.status);
    this.emit('disconnected');
  }

  async fetchAvailableGifts(): Promise<any[]> {
    if (!this.connection) {
      return [];
    }
    try {
      const gifts = await this.connection.fetchAvailableGifts();
      return gifts || [];
    } catch (e) {
      return [];
    }
  }
}

export const tiktokService = new TikTokService();
