import { logger } from 'firebase-functions';

/** Поля, які ніколи не можна логувати. */
const SECRET_KEYS = /token|secret|password|authorization|code|signed_request|cookie|key/i;

function redact(v: unknown, depth = 0): unknown {
  if (depth > 4 || v === null || v === undefined) return v;
  if (typeof v === 'string') {
    // Відрізаємо все, що схоже на токени у рядках (Bearer ..., access_token=...).
    return v
      .replace(/(bearer\s+)[\w.\-~+/]+=*/gi, '$1[redacted]')
      .replace(/((?:access|refresh|id)_token["'=:\s]+)[\w.\-~+/]+=*/gi, '$1[redacted]')
      .slice(0, 500);
  }
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => redact(x, depth + 1));
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.test(k) ? '[redacted]' : redact(val, depth + 1);
    }
    return out;
  }
  return v;
}

export function errInfo(e: unknown): Record<string, unknown> {
  if (e instanceof Error) return { name: e.name, message: redact(e.message) };
  return { error: redact(String(e)) };
}

export const log = {
  info: (msg: string, data?: Record<string, unknown>) => logger.info(msg, redact(data ?? {}) as object),
  warn: (msg: string, data?: Record<string, unknown>) => logger.warn(msg, redact(data ?? {}) as object),
  error: (msg: string, data?: Record<string, unknown>) => logger.error(msg, redact(data ?? {}) as object),
};

export { redact };
