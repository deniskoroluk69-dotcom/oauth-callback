import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

if (!getApps().length) initializeApp();

let _db: Firestore | null = null;
export function db(): Firestore {
  if (!_db) {
    _db = getFirestore();
    try {
      _db.settings({ ignoreUndefinedProperties: true });
    } catch {
      /* екземпляр уже використано (напр. у скриптах перевірки) — налаштування лишаються як є */
    }
  }
  return _db;
}
