import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { SignedRequestError, createSignedRequest, parseSignedRequest } from '../src/lib/signedRequest';

const SECRET = 'test-app-secret';

describe('parseSignedRequest', () => {
  it('приймає коректно підписаний запит', () => {
    const sr = createSignedRequest({ algorithm: 'HMAC-SHA256', user_id: '1234567890', issued_at: 1700000000 }, SECRET);
    const p = parseSignedRequest(sr, SECRET);
    expect(p.user_id).toBe('1234567890');
    expect(p.algorithm).toBe('HMAC-SHA256');
  });

  it('сумісний з еталонним форматом Meta (base64url без доповнення)', () => {
    const payload = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: '42' })).toString('base64url');
    const sig = createHmac('sha256', SECRET).update(payload).digest('base64url');
    expect(parseSignedRequest(`${sig}.${payload}`, SECRET).user_id).toBe('42');
  });

  it('відхиляє неправильний підпис', () => {
    const sr = createSignedRequest({ algorithm: 'HMAC-SHA256', user_id: '1' }, 'other-secret');
    expect(() => parseSignedRequest(sr, SECRET)).toThrow(SignedRequestError);
  });

  it('відхиляє змінений payload', () => {
    const sr = createSignedRequest({ algorithm: 'HMAC-SHA256', user_id: '1' }, SECRET);
    const [sig] = sr.split('.');
    const forged = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: '999' })).toString('base64url');
    expect(() => parseSignedRequest(`${sig}.${forged}`, SECRET)).toThrow(/signature/);
  });

  it('відхиляє інший алгоритм', () => {
    const sr = createSignedRequest({ algorithm: 'none', user_id: '1' }, SECRET);
    expect(() => parseSignedRequest(sr, SECRET)).toThrow(/algorithm/);
  });

  it.each([undefined, '', 'abc', 'a.b.c', '.payload', 'sig.', 'не base64.!!!', 123, {}])('відхиляє некоректний формат: %s', (v) => {
    expect(() => parseSignedRequest(v, SECRET)).toThrow(SignedRequestError);
  });

  it('відхиляє, якщо секрет порожній', () => {
    const sr = createSignedRequest({ algorithm: 'HMAC-SHA256', user_id: '1' }, SECRET);
    expect(() => parseSignedRequest(sr, '')).toThrow(SignedRequestError);
  });

  it('перевіряє вік запиту, якщо задано maxAgeSec', () => {
    const sr = createSignedRequest({ algorithm: 'HMAC-SHA256', user_id: '1', issued_at: 1000 }, SECRET);
    expect(() => parseSignedRequest(sr, SECRET, { maxAgeSec: 60, now: 1_000_000_000 })).toThrow(/expired/);
    expect(parseSignedRequest(sr, SECRET, { maxAgeSec: 60, now: 1030 * 1000 }).user_id).toBe('1');
  });

  it('відхиляє надто довгий рядок', () => {
    expect(() => parseSignedRequest('a'.repeat(9000), SECRET)).toThrow(SignedRequestError);
  });
});
