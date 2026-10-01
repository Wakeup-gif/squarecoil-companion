'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ROOT_ID, archiveGestureEligibility, createWorkspaceUi } = require('../../src/ui/workspace-ui');
const { DATA_COMMANDS } = require('../../src/data/data-safety');

function timer() {
  return {
    revision: 7,
    sourcePreferenceRevision: 0,
    workdayZone: 'UTC',
    timeBasis: { disclosed: false },
    currentContextId: null,
    lastObservation: null,
    focusIntent: null,
    contextRows: [{ contextId: 'job:401', kind: 'job', projectId: '401', label: 'Job 401', shortLabel: '401',
      todayMs: 10_000, totalMs: 20_000, thresholdLevel: 'NONE', status: 'NOT_RUNNING', isOperational: false,
      isProvisional: false, isSafetyHeld: false, archivedAtMs: null, workspaceMembership: 'RECENT', lastSeenAtMs: 1,
      lastRecordedActivityAtMs: 1, legacyUnattributedMs: 0 },
    { contextId: 'job:402', kind: 'job', projectId: '402', label: 'Job 402', shortLabel: '402',
      todayMs: 0, totalMs: 30_000, thresholdLevel: 'NONE', status: 'NOT_RUNNING', isOperational: false,
      isProvisional: false, isSafetyHeld: false, archivedAtMs: 100, workspaceMembership: 'ARCHIVED', lastSeenAtMs: 0,
      lastRecordedActivityAtMs: 1, legacyUnattributedMs: 0 }],
    todayTotalMs: 10_000,
    weekTotalMs: 10_000,
    todayByContext: [],
    byDayRows: [],
    byContextRows: [],
    contextDetails: {},
    historyRows: [],
    historyTotal: 0,
    historyHasMore: false,
    availableActions: { localPause: false, resume: false, startFresh: false, localResume: false },
    running: null
  };
}

