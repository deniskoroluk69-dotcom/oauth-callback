export type Theme = 'system' | 'light' | 'dark';
const KEY = 'knb-theme';

export function getTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* ignore */
  }
  return 'system';
}

export function effectiveTheme(): 'light' | 'dark' {
  const th = getTheme();
  if (th !== 'system') return th;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(th: Theme = getTheme()) {
  try {
    localStorage.setItem(KEY, th);
  } catch {
    /* ignore */
  }
  const root = document.documentElement;
  if (th === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', th);
  window.dispatchEvent(new CustomEvent('themechange'));
}

export function toggleTheme() {
  applyTheme(effectiveTheme() === 'dark' ? 'light' : 'dark');
}
