'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEmptyDocument } = require('../../src/data/model');
const { splitInterval } = require('../../src/data/ledger');
const { createAnalyticsSnapshot } = require('../../src/presentation/analytics-data');
const { ANALYTICS_ROOT_ID, createAnalyticsDashboard, exactAnalyticsRoute, chartMarkup } = require('../../src/presentation/analytics-dashboard');
const { ANALYTICS_CSS } = require('../../src/presentation/analytics-styles');

function environment() {
  const listeners = new Map();
  class Node {
    constructor(tag = 'div') { this.tagName = tag; this.children = []; this.parentNode = null; this.attrs = {}; this.innerHTML = ''; this.listeners = new Map(); }
    get parentElement() { return this.parentNode; }
    get nextSibling() { const siblings = this.parentNode?.children || []; return siblings[siblings.indexOf(this) + 1] || null; }
    get previousSibling() { const siblings = this.parentNode?.children || []; return siblings[siblings.indexOf(this) - 1] || null; }
    get isConnected() { return this === body || Boolean(this.parentNode?.isConnected); }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    getAttribute(name) { return this.attrs[name]; }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    insertBefore(node, before) { node.remove(); const index = before ? this.children.indexOf(before) : this.children.length; this.children.splice(index, 0, node); node.parentNode = this; }
    appendChild(node) { this.insertBefore(node, null); }
    remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
    addEventListener(name, fn) { this.listeners.set(name, fn); }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    attachShadow() { this.shadowRoot = new Node('shadow'); return this.shadowRoot; }
  }
  const body = new Node('body'), content = new Node(), shortcuts = new Node(); content.id = 'content'; body.appendChild(content); content.appendChild(shortcuts);
  for (const id of ['widget-tasks','widget-designs','widget-estimates']) { const node = new Node('a'); node.id = id; shortcuts.appendChild(node); }
  const nativePanel = new Node(); nativePanel.id = 'native-panel'; content.appendChild(nativePanel);
  function find(node, id) { if (node.id === id) return node; for (const child of node.children) { const match = find(child, id); if (match) return match; } return null; }
  const document = { body, createElement: tag => new Node(tag), getElementById: id => find(body, id), querySelector: selector => find(body, selector.slice(1)) };
  const window = { location: { pathname: '/dashboard.php', search: '?show=2' }, addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type) };
  const clock = { atMs: Date.parse('2026-09-04T16:00:00Z'), fail: false, calls: [], transform: value => value };
  const source = createEmptyDocument({ nowMs: clock.atMs, workdayZone: 'UTC' });
  const service = createAnalyticsDashboard({ document, window, getSnapshot: view => {
    clock.calls.push({ ...view });
    if (clock.fail) throw new Error('synthetic-source-unavailable');
    return clock.transform(createAnalyticsSnapshot(source, { ...view, atMs: clock.atMs }));
  } });
  return { document, window, service, content, shortcuts, nativePanel, listeners, clock, source };
}
test('UT-B5-DASH-LIFE-001 on/off/repeated apply preserves native shortcuts and removes only owned DOM', () => {
  const env = environment(), native = [...env.content.children];
  assert.equal(env.service.apply({ dashboardEnabled: false }).state, 'OFF');
  assert.deepEqual(env.content.children, native);
  assert.equal(env.service.apply({ dashboardEnabled: true }).state, 'APPLIED');
  const host = env.document.getElementById(ANALYTICS_ROOT_ID);
  assert.equal(env.content.children[1], host);
  for (let pass = 0; pass < 4; pass += 1) env.service.apply({ dashboardEnabled: true });
  assert.equal(env.content.children.filter(node => node.id === ANALYTICS_ROOT_ID).length, 1);
  assert.match(host.shadowRoot.innerHTML, /No Companion time recorded|Recorded sessions will appear/);
  env.service.apply({ dashboardEnabled: false });
  assert.deepEqual(env.content.children, native);
  env.service.teardown(); assert.equal(env.listeners.size, 0);
});
test('UT-B5-DASH-LIFE-002 exact route and native anchor failures leave no host and recover idempotently', () => {
  const env = environment();
  env.service.apply({ dashboardEnabled: true });
  env.window.location.search = '?show=1'; env.listeners.get('popstate')();
  assert.equal(env.document.getElementById(ANALYTICS_ROOT_ID), null);
  env.window.location.search = '?show=2'; env.listeners.get('popstate')();
  assert.equal(env.service.snapshot().ownedRootCount, 1);
  const designs = env.document.getElementById('widget-designs'); designs.remove();
  assert.equal(env.service.apply({ dashboardEnabled: true }).state, 'WAITING_SURFACE');
  assert.equal(env.document.getElementById(ANALYTICS_ROOT_ID), null);
  env.shortcuts.appendChild(designs); env.service.apply({ dashboardEnabled: true });
  env.service.teardown(); assert.equal(env.document.getElementById(ANALYTICS_ROOT_ID), null);
  for (const search of ['?show=2&show=2','?show=02','?show=1','']) assert.equal(exactAnalyticsRoute({ pathname: '/dashboard.php', search }), false);
  assert.equal(exactAnalyticsRoute({ pathname: '/Dashboard.php', search: '?show=2' }), false);
});
test('UT-B5-DASH-LIFE-003 dashboard appearance is independent and can follow effective website glass', () => {
  const env = environment();
  env.service.apply({ dashboardEnabled: true, dashboardAppearance: 'SITE' }, { websiteThemeEffective: 'SLEEK_DARK' });
  const host = env.document.getElementById(ANALYTICS_ROOT_ID);
  assert.equal(host.getAttribute('data-theme'), 'dark'); assert.equal(host.getAttribute('data-glass'), 'true');
  env.service.apply({ dashboardEnabled: true, dashboardAppearance: 'LIGHT' }, { websiteThemeEffective: 'SLEEK_DARK' });
  assert.equal(host.getAttribute('data-theme'), 'light'); assert.equal(host.getAttribute('data-glass'), 'false');
  env.service.apply({ dashboardEnabled: true, dashboardAppearance: 'DARK' }, { websiteThemeEffective: 'ORIGINAL' });
  assert.equal(host.getAttribute('data-theme'), 'dark'); assert.equal(host.getAttribute('data-glass'), 'false');
  env.service.teardown();
});
test('UT-B5-DASH-VIEW-001 chart tooltip/keyboard targets escape record content and never execute it', () => {
  const row = { contextId: 'job:1', label: '<img src=x onerror=alert(1)>', color: '#ce9053', values: [60000], periodMs: 60000 };
  const model = { hasRecordedTime: true, intradayAvailable: true, period: 'day', buckets: [{ label: '1 PM', future: false }] };
  for (const mode of ['bars', 'line']) {
    const html = chartMarkup(model, [row], mode, null);
    assert.equal(html.includes('<img'), false);
    assert.match(html, /tabindex="0"/); assert.match(html, /data-chart-job="job:1"/); assert.match(html, /role="tooltip"/);
  }
});

