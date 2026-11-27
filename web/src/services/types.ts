import type { ConnectionDoc, ContentDoc, DailyDoc, PlatformId } from '@platforms';
import type { Lang } from '../i18n';
import type { Theme } from '../lib/theme';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
  /** 'password' → потребує підтвердження пошти. */
  providerId: 'google.com' | 'password' | string;
}

export interface Profile {
  lang: Lang;
  theme: Theme;
  notifyEmail: string;
}

export interface Connection extends ConnectionDoc {
  id: string;
}

export interface PendingAccount {
  id: string;
  platform: PlatformId;
  name: string;
  subtitle?: string;
}

export interface DeletionStatus {
  status: 'received' | 'completed';
  createdAt: number;
  completedAt: number | null;
}

/** Помилка, яку можна показати користувачу (ключ перекладу). */
export class UserError extends Error {
  constructor(
    public key: string,
    public vars?: Record<string, string | number>,
  ) {
    super(key);
  }
}

export interface Backend {
  readonly mode: 'demo' | 'firebase' | 'unavailable';
  /** Підписка на зміну користувача. Перший виклик — після ініціалізації. */
  onAuth(cb: (user: AppUser | null) => void): () => void;
  signInWithGoogle(): Promise<void>;
  signInWithEmail(email: string, password: string): Promise<void>;
  signUpWithEmail(email: string, password: string, lang: Lang): Promise<void>;
  resendVerification(): Promise<void>;
  reloadUser(): Promise<AppUser | null>;
  resetPassword(email: string, lang: Lang): Promise<void>;
  signOut(): Promise<void>;

  getProfile(): Promise<Profile>;
  saveProfile(p: Partial<Profile>): Promise<void>;

  watchConnections(cb: (list: Connection[]) => void): () => void;
  /** Починає OAuth: сервер створює state і повертає адресу сторінки дозволу. */
  startConnect(platform: PlatformId, lang: Lang): Promise<void>;
  getPendingSelection(id: string): Promise<{ platform: PlatformId; accounts: PendingAccount[] }>;
  confirmSelection(id: string, accountIds: string[]): Promise<void>;
  disconnect(connectionId: string): Promise<void>;
  refreshNow(connectionId: string): Promise<{ queued: boolean; retryInMinutes?: number }>;
  connectTelegram(channel: string): Promise<{ title: string }>;

  getDaily(from: string, to: string): Promise<DailyDoc[]>;
  getContent(from: string, to: string): Promise<ContentDoc[]>;

  deleteAccount(): Promise<void>;
  submitContact(data: { name: string; email: string; message: string; hp: string; lang: Lang }): Promise<void>;
  getDeletionStatus(code: string): Promise<DeletionStatus | null>;

  /** Лише демо: інструменти імітації. */
  demo?: {
    connectAll(): Promise<void>;
    simulateNightly(): Promise<void>;
    simulateExpired(): Promise<void>;
    consent(platform: PlatformId, allow: boolean, lang: Lang): Promise<string>;
  };
}
