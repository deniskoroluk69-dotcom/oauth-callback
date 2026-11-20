/**
 * YouTube через Google OAuth. Права: youtube.readonly, yt-analytics.readonly.
 * Зберігаємо лише refresh token; access token отримуємо при кожному зборі.
 */
import { PLATFORMS } from '../config/platforms';
import { SECRETS } from '../lib/env';
import { fetchJson, qs } from '../lib/http';
import { addDays, chunks } from '../lib/dates';
import type { TokenSet } from '../lib/tokenStore';
import type { Collector, ContentRow, DailyRow, OAuthProvider } from './types';

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const REVOKE = 'https://oauth2.googleapis.com/revoke';
const YT = 'https://www.googleapis.com/youtube/v3';
const YTA = 'https://youtubeanalytics.googleapis.com/v2/reports';

interface TokenResp {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
}

const isInvalidGrant = (status: number, body: string) => status === 400 && /invalid_grant/.test(body);

export const googleProvider: OAuthProvider = {
  id: 'google',
  usePkce: true,
  authorizeUrl({ state, redirectUri, codeChallenge, lang }) {
    return `${AUTH}?${qs({
      client_id: SECRETS.GOOGLE_CLIENT_ID.value(),
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: PLATFORMS.youtube.scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallenge ? 'S256' : undefined,
      hl: lang,
    })}`;
  },
  async exchange({ code, redirectUri, codeVerifier }) {
    const r = await fetchJson<TokenResp>(TOKEN, {
      form: {
        code,
        client_id: SECRETS.GOOGLE_CLIENT_ID.value(),
        client_secret: SECRETS.GOOGLE_CLIENT_SECRET.value(),
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
      },
    });
    return {
      tokens: { accessToken: r.access_token, refreshToken: r.refresh_token, accessExpiresAt: Date.now() + r.expires_in * 1000, scope: r.scope },
      scopes: (r.scope ?? '').split(' ').filter(Boolean),
    };
  },
  async accounts(ex) {
    const r = await fetchJson<{ items?: { id: string; snippet: { title: string; customUrl?: string; thumbnails?: { default?: { url: string } } } }[] }>(
      `${YT}/channels?${qs({ part: 'snippet', mine: 'true', maxResults: 50 })}`,
      { headers: { Authorization: `Bearer ${ex.tokens.accessToken}` } },
    );
    // Зберігаємо лише refresh token: access token щоразу отримуємо заново.
    const stored: TokenSet = { accessToken: '', refreshToken: ex.tokens.refreshToken, scope: ex.tokens.scope };
    return (r.items ?? []).map((c) => ({
      platform: 'youtube' as const,
      externalId: c.id,
      name: c.snippet.title,
      subtitle: c.snippet.customUrl ? `youtube.com/${c.snippet.customUrl}` : undefined,
      url: `https://www.youtube.com/channel/${c.id}`,
      avatarUrl: c.snippet.thumbnails?.default?.url,
      tokens: stored,
      expiresAt: null,
    }));
  },
  needsRefresh: () => true,
  async refresh(t) {
    if (!t.refreshToken) throw new Error('no refresh token');
    const r = await fetchJson<TokenResp>(TOKEN, {
      form: {
        client_id: SECRETS.GOOGLE_CLIENT_ID.value(),
        client_secret: SECRETS.GOOGLE_CLIENT_SECRET.value(),
        refresh_token: t.refreshToken,
        grant_type: 'refresh_token',
      },
      authErrorMatch: isInvalidGrant,
    });
    return { ...t, accessToken: r.access_token, accessExpiresAt: Date.now() + r.expires_in * 1000 };
  },
  async revoke(t) {
    const token = t.refreshToken || t.accessToken;
    if (token) await fetchJson(REVOKE, { form: { token } }).catch(() => undefined);
  },
};

interface Report {
  columnHeaders: { name: string }[];
  rows?: (string | number)[][];
}

function rowsToObjects(r: Report): Record<string, string | number>[] {
  const names = r.columnHeaders.map((h) => h.name);
  return (r.rows ?? []).map((row) => Object.fromEntries(row.map((v, i) => [names[i], v])));
}