test('UT-B5-DASH-VIEW-003 responsive axes keep readable HTML text and preserve exact SVG data geometry', () => {
  const row = { contextId: 'job:1', label: 'Recorded job', color: '#ce9053', values: [1800000], periodMs: 1800000 };
  const model = { hasRecordedTime: true, intradayAvailable: true, period: 'day', buckets: [{ label: '1 PM <UTC>', future: false }] };
  for (const mode of ['bars', 'line']) {
    const html = chartMarkup(model, [row], mode, null);
    const svg = html.match(/<svg\b[\s\S]*?<\/svg>/)[0];
    assert.doesNotMatch(svg, /<text\b|axis-label/);
    assert.match(svg, /viewBox="34 0 806 150"/);
    assert.match(html, /class="chart-axis" aria-hidden="true" data-dense="true"/);
    assert.match(html, /left:50%;top:[^"]+">1 PM &lt;UTC&gt;<\/span>/);
    assert.match(html, /class="axis-label" style="top:45\.33333333333333%">30m/);
    assert.match(svg, /data-chart-job="job:1" data-bucket="0" tabindex="0" role="button"/);
    if (mode === 'bars') assert.match(svg, /x="413" y="68" width="48" height="58"/);
    else assert.match(svg, /cx="437" cy="68"/);
    assert.match(html, /class="chart-tooltip" role="tooltip" hidden/);
  }
  assert.match(ANALYTICS_CSS, /\.chart-axis\{[^}]*pointer-events:none[^}]*font:10px\/12px/);
  assert.match(ANALYTICS_CSS, /@container sc-chart \(max-width:560px\)/);
});