async function harness({ confirmAnswers = [], mutateOnCommit = false, storageSeed = {}, includeSecondRecent = false,
  deferArchiveCommit = false, initialRevisionMismatch = false, stageError = null } = {}) {
  const listeners = {};
  const documentListeners = {};
  const staged = [];
  const committed = [];
  const timerActions = [];
  const confirms = [];
  const timeoutCalls = [];
  const storageSetCalls = [];
  let resolveArchiveCommit = null;
  const archiveCommitGate = deferArchiveCommit ? new Promise(resolve => { resolveArchiveCommit = resolve; }) : null;
  let coreSnapshotReads = 0;
  const fileInput = { insideRoot: true, files: null, value: '', click() {},
    closest(selector) { return selector === '[data-sc-data-file]' ? this : null; } };
  const root = { dataset: {}, attributes: {}, innerHTML: '', isConnected: true, classList: { add() {} }, contains(node) { return node?.insideRoot === true; }, querySelector() { return null; }, querySelectorAll() { return []; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    addEventListener(type, listener) { listeners[type] = listener; }, removeEventListener(type, listener) { if (listeners[type] === listener) delete listeners[type]; } };
  let mountedRoot = root;
  const document = { visibilityState: 'visible', getElementById(id) { return id === ROOT_ID ? mountedRoot : null; },
    addEventListener(type, listener) { documentListeners[type] = listener; },
    removeEventListener(type, listener) { if (documentListeners[type] === listener) delete documentListeners[type]; } };
  const core = {
    initialized: true, status: 'trusted-core-owner-active', blocked: false, timer: timer(),
    data: { revision: 7, datasetId: 'dataset-ui', quiescent: true,
      recentRows: [{ contextId: 'job:401', label: 'Job 401', totalMs: 20_000, protected: false }],
      archivedRows: [{ contextId: 'job:402', label: 'Job 402', totalMs: 30_000, archivedAtMs: 100, protected: false }] }
  };
  if (includeSecondRecent) {
    const second = core.timer.contextRows.find(row => row.contextId === 'job:402');
    second.workspaceMembership = 'RECENT';
    second.archivedAtMs = null;
    core.data.archivedRows = [];
    core.data.recentRows.push({ contextId: 'job:402', label: 'Job 402', totalMs: 30_000, protected: false });
  }
  if (initialRevisionMismatch) core.data.revision = core.timer.revision - 1;
  const handle = {
    coreSnapshot() { coreSnapshotReads += 1; return structuredClone(core); },
    async timerAction(type) { timerActions.push(type); },
    async syncBridge() {},
    async stageDataAction(type, values) {
      staged.push({ type, values: structuredClone(values) });
      const failure = typeof stageError === 'function' ? stageError(type, values) : stageError;
      if (failure) throw failure;
      const requiredConfirmations = type === DATA_COMMANDS.DELETE_CONTEXT ? [`DELETE:${values.contextId}`]
        : type === DATA_COMMANDS.WIPE_HISTORY ? ['WIPE_ALL_TIME_HISTORY'] : [];
      return { operation: type, planId: `plan-${staged.length}`, stagedRevision: 7, blocked: false,
        conflicts: [], requiredConfirmations, summary: { segmentsAdded: 0 } };
    },
    async commitDataAction(planId, values) {
      committed.push({ planId, values: structuredClone(values) });
      const stagedAction = staged[Number(planId.replace('plan-', '')) - 1];
      if (deferArchiveCommit && stagedAction?.type === DATA_COMMANDS.ARCHIVE_CONTEXT) await archiveCommitGate;
      if (!mutateOnCommit) return;
      if (stagedAction?.type === DATA_COMMANDS.ARCHIVE_CONTEXT) {
        const contextId = stagedAction.values.contextId;
        const row = core.timer.contextRows.find(item => item.contextId === contextId);
        if (row) { row.workspaceMembership = 'ARCHIVED'; row.archivedAtMs = stagedAction.values.atMs; }
        core.data.recentRows = core.data.recentRows.filter(item => item.contextId !== contextId);
      } else if (stagedAction?.type === DATA_COMMANDS.RESTORE_ARCHIVED) {
        const contextId = stagedAction.values.contextId;
        const row = core.timer.contextRows.find(item => item.contextId === contextId);
        if (row) { row.workspaceMembership = 'RECENT'; row.archivedAtMs = null; }
        const archived = core.data.archivedRows.find(item => item.contextId === contextId);
        core.data.archivedRows = core.data.archivedRows.filter(item => item.contextId !== contextId);
        if (archived) core.data.recentRows.push({ ...archived, archivedAtMs: null });
      }
    }
  };
  const windowListeners = {};
  const window = { location: new URL('https://ussignandmill.squarecoil.net/'), open() {},
    setInterval() { return 1; }, clearInterval() {}, setTimeout(callback, delay) { timeoutCalls.push({ callback, delay }); return timeoutCalls.length + 1; }, clearTimeout() {},
    addEventListener(type, listener) { windowListeners[type] = listener; },
    removeEventListener(type, listener) { if (windowListeners[type] === listener) delete windowListeners[type]; },
    confirm(message) { confirms.push(message); return confirmAnswers.length ? confirmAnswers.shift() : true; } };
  const storageState = structuredClone(storageSeed);
  const storage = {
    async get(defaults) { return { ...defaults, ...structuredClone(storageState) }; },
    async set(values) { storageSetCalls.push(structuredClone(values)); Object.assign(storageState, structuredClone(values)); }
  };
  let storageChangeListener = null;
  const storageChanges = {
    addListener(listener) { storageChangeListener = listener; },
    removeListener(listener) { if (storageChangeListener === listener) storageChangeListener = null; }
  };
  let ui = createWorkspaceUi({ document, window, storage, storageChanges, getCoreHandle: () => handle });
  await ui.start();
  function click(dataset, trusted = true) {
    const target = { dataset, insideRoot: true, closest(selector) { return selector === '[data-action]' ? target : null; } };
    listeners.click({ target, isTrusted: trusted, stopPropagation() {} });
  }
  function beginDrag(contextId, trusted = true) {
    const payloads = {};
    const dataTransfer = { effectAllowed: '', dropEffect: '',
      get types() { return Object.keys(payloads); },
      setData(type, value) { payloads[type] = value; }, getData(type) { return payloads[type] || ''; } };
    const tab = { dataset: { context: contextId }, insideRoot: true,
      closest(selector) { return selector === '.sc-tab[data-context]' ? tab : null; } };
    listeners.dragstart({ target: tab, isTrusted: trusted, dataTransfer });
    const page = { insideRoot: false };
    return { dataTransfer, payloads, page, trusted };
  }
  function outsideEvent(drag) {
    const event = { type: 'drop', target: drag.page, isTrusted: drag.trusted, dataTransfer: drag.dataTransfer,
      defaultPrevented: false, propagationStopped: false,
      preventDefault() { event.defaultPrevented = true; },
      stopPropagation() { event.propagationStopped = true; } };
    return event;
  }
  function dragOverOutside(drag) { const event = outsideEvent(drag); event.type = 'dragover'; documentListeners.dragover(event); return event; }
  function dropOutside(drag) { const event = outsideEvent(drag); documentListeners.drop(event); return event; }
  function dragOutside(contextId, trusted = true) { const drag = beginDrag(contextId, trusted); dragOverOutside(drag); dropOutside(drag); }
  function reorder(sourceContextId, targetContextId, placement = 'before') {
    const drag = beginDrag(sourceContextId, true);
    const slot = { dataset: { context: targetContextId }, insideRoot: true,
      closest(selector) { return selector === '.sc-tab-slot' ? slot : null; },
      getBoundingClientRect() { return { left: 0, width: 100 }; } };
    const clientX = placement === 'after' ? 75 : 25;
    listeners.dragover({ target: slot, isTrusted: true, dataTransfer: drag.dataTransfer, clientX, preventDefault() {} });
    listeners.drop({ target: slot, isTrusted: true, dataTransfer: drag.dataTransfer, preventDefault() {} });
  }
  async function drain() { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); }
  root.querySelector = selector => selector === '[data-sc-data-file]' ? fileInput : null;
  function changeRestoreOption(key, checked) {
    const target = { insideRoot: true, dataset: { restoreOption: key }, checked,
      closest(selector) { return selector === '[data-restore-option]' ? this : null; } };
    listeners.change({ target });
  }
  function importFile(mode, text) {
    click({ action: 'pick-file', fileMode: mode }, true);
    fileInput.files = [{ text: async () => text }];
    fileInput.value = 'selected';
    listeners.change({ target: fileInput });
  }
  return { get ui() { return ui; }, get coreSnapshotReads() { return coreSnapshotReads; }, root, core, staged, committed, confirms, timerActions,
    storageState, storageSetCalls, timeoutCalls, click, changeRestoreOption, importFile, beginDrag, dragOverOutside, dropOutside, dragOutside, reorder,
    dropExternal(event) { documentListeners.drop(event); },
    storageChange(changes, areaName = 'local') {
      for (const [key, change] of Object.entries(changes)) {
        if (Object.prototype.hasOwnProperty.call(change || {}, 'newValue')) storageState[key] = structuredClone(change.newValue);
      }
      storageChangeListener?.(changes, areaName);
    },
    resolveArchiveCommit() { resolveArchiveCommit?.(); },
    detachRoot({ render = false } = {}) { root.isConnected = false; mountedRoot = null; if (render) ui.render(); },
    blur() { windowListeners.blur?.(); }, drain,
    async reload() {
      ui.teardown();
      ui = createWorkspaceUi({ document, window, storage, storageChanges, getCoreHandle: () => handle });
      await ui.start();
    } };
}

