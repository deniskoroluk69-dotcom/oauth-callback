/**
 * Анімації інтерфейсу: поява блоків при прокручуванні, «набігання» чисел.
 * Повністю вимикаються, якщо користувач обрав «зменшити рух» у системі.
 * Без JavaScript (і для пошукових роботів) увесь вміст видно одразу: приховування
 * діє лише під класом html.anim, який ставить цей модуль.
 */
import { fmtCompact } from '../i18n';

export const MOTION_OK = typeof window !== 'undefined' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Блоки, що плавно з'являються при прокручуванні. */
const REVEAL = [
  '.section-head',
  '.grid-4 > *',
  '.grid-3 > *',
  '.platform-grid > *',
  '.shots > *',
  '.trust > *',
  '.cta-band',
  '.legal > h2',
  '.legal .rules-box',
  '.legal .table-wrap',
  '.contact-grid > *',
  '.kpi-grid > *',
  '.dash-grid > *',
  '.app-main > .panel',
  '.conn-grid > *',
].join(',');

let io: IntersectionObserver | null = null;

export function initMotion() {
  if (MOTION_OK) document.documentElement.classList.add('anim');
}

function countUp(el: HTMLElement) {
  const target = Number(el.dataset.count);
  if (!Number.isFinite(target) || el.dataset.counted) return;
  el.dataset.counted = '1';
  const start = performance.now();
  const dur = 1400;
  let done = false;
  const finish = () => {
    done = true;
    el.textContent = fmtCompact(target);
  };
  const step = () => {
    if (done) return;
    const k = Math.min(1, (performance.now() - start) / dur);
    if (k >= 1) return finish();
    el.textContent = fmtCompact(target * (1 - Math.pow(1 - k, 3)));
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  // Якщо кадри анімації пригальмовані (фонова вкладка) — фінальне число все одно з'явиться.
  setTimeout(finish, dur + 300);
}

/** Викликається після кожного рендеру сторінки. */
export function applyMotion(root: HTMLElement) {
  if (!MOTION_OK || !('IntersectionObserver' in window)) return;
  io?.disconnect();
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        el.classList.add('in');
        el.querySelectorAll<HTMLElement>('[data-count]').forEach(countUp);
        // Страховка: якщо CSS-анімація не програлась, через 3 с блок показується в кінцевому стані.
        setTimeout(() => el.classList.add('done'), 3000);
        io?.unobserve(el);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );
  const items = Array.from(root.querySelectorAll<HTMLElement>(REVEAL));
  for (const el of items) {
    // Затримка «драбинкою» серед сусідів одного ряду.
    const siblings = el.parentElement ? Array.from(el.parentElement.children).filter((c) => c.matches(REVEAL)) : [];
    const i = Math.max(0, siblings.indexOf(el));
    el.style.setProperty('--reveal-delay', `${Math.min(i, 6) * 80}ms`);
    el.classList.add('reveal');
    io.observe(el);
  }
  // Числа поза анімованими блоками (напр. у першому екрані) — одразу.
  root.querySelectorAll<HTMLElement>('[data-count]').forEach((el) => {
    if (!el.closest('.reveal')) countUp(el);
  });
}
