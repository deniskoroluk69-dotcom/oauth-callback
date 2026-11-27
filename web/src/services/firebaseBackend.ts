/**
 * Робочий бекенд: Firebase Auth + Firestore (лише читання своїх даних) +
 * Cloud Functions (усі зміни). Токени платформ сюди НІКОЛИ не потрапляють.
 */
import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken, type AppCheck } from 'firebase/app-check';
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { PLATFORMS, type ContentDoc, type DailyDoc } from '@platforms';
import type { Lang } from '../i18n';
import { getTheme } from '../lib/theme';
import { SITE } from '../config/site';
import { UserError, type AppUser, type Backend, type Connection, type Profile } from './types';

const env = import.meta.env;
const USE_EMU = env.VITE_USE_EMULATORS === 'true';

function toAppUser(u: User | null): AppUser | null {
  if (!u) return null;
  return {
    uid: u.uid,
    email: u.email,
    displayName: u.displayName,
    emailVerified: u.emailVerified,
    providerId: u.providerData[0]?.providerId ?? 'password',
  };
}

const AUTH_ERRORS: Record<string, string> = {
  'auth/invalid-credential': 'login.err.invalid',
  'auth/wrong-password': 'login.err.invalid',
  'auth/user-not-found': 'login.err.invalid',
  'auth/invalid-email': 'login.err.email',
  'auth/weak-password': 'login.err.weak',
  'auth/email-already-in-use': 'login.err.exists',
  'auth/popup-closed-by-user': 'login.err.popup',
  'auth/cancelled-popup-request': 'login.err.popup',
  'auth/too-many-requests': 'login.err.tooMany',
  'auth/network-request-failed': 'login.err.network',
};

/** Перетворює помилки SDK/функцій на ключі перекладу, без технічних подробиць. */
function userError(e: unknown): UserError {
  const code = (e as { code?: string })?.code ?? '';
  if (AUTH_ERRORS[code]) return new UserError(AUTH_ERRORS[code]);
  const msg = (e as { message?: string })?.message ?? '';
  if (/^[a-z]+\.[A-Za-z.]+$/.test(msg)) return new UserError(msg);
  return new UserError('common.error');
}

