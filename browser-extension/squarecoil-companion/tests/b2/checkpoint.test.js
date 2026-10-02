'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createRecoveryCheckpoint,
  validateRecoveryCheckpoint,
  isCleanTermination,
  markCheckpointClean,
  checkpointToRecoveryEvidence,
  recoverVerifiedSegments
} = require('../../src/data/checkpoint');

const HOUR_MS = 60 * 60 * 1000;
const START_MS = Date.parse('2026-03-14T23:30:00.000Z');

function checkpointInput(overrides = {}) {
  return {
    runtimeInstanceId: 'runtime-checkpoint-1',
    contextId: 'job:123456',
    sessionId: 'session-checkpoint-1',
    cycleId: 'cycle-checkpoint-1',
    startedAtMs: START_MS,
    lastVerifiedAtMs: START_MS + HOUR_MS,
    ownershipEvidence: {
      ownerRuntimeId: 'runtime-checkpoint-1',
      coordinationEpoch: 4,
      fencingToken: 'fence-4',
      disposition: 'OWNER'
    },
    checkpointedAtMs: START_MS + (3 * HOUR_MS),
    terminationDisposition: 'UNCLEAN_PAGE_LOSS',
    buildVersion: '0.8.0-b2',
    source: 'companion',
    ...overrides
  };
}

test('UT-B2-CP-001 recovery checkpoint is deterministic, validated, and does not mutate input', () => {
  const input = checkpointInput();
  const before = structuredClone(input);
  const checkpoint = createRecoveryCheckpoint(input);

  assert.equal(validateRecoveryCheckpoint(checkpoint), true);
  assert.deepEqual(input, before);
  assert.deepEqual(checkpoint.ownershipEvidence, input.ownershipEvidence);
  assert.equal(isCleanTermination(checkpoint), false);
});

test('UT-B2-CP-002 only the verified checkpoint interval is recoverable; the later gap remains unknown', () => {
  const checkpoint = createRecoveryCheckpoint(checkpointInput());
  const evidence = checkpointToRecoveryEvidence(checkpoint);
  const segments = recoverVerifiedSegments(checkpoint, { workdayZone: 'UTC' });

  assert.equal(evidence.live, false);
  assert.deepEqual(evidence.verifiedInterval, {
    startAtMs: START_MS,
    endAtMs: START_MS + HOUR_MS,
    durationMs: HOUR_MS
  });
  assert.deepEqual(evidence.unknownGap, {
    startAtMs: START_MS + HOUR_MS,
    endAtMs: START_MS + (3 * HOUR_MS),
    durationMs: 2 * HOUR_MS
  });
  assert.equal(segments.reduce((sum, row) => sum + row.durationMs, 0), HOUR_MS);
  assert.equal(segments.at(-1).endAtMs, START_MS + HOUR_MS);
  assert.equal(segments.some(row => row.endAtMs > checkpoint.lastVerifiedAtMs), false);
});

test('UT-B2-CP-003 verified recovery uses Ledger midnight splitting and retains one Session identity', () => {
  const checkpoint = createRecoveryCheckpoint(checkpointInput());
  const segments = recoverVerifiedSegments(checkpoint, { workdayZone: 'UTC' });

  assert.equal(segments.length, 2);
  assert.deepEqual(segments.map(row => row.localDate), ['2026-03-14', '2026-03-15']);
  assert.equal(new Set(segments.map(row => row.sessionId)).size, 1);
  assert.equal(segments.reduce((sum, row) => sum + row.durationMs, 0), HOUR_MS);
});

test('UT-B2-CP-004 clean teardown checkpoint is retained as evidence but cannot recover elapsed time', () => {
  const original = createRecoveryCheckpoint(checkpointInput());
  const clean = markCheckpointClean(original, {
    checkpointedAtMs: START_MS + (4 * HOUR_MS)
  });

  assert.equal(isCleanTermination(clean), true);
  assert.equal(isCleanTermination(original), false);
  assert.equal(recoverVerifiedSegments(clean, { workdayZone: 'UTC' }).length, 0);
  assert.equal(checkpointToRecoveryEvidence(clean).live, false);
});

test('UT-B2-CP-005 checkpoint rejects incomplete or impossible timing evidence', () => {
  assert.throws(
    () => createRecoveryCheckpoint(checkpointInput({ lastVerifiedAtMs: null })),
    /checkpoint-verification-invalid/
  );
  assert.throws(
    () => createRecoveryCheckpoint(checkpointInput({ lastVerifiedAtMs: START_MS - 1 })),
    /checkpoint-verification-before-start/
  );
  assert.throws(
    () => createRecoveryCheckpoint(checkpointInput({ checkpointedAtMs: START_MS + 1 })),
    /checkpoint-before-verification/
  );
});

test('UT-B2-CP-006 context-free clean checkpoint carries lifecycle evidence without a live claim', () => {
  const checkpoint = createRecoveryCheckpoint({
    runtimeInstanceId: 'runtime-clean',
    checkpointedAtMs: START_MS,
    terminationDisposition: 'TEARDOWN_COMPLETE',
    buildVersion: '0.8.0-b2'
  });
  const evidence = checkpointToRecoveryEvidence(checkpoint);

  assert.equal(evidence.live, false);
  assert.equal(evidence.contextId, null);
  assert.equal(evidence.verifiedInterval, null);
  assert.equal(recoverVerifiedSegments(checkpoint, { workdayZone: 'UTC' }).length, 0);
});

test('UT-B2-CP-007 clean dispositions use an exact allowlist', () => {
  assert.throws(
    () => createRecoveryCheckpoint(checkpointInput({ terminationDisposition: 'CLEAN_BUT_FAILED' })),
    /checkpoint-clean-disposition-unsupported/
  );
  const checkpoint = createRecoveryCheckpoint(checkpointInput());
  assert.throws(
    () => markCheckpointClean(checkpoint, { terminationDisposition: 'UNCLEAN_PAGE_LOSS' }),
    /checkpoint-clean-disposition-unsupported/
  );
});

test('UT-B2-CP-008 ownership evidence must prove a complete eligible owner', () => {
  assert.throws(
    () => createRecoveryCheckpoint(checkpointInput({
      ownershipEvidence: { disposition: 'OWNER', ownerRuntimeId: 'runtime-checkpoint-1' }
    })),
    /checkpoint-owner-evidence-incomplete/
  );
  assert.throws(
    () => createRecoveryCheckpoint(checkpointInput({
      ownershipEvidence: {
        disposition: 'OBSERVER_CONNECTED',
        ownerRuntimeId: 'different-owner',
        coordinationEpoch: 4,
        fencingToken: 'fence-4'
      }
    })),
    /checkpoint-timing-owner-unproven/
  );
  assert.throws(
    () => createRecoveryCheckpoint(checkpointInput({
      ownershipEvidence: { disposition: 'UNAVAILABLE_LEGACY' },
      source: 'companion'
    })),
    /checkpoint-legacy-ownership-source-invalid/
  );
  assert.throws(
    () => createRecoveryCheckpoint({
      runtimeInstanceId: 'runtime-observer',
      checkpointedAtMs: START_MS,
      terminationDisposition: 'TEARDOWN_COMPLETE',
      buildVersion: '0.8.0-b2',
      ownershipEvidence: { disposition: 'OBSERVER_CONNECTED' }
    }),
    /checkpoint-observer-evidence-incomplete/
  );
});
