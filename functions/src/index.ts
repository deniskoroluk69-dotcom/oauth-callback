/**
 * Точка входу Cloud Functions (2nd gen, europe-west1).
 *  connect          — HTTP: OAuth start/callback (через Hosting rewrite /connect/**)
 *  hooks            — HTTP: повідомлення від Meta/Threads/Telegram (/hooks/**)
 *  dispatchDaily    — Cloud Scheduler 05:00 Europe/Kyiv → Cloud Tasks
 *  syncConnection   — Cloud Tasks воркер (одне підключення, з повторами й лімітами)
 *  nightlyReport    — звіт адміністратору про збої
 *  cleanupExpired   — прибирання прострочених state/виборів
 *  callables        — дії з кабінету
 */
import './lib/admin';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall, onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import { ALL_SECRETS, REGION, SECRETS, TIMEZONE, isEmulator } from './lib/env';
import { db } from './lib/admin';
import { connectHandler } from './connect/handler';
import { hooksHandler } from './hooks/handler';
import { dispatchDaily as runDispatch, nightlyReport as runReport } from './sync/dispatcher';
import { runSync } from './sync/worker';
import type { SyncTask } from './sync/enqueue';
import { handlers } from './api/callables';

setGlobalOptions({ region: REGION, maxInstances: 10, memory: '256MiB' });

const MAX_ATTEMPTS = 5;
const appCheck = !isEmulator();

// cors: false — CORS обробляє сам connectHandler (дозволено лише домен сайту SITE_URL).
export const connect = onRequest({ secrets: ALL_SECRETS, timeoutSeconds: 60, invoker: 'public', cors: false }, connectHandler);

export const hooks = onRequest(
  { secrets: [SECRETS.META_APP_SECRET, SECRETS.THREADS_APP_SECRET, SECRETS.TELEGRAM_WEBHOOK_SECRET], invoker: 'public', cors: false },
  hooksHandler,
);

export const dispatchDaily = onSchedule({ schedule: '0 5 * * *', timeZone: TIMEZONE, timeoutSeconds: 540, memory: '512MiB' }, async () => {
  await runDispatch();
});

export const syncConnection = onTaskDispatched<SyncTask>(
  {
    secrets: ALL_SECRETS,
    timeoutSeconds: 540,
    memory: '512MiB',
    retryConfig: { maxAttempts: MAX_ATTEMPTS, minBackoffSeconds: 60, maxBackoffSeconds: 3600, maxDoublings: 4 },
    rateLimits: { maxConcurrentDispatches: 6, maxDispatchesPerSecond: 2 },
  },
  async (req) => {
    await runSync(req.data, { retryCount: req.retryCount ?? 0, maxAttempts: MAX_ATTEMPTS });
  },
);

export const nightlyReport = onSchedule({ schedule: '30 8 * * *', timeZone: TIMEZONE }, async () => {
  await runReport();
});

export const cleanupExpired = onSchedule({ schedule: '15 3 * * *', timeZone: TIMEZONE }, async () => {
  const now = Date.now();
  for (const col of ['oauthStates', 'oauthTickets', 'pendingSelections', 'rateLimits', 'contactMessages']) {
    const snap = await db().collection(col).where('expiresAt', '<', now).limit(500).get();
    const batch = db().batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    if (!snap.empty) await batch.commit();
  }
});

const callOpts = { enforceAppCheck: appCheck, secrets: ALL_SECRETS };
export const getPendingSelection = onCall(callOpts, handlers.getPendingSelection);
export const confirmSelection = onCall(callOpts, handlers.confirmSelection);
export const disconnectConnection = onCall(callOpts, handlers.disconnectConnection);
export const refreshNow = onCall(callOpts, handlers.refreshNow);
export const connectTelegram = onCall(callOpts, handlers.connectTelegram);
export const connectPodcast = onCall({ enforceAppCheck: appCheck, timeoutSeconds: 60 }, handlers.connectPodcast);
export const importLinkedIn = onCall({ enforceAppCheck: appCheck, memory: '512MiB', timeoutSeconds: 120 }, handlers.importLinkedIn);
export const deleteAccount = onCall({ ...callOpts, timeoutSeconds: 300 }, handlers.deleteAccount);
export const submitContact = onCall({ enforceAppCheck: appCheck }, handlers.submitContact);
