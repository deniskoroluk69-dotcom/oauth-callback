// Smoke-тест у Firebase Emulator Suite (без реальних ключів платформ):
//   npm run test:smoke
// Перевіряє: Hosting rewrites → функції, OAuth start (state + cookie + PKCE),
// хуки Meta (signed_request) з видаленням токенів і даних, статус видалення, callable-функцію.
import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const PROJECT = 'demo-knb-stats';
const HOST = 'http://127.0.0.1:5000';
const META_SECRET = 'emulator-meta-secret'; // з functions/.secret.local (фіктивний)
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
initializeApp({ projectId: PROJECT });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

let failed = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failed++;
};
const signed = (payload) => {
  const enc = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${createHmac('sha256', META_SECRET).update(enc).digest('base64url')}.${enc}`;
};

// 0. Чекаємо, поки емулятор завантажить функції
for (let i = 0; i < 30; i++) {
  const probe = await fetch(`${HOST}/connect/google/start`, { method: 'POST' }).catch(() => null);
  if (probe && probe.status !== 404) break;
  await new Promise((res) => setTimeout(res, 1000));
}

// 1. Користувач в Auth-емуляторі
const signUp = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: `smoke${Date.now()}@example.com`, password: 'secret123', returnSecureToken: true }),
}).then((r) => r.json());
const uid = signUp.localId;
// Підтверджуємо пошту через емулятор
await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=fake`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
  body: JSON.stringify({ localId: uid, emailVerified: true }),
});
const signIn = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: signUp.email, password: 'secret123', returnSecureToken: true }),
}).then((r) => r.json());
ok(!!signIn.idToken, 'вхід в Auth-емуляторі');

// 2. OAuth start без токена → 401
let r = await fetch(`${HOST}/connect/google/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
ok(r.status === 401, `start без авторизації → 401 (отримано ${r.status})`);

// 3. OAuth start з токеном → url Google з state, PKCE і cookie __session
r = await fetch(`${HOST}/connect/google/start`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signIn.idToken}` },
  body: JSON.stringify({ platform: 'youtube', lang: 'en' }),
});
const body = await r.json();
const goUrl = new URL(body.url);
ok(r.status === 200 && goUrl.pathname === '/connect/google/go' && goUrl.searchParams.get('t'), 'start → адреса /connect/google/go на домені API');
ok(!r.headers.get('set-cookie'), 'start (фоновий запит із сайту) не ставить cookie');

// 3a. go: браузер відкриває адресу API → cookie __session + 302 на сторінку дозволу Google
r = await fetch(body.url, { redirect: 'manual' });
const url = new URL(r.headers.get('location') ?? 'http://x');
ok(r.status === 302 && url.host === 'accounts.google.com', 'go → сторінка дозволу Google');
ok(url.searchParams.get('access_type') === 'offline' && url.searchParams.get('prompt') === 'consent', 'access_type=offline, prompt=consent');
ok(url.searchParams.get('scope').includes('youtube.readonly') && url.searchParams.get('code_challenge_method') === 'S256', 'scopes лише читання + PKCE S256');
ok(url.searchParams.get('redirect_uri') === 'http://localhost:5000/connect/google/callback', 'redirect_uri на домені API');
const setCookie = r.headers.get('set-cookie') ?? '';
ok(/__session=/.test(setCookie) && /HttpOnly/i.test(setCookie) && /Path=\/connect/.test(setCookie), "cookie __session (HttpOnly, Path=/connect) для прив'язки state до браузера");
r = await fetch(body.url, { redirect: 'manual' });
ok(r.headers.get('location')?.includes('error=expired'), 'квиток go одноразовий');
const state = url.searchParams.get('state');

// 3b. CORS: preflight з домену сайту дозволено, з чужого — ні
r = await fetch(`${HOST}/connect/google/start`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST' } });
ok(r.status === 204 && r.headers.get('access-control-allow-origin') === 'http://localhost:5173', 'CORS: домен сайту дозволено');
// Hosting-емулятор сам відповідає на preflight, тому перевіряємо функцію напряму і сам POST.
r = await fetch(`http://127.0.0.1:5001/${PROJECT}/europe-west1/connect/google/start`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } });
ok(r.status === 403 && !r.headers.get('access-control-allow-origin'), 'CORS: preflight з чужого домену відхилено');
r = await fetch(`${HOST}/connect/google/start`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json', Authorization: `Bearer ${signIn.idToken}` }, body: '{}' });
ok(r.headers.get('access-control-allow-origin') !== 'https://evil.example', 'CORS: відповідь не дозволена для читання чужим доменом');

// 4. Callback з чужим браузером (без cookie) → expired, state спожито
r = await fetch(`${HOST}/connect/google/callback?state=${encodeURIComponent(state)}&code=fake`, { redirect: 'manual' });
ok(r.status === 302 && r.headers.get('location').includes('error=expired'), 'callback без cookie → відмова (CSRF-захист)');
r = await fetch(`${HOST}/connect/google/callback?state=${encodeURIComponent(state)}&code=fake`, { redirect: 'manual' });
ok(r.headers.get('location').includes('error=expired'), 'state одноразовий');

// 5. Відмова користувача на сторінці дозволу → повернення на сайт з error=denied
r = await fetch(`${HOST}/connect/google/start`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signIn.idToken}` },
  body: JSON.stringify({ platform: 'youtube', lang: 'uk' }),
});
r = await fetch((await r.json()).url, { redirect: 'manual' });
const st2 = new URL(r.headers.get('location')).searchParams.get('state');
const cookie = (r.headers.get('set-cookie') ?? '').split(';')[0];
r = await fetch(`${HOST}/connect/google/callback?state=${encodeURIComponent(st2)}&error=access_denied`, { redirect: 'manual', headers: { Cookie: cookie } });
ok(r.headers.get('location') === 'http://localhost:5173/uk/app/connections?error=denied', 'відмова → повернення на сайт /uk/app/connections?error=denied');

// 6. Невідома / непідтримувана платформа → 404
r = await fetch(`${HOST}/connect/myspace/start`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signIn.idToken}` },
  body: JSON.stringify({ platform: 'myspace' }),
});
ok(r.status === 404, `непідтримувана платформа відхиляється (${r.status})`);