test('UT-B4-UI-001 Backups and data names the three file products and destructive safety boundary', async () => {
  const h = await harness();
  h.click({ action: 'view', view: 'settings' });
  h.click({ action: 'view', view: 'data-tools' });
  assert.match(h.root.innerHTML, /Download backup/);
  assert.match(h.root.innerHTML, /Download history/);
  assert.match(h.root.innerHTML, /Download report/);
  assert.match(h.root.innerHTML, /SquareCoil official time is never changed/);
  h.ui.teardown();
});

test('UT-B4-UI-018 backup import uses the selected workspace, settings, activity, and zone choices', async () => {
  const h = await harness();
  h.click({ action: 'view', view: 'settings' });
  h.click({ action: 'view', view: 'data-tools' });
  assert.match(h.root.innerHTML, /Merge backup options/);
  assert.match(h.root.innerHTML, /Replace backup options/);
  h.importFile('BACKUP_MERGE', '{}');
  await h.drain();
  assert.equal(h.staged[0].values.importWorkspace, false);
  assert.equal(h.staged[0].values.importPreferences, false);
  assert.equal(h.committed.length, 1);

  h.changeRestoreOption('replaceWorkspace', false);
  h.changeRestoreOption('replacePreferences', false);
  h.changeRestoreOption('replaceActivity', true);
  h.changeRestoreOption('keepCurrentZone', true);
  h.importFile('BACKUP_REPLACE', '{}');
  await h.drain();
  assert.equal(h.staged[1].values.mode, 'REPLACE');
  assert.deepEqual({
    importWorkspace: h.staged[1].values.importWorkspace,
    importPreferences: h.staged[1].values.importPreferences,
    restoreActivity: h.staged[1].values.restoreActivity,
    keepCurrentZone: h.staged[1].values.keepCurrentZone
  }, { importWorkspace: false, importPreferences: false, restoreActivity: true, keepCurrentZone: true });
  assert.equal(h.timerActions.length, 0);
  h.ui.teardown();
});

