'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  assertLocalDate,
  assertWorkdayZone,
  createEmptyDocument,
  validateDocument,
  validateSegment
} = require('../../src/data/model');
const { splitInterval } = require('../../src/data/ledger');

function addContext(document, contextId = 'job:123456') {
  document.contexts[contextId] = {
    contextId,
    kind: 'job',
    projectId: contextId.slice(4),
    currentLabel: 'Example Job',
    shortLabel: contextId.slice(4),
    aliases: [],
    createdAtMs: 1,
    lastSeenAtMs: 1,
    workspaceMembership: 'RECENT',
    archivedAtMs: null,
    legacyUnattributedMs: 0
  };
  return contextId;
}

test('UT-B2-MODEL-001 local dates and Workday Zones require real calendar/IANA values', () => {
  assert.equal(assertLocalDate('2024-02-29'), '2024-02-29');
  assert.equal(assertWorkdayZone('America/New_York'), 'America/New_York');
  for (const value of ['2026-2-01', '2026-02-30', '0000-01-01']) {
    assert.throws(() => assertLocalDate(value), /local-date-invalid/);
  }
  assert.throws(() => assertWorkdayZone('-05:00'), /workday-zone-offset-only/);
  assert.throws(() => assertWorkdayZone('Not\/A_Zone'), /workday-zone-invalid/);
});

test('UT-B2-MODEL-002 Active, Pending, and Local Pause are mutually exclusive', () => {
  const document = createEmptyDocument({ nowMs: 1000, workdayZone: 'UTC' });
  const contextId = addContext(document);
  document.timer.active = {
    contextId,
    sessionId: 'session-1',
    cycleId: 'cycle-1',
    startedAtMs: 100,
    lastVerifiedAtMs: 200,
    accrualOwnerToken: 'fence-1'
  };
  document.timer.pending = {
    contextId,
    safeStartAnchorMs: 200,
    lastContinuityVerifiedAtMs: 200,
    continuityState: 'VALID'
  };
  assert.throws(() => validateDocument(document), /timer-state-mutual-exclusivity/);
});

test('UT-B2-MODEL-003 segment localDate must match one Workday Zone day', () => {
  const base = {
    segmentId: 'segment-1',
    sessionId: 'session-1',
    cycleId: 'cycle-1',
    contextId: 'job:123456',
    startAtMs: Date.parse('2026-01-01T12:00:00Z'),
    endAtMs: Date.parse('2026-01-01T13:00:00Z'),
    durationMs: 60 * 60 * 1000,
    localDate: '2026-01-02',
    workdayZone: 'UTC',
    createdAtMs: Date.parse('2026-01-01T13:00:00Z')
  };
  assert.throws(() => validateSegment(base), /segment-local-date-mismatch/);
  const crossMidnight = {
    ...base,
    localDate: '2026-01-01',
    startAtMs: Date.parse('2026-01-01T23:30:00Z'),
    endAtMs: Date.parse('2026-01-02T00:30:00Z'),
    durationMs: 60 * 60 * 1000
  };
  assert.throws(() => validateSegment(crossMidnight), /segment-crosses-workday/);
});

test('UT-B2-MODEL-004 duplicate material intervals fail even when IDs differ', () => {
  const document = createEmptyDocument({ nowMs: 3000, workdayZone: 'UTC' });
  const contextId = addContext(document);
  const segment = splitInterval({
    sessionId: 'session-1',
    cycleId: 'cycle-1',
    contextId,
    startAtMs: 1000,
    endAtMs: 2000,
    workdayZone: 'UTC',
    createdAtMs: 2000
  })[0];
  document.ledger = [segment, { ...segment, segmentId: 'different-id' }];
  assert.throws(() => validateDocument(document), /duplicate-segment-interval/);
});

test('UT-B2-MODEL-005 committed revisions require an authoritative commit fence', () => {
  const document = createEmptyDocument({ nowMs: 1000, workdayZone: 'UTC' });
  document.revision = 1;
  document.commitId = 'commit-1';
  assert.throws(() => validateDocument(document), /data-commit-fence-missing/);
  document.commitFence = {
    ownerRuntimeId: 'runtime-1',
    coordinationEpoch: 2,
    fencingToken: 3
  };
  assert.equal(validateDocument(document), true);

  const initial = createEmptyDocument({ nowMs: 1000, workdayZone: 'UTC' });
  initial.commitFence = document.commitFence;
  assert.throws(() => validateDocument(initial), /data-initial-commit-fence-invalid/);
});

