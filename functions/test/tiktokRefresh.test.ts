import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemorySecretStore } from '../src/lib/tokenStore';
import { AuthError, LockedError } from '../src/lib/errors';
import { getFreshTokens, withLock } from '../src/sync/tokens';
import { tiktokProvider } from '../src/platforms/tiktok';

const ID = 'tiktok_conn_1';
const NOW = 1_800_000_000_000;

function tokenResponse(n: number) {
  return new Response(
    JSON.stringify({
      access_token: `access-${n}`,
      expires_in: 86400,
      open_id: 'open-1',
      refresh_token: `refresh-${n}`,
      refresh_expires_in: 31536000,
      scope: 'user.info.basic,video.list',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('TikTok: оновлення токенів з ротацією refresh token', () => {
  let store: MemorySecretStore;
  let calls: { body: string }[];

  beforeEach(() => {
    process.env.TIKTOK_SANDBOX_CLIENT_KEY = 'test-key';
    process.env.TIKTOK_SANDBOX_CLIENT_SECRET = 'test-secret';
    store = new MemorySecretStore(() => NOW);
    calls = [];
    let n = 1;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push({ body: String(init.body) });
        n += 1;
        return tokenResponse(n);
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('оновлює прострочений access token і ОДРАЗУ зберігає новий refresh token', async () => {
    await store.write(ID, null, { accessToken: 'access-1', refreshToken: 'refresh-1', accessExpiresAt: NOW - 1000, refreshExpiresAt: NOW + 1e10 });
    const writesBefore = store.data.get(ID)!.writes;

    const fresh = await withLock(store, ID, (lockId) => getFreshTokens(store, ID, lockId, tiktokProvider, NOW));

    expect(fresh.accessToken).toBe('access-2');
    expect(fresh.refreshToken).toBe('refresh-2');
    expect(calls).toHaveLength(1);
    expect(calls[0].body).toContain('grant_type=refresh_token');
    expect(calls[0].body).toContain('refresh_token=refresh-1');
    // Новий (ротований) токен записано у сховище.
    expect(store.data.get(ID)!.writes).toBe(writesBefore + 1);
    expect((await store.read(ID))!.refreshToken).toBe('refresh-2');
    // Блокування знято.
    expect(store.data.get(ID)!.lockId).toBeNull();
  });

  it('не оновлює, якщо access token ще дійсний більше години', async () => {
    await store.write(ID, null, { accessToken: 'access-1', refreshToken: 'refresh-1', accessExpiresAt: NOW + 5 * 3600e3 });
    const t = await withLock(store, ID, (lockId) => getFreshTokens(store, ID, lockId, tiktokProvider, NOW));
    expect(t.accessToken).toBe('access-1');
    expect(calls).toHaveLength(0);
  });

  it('другий воркер не може оновлювати одночасно (блокування)', async () => {
    await store.write(ID, null, { accessToken: 'a', refreshToken: 'r', accessExpiresAt: NOW - 1 });
    const lock1 = await store.acquire(ID, 600_000);
    await expect(store.acquire(ID, 600_000)).rejects.toBeInstanceOf(LockedError);
    await expect(withLock(store, ID, async () => 'never')).rejects.toBeInstanceOf(LockedError);
    await store.release(ID, lock1);
    await expect(withLock(store, ID, async () => 'ok')).resolves.toBe('ok');
  });

  it('прострочене блокування можна перехопити', async () => {
    let now = NOW;
    store = new MemorySecretStore(() => now);
    await store.acquire(ID, 1000);
    now += 2000;
    await expect(store.acquire(ID, 1000)).resolves.toBeTypeOf('string');
  });

  it('запис з чужим lockId відхиляється — старий воркер не перезапише свіжий токен', async () => {
    await store.write(ID, null, { accessToken: 'a', refreshToken: 'r1' });
    let now = NOW;
    store = new MemorySecretStore(() => now);
    await store.write(ID, null, { accessToken: 'a', refreshToken: 'r1' });
    const stale = await store.acquire(ID, 1000);
    now += 5000; // блокування першого воркера спливло
    const fresh = await store.acquire(ID, 1000);
    await store.write(ID, fresh, { accessToken: 'b', refreshToken: 'r2' });
    await expect(store.write(ID, stale, { accessToken: 'x', refreshToken: 'r-stale' })).rejects.toBeInstanceOf(LockedError);
    expect((await store.read(ID))!.refreshToken).toBe('r2');
  });

  it('invalid_grant → AuthError (потрібне перепідключення), токени не змінюються', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Refresh token is invalid' }), { status: 400 })),
    );
    await store.write(ID, null, { accessToken: 'a', refreshToken: 'r1', accessExpiresAt: NOW - 1 });
    await expect(withLock(store, ID, (l) => getFreshTokens(store, ID, l, tiktokProvider, NOW))).rejects.toBeInstanceOf(AuthError);
    expect((await store.read(ID))!.refreshToken).toBe('r1');
    expect(store.data.get(ID)!.lockId).toBeNull();
  });

  it('прострочений refresh token → AuthError без запиту до TikTok', async () => {
    await store.write(ID, null, { accessToken: 'a', refreshToken: 'r', accessExpiresAt: NOW - 1, refreshExpiresAt: NOW - 1 });
    await expect(withLock(store, ID, (l) => getFreshTokens(store, ID, l, tiktokProvider, NOW))).rejects.toBeInstanceOf(AuthError);
    expect(calls).toHaveLength(0);
  });

  it('послідовні оновлення використовують щойно ротований токен', async () => {
    await store.write(ID, null, { accessToken: 'access-1', refreshToken: 'refresh-1', accessExpiresAt: NOW - 1 });
    await withLock(store, ID, (l) => getFreshTokens(store, ID, l, tiktokProvider, NOW));
    // Імітуємо, що минула доба: знову прострочено.
    const t = (await store.read(ID))!;
    await store.write(ID, null, { ...t, accessExpiresAt: NOW - 1 });
    await withLock(store, ID, (l) => getFreshTokens(store, ID, l, tiktokProvider, NOW));
    expect(calls[1].body).toContain('refresh_token=refresh-2');
    expect((await store.read(ID))!.refreshToken).toBe('refresh-3');
  });
});
