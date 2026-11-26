import { getAuth } from 'firebase-admin/auth';
import { FieldPath } from 'firebase-admin/firestore';
import { PLATFORMS, type ConnectionDoc, type PlatformId, type ProviderId } from '../config/platforms';
import { db } from './admin';
import { sha256 } from './crypto';
import { log, errInfo } from './log';
import { secretStore } from './services';
import { PROVIDERS } from '../platforms';
import type { DiscoveredAccount } from '../platforms/types';

/** Стабільний глобально унікальний ID: повторне підключення оновлює той самий документ. */
export function connectionIdFor(uid: string, platform: PlatformId, externalId: string): string {
  return `${platform}_${sha256(`${uid}|${platform}|${externalId}`).slice(0, 24)}`;
}

export interface StoredConnection extends ConnectionDoc {
  providerUserId?: string;
  /** Хеш спільного дозволу: кілька підключень з одного OAuth-входу (Сторінка + IG, кілька каналів). */
  grantId?: string;
  snapshot?: Record<string, number | string>;
  reminderSentFor?: number | null;
  reconnectEmailSentAt?: number | null;
}

export async function saveConnection(
  uid: string,
  acc: Omit<DiscoveredAccount, 'tokens'> & { tokens?: DiscoveredAccount['tokens'] },
  opts: { provider: ProviderId | null; providerUserId?: string; grantId?: string; scopes: string[]; source: ConnectionDoc['source'] },
): Promise<string> {
  const id = connectionIdFor(uid, acc.platform, acc.externalId);
  const ref = db().doc(`users/${uid}/connections/${id}`);
  const existing = (await ref.get()).data() as StoredConnection | undefined;
  if (acc.tokens) await secretStore().write(id, null, acc.tokens, { uid });
  const doc: StoredConnection = {
    platform: acc.platform,
    provider: opts.provider,
    externalId: acc.externalId,
    accountName: acc.name,
    accountUrl: acc.url,
    avatarUrl: acc.avatarUrl,
    status: 'active',
    scopes: opts.scopes.length ? opts.scopes : PLATFORMS[acc.platform].scopes,
    connectedAt: existing?.connectedAt ?? Date.now(),
    lastSyncAt: existing?.lastSyncAt ?? null,
    lastManualRefreshAt: existing?.lastManualRefreshAt ?? null,
    lastError: null,
    expiresAt: acc.expiresAt ?? null,
    source: opts.source,
    providerUserId: opts.providerUserId,
    grantId: opts.grantId,
    reminderSentFor: null,
    reconnectEmailSentAt: null,
  };
  await ref.set(doc, { merge: true });
  return id;
}

async function deleteByConnection(uid: string, sub: 'daily' | 'content', connectionId: string) {
  const col = db().collection(`users/${uid}/${sub}`);
  // ID документів мають префікс `${connectionId}_` → видаляємо діапазоном по ID.
  for (;;) {
    const snap = await col
      .where(FieldPath.documentId(), '>=', `${connectionId}_`)
      .where(FieldPath.documentId(), '<', `${connectionId}_`)
      .limit(400)
      .get();
    if (snap.empty) break;
    const batch = db().batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

/**
 * Відключення: відкликати токен на платформі (де можливо), видалити токени,
 * статистику й публікації. `keepDoc` → лишити запис зі статусом disconnected.
 */
export async function deleteConnection(uid: string, connectionId: string, opts: { revoke: boolean; keepDoc?: boolean }) {
  const ref = db().doc(`users/${uid}/connections/${connectionId}`);
  const conn = (await ref.get()).data() as StoredConnection | undefined;
  if (opts.revoke && conn?.provider) {
    try {
      // Не відкликаємо дозвіл, якщо ним користуються інші активні підключення (Meta: Сторінка + IG).
      const siblings = conn.grantId
        ? (await db().collection(`users/${uid}/connections`).where('grantId', '==', conn.grantId).get()).docs.filter(
            (d) => d.id !== connectionId && d.get('status') !== 'disconnected',
          )
        : [];
      const tokens = siblings.length ? null : await secretStore().read(connectionId);
      if (tokens) await PROVIDERS[conn.provider].revoke?.(tokens);
    } catch (e) {
      log.warn('revoke failed', { connectionId, ...errInfo(e) });
    }
  }
  await secretStore().remove(connectionId);
  await deleteByConnection(uid, 'daily', connectionId);
  await deleteByConnection(uid, 'content', connectionId);
  if (opts.keepDoc) {
    await ref.set({ status: 'disconnected', lastError: null, expiresAt: null, snapshot: null }, { merge: true });
  } else {
    await ref.delete();
  }
}

/** Повне видалення користувача: усі підключення, дані, профіль і обліковий запис. */
export async function deleteUserData(uid: string) {
  const conns = await db().collection(`users/${uid}/connections`).get();
  for (const c of conns.docs) await deleteConnection(uid, c.id, { revoke: true });
  await db().recursiveDelete(db().doc(`users/${uid}`));
  const pend = await db().collection('pendingSelections').where('uid', '==', uid).get();
  await Promise.all(pend.docs.map((d) => d.ref.delete()));
  await getAuth()
    .deleteUser(uid)
    .catch(() => undefined);
}

/** Пошук підключень за ідентифікатором користувача Meta/Threads (для deauthorize/data-deletion). */
export async function findByProviderUser(provider: ProviderId, providerUserId: string) {
  const snap = await db().collectionGroup('connections').where('provider', '==', provider).where('providerUserId', '==', providerUserId).get();
  return snap.docs.map((d) => ({ uid: d.ref.parent.parent!.id, id: d.id, data: d.data() as StoredConnection }));
}
