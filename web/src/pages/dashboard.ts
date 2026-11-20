import { PLATFORMS, PLATFORM_ORDER, isPlatformId, type ContentDoc, type DailyDoc, type PlatformId } from '@platforms';
import { fmtCompact, fmtDate, fmtNum, fmtPct, t } from '../i18n';
import { esc } from '../lib/dom';
import { addDays, dateRange, daysBetween, isIsoDate, kyivToday } from '../lib/dates';
import { href, type Ctx, type Page } from '../router';
import { ICON, platformIcon } from '../components/icons';
import { mountLineChart } from '../components/chart';
import type { Connection } from '../services/types';

type Metric = 'views' | 'reach' | 'interactions' | 'newFollowers' | 'followers' | 'watchMinutes';
const KPIS: Metric[] = ['followers', 'newFollowers', 'views', 'reach', 'interactions', 'watchMinutes'];

interface State {
  platform: 'all' | PlatformId;
  preset: '7' | '30' | '90' | 'custom';
  from: string;
  to: string;
  compare: 'prev' | 'custom' | 'off';
  cFrom: string;
  cTo: string;
  metric: Metric;
}

function initialState(q: URLSearchParams): State {
  const to = addDays(kyivToday(), -1);
  const preset = (['7', '30', '90', 'custom'].includes(q.get('p') ?? '') ? q.get('p') : '30') as State['preset'];
  let from = addDays(to, -29);
  let end = to;
  if (preset === 'custom' && isIsoDate(q.get('from')) && isIsoDate(q.get('to')) && q.get('from')! <= q.get('to')!) {
    from = q.get('from')!;
    end = q.get('to')!;
  } else if (preset !== 'custom') {
    from = addDays(to, -(Number(preset) - 1));
  }
  const compare = (['prev', 'custom', 'off'].includes(q.get('cmp') ?? '') ? q.get('cmp') : 'prev') as State['compare'];
  const len = daysBetween(from, end);
  let cFrom = addDays(from, -len);
  let cTo = addDays(from, -1);
  if (compare === 'custom' && isIsoDate(q.get('cfrom')) && isIsoDate(q.get('cto'))) {
    cFrom = q.get('cfrom')!;
    cTo = q.get('cto')!;
  }
  const pl = q.get('pl');
  const metric = (KPIS.includes(q.get('m') as Metric) ? q.get('m') : 'views') as Metric;
  return { platform: pl && isPlatformId(pl) ? pl : 'all', preset, from, to: end, compare, cFrom, cTo, metric };
}

function syncUrl(s: State) {
  const q = new URLSearchParams();
  if (s.platform !== 'all') q.set('pl', s.platform);
  q.set('p', s.preset);
  if (s.preset === 'custom') {
    q.set('from', s.from);
    q.set('to', s.to);
  }
  q.set('cmp', s.compare);
  if (s.compare === 'custom') {
    q.set('cfrom', s.cFrom);
    q.set('cto', s.cTo);
  }
  q.set('m', s.metric);
  history.replaceState(null, '', `${location.pathname}?${q}`);
}

/** Агрегація денних рядків по датах. Підписники — сума останніх відомих значень кожного підключення. */
function aggregate(rows: DailyDoc[], dates: string[], metric: Metric): (number | null)[] {
  if (metric === 'followers') {
    const byConn = new Map<string, Map<string, number>>();
    for (const r of rows) {
      if (r.followers === undefined) continue;
      if (!byConn.has(r.connectionId)) byConn.set(r.connectionId, new Map());
      byConn.get(r.connectionId)!.set(r.date, r.followers);
    }
    if (!byConn.size) return dates.map(() => null);
    const last = new Map<string, number>();
    // Беремо останнє відоме значення до початку періоду.
    for (const [cid, m] of byConn) {
      const before = [...m.keys()].filter((d) => d < dates[0]).sort().pop();
      if (before) last.set(cid, m.get(before)!);
    }
    return dates.map((d) => {
      for (const [cid, m] of byConn) if (m.has(d)) last.set(cid, m.get(d)!);
      return last.size ? [...last.values()].reduce((a, b) => a + b, 0) : null;
    });
  }
  const sums = new Map<string, number>();
  let any = false;
  for (const r of rows) {
    const v = r[metric];
    if (typeof v === 'number') {
      sums.set(r.date, (sums.get(r.date) ?? 0) + v);
      any = true;
    }
  }
  if (!any) return dates.map(() => null);
  return dates.map((d) => sums.get(d) ?? 0);
}

