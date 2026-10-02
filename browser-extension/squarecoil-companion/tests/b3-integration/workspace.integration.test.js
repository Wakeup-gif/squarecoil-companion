'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createEmptyDocument } = require('../../src/data/model');
const { splitInterval } = require('../../src/data/ledger');
const { createTimerReadModel } = require('../../src/timer/read-model');
const { ROOT_ID, createWorkspaceUi } = require('../../src/ui/workspace-ui');

function addContext(document, projectId, lastSeenAtMs) {
  const contextId = `job:${projectId}`;
  document.contexts[contextId] = { contextId, kind: 'job', projectId: String(projectId), currentLabel: `Job ${projectId}`, shortLabel: String(projectId), aliases: [], createdAtMs: 1, lastSeenAtMs, workspaceMembership: 'RECENT', archivedAtMs: null, legacyUnattributedMs: 0 };
  return contextId;
}

async function integrationHarness() {
  const atMs = Date.parse('2026-08-28T18:00:00Z');
  const source = createEmptyDocument({ nowMs: atMs, workdayZone: 'UTC' });
  const jobA = addContext(source, '701', atMs - 1_000);
  const jobB = addContext(source, '702', atMs - 2_000);
  source.ledger.push(...splitInterval({ sessionId: 'old-b', cycleId: 'old-b', contextId: jobB, startAtMs: atMs - 120_000, endAtMs: atMs - 60_000, workdayZone: 'UTC', createdAtMs: atMs }));
  source.timer.active = { contextId: jobA, sessionId: 'live-a', cycleId: 'live-a', startedAtMs: atMs - 30_000, lastVerifiedAtMs: atMs - 1_000, source: 'fixture', certainty: 'VERIFIED_SERVER', accrualOwnerToken: 'owner', startCause: 'new-context', safetyHold: null, provisionalSinceMs: null };
  source.timer.lastObservation = { type: 'CONTEXT_VERIFIED', contextId: jobA, observationId: 'heartbeat-a', observedAtMs: atMs - 1_000, bridgeGeneration: 1, bridgeSeq: 1, streamRuntimeId: 'stream' };
  source.revision = 1;
  source.commitId = 'data:1:fixture';
  source.commitFence = { ownerRuntimeId: 'owner', coordinationEpoch: 1, fencingToken: 1 };
  const model = createTimerReadModel(() => source, { now: () => atMs });
  const listeners = {};
  const root = { dataset: {}, innerHTML: '', classList: { add() {} }, addEventListener(type, listener) { listeners[type] = listener; }, removeEventListener() {}, contains() { return true; }, querySelector() { return null; } };
  const document = { getElementById(id) { return id === ROOT_ID ? root : null; } };
  const window = { location: new URL('https://ussignandmill.squarecoil.net/project.php?id=701'), open() {}, setInterval() { return 1; }, clearInterval() {} };
  const preferences = {};
  const storage = { async get(defaults) { return { ...defaults, ...preferences }; }, async set(values) { Object.assign(preferences, values); } };
  const timerActions = [];
  const handle = { coreSnapshot(view) { return { status: 'trusted-core-owner-active', blocked: false, timer: model.snapshot(view) }; }, async timerAction(type) { timerActions.push(type); }, async syncBridge() {} };
  const ui = createWorkspaceUi({ document, window, storage, getCoreHandle: () => handle });
  await ui.start();
  function click(dataset) { const target = { dataset, closest(selector) { return selector === '[data-action]' ? target : null; } }; listeners.click({ target, isTrusted: true, stopPropagation() {} }); }
  return { atMs, source, jobA, jobB, root, ui, click, timerActions };
}

test('IT-B3-WORKSPACE-001 selecting and inspecting inactive history never mutates authoritative Timer or Ledger state', async () => {
  const h = await integrationHarness();
  const before = structuredClone(h.source);
  h.click({ action: 'select', context: h.jobB });
  assert.equal(h.source.revision, before.revision);
  assert.deepEqual(h.source.timer, before.timer);
  assert.deepEqual(h.source.ledger, before.ledger);
  assert.deepEqual(h.timerActions, []);
  assert.match(h.root.innerHTML, /Job 702/);
  assert.match(h.root.innerHTML, /Working now/);
  h.ui.teardown();
});

test('IT-B3-WORKSPACE-002 one committed native switch drives read model, tab focus, Main, Overview, and History without a UI timer write', async () => {
  const h = await integrationHarness();
  h.source.ledger.push(...splitInterval({ sessionId: 'live-a', cycleId: 'live-a', contextId: h.jobA, startAtMs: h.atMs - 30_000, endAtMs: h.atMs, workdayZone: 'UTC', createdAtMs: h.atMs }));
  h.source.timer.active = { ...h.source.timer.active, contextId: h.jobB, sessionId: 'live-b', cycleId: 'live-b', startedAtMs: h.atMs, lastVerifiedAtMs: h.atMs };
  h.source.timer.lastObservation = { type: 'CONTEXT_CHANGED', priorContextId: h.jobA, contextId: h.jobB, observationId: 'switch-b', observedAtMs: h.atMs, bridgeGeneration: 1, bridgeSeq: 2, streamRuntimeId: 'stream' };
  h.source.revision = 2;
  h.source.commitId = 'data:2:fixture';
  h.ui.render();
  assert.match(h.root.innerHTML, /Job 702/);
  assert.deepEqual(h.timerActions, []);
  h.click({ action: 'view', view: 'overview' });
  assert.match(h.root.innerHTML, /Today by job/);
  h.click({ action: 'view', view: 'history' });
  assert.match(h.root.innerHTML, /data-history-session="live-a"/);
  assert.match(h.root.innerHTML, /Job 701/);
  assert.equal(h.source.revision, 2);
  h.ui.teardown();
});
