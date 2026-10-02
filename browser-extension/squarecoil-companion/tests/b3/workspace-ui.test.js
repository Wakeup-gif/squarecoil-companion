'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ROOT_ID, createWorkspaceUi } = require('../../src/ui/workspace-ui');

function makeTimer() {
  const rows = ['101', '202', '303'].map((projectId, index) => ({
    contextId: `job:${projectId}`,
    kind: 'job',
    projectId,
    label: `Job ${projectId}`,
    shortLabel: projectId,
    todayMs: (index + 1) * 60 * 60 * 1000,
    totalMs: (index + 1) * 120 * 60 * 1000,
    thresholdLevel: ['YELLOW', 'ORANGE', 'RED'][index],
    status: index === 0 ? 'RUNNING' : 'NOT_RUNNING',
    isOperational: index === 0,
    isProvisional: false,
    isSafetyHeld: false,
    archivedAtMs: null,
    workspaceMembership: 'RECENT',
    lastSeenAtMs: 3_000 - index,
    lastRecordedActivityAtMs: 2_000 - index,
    legacyUnattributedMs: 0
  }));
  return {
    revision: 1,
    sourcePreferenceRevision: 0,
    workdayZone: 'UTC',
    timeBasis: { disclosed: true, label: 'Time basis: UTC fallback', deviceMismatch: false },
    currentContextId: 'job:101',
    lastObservation: null,
    focusIntent: null,
    contextRows: rows,
    todayTotalMs: rows.reduce((sum, row) => sum + row.todayMs, 0),
    weekTotalMs: 12 * 60 * 60 * 1000,
    todayByContext: rows.map(row => ({ ...row, durationMs: row.todayMs })),
    byDayRows: [{ localDate: '2026-08-28', durationMs: 6 * 60 * 60 * 1000, contextCount: 3, topContextLabel: 'Job 303', topContextDurationMs: 3 * 60 * 60 * 1000 }],
    byContextRows: rows,
    contextDetails: Object.fromEntries(rows.map(row => [row.contextId, { ...row, weekMs: row.todayMs, datedMs: row.totalMs, dailyRows: [], finalizedSessions: [] }])),
    historyRows: Array.from({ length: 100 }, (_, index) => ({ logicalSessionId: `logical-${index}`, sessionId: `session-${index}`, cycleId: `cycle-${index}`, contextId: 'job:101', label: 'Job 101', startAtMs: index * 1000, endAtMs: index * 1000 + 500, durationMs: 500, localDate: '2026-08-28', localDates: ['2026-08-28'], segmentIds: [`segment-${index}`] })),
    historyTotal: 150,
    historyHasMore: true,
    availableActions: { localPause: true, resume: false, startFresh: false, localResume: false },
    running: { elapsedMs: 60_000, provisional: false }
  };
}

