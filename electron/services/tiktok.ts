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

  async connect(username: string): Promise<RoomInfo> {
    if (this.connection) {
      await this.disconnect();
    }

    this.status = 'connecting';
    this.currentUsername = username;
    this.emit('status', this.status);

    try {
      const options: any = {
        enableExtendedGiftInfo: true,
      };

      this.connection = new TikTokLiveConnection(username, options);

      
      this.connection.on(ControlEvent.CONNECTED, (state) => {
        this.status = 'connected';
        this.emit('status', this.status);
        this.emit('connected', {
          roomId: state?.roomId?.toString() || '',
          title: state?.roomInfo?.title || '',
          viewerCount: state?.roomInfo?.stats?.total_user || state?.roomInfo?.user_count || 0,
          nickname: state?.roomInfo?.owner?.nickname || this.currentUsername,
          profilePictureUrl: state?.roomInfo?.owner?.avatar_thumb?.url_list?.[0] || '',
        });
      });

      this.connection.on(ControlEvent.DISCONNECTED, () => {
        this.status = 'disconnected';
        this.emit('status', this.status);
        this.emit('disconnected');
      });

      this.connection.on(ControlEvent.ERROR, (error) => {
        console.error('TikTok connection error:', error);
        
        this.emit('error', 'Connection failed. Please check username and try again.');
      });

      
      this.connection.on(WebcastEvent.GIFT, (rawData) => {
        const data = rawData as any;
        
        
        const user = data.user || {};
        
        
        const imageUrl = data.image?.urlList?.[0] || data.giftPictureUrl || '';
        
        const userId = user.userId?.toString() || '';
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

      
      this.connection.on(WebcastEvent.CHAT, (rawData) => {
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

      
      this.connection.on(WebcastEvent.MEMBER, (rawData) => {
        const data = rawData as any;
        const user = data.user || {};
        const memberEvent: MemberEvent = {
          userId: user.userId?.toString() || '',
          username: user.uniqueId || '',
          nickname: user.nickname || user.uniqueId || '',
        };
        this.emit('member', memberEvent);
      });

      
      this.connection.on(WebcastEvent.ROOM_USER, (rawData) => {
        const data = rawData as any;
        
        this.emit('roomStats', {
          viewerCount: data.viewerCount || data.viewer_count || data.total_user || 0,
        });
      });

      
      const state = await this.connection.connect();
      this.status = 'connected';
      this.emit('status', this.status);
      
      return {
        roomId: state?.roomId?.toString() || '',
        title: state?.roomInfo?.title || '',
        viewerCount: state?.roomInfo?.stats?.total_user || state?.roomInfo?.user_count || 0,
        nickname: state?.roomInfo?.owner?.nickname || this.currentUsername,
        profilePictureUrl: state?.roomInfo?.owner?.avatar_thumb?.url_list?.[0] || '',
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
