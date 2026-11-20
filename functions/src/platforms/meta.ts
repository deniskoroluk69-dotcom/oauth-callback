/**
 * Facebook Сторінки + Instagram Business через Facebook Login for Business.
 * Короткий токен → довгостроковий токен користувача → токени Сторінок (/me/accounts)
 * + прив'язаний Instagram Business акаунт.
 *
 * Увага: Meta періодично змінює набір метрик Insights. Перелік — у константах нижче.
 */
import { META_LOGIN_CONFIG_ID, SECRETS } from '../lib/env';
import { fetchJson, qs } from '../lib/http';
import { addDays, chunks, dateRange, unix } from '../lib/dates';
import type { TokenSet } from '../lib/tokenStore';
import type { Collector, ContentRow, DailyRow, DiscoveredAccount, OAuthProvider } from './types';

export const GRAPH_VERSION = 'v23.0';
const G = `https://graph.facebook.com/${GRAPH_VERSION}`;

const FB_DAILY_METRICS = ['page_impressions_unique', 'page_impressions_paid_unique', 'page_post_engagements', 'page_daily_follows_unique', 'page_views_total'];
const IG_SERIES_METRICS = ['reach', 'follower_count'];
const IG_TOTAL_METRICS = ['views', 'accounts_engaged', 'total_interactions', 'likes', 'comments', 'shares'];

const appToken = () => `${SECRETS.META_APP_ID.value()}|${SECRETS.META_APP_SECRET.value()}`;

interface PageResp {
  data: {
    id: string;
    name: string;
    access_token: string;
    link?: string;
    picture?: { data?: { url?: string } };
    instagram_business_account?: { id: string; username?: string; profile_picture_url?: string };
  }[];
  paging?: { next?: string };
}

export const metaProvider: OAuthProvider = {
  id: 'meta',
  usePkce: false,
  authorizeUrl({ state, redirectUri, lang }) {
    return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${qs({
      client_id: SECRETS.META_APP_ID.value(),
      redirect_uri: redirectUri,
      state,
      config_id: META_LOGIN_CONFIG_ID.value(),
      response_type: 'code',
      override_default_response_type: 'true',
      locale: lang === 'uk' ? 'uk_UA' : 'en_US',
    })}`;
  },
  async exchange({ code, redirectUri }) {
    const short = await fetchJson<{ access_token: string }>(
      `${G}/oauth/access_token?${qs({ client_id: SECRETS.META_APP_ID.value(), client_secret: SECRETS.META_APP_SECRET.value(), redirect_uri: redirectUri, code })}`,
    );
    const long = await fetchJson<{ access_token: string; expires_in?: number }>(
      `${G}/oauth/access_token?${qs({
        grant_type: 'fb_exchange_token',
        client_id: SECRETS.META_APP_ID.value(),
        client_secret: SECRETS.META_APP_SECRET.value(),
        fb_exchange_token: short.access_token,
      })}`,
    );
    const dbg = await fetchJson<{ data: { user_id?: string; scopes?: string[]; data_access_expires_at?: number; expires_at?: number } }>(
      `${G}/debug_token?${qs({ input_token: long.access_token, access_token: appToken() })}`,
    );
    return {
      tokens: {
        accessToken: long.access_token,
        accessExpiresAt: dbg.data.expires_at ? dbg.data.expires_at * 1000 : null,
        extra: { dataAccessExpiresAt: String((dbg.data.data_access_expires_at ?? 0) * 1000) },
      },
      providerUserId: dbg.data.user_id,
      scopes: dbg.data.scopes ?? [],
    };
  },
  async accounts(ex) {
    const out: DiscoveredAccount[] = [];
    const dataExp = Number(ex.tokens.extra?.dataAccessExpiresAt) || null;
    let url: string | undefined = `${G}/me/accounts?${qs({
      fields: 'id,name,access_token,link,picture{url},instagram_business_account{id,username,profile_picture_url}',
      limit: 100,
      access_token: ex.tokens.accessToken,
    })}`;
    for (let guard = 0; url && guard < 10; guard++) {
      const r: PageResp = await fetchJson<PageResp>(url);
      for (const p of r.data) {
        const tokens: TokenSet = { accessToken: p.access_token, extra: { userToken: ex.tokens.accessToken, userId: ex.providerUserId ?? '' } };
        out.push({
          platform: 'facebook',
          externalId: p.id,
          name: p.name,
          subtitle: 'Facebook Page',
          url: p.link ?? `https://www.facebook.com/${p.id}`,
          avatarUrl: p.picture?.data?.url,
          tokens,
          expiresAt: dataExp,
        });
        const ig = p.instagram_business_account;
        if (ig) {
          out.push({
            platform: 'instagram',
            externalId: ig.id,
            name: ig.username ? `@${ig.username}` : p.name,
            subtitle: `Instagram · ${p.name}`,
            url: ig.username ? `https://www.instagram.com/${ig.username}/` : undefined,
            avatarUrl: ig.profile_picture_url,
            tokens: { ...tokens, extra: { ...tokens.extra, pageId: p.id } },
            expiresAt: dataExp,
          });
        }
      }
      url = r.paging?.next;
    }
    return out;
  },
  // Токени Сторінок, отримані з довгострокового токена, не мають строку дії;
  // обмеження — data_access_expires_at (90 днів) → лист «підключіть знову».
  needsRefresh: () => false,
  async revoke(t) {
    const userToken = t.extra?.userToken;
    if (userToken) await fetchJson(`${G}/me/permissions?${qs({ access_token: userToken })}`, { method: 'DELETE' }).catch(() => undefined);
  },
};

