/**
 * Спільний OAuth-механізм. Сайт (GitHub Pages, SITE_URL) і API (Firebase, PUBLIC_BASE_URL)
 * живуть на різних піддоменах, тому:
 *   POST /connect/{provider}/start    (з сайту, CORS; Authorization: Bearer <Firebase ID token>)
 *        → одноразовий state (10 хв, прив'язаний до uid) + квиток на 2 хв
 *        → { url: API/connect/{provider}/go?t=<квиток> }
 *   GET  /connect/{provider}/go       (браузер відкриває сам — домен API стає «своїм»)
 *        → cookie __session з nonce (прив'язка state до цього браузера) → 302 на сторінку дозволу
 *   GET  /connect/{provider}/callback → перевірка state і cookie → обмін коду → акаунти →
 *        шифрування й запис токенів → 302 назад на SITE_URL/{lang}/app/connections.
 */
import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { getAppCheck } from 'firebase-admin/app-check';
import { PLATFORMS, PROVIDER_PLATFORMS, isPlatformId, isProviderId, type PlatformId, type ProviderId } from '../config/platforms';
import { db } from '../lib/admin';
import { encryptJson, randomToken, sha256 } from '../lib/crypto';
import { baseUrl, isEmulator, siteUrl } from '../lib/env';
import { errInfo, log } from '../lib/log';
import { keyWrapper } from '../lib/services';
import { saveConnection } from '../lib/connections';
import { enqueueSync } from '../sync/enqueue';
import { PROVIDERS } from '../platforms';
import type { DiscoveredAccount } from '../platforms/types';

const STATE_TTL_MS = 10 * 60 * 1000;
const PENDING_TTL_MS = 15 * 60 * 1000;
const TICKET_TTL_MS = 2 * 60 * 1000;
const COOKIE = '__session'; // Firebase Hosting пропускає до функцій лише cookie з цим ім'ям

type Lang = 'uk' | 'en';

export const redirectUri = (provider: ProviderId) => `${baseUrl()}/connect/${provider}/callback`;

function cookie(req: Request, name: string): string | null {
  const raw = req.headers.cookie ?? '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function pkcePair() {
  const verifier = randomToken(48);
  const challenge = Buffer.from(sha256(verifier), 'hex').toString('base64url');
  return { verifier, challenge };
}

function backTo(res: Response, lang: Lang, params: Record<string, string>) {
  res.redirect(302, `${siteUrl()}/${lang}/app/connections?${new URLSearchParams(params)}`);
}

const cookieAttrs = () => `Path=/connect; HttpOnly; SameSite=Lax${isEmulator() ? '' : '; Secure'}`;

/** CORS для запиту start з домену сайту. Повертає true, якщо це preflight (відповідь уже надіслано). */
function cors(req: Request, res: Response): boolean {
  const origin = req.header('Origin');
  const allowed = new Set([siteUrl(), ...(isEmulator() ? ['http://localhost:5173', 'http://127.0.0.1:5173'] : [])]);
  const ok = !!origin && allowed.has(origin);
  if (ok) {
    res.setHeader('Access-Control-Allow-Origin', origin!);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Firebase-AppCheck');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') {
    res.status(ok ? 204 : 403).end();
    return true;
  }
  return false;
}

async function start(req: Request, res: Response, provider: ProviderId) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return void res.status(405).json({ error: 'method' });
  const authz = req.headers.authorization ?? '';
  const idToken = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  let uid: string;
  try {
    const decoded = await getAuth().verifyIdToken(idToken, true);
    if (decoded.firebase.sign_in_provider === 'password' && !decoded.email_verified) throw new Error('unverified');
    uid = decoded.uid;
  } catch {
    return void res.status(401).json({ error: 'auth' });
  }
  if (!isEmulator()) {
    const ac = req.header('X-Firebase-AppCheck');
    try {
      if (!ac) throw new Error('no app check');
      await getAppCheck().verifyToken(ac);
    } catch {
      return void res.status(401).json({ error: 'app-check' });
    }
  }
  const body = ((typeof req.body === 'object' && req.body) || {}) as Record<string, unknown>;
  const lang: Lang = body.lang === 'en' ? 'en' : 'uk';
  const platform: PlatformId = isPlatformId(body.platform) ? body.platform : PROVIDER_PLATFORMS[provider][0];
  if (!PROVIDER_PLATFORMS[provider].includes(platform) || !PLATFORMS[platform].enabled) return void res.status(400).json({ error: 'platform' });

  const p = PROVIDERS[provider];
  const state = randomToken(32);
  const nonce = randomToken(24);
  const pkce = p.usePkce ? pkcePair() : null;
  const ticket = randomToken(24);
  await db()
    .doc(`oauthStates/${sha256(state)}`)
    .set({ uid, provider, platform, lang, nonceHash: sha256(nonce), codeVerifier: pkce?.verifier ?? null, createdAt: Date.now(), expiresAt: Date.now() + STATE_TTL_MS });
  // Квиток (лише сервер): живе 2 хв, одноразовий; несе nonce для cookie і адресу сторінки дозволу.
  await db()
    .doc(`oauthTickets/${sha256(ticket)}`)
    .set({
      provider,
      nonce,
      authorizeUrl: p.authorizeUrl({ state, redirectUri: redirectUri(provider), codeChallenge: pkce?.challenge, lang }),
      expiresAt: Date.now() + TICKET_TTL_MS,
    });

  res.setHeader('Cache-Control', 'private, no-store');
  res.json({ url: `${baseUrl()}/connect/${provider}/go?t=${encodeURIComponent(ticket)}` });
}

