import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { LocalWrapper, decryptJson, encryptJson } from '../src/lib/crypto';
import { redact } from '../src/lib/log';
import { parseLinkedInExport } from '../src/platforms/linkedin';
import { parseFeed, assertPublicUrl } from '../src/platforms/podcast';
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

describe('імпорт експорту LinkedIn', () => {
  it('розбирає CSV', () => {
    const csv = 'Date,Impressions (total),Reactions (total),Comments (total),Reposts (total),Clicks (total)\n09/01/2026,1200,30,5,2,10\n09/02/2026,900,20,1,0,4\n';
    const rows = parseLinkedInExport(Buffer.from(csv));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ date: '2026-09-01', views: 1200, likes: 30, comments: 5, shares: 2, interactions: 47 });
  });
  it('розбирає XLSX з кількома аркушами й заголовком не в першому рядку', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Aggregated'], ['Date', 'Impressions (total)'], ['2026-09-01', 100]]), 'Updates');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Date', 'Organic followers', 'Sponsored followers', 'Total followers'], ['2026-09-01', 3, 1, 500]]), 'Followers');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const rows = parseLinkedInExport(buf);
    expect(rows[0]).toMatchObject({ date: '2026-09-01', views: 100, followers: 500, newFollowers: 4, breakdown: { organic: 3, paid: 1 } });
  });
  it('кидає помилку на чужому файлі', () => {
    expect(() => parseLinkedInExport(Buffer.from('hello,world\n1,2'))).toThrow();
  });
});

describe('подкаст RSS', () => {
  it('розбирає стрічку', () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Мій подкаст</title><link>https://ex.com</link>
      <item><title>Епізод 2</title><guid>ep-2</guid><link>https://ex.com/2</link><pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate></item>
      <item><title>Епізод 1</title><guid isPermaLink="false">ep-1</guid><enclosure url="https://ex.com/1.mp3" type="audio/mpeg"/></item>
    </channel></rss>`;
    const f = parseFeed(xml);
    expect(f.title).toBe('Мій подкаст');
    expect(f.episodes).toHaveLength(2);
    expect(f.episodes[0]).toMatchObject({ postId: 'ep-2', title: 'Епізод 2', url: 'https://ex.com/2' });
    expect(f.episodes[1].url).toBe('https://ex.com/1.mp3');
  });
  it('відхиляє не-RSS', () => {
    expect(() => parseFeed('<html><body>hi</body></html>')).toThrow();
  });
  it.each(['http://localhost/feed', 'http://127.0.0.1/x', 'http://10.0.0.5/x', 'http://169.254.169.254/latest', 'file:///etc/passwd', 'http://metadata.google.internal/'])(
    'блокує SSRF: %s',
    async (u) => {
      await expect(assertPublicUrl(u)).rejects.toThrow();
    },
  );
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
