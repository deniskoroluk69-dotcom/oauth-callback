import { db } from './admin';
import { getWrapper } from './crypto';
import { KMS_KEY_NAME, isEmulator } from './env';
import { FirestoreSecretStore, type SecretStore } from './tokenStore';

let store: SecretStore | null = null;
export function secretStore(): SecretStore {
  if (!store) store = new FirestoreSecretStore(db(), getWrapper(KMS_KEY_NAME.value(), isEmulator()));
  return store;
}

/** Обгортка для шифрування довільних даних (тимчасові вибори акаунтів). */
export function keyWrapper() {
  return getWrapper(KMS_KEY_NAME.value(), isEmulator());
}