// 7. Хуки Meta: готуємо підключення з токеном і даними
const connId = 'facebook_aaaaaaaaaaaaaaaaaaaaaaaa';
await db.doc(`users/${uid}/connections/${connId}`).set({ platform: 'facebook', provider: 'meta', providerUserId: 'meta-user-1', externalId: 'page1', accountName: 'Page', status: 'active' });
await db.doc(`secrets/${connId}`).set({ blob: { ct: 'x' }, uid });
await db.doc(`users/${uid}/daily/${connId}_2026-11-01`).set({ views: 1, connectionId: connId });
await db.doc(`users/${uid}/content/${connId}_p1`).set({ title: 't', connectionId: connId });

r = await fetch(`${HOST}/hooks/meta/deauthorize`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'signed_request=bad.sig' });
ok(r.status === 400, 'deauthorize з невалідним підписом → 400');

r = await fetch(`${HOST}/hooks/meta/deauthorize`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `signed_request=${signed({ algorithm: 'HMAC-SHA256', user_id: 'meta-user-1', issued_at: Math.floor(Date.now() / 1000) })}`,
});
const c1 = (await db.doc(`users/${uid}/connections/${connId}`).get()).data();
ok(r.status === 200 && c1?.status === 'disconnected', 'deauthorize → підключення «disconnected»');
ok(!(await db.doc(`secrets/${connId}`).get()).exists, 'deauthorize → токени видалено');
ok(!(await db.doc(`users/${uid}/daily/${connId}_2026-11-01`).get()).exists, 'deauthorize → статистику видалено');

// 8. Data deletion
await db.doc(`users/${uid}/connections/${connId}`).set({ status: 'active' }, { merge: true });
await db.doc(`secrets/${connId}`).set({ blob: { ct: 'x' }, uid });
r = await fetch(`${HOST}/hooks/meta/data-deletion`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `signed_request=${signed({ algorithm: 'HMAC-SHA256', user_id: 'meta-user-1' })}`,
});
const del = await r.json();
ok(r.status === 200 && del.url?.startsWith('http://localhost:5173/en/data-deletion?code=') && del.confirmation_code, 'data-deletion → { url, confirmation_code }');
ok(!(await db.doc(`users/${uid}/connections/${connId}`).get()).exists, 'data-deletion → підключення видалено повністю');
const dr = (await db.doc(`deletionRequests/${del.confirmation_code}`).get()).data();
ok(dr?.status === 'completed' && dr.completedAt, 'статус запиту збережено: completed');

// 9. Автовидалення даних, які не оновлювалися 30 днів (вимога YouTube, обіцянка в Privacy Policy)
process.env.KMS_KEY_NAME = 'local';
process.env.FUNCTIONS_EMULATOR = 'true';
const { purgeStale } = require('./lib/sync/dispatcher.js');
const stale = 'youtube_bbbbbbbbbbbbbbbbbbbbbbbb';
const fresh = 'youtube_cccccccccccccccccccccccc';
const DAY = 86400000;
await db.doc(`users/${uid}/connections/${stale}`).set({ platform: 'youtube', provider: 'google', status: 'needs_reconnect', lastSyncAt: Date.now() - 40 * DAY, source: 'oauth', accountName: 'Old' });
await db.doc(`users/${uid}/connections/${fresh}`).set({ platform: 'youtube', provider: 'google', status: 'needs_reconnect', lastSyncAt: Date.now() - 5 * DAY, source: 'oauth', accountName: 'Recent' });
await db.doc(`secrets/${stale}`).set({ blob: { ct: 'x' }, uid });
await db.doc(`users/${uid}/daily/${stale}_2026-10-01`).set({ views: 1, connectionId: stale });
await db.doc(`users/${uid}/daily/${fresh}_2026-11-10`).set({ views: 1, connectionId: fresh });
await purgeStale();
ok((await db.doc(`users/${uid}/connections/${stale}`).get()).get('status') === 'disconnected', 'дані без оновлення > 30 днів: підключення → disconnected');
ok(!(await db.doc(`secrets/${stale}`).get()).exists && !(await db.doc(`users/${uid}/daily/${stale}_2026-10-01`).get()).exists, 'дані без оновлення > 30 днів: токени й статистику видалено');
ok((await db.doc(`users/${uid}/daily/${fresh}_2026-11-10`).get()).exists, 'свіжі дані (5 днів) не чіпаємо');

// 10. Callable submitContact (honeypot і валідація)
r = await fetch(`http://127.0.0.1:5001/${PROJECT}/europe-west1/submitContact`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: { name: 'Test', email: 'bad', message: 'hello there' } }),
});
const sc = await r.json();
ok(sc.error?.message === 'contact.invalid', 'submitContact: невалідна пошта → ключ помилки без технічних подробиць');

console.log(failed ? `\n${failed} перевірок не пройшло` : '\nУсі smoke-перевірки пройшли');
process.exit(failed ? 1 : 0);
