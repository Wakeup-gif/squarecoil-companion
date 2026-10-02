'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createEmptyDocument } = require('../../src/data/model');
const { splitInterval } = require('../../src/data/ledger');
const { createTimerReadModel, logicalHistory } = require('../../src/timer/read-model');

function addContext(document, projectId, values = {}) {
  const contextId = `job:${projectId}`;
  document.contexts[contextId] = {
    contextId,
    kind: 'job',
    projectId: String(projectId),
    currentLabel: `Job ${projectId}`,
    shortLabel: String(projectId),
    aliases: [],
    createdAtMs: 1,
    lastSeenAtMs: values.lastSeenAtMs ?? 1,
    workspaceMembership: 'RECENT',
    archivedAtMs: null,
    legacyUnattributedMs: values.legacyUnattributedMs || 0
  };
  return contextId;
}

function addActive(document, contextId, atMs, values = {}) {
  document.timer.active = {
    contextId,
    sessionId: 'session-live',
    cycleId: 'cycle-live',
    startedAtMs: values.startedAtMs ?? atMs - 60_000,
    lastVerifiedAtMs: values.lastVerifiedAtMs ?? atMs - 1_000,
    source: 'fixture',
    certainty: 'VERIFIED_SERVER',
    accrualOwnerToken: 'owner',
    startCause: 'new-context',
    safetyHold: values.safetyHold || null,
    provisionalSinceMs: values.provisionalSinceMs || null
  };
  document.timer.lastObservation = {
    type: values.type || 'CONTEXT_CHANGED',
    priorContextId: values.priorContextId || 'job:prior',
    contextId,
    observationId: values.observationId || 'observation-live',
    observedAtMs: atMs - 1_000,
    bridgeGeneration: 1,
    bridgeSeq: 2,
    streamRuntimeId: 'stream-1'
  };
}

function setRevision(document, revision) {
  document.revision = revision;
  document.commitId = `data:${revision}:fixture`;
  document.commitFence = { ownerRuntimeId: 'owner', coordinationEpoch: 1, fencingToken: 1 };
}

test('UT-B3-READ-001 one revision projects tab Today, threshold, operational status, and provisional semantics together', () => {
  const atMs = Date.parse('2026-08-28T16:00:00Z');
  const document = createEmptyDocument({ nowMs: atMs, workdayZone: 'UTC' });
  const contextId = addContext(document, '101');
  setRevision(document, 4);
  addActive(document, contextId, atMs, { startedAtMs: atMs - 120 * 60 * 1000, provisionalSinceMs: atMs - 5_000 });
  const value = createTimerReadModel(() => document, { now: () => atMs }).snapshot();
  const row = value.contextRows[0];
  assert.equal(row.todayMs, 120 * 60 * 1000);
  assert.equal(row.thresholdLevel, 'ORANGE');
  assert.equal(row.status, 'RUNNING_PROVISIONAL');
  assert.equal(row.isProvisional, true);
  assert.equal(row.sourceStateRevision, 4);
  assert.equal(row.queryAtMs, atMs);
  assert.equal(value.todayTotalIsProvisional, true);
});

test('UT-B3-READ-002 provisional and hold markers propagate only to values containing the live contribution', () => {
  const atMs = Date.parse('2026-08-28T16:00:00Z');
  const document = createEmptyDocument({ nowMs: atMs, workdayZone: 'UTC' });
  const currentId = addContext(document, '201');
  const oldId = addContext(document, '202');
  document.ledger.push(...splitInterval({ sessionId: 'old', cycleId: 'old', contextId: oldId, startAtMs: atMs - 20_000, endAtMs: atMs - 10_000, workdayZone: 'UTC', createdAtMs: atMs }));
  addActive(document, currentId, atMs, { safetyHold: { holdAtMs: atMs - 2_000, reason: 'verification-gap' }, provisionalSinceMs: atMs - 5_000 });
  const value = createTimerReadModel(() => document, { now: () => atMs }).snapshot();
  assert.equal(value.contextRows.find(row => row.contextId === currentId).isSafetyHeld, true);
  assert.equal(value.contextRows.find(row => row.contextId === currentId).isProvisional, false);
  assert.equal(value.contextRows.find(row => row.contextId === oldId).isSafetyHeld, false);
  assert.equal(value.contextRows.find(row => row.contextId === oldId).isProvisional, false);
});

