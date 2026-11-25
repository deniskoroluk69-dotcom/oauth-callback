import { esc } from '../lib/dom';
import { fmtCompact, fmtDate, fmtNum } from '../i18n';

export interface Series {
  name: string;
  color: string;
  values: (number | null)[];
  /** Підписи дат для цього ряду (для ряду порівняння — свої дати). */
  dates: string[];
  dashed?: boolean;
  area?: boolean;
}

export interface LineChartOptions {
  series: Series[];
  height?: number;
  format?: (n: number) => string;
  ariaLabel: string;
  /** false → вісь Y від мінімуму даних (для накопичувальних показників, напр. підписників). */
  fromZero?: boolean;
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (max <= min) return [Math.max(0, min - 1), max + 1];
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) ticks.push(Number(v.toFixed(6)));
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

/**
 * Лінійний графік на SVG з точним наведенням: вертикальна лінія, точки на всіх
 * рядах, підказка з точними значеннями. Підтримує клавіатуру (←/→, Home/End).
 */
export function mountLineChart(host: HTMLElement, opts: LineChartOptions): () => void {
  const fmt = opts.format ?? ((n: number) => fmtNum(n));
  const H = opts.height ?? 280;
  const pad = { t: 12, r: 12, b: 28, l: 48 };
  let idx = -1;
  let W = 0;

  host.classList.add('chart', 'chart-intro');
  // Анімація малювання лише при першій появі, не при кожній перебудові (resize).
  setTimeout(() => host.classList.remove('chart-intro'), 2200);
  host.innerHTML = `<svg tabindex="0" role="img" aria-label="${esc(opts.ariaLabel)}"></svg><div class="chart-tip" aria-hidden="true"></div><p class="sr-only" aria-live="polite"></p>`;
  const svg = host.querySelector('svg')!;
  const tip = host.querySelector('.chart-tip') as HTMLElement;
  const live = host.querySelector('.sr-only') as HTMLElement;

  const n = Math.max(...opts.series.map((s) => s.values.length), 0);
  const allVals = opts.series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const dataMax = Math.max(...allVals, 0);
  const dataMin = opts.fromZero === false && allVals.length ? Math.min(...allVals) : 0;
  const ticks = niceTicks(opts.fromZero === false ? dataMin - (dataMax - dataMin) * 0.1 : 0, dataMax);
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1] || 1;

  const x = (i: number) => pad.l + (n <= 1 ? (W - pad.l - pad.r) / 2 : (i / (n - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - pad.t - pad.b);

  function path(vals: (number | null)[]) {
    let d = '';
    let pen = false;
    vals.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      pen = true;
    });
    return d.trim();
  }

  function draw() {
    W = Math.max(280, host.clientWidth);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    const dates = opts.series[0]?.dates ?? [];
    const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - pad.l) / 80))));
    const xLabels = dates
      .map((d, i) =>
        i % labelEvery === 0 || i === n - 1
          ? `<text x="${x(i)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${esc(fmtDate(d, { day: 'numeric', month: 'short' }))}</text>`
          : '',
      )
      .join('');
    const grid = ticks
      .map((tk) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(tk)}" y2="${y(tk)}"/>`)
      .join('');
    const yLabels = ticks.map((tk) => `<text x="${pad.l - 8}" y="${y(tk) + 4}" text-anchor="end">${esc(fmtCompact(tk))}</text>`).join('');
    const gid = `g${Math.random().toString(36).slice(2, 8)}`;
    const lines = opts.series
      .map((s) => {
        const d = path(s.values);
        if (!d) return '';
        const area =
          s.area && n > 1
            ? `<path class="area-in" d="${d} L${x(s.values.length - 1)},${y(yMin)} L${x(0)},${y(yMin)} Z" fill="url(#${gid}-${s.color.replace(/[^a-z0-9]/gi, '')})"/>`
            : '';
        return `${area}<path ${s.dashed ? 'class="fade-in"' : 'class="draw" pathLength="1"'} d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.dashed ? 2 : 2.5}" ${s.dashed ? 'stroke-dasharray="5 4"' : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
      })
      .join('');
    const defs = opts.series
      .filter((s) => s.area)
      .map(
        (s) =>
          `<linearGradient id="${gid}-${s.color.replace(/[^a-z0-9]/gi, '')}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity=".22"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient>`,
      )
      .join('');
    svg.innerHTML = `<defs>${defs}</defs><g class="grid">${grid}</g><g class="axis">${yLabels}${xLabels}</g>${lines}<g class="hover"></g><rect class="hit" x="${pad.l}" y="0" width="${Math.max(0, W - pad.l - pad.r)}" height="${H}" fill="transparent"/>`;
    if (idx >= 0) highlight(idx);
  }

  function highlight(i: number) {
    idx = Math.max(0, Math.min(n - 1, i));
    const g = svg.querySelector('.hover')!;
    const dots = opts.series
      .map((s) => {
        const v = s.values[idx];
        return v === null || v === undefined ? '' : `<circle cx="${x(idx)}" cy="${y(v)}" r="4.5" fill="var(--bg-elev)" stroke="${s.color}" stroke-width="2.5"/>`;
      })
      .join('');
    g.innerHTML = `<line x1="${x(idx)}" x2="${x(idx)}" y1="${pad.t}" y2="${H - pad.b}" stroke="var(--border-strong)" stroke-dasharray="3 3"/>${dots}`;
    const rows = opts.series
      .map((s) => {
        const v = s.values[idx];
        const d = s.dates[idx];
        return `<div class="tip-row"><span><span class="sw" style="background:${s.color}"></span>${d ? esc(fmtDate(d, { day: 'numeric', month: 'short' })) : esc(s.name)}</span><strong>${v === null || v === undefined ? '—' : esc(fmt(v))}</strong></div>`;
      })
      .join('');
    const main = opts.series[0]?.dates[idx];
    tip.innerHTML = `<div class="tip-date">${main ? esc(fmtDate(main, { weekday: 'short', day: 'numeric', month: 'long' })) : ''}</div>${rows}`;
    tip.classList.add('show');
    const tipW = tip.offsetWidth || 160;
    const left = x(idx) + 14 + tipW > W ? x(idx) - tipW - 14 : x(idx) + 14;
    tip.style.left = `${Math.max(0, left)}px`;
    tip.style.top = `${pad.t}px`;
    live.textContent = tip.textContent ?? '';
  }

  function hide() {
    idx = -1;
    svg.querySelector('.hover')!.innerHTML = '';
    tip.classList.remove('show');
  }

  function onMove(e: PointerEvent) {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = n <= 1 ? 0 : Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (n - 1));
    if (i !== idx) highlight(i);
  }
  function onKey(e: KeyboardEvent) {
    if (!n) return;
    if (e.key === 'ArrowRight') highlight(idx < 0 ? 0 : idx + 1);
    else if (e.key === 'ArrowLeft') highlight(idx < 0 ? n - 1 : idx - 1);
    else if (e.key === 'Home') highlight(0);
    else if (e.key === 'End') highlight(n - 1);
    else if (e.key === 'Escape') hide();
    else return;
    e.preventDefault();
  }

  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerdown', onMove);
  svg.addEventListener('pointerleave', hide);
  svg.addEventListener('keydown', onKey);
  svg.addEventListener('blur', hide);
  const ro = new ResizeObserver(() => draw());
  ro.observe(host);
  draw();
  return () => ro.disconnect();
}
