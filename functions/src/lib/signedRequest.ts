/**
 * Розбір і перевірка `signed_request` від Meta (Facebook / Instagram / Threads).
 * Формат: base64url(HMAC-SHA256(payload, app_secret)) + '.' + base64url(JSON payload).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SignedRequestPayload {
  algorithm: string;
  user_id?: string;
  issued_at?: number;
  expires?: number;
  [k: string]: unknown;
}

export class SignedRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignedRequestError';
  }
}

function b64urlDecode(s: string): Buffer {
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(s)) throw new SignedRequestError('bad encoding');
  const norm = s.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(norm + '='.repeat((4 - (norm.length % 4)) % 4), 'base64');
}

export function parseSignedRequest(
  signedRequest: unknown,
  appSecret: string,
  opts: { maxAgeSec?: number; now?: number } = {},
): SignedRequestPayload {
  if (typeof signedRequest !== 'string' || signedRequest.length > 8192) throw new SignedRequestError('missing');
  if (!appSecret) throw new SignedRequestError('no secret');
  const parts = signedRequest.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new SignedRequestError('format');
  const [encSig, encPayload] = parts;

  const sig = b64urlDecode(encSig);
  const expected = createHmac('sha256', appSecret).update(encPayload).digest();
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) throw new SignedRequestError('signature');

  let payload: SignedRequestPayload;
  try {
    payload = JSON.parse(b64urlDecode(encPayload).toString('utf8'));
  } catch {
    throw new SignedRequestError('payload');
  }
  if (!payload || typeof payload !== 'object') throw new SignedRequestError('payload');
  if (String(payload.algorithm).toUpperCase() !== 'HMAC-SHA256') throw new SignedRequestError('algorithm');
  if (opts.maxAgeSec && payload.issued_at) {
    const now = Math.floor((opts.now ?? Date.now()) / 1000);
    if (now - payload.issued_at > opts.maxAgeSec) throw new SignedRequestError('expired');
  }
  return payload;
}

/** Допоміжна функція для тестів і локальної перевірки. */
export function createSignedRequest(payload: Record<string, unknown>, appSecret: string): string {
  const enc = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', appSecret).update(enc).digest('base64url');
  return `${sig}.${enc}`;
}