test('UT-B4-UI-019 malformed CSV rows are shown without committing a partial import', async () => {
  const failure = Object.assign(new Error('history-csv-review-required'), {
    invalidRows: [{ row: 3, code: 'csv-timestamp-ambiguous' }, { row: 9, code: 'csv-duration-timestamp-mismatch' }]
  });
  const h = await harness({ stageError: type => type === DATA_COMMANDS.IMPORT_HISTORY_CSV ? failure : null });
  h.click({ action: 'view', view: 'settings' });
  h.click({ action: 'view', view: 'data-tools' });
  h.importFile('HISTORY_CSV', 'bad csv');
  await h.drain();
  assert.match(h.root.innerHTML, /Row 3/);
  assert.match(h.root.innerHTML, /Row 9/);
  assert.match(h.root.innerHTML, /Nothing was imported/);
  assert.equal(h.committed.length, 0);
  assert.equal(h.timerActions.length, 0);
  h.ui.teardown();
});

test('UT-B4-UI-002 a trusted Archive action stages and commits through data authority without Timer mutation', async () => {
  const h = await harness();
  h.click({ action: 'view', view: 'recent' });
  h.click({ action: 'data-context', dataType: DATA_COMMANDS.ARCHIVE_CONTEXT, context: 'job:401', label: 'Job 401' }, false);
  await h.drain();
  assert.equal(h.staged.length, 0);
  h.click({ action: 'data-context', dataType: DATA_COMMANDS.ARCHIVE_CONTEXT, context: 'job:401', label: 'Job 401' }, true);
  await h.drain();
  assert.equal(h.staged[0].type, DATA_COMMANDS.ARCHIVE_CONTEXT);
  assert.equal('workspace' in h.staged[0].values, false);
  assert.equal(h.committed[0].planId, 'plan-1');
  assert.equal(h.timerActions.length, 0);
  h.ui.teardown();
});

