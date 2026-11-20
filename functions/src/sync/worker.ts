import { FieldValue } from 'firebase-admin/firestore';
import { PLATFORMS } from '../config/platforms';
import { db } from '../lib/admin';
import { addDays, kyivDate } from '../lib/dates';
import { sendReconnectEmail } from '../lib/email';
import { AuthError, LockedError, TransientError } from '../lib/errors';
import { errInfo, log } from '../lib/log';
import { secretStore } from '../lib/services';
import type { StoredConnection } from '../lib/connections';
import { COLLECTORS, PROVIDERS } from '../platforms';
import type { CollectResult } from '../platforms/types';
import { getFreshTokens, withLock } from './tokens';
import type { SyncTask } from './enqueue';

/** Скільки останніх днів перезбирати щодня (платформи уточнюють цифри із запізненням). */
const REFRESH_WINDOW_DAYS = 3;

async function writeResults(uid: string, connectionId: string, conn: StoredConnection, r: CollectResult) {
  const writer = db().bulkWriter();
  const now = Date.now();
  for (const d of r.daily) {
    writer.set(db().doc(`users/${uid}/daily/${connectionId}_${d.date}`), { ...d, connectionId, platform: conn.platform, updatedAt: now }, { merge: true });
  }
  for (const c of r.content) {
    const pid = c.postId.replace(/\//g, '_').slice(0, 300);
    writer.set(db().doc(`users/${uid}/content/${connectionId}_${pid}`), { ...c, connectionId, platform: conn.platform, updatedAt: now }, { merge: true });
  }
  await writer.close();
}

async function recordRun(platform: string, ok: boolean) {
  const day = kyivDate();
  await db()
    .doc(`syncRuns/${day}`)
    .set({ [`${platform}_${ok ? 'ok' : 'fail'}`]: FieldValue.increment(1), date: day }, { merge: true });
}

export async function runSync(task: SyncTask, attempt: { retryCount: number; maxAttempts: number }) {
  const { uid, connectionId } = task;
  const ref = db().doc(`users/${uid}/connections/${connectionId}`);
  const snap = await ref.get();
  if (!snap.exists) return;
  const conn = snap.data() as StoredConnection;
  if (conn.status === 'disconnected' || conn.source === 'upload') return;
  if (conn.provider && !PLATFORMS[conn.platform].enabled) return;

  const to = addDays(kyivDate(), -1);
  const history = Math.max(PLATFORMS[conn.platform].historyDays, 1);
  const from = task.backfill ? addDays(to, -(Math.min(history, 365) - 1)) : addDays(to, -(REFRESH_WINDOW_DAYS - 1));

  try {
    await withLock(secretStore(), connectionId, async (lockId) => {
      const tokens = conn.provider ? await getFreshTokens(secretStore(), connectionId, lockId, PROVIDERS[conn.provider]) : null;
      const result = await COLLECTORS[conn.platform]({ connection: { ...conn, id: connectionId }, tokens, from, to });
      await writeResults(uid, connectionId, conn, result);
      await ref.set(
        {
          status: 'active',
          lastSyncAt: Date.now(),
          lastError: null,
          reconnectEmailSentAt: null,
          ...(result.snapshot ? { snapshot: result.snapshot } : {}),
          ...(result.accountName ? { accountName: result.accountName } : {}),
          ...(conn.platform === 'threads' && tokens?.accessExpiresAt ? { expiresAt: tokens.accessExpiresAt } : {}),
        },
        { merge: true },
      );
    });
    await recordRun(conn.platform, true);
    log.info('sync ok', { platform: conn.platform, connectionId, from, to, backfill: !!task.backfill });
  } catch (e) {
    if (e instanceof AuthError) {
      // Доступ відкликано/прострочено → «Потрібно перепідключити» + лист (один раз).
      await ref.set({ status: 'needs_reconnect', lastError: 'sync.authExpired' }, { merge: true });
      if (!conn.reconnectEmailSentAt) {
        await sendReconnectEmail(uid, conn.platform, conn.accountName, 'reconnect').catch((err) => log.warn('email failed', errInfo(err)));
        await ref.set({ reconnectEmailSentAt: Date.now() }, { merge: true });
      }
      await recordRun(conn.platform, false);
      log.warn('sync auth error', { platform: conn.platform, connectionId, ...errInfo(e) });
      return; // не повторюємо
    }
    const last = attempt.retryCount + 1 >= attempt.maxAttempts;
    if (e instanceof LockedError && !last) throw e; // інший воркер — спробуємо пізніше
    await ref.set({ lastError: e instanceof TransientError ? 'sync.temporary' : 'sync.unknown', ...(last ? { status: 'error' } : {}) }, { merge: true });
    if (last) await recordRun(conn.platform, false);
    log.error('sync failed', { platform: conn.platform, connectionId, attempt: attempt.retryCount, ...errInfo(e) });
    throw e; // Cloud Tasks повторить з експоненційною затримкою
  }
}
