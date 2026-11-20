/**
 * LinkedIn Community Management API (поки `enabled: false` у config/platforms.ts)
 * + імпорт експорту аналітики Сторінки (.xlsx/.xls/.csv), який працює вже зараз.
 */
import * as XLSX from 'xlsx';
import { PLATFORMS } from '../config/platforms';
import { SECRETS } from '../lib/env';
import { fetchJson, qs } from '../lib/http';
import { addDays, chunks } from '../lib/dates';
import type { TokenSet } from '../lib/tokenStore';
import type { Collector, DailyRow, OAuthProvider } from './types';

const API = 'https://api.linkedin.com/rest';
const LI_VERSION = '202510';
const liHeaders = (at: string) => ({ Authorization: `Bearer ${at}`, 'LinkedIn-Version': LI_VERSION, 'X-Restli-Protocol-Version': '2.0.0' });

interface TokenResp {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
}
const toTokens = (r: TokenResp, now = Date.now()): TokenSet => ({
  accessToken: r.access_token,
  refreshToken: r.refresh_token,
  accessExpiresAt: now + r.expires_in * 1000,
  refreshExpiresAt: r.refresh_token_expires_in ? now + r.refresh_token_expires_in * 1000 : null,
  scope: r.scope,
});

export const linkedinProvider: OAuthProvider = {
  id: 'linkedin',
  usePkce: false,
  authorizeUrl({ state, redirectUri }) {
    return `https://www.linkedin.com/oauth/v2/authorization?${qs({
      response_type: 'code',
      client_id: SECRETS.LINKEDIN_CLIENT_ID.value(),
      redirect_uri: redirectUri,
      state,
      scope: PLATFORMS.linkedin.scopes.join(' '),
    })}`;
  },
  async exchange({ code, redirectUri }) {
    const r = await fetchJson<TokenResp>('https://www.linkedin.com/oauth/v2/accessToken', {
      form: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: SECRETS.LINKEDIN_CLIENT_ID.value(),
        client_secret: SECRETS.LINKEDIN_CLIENT_SECRET.value(),
      },
    });
    return { tokens: toTokens(r), scopes: (r.scope ?? '').split(/[ ,]/).filter(Boolean) };
  },
  async accounts(ex) {
    const acls = await fetchJson<{ elements: { organization: string }[] }>(
      `${API}/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED`,
      { headers: liHeaders(ex.tokens.accessToken) },
    );
    const out = [];
    for (const a of acls.elements) {
      const id = a.organization.split(':').pop()!;
      const org = await fetchJson<{ localizedName: string; vanityName?: string }>(`${API}/organizations/${id}`, { headers: liHeaders(ex.tokens.accessToken) });
      out.push({
        platform: 'linkedin' as const,
        externalId: a.organization,
        name: org.localizedName,
        url: org.vanityName ? `https://www.linkedin.com/company/${org.vanityName}/` : undefined,
        tokens: ex.tokens,
        expiresAt: ex.tokens.refreshExpiresAt ?? ex.tokens.accessExpiresAt ?? null,
      });
    }
    return out;
  },
  needsRefresh: (t, now) => !!t.accessExpiresAt && t.accessExpiresAt - now < 7 * 86400000 && !!t.refreshToken,
  async refresh(t) {
    const r = await fetchJson<TokenResp>('https://www.linkedin.com/oauth/v2/accessToken', {
      form: {
        grant_type: 'refresh_token',
        refresh_token: t.refreshToken!,
        client_id: SECRETS.LINKEDIN_CLIENT_ID.value(),
        client_secret: SECRETS.LINKEDIN_CLIENT_SECRET.value(),
      },
      authErrorMatch: (s, b) => s === 400 && /invalid_grant|expired/i.test(b),
    });
    return toTokens(r);
  },
  async revoke(t) {
    await fetchJson('https://www.linkedin.com/oauth/v2/revoke', {
      form: { token: t.accessToken, client_id: SECRETS.LINKEDIN_CLIENT_ID.value(), client_secret: SECRETS.LINKEDIN_CLIENT_SECRET.value() },
    }).catch(() => undefined);
  },
};