test('UT-B4-UI-003 one-Context Delete carries the exact target confirmation token', async () => {
  const h = await harness();
  h.click({ action: 'data-context', dataType: DATA_COMMANDS.DELETE_CONTEXT, context: 'job:402', label: 'Job 402' }, true);
  await h.drain();
  assert.match(h.confirms[0], /Job 402/);
  assert.match(h.confirms[0], /SquareCoil official time is unaffected/);
  assert.deepEqual(h.committed[0].values.confirmationTokens, ['DELETE:job:402']);
  h.ui.teardown();
});

test('UT-B4-UI-004 global wipe offers Full Backup before exact destructive confirmation', async () => {
  const h = await harness({ confirmAnswers: [false, true] });
  h.click({ action: 'data-simple', dataType: DATA_COMMANDS.WIPE_HISTORY }, true);
  await h.drain();
  assert.match(h.confirms[0], /Create a Full Backup before continuing/);
  assert.equal(h.confirms.length, 2);
  assert.deepEqual(h.committed[0].values, {
    confirmationTokens: ['WIPE_ALL_TIME_HISTORY'],
    preBackupDisposition: 'DECLINED'
  });
  h.ui.teardown();
});

test('UT-B4-UI-005 drag-to-page archives only a freshly verified inactive Context through data authority', async () => {
  const h = await harness();
  const drag = h.beginDrag('job:401', true);
  assert.equal(drag.payloads['text/plain'], 'SquareCoil Companion job tab');
  assert.doesNotMatch(drag.payloads['text/plain'], /401/);
  assert.equal(drag.payloads['application/x-squarecoil-companion-tab'], 'owned');
  h.dragOverOutside(drag);
  h.dropOutside(drag);
  await h.drain();
  assert.equal(h.staged.length, 1);
  assert.equal(h.staged[0].type, DATA_COMMANDS.ARCHIVE_CONTEXT);
  assert.equal(h.staged[0].values.contextId, 'job:401');
  assert.equal(h.committed.length, 1);
  assert.deepEqual(h.timerActions, []);
  h.ui.teardown();
});

test('UT-B4-UI-006 archive gestures fail closed for revision mismatch and protected recovery state', () => {
  const base = { initialized: true, blocked: false,
    timer: { revision: 8, currentContextId: null, contextRows: [{ contextId: 'job:1', label: 'Job 1', status: 'NOT_RUNNING', workspaceMembership: 'RECENT', archivedAtMs: null }] },
    data: { revision: 8, recentRows: [{ contextId: 'job:1', label: 'Job 1', protected: false }] } };
  assert.equal(archiveGestureEligibility(base, 'job:1').eligible, true);
  assert.equal(archiveGestureEligibility(base, 'job:1').message, 'Hours and history stay saved.');
  assert.equal(archiveGestureEligibility({ ...base, data: { ...base.data, revision: 7 } }, 'job:1').reason, 'PROTECTION_STATE_UNAVAILABLE');
  assert.equal(archiveGestureEligibility({ ...base, data: { ...base.data, recentRows: [{ contextId: 'job:1', protected: true }] } }, 'job:1').reason, 'CONTEXT_PROTECTED');
});

test('UT-B4-UI-007 protection that appears during a drag blocks the final Archive commit', async () => {
  const h = await harness();
  const drag = h.beginDrag('job:401');
  h.dragOverOutside(drag);
  h.core.data.recentRows[0].protected = true;
  h.dropOutside(drag);
  await h.drain();
  assert.equal(h.staged.length, 0);
  assert.equal(h.committed.length, 0);
  assert.deepEqual(h.timerActions, []);
  h.ui.teardown();
});

test('UT-B4-UI-008 leaving the browser cancels a drag instead of treating it as an Archive drop', async () => {
  const h = await harness();
  const drag = h.beginDrag('job:401');
  h.dragOverOutside(drag);
  h.blur();
  const canceledDrop = h.dropOutside(drag);
  await h.drain();
  assert.equal(canceledDrop.defaultPrevented, true);
  assert.equal(canceledDrop.propagationStopped, true);
  assert.equal(h.staged.length, 0);
  assert.equal(h.committed.length, 0);
  h.ui.teardown();
});

