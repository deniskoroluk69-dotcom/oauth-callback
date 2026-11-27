import { db } from '../lib/admin';
import { ADMIN_EMAIL } from '../lib/env';
import { kyivDate } from '../lib/dates';
import { sendAdminEmail, sendReconnectEmail } from '../lib/email';
import { errInfo, log } from '../lib/log';
import { RECONNECT_REMINDER_DAYS, STALE_DATA_DAYS } from '../config/platforms';
import { deleteConnection } from '../lib/connections';
import type { StoredConnection } from '../lib/connections';
import { enqueueSync } from './enqueue';

/** 05:00 Europe/Kyiv: окреме завдання Cloud Tasks на кожне активне підключення. */
export async function dispatchDaily() {
  const snap = await db().collectionGroup('connections').where('status', 'in', ['active', 'error']).get();
  let i = 0;
  for (const d of snap.docs) {
    const uid = d.ref.parent.parent!.id;
    // Розподіляємо старт рівномірно (до ~30 хв), щоб не впертися в ліміти API.
    await enqueueSync({ uid, connectionId: d.id, reason: 'daily' }, Math.min(1800, i * 2)).catch((e) => log.error('enqueue failed', errInfo(e)));
    i++;
  }
  log.info('daily dispatch', { queued: i });
  await remindExpiring();
  await purgeStale();
}

/**
 * Видаляє дані підключень, які не вдалося оновити STALE_DATA_DAYS днів
 * (доступ відкликано, токен прострочено). Запис підключення лишається зі статусом
 * «disconnected», щоб користувач бачив кнопку «Підключити знову».
 */
export async function purgeStale(now = Date.now()): Promise<number> {
  const cutoff = now - STALE_DATA_DAYS * 86400000;
  const snap = await db().collectionGroup('connections').where('status', 'in', ['needs_reconnect', 'error']).get();
  let purged = 0;
  for (const d of snap.docs) {
    const c = d.data() as StoredConnection;
    const last = c.lastSyncAt ?? c.connectedAt ?? 0;
    if (last > cutoff) continue;
    await deleteConnection(d.ref.parent.parent!.id, d.id, { revoke: false, keepDoc: true }).catch((e) => log.error('purge failed', errInfo(e)));
    purged++;
  }
  if (purged) log.info('stale data purged', { purged });
  return purged;
}

/** Лист «підключіть знову» за 7 днів до закінчення доступу (Meta data_access_expires_at тощо). */
export async function remindExpiring(now = Date.now()) {
  const limit = now + RECONNECT_REMINDER_DAYS * 86400000;
  const snap = await db().collectionGroup('connections').where('expiresAt', '<=', limit).get();
  for (const d of snap.docs) {
    const c = d.data() as StoredConnection;
    if (!c.expiresAt || c.status === 'disconnected' || c.reminderSentFor === c.expiresAt) continue;
    // Threads продовжується автоматично; нагадуємо лише якщо автопродовження не спрацювало.
    if (c.platform === 'threads' && c.expiresAt - now > 2 * 86400000) continue;
    const uid = d.ref.parent.parent!.id;
    await sendReconnectEmail(uid, c.platform, c.accountName, 'expiring', c.expiresAt).catch((e) => log.warn('email failed', errInfo(e)));
    await d.ref.set({ reminderSentFor: c.expiresAt }, { merge: true });
  }
}

/**
 * Звіт адміністратору: якщо за ніч впало > 20% підключень однієї платформи —
 * лог-метрика (для алерта в Cloud Monitoring) + лист.
 */
export async function nightlyReport() {
  const day = kyivDate();
  const data = (await db().doc(`syncRuns/${day}`).get()).data() ?? {};
  const platforms = new Set(Object.keys(data).filter((k) => /_(ok|fail)$/.test(k)).map((k) => k.replace(/_(ok|fail)$/, '')));
  const bad: string[] = [];
  for (const p of platforms) {
    const ok = Number(data[`${p}_ok`] ?? 0);
    const fail = Number(data[`${p}_fail`] ?? 0);
    const rate = fail / Math.max(1, ok + fail);
    log.info('sync_failure_rate', { metric: 'sync_failure_rate', platform: p, ok, fail, rate });
    if (rate > 0.2 && fail > 0) bad.push(`${p}: ${fail}/${ok + fail} (${Math.round(rate * 100)}%)`);
  }
  if (bad.length) {
    log.error('sync_failure_alert', { metric: 'sync_failure_alert', day, bad });
    await sendAdminEmail(ADMIN_EMAIL.value(), `KnB Stats: sync failures ${day}`, `More than 20% of connections failed:\n${bad.join('\n')}`);
  }
}