export const collectYouTube: Collector = async ({ connection, tokens, from, to }) => {
  const auth = { headers: { Authorization: `Bearer ${tokens!.accessToken}` } };
  const ids = `channel==${connection.externalId}`;

  const days = new Map<string, DailyRow>();
  for (const [s, e] of chunks(from, to, 365)) {
    const main = await fetchJson<Report>(
      `${YTA}?${qs({
        ids,
        startDate: s,
        endDate: e,
        metrics: 'views,estimatedMinutesWatched,subscribersGained,subscribersLost,likes,comments,shares',
        dimensions: 'day',
        sort: 'day',
      })}`,
      auth,
    );
    for (const o of rowsToObjects(main)) {
      const likes = Number(o.likes) || 0;
      const comments = Number(o.comments) || 0;
      const shares = Number(o.shares) || 0;
      days.set(String(o.day), {
        date: String(o.day),
        views: Number(o.views) || 0,
        watchMinutes: Number(o.estimatedMinutesWatched) || 0,
        newFollowers: (Number(o.subscribersGained) || 0) - (Number(o.subscribersLost) || 0),
        likes,
        comments,
        shares,
        interactions: likes + comments + shares,
      });
    }
    // Shorts / довгі відео
    try {
      const byType = await fetchJson<Report>(
        `${YTA}?${qs({ ids, startDate: s, endDate: e, metrics: 'views', dimensions: 'day,creatorContentType' })}`,
        auth,
      );
      for (const o of rowsToObjects(byType)) {
        const d = days.get(String(o.day));
        if (!d) continue;
        const kind = String(o.creatorContentType).toLowerCase();
        d.breakdown ??= {};
        if (kind === 'shorts') d.breakdown.shorts = (d.breakdown.shorts ?? 0) + Number(o.views);
        else if (kind === 'videoondemand' || kind === 'livestream') d.breakdown.long = (d.breakdown.long ?? 0) + Number(o.views);
      }
    } catch {
      /* розбивка необов'язкова */
    }
  }

  // Підписники: поточна кількість мінус чистий приріст після кожного дня.
  const ch = await fetchJson<{ items?: { statistics: { subscriberCount?: string }; snippet: { title: string } }[] }>(
    `${YT}/channels?${qs({ part: 'statistics,snippet', id: connection.externalId })}`,
    auth,
  );
  const subsNow = Number(ch.items?.[0]?.statistics.subscriberCount ?? NaN);
  const sorted = [...days.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
  if (Number.isFinite(subsNow)) {
    let running = subsNow;
    for (const d of sorted) {
      d.followers = running;
      running -= d.newFollowers ?? 0;
    }
  }

  // Топ відео за період
  const content: ContentRow[] = [];
  const top = await fetchJson<Report>(
    `${YTA}?${qs({ ids, startDate: addDays(to, -89), endDate: to, metrics: 'views,likes,comments,shares', dimensions: 'video', sort: '-views', maxResults: 25 })}`,
    auth,
  );
  const topRows = rowsToObjects(top);
  if (topRows.length) {
    const vids = await fetchJson<{ items?: { id: string; snippet: { title: string; publishedAt: string; thumbnails?: { medium?: { url: string } } } }[] }>(
      `${YT}/videos?${qs({ part: 'snippet', id: topRows.map((r) => r.video).join(',') })}`,
      auth,
    );
    const meta = new Map((vids.items ?? []).map((v) => [v.id, v.snippet]));
    for (const r of topRows) {
      const m = meta.get(String(r.video));
      if (!m) continue;
      const likes = Number(r.likes) || 0;
      const comments = Number(r.comments) || 0;
      const shares = Number(r.shares) || 0;
      content.push({
        postId: String(r.video),
        title: m.title,
        url: `https://www.youtube.com/watch?v=${r.video}`,
        thumbnailUrl: m.thumbnails?.medium?.url,
        publishedAt: Date.parse(m.publishedAt),
        views: Number(r.views) || 0,
        likes,
        comments,
        shares,
        interactions: likes + comments + shares,
      });
    }
  }

  return { daily: [...days.values()], content, accountName: ch.items?.[0]?.snippet.title };
};