test('UT-B4-UI-009 normal Archive reconciles a selected Context only after the committed snapshot leaves Recent', async () => {
  const h = await harness({ mutateOnCommit: true });
  h.click({ action: 'view', view: 'recent' });
  h.click({ action: 'data-context', dataType: DATA_COMMANDS.ARCHIVE_CONTEXT, context: 'job:401', label: 'Job 401' }, true);
  await h.drain();
  assert.equal(h.committed.length, 1);
  assert.equal(h.root.dataset.hasTabs, 'false');
  assert.equal(h.core.timer.contextRows[0].workspaceMembership, 'ARCHIVED');
  assert.deepEqual(h.timerActions, []);
  h.ui.teardown();
});

test('UT-B4-UI-010 Restore returns a hidden archived Context to Recent without implicitly showing its tab', async () => {
  const h = await harness({ mutateOnCommit: true, storageSeed: {
    protoUiHiddenTabs: ['job:402'],
    b3WorkspaceOrder: ['job:401', 'job:402'],
    b3WorkspaceRevision: 7
  } });
  h.click({ action: 'data-context', dataType: DATA_COMMANDS.RESTORE_ARCHIVED, context: 'job:402', label: 'Job 402' }, true);
  await h.drain();

  assert.equal(h.core.timer.contextRows.find(row => row.contextId === 'job:402').workspaceMembership, 'RECENT');
  assert.deepEqual(h.storageState.protoUiHiddenTabs, ['job:402']);
  assert.doesNotMatch(h.root.innerHTML, /class="sc-tab"[^>]*data-context="job:402"/);

  await h.reload();
  assert.deepEqual(h.storageState.protoUiHiddenTabs, ['job:402']);
  assert.doesNotMatch(h.root.innerHTML, /class="sc-tab"[^>]*data-context="job:402"/);
  assert.deepEqual(h.timerActions, []);
  h.ui.teardown();
});

test('UT-B4-UI-011 drag preview reuses its fenced snapshot and ignores external page drags', async () => {
  const h = await harness();
  const drag = h.beginDrag('job:401');
  const readsAfterStart = h.coreSnapshotReads;
  for (let index = 0; index < 40; index += 1) h.dragOverOutside(drag);
  assert.equal(h.coreSnapshotReads, readsAfterStart);

  h.blur();
  const external = {
    target: { insideRoot: false },
    isTrusted: true,
    dataTransfer: { getData() { return 'job:external'; } },
    preventDefault() { throw new Error('An external drag must not be accepted.'); }
  };
  assert.doesNotThrow(() => h.dropExternal(external));
  assert.equal(h.staged.length, 0);
  assert.equal(h.committed.length, 0);
  assert.deepEqual(h.timerActions, []);
  h.ui.teardown();
});

test('UT-B4-UI-012 drag reorder normalizes a fresh or partial durable order before placement', async () => {
  const h = await harness({ includeSecondRecent: true });
  assert.deepEqual(h.storageState.b3WorkspaceOrder, undefined);
  h.reorder('job:401', 'job:402', 'after');
  await h.drain();
  assert.deepEqual(h.storageState.b3WorkspaceOrder, ['job:402', 'job:401']);
  assert.deepEqual(h.timerActions, []);
  h.ui.teardown();
});

