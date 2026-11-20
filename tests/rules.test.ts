/**
 * Тести правил Firestore. Запуск (потрібна Java):
 *   npm run test:rules:emulator
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';

let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  env = await initializeTestEnvironment({
    projectId: 'demo-knb-stats',
    firestore: { rules: readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'firestore.rules'), 'utf8'), host, port: Number(port) },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/alice'), { lang: 'uk', theme: 'system', notifyEmail: 'a@example.com', createdBy: 'server' });
    await setDoc(doc(db, 'users/alice/connections/youtube_1'), { platform: 'youtube', status: 'active' });
    await setDoc(doc(db, 'users/alice/daily/youtube_1_2026-11-01'), { views: 10, date: '2026-11-01' });
    await setDoc(doc(db, 'users/alice/content/youtube_1_v1'), { title: 'x', publishedAt: 1 });
    await setDoc(doc(db, 'users/bob'), { lang: 'en' });
    await setDoc(doc(db, 'users/bob/daily/tiktok_2_2026-11-01'), { views: 5, date: '2026-11-01' });
    await setDoc(doc(db, 'secrets/youtube_1'), { blob: { ct: 'encrypted' }, uid: 'alice' });
    await setDoc(doc(db, 'oauthStates/s1'), { uid: 'alice' });
    await setDoc(doc(db, 'oauthTickets/t1'), { nonce: 'n', authorizeUrl: 'https://accounts.google.com' });
    await setDoc(doc(db, 'pendingSelections/p1'), { uid: 'alice' });
    await setDoc(doc(db, 'deletionRequests/CODE123'), { status: 'completed', createdAt: 1 });
    await setDoc(doc(db, 'mail/m1'), { to: 'a@example.com' });
  });
});

const alice = () => env.authenticatedContext('alice', { email: 'a@example.com', email_verified: true }).firestore();
const bob = () => env.authenticatedContext('bob').firestore();
const anon = () => env.unauthenticatedContext().firestore();

describe('users/{uid}', () => {
  it('власник читає свій профіль', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'users/alice')));
  });
  it('інший користувач не читає чужий профіль', async () => {
    await assertFails(getDoc(doc(bob(), 'users/alice')));
  });
  it('анонім не читає профілі', async () => {
    await assertFails(getDoc(doc(anon(), 'users/alice')));
  });
  it('власник змінює дозволені налаштування', async () => {
    await assertSucceeds(updateDoc(doc(alice(), 'users/alice'), { lang: 'en', theme: 'dark', notifyEmail: 'new@example.com' }));
  });
  it('власник не може записати інші поля', async () => {
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { role: 'admin' }));
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { createdBy: 'me' }));
  });
  it('некоректні значення відхиляються', async () => {
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { lang: 'de' }));
    await assertFails(updateDoc(doc(alice(), 'users/alice'), { notifyEmail: 'not-an-email' }));
  });
  it('новий користувач створює профіль лише з дозволеними полями', async () => {
    const carol = env.authenticatedContext('carol').firestore();
    await assertSucceeds(setDoc(doc(carol, 'users/carol'), { lang: 'uk', theme: 'light' }));
    const dave = env.authenticatedContext('dave').firestore();
    await assertFails(setDoc(doc(dave, 'users/dave'), { lang: 'uk', plan: 'pro' }));
  });
  it('не можна створити профіль іншого користувача', async () => {
    await assertFails(setDoc(doc(bob(), 'users/eve'), { lang: 'uk' }));
  });
  it('клієнт не може видалити профіль', async () => {
    await assertFails(deleteDoc(doc(alice(), 'users/alice')));
  });
});

describe('статистика й підключення', () => {
  it('власник читає свої підключення, денні дані й публікації', async () => {
    await assertSucceeds(getDocs(collection(alice(), 'users/alice/connections')));
    await assertSucceeds(getDocs(query(collection(alice(), 'users/alice/daily'), where('date', '>=', '2026-10-01'))));
    await assertSucceeds(getDocs(collection(alice(), 'users/alice/content')));
  });
  it('чужі дані недоступні', async () => {
    await assertFails(getDocs(collection(alice(), 'users/bob/daily')));
    await assertFails(getDoc(doc(bob(), 'users/alice/connections/youtube_1')));
  });
  it('клієнт не може писати статистику чи підключення (навіть свої)', async () => {
    await assertFails(setDoc(doc(alice(), 'users/alice/daily/youtube_1_2026-11-02'), { views: 999999 }));
    await assertFails(updateDoc(doc(alice(), 'users/alice/connections/youtube_1'), { status: 'active' }));
    await assertFails(setDoc(doc(alice(), 'users/alice/connections/new'), { platform: 'tiktok' }));
    await assertFails(deleteDoc(doc(alice(), 'users/alice/content/youtube_1_v1')));
  });
  it('невідомі підколекції закриті', async () => {
    await assertFails(getDocs(collection(alice(), 'users/alice/private')));
  });
});

describe('службові колекції', () => {
  it('secrets повністю закриті навіть для власника', async () => {
    await assertFails(getDoc(doc(alice(), 'secrets/youtube_1')));
    await assertFails(getDocs(collection(alice(), 'secrets')));
    await assertFails(setDoc(doc(alice(), 'secrets/youtube_1'), { blob: 'x' }));
  });
  it('oauthStates, oauthTickets, pendingSelections, mail закриті', async () => {
    await assertFails(getDoc(doc(alice(), 'oauthStates/s1')));
    await assertFails(getDoc(doc(anon(), 'oauthTickets/t1')));
    await assertFails(getDoc(doc(alice(), 'oauthTickets/t1')));
    await assertFails(getDoc(doc(alice(), 'pendingSelections/p1')));
    await assertFails(setDoc(doc(alice(), 'mail/x'), { to: 'spam@example.com' }));
  });
  it('deletionRequests: читання одного документа за кодом дозволено, список — ні', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'deletionRequests/CODE123')));
    await assertFails(getDocs(collection(anon(), 'deletionRequests')));
    await assertFails(setDoc(doc(anon(), 'deletionRequests/NEW'), { status: 'completed' }));
  });
});
