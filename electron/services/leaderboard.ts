import { storageService } from "./storage";

export interface LeaderboardEntry {
  userId: string;
  username: string;
  nickname: string;
  score: number; // diamonds for gifts, likeCount for likes
  count: number; // number of gifts or like events
}

export interface LeaderboardData {
  entries: LeaderboardEntry[];
  updatedAt: number;
}

export interface MonthlyHistory {
  month: string; // "YYYY-MM"
  topGiftSenders: LeaderboardEntry[]; // top 3
  topLikers: LeaderboardEntry[]; // top 3
}

class LeaderboardService {
  private giftLeaderboard: Map<string, LeaderboardEntry> = new Map();
  private likeLeaderboard: Map<string, LeaderboardEntry> = new Map();
  private sessionStartTime: number = Date.now();
  private totalLikesLive: number = 0;
  private lastGiftSnapshot: number = 0;
  private lastLikeSnapshot: number = 0;
  private readonly SNAPSHOT_INTERVAL_MS = 3000;

  constructor() {
    this.sessionStartTime = Date.now();
    this.loadFromStorage();
  }

  /** Load persisted leaderboard from disk on startup */
  private loadFromStorage(): void {
    try {
      const gifts = storageService.getGiftLeaderboard();
      for (const [userId, entry] of Object.entries(gifts)) {
        this.giftLeaderboard.set(userId, {
          userId,
          username: entry.username || '',
          nickname: entry.nickname || '',
          score: (entry as any).diamondCount ?? (entry as any).score ?? 0,
          count: (entry as any).giftCount ?? (entry as any).count ?? 0,
        });
      }

      const likes = storageService.getLikeLeaderboard();
      for (const [userId, entry] of Object.entries(likes)) {
        this.likeLeaderboard.set(userId, {
          userId,
          username: entry.username || '',
          nickname: entry.nickname || '',
          score: (entry as any).likeCount ?? (entry as any).score ?? 0,
          count: (entry as any).count ?? 1,
        });
      }

      if (this.giftLeaderboard.size > 0 || this.likeLeaderboard.size > 0) {
        console.log(
          `[Leaderboard] Loaded persisted: ${this.giftLeaderboard.size} gifters, ${this.likeLeaderboard.size} likers`,
        );
      }
    } catch (e) {
      console.warn('[Leaderboard] Failed to load persisted data:', e);
    }
  }

  /** Persist current state to disk (throttled) */
  private persist(): void {
    try {
      const giftObj: Record<string, { nickname: string; username: string; giftCount: number; diamondCount: number }> = {};
      for (const [k, v] of this.giftLeaderboard) {
        giftObj[k] = {
          nickname: v.nickname,
          username: v.username,
          giftCount: v.count,
          diamondCount: v.score,
        };
      }

      const likeObj: Record<string, { nickname: string; username: string; likeCount: number }> = {};
      for (const [k, v] of this.likeLeaderboard) {
        likeObj[k] = {
          nickname: v.nickname,
          username: v.username,
          likeCount: v.score,
        };
      }

      storageService.saveGiftLeaderboard(giftObj);
      storageService.saveLikeLeaderboard(likeObj);
    } catch (e) {
      console.warn('[Leaderboard] Failed to persist:', e);
    }
  }

  /** Reset both leaderboards for a new live session */
  resetSession(): void {
    // Save current session top 3 to monthly history before resetting
    this.saveMonthlyHistory();
    this.giftLeaderboard.clear();
    this.likeLeaderboard.clear();
    this.totalLikesLive = 0;
    this.sessionStartTime = Date.now();
    this.lastGiftSnapshot = 0;
    this.lastLikeSnapshot = 0;
    storageService.clearSessionLeaderboards();
    console.log("[Leaderboard] Session reset");
  }

  /** Called when a new TikTok connection starts */
  onSessionStart(): void {
    this.resetSession();
  }

  /** Add or update a gift sender */
  addGift(
    userId: string,
    username: string,
    nickname: string,
    diamondCount: number,
    giftCount: number,
  ): void {
    if (!userId) return;

    const safeUsername = (username || nickname || '').trim();
    const points = Math.max(0, diamondCount) * Math.max(1, giftCount);
    const existing = this.giftLeaderboard.get(userId);
    if (existing) {
      existing.score += points;
      existing.count += giftCount;
      existing.nickname = nickname || existing.nickname;
      existing.username = safeUsername || existing.username;
    } else {
      this.giftLeaderboard.set(userId, {
        userId,
        username: safeUsername,
        nickname,
        score: points,
        count: giftCount,
      });
    }

    const now = Date.now();
    if (now - this.lastGiftSnapshot > this.SNAPSHOT_INTERVAL_MS) {
      this.lastGiftSnapshot = now;
      this.persist();
    }
  }

  /** Add or update a like sender */
  addLike(
    userId: string,
    username: string,
    nickname: string,
    likeCount: number,
    totalLikeCount?: number,
  ): void {
    if (!userId) return;

    const safeUsername = (username || nickname || '').trim();
    const existing = this.likeLeaderboard.get(userId);
    if (existing) {
      existing.score += likeCount;
      existing.count += 1;
      existing.nickname = nickname || existing.nickname;
      existing.username = safeUsername || existing.username;
    } else {
      this.likeLeaderboard.set(userId, {
        userId,
        username: safeUsername,
        nickname,
        score: likeCount,
        count: 1,
      });
    }

    if (typeof totalLikeCount === "number" && Number.isFinite(totalLikeCount)) {
      this.totalLikesLive = Math.max(this.totalLikesLive, Math.max(0, totalLikeCount));
    }

    const now = Date.now();
    if (now - this.lastLikeSnapshot > this.SNAPSHOT_INTERVAL_MS) {
      this.lastLikeSnapshot = now;
      this.persist();
    }
  }

  /** Get top N gift senders */
  getTopGiftSenders(n: number = 10): LeaderboardEntry[] {
    return Array.from(this.giftLeaderboard.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, n);
  }

  /** Get top N likers */
  getTopLikers(n: number = 10): LeaderboardEntry[] {
    return Array.from(this.likeLeaderboard.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, n);
  }

  /** Get full leaderboard data for the app */
  getFullData(): {
    gifters: LeaderboardEntry[];
    likers: LeaderboardEntry[];
    totalLikesLive: number;
  } {
    return {
      gifters: this.getTopGiftSenders(50),
      likers: this.getTopLikers(50),
      totalLikesLive: this.totalLikesLive,
    };
  }

  /** Get compact data for overlay (top 3) */
  getOverlayData(): {
    gifters: LeaderboardEntry[];
    likers: LeaderboardEntry[];
    totalLikesLive: number;
  } {
    return {
      gifters: this.getTopGiftSenders(3),
      likers: this.getTopLikers(3),
      totalLikesLive: this.totalLikesLive,
    };
  }

  /** Save top 3 to monthly history */
  private saveMonthlyHistory(): void {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const topGiftSenders = this.getTopGiftSenders(3);
    const topLikers = this.getTopLikers(3);

    if (topGiftSenders.length === 0 && topLikers.length === 0) return;

    const history: MonthlyHistory = {
      month,
      topGiftSenders,
      topLikers,
    };

    storageService.addMonthlyHistory(history);
    console.log(
      `[Leaderboard] Saved monthly history for ${month}`,
    );
  }

  /** Get monthly history from storage */
  getMonthlyHistory(): MonthlyHistory[] {
    return storageService.getMonthlyHistory();
  }

  /** Get session start time */
  getSessionStartTime(): number {
    return this.sessionStartTime;
  }
}

export const leaderboardService = new LeaderboardService();
