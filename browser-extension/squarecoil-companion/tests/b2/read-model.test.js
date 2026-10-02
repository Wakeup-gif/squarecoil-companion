'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createEmptyDocument } = require('../../src/data/model');
const { splitInterval } = require('../../src/data/ledger');
const { createTimerReadModel } = require('../../src/timer/read-model');

function addContext(document, projectId, legacyUnattributedMs = 0) {
  const contextId = 'job:' + projectId;
  document.contexts[contextId] = {
    contextId,
    kind: 'job',
    projectId: String(projectId),
    currentLabel: 'Job ' + projectId,
    shortLabel: String(projectId),
    aliases: [],
    createdAtMs: 1,
    lastSeenAtMs: 1,
    workspaceMembership: 'RECENT',
    archivedAtMs: null,
    legacyUnattributedMs
  };
  return contextId;
}

test('UT-B2-READ-001 selected Context stays view-only while shared Active Context is reported', () => {
  const atMs = Date.parse('2024-01-03T12:00:00Z');
  const document = createEmptyDocument({ nowMs: atMs, workdayZone: 'UTC' });
  const activeId = addContext(document, '101');
  const selectedId = addContext(document, '202', 30_000);
  document.timer.active = {
    contextId: activeId,
    sessionId: 'session-a',
    cycleId: 'cycle-a',
    startedAtMs: atMs - 60_000,
    lastVerifiedAtMs: atMs - 10_000,
    source: 'fixture',
    certainty: 'VERIFIED_SERVER',
    accrualOwnerToken: '1',
    startCause: 'new-context',
    safetyHold: null,
    provisionalSinceMs: null
  };
  document.timer.lastObservation = {
    type: 'CONTEXT_VERIFIED',
    contextId: activeId,
    observedAtMs: atMs - 10_000
  };

  const readModel = createTimerReadModel(() => document, { now: () => atMs });
  const value = readModel.snapshot({ selectedContextId: selectedId });
  assert.equal(value.timerState, 'ACTIVE');
  assert.equal(value.currentContextId, activeId);
  assert.equal(value.selectedContextId, selectedId);
  assert.equal(value.currentContextTodayMs, 60_000);
  assert.equal(value.selectedContextTodayMs, 0);
  assert.equal(value.selectedContextTotalMs, 30_000);
  assert.equal(value.availableActions.localPause, true);
});

test('UT-B2-READ-002 Safety Hold caps live totals and is distinct from provisional time', () => {
  const atMs = 200_000;
  const document = createEmptyDocument({ nowMs: 0, workdayZone: 'UTC' });
  const contextId = addContext(document, '303');
  document.timer.active = {
    contextId,
    sessionId: 'session-held',
    cycleId: 'cycle-held',
    startedAtMs: 100_000,
    lastVerifiedAtMs: 130_000,
    source: 'fixture',
    certainty: 'VERIFIED_SERVER',
    accrualOwnerToken: '1',
    startCause: 'resume',
    provisionalSinceMs: 140_000,
    safetyHold: { holdAtMs: 150_000, reason: 'verification-gap' }
  };

  const value = createTimerReadModel(() => document, { now: () => atMs }).snapshot();
  assert.equal(value.running.elapsedMs, 50_000);
  assert.equal(value.running.held, true);
  assert.equal(value.running.provisional, false);
  assert.equal(value.currentContextTotalMs, 50_000);
});

