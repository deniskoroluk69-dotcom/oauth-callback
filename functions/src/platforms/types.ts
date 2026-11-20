import type { ConnectionDoc, ContentDoc, DailyDoc, PlatformId, ProviderId } from '../config/platforms';
import type { TokenSet } from '../lib/tokenStore';

export interface DiscoveredAccount {
  platform: PlatformId;
  externalId: string;
  name: string;
  subtitle?: string;
  url?: string;
  avatarUrl?: string;
  /** Токени саме для цього акаунта (напр. токен Сторінки Facebook). */
  tokens: TokenSet;
  /** Коли закінчується доступ до даних (Meta data_access_expires_at). */
  expiresAt?: number | null;
}

export interface ExchangeResult {
  tokens: TokenSet;
  providerUserId?: string;
  scopes: string[];
}

export interface OAuthProvider {
  id: ProviderId;
  usePkce: boolean;
  authorizeUrl(a: { state: string; redirectUri: string; codeChallenge?: string; lang: 'uk' | 'en' }): string;
  exchange(a: { code: string; redirectUri: string; codeVerifier?: string }): Promise<ExchangeResult>;
  accounts(ex: ExchangeResult): Promise<DiscoveredAccount[]>;
  /** Чи треба оновити токен перед збором. */
  needsRefresh?(t: TokenSet, now: number): boolean;
  refresh?(t: TokenSet): Promise<TokenSet>;
  revoke?(t: TokenSet): Promise<void>;
}

export type DailyRow = Omit<DailyDoc, 'connectionId' | 'platform'>;
export type ContentRow = Omit<ContentDoc, 'connectionId' | 'platform'>;

export interface CollectCtx {
  connection: ConnectionDoc & { id: string; snapshot?: Record<string, number | string> };
  tokens: TokenSet | null;
  from: string;
  to: string;
}

export interface CollectResult {
  daily: DailyRow[];
  content: ContentRow[];
  /** Знімок накопичувальних лічильників (TikTok, Telegram) для обчислення приросту завтра. */
  snapshot?: Record<string, number | string>;
  accountName?: string;
}

export type Collector = (ctx: CollectCtx) => Promise<CollectResult>;