test('UT-B4-UI-013 a concurrent hidden-tab update survives drag Archive and Undo', async () => {
  const h = await harness({ mutateOnCommit: true, deferArchiveCommit: true });
  h.dragOutside('job:401');
  assert.equal(h.root.dataset.busy, 'true');
  assert.equal(h.root.attributes['aria-busy'], 'true');
  h.storageChange({
    protoUiHiddenTabs: { newValue: ['job:401'] },
    b3WorkspaceRevision: { newValue: 99 }
  });
  h.resolveArchiveCommit();
  await h.drain();
  assert.equal(h.root.dataset.busy, 'false');
  assert.equal(h.root.attributes['aria-busy'], 'false');

  assert.deepEqual(h.storageState.protoUiHiddenTabs, ['job:401']);
  h.click({ action: 'undo-archive', context: 'job:401' }, true);
  await h.drain();
  assert.equal(h.core.timer.contextRows[0].workspaceMembership, 'RECENT');
  assert.deepEqual(h.storageState.protoUiHiddenTabs, ['job:401']);
  assert.doesNotMatch(h.root.innerHTML, /class="sc-tab"[^>]*data-context="job:401"/);
  assert.deepEqual(h.timerActions, []);
  h.ui.teardown();
});

test('UT-B4-UI-014 a committed Archive finishing after teardown performs no late UI or preference work', async () => {
  const h = await harness({ mutateOnCommit: true, deferArchiveCommit: true });
  const writesBefore = h.storageSetCalls.length;
  const timersBefore = h.timeoutCalls.length;
  h.dragOutside('job:401');
  h.ui.teardown();
  h.resolveArchiveCommit();
  await h.drain();

  assert.equal(h.committed.length, 1);
  assert.equal(h.core.timer.contextRows[0].workspaceMembership, 'ARCHIVED');
  assert.equal(h.storageSetCalls.length, writesBefore);
  assert.equal(h.timeoutCalls.length, timersBefore);
  assert.deepEqual(h.timerActions, []);
});

test('UT-B4-UI-015 a disconnected Companion root cancels an in-flight page Archive drop', async () => {
  const h = await harness();
  const drag = h.beginDrag('job:401');
  assert.equal(h.root.dataset.dragging, 'true');
  h.detachRoot();
  const canceledDrop = h.dropOutside(drag);
  await h.drain();
  assert.equal(canceledDrop.defaultPrevented, true);
  assert.equal(canceledDrop.propagationStopped, true);
  assert.equal(h.root.dataset.dragging, 'false');
  assert.equal(h.staged.length, 0);
  assert.equal(h.committed.length, 0);

  const rendered = await harness();
  const renderedDrag = rendered.beginDrag('job:401');
  rendered.detachRoot({ render: true });
  rendered.dropOutside(renderedDrag);
  await rendered.drain();
  assert.equal(rendered.root.dataset.dragging, 'false');
  assert.equal(rendered.staged.length, 0);
  assert.equal(rendered.committed.length, 0);
  h.ui.teardown();
  rendered.ui.teardown();
});

test('UT-B4-UI-016 a drag that starts blocked cannot archive if protection becomes available mid-gesture', async () => {
  const h = await harness({ initialRevisionMismatch: true });
  const drag = h.beginDrag('job:401');
  const preview = h.dragOverOutside(drag);
  assert.equal(preview.defaultPrevented, true);

  h.core.data.revision = h.core.timer.revision;
  const drop = h.dropOutside(drag);
  await h.drain();

  assert.equal(drop.defaultPrevented, true);
  assert.equal(drop.propagationStopped, true);
  assert.equal(h.staged.length, 0);
  assert.equal(h.committed.length, 0);
  assert.deepEqual(h.timerActions, []);
  h.ui.teardown();
});

test('UT-B4-UI-017 a bare refresh cannot replace the tab subtree during a native drag', async () => {
  const h = await harness();
  const drag = h.beginDrag('job:401');
  h.root.innerHTML = 'native-drag-source-remains-mounted';

  h.ui.render();
  assert.equal(h.root.innerHTML, 'native-drag-source-remains-mounted');

  h.dragOverOutside(drag);
  h.dropOutside(drag);
  await h.drain();
  assert.equal(h.staged.length, 1);
  assert.equal(h.committed.length, 1);
  assert.deepEqual(h.timerActions, []);
  h.ui.teardown();
});