test('UT-B2-READ-003 Pending actions require valid continuity and a fresh positive observation', () => {
  const atMs = 500_000;
  const document = createEmptyDocument({ nowMs: 0, workdayZone: 'UTC' });
  const contextId = addContext(document, '404');
  document.ledger.push(...splitInterval({
    sessionId: 'old',
    cycleId: 'old-cycle',
    contextId,
    startAtMs: 1_000,
    endAtMs: 2_000,
    workdayZone: 'UTC',
    createdAtMs: 2_000
  }));
  document.timer.pending = {
    contextId,
    safeStartAnchorMs: 490_000,
    lastContinuityVerifiedAtMs: 495_000,
    continuityState: 'VALID'
  };
  document.timer.lastObservation = {
    type: 'CONTEXT_VERIFIED',
    contextId,
    observedAtMs: 495_000
  };

  const readModel = createTimerReadModel(() => document, {
    now: () => atMs,
    verificationGraceMs: 10_000
  });
  assert.equal(readModel.snapshot().availableActions.resume, true);
  document.timer.lastObservation.observedAtMs = 480_000;
  assert.equal(readModel.snapshot().availableActions.resume, false);
  assert.equal(readModel.snapshot().availableActions.startFresh, false);
});

test('UT-B2-READ-004 snapshot is a deep immutable copy of one validated revision', () => {
  const atMs = 600_000;
  const document = createEmptyDocument({ nowMs: atMs, workdayZone: 'UTC' });
  const contextId = addContext(document, '505');
  document.contexts[contextId].aliases.push('Original Alias');

  const value = createTimerReadModel(() => document, { now: () => atMs })
    .snapshot({ selectedContextId: contextId });

  assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(value.selectedContext), true);
  assert.equal(Object.isFrozen(value.selectedContext.aliases), true);
  assert.throws(() => value.selectedContext.aliases.push('Mutation'), TypeError);
  assert.throws(() => { value.availableActions.resume = true; }, TypeError);
  document.contexts[contextId].aliases.push('Later Source Change');
  assert.deepEqual(value.selectedContext.aliases, ['Original Alias']);
});

test('UT-B2-READ-005 contradictory timer state is rejected before presentation', () => {
  const atMs = 700_000;
  const document = createEmptyDocument({ nowMs: atMs, workdayZone: 'UTC' });
  const contextId = addContext(document, '606');
  document.timer.pending = {
    contextId,
    safeStartAnchorMs: atMs,
    lastContinuityVerifiedAtMs: atMs,
    continuityState: 'VALID'
  };
  document.timer.localPause = {
    contextId,
    cycleId: 'cycle-606',
    pausedAtMs: atMs
  };
  assert.throws(
    () => createTimerReadModel(() => document, { now: () => atMs }).snapshot(),
    /timer-state-mutual-exclusivity/
  );
});

test('UT-B2-READ-006 redacted authority views remain readable without exposing writer fencing credentials', () => {
  const atMs = 800_000;
  const document = createEmptyDocument({ nowMs: atMs, workdayZone: 'UTC' });
  const contextId = addContext(document, '707');
  document.timer.active = {
    contextId,
    sessionId: 'session-redacted',
    cycleId: 'cycle-redacted',
    startedAtMs: 790_000,
    lastVerifiedAtMs: 795_000,
    source: 'fixture',
    certainty: 'VERIFIED_SERVER',
    accrualOwnerToken: 'private-fence',
    startCause: 'new-context',
    safetyHold: null,
    provisionalSinceMs: null
  };
  document.revision = 1;
  document.commitId = 'data:1:fixture';
  document.commitFence = {
    ownerRuntimeId: 'private-owner',
    coordinationEpoch: 4,
    fencingToken: 9
  };
  const publicView = structuredClone(document);
  delete publicView.commitFence;
  delete publicView.commandReceipts;
  delete publicView.commandReceiptOrder;
  delete publicView.timer.active.accrualOwnerToken;
  publicView.timer.active.accrualOwnershipBound = true;
  publicView.authorityView = { schemaVersion: 1, redacted: true };

  const value = createTimerReadModel(() => publicView, { now: () => atMs }).snapshot();
  assert.equal(value.timerState, 'ACTIVE');
  assert.equal(value.running.elapsedMs, 10_000);
  assert.equal(JSON.stringify(value).includes('private-fence'), false);
  publicView.timer.active.accrualOwnershipBound = false;
  assert.throws(
    () => createTimerReadModel(() => publicView, { now: () => atMs }).snapshot(),
    /active-ownership-unproven/
  );
});
