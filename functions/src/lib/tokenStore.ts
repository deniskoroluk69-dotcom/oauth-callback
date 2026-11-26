/**
 * Сховище токенів (колекція `secrets/{connectionId}`, закрита правилами для клієнта)
 * з блокуванням через транзакцію (`lockUntil` + `lockId`).
 *
 * Чому блокування: TikTok (і LinkedIn) ротують refresh token при кожному
 * оновленні. Якщо два воркери оновлять токен одночасно, один з refresh token
 * стане недійсним і підключення «зламається». Тому оновлення токена — лише
 * під блокуванням, а новий токен записується ОДРАЗУ після отримання.
 */
import { randomUUID } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { LockedError } from './errors';
import { decryptJson, encryptJson, type EncryptedBlob, type KeyWrapper } from './crypto';

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  /** ms epoch */
  accessExpiresAt?: number | null;
  refreshExpiresAt?: number | null;
  scope?: string;
  /** Додаткові службові значення (напр. user token Meta, IG user id). */
  extra?: Record<string, string>;
}

export interface SecretStore {
  /** Взяти блокування. Повертає lockId або кидає LockedError. */
  acquire(id: string, ttlMs: number): Promise<string>;
  read(id: string): Promise<TokenSet | null>;
  /** Записати токени. Якщо lockId заданий — лише поки блокування наше. */
  write(id: string, lockId: string | null, tokens: TokenSet, meta?: { uid?: string }): Promise<void>;
  release(id: string, lockId: string): Promise<void>;
  remove(id: string): Promise<void>;
}

interface SecretDoc {
  uid?: string;
  blob?: EncryptedBlob;
  keyVersion?: string;
  refreshedAt?: number | null;
  lockUntil?: number | null;
  lockId?: string | null;
  updatedAt?: number;
}

export class FirestoreSecretStore implements SecretStore {
  constructor(
    private db: Firestore,
    private wrapper: KeyWrapper,
    private now: () => number = Date.now,
  ) {}

  private ref(id: string) {
    return this.db.collection('secrets').doc(id);
  }

  async acquire(id: string, ttlMs: number): Promise<string> {
    const lockId = randomUUID();
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(this.ref(id));
      const d = (snap.data() ?? {}) as SecretDoc;
      if (d.lockUntil && d.lockUntil > this.now() && d.lockId) throw new LockedError();
      tx.set(this.ref(id), { lockUntil: this.now() + ttlMs, lockId }, { merge: true });
    });
    return lockId;
  }

  async read(id: string): Promise<TokenSet | null> {
    const snap = await this.ref(id).get();
    const d = snap.data() as SecretDoc | undefined;
    if (!d?.blob) return null;
    return decryptJson<TokenSet>(this.wrapper, d.blob, id);
  }

  async write(id: string, lockId: string | null, tokens: TokenSet, meta: { uid?: string } = {}): Promise<void> {
    const blob = await encryptJson(this.wrapper, tokens, id);
    const data: SecretDoc = { blob, keyVersion: blob.keyVersion, refreshedAt: this.now(), updatedAt: this.now() };
    if (meta.uid) data.uid = meta.uid;
    if (!lockId) {
      await this.ref(id).set(data, { merge: true });
      return;
    }
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(this.ref(id));
      const d = (snap.data() ?? {}) as SecretDoc;
      if (d.lockId !== lockId) throw new LockedError();
      tx.set(this.ref(id), data, { merge: true });
    });
  }

  async release(id: string, lockId: string): Promise<void> {
    await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(this.ref(id));
      if (!snap.exists) return;
      const d = snap.data() as SecretDoc;
      if (d.lockId === lockId) tx.update(this.ref(id), { lockUntil: null, lockId: null });
    });
  }

  async remove(id: string): Promise<void> {
    await this.ref(id).delete();
  }
}

/** Реалізація в пам'яті — для юніт-тестів. Імітує ту саму семантику блокування. */
export class MemorySecretStore implements SecretStore {
  data = new Map<string, { tokens?: TokenSet; lockUntil?: number | null; lockId?: string | null; writes: number }>();
  constructor(private now: () => number = Date.now) {}

  private get(id: string) {
    if (!this.data.has(id)) this.data.set(id, { writes: 0 });
    return this.data.get(id)!;
  }
  async acquire(id: string, ttlMs: number) {
    const d = this.get(id);
    if (d.lockUntil && d.lockUntil > this.now() && d.lockId) throw new LockedError();
    d.lockId = randomUUID();
    d.lockUntil = this.now() + ttlMs;
    return d.lockId;
  }
  async read(id: string) {
    const t = this.get(id).tokens;
    return t ? (JSON.parse(JSON.stringify(t)) as TokenSet) : null;
  }
  async write(id: string, lockId: string | null, tokens: TokenSet) {
    const d = this.get(id);
    if (lockId && d.lockId !== lockId) throw new LockedError();
    d.tokens = JSON.parse(JSON.stringify(tokens));
    d.writes++;
  }
  async release(id: string, lockId: string) {
    const d = this.get(id);
    if (d.lockId === lockId) {
      d.lockId = null;
      d.lockUntil = null;
    }
  }
  async remove(id: string) {
    this.data.delete(id);
  }
}