async function harness(options = {}) {
  const listeners = {};
  const storageListeners = new Set();
  const writes = [];
  const timerActions = [];
  let tabNodes = [];
  let intervalCallback = null;
  let throwRead = false;
  let renderedHtml = '';
  const technicalDetails = { open: false };
  const fileInput = {
    files: [], value: '', clickCount: 0,
    click() { this.clickCount += 1; },
    closest(selector) { return selector === '[data-sc-data-file]' ? this : null; }
  };
  const root = {
    dataset: {}, classList: { add() {} },
    get innerHTML() { return renderedHtml; },
    set innerHTML(value) {
      renderedHtml = String(value);
      if (renderedHtml.includes('class="sc-technical"')) {
        technicalDetails.open = /class="sc-technical" open/.test(renderedHtml);
      }
    },
    addEventListener(type, listener) { listeners[type] = listener; },
    removeEventListener(type, listener) { if (listeners[type] === listener) delete listeners[type]; },
    contains() { return true; },
    querySelector(selector) {
      if (selector === '.sc-technical' && renderedHtml.includes('class="sc-technical"')) return technicalDetails;
      if (selector === '[data-sc-data-file]' && renderedHtml.includes('data-sc-data-file')) return fileInput;
      return null;
    },
    querySelectorAll(selector) { return selector === '.sc-tab[data-context]' ? tabNodes : []; }
  };
  const document = { getElementById(id) { return id === ROOT_ID ? root : null; } };
  const window = {
    location: new URL('https://ussignandmill.squarecoil.net/project.php?id=101'),
    open() {}, setInterval(callback) { intervalCallback = callback; return 1; }, clearInterval() { intervalCallback = null; }
  };
  const preferences = { ...(options.preferences || {}) };
  const storage = {
    async get(defaults) { return { ...defaults, ...preferences }; },
    async set(values) { Object.assign(preferences, values); writes.push(structuredClone(values)); }
  };
  const storageChanges = {
    addListener(listener) { storageListeners.add(listener); }, removeListener(listener) { storageListeners.delete(listener); }
  };
  const timer = makeTimer();
  options.prepareTimer?.(timer);
  const core = { initialized: true, status: 'trusted-core-owner-active', blocked: false, timer,
    data: { revision: timer.revision, recentRows: timer.contextRows.map(row => ({
      contextId: row.contextId, label: row.label, protected: row.status !== 'NOT_RUNNING'
    })) } };
  options.prepareCore?.(core);
  const handle = {
    coreSnapshot(view) {
      if (throwRead) throw new Error('transient-read');
      core.data.revision = timer.revision;
      core.data.recentRows = timer.contextRows.filter(row => row.workspaceMembership === 'RECENT').map(row => ({
        contextId: row.contextId, label: row.label, protected: row.status !== 'NOT_RUNNING'
      }));
      timer.historyHasMore = view.historyLimit < timer.historyTotal;
      timer.historyRows = Array.from({ length: Math.min(view.historyLimit, timer.historyTotal) }, (_, index) => ({ logicalSessionId: `logical-${index}`, sessionId: `session-${index}`, cycleId: `cycle-${index}`, contextId: 'job:101', label: 'Job 101', startAtMs: index * 1000, endAtMs: index * 1000 + 500, durationMs: 500, localDate: '2026-08-28', localDates: ['2026-08-28'], segmentIds: [`segment-${index}`] }));
      return structuredClone(core);
    },
    async timerAction(type) { timerActions.push(type); }, async syncBridge() {}
  };
  const ui = createWorkspaceUi({ document, window, storage, storageChanges, getCoreHandle: () => handle });
  await ui.start();
  function click(dataset, trusted = true) {
    const target = { dataset, closest(selector) { return selector === '[data-action]' ? target : null; } };
    listeners.click({ target, isTrusted: trusted, stopPropagation() {} });
  }
  function doubleClick(contextId) {
    const target = { dataset: { context: contextId }, closest(selector) { return selector === '.sc-tab[data-context]' ? target : null; } };
    listeners.dblclick({ target, isTrusted: true });
  }
  function storageChange(changes) { for (const listener of storageListeners) listener(changes, 'local'); }
  function beginNativeDrag(contextId) {
    const target = { dataset: { context: contextId }, closest(selector) { return selector === '.sc-tab[data-context]' ? target : null; } };
    listeners.dragstart({ target, isTrusted: true, dataTransfer: { setData() {}, effectAllowed: '' } });
  }
  function arrowKey(contextIds, activeIndex, key) {
    tabNodes = contextIds.map(contextId => ({ dataset: { context: contextId },
      closest(selector) { return selector === '.sc-tab[data-context]' ? this : null; } }));
    listeners.keydown({ target: tabNodes[activeIndex], key, preventDefault() {}, stopPropagation() {} });
  }
  return { ui, root, timer, core, writes, timerActions, click, doubleClick, storageChange, beginNativeDrag,
    endNativeDrag() { listeners.dragend?.({}); }, arrowKey,
    setThrowRead(value) { throwRead = value; }, intervalCallback: () => intervalCallback,
    setTechnicalDetailsOpen(value) { technicalDetails.open = value === true; },
    fileInput,
    cancelFilePicker() { listeners.cancel?.({ target: fileInput }); }
  };
}