test('UT-B5-DASH-LIFE-004 current period follows midnight/week rollover instead of freezing its initial anchor', () => {
  const env = environment();
  env.clock.atMs = Date.parse('2026-09-06T23:59:59Z');
  env.service.apply({ dashboardEnabled: true });
  const host = env.document.getElementById(ANALYTICS_ROOT_ID);
  assert.match(host.shadowRoot.innerHTML, /Aug 31 – Sep 6, 2026/);
  env.clock.atMs = Date.parse('2026-09-07T00:00:01Z');
  env.service.apply({ dashboardEnabled: true });
  assert.match(host.shadowRoot.innerHTML, /Sep 7 – Sep 13, 2026/);
  assert.ok(env.clock.calls.every(view => view.anchor === null));
  env.service.teardown();
});
test('UT-B5-DASH-LIFE-005 source errors retain known data, clear on recovery, and disabled mounts discard cached records', () => {
  const env = environment();
  env.service.apply({ dashboardEnabled: true });
  const host = env.document.getElementById(ANALYTICS_ROOT_ID);
  env.clock.fail = true;
  assert.equal(env.service.apply({ dashboardEnabled: true }).state, 'WAITING_DATA');
  assert.match(host.shadowRoot.innerHTML, /last verified snapshot/);
  env.clock.fail = false;
  assert.equal(env.service.apply({ dashboardEnabled: true }).state, 'APPLIED');
  assert.doesNotMatch(host.shadowRoot.innerHTML, /latest data is unavailable/);
  env.service.apply({ dashboardEnabled: false });
  env.clock.fail = true; env.service.apply({ dashboardEnabled: true });
  assert.match(env.document.getElementById(ANALYTICS_ROOT_ID).shadowRoot.innerHTML, /Companion data is not ready/);
  assert.doesNotMatch(env.document.getElementById(ANALYTICS_ROOT_ID).shadowRoot.innerHTML, /last verified snapshot/);
  env.service.teardown();
});
test('UT-B5-DASH-LIFE-006 canonical snapshot hints avoid one-second rescans but invalidate on status and minute changes', () => {
  const env = environment();
  const hint = { revision: 0, queryAtMs: env.clock.atMs, operationalStatus: 'NOT_RUNNING', todayTotalIsProvisional: false, running: null };
  env.service.apply({ dashboardEnabled: true }, {}, hint);
  for (let seconds = 1; seconds < 10; seconds += 1) env.service.apply({ dashboardEnabled: true }, {}, { ...hint, queryAtMs: hint.queryAtMs + seconds * 1000 });
  assert.equal(env.clock.calls.length, 1);
  env.clock.transform = value => ({ ...value, provisional: true });
  env.service.apply({ dashboardEnabled: true }, {}, { ...hint, operationalStatus: 'RUNNING_PROVISIONAL', todayTotalIsProvisional: true });
  assert.equal(env.clock.calls.length, 2);
  assert.match(env.document.getElementById(ANALYTICS_ROOT_ID).shadowRoot.innerHTML, /Current time is provisional/);
  env.service.apply({ dashboardEnabled: true }, {}, { ...hint, queryAtMs: hint.queryAtMs + 60000 });
  assert.equal(env.clock.calls.length, 3);
  env.service.teardown();
});