test('UT-B2-MODEL-006 command receipts are bounded, complete, and structurally validated', () => {
  const document = createEmptyDocument({ nowMs: 1000, workdayZone: 'UTC' });
  document.revision = 1;
  document.commitId = 'commit-1';
  document.commitFence = {
    ownerRuntimeId: 'runtime-1',
    coordinationEpoch: 1,
    fencingToken: 1
  };
  document.commandReceipts = {
    'command-1': {
      commandId: 'command-1',
      requestFingerprint: '{"commandId":"command-1"}',
      revision: 1,
      commitId: 'commit-1',
      committedAtMs: 1000,
      result: 'ok'
    }
  };
  document.commandReceiptOrder = ['command-1'];
  assert.equal(validateDocument(document), true);
  document.commandReceiptOrder.push('command-1');
  assert.throws(() => validateDocument(document), /command-receipt-order-duplicate/);
  document.commandReceiptOrder = ['missing-command'];
  assert.throws(() => validateDocument(document), /command-receipt-order-orphan/);
  document.commandReceiptOrder = [];
  assert.throws(() => validateDocument(document), /command-receipt-index-mismatch/);
  document.commandReceiptOrder = ['command-1'];
  document.commandReceipts['command-1'].revision = 2;
  assert.throws(() => validateDocument(document), /command-receipt-revision-invalid/);
});

test('UT-B2-MODEL-009 commit fence epoch and token must be positive safe integers', () => {
  const document = createEmptyDocument({ nowMs: 1000, workdayZone: 'UTC' });
  document.revision = 1;
  document.commitId = 'commit-1';
  document.commitFence = {
    ownerRuntimeId: 'runtime-1',
    coordinationEpoch: 1,
    fencingToken: 'not-a-token'
  };
  assert.throws(() => validateDocument(document), /data-commit-fence-token-invalid/);
  document.commitFence.fencingToken = 1;
  document.commitFence.coordinationEpoch = 0;
  assert.throws(() => validateDocument(document), /data-commit-fence-epoch-invalid/);
});

test('UT-B2-MODEL-007 default UTC is marked fallback while explicit UTC is configured', () => {
  const fallback = createEmptyDocument({ nowMs: 1000 });
  assert.deepEqual(fallback.workdayZoneDisposition, {
    source: 'UTC_FALLBACK',
    fallback: true,
    diagnostic: 'workday-zone-unavailable'
  });
  const configured = createEmptyDocument({ nowMs: 1000, workdayZone: 'UTC' });
  assert.deepEqual(configured.workdayZoneDisposition, {
    source: 'CONFIGURED',
    fallback: false,
    diagnostic: null
  });
});

test('UT-B2-MODEL-008 explicit invalid timestamps fail instead of becoming wall-clock time', () => {
  assert.throws(
    () => createEmptyDocument({ nowMs: -1, workdayZone: 'UTC' }),
    /data-initial-time-invalid/
  );
  assert.throws(
    () => splitInterval({
      sessionId: 'session-invalid-created',
      cycleId: 'cycle-invalid-created',
      contextId: 'job:123456',
      startAtMs: 1000,
      endAtMs: 2000,
      workdayZone: 'UTC',
      createdAtMs: -1
    }),
    /interval-created-at-invalid/
  );
});

test('UT-B2-MODEL-010 malformed migration metadata and completion markers fail closed', () => {
  const document = createEmptyDocument({ nowMs: 1000, workdayZone: 'UTC' });
  document.migration.schemaVersion = 'corrupt';
  assert.throws(() => validateDocument(document), /migration-schema-invalid/);

  document.migration.schemaVersion = 1;
  document.migration.completedSources['squarecoil-v07-localstorage-v1'] = {
    completionState: 'COMPLETE'
  };
  assert.throws(() => validateDocument(document), /migration-marker-fields-invalid/);
});

test('UT-B2-MODEL-011 a live Active Session cannot also exist in finalized Ledger history', () => {
  const document = createEmptyDocument({ nowMs: 3000, workdayZone: 'UTC' });
  const contextId = addContext(document);
  document.timer.active = {
    contextId,
    sessionId: 'session-live-and-finalized',
    cycleId: 'cycle-live-and-finalized',
    startedAtMs: 1000,
    lastVerifiedAtMs: 2000,
    accrualOwnerToken: 'fence-live-and-finalized'
  };
  document.ledger = splitInterval({
    sessionId: 'session-live-and-finalized',
    cycleId: 'cycle-live-and-finalized',
    contextId,
    startAtMs: 1000,
    endAtMs: 2000,
    workdayZone: 'UTC',
    createdAtMs: 2000
  });

  assert.throws(() => validateDocument(document), /active-session-already-finalized/);
});