async function go(req: Request, res: Response, provider: ProviderId) {
  res.setHeader('Cache-Control', 'private, no-store');
  const t = typeof req.query.t === 'string' ? req.query.t : '';
  if (!t || t.length > 100) return backTo(res, 'uk', { error: 'expired' });
  const ref = db().doc(`oauthTickets/${sha256(t)}`);
  const tk = await db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) return null;
    tx.delete(ref);
    return s.data() as { provider: string; nonce: string; authorizeUrl: string; expiresAt: number };
  });
  if (!tk || tk.provider !== provider || tk.expiresAt < Date.now()) return backTo(res, 'uk', { error: 'expired' });
  // 'private' у Cache-Control обов'язково: Firebase Hosting видаляє Set-Cookie з відповідей без private.
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(tk.nonce)}; Max-Age=${STATE_TTL_MS / 1000}; ${cookieAttrs()}`);
  res.redirect(302, tk.authorizeUrl);
}

async function callback(req: Request, res: Response, provider: ProviderId) {
  // 'private' обов'язково: Firebase Hosting видаляє Set-Cookie з відповідей без private.
  res.setHeader('Cache-Control', 'private, no-store');
  const q = req.query as Record<string, string | undefined>;
  const state = typeof q.state === 'string' ? q.state : '';
  if (!state || state.length > 200) return backTo(res, 'uk', { error: 'expired' });

  // Одноразовий state: читаємо й видаляємо в транзакції.
  const ref = db().doc(`oauthStates/${sha256(state)}`);
  const st = await db().runTransaction(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) return null;
    tx.delete(ref);
    return s.data() as { uid: string; provider: string; platform: string; lang: Lang; nonceHash: string; codeVerifier: string | null; expiresAt: number };
  });
  const lang: Lang = st?.lang ?? 'uk';
  res.setHeader('Set-Cookie', `${COOKIE}=; Max-Age=0; ${cookieAttrs()}`);
  if (!st || st.provider !== provider || st.expiresAt < Date.now()) return backTo(res, lang, { error: 'expired' });
  // Захист від CSRF / підміни сесії: state має належати саме цьому браузеру.
  const nonce = cookie(req, COOKIE);
  if (!nonce || sha256(nonce) !== st.nonceHash) return backTo(res, lang, { error: 'expired' });
  if (q.error || !q.code) return backTo(res, lang, { error: 'denied' });

  try {
    const p = PROVIDERS[provider];
    const ex = await p.exchange({ code: q.code, redirectUri: redirectUri(provider), codeVerifier: st.codeVerifier ?? undefined });
    const accounts = (await p.accounts(ex)).filter((a) => PLATFORMS[a.platform].enabled);
    if (!accounts.length) return backTo(res, lang, { error: 'noAccounts' });
    const grantId = sha256(`${provider}|${ex.providerUserId ?? ''}|${ex.tokens.refreshToken ?? ex.tokens.accessToken}`).slice(0, 32);
    const meta = { provider, providerUserId: ex.providerUserId, grantId, scopes: ex.scopes, source: 'oauth' as const };

    if (accounts.length > 1) {
      // Кілька каналів / Сторінок → користувач обирає. Токени тимчасово шифруємо.
      const id = randomToken(18);
      const blob = await encryptJson(keyWrapper(), { accounts, meta }, `pending:${id}`);
      await db()
        .doc(`pendingSelections/${id}`)
        .set({
          uid: st.uid,
          provider,
          platform: st.platform,
          accounts: accounts.map((a, i) => ({ id: String(i), platform: a.platform, name: a.name, subtitle: a.subtitle ?? null })),
          blob,
          expiresAt: Date.now() + PENDING_TTL_MS,
        });
      return backTo(res, lang, { select: id });
    }
    const id = await saveConnection(st.uid, accounts[0], meta);
    await enqueueSync({ uid: st.uid, connectionId: id, backfill: true, reason: 'connect' }).catch((e) => log.error('enqueue failed', errInfo(e)));
    return backTo(res, lang, { connected: accounts[0].platform });
  } catch (e) {
    log.error('oauth callback failed', { provider, ...errInfo(e) });
    return backTo(res, lang, { error: 'generic' });
  }
}

/** Підтвердження вибору акаунтів (викликається з callable confirmSelection). */
export async function confirmPending(uid: string, id: string, accountIds: string[]) {
  const { decryptJson } = await import('../lib/crypto');
  const ref = db().doc(`pendingSelections/${id}`);
  const snap = await ref.get();
  const d = snap.data();
  if (!d || d.uid !== uid || d.expiresAt < Date.now()) throw new Error('expired');
  const { accounts, meta } = await decryptJson<{ accounts: DiscoveredAccount[]; meta: Parameters<typeof saveConnection>[2] }>(keyWrapper(), d.blob, `pending:${id}`);
  const chosen = accounts.filter((_, i) => accountIds.includes(String(i)));
  await ref.delete();
  for (const a of chosen) {
    const cid = await saveConnection(uid, a, meta);
    await enqueueSync({ uid, connectionId: cid, backfill: true, reason: 'connect' }).catch((e) => log.error('enqueue failed', errInfo(e)));
  }
  return chosen.length;
}

export async function connectHandler(req: Request, res: Response) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const m = req.path.replace(/^\/connect/, '').match(/^\/([a-z]+)\/(start|go|callback)\/?$/);
  if (!m || !isProviderId(m[1])) return void res.status(404).send('Not found');
  const provider = m[1];
  try {
    if (m[2] === 'start') await start(req, res, provider);
    else if (m[2] === 'go') await go(req, res, provider);
    else await callback(req, res, provider);
  } catch (e) {
    log.error('connect handler error', errInfo(e));
    if (!res.headersSent) res.status(500).json({ error: 'internal' });
  }
}