test('UT-B3-READ-003 midnight ledger splits reconstruct into one safe finalized logical History session', () => {
  const startAtMs = Date.parse('2026-08-27T23:50:00Z');
  const endAtMs = Date.parse('2026-08-28T00:20:00Z');
  const document = createEmptyDocument({ nowMs: endAtMs, workdayZone: 'UTC' });
  const contextId = addContext(document, '301');
  document.ledger.push(...splitInterval({ sessionId: 'session-midnight', cycleId: 'cycle-midnight', contextId, startAtMs, endAtMs, workdayZone: 'UTC', createdAtMs: endAtMs }));
  assert.equal(document.ledger.length, 2);
  const rows = logicalHistory(document);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].durationMs, 30 * 60 * 1000);
  assert.equal(rows[0].segmentIds.length, 2);
  assert.deepEqual(rows[0].localDates, ['2026-08-27', '2026-08-28']);
});

test('UT-B3-READ-004 History remains finalized-only, deterministic, incrementally retrievable, and provenance-backed', () => {
  const atMs = Date.parse('2026-08-28T12:00:00Z');
  const document = createEmptyDocument({ nowMs: atMs, workdayZone: 'UTC' });
  const contextId = addContext(document, '401');
  for (let index = 0; index < 3; index += 1) {
    document.ledger.push(...splitInterval({ sessionId: `session-${index}`, cycleId: `cycle-${index}`, contextId, startAtMs: atMs - (index + 1) * 10_000, endAtMs: atMs - index * 10_000 - 1, workdayZone: 'UTC', createdAtMs: atMs }));
  }
  addActive(document, contextId, atMs);
  const value = createTimerReadModel(() => document, { now: () => atMs }).snapshot({ historyLimit: 2 });
  assert.equal(value.historyRows.length, 2);
  assert.equal(value.historyTotal, 3);
  assert.equal(value.historyHasMore, true);
  assert.equal(value.historyRows.every(row => row.sessionId !== 'session-live'), true);
  assert.equal(value.historyRows.every(row => row.segmentProvenance.length > 0), true);
  assert.ok(value.historyRows[0].endAtMs >= value.historyRows[1].endAtMs);
});

test('UT-B3-READ-005 Overview and Context Detail use canonical dated attribution without fabricating legacy allocation', () => {
  const atMs = Date.parse('2026-08-28T12:00:00Z');
  const document = createEmptyDocument({ nowMs: atMs, workdayZone: 'UTC' });
  const contextId = addContext(document, '501', { legacyUnattributedMs: 60_000 });
  document.ledger.push(...splitInterval({ sessionId: 'dated', cycleId: 'dated', contextId, startAtMs: atMs - 30_000, endAtMs: atMs - 10_000, workdayZone: 'UTC', createdAtMs: atMs }));
  const value = createTimerReadModel(() => document, { now: () => atMs }).snapshot({ selectedContextId: contextId });
  assert.equal(value.byDayRows.length, 1);
  assert.equal(value.byDayRows[0].durationMs, 20_000);
  assert.equal(value.contextDetails[contextId].datedMs, 20_000);
  assert.equal(value.contextDetails[contextId].totalMs, 80_000);
  assert.equal(value.contextDetails[contextId].legacyUnattributedMs, 60_000);
});

test('UT-B3-READ-006 Workday Time Zone fallback and device mismatch are disclosed explicitly', () => {
  const atMs = Date.parse('2026-08-28T12:00:00Z');
  const document = createEmptyDocument({ nowMs: atMs, workdayZone: 'UTC', workdayZoneFallback: true });
  const value = createTimerReadModel(() => document, { now: () => atMs }).snapshot({ deviceTimeZone: 'America/New_York' });
  assert.equal(value.timeBasis.disclosed, true);
  assert.equal(value.timeBasis.deviceMismatch, true);
  assert.match(value.timeBasis.label, /UTC fallback/);
});

