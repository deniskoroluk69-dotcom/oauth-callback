/**
 * Подкаст через публічний RSS. Захист від SSRF: лише http/https, без приватних
 * адрес, обмеження розміру й часу.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { XMLParser } from 'fast-xml-parser';
import { UserFacingError } from '../lib/errors';
import type { Collector, ContentRow } from './types';

const MAX_BYTES = 5 * 1024 * 1024;

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const l = ip.toLowerCase();
    return l === '::1' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80') || l === '::' || l.startsWith('::ffff:127.') || l.startsWith('::ffff:10.') || l.startsWith('::ffff:192.168.');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new UserFacingError('connections.podcast.invalid');
  }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) throw new UserFacingError('connections.podcast.invalid');
  if (/^(localhost|metadata\.google\.internal)$/i.test(u.hostname) || u.hostname.endsWith('.internal')) throw new UserFacingError('connections.podcast.invalid');
  const addrs = isIP(u.hostname) ? [{ address: u.hostname }] : await lookup(u.hostname, { all: true }).catch(() => []);
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new UserFacingError('connections.podcast.invalid');
  return u;
}

async function fetchFeed(url: string): Promise<string> {
  const u = await assertPublicUrl(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(u, { signal: ctrl.signal, redirect: 'manual', headers: { Accept: 'application/rss+xml, application/xml, text/xml' } });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      // Перевіряємо адресу перенаправлення так само (один крок).
      const next = new URL(res.headers.get('location')!, u).toString();
      return fetchFeed(next);
    }
    if (!res.ok) throw new UserFacingError('connections.podcast.invalid');
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_BYTES) throw new UserFacingError('connections.podcast.invalid');
    const text = await res.text();
    if (text.length > MAX_BYTES) throw new UserFacingError('connections.podcast.invalid');
    return text;
  } catch (e) {
    if (e instanceof UserFacingError) throw e;
    throw new UserFacingError('connections.podcast.invalid');
  } finally {
    clearTimeout(timer);
  }
}

export interface Feed {
  title: string;
  link?: string;
  episodes: ContentRow[];
}

const asArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const text = (v: unknown): string => (typeof v === 'string' ? v : v && typeof v === 'object' && '#text' in v ? String((v as Record<string, unknown>)['#text']) : v === undefined || v === null ? '' : String(v));

export function parseFeed(xml: string): Feed {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', processEntities: true, htmlEntities: true });
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml);
  } catch {
    throw new UserFacingError('connections.podcast.invalid');
  }
  const channel = (doc.rss as Record<string, unknown> | undefined)?.channel as Record<string, unknown> | undefined;
  if (!channel || !text(channel.title)) throw new UserFacingError('connections.podcast.invalid');
  const items = asArray(channel.item as Record<string, unknown> | Record<string, unknown>[]);
  const episodes: ContentRow[] = items.slice(0, 500).map((it, i) => {
    const guid = text(it.guid) || text(it.link) || `${i}`;
    const enclosure = it.enclosure as Record<string, string> | undefined;
    return {
      postId: guid.replace(/[/#?]/g, '_').slice(0, 200),
      title: text(it.title).slice(0, 200) || `Episode ${items.length - i}`,
      url: text(it.link) || enclosure?.['@_url'] || text(channel.link) || '',
      publishedAt: Date.parse(text(it.pubDate)) || 0,
      kind: 'episode',
    };
  });
  return { title: text(channel.title).slice(0, 200), link: text(channel.link) || undefined, episodes };
}

export async function loadFeed(url: string): Promise<Feed> {
  return parseFeed(await fetchFeed(url));
}

export const collectPodcast: Collector = async ({ connection }) => {
  const feed = await loadFeed(connection.externalId);
  return { daily: [], content: feed.episodes.slice(0, 100), accountName: feed.title };
};