interface InsightsResp {
  data: { name: string; period: string; values?: { value: number | Record<string, number>; end_time: string }[]; total_value?: { value: number } }[];
}

/** end_time у Meta — кінець доби за тихоокеанським часом; беремо дату попереднього дня. */
const endTimeToDate = (s: string) => addDays(s.slice(0, 10), -1);

export const collectFacebook: Collector = async ({ connection, tokens, from, to }) => {
  const at = tokens!.accessToken;
  const days = new Map<string, DailyRow>(dateRange(from, to).map((d) => [d, { date: d }]));
  for (const [s, e] of chunks(from, to, 90)) {
    const r = await fetchJson<InsightsResp>(
      `${G}/${connection.externalId}/insights?${qs({ metric: FB_DAILY_METRICS.join(','), period: 'day', since: unix(s), until: unix(addDays(e, 1)), access_token: at })}`,
    );
    for (const m of r.data) {
      for (const v of m.values ?? []) {
        const d = days.get(endTimeToDate(v.end_time));
        if (!d || typeof v.value !== 'number') continue;
        if (m.name === 'page_impressions_unique') d.reach = v.value;
        if (m.name === 'page_impressions_paid_unique') (d.breakdown ??= {}).paid = v.value;
        if (m.name === 'page_post_engagements') d.interactions = v.value;
        if (m.name === 'page_daily_follows_unique') d.newFollowers = v.value;
        if (m.name === 'page_views_total') d.views = v.value;
      }
    }
  }
  for (const d of days.values()) if (d.breakdown?.paid !== undefined && d.reach !== undefined) d.breakdown.organic = Math.max(0, d.reach - d.breakdown.paid);

  const page = await fetchJson<{ followers_count?: number; name: string }>(`${G}/${connection.externalId}?${qs({ fields: 'followers_count,name', access_token: at })}`);
  if (page.followers_count !== undefined) days.get(to)!.followers = page.followers_count;

  const posts = await fetchJson<{
    data: { id: string; message?: string; created_time: string; permalink_url?: string; full_picture?: string; shares?: { count: number }; reactions?: { summary: { total_count: number } }; comments?: { summary: { total_count: number } } }[];
  }>(
    `${G}/${connection.externalId}/published_posts?${qs({
      fields: 'id,message,created_time,permalink_url,full_picture,shares,reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0)',
      since: unix(addDays(to, -90)),
      limit: 50,
      access_token: at,
    })}`,
  );
  const content: ContentRow[] = posts.data.map((p) => {
    const likes = p.reactions?.summary.total_count ?? 0;
    const comments = p.comments?.summary.total_count ?? 0;
    const shares = p.shares?.count ?? 0;
    return {
      postId: p.id,
      title: (p.message ?? '').split('\n')[0].slice(0, 140) || 'Facebook post',
      url: p.permalink_url ?? `https://www.facebook.com/${p.id}`,
      thumbnailUrl: p.full_picture,
      publishedAt: Date.parse(p.created_time),
      likes,
      comments,
      shares,
      interactions: likes + comments + shares,
    };
  });
  return { daily: [...days.values()].filter((d) => Object.keys(d).length > 1), content, accountName: page.name };
};