test('UT-B3-READ-007 real incoming observations project a revision-bound focus intent while heartbeat metadata does not', () => {
  const atMs = Date.parse('2026-08-28T12:00:00Z');
  const document = createEmptyDocument({ nowMs: atMs, workdayZone: 'UTC' });
  const contextId = addContext(document, '601');
  setRevision(document, 9);
  addActive(document, contextId, atMs, { type: 'CONTEXT_CHANGED', priorContextId: 'job:600' });
  const model = createTimerReadModel(() => document, { now: () => atMs });
  assert.equal(model.snapshot().focusIntent.contextId, contextId);
  document.timer.lastObservation.type = 'CONTEXT_METADATA_UPDATED';
  assert.equal(model.snapshot().focusIntent, null);
});

test('UT-B3-READ-010 a later same-Context verification does not erase the last real focus transition', () => {
  const atMs = Date.parse('2026-08-28T12:00:00Z');
  const document = createEmptyDocument({ nowMs: atMs, workdayZone: 'UTC' });
  const contextId = addContext(document, '610');
  setRevision(document, 10);
  addActive(document, contextId, atMs, { type: 'CONTEXT_VERIFIED', observationId: 'verified-after-switch' });
  document.timer.lastFocusTransition = {
    ...document.timer.lastObservation,
    type: 'CONTEXT_CHANGED',
    priorContextId: 'job:609',
    observationId: 'real-switch-610'
  };
  const value = createTimerReadModel(() => document, { now: () => atMs }).snapshot();
  assert.equal(value.focusIntent.intentId, 'focus:real-switch-610');
  assert.equal(value.focusIntent.contextId, contextId);
  assert.equal(value.focusIntent.sourceStateRevision, 10);
});

test('UT-B3-READ-008 zero-duration operational truth remains visible and native disposition stays a separate dimension', () => {
  const atMs = Date.parse('2026-08-28T12:00:00Z');
  const document = createEmptyDocument({ nowMs: atMs, workdayZone: 'UTC' });
  const contextId = addContext(document, '701');
  addActive(document, contextId, atMs, { startedAtMs: atMs, lastVerifiedAtMs: atMs, type: 'CONTEXT_DETECTED', priorContextId: null });
  let value = createTimerReadModel(() => document, { now: () => atMs }).snapshot();
  assert.equal(value.todayByContext.length, 1);
  assert.equal(value.todayByContext[0].durationMs, 0);
  assert.equal(value.nativeDisposition, 'TRACKABLE_CONTEXT');
  document.timer.active = null;
  document.timer.lastObservation = { ...document.timer.lastObservation, type: 'CLOCKED_OUT', contextId: null, priorContextId: contextId };
  value = createTimerReadModel(() => document, { now: () => atMs }).snapshot({ selectedContextId: contextId });
  assert.equal(value.operationalStatus, 'NOT_RUNNING');
  assert.equal(value.nativeDisposition, 'SQUARECOIL_CLOCKED_OUT');
});

test('UT-B3-READ-009 threshold recomputes from exact current-day contribution and committed preference revision', () => {
  let atMs = Date.parse('2026-08-28T23:59:59.999Z');
  const document = createEmptyDocument({ nowMs: atMs, workdayZone: 'UTC' });
  const contextId = addContext(document, '801');
  addActive(document, contextId, atMs, { startedAtMs: atMs - 10, lastVerifiedAtMs: atMs });
  const model = createTimerReadModel(() => document, {
    now: () => atMs,
    timerLimits: { yellow: 5, orange: 10, red: 20 },
    sourcePreferenceRevision: 7
  });
  let row = model.snapshot().contextRows[0];
  assert.equal(row.todayMs, 10);
  assert.equal(row.thresholdLevel, 'ORANGE');
  assert.equal(row.sourcePreferenceRevision, 7);
  atMs += 2;
  row = model.snapshot().contextRows[0];
  assert.equal(row.todayMs, 1);
  assert.equal(row.thresholdLevel, 'NONE');
});
