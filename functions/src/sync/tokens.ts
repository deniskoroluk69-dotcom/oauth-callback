/**
 * Оновлення токенів під блокуванням.
 * Порядок для провайдерів з ротацією refresh token (TikTok):
 *   1) взяти блокування  2) прочитати токени  3) оновити на платформі
 *   4) ОДРАЗУ записати новий набір (поки блокування наше)  5) лише потім збирати дані.
 * Якщо запис не вдався — новий refresh token не загубиться мовчки: кидаємо помилку,
 * а старий токен лишається у сховищі (його ще можна використати, якщо платформа
 * не встигла інвалідувати).
 */
import { AuthError } from '../lib/errors';
import type { SecretStore, TokenSet } from '../lib/tokenStore';
import type { OAuthProvider } from '../platforms/types';

export const LOCK_TTL_MS = 10 * 60 * 1000;

export async function withLock<T>(store: SecretStore, id: string, fn: (lockId: string) => Promise<T>, ttlMs = LOCK_TTL_MS): Promise<T> {
  const lockId = await store.acquire(id, ttlMs);
  try {
    return await fn(lockId);
  } finally {
    await store.release(id, lockId).catch(() => undefined);
  }
}

export async function getFreshTokens(
  store: SecretStore,
  id: string,
  lockId: string,
  provider: Pick<OAuthProvider, 'needsRefresh' | 'refresh'>,
  now = Date.now(),
): Promise<TokenSet> {
  const tokens = await store.read(id);
  if (!tokens) throw new AuthError('no tokens');
  if (tokens.refreshExpiresAt && tokens.refreshExpiresAt < now) throw new AuthError('refresh token expired');
  if (!provider.refresh || !provider.needsRefresh?.(tokens, now)) return tokens;
  const fresh = await provider.refresh(tokens);
  // Записуємо негайно — до будь-яких інших запитів.
  await store.write(id, lockId, fresh);
  return fresh;
}
