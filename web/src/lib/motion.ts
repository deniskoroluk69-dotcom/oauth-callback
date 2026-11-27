/**
 * Анімації інтерфейсу: поява блоків при прокручуванні, «набігання» чисел,
 * «живий» перший екран (змінна платформа, сповіщення, зростання цифр),
 * підсвітка й нахил карток за курсором, смуга прогресу прокручування.
 * Повністю вимикаються, якщо користувач обрав «зменшити рух» у системі.
 * Без JavaScript (і для пошукових роботів) увесь вміст видно одразу: приховування
 * діє лише під класом html.anim.
 */
import { fmtCompact, fmtNum } from '../i18n';

export const MOTION_OK = typeof window !== 'undefined' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const FINE_POINTER = typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

/** Блоки, що плавно з'являються при прокручуванні. */
const REVEAL = [
  '.section-head',
  '.grid-4 > *',
  '.grid-3 > *',
  '.steps',
  '.stats-band > *',
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

/** Картки з підсвіткою й нахилом за курсором. */
const TILT = '.grid-4 > .card, .grid-3 > .card, .shot-frame, .platform-chip, .stat';

let io: IntersectionObserver | null = null;
let timers: number[] = [];

export function initMotion() {
  if (!MOTION_OK) return;
  document.documentElement.classList.add('anim');
  initScrollProgress();
  if (FINE_POINTER) initPointerEffects();
}

/* ---------- Числа ---------- */

function animateNumber(el: HTMLElement, target: number, format: (n: number) => string, dur = 1400) {
  const start = performance.now();
  let done = false;
  const finish = () => {
    done = true;
    el.textContent = format(target);
  };
  const step = () => {
    if (done) return;
    const k = Math.min(1, (performance.now() - start) / dur);
    if (k >= 1) return finish();
    el.textContent = format(target * (1 - Math.pow(1 - k, 3)));
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  // Якщо кадри анімації пригальмовані (фонова вкладка) — фінальне число все одно з'явиться.
  timers.push(window.setTimeout(finish, dur + 300));
}

function countUp(el: HTMLElement) {
  if (el.dataset.counted) return;
  el.dataset.counted = '1';
  if (el.dataset.count !== undefined) {
    const target = Number(el.dataset.count);
    if (Number.isFinite(target)) animateNumber(el, target, (n) => fmtCompact(n));
  } else if (el.dataset.countInt !== undefined) {
    const target = Number(el.dataset.countInt);
    if (Number.isFinite(target)) animateNumber(el, target, (n) => fmtNum(Math.round(n), { maximumFractionDigits: 0 }), 1100);
  }
}

/* ---------- «Живий» перший екран ---------- */

function every(ms: number, fn: () => void) {
  timers.push(
    window.setInterval(() => {
      if (!document.hidden) fn();
    }, ms),
  );
}

function startLiveHero(root: HTMLElement) {
  // 1) Платформа в рядку «Наживо» змінюється по колу.
  const rot = root.querySelector<HTMLElement>('[data-rotate]');
  if (rot) {
    const items = Array.from(rot.children) as HTMLElement[];
    let i = 0;
    every(2200, () => {
      const prev = items[i];
      i = (i + 1) % items.length;
      prev.classList.remove('is-on');
      prev.classList.add('is-off');
      items[i].classList.remove('is-off');
      items[i].classList.add('is-on');
      window.setTimeout(() => prev.classList.remove('is-off'), 500);
    });
  }

  // 2) Сповіщення спливають біля картки по черзі.
  const toasts = Array.from(root.querySelectorAll<HTMLElement>('.mock-toast'));
  if (toasts.length) {
    let j = 0;
    const show = () => {
      toasts.forEach((t) => t.classList.remove('show'));
      toasts[j].classList.add('show');
      j = (j + 1) % toasts.length;
    };
    timers.push(window.setTimeout(show, 2600));
    every(3600, show);
  }

  // 3) Цифри в картці потроху ростуть, ніби дані надходять наживо.
  const kpis = Array.from(root.querySelectorAll<HTMLElement>('.mock .mock-kpi .v[data-count]'));
  const values = kpis.map((el) => Number(el.dataset.count));
  every(3200, () => {
    const k = Math.floor(Math.random() * kpis.length);
    const el = kpis[k];
    if (!el) return;
    values[k] += Math.max(1, Math.round(values[k] * (0.0008 + Math.random() * 0.0015)));
    el.textContent = fmtCompact(values[k]);
    el.classList.remove('bump');
    void el.offsetWidth; // перезапуск CSS-анімації
    el.classList.add('bump');
  });
}

/* ---------- Курсор: підсвітка й нахил ---------- */

function initPointerEffects() {
  let raf = 0;
  let last: PointerEvent | null = null;
  let current: HTMLElement | null = null;
  const reset = (el: HTMLElement | null) => {
    if (!el) return;
    el.style.removeProperty('--tilt-x');
    el.style.removeProperty('--tilt-y');
    el.classList.remove('is-tilting');
  };
  document.addEventListener(
    'pointermove',
    (e) => {
      last = e;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!last) return;
        const el = (last.target as HTMLElement | null)?.closest?.(TILT) as HTMLElement | null;
        if (el !== current) {
          reset(current);
          current = el;
        }
        if (!el) return;
        const r = el.getBoundingClientRect();
        const x = (last.clientX - r.left) / r.width;
        const y = (last.clientY - r.top) / r.height;
        el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
        el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
        const max = el.classList.contains('platform-chip') ? 4 : 6;
        el.style.setProperty('--tilt-x', `${((0.5 - y) * max).toFixed(2)}deg`);
        el.style.setProperty('--tilt-y', `${((x - 0.5) * max).toFixed(2)}deg`);
        el.classList.add('is-tilting');
      });
    },
    { passive: true },
  );
  document.addEventListener('pointerleave', () => reset(current), { passive: true });
}

/* ---------- Смуга прогресу прокручування ---------- */

function initScrollProgress() {
  const bar = document.createElement('div');
  bar.className = 'scroll-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);
  let raf = 0;
  const update = () => {
    raf = 0;
    const h = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${h > 0 ? Math.min(1, scrollY / h) : 0})`;
  };
  addEventListener(
    'scroll',
    () => {
      if (!raf) raf = requestAnimationFrame(update);
    },
    { passive: true },
  );
  addEventListener('resize', update, { passive: true });
  update();
}

/* ---------- Після кожного рендеру сторінки ---------- */

export function applyMotion(root: HTMLElement) {
  timers.forEach((t) => {
    clearTimeout(t);
    clearInterval(t);
  });
  timers = [];
  if (!MOTION_OK || !('IntersectionObserver' in window)) return;
  io?.disconnect();
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        el.classList.add('in');
        el.querySelectorAll<HTMLElement>('[data-count], [data-count-int]').forEach(countUp);
        if (el.matches('[data-count-int]')) countUp(el);
        // Страховка: якщо CSS-анімація не програлась, через 3 с блок показується в кінцевому стані.
        timers.push(window.setTimeout(() => el.classList.add('done'), 3000));
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
  root.querySelectorAll<HTMLElement>('[data-count], [data-count-int]').forEach((el) => {
    if (!el.closest('.reveal')) countUp(el);
  });
  if (root.querySelector('.mock')) startLiveHero(root);
}
