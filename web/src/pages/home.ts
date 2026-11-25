import { PLATFORMS, PLATFORM_ORDER, type PlatformId } from '@platforms';
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
      <div class="mock-kpi"><div class="l">${t('dashboard.kpi.followers')}</div><div class="v">${t('home.pv.v1')}</div><div class="d">▲ ${t('home.pv.d1')}</div></div>
      <div class="mock-kpi"><div class="l">${t('dashboard.kpi.views')}</div><div class="v">${t('home.pv.v2')}</div><div class="d">▲ ${t('home.pv.d2')}</div></div>
      <div class="mock-kpi"><div class="l">${t('dashboard.kpi.interactions')}</div><div class="v">${t('home.pv.v3')}</div><div class="d">▲ ${t('home.pv.d3')}</div></div>
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

/** Мініатюрні превʼю кабінету (живий HTML у стилі сайту — без зображень і заглушок). */
function preview(kind: 1 | 2 | 3): string {
  const head = (title: string, meta: string) =>
    `<div class="pv-head"><span class="pv-logo">${ICON.logo}</span><strong>${title}</strong><span class="pv-meta">${meta}</span></div>`;
  if (kind === 1) {
    const p = sparkPath(3, 300, 80, 24);
    const kpi = (label: string, value: string, delta: string) =>
      `<div class="pv-kpi"><span class="pv-label">${label}</span><span class="pv-value">${value}</span><span class="pv-delta up">▲ ${delta}</span></div>`;
    return `
      ${head(t('dashboard.title'), t('dashboard.d30'))}
      <div class="pv-kpis">
        ${kpi(t('dashboard.kpi.followers'), t('home.pv.v1'), t('home.pv.d1'))}
        ${kpi(t('dashboard.kpi.views'), t('home.pv.v2'), t('home.pv.d2'))}
        ${kpi(t('dashboard.kpi.interactions'), t('home.pv.v3'), t('home.pv.d3'))}
      </div>
      <svg class="pv-chart" viewBox="0 0 300 80" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="pvg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".25"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
        <line x1="0" x2="300" y1="20" y2="20" stroke="var(--chart-grid)"/><line x1="0" x2="300" y1="50" y2="50" stroke="var(--chart-grid)"/>
        <path d="${p.prev}" fill="none" stroke="var(--chart-prev)" stroke-width="1.5" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>
        <path d="${p.area}" fill="url(#pvg)"/>
        <path d="${p.line}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>
      </svg>
      <div class="pv-legend"><span><i style="background:var(--accent)"></i>${t('dashboard.current')}</span><span><i class="dashed"></i>${t('dashboard.previous')}</span></div>`;
  }
  if (kind === 2) {
    const row = (id: PlatformId, account: string, st: 'active' | 'needs_reconnect') =>
      `<div class="pv-row">${platformIcon(id, 'sm')}<span class="pv-title"><strong>${PLATFORMS[id].name}</strong><span class="pv-sub">${account}</span></span><span class="status status-${st}">${t(`connections.status.${st}`)}</span></div>`;
    return `
      ${head(t('connections.title'), t('home.pv.updated'))}
      ${row('youtube', t('home.pv.acc1'), 'active')}
      ${row('instagram', '@knb.club', 'active')}
      ${row('tiktok', '@knb.club', 'active')}
      ${row('facebook', t('home.pv.acc2'), 'needs_reconnect')}`;
  }
  const post = (id: PlatformId, n: number, views: string) =>
    `<div class="pv-row">${platformIcon(id, 'sm')}<span class="pv-title"><strong>${t(`home.pv.p${n}`)}</strong><span class="pv-sub">${PLATFORMS[id].name}</span></span><span class="pv-num">${views}</span><span class="pv-open" aria-hidden="true">↗</span></div>`;
  return `
    ${head(t('dashboard.top'), t('dashboard.col.views'))}
    ${post('youtube', 1, '72 436')}
    ${post('instagram', 2, '54 120')}
    ${post('tiktok', 3, '41 870')}
    ${post('facebook', 4, '18 305')}`;
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
          ${([1, 2, 3] as const).map((n) => `<div class="shot"><figure><div class="shot-frame pv" role="img" aria-label="${t(`home.shot${n}`)}">${preview(n)}</div><figcaption>${t(`home.shot${n}`)}</figcaption></figure></div>`).join('')}
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
