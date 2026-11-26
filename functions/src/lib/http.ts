import { AuthError, TransientError } from './errors';

export interface FetchOpts {
  method?: string;
  headers?: Record<string, string>;
  body?: string | URLSearchParams;
  form?: Record<string, string>;
  json?: unknown;
  timeoutMs?: number;
  /** Додаткові коди, які треба вважати помилкою авторизації (напр. 400 invalid_grant). */
  authErrorMatch?: (status: number, body: string) => boolean;
}

/**
 * fetch з тайм-аутом і класифікацією помилок. Текст відповіді платформи НЕ
 * потрапляє в повідомлення помилки (там можуть бути токени).
 */
export async function fetchJson<T = unknown>(url: string, opts: FetchOpts = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20000);
  const headers: Record<string, string> = { Accept: 'application/json', ...(opts.headers ?? {}) };
  let body: string | URLSearchParams | undefined = opts.body;
  if (opts.form) {
    body = new URLSearchParams(opts.form);
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
  } else if (opts.json !== undefined) {
    body = JSON.stringify(opts.json);
    headers['Content-Type'] = 'application/json';
  }
  let res: Response;
  try {
    res = await fetch(url, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body, signal: ctrl.signal });
  } catch {
    throw new TransientError(`network ${new URL(url).host}`);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  const host = new URL(url).host;
  if (!res.ok) {
    if (opts.authErrorMatch?.(res.status, text)) throw new AuthError(`auth ${host} ${res.status}`);
    if (res.status === 401) throw new AuthError(`auth ${host} 401`);
    if (res.status === 429 || res.status >= 500) throw new TransientError(`http ${host} ${res.status}`);
    if (/quota|rateLimit|rate limit|"code"\s*:\s*(4|17|32|613)\b/i.test(text)) throw new TransientError(`quota ${host}`);
    // Meta: код 190 = недійсний токен.
    if (/"code"\s*:\s*190\b/.test(text) || /invalid_grant|invalid_token|access_token_invalid|expired/i.test(text)) {
      throw new AuthError(`auth ${host} ${res.status}`);
    }
    if (res.status === 403) throw new AuthError(`forbidden ${host}`);
    throw new Error(`http ${host} ${res.status}`);
  }
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new TransientError(`bad json ${host}`);
  }
}

export function qs(params: Record<string, string | number | boolean | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.set(k, String(v));
  return u.toString();
}