test('UT-B5-DASH-VIEW-002 keyboard isolation retains the exact job, bucket and chart after replacing bars or line points', async () => {
  const env = environment(), contextId = 'job:101';
  env.source.contexts[contextId] = { contextId, kind: 'job', projectId: '101', currentLabel: 'Recorded job', shortLabel: '101',
    aliases: [], createdAtMs: 1, lastSeenAtMs: 1, archivedAtMs: null, workspaceMembership: 'RECENT', legacyUnattributedMs: 0 };
  env.source.ledger.push(...splitInterval({ contextId, sessionId: 'keyboard', cycleId: 'keyboard',
    startAtMs: Date.parse('2026-09-04T10:00:00Z'), endAtMs: Date.parse('2026-09-04T11:00:00Z'),
    workdayZone: 'UTC', createdAtMs: env.clock.atMs }));
  const unchangedSource = structuredClone(env.source);
  env.service.apply({ dashboardEnabled: true });
  const shadow = env.document.getElementById(ANALYTICS_ROOT_ID).shadowRoot;
  let html = shadow.innerHTML, renderedTargets = [];
  // Model the browser boundary that matters here: innerHTML replacement drops
  // focus and produces different focusable SVG nodes from the rendered markup.
  Object.defineProperty(shadow, 'innerHTML', { get: () => html, set(value) {
    html = value; shadow.activeElement = null;
    renderedTargets = [...html.matchAll(/<(rect|circle)\b([^>]*)>/g)].filter(match => match[2].includes('data-chart-job=')).map(match => {
      const dataset = Object.fromEntries([...match[2].matchAll(/data-([a-z-]+)="([^"]*)"/g)]
        .map(([, key, value]) => [key.replace(/-([a-z])/g, (_, c) => c.toUpperCase()), value]));
      const mainChart = match.index < html.indexOf('<section aria-label="Job time and history">');
      return { dataset, mainChart, hasAttribute: name => name === 'data-chart-job', matches: () => false,
        closest: () => ({ hasAttribute: name => name === 'data-main-chart' && mainChart }),
        focus() { shadow.activeElement = this; } };
    });
    renderedTargets.push({ dataset: {}, hasAttribute: name => name === 'data-search',
      focus() { shadow.activeElement = this; } });
  } });
  shadow.querySelectorAll = selector => renderedTargets.filter(node => node.dataset.chartJob
    ? selector.includes('[data-chart-job]') : selector.includes('[data-search]'));
  async function choose(action, value) {
    const button = env.document.createElement('button'); button.dataset = { action, value }; button.closest = () => button;
    shadow.appendChild(button); await shadow.listeners.get('click')({ target: button }); button.remove();
  }
  await choose('job-view', 'graph');
  for (const mode of ['bars', 'line']) {
    await choose('chart-mode', mode);
    for (const mainChart of [true, false]) {
      const original = renderedTargets.find(node => node.dataset.chartJob === contextId && node.dataset.bucket === '4' && node.mainChart === mainChart);
      assert.ok(original, `${mode} renders the recorded Friday bucket in both charts`);
      original.focus();
      let prevented = false;
      shadow.listeners.get('keydown')({ target: original, key: mainChart ? 'Enter' : ' ', preventDefault() { prevented = true; } });
      assert.equal(prevented, true);
      assert.notEqual(shadow.activeElement, original, 'the old SVG element was replaced');
      assert.equal(shadow.activeElement?.dataset.chartJob, contextId);
      assert.equal(shadow.activeElement?.dataset.bucket, '4');
      assert.equal(shadow.activeElement?.mainChart, mainChart, 'job graph focus must not jump to the main chart');
    }
  }
  assert.deepEqual(env.source, unchangedSource, 'chart isolation never changes recorded data');
  env.service.teardown();
});
