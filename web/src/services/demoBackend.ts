/**
 * Демо-бекенд: повністю в браузері (localStorage), без мережі й без Firebase.
 * Імітує вхід, OAuth-підключення, вибір акаунтів, щоденний збір і видалення.
 * Дані згенеровані детерміновано — однакові при кожному перезавантаженні.
 */
import { PLATFORMS, type ContentDoc, type DailyDoc, type PlatformId } from '@platforms';
import { href } from '../router';
import type { Lang } from '../i18n';
import { addDays, dateRange, kyivToday } from '../lib/dates';
import { UserError, type AppUser, type Backend, type Connection, type PendingAccount, type Profile } from './types';

const KEY = 'knb-demo-v1';
const HISTORY_DAYS = 180;

interface DemoState {
  user: AppUser | null;
  profile: Profile;
  connections: Connection[];
  pending: Record<string, { platform: PlatformId; accounts: (PendingAccount & { url: string })[] }>;
  contacts: unknown[];
}

const fresh = (): DemoState => ({
  user: null,
  profile: { lang: 'uk', theme: 'system', notifyEmail: '' },
  connections: [],
  pending: {},
  contacts: [],
});

function load(): DemoState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fresh(), ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return fresh();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rid = () => Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8);

/** Детермінований хеш → [0,1). */
function h01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

interface Profile0 {
  followers: number;
  views: number;
  reachK?: number;
  interK: number;
  newK: number;
  watch?: number;
  bd?: Record<string, number>;
  noViews?: boolean;
}

const PROFILES: Record<PlatformId, Profile0> = {
  youtube: { followers: 38200, views: 5200, interK: 0.055, newK: 0.006, watch: 3.4, bd: { shorts: 0.58, long: 0.42 } },
  facebook: { followers: 12400, views: 4100, reachK: 0.72, interK: 0.045, newK: 0.0035, bd: { organic: 0.83, paid: 0.17 } },
  instagram: { followers: 21900, views: 9300, reachK: 0.64, interK: 0.068, newK: 0.0045, bd: { reels: 0.61, posts: 0.27, stories: 0.12 } },
  threads: { followers: 4100, views: 3600, interK: 0.08, newK: 0.006 },
  tiktok: { followers: 30500, views: 16800, interK: 0.09, newK: 0.0035 },
  linkedin: { followers: 2650, views: 1900, interK: 0.04, newK: 0.006, bd: { organic: 0.9, paid: 0.1 } },
  telegram: { followers: 7300, views: 0, interK: 0, newK: 0.004, noViews: true },
  podcast: { followers: 0, views: 0, interK: 0, newK: 0, noViews: true },
};

const cache = new Map<string, DailyDoc[]>();

