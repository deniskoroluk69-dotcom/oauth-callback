import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { MANUAL_REFRESH_INTERVAL_MS, PLATFORMS } from '../config/platforms';
import { db } from '../lib/admin';
import { sha256 } from '../lib/crypto';
import { UserFacingError } from '../lib/errors';
import { errInfo, log } from '../lib/log';
import { deleteConnection, deleteUserData, saveConnection } from '../lib/connections';
import { enqueueSync } from '../sync/enqueue';
import { confirmPending } from '../connect/handler';
import { verifyChannel } from '../platforms/telegram';

/** Лише авторизований користувач з підтвердженою поштою (для входу паролем). */
function requireUser(req: CallableRequest): string {
  const a = req.auth;
  if (!a) throw new HttpsError('unauthenticated', 'common.error');
  if (a.token.firebase?.sign_in_provider === 'password' && !a.token.email_verified) throw new HttpsError('permission-denied', 'common.error');
  return a.uid;
}

const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Перетворює внутрішні помилки на безпечні для клієнта (лише ключ перекладу). */
async function guard<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    if (e instanceof UserFacingError) throw new HttpsError('failed-precondition', e.key);
    log.error(`${name} failed`, errInfo(e));
    throw new HttpsError('internal', 'common.error');
  }
}

async function ownConnection(uid: string, connectionId: string) {
  if (!/^[a-z]+_[a-f0-9]{24}$/.test(connectionId)) throw new HttpsError('invalid-argument', 'common.error');
  const ref = db().doc(`users/${uid}/connections/${connectionId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'common.error');
  return { ref, data: snap.data()! };
}

export const handlers = {
  async getPendingSelection(req: CallableRequest<{ id?: string }>) {
    const uid = requireUser(req);
    return guard('getPendingSelection', async () => {
      const id = str(req.data?.id, 64);
      const d = id ? (await db().doc(`pendingSelections/${id}`).get()).data() : undefined;
      if (!d || d.uid !== uid || d.expiresAt < Date.now()) throw new UserFacingError('connections.err.expired');
      // Лише назви — жодних токенів.
      return { platform: d.platform, accounts: d.accounts };
    });
  },

  async confirmSelection(req: CallableRequest<{ id?: string; accountIds?: string[] }>) {
    const uid = requireUser(req);
    return guard('confirmSelection', async () => {
      const ids = Array.isArray(req.data?.accountIds) ? req.data.accountIds.map((x) => str(x, 10)).slice(0, 100) : [];
      if (!ids.length) throw new UserFacingError('connections.select.none');
      try {
        return { connected: await confirmPending(uid, str(req.data?.id, 64), ids) };
      } catch {
        throw new UserFacingError('connections.err.expired');
      }
    });
  },

  async disconnectConnection(req: CallableRequest<{ connectionId?: string }>) {
    const uid = requireUser(req);
    return guard('disconnect', async () => {
      const id = str(req.data?.connectionId, 64);
      await ownConnection(uid, id);
      await deleteConnection(uid, id, { revoke: true });
      return { ok: true };
    });
  },

  async refreshNow(req: CallableRequest<{ connectionId?: string }>) {
    const uid = requireUser(req);
    return guard('refreshNow', async () => {
      const id = str(req.data?.connectionId, 64);
      const { ref } = await ownConnection(uid, id);
      // Не частіше 1 разу на годину — перевірка в транзакції.
      const wait = await db().runTransaction(async (tx) => {
        const s = await tx.get(ref);
        const last = Number(s.get('lastManualRefreshAt') ?? 0);
        const left = last + MANUAL_REFRESH_INTERVAL_MS - Date.now();
        if (left > 0) return left;
        tx.update(ref, { lastManualRefreshAt: Date.now() });
        return 0;
      });
      if (wait > 0) return { queued: false, retryInMinutes: Math.ceil(wait / 60000) };
      await enqueueSync({ uid, connectionId: id, reason: 'manual' });
      return { queued: true };
    });
  },

  async connectTelegram(req: CallableRequest<{ channel?: string }>) {
    const uid = requireUser(req);
    if (!PLATFORMS.telegram.enabled) throw new HttpsError('failed-precondition', 'connections.soonText');
    return guard('connectTelegram', async () => {
      const ch = await verifyChannel(str(req.data?.channel, 64));
      const id = await saveConnection(
        uid,
        { platform: 'telegram', externalId: ch.chatId, name: ch.title, subtitle: `@${ch.username}`, url: `https://t.me/${ch.username}` },
        { provider: null, scopes: [], source: 'telegram' },
      );
      await enqueueSync({ uid, connectionId: id, backfill: true, reason: 'connect' });
      return { title: ch.title };
    });
  },

  async deleteAccount(req: CallableRequest) {
    const uid = requireUser(req);
    return guard('deleteAccount', async () => {
      await deleteUserData(uid);
      log.info('account deleted', { uidHash: sha256(uid).slice(0, 12) });
      return { ok: true };
    });
  },

  async submitContact(req: CallableRequest<{ name?: string; email?: string; message?: string; hp?: string; lang?: string }>) {
    return guard('submitContact', async () => {
      const d = req.data ?? {};
      if (str(d.hp)) return { ok: true }; // honeypot: тихо ігноруємо ботів
      const name = str(d.name, 100);
      const email = str(d.email, 200);
      const message = str(d.message, 5000);
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 5) throw new UserFacingError('contact.invalid');
      // Обмеження частоти: 5 повідомлень на годину з однієї IP-адреси.
      const ip = (req.rawRequest.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.rawRequest.ip || 'unknown';
      const bucket = db().doc(`rateLimits/contact_${sha256(ip).slice(0, 32)}`);
      const allowed = await db().runTransaction(async (tx) => {
        const s = await tx.get(bucket);
        const now = Date.now();
        const hits = ((s.get('hits') as number[] | undefined) ?? []).filter((t) => now - t < 3600e3);
        if (hits.length >= 5) return false;
        tx.set(bucket, { hits: [...hits, now], expiresAt: now + 3600e3 });
        return true;
      });
      if (!allowed) throw new UserFacingError('login.err.tooMany');
      await db()
        .collection('contactMessages')
        .add({ name, email, message, lang: d.lang === 'en' ? 'en' : 'uk', uid: req.auth?.uid ?? null, createdAt: Date.now(), expiresAt: Date.now() + 365 * 86400000 });
      return { ok: true };
    });
  },
};