export function createFirebaseBackend(): Backend {
  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID || 'demo-knb-stats',
    appId: env.VITE_FIREBASE_APP_ID,
  });

  let appCheck: AppCheck | null = null;
  if (env.VITE_RECAPTCHA_SITE_KEY && !USE_EMU) {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(env.VITE_RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  }

  const auth = getAuth(app);
  const db = getFirestore(app);
  const fns = getFunctions(app, env.VITE_FIREBASE_REGION || 'europe-west1');
  if (USE_EMU) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  }

  const call = async <Req, Res>(name: string, data: Req): Promise<Res> => {
    try {
      const r = await httpsCallable<Req, Res>(fns, name)(data);
      return r.data;
    } catch (e) {
      throw userError(e);
    }
  };
  const uid = () => {
    const u = auth.currentUser;
    if (!u) throw new UserError('common.error');
    return u.uid;
  };

  return {
    mode: 'firebase',
    onAuth(cb) {
      return onAuthStateChanged(auth, (u) => cb(toAppUser(u)));
    },
    async signInWithGoogle() {
      try {
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        await signInWithPopup(auth, provider);
      } catch (e) {
        throw userError(e);
      }
    },
    async signInWithEmail(email, password) {
      try {
        await signInWithEmailAndPassword(auth, email, password);
      } catch (e) {
        throw userError(e);
      }
    },
    async signUpWithEmail(email, password, lang) {
      try {
        auth.languageCode = lang;
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(cred.user, { url: `${location.origin}/${lang}/app/dashboard` });
      } catch (e) {
        throw userError(e);
      }
    },
    async resendVerification() {
      if (!auth.currentUser) return;
      try {
        await sendEmailVerification(auth.currentUser);
      } catch (e) {
        throw userError(e);
      }
    },
    async reloadUser() {
      if (!auth.currentUser) return null;
      await reload(auth.currentUser);
      await auth.currentUser.getIdToken(true);
      return toAppUser(auth.currentUser);
    },
    async resetPassword(email, lang: Lang) {
      auth.languageCode = lang;
      await sendPasswordResetEmail(auth, email, { url: `${location.origin}/${lang}/login` });
    },
    async signOut() {
      await signOut(auth);
    },

    async getProfile() {
      const snap = await getDoc(doc(db, 'users', uid()));
      const d = (snap.data() ?? {}) as Partial<Profile>;
      return { lang: d.lang ?? 'uk', theme: d.theme ?? getTheme(), notifyEmail: d.notifyEmail ?? auth.currentUser?.email ?? '' };
    },
    async saveProfile(p) {
      // Правила Firestore дозволяють клієнту писати лише ці поля власного профілю.
      const allowed: Partial<Profile> = {};
      if (p.lang) allowed.lang = p.lang;
      if (p.theme) allowed.theme = p.theme;
      if (p.notifyEmail !== undefined) allowed.notifyEmail = p.notifyEmail;
      await setDoc(doc(db, 'users', uid()), allowed, { merge: true });
    },

    watchConnections(cb) {
      return onSnapshot(collection(db, 'users', uid(), 'connections'), (snap) => {
        cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Connection, 'id'>) })));
      });
    },
    async startConnect(platform, lang) {
      const provider = PLATFORMS[platform].provider;
      if (!provider) throw new UserError('connections.err.generic');
      const idToken = await auth.currentUser!.getIdToken();
      const headers: Record<string, string> = { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' };
      if (appCheck) headers['X-Firebase-AppCheck'] = (await getToken(appCheck)).token;
      // Сервер (api-піддомен) повертає адресу /connect/{provider}/go, яку браузер відкриває сам:
      // так захисний cookie ставиться на домені API як «свій», а не сторонній.
      const res = await fetch(`${SITE.API_BASE}/connect/${provider}/start`, {
        method: 'POST',
        headers,
        credentials: 'omit',
        body: JSON.stringify({ platform, lang }),
      });
      if (!res.ok) throw new UserError('connections.err.generic');
      const { url } = (await res.json()) as { url: string };
      location.assign(url);
    },
    getPendingSelection: (id) => call('getPendingSelection', { id }),
    confirmSelection: (id, accountIds) => call('confirmSelection', { id, accountIds }),
    disconnect: (connectionId) => call('disconnectConnection', { connectionId }),
    refreshNow: (connectionId) => call('refreshNow', { connectionId }),
    connectTelegram: (channel) => call('connectTelegram', { channel }),

    async getDaily(from, to) {
      const q = query(collection(db, 'users', uid(), 'daily'), where('date', '>=', from), where('date', '<=', to));
      return (await getDocs(q)).docs.map((d) => d.data() as DailyDoc);
    },
    async getContent(from, to) {
      const a = Date.parse(`${from}T00:00:00Z`) - 86400000;
      const b = Date.parse(`${to}T23:59:59Z`) + 86400000;
      const q = query(collection(db, 'users', uid(), 'content'), where('publishedAt', '>=', a), where('publishedAt', '<=', b));
      return (await getDocs(q)).docs.map((d) => d.data() as ContentDoc);
    },

    async deleteAccount() {
      await call('deleteAccount', {});
      await signOut(auth);
    },
    submitContact: (data) => call('submitContact', data),
    async getDeletionStatus(code) {
      const snap = await getDoc(doc(db, 'deletionRequests', code));
      if (!snap.exists()) return null;
      const d = snap.data() as { status: 'received' | 'completed'; createdAt: number; completedAt: number | null };
      return { status: d.status, createdAt: d.createdAt, completedAt: d.completedAt ?? null };
    },
  };
}
