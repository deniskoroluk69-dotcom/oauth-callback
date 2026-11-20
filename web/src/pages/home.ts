import { PLATFORMS, PLATFORM_ORDER } from '@platforms';
import { t } from '../i18n';
import { href, type Page } from '../router';
import { ICON, platformIcon } from '../components/icons';

function sparkPath(seed: number, w = 520, h = 150, n = 30): { line: string; area: string; prev: string } {
  let x = seed;
  const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  const pts: number[] = [];
  const prev: number[] = [];
  let v = 60;
  let p = 55;
  for (let i = 0; i < n; i++) {
    v += (rnd() - 0.35) * 10 + (i % 7 === 5 ? 14 : 0);
    p += (rnd() - 0.45) * 8;
    pts.push(Math.max(10, v));
    prev.push(Math.max(10, p));
  }
  const max = Math.max(...pts, ...prev) * 1.1;
  const toXY = (arr: number[]) =>
    arr.map((y, i) => `${((i / (n - 1)) * w).toFixed(1)},${(h - (y / max) * h).toFixed(1)}`);
  const line = `M${toXY(pts).join(' L')}`;
  return { line, area: `${line} L${w},${h} L0,${h} Z`, prev: `M${toXY(prev).join(' L')}` };
}

function heroMock(): string {
  const p = sparkPath(7);
  return `
  <div class="mock" aria-hidden="true">
    <div class="mock-kpis">
      <div class="mock-kpi"><div class="l">${t('dashboard.kpi.followers')}</div><div class="v">48.2K</div><div class="d">+6.4%</div></div>
      <div class="mock-kpi"><div class="l">${t('dashboard.kpi.views')}</div><div class="v">1.3M</div><div class="d">+18.1%</div></div>
      <div class="mock-kpi"><div class="l">${t('dashboard.kpi.interactions')}</div><div class="v">92K</div><div class="d">+9.7%</div></div>
    </div>
    <svg viewBox="0 0 520 160" role="img">
      <defs><linearGradient id="hg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".28"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
      ${[0, 1, 2, 3].map((i) => `<line x1="0" x2="520" y1="${i * 50 + 5}" y2="${i * 50 + 5}" stroke="var(--chart-grid)"/>`).join('')}
      <path d="${p.prev}" fill="none" stroke="var(--chart-prev)" stroke-width="2" stroke-dasharray="5 4"/>
      <path d="${p.area}" fill="url(#hg)"/>
      <path d="${p.line}" fill="none" stroke="var(--accent)" stroke-width="2.6" stroke-linejoin="round"/>
    </svg>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      ${PLATFORM_ORDER.slice(0, 6).map((id) => platformIcon(id, 'sm')).join('')}
    </div>
  </div>`;
}

/** Плейсхолдери скриншотів кабінету (намальовані SVG, щоб не залежати від зображень). */
function shot(kind: 1 | 2 | 3): string {
  const bar = (x: number, w: number, y: number, c = 'var(--bg-muted)') => `<rect x="${x}" y="${y}" width="${w}" height="8" rx="4" fill="${c}"/>`;
  let body = '';
  if (kind === 1) {
    const p = sparkPath(3, 300, 90, 24);
    body = `
      <rect x="64" y="14" width="76" height="40" rx="6" fill="var(--bg-muted)"/><rect x="148" y="14" width="76" height="40" rx="6" fill="var(--bg-muted)"/><rect x="232" y="14" width="76" height="40" rx="6" fill="var(--accent-soft)"/>
      <g transform="translate(64,70)"><path d="${p.area}" fill="var(--accent)" opacity=".15"/><path d="${p.line}" fill="none" stroke="var(--accent)" stroke-width="2"/></g>`;
  } else if (kind === 2) {
    const colors = ['#ff0033', '#1877f2', '#e1306c', '#00c2b8'];
    body = colors
      .map((c, i) => {
        const x = 64 + (i % 2) * 124;
        const y = 14 + Math.floor(i / 2) * 76;
        return `<rect x="${x}" y="${y}" width="116" height="68" rx="8" fill="var(--bg-muted)"/><rect x="${x + 10}" y="${y + 10}" width="18" height="18" rx="5" fill="${c}"/>${bar(x + 34, 60, y + 15, 'var(--border-strong)')}${bar(x + 10, 50, y + 40, i === 3 ? 'var(--warn-soft)' : 'var(--ok-soft)')}`;
      })
      .join('');
  } else {
    body = [0, 1, 2, 3, 4]
      .map((i) => `<rect x="64" y="${16 + i * 30}" width="34" height="22" rx="4" fill="${['#ff0033', '#e1306c', '#1877f2', '#00c2b8', '#7c3aed'][i]}" opacity=".85"/>${bar(106, 120 - i * 10, 23 + i * 30, 'var(--border-strong)')}${bar(270, 36, 23 + i * 30)}`)
      .join('');
  }
  return `<svg viewBox="0 0 320 170" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <rect width="320" height="170" fill="var(--bg)"/>
    <rect width="52" height="170" fill="var(--bg-elev)"/><rect x="10" y="12" width="32" height="8" rx="4" fill="var(--accent)"/>${bar(10, 30, 34)}${bar(10, 26, 50)}${bar(10, 30, 66)}
    ${body}
  </svg>`;
}