function total(vals: (number | null)[], metric: Metric): number | null {
  const nums = vals.filter((v): v is number => v !== null);
  if (!nums.length) return null;
  if (metric === 'followers') return nums[nums.length - 1];
  return nums.reduce((a, b) => a + b, 0);
}

function pct(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

function deltaHtml(p: number | null): string {
  if (p === null) return `<span class="k-delta flat">—</span>`;
  const cls = p > 0.05 ? 'up' : p < -0.05 ? 'down' : 'flat';
  const arrow = cls === 'up' ? '▲' : cls === 'down' ? '▼' : '•';
  return `<span class="k-delta ${cls}">${arrow} ${fmtPct(p)} <span class="k-sub">${t('dashboard.vs')}</span></span>`;
}

function sourceLine(platforms: PlatformId[]): string {
  if (!platforms.length) return '';
  const parts = platforms.map((p) =>
    p === 'youtube'
      ? `${platformIcon('youtube', 'sm')}<a href="https://www.youtube.com" target="_blank" rel="noopener noreferrer">YouTube</a> — ${t('dashboard.sourceYoutube')}`
      : `${platformIcon(p, 'sm')}${esc(PLATFORMS[p].name)}`,
  );
  return `<div class="source">${t('dashboard.source', { name: '' })} ${parts.join(' · ')}</div>`;
}

function emptyState(ctx: Ctx): string {
  return `
  <div class="page-head"><div><h1 tabindex="-1">${t('dashboard.title')}</h1></div></div>
  <section class="panel empty">
    <div class="feature-icon">${ICON.plug}</div>
    <h2>${t('dashboard.emptyTitle')}</h2>
    <p class="muted" style="max-width:460px;margin:0 auto 20px">${t('dashboard.emptyText')}</p>
    <a class="btn btn-primary" href="${href('/app/connections', ctx.lang)}">${t('dashboard.emptyCta')}</a>
  </section>`;
}

export const dashboardPage: Page = {
  meta: 'dashboard',
  layout: 'app',
  auth: true,
  render: () => `<div class="page-loading"><span class="spinner"></span></div>`,
  mount(root, ctx) {
    const backend = ctx.backend!;
    let conns: Connection[] = [];
    let state = initialState(ctx.query);
    let cleanups: (() => void)[] = [];
    let loadSeq = 0;
    let first = true;

    const unsub = backend.watchConnections((list) => {
      conns = list.filter((c) => c.status !== 'disconnected');
      if (first) {
        first = false;
        void load();
      }
    });

    async function load() {
      const seq = ++loadSeq;
      if (!conns.length) {
        root.innerHTML = emptyState(ctx);
        return;
      }
      const start = state.compare === 'off' ? state.from : [state.from, state.cFrom].sort()[0];
      const end = state.compare === 'off' ? state.to : [state.to, state.cTo].sort().reverse()[0];
      // Підписники: беремо запас у 120 днів назад, щоб знати останнє відоме значення.
      const [daily, content] = await Promise.all([backend.getDaily(addDays(start, -120), end), backend.getContent(state.from, state.to)]);
      if (seq !== loadSeq) return;
      render(daily, content);
    }

    function render(daily: DailyDoc[], content: ContentDoc[]) {
      cleanups.forEach((f) => f());
      cleanups = [];
      const connIds = new Set(conns.map((c) => c.id));
      const platforms = PLATFORM_ORDER.filter((p) => conns.some((c) => c.platform === p));
      if (state.platform !== 'all' && !platforms.includes(state.platform)) state.platform = 'all';
      const inScope = (r: { connectionId: string; platform: PlatformId }) =>
        connIds.has(r.connectionId) && (state.platform === 'all' || r.platform === state.platform);
      const rows = daily.filter(inScope);
      const curDates = dateRange(state.from, state.to);
      const cmpDates = state.compare === 'off' ? [] : dateRange(state.cFrom, state.cTo);
      const shownPlatforms = state.platform === 'all' ? platforms : [state.platform];

      const kpi = KPIS.map((m) => {
        const cur = total(aggregate(rows, curDates, m), m);
        const prev = cmpDates.length ? total(aggregate(rows, cmpDates, m), m) : null;
        return { m, cur, prev };
      });
      // Залученість = взаємодії / перегляди лише по днях, де платформа дає обидва показники
      // (інакше Telegram/подкаст без переглядів спотворюють відсоток).
      let erViews = 0;
      let erInter = 0;
      for (const r of rows) {
        if (r.date < state.from || r.date > state.to || !r.views || r.interactions === undefined) continue;
        erViews += r.views;
        erInter += r.interactions;
      }
      const er = erViews ? (erInter / erViews) * 100 : null;

      const curSeries = aggregate(rows, curDates, state.metric);
      const cmpSeries = cmpDates.length ? aggregate(rows, cmpDates, state.metric) : [];

      // За платформами
      const byPlatform = shownPlatforms.map((p) => {
        const pr = rows.filter((r) => r.platform === p);
        const f = total(aggregate(pr, curDates, 'followers'), 'followers');
        const v = total(aggregate(pr, curDates, 'views'), 'views');
        const i = total(aggregate(pr, curDates, 'interactions'), 'interactions');
        const vPrev = cmpDates.length ? total(aggregate(pr, cmpDates, 'views'), 'views') : null;
        return { p, f, v, i, ch: pct(v, vPrev) };
      }).filter((b) => b.f !== null || b.v !== null || b.i !== null);

      // Структура (органіка/реклама, Shorts/довгі, рілси/дописи)
      const bd: Record<string, number> = {};
      for (const r of rows) {
        if (r.date < state.from || r.date > state.to || !r.breakdown) continue;
        for (const [k, v] of Object.entries(r.breakdown)) bd[k] = (bd[k] ?? 0) + (v ?? 0);
      }
      const groups = [['organic', 'paid'], ['shorts', 'long'], ['reels', 'posts', 'stories']]
        .map((g) => g.filter((k) => bd[k]))
        .filter((g) => g.length);

      // Топ публікацій
      const top = content
        .filter((c) => inScope(c) && c.publishedAt >= Date.parse(`${state.from}T00:00:00Z`) - 3 * 3600e3 && c.publishedAt <= Date.parse(`${state.to}T23:59:59Z`))
        .sort((a, b) => (b.views ?? b.interactions ?? 0) - (a.views ?? a.interactions ?? 0))
        .slice(0, 10);
      const connName = (id: string) => conns.find((c) => c.id === id)?.accountName ?? '';

      const tab = (id: string, label: string, dot?: string) =>
        `<button class="tab" role="tab" aria-selected="${state.platform === id}" data-pl="${id}">${dot ? `<span class="dot" style="background:${dot}"></span>` : ''}${esc(label)}</button>`;
      const seg = (name: string, val: string, cur: string, label: string) =>
        `<button type="button" data-${name}="${val}" aria-pressed="${cur === val}">${label}</button>`;
      const accent = 'var(--accent)';

      root.innerHTML = `
      <div class="page-head">
        <div><h1 tabindex="-1">${t('dashboard.title')}</h1><p>${fmtDate(state.from)} — ${fmtDate(state.to)}${cmpDates.length ? ` · ${t('dashboard.compare')} ${fmtDate(state.cFrom)} — ${fmtDate(state.cTo)}` : ''}</p></div>
      </div>
      <div class="tabs" role="tablist" aria-label="${t('dashboard.all')}">
        ${tab('all', t('dashboard.all'))}
        ${platforms.map((p) => tab(p, PLATFORMS[p].name, PLATFORMS[p].color)).join('')}
      </div>
      <form class="dash-filters" id="filters">
        <div class="segmented" role="group" aria-label="${t('dashboard.period')}">
          ${seg('preset', '7', state.preset, t('dashboard.d7'))}${seg('preset', '30', state.preset, t('dashboard.d30'))}${seg('preset', '90', state.preset, t('dashboard.d90'))}${seg('preset', 'custom', state.preset, t('dashboard.custom'))}
        </div>
        ${
          state.preset === 'custom'
            ? `<div class="date-range"><label class="sr-only" for="f-from">${t('dashboard.from')}</label><input class="input" type="date" id="f-from" value="${state.from}" max="${state.to}"><span aria-hidden="true">—</span><label class="sr-only" for="f-to">${t('dashboard.to')}</label><input class="input" type="date" id="f-to" value="${state.to}" max="${kyivToday()}"></div>`
            : ''
        }
        <label class="date-range"><span class="label">${t('dashboard.compare')}</span>
          <select class="input" id="f-cmp" style="width:auto;min-height:38px">
            <option value="prev" ${state.compare === 'prev' ? 'selected' : ''}>${t('dashboard.comparePrev')}</option>
            <option value="custom" ${state.compare === 'custom' ? 'selected' : ''}>${t('dashboard.compareCustom')}</option>
            <option value="off" ${state.compare === 'off' ? 'selected' : ''}>${t('dashboard.compareOff')}</option>
          </select>
        </label>
        ${
          state.compare === 'custom'
            ? `<div class="date-range"><label class="sr-only" for="c-from">${t('dashboard.from')}</label><input class="input" type="date" id="c-from" value="${state.cFrom}"><span aria-hidden="true">—</span><label class="sr-only" for="c-to">${t('dashboard.to')}</label><input class="input" type="date" id="c-to" value="${state.cTo}"></div>`
            : ''
        }
        ${state.preset === 'custom' || state.compare === 'custom' ? `<button class="btn btn-primary btn-sm" type="button" data-apply>${t('dashboard.apply')}</button>` : ''}
      </form>

      <section class="kpi-grid" aria-label="KPI">
        ${kpi
          .map(
            (k) => `<button class="kpi" type="button" data-metric="${k.m}" aria-pressed="${state.metric === k.m}">
              <span class="k-label">${t(`dashboard.kpi.${k.m}`)}</span>
              <span class="k-value">${k.cur === null ? '—' : fmtCompact(k.cur)}</span>
              ${cmpDates.length ? deltaHtml(pct(k.cur, k.prev)) : `<span class="k-sub">${k.cur === null ? '' : fmtNum(k.cur)}</span>`}
            </button>`,
          )
          .join('')}
        <div class="kpi" style="cursor:default"><span class="k-label">${t('dashboard.kpi.engagement')}</span><span class="k-value">${er === null ? '—' : fmtPct(er, false)}</span><span class="k-sub">${t('dashboard.kpi.interactions')} / ${t('dashboard.kpi.views')}</span></div>
      </section>

      <div class="dash-grid">
        <section class="panel" aria-labelledby="chart-h">
          <div class="panel-head">
            <h2 id="chart-h">${t('dashboard.chart')}: ${t(`dashboard.kpi.${state.metric}`)}</h2>
            <div class="legend"><span><i style="background:${accent}"></i>${t('dashboard.current')}</span>${cmpDates.length ? `<span><i class="dashed"></i>${t('dashboard.previous')}</span>` : ''}</div>
          </div>
          ${curSeries.every((v) => v === null) ? `<p class="muted">${t('dashboard.noData')}</p>` : `<div id="chart"></div>`}
          ${sourceLine(shownPlatforms)}
        </section>
        <section class="panel" aria-labelledby="bp-h">
          <div class="panel-head"><h2 id="bp-h">${t('dashboard.byPlatform')}</h2></div>
          <div class="bars">
            ${(() => {
              const maxV = Math.max(...byPlatform.map((b) => b.v ?? b.f ?? 0), 1);
              return byPlatform
                .map(
                  (b) => `<div class="bar-row">
                  <div class="bar-top"><span style="display:flex;gap:8px;align-items:center">${platformIcon(b.p, 'sm')}<strong>${esc(PLATFORMS[b.p].name)}</strong></span><span>${b.v !== null ? `${fmtCompact(b.v)} ${t('dashboard.col.views').toLowerCase()}` : `${fmtCompact(b.f)} ${t('dashboard.col.followers').toLowerCase()}`} ${b.ch !== null ? `<span class="${b.ch >= 0 ? 'up' : 'down'}" style="font-weight:700">${fmtPct(b.ch)}</span>` : ''}</span></div>
                  <div class="bar-track"><div class="bar-fill" style="width:${(((b.v ?? b.f ?? 0) / maxV) * 100).toFixed(1)}%;background:${PLATFORMS[b.p].color}"></div></div>
                  <div class="faint">${t('dashboard.col.followers')}: ${fmtNum(b.f)} · ${t('dashboard.col.interactions')}: ${fmtNum(b.i)}</div>
                </div>`,
                )
                .join('');
            })()}
          </div>
          ${shownPlatforms.includes('telegram') ? `<p class="faint" style="margin:12px 0 0">${t('dashboard.tgViews')}</p>` : ''}
          ${
            groups.length
              ? `<h3 style="font-size:.9375rem;margin:20px 0 10px">${t('dashboard.breakdown')}</h3><div class="bars">${groups
                  .map((g) => {
                    const sum = g.reduce((a, k) => a + bd[k], 0);
                    return g
                      .map((k) => `<div class="bar-row"><div class="bar-top"><span>${t(`dashboard.bd.${k}`)}</span><span>${fmtCompact(bd[k])} · ${fmtPct((bd[k] / sum) * 100, false)}</span></div><div class="bar-track"><div class="bar-fill" style="width:${((bd[k] / sum) * 100).toFixed(1)}%"></div></div></div>`)
                      .join('');
                  })
                  .join('<hr style="border:0;border-top:1px solid var(--border);margin:4px 0">')}</div>`
              : ''
          }
          ${sourceLine(shownPlatforms)}
        </section>
      </div>

      <section class="panel" aria-labelledby="top-h">
        <div class="panel-head"><h2 id="top-h">${t('dashboard.top')}</h2></div>
        ${
          top.length
            ? `<div class="table-wrap" style="margin:0"><table>
          <thead><tr><th scope="col">${t('dashboard.col.post')}</th><th scope="col">${t('dashboard.col.account')}</th><th scope="col">${t('dashboard.col.date')}</th><th scope="col" class="num">${t('dashboard.col.views')}</th><th scope="col" class="num">${t('dashboard.col.interactions')}</th><th scope="col"><span class="sr-only">${t('dashboard.open')}</span></th></tr></thead>
          <tbody>${top
            .map(
              (c) => `<tr>
              <td><div class="post-cell"><span class="thumb" style="background:${PLATFORMS[c.platform].color}">${platformIcon(c.platform, 'sm')}</span><span class="post-title">${esc(c.title)}</span></div></td>
              <td>${esc(connName(c.connectionId))}</td>
              <td style="white-space:nowrap">${fmtDate(c.publishedAt)}</td>
              <td class="num">${fmtNum(c.views)}</td>
              <td class="num">${fmtNum(c.interactions ?? (c.likes ?? 0) + (c.comments ?? 0) + (c.shares ?? 0))}</td>
              <td><a class="btn btn-ghost btn-sm" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer" aria-label="${t('dashboard.open')}: ${esc(c.title)}">${ICON.external}<span class="sr-only">${t('dashboard.open')}</span></a></td>
            </tr>`,
            )
            .join('')}</tbody></table></div>`
            : `<p class="muted">${t('dashboard.noData')}</p>`
        }
        ${sourceLine([...new Set(top.map((c) => c.platform))])}
      </section>`;

      const chartHost = root.querySelector('#chart') as HTMLElement | null;
      if (chartHost) {
        const fmt = (n: number) => fmtNum(Math.round(n));
        cleanups.push(
          mountLineChart(chartHost, {
            ariaLabel: `${t('dashboard.chart')}: ${t(`dashboard.kpi.${state.metric}`)}`,
            format: fmt,
            fromZero: state.metric !== 'followers',
            series: [
              { name: t('dashboard.current'), color: accent, values: curSeries, dates: curDates, area: true },
              ...(cmpDates.length ? [{ name: t('dashboard.previous'), color: 'var(--chart-prev)', values: cmpSeries, dates: cmpDates, dashed: true }] : []),
            ],
          }),
        );
      }
    }

    const update = (patch: Partial<State>) => {
      state = { ...state, ...patch };
      if (state.preset !== 'custom') {
        state.to = addDays(kyivToday(), -1);
        state.from = addDays(state.to, -(Number(state.preset) - 1));
      }
      if (state.compare === 'prev') {
        const len = daysBetween(state.from, state.to);
        state.cFrom = addDays(state.from, -len);
        state.cTo = addDays(state.from, -1);
      }
      syncUrl(state);
      void load();
    };

    const onClick = (e: Event) => {
      const el = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!el) return;
      const d = el.dataset;
      if (d.pl) update({ platform: d.pl as State['platform'] });
      else if (d.preset) update({ preset: d.preset as State['preset'] });
      else if (d.metric) update({ metric: d.metric as Metric });
      else if ('apply' in d) {
        const v = (id: string) => (root.querySelector(id) as HTMLInputElement | null)?.value;
        const patch: Partial<State> = {};
        if (state.preset === 'custom' && isIsoDate(v('#f-from')) && isIsoDate(v('#f-to')) && v('#f-from')! <= v('#f-to')!) {
          patch.from = v('#f-from')!;
          patch.to = v('#f-to')!;
        }
        if (state.compare === 'custom' && isIsoDate(v('#c-from')) && isIsoDate(v('#c-to')) && v('#c-from')! <= v('#c-to')!) {
          patch.cFrom = v('#c-from')!;
          patch.cTo = v('#c-to')!;
        }
        update(patch);
      }
    };
    const onChange = (e: Event) => {
      const el = e.target as HTMLSelectElement;
      if (el.id === 'f-cmp') update({ compare: el.value as State['compare'] });
    };
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    return () => {
      unsub();
      cleanups.forEach((f) => f());
      root.removeEventListener('click', onClick);
      root.removeEventListener('change', onChange);
    };
  },
};
