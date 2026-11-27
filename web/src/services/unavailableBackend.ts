/**
 * Використовується, коли сайт зібрано без налаштувань Firebase (VITE_FIREBASE_*):
 * публічні сторінки працюють як звичайно, а вхід у кабінет показує
 * «тимчасово недоступний» замість помилки.
 */
import { UserError, type Backend } from './types';

const fail = async (): Promise<never> => {
  throw new UserError('common.unavailable');
};

export function createUnavailableBackend(): Backend {
  return {
    mode: 'unavailable',
    onAuth(cb) {
      setTimeout(() => cb(null), 0);
      return () => undefined;
    },
    signInWithGoogle: fail,
    signInWithEmail: fail,
    signUpWithEmail: fail,
    resendVerification: fail,
    reloadUser: async () => null,
    resetPassword: fail,
    signOut: async () => undefined,
    getProfile: fail,
    saveProfile: fail,
    watchConnections(cb) {
      setTimeout(() => cb([]), 0);
      return () => undefined;
    },
    startConnect: fail,
    getPendingSelection: fail,
    confirmSelection: fail,
    disconnect: fail,
    refreshNow: fail,
    connectTelegram: fail,
    getDaily: async () => [],
    getContent: async () => [],
    deleteAccount: fail,
    submitContact: fail,
    getDeletionStatus: fail,
  };
}
