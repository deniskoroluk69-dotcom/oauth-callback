/** Доступ відкликано / токен недійсний → потрібне перепідключення. */
export class AuthError extends Error {
  constructor(message = 'auth') {
    super(message);
    this.name = 'AuthError';
  }
}

/** Тимчасова помилка (429, 5xx, мережа) → повтор Cloud Tasks з затримкою. */
export class TransientError extends Error {
  constructor(message = 'transient') {
    super(message);
    this.name = 'TransientError';
  }
}

/** Підключення зараз обробляє інший воркер. */
export class LockedError extends TransientError {
  constructor() {
    super('locked');
    this.name = 'LockedError';
  }
}

/** Помилка, яку можна показати користувачу: message — ключ перекладу. */
export class UserFacingError extends Error {
  constructor(public key: string) {
    super(key);
    this.name = 'UserFacingError';
  }
}
