import { getFunctions } from 'firebase-admin/functions';
import { REGION } from '../lib/env';

export interface SyncTask {
  uid: string;
  connectionId: string;
  /** true → підтягнути історію, яку платформа віддає заднім числом. */
  backfill?: boolean;
  reason?: 'daily' | 'manual' | 'connect';
}

export async function enqueueSync(task: SyncTask, delaySeconds = 0) {
  const queue = getFunctions().taskQueue<SyncTask>(`locations/${REGION}/functions/syncConnection`);
  await queue.enqueue(task, {
    scheduleDelaySeconds: delaySeconds,
    dispatchDeadlineSeconds: 600,
  });
}