export const collectLinkedIn: Collector = async ({ connection, tokens, from, to }) => {
  const h = { headers: liHeaders(tokens!.accessToken) };
  const urn = encodeURIComponent(connection.externalId);
  const days = new Map<string, DailyRow>();
  const get = (d: string) => days.get(d) ?? days.set(d, { date: d }).get(d)!;
  for (const [s, e] of chunks(from, to, 90)) {
    const ti = `(timeRange:(start:${Date.parse(`${s}T00:00:00Z`)},end:${Date.parse(`${addDays(e, 1)}T00:00:00Z`)}),timeGranularityType:DAY)`;
    const share = await fetchJson<{ elements: { timeRange: { start: number }; totalShareStatistics: Record<string, number> }[] }>(
      `${API}/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${urn}&timeIntervals=${ti}`,
      h,
    );
    for (const el of share.elements) {
      const d = get(new Date(el.timeRange.start).toISOString().slice(0, 10));
      const st = el.totalShareStatistics;
      d.views = st.impressionCount;
      d.reach = st.uniqueImpressionsCount;
      d.likes = st.likeCount;
      d.comments = st.commentCount;
      d.shares = st.shareCount;
      d.interactions = (st.likeCount ?? 0) + (st.commentCount ?? 0) + (st.shareCount ?? 0) + (st.clickCount ?? 0);
    }
    const fol = await fetchJson<{ elements: { timeRange: { start: number }; followerGains: { organicFollowerGain: number; paidFollowerGain: number } }[] }>(
      `${API}/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=${urn}&timeIntervals=${ti}`,
      h,
    );
    for (const el of fol.elements) {
      const d = get(new Date(el.timeRange.start).toISOString().slice(0, 10));
      d.newFollowers = el.followerGains.organicFollowerGain + el.followerGains.paidFollowerGain;
      d.breakdown = { organic: el.followerGains.organicFollowerGain, paid: el.followerGains.paidFollowerGain };
    }
  }
  const size = await fetchJson<{ firstDegreeSize: number }>(`${API}/networkSizes/${urn}?edgeType=COMPANY_FOLLOWED_BY_MEMBER`, h).catch(() => null);
  if (size) get(to).followers = size.firstDegreeSize;
  return { daily: [...days.values()], content: [] };
};

/* ------------------------------------------------------------------ */
/* Імпорт експорту аналітики LinkedIn                                  */
/* ------------------------------------------------------------------ */

const COLS: Record<string, keyof DailyRow | 'organicFollowers' | 'paidFollowers' | 'clicks'> = {
  date: 'date',
  'impressions (total)': 'views',
  impressions: 'views',
  'unique impressions (organic)': 'reach',
  'unique impressions': 'reach',
  'reactions (total)': 'likes',
  reactions: 'likes',
  'comments (total)': 'comments',
  comments: 'comments',
  'reposts (total)': 'shares',
  reposts: 'shares',
  'shares (total)': 'shares',
  'clicks (total)': 'clicks',
  clicks: 'clicks',
  'total followers': 'followers',
  'organic followers': 'organicFollowers',
  'sponsored followers': 'paidFollowers',
  'new followers': 'newFollowers',
  'total page views': 'views',
};

function parseDate(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // SheetJS створює дати в локальному поясі процесу → беремо локальні складові, не UTC.
    const p = (n: number) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // Серійна дата Excel
    return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
  }
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; // LinkedIn: MM/DD/YYYY
  return null;
}

/** Розбирає файл експорту в денні рядки. Кидає помилку, якщо не знайдено жодного дня. */
export function parseLinkedInExport(buf: Buffer): DailyRow[] {
  const wb = XLSX.read(buf, { type: 'buffer', cellDates: true, dense: true });
  const byDate = new Map<string, DailyRow & { organicFollowers?: number; paidFollowers?: number; clicks?: number }>();
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null });
    const headerIdx = rows.findIndex((r) => Array.isArray(r) && r.some((c) => typeof c === 'string' && c.trim().toLowerCase() === 'date'));
    if (headerIdx < 0) continue;
    const header = (rows[headerIdx] as unknown[]).map((c) => String(c ?? '').trim().toLowerCase());
    const map = header.map((h) => COLS[h]);
    for (const r of rows.slice(headerIdx + 1)) {
      if (!Array.isArray(r)) continue;
      const di = map.indexOf('date');
      const date = parseDate(r[di]);
      if (!date) continue;
      const row = byDate.get(date) ?? { date };
      map.forEach((key, i) => {
        if (!key || key === 'date') return;
        const n = typeof r[i] === 'number' ? (r[i] as number) : Number(String(r[i] ?? '').replace(/[\s,]/g, ''));
        if (Number.isFinite(n)) (row as Record<string, unknown>)[key] = n;
      });
      byDate.set(date, row);
    }
  }
  const out: DailyRow[] = [];
  for (const r of byDate.values()) {
    const { organicFollowers, paidFollowers, clicks, ...rest } = r;
    if (organicFollowers !== undefined || paidFollowers !== undefined) {
      rest.newFollowers ??= (organicFollowers ?? 0) + (paidFollowers ?? 0);
      rest.breakdown = { organic: organicFollowers ?? 0, paid: paidFollowers ?? 0 };
    }
    if (rest.likes !== undefined || rest.comments !== undefined || rest.shares !== undefined || clicks !== undefined) {
      rest.interactions = (rest.likes ?? 0) + (rest.comments ?? 0) + (rest.shares ?? 0) + (clicks ?? 0);
    }
    out.push(rest);
  }
  if (!out.length) throw new Error('no rows');
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}
