/**
 * Адреси для повідомлень від платформ:
 *   POST /hooks/meta/deauthorize     — користувач видалив застосунок у Facebook
 *   POST /hooks/meta/data-deletion   — запит на видалення даних (повертає url + confirmation_code)
 *   POST /hooks/threads/uninstall    — те саме для Threads
 *   POST /hooks/threads/delete
 *   POST /hooks/telegram             — оновлення бота (нові пости каналів)
 */
import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import type { ProviderId } from '../config/platforms';
import { db } from '../lib/admin';
import { randomToken } from '../lib/crypto';
import { SECRETS, siteUrl } from '../lib/env';
import { deleteConnection, findByProviderUser } from '../lib/connections';
import { SignedRequestError, parseSignedRequest } from '../lib/signedRequest';
import { errInfo, log } from '../lib/log';
import { channelPostToContent } from '../platforms/telegram';

function signedRequestFrom(req: Request): unknown {
  const b = req.body;
  if (b && typeof b === 'object' && 'signed_request' in b) return (b as Record<string, unknown>).signed_request;
  if (typeof b === 'string') return new URLSearchParams(b).get('signed_request');
  if (Buffer.isBuffer(req.rawBody)) return new URLSearchParams(req.rawBody.toString('utf8')).get('signed_request');
  return null;
}

async function deauthorize(req: Request, res: Response, provider: ProviderId, secret: string) {
  const payload = parseSignedRequest(signedRequestFrom(req), secret);
  if (!payload.user_id) return void res.status(400).json({ error: 'user' });
  const conns = await findByProviderUser(provider, String(payload.user_id));
  for (const c of conns) {
    // Позначаємо відключеним і видаляємо токени та дані (доступ уже відкликано на боці Meta).
    await deleteConnection(c.uid, c.id, { revoke: false, keepDoc: true });
  }
  log.info('deauthorize', { provider, count: conns.length });
  res.json({ ok: true });
}

async function dataDeletion(req: Request, res: Response, provider: ProviderId, secret: string) {
  const payload = parseSignedRequest(signedRequestFrom(req), secret);
  if (!payload.user_id) return void res.status(400).json({ error: 'user' });
  const code = randomToken(12).replace(/[^A-Za-z0-9]/g, '').slice(0, 16) || randomToken(8);
  const reqRef = db().doc(`deletionRequests/${code}`);
  await reqRef.set({ status: 'received', provider, createdAt: Date.now(), completedAt: null });
  const conns = await findByProviderUser(provider, String(payload.user_id));
  for (const c of conns) await deleteConnection(c.uid, c.id, { revoke: false });
  await reqRef.set({ status: 'completed', completedAt: Date.now() }, { merge: true });
  log.info('data deletion', { provider, count: conns.length });
  res.json({ url: `${siteUrl()}/en/data-deletion?code=${code}`, confirmation_code: code });
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function telegram(req: Request, res: Response) {
  const header = req.header('X-Telegram-Bot-Api-Secret-Token') ?? '';
  if (!safeEqual(header, SECRETS.TELEGRAM_WEBHOOK_SECRET.value())) return void res.status(401).end();
  const post = (req.body ?? {}).channel_post ?? (req.body ?? {}).edited_channel_post;
  if (post?.chat?.id) {
    const snap = await db().collectionGroup('connections').where('platform', '==', 'telegram').where('externalId', '==', String(post.chat.id)).get();
    const row = channelPostToContent(post);
    for (const d of snap.docs) {
      if (d.get('status') === 'disconnected') continue;
      const uid = d.ref.parent.parent!.id;
      await db()
        .doc(`users/${uid}/content/${d.id}_${row.postId}`)
        .set({ ...row, connectionId: d.id, platform: 'telegram', updatedAt: Date.now() }, { merge: true });
    }
  }
  res.json({ ok: true });
}

export async function hooksHandler(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return void res.status(405).end();
  const path = req.path.replace(/^\/hooks/, '').replace(/\/+$/, '');
  try {
    switch (path) {
      case '/meta/deauthorize':
        return await deauthorize(req, res, 'meta', SECRETS.META_APP_SECRET.value());
      case '/meta/data-deletion':
        return await dataDeletion(req, res, 'meta', SECRETS.META_APP_SECRET.value());
      case '/threads/uninstall':
        return await deauthorize(req, res, 'threads', SECRETS.THREADS_APP_SECRET.value());
      case '/threads/delete':
        return await dataDeletion(req, res, 'threads', SECRETS.THREADS_APP_SECRET.value());
      case '/telegram':
        return await telegram(req, res);
      default:
        return void res.status(404).end();
    }
  } catch (e) {
    if (e instanceof SignedRequestError) {
      log.warn('invalid signed_request', { path, reason: e.message });
      return void res.status(400).json({ error: 'invalid signed_request' });
    }
    log.error('hook failed', { path, ...errInfo(e) });
    if (!res.headersSent) res.status(500).json({ error: 'internal' });
  }
}
