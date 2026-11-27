/**
 * Єдине джерело правди про платформи. Імпортується і функціями, і фронтендом
 * (через alias `@platforms` у web/vite.config.ts).
 *
 * `enabled: false` → платформа показується в кабінеті як «Скоро».
 * Вмикайте платформу лише після схвалення застосунку відповідною платформою.
 *
 * Тут НЕМАЄ жодних секретів — лише публічні налаштування.
 */

export type PlatformId =
  | 'youtube'
  | 'facebook'
  | 'instagram'
  | 'threads'
  | 'tiktok'
  | 'telegram';

/** Провайдер OAuth (одна авторизація може дати кілька платформ, напр. Meta → FB + IG). */
export type ProviderId = 'google' | 'meta' | 'threads' | 'tiktok';

export type ConnectKind = 'oauth' | 'telegram';

export interface PlatformConfig {
  id: PlatformId;
  name: string;
  provider: ProviderId | null;
  connectKind: ConnectKind;
  /** Головний прапорець. false → «Скоро». */
  enabled: boolean;
  /** Мінімальні права (лише читання). */
  scopes: string[];
  /** Скільки днів історії платформа віддає заднім числом. */
  historyDays: number;
  /** Колір бренду для графіків. */
  color: string;
  /** Посилання на сторінку, де користувач може відкликати доступ на боці платформи. */
  revokeUrl?: string;
}

export const PLATFORMS: Record<PlatformId, PlatformConfig> = {
  youtube: {
    id: 'youtube',
    name: 'YouTube',
    provider: 'google',
    connectKind: 'oauth',
    enabled: true,
    scopes: [
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/yt-analytics.readonly',
    ],
    historyDays: 90,
    color: '#ff0033',
    revokeUrl: 'https://myaccount.google.com/permissions',
  },
  facebook: {
    id: 'facebook',
    name: 'Facebook',
    provider: 'meta',
    connectKind: 'oauth',
    enabled: true,
    scopes: ['pages_show_list', 'pages_read_engagement', 'read_insights'],
    historyDays: 90,
    color: '#1877f2',
    revokeUrl: 'https://www.facebook.com/settings?tab=business_tools',
  },
  instagram: {
    id: 'instagram',
    name: 'Instagram',
    provider: 'meta',
    connectKind: 'oauth',
    enabled: true,
    scopes: ['instagram_basic', 'instagram_manage_insights', 'pages_show_list'],
    historyDays: 30,
    color: '#e1306c',
    revokeUrl: 'https://www.facebook.com/settings?tab=business_tools',
  },
  threads: {
    id: 'threads',
    name: 'Threads',
    provider: 'threads',
    connectKind: 'oauth',
    enabled: true,
    scopes: ['threads_basic', 'threads_manage_insights'],
    historyDays: 90,
    color: '#7c3aed',
    revokeUrl: 'https://www.threads.net/settings/account',
  },
  tiktok: {
    id: 'tiktok',
    name: 'TikTok',
    provider: 'tiktok',
    connectKind: 'oauth',
    enabled: true,
    scopes: ['user.info.basic', 'user.info.profile', 'user.info.stats', 'video.list'],
    historyDays: 0,
    color: '#00c2b8',
    revokeUrl: 'https://www.tiktok.com/setting/security',
  },
  telegram: {
    id: 'telegram',
    name: 'Telegram',
    provider: null,
    connectKind: 'telegram',
    enabled: true,
    scopes: [],
    historyDays: 0,
    color: '#229ed9',
  },
};

export const PLATFORM_ORDER: PlatformId[] = [
  'youtube',
  'facebook',
  'instagram',
  'threads',
  'tiktok',
  'telegram',
];

/** Які платформи відкриває провайдер OAuth. */
export const PROVIDER_PLATFORMS: Record<ProviderId, PlatformId[]> = {
  google: ['youtube'],
  meta: ['facebook', 'instagram'],
  threads: ['threads'],
  tiktok: ['tiktok'],
};

/** TikTok: 'sandbox' поки застосунок не пройшов перевірку, потім 'production'. */
export const TIKTOK_ENV: 'sandbox' | 'production' = 'sandbox';

/** Мінімальний інтервал між ручними оновленнями «Оновити зараз». */
export const MANUAL_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

/** Нагадування «підключіть знову» за стільки днів до закінчення доступу. */
export const RECONNECT_REMINDER_DAYS = 7;

/** Threads: продовжувати довгостроковий токен, коли лишилось менше днів. */
export const THREADS_RENEW_BEFORE_DAYS = 20;

/**
 * Дані, які не вдалося оновити стільки днів (доступ відкликано тощо), видаляються автоматично.
 * Вимога YouTube API Services Developer Policies; застосовується до всіх платформ (обіцяно в Privacy Policy).
 */
export const STALE_DATA_DAYS = 30;

/** Строк видалення даних, обіцяний у політиці. */
export const DELETION_SLA_DAYS = 7;

export function providerForPlatform(id: PlatformId): ProviderId | null {
  return PLATFORMS[id].provider;
}

export function isPlatformId(v: unknown): v is PlatformId {
  return typeof v === 'string' && v in PLATFORMS;
}

export function isProviderId(v: unknown): v is ProviderId {
  return typeof v === 'string' && v in PROVIDER_PLATFORMS;
}

/** Спільні типи даних, які бачить і сервер, і клієнт. */
export type ConnectionStatus = 'active' | 'needs_reconnect' | 'disconnected' | 'error';

export interface ConnectionDoc {
  platform: PlatformId;
  provider: ProviderId | null;
  externalId: string;
  accountName: string;
  accountUrl?: string;
  avatarUrl?: string;
  status: ConnectionStatus;
  scopes: string[];
  connectedAt: number;
  lastSyncAt: number | null;
  lastManualRefreshAt?: number | null;
  lastError: string | null;
  expiresAt: number | null;
  source?: 'oauth' | 'telegram';
}

export interface DailyDoc {
  connectionId: string;
  platform: PlatformId;
  date: string; // YYYY-MM-DD (Europe/Kyiv)
  followers?: number;
  newFollowers?: number;
  views?: number;
  reach?: number;
  impressions?: number;
  interactions?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  watchMinutes?: number;
  breakdown?: Partial<Record<'organic' | 'paid' | 'shorts' | 'long' | 'reels' | 'posts' | 'stories', number>>;
}

export interface ContentDoc {
  connectionId: string;
  platform: PlatformId;
  postId: string;
  title: string;
  url: string;
  thumbnailUrl?: string;
  publishedAt: number;
  kind?: string;
  views?: number;
  reach?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  interactions?: number;
}