export const homePage: Page = {
  meta: 'home',
  layout: 'public',
  render(ctx) {
    const L = ctx.lang;
    const features = [
      [ICON.layers, 'f1'],
      [ICON.clock, 'f2'],
      [ICON.compare, 'f3'],
      [ICON.lock, 'f4'],
    ];
    return `
    <section class="hero">
      <div class="container hero-grid">
        <div>
          <span class="badge-pill">${ICON.shield}${t('home.badge')}</span>
          <h1>${t('home.title').replace(/—\s*(.+)$/, '— <span class="grad">$1</span>')}</h1>
          <p class="lead">${t('home.subtitle')}</p>
          <div class="hero-cta">
            <a class="btn btn-primary btn-lg" href="${href(ctx.user ? '/app/connections' : '/login', L)}">${t('home.ctaLogin')}</a>
            <a class="btn btn-secondary btn-lg" href="#how">${t('home.ctaHow')}</a>
          </div>
          <p class="readonly-note">${ICON.check}<span>${t('home.readOnly')}</span></p>
        </div>
        ${heroMock()}
      </div>
    </section>

    <section class="section" id="features" aria-labelledby="features-h">
      <div class="container">
        <div class="section-head"><h2 id="features-h">${t('home.featuresTitle')}</h2></div>
        <div class="grid-4">
          ${features.map(([ic, k]) => `<article class="card"><div class="feature-icon">${ic}</div><h3>${t(`home.${k}t`)}</h3><p class="muted">${t(`home.${k}d`)}</p></article>`).join('')}
        </div>
      </div>
    </section>

    <section class="section" id="how" aria-labelledby="how-h">
      <div class="container">
        <div class="section-head"><h2 id="how-h">${t('home.howTitle')}</h2></div>
        <ol class="grid-3" style="list-style:none;padding:0;margin:0">
          ${[1, 2, 3].map((n) => `<li class="card"><span class="step-num">${n}</span><h3>${t(`home.s${n}t`)}</h3><p class="muted">${t(`home.s${n}d`)}</p></li>`).join('')}
        </ol>
      </div>
    </section>

    <section class="section" id="platforms" aria-labelledby="pl-h">
      <div class="container">
        <div class="section-head"><h2 id="pl-h">${t('home.platformsTitle')}</h2><p class="muted">${t('home.platformsText')}</p></div>
        <ul class="platform-grid" style="list-style:none;padding:0;margin:0">
          ${PLATFORM_ORDER.map((id) => {
            const p = PLATFORMS[id];
            const soon = !p.enabled && !p.uploadFallback;
            return `<li class="platform-chip">${platformIcon(id)}<span>${p.name}</span>${soon ? `<span class="status status-soon soon">${t('common.soon')}</span>` : ''}</li>`;
          }).join('')}
        </ul>
      </div>
    </section>

    <section class="section" aria-labelledby="shots-h">
      <div class="container">
        <div class="section-head"><h2 id="shots-h">${t('home.shotsTitle')}</h2></div>
        <div class="shots">
          ${([1, 2, 3] as const).map((n) => `<div class="shot"><figure><div class="shot-frame">${shot(n)}</div><figcaption>${t(`home.shot${n}`)}</figcaption></figure></div>`).join('')}
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="trust-h">
      <div class="container trust">
        <div><span class="feature-icon">${ICON.shield}</span><h2 id="trust-h">${t('home.trustTitle')}</h2><p class="muted">${t('home.readOnly')}</p></div>
        <ul class="check-list card">
          ${['t1', 't2', 't3'].map((k) => `<li>${ICON.check}<span>${t(`home.${k}`)}</span></li>`).join('')}
        </ul>
      </div>
      <div class="container">
        <div class="cta-band">
          <div><h2>${t('home.ctaBottomTitle')}</h2><p>${t('home.ctaBottomText')}</p></div>
          <a class="btn btn-lg" href="${href('/login', L)}">${t('home.ctaLogin')}</a>
        </div>
      </div>
    </section>`;
  },
};