function series(c: Connection): DailyDoc[] {
  const key = `${c.id}:${kyivToday()}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const P = PROFILES[c.platform];
  const end = addDays(kyivToday(), -1);
  const start = addDays(end, -(HISTORY_DAYS - 1));
  const scale = 0.6 + h01(c.externalId) * 0.9;
  let followers = Math.round(P.followers * scale * 0.86);
  const out: DailyDoc[] = [];
  dateRange(start, end).forEach((date, i) => {
    const n = h01(`${c.id}|${date}`);
    const n2 = h01(`${date}|${c.id}|2`);
    const week = 1 + 0.22 * Math.sin((2 * Math.PI * (i + h01(c.id) * 7)) / 7);
    const trend = 1 + i * 0.0035;
    const spike = n2 > 0.94 ? 2.2 + n2 : 1;
    const views = P.noViews ? 0 : Math.round(P.views * scale * week * trend * spike * (0.75 + n * 0.5));
    const newF = c.platform === 'podcast' ? 0 : Math.max(0, Math.round((views || P.followers * 0.01) * P.newK * (0.6 + n2 * 0.8) * (c.platform === 'telegram' ? 2.5 : 1)));
    followers += newF - Math.round(newF * 0.18 * n);
    if (c.platform === 'podcast') return;
    const row: DailyDoc = { connectionId: c.id, platform: c.platform, date, followers, newFollowers: newF };
    if (!P.noViews) {
      row.views = views;
      const interactions = Math.round(views * P.interK * (0.7 + n2 * 0.6));
      row.interactions = interactions;
      row.likes = Math.round(interactions * 0.78);
      row.comments = Math.round(interactions * 0.12);
      row.shares = interactions - row.likes - row.comments;
      if (P.reachK) row.reach = Math.round(views * P.reachK);
      if (P.watch) row.watchMinutes = Math.round(views * P.watch);
      if (P.bd) row.breakdown = Object.fromEntries(Object.entries(P.bd).map(([k, v]) => [k, Math.round(views * v * (0.9 + n * 0.2))]));
    }
    out.push(row);
  });
  cache.set(key, out);
  return out;
}

const TITLES: Record<string, string[]> = {
  uk: [
    'Як ми виросли на 10 000 підписників за місяць',
    'Огляд: 5 інструментів для бізнесу у 2026',
    'Відповіді на ваші питання — прямий ефір',
    'Кейс клієнта: +240% продажів',
    'Закулісся нашої команди',
    'Головні помилки підприємців-початківців',
    'Нетворкінг: як знайомитися правильно',
    'Чек-лист запуску продукту',
    'Інтерв\'ю з засновником KnB',
    'Тренди маркетингу цього сезону',
    'Як планувати контент на місяць',
    'Розбір воронки продажів',
  ],
};

function contentFor(c: Connection): ContentDoc[] {
  if (c.platform === 'telegram' || c.platform === 'linkedin') {
    // Telegram: пости без переглядів (перегляди — окремий етап); LinkedIn: з експорту лише денні дані.
    if (c.platform === 'linkedin') return [];
  }
  const titles = TITLES.uk;
  const out: ContentDoc[] = [];
  const now = Date.now();
  for (let i = 0; i < 28; i++) {
    const n = h01(`${c.id}|post|${i}`);
    const age = Math.floor(n * 170) + 1;
    const publishedAt = now - age * 86400000 - Math.floor(n * 36e6);
    const P = PROFILES[c.platform];
    const views = P.noViews ? undefined : Math.round(P.views * (2 + n * 14) * (h01(`${i}${c.id}`) > 0.85 ? 4 : 1));
    const likes = views ? Math.round(views * P.interK * 0.8) : undefined;
    const comments = views ? Math.round(views * P.interK * 0.12) : undefined;
    const shares = views ? Math.round(views * P.interK * 0.08) : undefined;
    const postId = `${c.externalId}-${i}`;
    const title =
      c.platform === 'podcast' ? `Епізод ${28 - i}: ${titles[i % titles.length]}` : `${titles[(i + Math.floor(n * 5)) % titles.length]}${c.platform === 'youtube' && n > 0.6 ? ' #shorts' : ''}`;
    out.push({
      connectionId: c.id,
      platform: c.platform,
      postId,
      title,
      url: postUrl(c, postId),
      publishedAt,
      views,
      likes,
      comments,
      shares,
      interactions: likes !== undefined ? likes + (comments ?? 0) + (shares ?? 0) : undefined,
    });
  }
  return out;
}

function postUrl(c: Connection, postId: string): string {
  switch (c.platform) {
    case 'youtube':
      return `https://www.youtube.com/watch?v=${encodeURIComponent(postId)}`;
    case 'facebook':
      return `https://www.facebook.com/${encodeURIComponent(c.externalId)}`;
    case 'instagram':
      return `https://www.instagram.com/${encodeURIComponent(c.accountName.replace('@', ''))}/`;
    case 'threads':
      return `https://www.threads.net/${encodeURIComponent(c.accountName)}`;
    case 'tiktok':
      return `https://www.tiktok.com/${encodeURIComponent(c.accountName)}`;
    case 'telegram':
      return `https://t.me/${encodeURIComponent(c.accountName.replace('@', ''))}`;
    default:
      return c.accountUrl ?? 'https://example.com';
  }
}

const DEMO_ACCOUNTS: Partial<Record<PlatformId, { id: string; name: string; subtitle?: string; url: string; platform: PlatformId }[]>> = {
  youtube: [
    { id: 'UC_knb_main', platform: 'youtube', name: 'KnB Бізнес-клуб', subtitle: 'youtube.com/@knb-club', url: 'https://www.youtube.com/' },
    { id: 'UC_knb_talks', platform: 'youtube', name: 'KnB Talks', subtitle: 'youtube.com/@knb-talks', url: 'https://www.youtube.com/' },
  ],
  facebook: [
    { id: 'fb_1001', platform: 'facebook', name: 'KnB Бізнес-клуб', subtitle: 'Facebook Page', url: 'https://www.facebook.com/' },
    { id: 'fb_1002', platform: 'facebook', name: 'KnB Events', subtitle: 'Facebook Page', url: 'https://www.facebook.com/' },
    { id: 'ig_2001', platform: 'instagram', name: '@knb.club', subtitle: 'Instagram Business · KnB Бізнес-клуб', url: 'https://www.instagram.com/' },
  ],
  threads: [{ id: 'th_3001', platform: 'threads', name: '@knb.club', url: 'https://www.threads.net/' }],
  tiktok: [{ id: 'tt_4001', platform: 'tiktok', name: '@knb.club', url: 'https://www.tiktok.com/' }],
};