test('UT-B3-UI-024 startup loading discloses connection without fabricated Timer values and keeps Settings available', async () => {
  const h = await harness({ prepareCore(core) { core.timer = null; core.initialized = false; core.status = 'initializing'; } });
  assert.match(h.root.innerHTML, /Loading…/);
  assert.doesNotMatch(h.root.innerHTML, /Connecting to your saved workspace/);
  assert.match(h.root.innerHTML, /data-sc-view-key="main:loading"/);
  assert.match(h.root.innerHTML, /data-action="view" data-view="settings"/);
  assert.doesNotMatch(h.root.innerHTML, /data-timer-action=/);
  h.core.timer = h.timer; h.core.initialized = true;
  h.ui.render();
  assert.doesNotMatch(h.root.innerHTML, /sc-loading-heading"/);
  assert.match(h.root.innerHTML, /data-sc-view-key="main:ready"/);
  h.ui.teardown();
});

test('UT-B3-UI-025 a blocked pre-Timer snapshot shows recovery instead of indefinite loading', async () => {
  const h = await harness({ prepareCore(core) { core.timer = null; core.initialized = false; core.blocked = true; } });
  assert.match(h.root.innerHTML, /Needs attention/);
  assert.doesNotMatch(h.root.innerHTML, /Loading…/);
  assert.doesNotMatch(h.root.innerHTML, /data-timer-action=/);
  assert.equal(h.root.dataset.workspaceState, 'blocked');
  h.ui.teardown();
});

test('UT-B3-UI-001 compact tabs expose Today, threshold meaning, operational status, and accessibility text together', async () => {
  const h = await harness();
  assert.match(h.root.innerHTML, /data-threshold="YELLOW"/);
  assert.match(h.root.innerHTML, /Yellow timer limit/);
  assert.match(h.root.innerHTML, /Today 1h 00m/);
  assert.match(h.root.innerHTML, /Running/);
  assert.match(h.root.innerHTML, /\.sc-tab\[data-threshold="YELLOW"\]\{--sc-tab-threshold:#d9a51f\}/);
  assert.match(h.root.innerHTML, /button\.sc-tab\{[^}]*box-shadow:inset 0 3px var\(--sc-tab-threshold\)[^}]*!important/);
  h.ui.teardown();
});

test('UT-B3-UI-002 a real authoritative A to B intent selects, reveals, opens Main, and expands exactly once', async () => {
  const h = await harness();
  h.click({ action: 'view', view: 'settings' });
  h.click({ action: 'collapse' });
  h.timer.revision = 2;
  h.timer.currentContextId = 'job:202';
  h.timer.contextRows.forEach(row => { row.isOperational = row.contextId === 'job:202'; row.status = row.isOperational ? 'RUNNING' : 'NOT_RUNNING'; });
  h.timer.focusIntent = { intentId: 'focus:b', contextId: 'job:202', priorContextId: 'job:101', transitionType: 'CONTEXT_CHANGED', sourceStateRevision: 2 };
  h.ui.render();
  assert.equal(h.root.dataset.protoCollapsed, 'false');
  assert.match(h.root.innerHTML, /Job 202/);
  assert.doesNotMatch(h.root.innerHTML, /Local data and backups/);
  const writesAfterFirst = h.writes.length;
  h.ui.render();
  assert.equal(h.writes.length, writesAfterFirst);
  h.ui.teardown();
});

test('UT-B3-UI-003 same-Context heartbeat or metadata refresh never steals selection or reopens collapse', async () => {
  const h = await harness();
  h.click({ action: 'select', context: 'job:202' });
  h.click({ action: 'collapse' });
  h.timer.revision = 2;
  h.timer.lastObservation = { type: 'CONTEXT_METADATA_UPDATED', contextId: 'job:101' };
  h.timer.focusIntent = null;
  h.ui.render();
  assert.equal(h.root.dataset.protoCollapsed, 'true');
  h.click({ action: 'collapse' });
  assert.match(h.root.innerHTML, /Job 202/);
  h.ui.teardown();
});

test('UT-B3-UI-004 dirty route defers native focus and a newer explicit user selection defeats the older intent', async () => {
  const h = await harness();
  h.click({ action: 'view', view: 'settings' });
  h.ui.setRouteProtection({ dirty: true });
  h.timer.revision = 2;
  h.timer.currentContextId = 'job:202';
  h.timer.focusIntent = { intentId: 'focus:b', contextId: 'job:202', priorContextId: 'job:101', transitionType: 'CONTEXT_CHANGED', sourceStateRevision: 2 };
  h.ui.render();
  assert.match(h.root.innerHTML, /Local data and backups/);
  h.click({ action: 'select', context: 'job:303' });
  h.ui.setRouteProtection({ dirty: false });
  assert.match(h.root.innerHTML, /Job 303/);
  h.ui.teardown();
});

test('UT-B3-UI-005 transient failure and an older revision retain the last trusted values with visible stale state', async () => {
  const h = await harness();
  assert.match(h.root.innerHTML, /Job 101/);
  h.setThrowRead(true);
  h.ui.render();
  assert.match(h.root.innerHTML, /Reconnecting…/);
  assert.match(h.root.innerHTML, /Job 101/);
  h.setThrowRead(false);
  h.timer.revision = 0;
  h.ui.render();
  assert.match(h.root.innerHTML, /An older update was ignored/);
  h.ui.teardown();
});

test('UT-B3-UI-006 History loads beyond the initial bounded page without using the page size as retention', async () => {
  const h = await harness();
  h.click({ action: 'view', view: 'history' });
  assert.match(h.root.innerHTML, /Load more \(100 of 150\)/);
  h.click({ action: 'load-history' });
  assert.doesNotMatch(h.root.innerHTML, /Load more/);
  assert.match(h.root.innerHTML, /data-history-session="session-149"/);
  h.ui.teardown();
});

test('UT-B3-UI-007 cross-tab visibility and order synchronization changes presentation without Timer commands or selection writes', async () => {
  const h = await harness();
  h.storageChange({
    protoUiHiddenTabs: { newValue: ['job:202'] },
    b3WorkspaceOrder: { newValue: ['job:303', 'job:101', 'job:202'] },
    b3WorkspaceRevision: { newValue: Date.now() + 1000 }
  });
  assert.equal(h.timerActions.length, 0);
  h.click({ action: 'view', view: 'recent' });
  assert.match(h.root.innerHTML, /job:202/);
  assert.match(h.root.innerHTML, /Show in Tabs/);
  h.ui.teardown();
});

test('UT-B3-UI-008 Details discloses undated legacy balance separately from dated totals', async () => {
  const h = await harness();
  h.timer.contextDetails['job:202'].legacyUnattributedMs = 60_000;
  h.timer.contextDetails['job:202'].totalMs += 60_000;
  h.click({ action: 'context-detail', context: 'job:202' });
  assert.match(h.root.innerHTML, /Undated time/);
  assert.match(h.root.innerHTML, /Included in the total only/);
  h.ui.teardown();
});

test('UT-B3-UI-026 Details Back returns directly to the view that opened it', async () => {
  const h = await harness();
  h.click({ action: 'context-detail', context: 'job:101' });
  assert.match(h.root.innerHTML, /data-action="view" data-view="main" aria-label="Back"/);
  h.click({ action: 'view', view: 'main' });
  assert.match(h.root.innerHTML, /class="sc-timer-card"/);

  h.click({ action: 'view', view: 'overview' });
  h.click({ action: 'context-detail', context: 'job:202' });
  assert.match(h.root.innerHTML, /data-action="view" data-view="overview" aria-label="Back"/);
  h.click({ action: 'view', view: 'overview' });
  assert.match(h.root.innerHTML, /data-sc-view-heading>Time Overview<\/strong>/);

  h.click({ action: 'view', view: 'by-context' });
  h.click({ action: 'context-detail', context: 'job:303' });
  assert.match(h.root.innerHTML, /data-action="view" data-view="by-context" aria-label="Back"/);
  h.click({ action: 'view', view: 'by-context' });
  assert.match(h.root.innerHTML, /data-sc-view-heading>By job<\/strong>/);
  assert.deepEqual(h.timerActions, []);
  h.ui.teardown();
});

test('UT-B3-UI-027 More tools contains search below destinations and long job views expose scroll regions', async () => {
  const h = await harness();
  const main = h.root.innerHTML;
  assert.doesNotMatch(main, /data-action="view" data-view="home"/);
  const tools = main.slice(main.indexOf('<details class="sc-quick-links"'));
  assert.ok(tools.indexOf('>More tools</summary>') < tools.indexOf('data-view="recent"'));
  assert.ok(tools.indexOf('data-view="recent"') < tools.indexOf('data-view="overview"'));
  assert.ok(tools.indexOf('data-view="overview"') < tools.indexOf('data-view="history"'));
  assert.ok(tools.indexOf('data-view="history"') < tools.indexOf('data-sc-search-form'));
  for (const [route, list] of [['recent', 'recent'], ['overview', 'overview'], ['history', 'history']]) {
    h.click({ action: 'view', view: route });
    assert.match(h.root.innerHTML, new RegExp(`class="sc-list-scroll" data-sc-list="${list}" role="region"`));
  }
  h.click({ action: 'view', view: 'settings' });
  assert.doesNotMatch(h.root.innerHTML, /data-action="view" data-view="home"/);
  h.click({ action: 'settings-close' });
  assert.match(h.root.innerHTML, /class="sc-timer-card"/);
  assert.deepEqual(h.timerActions, []);
  h.ui.teardown();
});

test('UT-B3-UI-028 inspected job keeps current context visible and returns from the total row without changing time', async () => {
  const h = await harness();
  h.click({ action: 'select', context: 'job:202' });
  const html = h.root.innerHTML;
  const cue = html.slice(html.indexOf('<div class="sc-current-strip">'), html.indexOf('<section class="sc-timer-card"'));
  const totalAreaStart = html.indexOf('<div class="sc-total-area">');
  const totalArea = html.slice(totalAreaStart, html.indexOf('<div class="sc-actions">', totalAreaStart));
  assert.match(cue, /Working now · Job 101/);
  assert.doesNotMatch(cue, /View current/);
  assert.match(totalArea, /class="sc-view-current" data-action="select" data-context="job:101"/);
  assert.ok(totalArea.indexOf('View current') < totalArea.indexOf('class="sc-metric sc-metric-total"'));
  assert.equal(h.timer.currentContextId, 'job:101');
  h.click({ action: 'select', context: 'job:101' });
  assert.doesNotMatch(h.root.innerHTML, /class="sc-current-strip"|class="sc-view-current"/);
  assert.equal(h.timer.currentContextId, 'job:101');
  assert.deepEqual(h.timerActions, []);
  h.ui.teardown();
});

test('UT-B3-UI-009 A to none keeps historical inspection, while later none to B focuses only the real re-entry', async () => {
  const h = await harness();
  h.click({ action: 'select', context: 'job:303' });
  h.timer.revision = 2;
  h.timer.currentContextId = null;
  h.timer.lastObservation = { type: 'CLOCKED_OUT', contextId: null, priorContextId: 'job:101' };
  h.timer.focusIntent = null;
  h.ui.render();
  assert.match(h.root.innerHTML, /Job 303/);
  h.timer.revision = 3;
  h.timer.currentContextId = 'job:202';
  h.timer.lastObservation = { type: 'CONTEXT_DETECTED', contextId: 'job:202' };
  h.timer.focusIntent = { intentId: 'focus:reentry-b', contextId: 'job:202', priorContextId: null, transitionType: 'CONTEXT_DETECTED', sourceStateRevision: 3 };
  h.ui.render();
  assert.match(h.root.innerHTML, /Job 202/);
  h.ui.teardown();
});

test('UT-B3-UI-010 boot baseline honors current-focus selection priority without impersonating entry or expanding', async () => {
  const h = await harness({
    preferences: { protoUiCollapsed: true, b3LastSelectedContextId: 'job:202' },
    prepareTimer(timer) {
      timer.focusIntent = { intentId: 'focus:boot-a', contextId: 'job:101', priorContextId: null, transitionType: 'CONTEXT_DETECTED', sourceStateRevision: 1 };
    }
  });
  assert.equal(h.root.dataset.protoCollapsed, 'true');
  h.click({ action: 'collapse' });
  assert.match(h.root.innerHTML, /data-context="job:101" data-selected="true"/);
  h.ui.teardown();
});

test('UT-B3-UI-011 a hidden incoming Context is revealed before current focus applies', async () => {
  const h = await harness({ preferences: { protoUiHiddenTabs: ['job:202'] } });
  assert.doesNotMatch(h.root.innerHTML, /data-context="job:202"/);
  h.timer.revision = 2;
  h.timer.currentContextId = 'job:202';
  h.timer.focusIntent = { intentId: 'focus:hidden-b', contextId: 'job:202', priorContextId: 'job:101', transitionType: 'CONTEXT_CHANGED', sourceStateRevision: 2 };
  h.ui.render();
  assert.match(h.root.innerHTML, /data-context="job:202" data-selected="true"/);
  assert.equal(h.writes.some(write => Array.isArray(write.protoUiHiddenTabs) && !write.protoUiHiddenTabs.includes('job:202')), true);
  h.ui.teardown();
});

test('UT-B3-UI-012 newer native C supersedes deferred B and stale B cannot override current C', async () => {
  const h = await harness();
  h.ui.setRouteProtection({ dirty: true });
  h.timer.revision = 2;
  h.timer.currentContextId = 'job:202';
  h.timer.focusIntent = { intentId: 'focus:b-old', contextId: 'job:202', priorContextId: 'job:101', transitionType: 'CONTEXT_CHANGED', sourceStateRevision: 2 };
  h.ui.render();
  h.timer.revision = 3;
  h.timer.currentContextId = 'job:303';
  h.timer.focusIntent = { intentId: 'focus:c-new', contextId: 'job:303', priorContextId: 'job:202', transitionType: 'CONTEXT_CHANGED', sourceStateRevision: 3 };
  h.ui.render();
  h.ui.setRouteProtection({ dirty: false });
  assert.match(h.root.innerHTML, /Job 303/);
  h.timer.focusIntent = { intentId: 'focus:b-replayed', contextId: 'job:202', priorContextId: 'job:101', transitionType: 'CONTEXT_CHANGED', sourceStateRevision: 2 };
  h.ui.render();
  assert.match(h.root.innerHTML, /Job 303/);
  h.ui.teardown();
});

test('UT-B3-UI-013 double click selects and expands while the single-click path never changes Timer state', async () => {
  const h = await harness();
  h.click({ action: 'collapse' });
  h.doubleClick('job:202');
  assert.equal(h.root.dataset.protoCollapsed, 'false');
  assert.match(h.root.innerHTML, /Job 202/);
  assert.deepEqual(h.timerActions, []);
  h.ui.teardown();
});

test('UT-B3-UI-014 job tabs protrude above the Companion frame with scroll and drag instructions', async () => {
  const h = await harness();
  const tabsAt = h.root.innerHTML.indexOf('class="sc-tabs"');
  const shellAt = h.root.innerHTML.indexOf('class="sc-proto-shell"');
  assert.ok(tabsAt >= 0 && shellAt > tabsAt);
  assert.match(h.root.innerHTML, /role="tablist"/);
  assert.match(h.root.innerHTML, /Scroll to see more jobs\. Drag tabs to reorder/);
  assert.match(h.root.innerHTML, /class="sc-tab-slot"/);
  assert.match(h.root.innerHTML, /class="sc-tab-x"/);
  assert.equal(h.root.dataset.hasTabs, 'true');
  h.ui.teardown();
});

test('UT-B3-UI-015 a cross-tab workspace update cancels an active drag before rerendering', async () => {
  const h = await harness();
  h.beginNativeDrag('job:202');
  assert.equal(h.root.dataset.dragging, 'true');
  h.storageChange({ b3WorkspaceOrder: { newValue: ['job:303', 'job:202', 'job:101'] },
    b3WorkspaceRevision: { newValue: Date.now() + 5_000 } });
  assert.equal(h.root.dataset.dragging, 'false');
  assert.equal(h.timerActions.length, 0);
  h.ui.teardown();
});

test('UT-B3-UI-016 tab Arrow, Home, and End keys use manual activation without Timer commands', async () => {
  const h = await harness();
  h.arrowKey(['job:101', 'job:202', 'job:303'], 0, 'ArrowRight');
  assert.equal(h.writes.at(-1).b3LastSelectedContextId, 'job:202');
  h.arrowKey(['job:101', 'job:202', 'job:303'], 1, 'End');
  assert.equal(h.writes.at(-1).b3LastSelectedContextId, 'job:303');
  h.arrowKey(['job:101', 'job:202', 'job:303'], 2, 'Home');
  assert.equal(h.writes.at(-1).b3LastSelectedContextId, 'job:101');
  assert.deepEqual(h.timerActions, []);
  h.ui.teardown();
});

test('UT-B3-UI-017 narrow archive guidance rises above the Companion instead of hiding under it', async () => {
  const h = await harness();
  assert.match(h.root.innerHTML, /@media\(max-width:760px\)\{#ussign-job-timer \.sc-archive-veil\{z-index:9;place-items:center;padding:20px\}\}/);
  assert.match(h.root.innerHTML, /\.sc-archive-veil\{position:fixed;z-index:1;inset:0/);
  assert.match(h.root.innerHTML, /\.sc-archive-veil>div\{[^}]*background:#141b22/);
  assert.match(h.root.innerHTML, /\.sc-archive-veil small\{color:#d6e0e8!important\}/);
  assert.match(h.root.innerHTML, /@media\(forced-colors:active\)[\s\S]*\.sc-archive-veil small\{color:CanvasText!important\}/);
  assert.deepEqual(h.timerActions, []);
  h.ui.teardown();
});

test('UT-B3-UI-018 Main rejects a persisted archived selection but explicit Details preserves it', async () => {
  const h = await harness({
    preferences: { b3LastSelectedContextId: 'job:202' },
    prepareTimer(timer) {
      const archived = timer.contextRows.find(row => row.contextId === 'job:202');
      archived.workspaceMembership = 'ARCHIVED';
      archived.archivedAtMs = 5_000;
    }
  });

  assert.match(h.root.innerHTML, /data-context="job:101" data-selected="true"/);
  assert.doesNotMatch(h.root.innerHTML, /data-context="job:202" data-selected="true"/);
  assert.equal(h.writes.some(write => write.b3LastSelectedContextId === 'job:101'), true);

  h.click({ action: 'context-detail', context: 'job:202' });
  assert.match(h.root.innerHTML, /Details/);
  assert.match(h.root.innerHTML, /Job 202/);
  h.ui.teardown();
});

test('UT-B3-UI-019 Main reconciles when another authority archives the selected job', async () => {
  const h = await harness();
  h.click({ action: 'select', context: 'job:202' });
  assert.match(h.root.innerHTML, /data-context="job:202" data-selected="true"/);

  const archived = h.timer.contextRows.find(row => row.contextId === 'job:202');
  archived.workspaceMembership = 'ARCHIVED';
  archived.archivedAtMs = 6_000;
  h.timer.revision += 1;
  h.ui.render();

  assert.match(h.root.innerHTML, /data-context="job:101" data-selected="true"/);
  assert.doesNotMatch(h.root.innerHTML, /data-context="job:202" data-selected="true"/);
  assert.equal(h.writes.at(-1).b3LastSelectedContextId, 'job:101');
  assert.deepEqual(h.timerActions, []);
  h.ui.teardown();
});

test('UT-B3-UI-020 Show in Tabs promotes and selects an automatically overflowed job', async () => {
  const h = await harness({
    prepareTimer(timer) {
      for (const [projectId, lastSeenAtMs] of [['404', 2_997], ['505', 2_996], ['606', 1]]) {
        const template = structuredClone(timer.contextRows[1]);
        Object.assign(template, {
          contextId: `job:${projectId}`, projectId, label: `Job ${projectId}`, shortLabel: projectId,
          lastSeenAtMs, lastRecordedActivityAtMs: lastSeenAtMs, todayMs: 0, totalMs: 0,
          status: 'NOT_RUNNING', isOperational: false
        });
        timer.contextRows.push(template);
        timer.contextDetails[template.contextId] = { ...structuredClone(template), weekMs: 0, datedMs: 0, dailyRows: [], finalizedSessions: [] };
      }
    }
  });

  h.click({ action: 'view', view: 'recent' });
  assert.match(h.root.innerHTML, /data-action="show-tab" data-context="job:606"/);
  h.click({ action: 'show-tab', context: 'job:606' });

  assert.match(h.root.innerHTML, /data-context="job:606" data-selected="true"/);
  assert.deepEqual(h.timerActions, []);
  h.ui.teardown();
});

test('UT-B3-UI-021 drag end flushes an authoritative Context change deferred during the native drag', async () => {
  const h = await harness();
  h.beginNativeDrag('job:202');
  const first = h.timer.contextRows.find(row => row.contextId === 'job:101');
  const second = h.timer.contextRows.find(row => row.contextId === 'job:202');
  first.status = 'NOT_RUNNING'; first.isOperational = false;
  second.status = 'RUNNING'; second.isOperational = true;
  h.timer.currentContextId = second.contextId;
  h.timer.revision += 1;
  h.intervalCallback()();
  assert.doesNotMatch(h.root.innerHTML, /Working now[\s\S]*Job 202/);
  h.endNativeDrag();
  assert.match(h.root.innerHTML, /Working now[\s\S]*Job 202/);
  assert.equal(h.root.dataset.dragging, 'false');
  h.ui.teardown();
});

test('UT-B3-UI-022 live diagnostics refresh preserves the user-open Technical details section', async () => {
  const h = await harness();
  h.click({ action: 'open-diagnostics' });
  assert.match(h.root.innerHTML, /<details class="sc-technical">/);
  h.setTechnicalDetailsOpen(true);
  h.timer.revision += 1;
  h.intervalCallback()();
  assert.match(h.root.innerHTML, /<details class="sc-technical" open>/);
  h.ui.teardown();
});

test('UT-B3-UI-023 canceling the file picker resumes live authority refresh', async () => {
  const h = await harness();
  h.click({ action: 'view', view: 'data-tools' });
  h.click({ action: 'pick-file', fileMode: 'BACKUP_MERGE' });
  assert.equal(h.fileInput.clickCount, 1);

  const first = h.timer.contextRows.find(row => row.contextId === 'job:101');
  const second = h.timer.contextRows.find(row => row.contextId === 'job:202');
  first.status = 'NOT_RUNNING'; first.isOperational = false;
  second.status = 'RUNNING'; second.isOperational = true;
  h.timer.currentContextId = second.contextId;
  h.timer.revision += 1;
  h.intervalCallback()();
  assert.doesNotMatch(h.root.innerHTML, /data-context="job:202"[^>]*data-operational="true"/);

  h.cancelFilePicker();
  assert.match(h.root.innerHTML, /data-context="job:202"[^>]*data-operational="true"/);
  h.ui.teardown();
});
