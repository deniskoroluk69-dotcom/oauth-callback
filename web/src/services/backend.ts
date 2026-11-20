import { IS_DEMO } from '../config/site';
import type { Backend } from './types';

let instance: Promise<Backend> | null = null;

/** Firebase налаштовано, якщо під час збірки задано ключ веб-застосунку. */
export const FIREBASE_CONFIGURED = !!import.meta.env.VITE_FIREBASE_API_KEY || import.meta.env.VITE_USE_EMULATORS === 'true';

/** Ледаче завантаження: у демо Firebase SDK взагалі не потрапляє в браузер. */
export function getBackend(): Promise<Backend> {
  if (!instance) {
    if (IS_DEMO) {
      instance = import('./demoBackend').then((m) => m.createDemoBackend());
    } else if (!FIREBASE_CONFIGURED) {
      instance = import('./unavailableBackend').then((m) => m.createUnavailableBackend());
    } else {
      instance = import('./firebaseBackend')
        .then((m) => m.createFirebaseBackend())
        .catch(async () => (await import('./unavailableBackend')).createUnavailableBackend());
    }
  }
  return instance;
}
