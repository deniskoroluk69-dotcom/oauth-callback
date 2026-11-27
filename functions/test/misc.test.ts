import { describe, expect, it } from 'vitest';
import { LocalWrapper, decryptJson, encryptJson } from '../src/lib/crypto';
import { redact } from '../src/lib/log';
import { normalizeChannel } from '../src/platforms/telegram';
import { chunks } from '../src/lib/dates';

describe('envelope encryption', () => {
  const w = new LocalWrapper();
  it('шифрує і розшифровує', async () => {
    const blob = await encryptJson(w, { accessToken: 'secret-a', refreshToken: 'secret-r' }, 'conn_1');
    expect(JSON.stringify(blob)).not.toContain('secret-a');
    expect(await decryptJson(w, blob, 'conn_1')).toEqual({ accessToken: 'secret-a', refreshToken: 'secret-r' });
  });
  it('не розшифровує з іншим AAD (connectionId)', async () => {
    const blob = await encryptJson(w, { a: 1 }, 'conn_1');
    await expect(decryptJson(w, blob, 'conn_2')).rejects.toThrow();
  });
  it('виявляє підміну шифротексту', async () => {
    const blob = await encryptJson(w, { a: 1 }, 'c');
    const ct = Buffer.from(blob.ct, 'base64');
    ct[0] ^= 1;
    await expect(decryptJson(w, { ...blob, ct: ct.toString('base64') }, 'c')).rejects.toThrow();
  });
});

describe('логування без секретів', () => {
  it('приховує токени в ключах і рядках', () => {
    const r = redact({ access_token: 'abc', nested: { refreshToken: 'x' }, msg: 'Authorization: Bearer ya29.AbC-123', url: 'https://x?access_token=zzz' }) as Record<string, unknown>;
    const s = JSON.stringify(r);
    expect(s).not.toContain('abc');
    expect(s).not.toContain('ya29');
    expect(s).not.toContain('zzz');
  });
});



describe('інше', () => {
  it('нормалізує назву Telegram-каналу', () => {
    expect(normalizeChannel('my_channel')).toBe('@my_channel');
    expect(normalizeChannel('https://t.me/my_channel')).toBe('@my_channel');
    expect(() => normalizeChannel('@a')).toThrow();
  });
  it('ділить діапазон дат на шматки', () => {
    expect(chunks('2026-01-01', '2026-01-10', 4)).toEqual([
      ['2026-01-01', '2026-01-04'],
      ['2026-01-05', '2026-01-08'],
      ['2026-01-09', '2026-01-10'],
    ]);
  });
});
