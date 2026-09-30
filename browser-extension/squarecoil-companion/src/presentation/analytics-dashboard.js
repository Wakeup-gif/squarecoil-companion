'use strict';

const { ANALYTICS_CSS } = require('./analytics-styles');
const { shiftDate } = require('./analytics-data');
const ANALYTICS_ROOT_ID = 'squarecoil-companion-analytics';
const ANALYTICS_OWNER = 'analytics-dashboard';
const NATIVE_SHORTCUTS = Object.freeze(['#widget-tasks', '#widget-designs', '#widget-estimates']);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function duration(ms) {
  const minutes = Math.floor(Math.max(0, Number(ms) || 0) / 60000);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ''}` : minutes ? `${minutes}m` : ms > 0 ? '<1m' : '0m';
}
function dateLabel(date, options = {}) { return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', ...options }).format(new Date(`${date}T12:00:00Z`)); }
function exactAnalyticsRoute(location) {
  if (location?.pathname !== '/dashboard.php') return false;
  const parameters = new URLSearchParams(location.search || '');
  return parameters.getAll('show').length === 1 && parameters.get('show') === '2';
}
function findAnalyticsAnchor(document) {
  const content = document.querySelector('#content');
  const shortcuts = NATIVE_SHORTCUTS.map(selector => document.querySelector(selector));
  if (!content || shortcuts.some(node => !node || !content.contains(node))) return null;
  let common = shortcuts[0].parentElement;
  while (common && !shortcuts.every(node => common.contains(node))) common = common.parentElement;
  if (!common || !content.contains(common)) return null;
  if (common !== content) return common;
  // Some audited fixtures have direct children instead of a wrapping .row.
  const children = Array.from(content.children);
  return children.filter(child => shortcuts.some(node => child === node || child.contains(node))).at(-1) || null;
}
function statusLabel(status) {
  return ({ RUNNING: 'Running', RUNNING_PROVISIONAL: 'Running · verifying', VERIFICATION_HOLD: 'Verification hold',
    AWAITING_CHOICE: 'Awaiting choice', LOCALLY_PAUSED: 'Paused locally', NOT_RUNNING: 'Not running', SYNCING: 'Syncing' })[status] || 'Unavailable';
}
function chartMarkup(model, rows, mode, isolatedId, large = false) {
  if (!model.hasRecordedTime || rows.every(row => row.periodMs === 0)) return '<div class="chart-empty">No Companion time recorded in this period.</div>';
  if (!model.intradayAvailable) return '<div class="chart-empty">Hourly detail is unavailable for records with a different saved time zone. Day totals remain available.</div>';
  const plotRows = rows.filter(row => row.values && row.periodMs > 0);
  const buckets = model.buckets;
  const width = 850, height = large ? 270 : 150, left = 34, top = 10, bottom = height - 24, plotWidth = width - left - 10;
  const totals = buckets.map((_, index) => plotRows.reduce((sum, row) => sum + row.values[index], 0));
  const max = Math.max(3600000, ...totals);
  const ceiling = Math.ceil(max / 3600000) * 3600000;
  const plotHeight = bottom - top, step = plotWidth / buckets.length;
  const x = index => left + step * (index + .5), y = value => bottom - (value / ceiling) * plotHeight;
  let shapes = [0, .5, 1].map(ratio => `<line class="grid" x1="${left}" y1="${y(ceiling * ratio)}" x2="${width - 10}" y2="${y(ceiling * ratio)}"/>`).join('');
  const yLabels = [0, .5, 1].map(ratio => `<span class="axis-label" style="top:${y(ceiling * ratio) / height * 100}%">${esc(duration(ceiling * ratio))}</span>`).join('');
  const labelStep = Math.max(1, Math.ceil(buckets.length / (large ? 16 : 10)));
  const xLabels = buckets.map((bucket, index) => index % labelStep === 0 ? `<span class="axis-label" style="left:${(x(index) - left) / plotWidth * 100}%;top:${(height - 4) / height * 100}%">${esc(bucket.label)}</span>` : '').join('');
  const denseLabels = Math.ceil(buckets.length / labelStep) > 10 || buckets.some(bucket => String(bucket.label).length > 4);
  if (mode === 'bars') {
    const stacks = buckets.map(() => 0), barWidth = Math.min(48, step * .54);
    for (const row of plotRows) {
      shapes += row.values.map((value, index) => {
        const base = stacks[index]; stacks[index] += value;
        if (value <= 0 || buckets[index].future) return '';
        return `<rect class="hit${isolatedId && isolatedId !== row.contextId ? ' dim' : ''}" data-chart-job="${esc(row.contextId)}" data-bucket="${index}" tabindex="0" role="button" aria-label="${esc(`${row.label}, ${buckets[index].label}, ${duration(value)}`)}" x="${x(index) - barWidth / 2}" y="${y(base + value)}" width="${barWidth}" height="${Math.max(.7, value / ceiling * plotHeight)}" fill="${row.color}" rx="1"/>`;
      }).join('');
    }
  } else {
    for (const row of plotRows) {
      const points = row.values.map((value, index) => buckets[index].future ? null : `${x(index)},${y(value)}`).filter(Boolean).join(' ');
      shapes += `<polyline class="${isolatedId && isolatedId !== row.contextId ? 'dim' : ''}" fill="none" stroke="${row.color}" stroke-width="2.5" points="${points}"/>`;
      shapes += row.values.map((value, index) => buckets[index].future ? '' : `<circle class="hit${isolatedId && isolatedId !== row.contextId ? ' dim' : ''}" data-chart-job="${esc(row.contextId)}" data-bucket="${index}" tabindex="0" role="button" aria-label="${esc(`${row.label}, ${buckets[index].label}, ${duration(value)}`)}" cx="${x(index)}" cy="${y(value)}" r="${isolatedId === row.contextId ? 4 : 3}" fill="${row.color}"/>`).join('');
    }
  }
  // Scale only plot geometry. HTML labels retain their font size, with the
  // same bucket centers and grid heights inside a fixed readable axis gutter.
  return `<div class="chart-plot"><svg viewBox="${left} 0 ${plotWidth} ${height}" preserveAspectRatio="none" aria-label="Companion-recorded ${esc(model.period)} time by job">${shapes}</svg></div><div class="chart-axis" aria-hidden="true" data-dense="${denseLabels}"><div class="axis-y">${yLabels}</div><div class="axis-x">${xLabels}</div></div><div class="chart-tooltip" role="tooltip" hidden></div>`;
}

function createAnalyticsDashboard(options = {}) {
  const { document, window, getSnapshot } = options;
  if (!document || !window || typeof getSnapshot !== 'function') throw new Error('analytics-environment-required');
  let host = null, shadow = null, disposed = false, currentModel = null, lastPreferences = null, lastPresentation = null;
  let renderSignature = null, message = '', sourceMessage = '', busy = false;
  let sourceHint = null, successfulQuerySignature = null;
  let current = Object.freeze({ state: 'OFF', reason: 'preference-off', ownedRootCount: 0 });
  const view = { period: 'week', anchor: null, scope: 'tracked', mode: 'bars', jobView: 'rows', isolatedId: null, query: '' };
  const $ = selector => shadow?.querySelector(selector);
  function removeOwned() {
    if (host) { host.remove(); host = null; shadow = null; }
    renderSignature = null;
    successfulQuerySignature = null;
    currentModel = null;
    sourceMessage = '';
  }
  function publish(state, reason) {
    current = Object.freeze({ state, reason, ownedRootCount: host?.isConnected ? 1 : 0, sourceRevision: currentModel?.revision ?? null });
    return current;
  }
  function legend(rows) {
    const sorted = rows.filter(row => row.periodMs > 0).slice().sort((a, b) => b.periodMs - a.periodMs);
    return sorted.map(row => `<button type="button" data-action="isolate" data-context="${esc(row.contextId)}" aria-pressed="${!view.isolatedId || view.isolatedId === row.contextId}" title="Isolate ${esc(row.label)}"><i class="dot" style="--job-color:${row.color}"></i><strong>${esc(row.shortLabel)}</strong><span>${esc(row.label)} · ${esc(duration(row.periodMs))}</span></button>`).join('') +
      (view.isolatedId ? '<button type="button" class="clear" data-action="clear-isolation">Show all jobs</button>' : '');
  }
  function filteredRows() {
    const search = view.query.trim().toLowerCase();
    return currentModel.rows.filter(row => row.scope === view.scope && (!search || `${row.label} ${row.projectId || ''}`.toLowerCase().includes(search)));
  }
  function renderRows(rows) {
    if (!rows.length) return `<div class="panel empty">${view.query ? 'No matching jobs or contexts.' : `No ${view.scope} jobs or contexts yet.`}</div>`;
    return `<div class="job-head" aria-hidden="true"><span>Job / Context</span><span>Companion status</span><span>Last recorded</span><span>Total tracked</span><span>This ${esc(view.period)}</span><span>Actions</span></div>` + rows.map(row => {
      const lastRecorded = row.lastRecordedActivityAtMs ? new Intl.DateTimeFormat('en-US', { timeZone: currentModel.workdayZone, month: 'short', day: 'numeric', year: 'numeric' }).format(row.lastRecordedActivityAtMs) : 'No dated sessions';
      const maximum = Math.max(1, ...(row.values || []));
      const spark = (row.values || []).map(value => `<i style="height:${Math.max(1, value / maximum * 17)}px"></i>`).join('');
      const link = row.href ? `<a href="${esc(row.href)}" target="_blank" rel="noopener noreferrer" title="Open SquareCoil job">${esc(row.label)} ↗</a>` : esc(row.label);
      const action = row.scope === 'tracked' ? `<button type="button" data-action="archive" data-context="${esc(row.contextId)}" ${row.protected || busy ? 'disabled' : ''} title="${row.protected ? 'Current contexts are protected' : 'Preserve time and move to Archived'}">Archive</button>` : row.scope === 'archived' ? `<button type="button" data-action="restore" data-context="${esc(row.contextId)}" ${busy ? 'disabled' : ''}>Restore</button>` : '';
      return `<article class="job-row" style="--job-color:${row.color}"><div><div class="job-title"><span class="job-id">${esc(row.shortLabel)}</span><strong>${link}</strong></div><span class="job-detail">${row.kind === 'general' ? 'General context' : 'SquareCoil job'} · ${row.protected ? 'Protected current context' : 'Companion recorded time'}</span>${row.legacyUnattributedMs ? `<span class="job-detail">${esc(duration(row.legacyUnattributedMs))} undated legacy time included in total</span>` : ''}</div><div><span class="mobile-label">Companion status</span><span class="status" data-status="${esc(row.status)}"><i class="dot"></i>${esc(statusLabel(row.status))}</span></div><div class="muted"><span class="mobile-label">Last recorded</span>${esc(lastRecorded)}</div><div class="row-time"><span class="mobile-label">Total tracked</span>${esc(duration(row.totalMs))}<small>recorded history</small></div><div class="row-time"><span class="mobile-label">This ${esc(view.period)}</span>${esc(duration(row.periodMs))}<div class="spark" aria-hidden="true">${spark}</div></div><div class="row-actions">${action}</div></article>`;
    }).join('');
  }
  function renderTable(rows) {
    if (!rows.length) return '';
    return `<details><summary>View chart data as a table</summary><div class="table-scroll"><table><caption>Recorded durations in ${esc(currentModel.workdayZone)}</caption><thead><tr><th>Date / time</th>${rows.map(row => `<th>${esc(row.label)}</th>`).join('')}</tr></thead><tbody>${currentModel.buckets.map((bucket, index) => `<tr><th>${esc(bucket.date)} · ${esc(bucket.label)}</th>${rows.map(row => `<td>${row.values ? esc(duration(row.values[index])) : 'Unavailable'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
  }
  function render() {
    if (!shadow || !currentModel) return;
    const m = currentModel;
    const active = shadow.activeElement;
    const focus = active ? { action: active.dataset.action, context: active.dataset.context, value: active.dataset.value, period: active.dataset.period,
      chartJob: active.dataset.chartJob, bucket: active.dataset.bucket,
      mainChart: active.closest?.('.chart')?.hasAttribute('data-main-chart') === true,
      search: active.matches?.('[data-search]'), start: active.selectionStart, end: active.selectionEnd } : null;
    const end = shiftDate(m.range.end, -1), rangeLabel = m.range.start === end ? dateLabel(end, { year: 'numeric' }) : `${dateLabel(m.range.start)} – ${dateLabel(end, { year: 'numeric' })}`;
    const rows = filteredRows(), allRows = m.rows;
    const allocation = allRows.filter(row => row.periodMs > 0).map(row => `<span style="width:${m.periodMs ? row.periodMs / m.periodMs * 100 : 0}%;background:${row.color}" title="${esc(`${row.label}: ${duration(row.periodMs)}`)}"></span>`).join('');
    const warnings = [m.provisional ? 'Current time is provisional while SquareCoil is verified.' : '', m.safetyHeld ? 'Current time is held at the last verified boundary.' : '',
      m.legacyMs ? `${duration(m.legacyMs)} of undated legacy time is excluded from date charts.` : '', !m.hasRecordedTime ? 'Recorded sessions will appear here as Companion tracks work.' : ''].filter(Boolean).join(' ');
    shadow.innerHTML = `<style>${ANALYTICS_CSS}</style><div class="message" role="status">${esc([sourceMessage, message].filter(Boolean).join(' '))}</div><section class="hours panel" aria-label="Companion-tracked hours"><div class="section-head"><div><h2>Companion-tracked hours</h2><p>${esc(rangeLabel)}</p></div><div class="controls"><div class="segmented" aria-label="Time period">${['day','week','month'].map(period => `<button type="button" data-action="period" data-period="${period}" aria-pressed="${view.period === period}">${period[0].toUpperCase() + period.slice(1)}</button>`).join('')}</div><div class="segmented" aria-label="Chart type">${['bars','line'].map(mode => `<button type="button" data-action="chart-mode" data-value="${mode}" aria-pressed="${view.mode === mode}">${mode === 'bars' ? 'Bars' : 'Line'}</button>`).join('')}</div><div class="period-nav"><button type="button" data-action="previous" aria-label="Previous period">‹</button><button type="button" data-action="current">This ${esc(view.period)}</button><button type="button" data-action="next" aria-label="Next period" ${m.range.end > m.today ? 'disabled' : ''}>›</button></div></div></div><div class="hours-main"><div><div class="hours-total">${esc(duration(m.periodMs))}</div><p class="total-caption">Companion recorded this ${esc(view.period)}</p><div class="summary-tags"><span>Today ${esc(duration(m.todayMs))}</span><span>This week ${esc(duration(m.weekMs))}</span></div></div><div class="chart" data-main-chart>${chartMarkup(m, allRows, view.mode, view.isolatedId)}</div></div><p class="notice">${esc(warnings)}</p><div class="allocation" aria-hidden="true">${allocation}</div><div class="legend">${legend(allRows)}</div></section><section aria-label="Job time and history"><div class="jobs-head"><div class="jobs-heading"><h2>${view.scope === 'tracked' ? 'Tracked jobs' : view.scope === 'history' ? 'Job history' : 'Archived jobs'} <span class="count">${m.scopeCounts[view.scope]}</span></h2><div class="segmented" aria-label="Job membership">${['tracked','history','archived'].map(scope => `<button type="button" data-action="scope" data-value="${scope}" aria-pressed="${view.scope === scope}">${scope[0].toUpperCase() + scope.slice(1)}</button>`).join('')}</div><div class="segmented" aria-label="Job view">${['rows','graph'].map(value => `<button type="button" data-action="job-view" data-value="${value}" aria-pressed="${view.jobView === value}">${value === 'rows' ? '▤ Rows' : '⌁ Graph'}</button>`).join('')}</div></div><div class="jobs-tools"><input class="search" data-search type="search" aria-label="Find a job or context" placeholder="Find a ${esc(view.scope)} job…" value="${esc(view.query)}"></div></div><div data-jobs>${view.jobView === 'rows' ? renderRows(rows) : `<div class="graph-panel panel"><h3>Time by job · ${esc(rangeLabel)}</h3><div class="chart chart-large">${chartMarkup(m, rows, view.mode, view.isolatedId, true)}</div><div class="legend">${legend(rows)}</div>${renderTable(rows)}</div>`}</div></section><div class="footer"><span>${esc(m.timeBasis.label)} · Companion time, separate from payroll.<br>Project stages, requests and due dates are unavailable from the current read-only source.</span><button type="button" data-action="disable">Hide analytics dashboard</button></div>`;
    if (focus) {
      const candidates = Array.from(shadow.querySelectorAll('[data-action],[data-search],[data-chart-job]'));
      const target = candidates.find(node => focus.chartJob
        ? node.dataset.chartJob === focus.chartJob && node.dataset.bucket === focus.bucket &&
          (node.closest?.('.chart')?.hasAttribute('data-main-chart') === true) === focus.mainChart
        : focus.search ? node.hasAttribute('data-search')
          : node.dataset.action === focus.action && node.dataset.context === focus.context && node.dataset.value === focus.value && node.dataset.period === focus.period);
      target?.focus?.({ preventScroll: true });
      if (focus.search && typeof focus.start === 'number') target?.setSelectionRange?.(focus.start, focus.end);
    }
  }
  function refresh(force = false) {
    if (!shadow) return;
    const querySignature = sourceHint ? JSON.stringify([sourceHint.revision, Math.floor(sourceHint.queryAtMs / 60000),
      sourceHint.operationalStatus, sourceHint.todayTotalIsProvisional, sourceHint.running?.held, view.period, view.anchor]) : null;
    // Timer's existing snapshot is the invalidation signal. Do not rescan the
    // entire ledger for every one-second workspace paint when nothing shown at
    // minute precision changed. User interactions always request a fresh view.
    if (!force && querySignature && successfulQuerySignature === querySignature && !sourceMessage) return;
    try {
      const next = getSnapshot({ period: view.period, anchor: view.anchor });
      if (!next || !Number.isSafeInteger(next.revision)) throw new Error('analytics-source-unavailable');
      if (currentModel && next.revision < currentModel.revision) return;
      const nextSignature = JSON.stringify([next.revision, next.period, next.anchor, Math.floor(next.periodMs / 60000), Math.floor(next.todayMs / 60000),
        next.provisional, next.safetyHeld, next.rows.map(row => [row.contextId, row.status])]);
      const recovered = Boolean(sourceMessage);
      sourceMessage = '';
      currentModel = next;
      successfulQuerySignature = querySignature;
      if (force || recovered || renderSignature !== nextSignature) { renderSignature = nextSignature; render(); }
      publish('APPLIED', 'canonical-data');
    } catch (_) {
      sourceMessage = currentModel ? 'The latest data is unavailable. Showing the last verified snapshot.' : 'Companion data is not ready yet. This dashboard will update when the trusted data service is available.';
      if (currentModel) render(); else if (shadow) shadow.innerHTML = `<style>${ANALYTICS_CSS}</style><div class="panel empty" role="status">${esc(sourceMessage)}</div>`;
      publish('WAITING_DATA', 'canonical-data-unavailable');
    }
  }
  function movePeriod(direction) {
    const anchor = view.anchor || currentModel.today;
    if (view.period === 'month') { const d = new Date(`${anchor.slice(0,7)}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + direction); view.anchor = d.toISOString().slice(0,10); }
    else view.anchor = shiftDate(anchor, direction * (view.period === 'week' ? 7 : 1));
    if (view.anchor > currentModel.today) view.anchor = currentModel.today;
  }
  async function onClick(event) {
    const target = event.target.closest?.('[data-action],[data-chart-job]');
    if (!target || !shadow.contains(target)) return;
    const action = target.dataset.action;
    if (target.dataset.chartJob) { view.isolatedId = view.isolatedId === target.dataset.chartJob ? null : target.dataset.chartJob; render(); return; }
    if (action === 'period') view.period = target.dataset.period;
    else if (action === 'chart-mode') view.mode = target.dataset.value;
    else if (action === 'scope') view.scope = target.dataset.value;
    else if (action === 'job-view') view.jobView = target.dataset.value;
    else if (action === 'isolate') view.isolatedId = view.isolatedId === target.dataset.context ? null : target.dataset.context;
    else if (action === 'clear-isolation') view.isolatedId = null;
    else if (action === 'previous' || action === 'next') movePeriod(action === 'previous' ? -1 : 1);
    else if (action === 'current') view.anchor = null;
    else if (['archive', 'restore', 'disable'].includes(action)) {
      if (!event.isTrusted || busy) return;
      const contextId = target.dataset.context;
      const row = currentModel?.rows.find(item => item.contextId === contextId);
      if (action !== 'disable' && (!row || (action === 'archive' && (row.protected || row.scope !== 'tracked')) || (action === 'restore' && row.scope !== 'archived'))) return;
      busy = true; render();
      try {
        if (action === 'disable') await options.onDisable?.();
        else {
          if (typeof options.onDataAction !== 'function') throw new Error('data-action-unavailable');
          await options.onDataAction(action, contextId);
          message = action === 'archive' ? 'Job archived. Recorded time is preserved.' : 'Job restored to tracked jobs. Timing is unchanged.';
        }
      } catch (_) { message = 'This action could not be completed. The job may have changed or become protected. Try again after it refreshes.'; }
      finally { busy = false; }
    }
    refresh(true);
  }
  function tooltip(event) {
    const target = event.target.closest?.('[data-chart-job]');
    if (!target) return;
    const chart = target.closest('.chart'), tip = chart?.querySelector('.chart-tooltip');
    const row = currentModel?.rows.find(item => item.contextId === target.dataset.chartJob);
    const index = Number(target.dataset.bucket), bucket = currentModel?.buckets[index];
    if (!tip || !row || !bucket) return;
    const chartRect = chart.getBoundingClientRect(), targetRect = target.getBoundingClientRect();
    tip.innerHTML = `<strong>${esc(duration(row.values?.[index] || 0))} · ${esc(row.shortLabel)}</strong><span>${esc(row.label)} · ${esc(bucket.date)} ${esc(bucket.label)}</span>`;
    tip.hidden = false;
    tip.style.left = `${Math.max(95, Math.min(chartRect.width - 95, (event.clientX || targetRect.x + targetRect.width / 2) - chartRect.x))}px`;
    tip.style.top = `${Math.max(42, targetRect.top - chartRect.top)}px`;
  }
  function mount(anchor) {
    const existing = document.getElementById(ANALYTICS_ROOT_ID);
    if (existing && existing !== host) return false;
    host = document.createElement('section');
    host.id = ANALYTICS_ROOT_ID;
    host.setAttribute('data-squarecoil-companion-owned', ANALYTICS_OWNER);
    host.setAttribute('aria-label', 'SquareCoil Companion analytics');
    shadow = host.attachShadow({ mode: 'open' });
    shadow.addEventListener('click', onClick);
    shadow.addEventListener('input', event => { if (event.target.matches('[data-search]')) { view.query = event.target.value; render(); } });
    shadow.addEventListener('pointerover', tooltip); shadow.addEventListener('focusin', tooltip);
    shadow.addEventListener('pointerout', () => shadow?.querySelectorAll('.chart-tooltip').forEach(node => { node.hidden = true; }));
    shadow.addEventListener('focusout', () => shadow?.querySelectorAll('.chart-tooltip').forEach(node => { node.hidden = true; }));
    shadow.addEventListener('keydown', event => {
      if (event.target.hasAttribute?.('data-chart-job') && ['Enter',' '].includes(event.key)) { event.preventDefault(); view.isolatedId = view.isolatedId === event.target.dataset.chartJob ? null : event.target.dataset.chartJob; render(); }
    });
    anchor.parentNode.insertBefore(host, anchor.nextSibling);
    return true;
  }
  function apply(preferences, presentation = {}, timerHint = null) {
    if (disposed) return publish('DISPOSED', 'teardown');
    lastPreferences = preferences; lastPresentation = presentation;
    sourceHint = timerHint;
    if (preferences?.dashboardEnabled !== true) { removeOwned(); return publish('OFF', 'preference-off'); }
    if (!exactAnalyticsRoute(window.location)) { removeOwned(); return publish('INACTIVE_PAGE', 'route-not-eligible'); }
    const anchor = findAnalyticsAnchor(document);
    if (!anchor) { removeOwned(); return publish('WAITING_SURFACE', 'native-shortcuts-unavailable'); }
    if (host && !host.isConnected) removeOwned();
    if (!host && !mount(anchor)) return publish('UNAVAILABLE', 'ownership-conflict');
    if (host.previousSibling !== anchor) anchor.parentNode.insertBefore(host, anchor.nextSibling);
    const ownAppearance = ['LIGHT', 'DARK'].includes(preferences.dashboardAppearance) ? preferences.dashboardAppearance : null;
    host.setAttribute('data-theme', (ownAppearance || (presentation.websiteThemeEffective === 'SLEEK_DARK' ? 'DARK' : 'LIGHT')).toLowerCase());
    host.setAttribute('data-glass', !ownAppearance && ['SLEEK_DARK','LIGHT_GLASS'].includes(presentation.websiteThemeEffective) && !presentation.reducedTransparency && !presentation.forcedColors ? 'true' : 'false');
    refresh();
    return current;
  }
  const routeChanged = () => { if (lastPreferences) apply(lastPreferences, lastPresentation); };
  window.addEventListener('popstate', routeChanged); window.addEventListener('hashchange', routeChanged);
  function teardown() {
    if (disposed) return;
    disposed = true; removeOwned(); currentModel = null;
    window.removeEventListener('popstate', routeChanged); window.removeEventListener('hashchange', routeChanged);
    publish('DISPOSED', 'teardown');
  }
  return Object.freeze({ apply, snapshot: () => current, teardown });
}

module.exports = { ANALYTICS_ROOT_ID, ANALYTICS_OWNER, NATIVE_SHORTCUTS, exactAnalyticsRoute, findAnalyticsAnchor,
  duration, chartMarkup, createAnalyticsDashboard };