export function createDemoBackend(): Backend {
  let state = load();
  const authCbs = new Set<(u: AppUser | null) => void>();
  const connCbs = new Set<(l: Connection[]) => void>();

  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  };
  const emitConns = () => connCbs.forEach((cb) => cb([...state.connections]));
  const emitAuth = () => authCbs.forEach((cb) => cb(state.user));
  const requireUser = () => {
    if (!state.user) throw new UserError('common.error');
    return state.user;
  };

  function upsert(platform: PlatformId, acc: { id: string; name: string; url?: string }, extra: Partial<Connection> = {}) {
    const p = PLATFORMS[platform];
    const existing = state.connections.find((c) => c.platform === platform && c.externalId === acc.id);
    const now = Date.now();
    const base: Connection = {
      id: existing?.id ?? `c_${rid()}`,
      platform,
      provider: p.provider,
      externalId: acc.id,
      accountName: acc.name,
      accountUrl: acc.url,
      status: 'active',
      scopes: p.scopes,
      connectedAt: existing?.connectedAt ?? now,
      lastSyncAt: now,
      lastManualRefreshAt: null,
      lastError: null,
      expiresAt: platform === 'facebook' || platform === 'instagram' ? now + 88 * 86400000 : platform === 'threads' ? now + 59 * 86400000 : null,
      source: p.connectKind === 'oauth' ? 'oauth' : p.connectKind,
      ...extra,
    };
    if (existing) Object.assign(existing, base);
    else state.connections.push(base);
  }

  const backend: Backend = {
    mode: 'demo',
    onAuth(cb) {
      authCbs.add(cb);
      setTimeout(() => cb(state.user), 0);
      return () => authCbs.delete(cb);
    },
    async signInWithGoogle() {
      await sleep(400);
      state.user = { uid: 'demo-uid', email: 'demo@example.com', displayName: 'Demo User', emailVerified: true, providerId: 'google.com' };
      save();
      emitAuth();
    },
    async signInWithEmail(email, password) {
      await sleep(300);
      if (password.length < 6) throw new UserError('login.err.invalid');
      state.user = { uid: `demo-${email}`, email, displayName: null, emailVerified: true, providerId: 'password' };
      save();
      emitAuth();
    },
    async signUpWithEmail(email) {
      await sleep(400);
      state.user = { uid: `demo-${email}`, email, displayName: null, emailVerified: false, providerId: 'password' };
      save();
      emitAuth();
    },
    async resendVerification() {
      await sleep(300);
    },
    async reloadUser() {
      // У демо вважаємо, що користувач перейшов за посиланням із листа.
      if (state.user) state.user.emailVerified = true;
      save();
      return state.user;
    },
    async resetPassword() {
      await sleep(300);
    },
    async signOut() {
      state.user = null;
      save();
      emitAuth();
    },

    async getProfile() {
      return { ...state.profile, notifyEmail: state.profile.notifyEmail || state.user?.email || '' };
    },
    async saveProfile(p) {
      await sleep(200);
      state.profile = { ...state.profile, ...p };
      save();
    },

    watchConnections(cb) {
      connCbs.add(cb);
      setTimeout(() => cb([...state.connections]), 150);
      return () => connCbs.delete(cb);
    },
    async startConnect(platform, lang) {
      requireUser();
      await sleep(250);
      location.assign(`${href('/app/consent', lang)}?platform=${platform}`);
    },
    async getPendingSelection(id) {
      const p = state.pending[id];
      if (!p) throw new UserError('connections.err.expired');
      return { platform: p.platform, accounts: p.accounts };
    },
    async confirmSelection(id, ids) {
      const p = state.pending[id];
      if (!p) throw new UserError('connections.err.expired');
      await sleep(400);
      for (const a of p.accounts.filter((x) => ids.includes(x.id))) upsert(a.platform, a);
      delete state.pending[id];
      save();
      emitConns();
    },
    async disconnect(id) {
      await sleep(400);
      state.connections = state.connections.filter((c) => c.id !== id);
      save();
      emitConns();
    },
    async refreshNow(id) {
      const c = state.connections.find((x) => x.id === id);
      if (!c) throw new UserError('common.error');
      const wait = (c.lastManualRefreshAt ?? 0) + 3600e3 - Date.now();
      if (wait > 0) return { queued: false, retryInMinutes: Math.ceil(wait / 60000) };
      c.lastManualRefreshAt = Date.now();
      save();
      setTimeout(() => {
        c.lastSyncAt = Date.now();
        save();
        emitConns();
      }, 1500);
      return { queued: true };
    },
    async connectTelegram(channel) {
      requireUser();
      await sleep(900);
      if (/fail/i.test(channel)) throw new UserError('connections.telegram.notAdmin');
      upsert('telegram', { id: channel.toLowerCase(), name: channel, url: `https://t.me/${channel.slice(1)}` });
      save();
      emitConns();
      return { title: channel };
    },
    async connectPodcast(url) {
      requireUser();
      await sleep(900);
      if (/fail/i.test(url)) throw new UserError('connections.podcast.invalid');
      const host = new URL(url).hostname.replace(/^www\./, '');
      const title = `Podcast · ${host}`;
      upsert('podcast', { id: url, name: title, url });
      save();
      emitConns();
      return { title };
    },
    async importLinkedIn(file) {
      requireUser();
      await sleep(900);
      let rows = 90;
      if (/\.csv$/i.test(file.name)) {
        const text = await file.text();
        rows = Math.max(0, text.split(/\r?\n/).filter((l) => /\d{1,4}[./-]\d{1,2}[./-]\d{1,4}/.test(l)).length);
        if (!rows) throw new UserError('connections.linkedin.fail');
      }
      upsert('linkedin', { id: 'li_org_demo', name: 'KnB Бізнес-клуб (LinkedIn)', url: 'https://www.linkedin.com/' }, { source: 'upload', expiresAt: null });
      save();
      emitConns();
      return { rows };
    },

    async getDaily(from, to) {
      await sleep(120);
      return state.connections.flatMap((c) => series(c).filter((r) => r.date >= from && r.date <= to));
    },
    async getContent(from, to) {
      const a = Date.parse(`${from}T00:00:00Z`) - 86400000;
      const b = Date.parse(`${to}T23:59:59Z`) + 86400000;
      return state.connections.flatMap((c) => contentFor(c).filter((x) => x.publishedAt >= a && x.publishedAt <= b));
    },

    async deleteAccount() {
      await sleep(900);
      state = fresh();
      save();
      emitConns();
      emitAuth();
    },
    async submitContact(data) {
      await sleep(500);
      if (data.hp) return; // honeypot — тихо ігноруємо
      state.contacts.push({ ...data, at: Date.now() });
      save();
    },
    async getDeletionStatus(code) {
      await sleep(300);
      if (/^notfound/i.test(code)) return null;
      const created = Date.now() - 2 * 3600e3;
      return /^pending/i.test(code)
        ? { status: 'received', createdAt: created, completedAt: null }
        : { status: 'completed', createdAt: created, completedAt: created + 4 * 60e3 };
    },

    demo: {
      async connectAll() {
        await sleep(600);
        for (const list of Object.values(DEMO_ACCOUNTS)) for (const a of list ?? []) upsert(a.platform, a);
        upsert('telegram', { id: '@knb_club_channel', name: '@knb_club_channel', url: 'https://t.me/knb_club_channel' });
        upsert('podcast', { id: 'https://example.com/podcast.rss', name: 'KnB Podcast', url: 'https://example.com/podcast.rss' });
        upsert('linkedin', { id: 'li_org_demo', name: 'KnB Бізнес-клуб (LinkedIn)', url: 'https://www.linkedin.com/' }, { source: 'upload', expiresAt: null });
        save();
        emitConns();
      },
      async simulateNightly() {
        await sleep(600);
        const now = Date.now();
        state.connections.forEach((c) => {
          if (c.status === 'active') c.lastSyncAt = now;
        });
        save();
        emitConns();
      },
      async simulateExpired() {
        const c = state.connections.find((x) => x.status === 'active' && x.source === 'oauth');
        if (!c) return;
        c.status = 'needs_reconnect';
        c.lastError = 'sync.authExpired';
        save();
        emitConns();
      },
      async consent(platform: PlatformId, allow: boolean, _lang: Lang) {
        void _lang;
        await sleep(500);
        if (!allow) return '/app/connections?error=denied';
        const provider = PLATFORMS[platform].provider;
        const key: PlatformId = provider === 'meta' ? 'facebook' : platform;
        const accounts = DEMO_ACCOUNTS[key] ?? [];
        if (!accounts.length) return '/app/connections?error=noAccounts';
        if (accounts.length === 1) {
          upsert(accounts[0].platform, accounts[0]);
          save();
          return `/app/connections?connected=${accounts[0].platform}`;
        }
        const id = rid();
        state.pending[id] = { platform: key, accounts };
        save();
        return `/app/connections?select=${id}`;
      },
    },
  };
  return backend;
}