export const collectInstagram: Collector = async ({ connection, tokens, from, to }) => {
  const at = tokens!.accessToken;
  const ig = connection.externalId;
  // Instagram віддає денні ряди лише за останні 30 днів.
  const start = from < addDays(to, -29) ? addDays(to, -29) : from;
  const days = new Map<string, DailyRow>(dateRange(start, to).map((d) => [d, { date: d }]));

  const series = await fetchJson<InsightsResp>(
    `${G}/${ig}/insights?${qs({ metric: IG_SERIES_METRICS.join(','), period: 'day', since: unix(start), until: unix(addDays(to, 1)), access_token: at })}`,
  );
  for (const m of series.data) {
    for (const v of m.values ?? []) {
      const d = days.get(endTimeToDate(v.end_time));
      if (!d || typeof v.value !== 'number') continue;
      if (m.name === 'reach') d.reach = v.value;
      if (m.name === 'follower_count') d.newFollowers = v.value;
    }
  }
  // Метрики total_value — окремий запит на кожен день (лише за потрібні дні).
  for (const date of [...days.keys()].slice(-31)) {
    const r = await fetchJson<InsightsResp>(
      `${G}/${ig}/insights?${qs({ metric: IG_TOTAL_METRICS.join(','), metric_type: 'total_value', period: 'day', since: unix(date), until: unix(addDays(date, 1)), access_token: at })}`,
    ).catch(() => null);
    if (!r) continue;
    const d = days.get(date)!;
    for (const m of r.data) {
      const v = m.total_value?.value;
      if (typeof v !== 'number') continue;
      if (m.name === 'views') d.views = v;
      if (m.name === 'total_interactions') d.interactions = v;
      if (m.name === 'likes') d.likes = v;
      if (m.name === 'comments') d.comments = v;
      if (m.name === 'shares') d.shares = v;
    }
  }
  const prof = await fetchJson<{ followers_count?: number; username?: string }>(`${G}/${ig}?${qs({ fields: 'followers_count,username', access_token: at })}`);
  if (prof.followers_count !== undefined) days.get(to)!.followers = prof.followers_count;

  const media = await fetchJson<{
    data: { id: string; caption?: string; media_product_type?: string; permalink: string; thumbnail_url?: string; media_url?: string; timestamp: string; like_count?: number; comments_count?: number }[];
  }>(`${G}/${ig}/media?${qs({ fields: 'id,caption,media_product_type,media_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count', limit: 50, access_token: at })}`);
  const content: ContentRow[] = [];
  for (const m of media.data.slice(0, 30)) {
    let views: number | undefined;
    let reach: number | undefined;
    const ins = await fetchJson<InsightsResp>(`${G}/${m.id}/insights?${qs({ metric: 'views,reach', access_token: at })}`).catch(() => null);
    for (const x of ins?.data ?? []) {
      const v = x.values?.[0]?.value;
      if (typeof v !== 'number') continue;
      if (x.name === 'views') views = v;
      if (x.name === 'reach') reach = v;
    }
    const kind = (m.media_product_type ?? '').toLowerCase();
    const publishedDate = m.timestamp.slice(0, 10);
    const day = days.get(publishedDate);
    if (day && views !== undefined) {
      day.breakdown ??= {};
      const key = kind === 'reels' ? 'reels' : kind === 'story' ? 'stories' : 'posts';
      day.breakdown[key] = (day.breakdown[key] ?? 0) + views;
    }
    content.push({
      postId: m.id,
      title: (m.caption ?? '').split('\n')[0].slice(0, 140) || 'Instagram',
      url: m.permalink,
      thumbnailUrl: m.thumbnail_url ?? m.media_url,
      publishedAt: Date.parse(m.timestamp),
      kind,
      views,
      reach,
      likes: m.like_count,
      comments: m.comments_count,
      interactions: (m.like_count ?? 0) + (m.comments_count ?? 0),
    });
  }
  return { daily: [...days.values()].filter((d) => Object.keys(d).length > 1), content, accountName: prof.username ? `@${prof.username}` : undefined };
};
