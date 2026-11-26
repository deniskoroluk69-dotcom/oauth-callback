/**
 * Envelope encryption токенів:
 *  1. Для кожного запису генеруємо випадковий ключ даних (DEK, 256 біт).
 *  2. Шифруємо JSON токенів AES-256-GCM з DEK і AAD = connectionId.
 *  3. DEK шифруємо ключем Cloud KMS (KEK). Зберігаємо лише зашифрований DEK.
 * Розшифрування можливе тільки з доступом до KMS (роль cloudkms.cryptoKeyEncrypterDecrypter
 * лише для службового акаунта функцій).
 *
 * В емуляторі (KMS_KEY_NAME=local) використовується локальний тестовий ключ.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { KeyManagementServiceClient } from '@google-cloud/kms';

export interface EncryptedBlob {
  v: 1;
  /** Повна назва версії ключа KMS (або 'local-dev'). */
  keyVersion: string;
  wrappedDek: string;
  iv: string;
  tag: string;
  ct: string;
}

export interface KeyWrapper {
  wrap(dek: Buffer, aad: string): Promise<{ wrapped: Buffer; keyVersion: string }>;
  unwrap(wrapped: Buffer, aad: string): Promise<Buffer>;
}

/** Обгортка Cloud KMS. */
export class KmsWrapper implements KeyWrapper {
  private client = new KeyManagementServiceClient();
  constructor(private keyName: string) {}

  async wrap(dek: Buffer, aad: string) {
    const [res] = await this.client.encrypt({
      name: this.keyName,
      plaintext: dek,
      additionalAuthenticatedData: Buffer.from(aad),
    });
    return { wrapped: Buffer.from(res.ciphertext as Uint8Array), keyVersion: res.name ?? this.keyName };
  }

  async unwrap(wrapped: Buffer, aad: string) {
    // Для симетричних ключів KMS сам визначає версію з шифротексту.
    const [res] = await this.client.decrypt({
      name: this.keyName,
      ciphertext: wrapped,
      additionalAuthenticatedData: Buffer.from(aad),
    });
    return Buffer.from(res.plaintext as Uint8Array);
  }
}

/** ЛИШЕ для емулятора й тестів. У продакшені заборонено (див. getWrapper). */
export class LocalWrapper implements KeyWrapper {
  private key = createHash('sha256').update('knb-stats-emulator-only-key').digest();
  async wrap(dek: Buffer, aad: string) {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    c.setAAD(Buffer.from(aad));
    const ct = Buffer.concat([c.update(dek), c.final()]);
    return { wrapped: Buffer.concat([iv, c.getAuthTag(), ct]), keyVersion: 'local-dev' };
  }
  async unwrap(wrapped: Buffer, aad: string) {
    const d = createDecipheriv('aes-256-gcm', this.key, wrapped.subarray(0, 12));
    d.setAAD(Buffer.from(aad));
    d.setAuthTag(wrapped.subarray(12, 28));
    return Buffer.concat([d.update(wrapped.subarray(28)), d.final()]);
  }
}

let cached: KeyWrapper | null = null;
export function getWrapper(keyName: string, emulator: boolean): KeyWrapper {
  if (cached) return cached;
  if (keyName === 'local') {
    if (!emulator) throw new Error('Local key wrapper is allowed only in the emulator');
    cached = new LocalWrapper();
  } else {
    cached = new KmsWrapper(keyName);
  }
  return cached;
}

export async function encryptJson(wrapper: KeyWrapper, data: unknown, aad: string): Promise<EncryptedBlob> {
  const dek = randomBytes(32);
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', dek, iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(JSON.stringify(data), 'utf8'), c.final()]);
  const { wrapped, keyVersion } = await wrapper.wrap(dek, aad);
  dek.fill(0);
  return {
    v: 1,
    keyVersion,
    wrappedDek: wrapped.toString('base64'),
    iv: iv.toString('base64'),
    tag: c.getAuthTag().toString('base64'),
    ct: ct.toString('base64'),
  };
}

export async function decryptJson<T>(wrapper: KeyWrapper, blob: EncryptedBlob, aad: string): Promise<T> {
  const dek = await wrapper.unwrap(Buffer.from(blob.wrappedDek, 'base64'), aad);
  try {
    const d = createDecipheriv('aes-256-gcm', dek, Buffer.from(blob.iv, 'base64'));
    d.setAAD(Buffer.from(aad));
    d.setAuthTag(Buffer.from(blob.tag, 'base64'));
    const pt = Buffer.concat([d.update(Buffer.from(blob.ct, 'base64')), d.final()]);
    return JSON.parse(pt.toString('utf8')) as T;
  } finally {
    dek.fill(0);
  }
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
