/**
 * TikTok Login Kit v2 + Display API.
 * ВАЖЛИВО: refresh token ротується при кожному оновленні → оновлювати лише під
 * блокуванням і записувати новий токен одразу (див. sync/tokens.ts).
 * TikTok не віддає денну історію: щодня зберігаємо знімок лічильників і рахуємо приріст.
 */
import { PLATFORMS, TIKTOK_ENV } from '../config/platforms';
import { SECRETS } from '../lib/env';
import { fetchJson, qs } from '../lib/http';
import type { TokenSet } from '../lib/tokenStore';
import type { Collector, ContentRow, OAuthProvider } from './types';

const API = 'https://open.tiktokapis.com/v2';

export function tiktokCreds() {
  return TIKTOK_ENV === 'production'
    ? { key: SECRETS.TIKTOK_CLIENT_KEY.value(), secret: SECRETS.TIKTOK_CLIENT_SECRET.value() }
    : { key: SECRETS.TIKTOK_SANDBOX_CLIENT_KEY.value(), secret: SECRETS.TIKTOK_SANDBOX_CLIENT_SECRET.value() };
}

interface TokenResp {
  access_token: string;
  expires_in: number;
  open_id: string;
  refresh_token: string;
  refresh_expires_in: number;
  scope: string;
  error?: string;
}

const invalidGrant = (status: number, body: string) => status === 400 && /invalid_grant|invalid_refresh_token|refresh_token.*(expired|invalid)/i.test(body);

export function tokenFromResp(r: TokenResp, now = Date.now()): TokenSet {
  return {
    accessToken: r.access_token,
    refreshToken: r.refresh_token,
    accessExpiresAt: now + r.expires_in * 1000,
    refreshExpiresAt: now + r.refresh_expires_in * 1000,
    scope: r.scope,
    extra: { openId: r.open_id },
  };
}

export const tiktokProvider: OAuthProvider = {
  id: 'tiktok',
  usePkce: false,
  authorizeUrl({ state, redirectUri }) {
    return `https://www.tiktok.com/v2/auth/authorize/?${qs({
      client_key: tiktokCreds().key,
      scope: PLATFORMS.tiktok.scopes.join(','),
      response_type: 'code',
      redirect_uri: redirectUri,
      state,
    })}`;
  },
  async exchange({ code, redirectUri }) {
    const c = tiktokCreds();
    const r = await fetchJson<TokenResp>(`${API}/oauth/token/`, {
      form: { client_key: c.key, client_secret: c.secret, code, grant_type: 'authorization_code', redirect_uri: redirectUri },
    });
    if (r.error || !r.access_token) throw new Error('tiktok token exchange failed');
    return { tokens: tokenFromResp(r), providerUserId: r.open_id, scopes: r.scope.split(',') };
  },
  async accounts(ex) {
    const u = await userInfo(ex.tokens.accessToken);
    return [
      {
        platform: 'tiktok',
        externalId: u.open_id,
        name: u.username ? `@${u.username}` : u.display_name,
        url: u.profile_deep_link,
        avatarUrl: u.avatar_url,
        tokens: ex.tokens,
        expiresAt: ex.tokens.refreshExpiresAt ?? null,
      },
    ];
  },
  /** Оновлюємо, коли access token (24 год) спливає менш ніж за 1 годину. */
  needsRefresh(t, now) {
    return !t.accessExpiresAt || t.accessExpiresAt - now < 3600e3;
  },
  async refresh(t) {
    if (!t.refreshToken) throw new Error('no refresh token');
    const c = tiktokCreds();
    const r = await fetchJson<TokenResp>(`${API}/oauth/token/`, {
      form: { client_key: c.key, client_secret: c.secret, grant_type: 'refresh_token', refresh_token: t.refreshToken },
      authErrorMatch: invalidGrant,
    });
    if (r.error || !r.access_token) throw new Error('tiktok refresh failed');
    return { ...tokenFromResp(r), extra: { ...t.extra, openId: r.open_id ?? t.extra?.openId ?? '' } };
  },
  async revoke(t) {
    const c = tiktokCreds();
    await fetchJson(`${API}/oauth/revoke/`, { form: { client_key: c.key, client_secret: c.secret, token: t.accessToken } }).catch(() => undefined);
  },
};

interface UserInfo {
  open_id: string;
  display_name: string;
  username?: string;
  avatar_url?: string;
  profile_deep_link?: string;
  follower_count?: number;
  likes_count?: number;
  video_count?: number;
}

async function userInfo(at: string): Promise<UserInfo> {
  const r = await fetchJson<{ data: { user: UserInfo } }>(
    `${API}/user/info/?${qs({ fields: 'open_id,display_name,username,avatar_url,profile_deep_link,follower_count,likes_count,video_count' })}`,
    { headers: { Authorization: `Bearer ${at}` } },
  );
  return r.data.user;
}

interface Video {
  id: string;
  title?: string;
  video_description?: string;
  share_url: string;
  cover_image_url?: string;
  create_time: number;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
}

export const collectTikTok: Collector = async ({ connection, tokens, to }) => {
  const at = tokens!.accessToken;
  const u = await userInfo(at);
  const videos: Video[] = [];
  let cursor: number | undefined;
  for (let page = 0; page < 5; page++) {
    const r = await fetchJson<{ data: { videos: Video[]; cursor: number; has_more: boolean } }>(
      `${API}/video/list/?${qs({ fields: 'id,title,video_description,share_url,cover_image_url,create_time,view_count,like_count,comment_count,share_count' })}`,
      { headers: { Authorization: `Bearer ${at}` }, json: { max_count: 20, ...(cursor ? { cursor } : {}) } },
    );
    videos.push(...r.data.videos);
    if (!r.data.has_more) break;
    cursor = r.data.cursor;
  }
  const sum = (k: keyof Video) => videos.reduce((a, v) => a + (Number(v[k]) || 0), 0);
  const snap = {
    date: to,
    followers: u.follower_count ?? 0,
    views: sum('view_count'),
    likes: sum('like_count'),
    comments: sum('comment_count'),
    shares: sum('share_count'),
  };
  const prev = connection.snapshot;
  const delta = (k: keyof typeof snap) => (prev && typeof prev[k] === 'number' && prev.date !== to ? Math.max(0, (snap[k] as number) - (prev[k] as number)) : undefined);
  const likes = delta('likes');
  const comments = delta('comments');
  const shares = delta('shares');
  const content: ContentRow[] = videos.map((v) => ({
    postId: v.id,
    title: (v.title || v.video_description || 'TikTok').slice(0, 140),
    url: v.share_url,
    thumbnailUrl: v.cover_image_url,
    publishedAt: v.create_time * 1000,
    views: v.view_count,
    likes: v.like_count,
    comments: v.comment_count,
    shares: v.share_count,
    interactions: (v.like_count ?? 0) + (v.comment_count ?? 0) + (v.share_count ?? 0),
  }));
  return {
    daily: [
      {
        date: to,
        followers: snap.followers,
        newFollowers: prev && typeof prev.followers === 'number' && prev.date !== to ? snap.followers - (prev.followers as number) : undefined,
        views: delta('views'),
        likes,
        comments,
        shares,
        interactions: likes !== undefined ? likes + (comments ?? 0) + (shares ?? 0) : undefined,
      },
    ],
    content,
    snapshot: snap,
    accountName: u.username ? `@${u.username}` : u.display_name,
  };
};
