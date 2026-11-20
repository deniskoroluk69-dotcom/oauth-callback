/**
 * Threads API. Короткий токен → довгостроковий (60 днів);
 * автопродовження, коли лишилось < THREADS_RENEW_BEFORE_DAYS днів.
 */
import { PLATFORMS, THREADS_RENEW_BEFORE_DAYS } from '../config/platforms';
import { SECRETS } from '../lib/env';
import { fetchJson, qs } from '../lib/http';
import { addDays, dateRange, unix } from '../lib/dates';
import type { Collector, ContentRow, DailyRow, OAuthProvider } from './types';

const API = 'https://graph.threads.net';

export const threadsProvider: OAuthProvider = {
  id: 'threads',
  usePkce: false,
  authorizeUrl({ state, redirectUri }) {
    return `https://threads.net/oauth/authorize?${qs({
      client_id: SECRETS.THREADS_APP_ID.value(),
      redirect_uri: redirectUri,
      scope: PLATFORMS.threads.scopes.join(','),
      response_type: 'code',
      state,
    })}`;
  },
  async exchange({ code, redirectUri }) {
    const short = await fetchJson<{ access_token: string; user_id: string | number }>(`${API}/oauth/access_token`, {
      form: {
        client_id: SECRETS.THREADS_APP_ID.value(),
        client_secret: SECRETS.THREADS_APP_SECRET.value(),
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      },
    });
    const long = await fetchJson<{ access_token: string; expires_in: number }>(
      `${API}/access_token?${qs({ grant_type: 'th_exchange_token', client_secret: SECRETS.THREADS_APP_SECRET.value(), access_token: short.access_token })}`,
    );
    return {
      tokens: { accessToken: long.access_token, accessExpiresAt: Date.now() + long.expires_in * 1000 },
      providerUserId: String(short.user_id),
      scopes: PLATFORMS.threads.scopes,
    };
  },
  async accounts(ex) {
    const me = await fetchJson<{ id: string; username: string; threads_profile_picture_url?: string }>(
      `${API}/v1.0/me?${qs({ fields: 'id,username,threads_profile_picture_url', access_token: ex.tokens.accessToken })}`,
    );
    return [
      {
        platform: 'threads',
        externalId: me.id,
        name: `@${me.username}`,
        url: `https://www.threads.net/@${me.username}`,
        avatarUrl: me.threads_profile_picture_url,
        tokens: ex.tokens,
        expiresAt: ex.tokens.accessExpiresAt ?? null,
      },
    ];
  },
  needsRefresh(t, now) {
    return !!t.accessExpiresAt && t.accessExpiresAt - now < THREADS_RENEW_BEFORE_DAYS * 86400000;
  },
  async refresh(t) {
    const r = await fetchJson<{ access_token: string; expires_in: number }>(
      `${API}/refresh_access_token?${qs({ grant_type: 'th_refresh_token', access_token: t.accessToken })}`,
    );
    return { ...t, accessToken: r.access_token, accessExpiresAt: Date.now() + r.expires_in * 1000 };
  },
};

interface TInsights {
  data: { name: string; values?: { value: number; end_time: string }[]; total_value?: { value: number } }[];
}

export const collectThreads: Collector = async ({ connection, tokens, from, to }) => {
  const at = tokens!.accessToken;
  const days = new Map<string, DailyRow>(dateRange(from, to).map((d) => [d, { date: d }]));
  const series = await fetchJson<TInsights>(
    `${API}/v1.0/${connection.externalId}/threads_insights?${qs({ metric: 'views', since: unix(from), until: unix(addDays(to, 1)), access_token: at })}`,
  );
  for (const v of series.data.find((m) => m.name === 'views')?.values ?? []) {
    const d = days.get(addDays(v.end_time.slice(0, 10), -1));
    if (d) d.views = v.value;
  }
  // Сумарні показники за кожен із останніх днів (total_value).
  for (const date of [...days.keys()].slice(-31)) {
    const r = await fetchJson<TInsights>(
      `${API}/v1.0/${connection.externalId}/threads_insights?${qs({ metric: 'likes,replies,reposts,quotes', since: unix(date), until: unix(addDays(date, 1)), access_token: at })}`,
    ).catch(() => null);
    if (!r) continue;
    const d = days.get(date)!;
    const get = (n: string) => r.data.find((m) => m.name === n)?.total_value?.value ?? 0;
    d.likes = get('likes');
    d.comments = get('replies');
    d.shares = get('reposts') + get('quotes');
    d.interactions = d.likes + d.comments + d.shares;
  }
  const fol = await fetchJson<TInsights>(`${API}/v1.0/${connection.externalId}/threads_insights?${qs({ metric: 'followers_count', access_token: at })}`);
  const followers = fol.data.find((m) => m.name === 'followers_count')?.total_value?.value;
  if (followers !== undefined) days.get(to)!.followers = followers;

  const posts = await fetchJson<{ data: { id: string; text?: string; permalink?: string; timestamp: string }[] }>(
    `${API}/v1.0/me/threads?${qs({ fields: 'id,text,permalink,timestamp', since: unix(addDays(to, -90)), limit: 50, access_token: at })}`,
  );
  const content: ContentRow[] = [];
  for (const p of posts.data.slice(0, 30)) {
    const ins = await fetchJson<TInsights>(`${API}/v1.0/${p.id}/insights?${qs({ metric: 'views,likes,replies,reposts,quotes', access_token: at })}`).catch(() => null);
    const val = (n: string) => ins?.data.find((m) => m.name === n)?.values?.[0]?.value ?? ins?.data.find((m) => m.name === n)?.total_value?.value ?? 0;
    const likes = val('likes');
    const comments = val('replies');
    const shares = val('reposts') + val('quotes');
    content.push({
      postId: p.id,
      title: (p.text ?? '').split('\n')[0].slice(0, 140) || 'Threads',
      url: p.permalink ?? 'https://www.threads.net',
      publishedAt: Date.parse(p.timestamp),
      views: val('views'),
      likes,
      comments,
      shares,
      interactions: likes + comments + shares,
    });
  }
  return { daily: [...days.values()].filter((d) => Object.keys(d).length > 1), content };
};
