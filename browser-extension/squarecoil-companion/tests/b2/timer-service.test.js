'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createEmptyDocument, validateDocument } = require('../../src/data/model');
const { splitInterval } = require('../../src/data/ledger');
const {
  TIMER_COMMANDS,
  createTimerCommandHandler
} = require('../../src/timer/service');

function trusted(overrides = {}) {
  return {
    requester: {
      runtimeId: 'runtime-owner',
      documentToken: 'document-owner',
      tabId: 1,
      ...(overrides.requester || {})
    },
    requesterDisposition: overrides.requesterDisposition || 'OWNER',
    coordinationEpoch: overrides.coordinationEpoch || 4,
    writer: {
      runtimeId: 'runtime-owner',
      documentToken: 'document-owner',
      tabId: 1,
      coordinationEpoch: overrides.coordinationEpoch || 4,
      fencingToken: 9,
      ...(overrides.writer || {})
    }
  };
}

function context(projectId, overrides = {}) {
  return {
    contextId: `job:${projectId}`,
    kind: 'job',
    projectId: String(projectId),
    label: `Job ${projectId}`,
    shortLabel: String(projectId),
    ...overrides
  };
}

function observation(type, atMs, seq, overrides = {}) {
  const value = {
    type,
    bridgeGeneration: 1,
    bridgeSeq: seq,
    observationId: `observation-${seq}`,
    observedAtMs: atMs,
    source: 'DOM',
    stateCertainty: ['STATE_UNKNOWN', 'STATE_CONFLICT'].includes(type)
      ? type === 'STATE_UNKNOWN' ? 'UNKNOWN' : 'CONFLICT'
      : 'OBSERVED_DOM',
    boundaryAtMs: null,
    boundaryCertainty: 'NONE',
    transitionCandidateId: null,
    verificationId: `verification-${seq}`,
    ...overrides
  };
  if (type.startsWith('CONTEXT_') && !['CONTEXT_LEFT'].includes(type) && !value.context) {
    value.context = context('101');
  }
  return value;
}

let commandSequence = 0;

function command(type, document, overrides = {}) {
  return {
    commandId: `command-${type}-${++commandSequence}`,
    type,
    expectedRevision: document.revision,
    ...overrides
  };
}

function harness(startAtMs = 10_000, options = {}) {
  let currentMs = startAtMs;
  let id = 0;
  const document = createEmptyDocument({ nowMs: 0, workdayZone: 'UTC' });
  const handler = createTimerCommandHandler({
    now: () => currentMs,
    makeId: prefix => `${prefix}-${++id}`,
    buildVersion: 'test-b2.2',
    ...options
  });
  return {
    document,
    handler,
    setNow(value) { currentMs = value; },
    run(type, overrides = {}, auth = trusted()) {
      return handler(document, command(type, document, overrides), auth);
    },
    observe(value, auth = trusted()) {
      return handler(document, command(TIMER_COMMANDS.ACCEPT_OBSERVATION, document, {
        observation: value
      }), auth);
    }
  };
}

function addRememberedContext(document, projectId, durationMs = 1000) {
  const value = context(projectId);
  document.contexts[value.contextId] = {
    contextId: value.contextId,
    kind: 'job',
    projectId: String(projectId),
    currentLabel: value.label,
    shortLabel: value.shortLabel,
    aliases: [],
    createdAtMs: 1,
    lastSeenAtMs: 1,
    workspaceMembership: 'RECENT',
    archivedAtMs: null,
    legacyUnattributedMs: 0
  };
  document.ledger.push(...splitInterval({
    sessionId: `historical-${projectId}`,
    cycleId: `historical-cycle-${projectId}`,
    contextId: value.contextId,
    startAtMs: 100,
    endAtMs: 100 + durationMs,
    workdayZone: 'UTC',
    createdAtMs: 100 + durationMs
  }));
  return value;
}

test('UT-B2-TIMER-001 zero-history positive Context auto-starts at the newest safe anchor', () => {
  const fixture = harness(10_100);
  const result = fixture.observe(observation('CONTEXT_DETECTED', 10_000, 0, {
    boundaryAtMs: 9_900,
    boundaryCertainty: 'DETECTED'
  }));

  assert.equal(result.state, 'ACTIVE');
  assert.equal(fixture.document.timer.active.contextId, 'job:101');
  assert.equal(fixture.document.timer.active.startedAtMs, 9_900);
  assert.equal(fixture.document.timer.active.lastVerifiedAtMs, 10_000);
  assert.equal(fixture.document.timer.active.startCause, 'new-context');
  assert.equal(fixture.document.timer.active.accrualOwnerToken, '9');
  assert.equal(fixture.document.checkpoint.runtimeInstanceId, 'runtime-owner');
  assert.deepEqual(fixture.document.checkpoint.ownershipEvidence, {
    ownerRuntimeId: 'runtime-owner',
    coordinationEpoch: 4,
    fencingToken: '9',
    disposition: 'OWNER'
  });
  assert.equal(validateDocument(fixture.document), true);
});

test('UT-B2-TIMER-002 owner and origin fields are bound to trusted authority, not command data', () => {
  const fixture = harness(20_000);
  fixture.observe(observation('CONTEXT_DETECTED', 19_000, 0));
  const sessionId = fixture.document.timer.active.sessionId;
  const observer = trusted({
    requester: { runtimeId: 'runtime-observer', documentToken: 'document-observer', tabId: 2 },
    requesterDisposition: 'OBSERVER_CONNECTED'
  });

  assert.throws(() => fixture.run(TIMER_COMMANDS.LOCAL_PAUSE, {
    contextId: 'job:101',
    expectedSessionId: sessionId,
    originatedAtMs: 19_500,
    originRuntimeId: 'spoofed-owner',
    writer: { runtimeId: 'spoofed-owner', fencingToken: 999 },
    fencingToken: 999
  }, observer), /timer-command-origin-mismatch/);

  const result = fixture.run(TIMER_COMMANDS.LOCAL_PAUSE, {
    contextId: 'job:101',
    expectedSessionId: sessionId,
    originatedAtMs: 19_500,
    originRuntimeId: 'runtime-observer',
    ownerRuntimeId: 'spoofed-owner',
    fencingToken: 999
  }, observer);
  assert.equal(result.originRuntimeId, 'runtime-observer');
  assert.equal(fixture.document.checkpoint.ownershipEvidence.ownerRuntimeId, 'runtime-owner');
  assert.equal(fixture.document.checkpoint.ownershipEvidence.fencingToken, '9');
  assert.equal(fixture.document.ledger[0].provenance.originRuntimeId, 'runtime-observer');
});

test('UT-B2-TIMER-003 remembered Context enters Pending; Resume reuses cycle and Start Fresh does not erase history', () => {
  const resumed = harness(30_100);
  addRememberedContext(resumed.document, '101');
  resumed.observe(observation('CONTEXT_DETECTED', 30_000, 0, {
    boundaryAtMs: 29_500,
    boundaryCertainty: 'DETECTED'
  }));
  assert.equal(resumed.document.timer.pending.safeStartAnchorMs, 29_500);
  assert.equal(resumed.document.timer.pending.cycleId, 'historical-cycle-101');
  resumed.run(TIMER_COMMANDS.RESUME, {
    contextId: 'job:101',
    originatedAtMs: 30_050,
    originRuntimeId: 'runtime-owner'
  });
  assert.equal(resumed.document.timer.active.startedAtMs, 29_500);
  assert.equal(resumed.document.timer.active.cycleId, 'historical-cycle-101');
  assert.equal(resumed.document.timer.active.startCause, 'resume');

  const fresh = harness(40_100);
  addRememberedContext(fresh.document, '101');
  fresh.observe(observation('CONTEXT_DETECTED', 40_000, 0));
  fresh.run(TIMER_COMMANDS.START_FRESH, {
    contextId: 'job:101',
    originatedAtMs: 40_050,
    originRuntimeId: 'runtime-owner'
  });
  assert.notEqual(fresh.document.timer.active.cycleId, 'historical-cycle-101');
  assert.equal(fresh.document.timer.active.startCause, 'start-fresh');
  assert.equal(fresh.document.ledger.length, 1);
});

test('UT-B2-TIMER-004 Local Pause finalizes exactly once and Local Resume excludes the pause gap', () => {
  const fixture = harness(50_000);
  fixture.observe(observation('CONTEXT_DETECTED', 48_000, 0));
  const firstSession = fixture.document.timer.active.sessionId;
  fixture.run(TIMER_COMMANDS.LOCAL_PAUSE, {
    contextId: 'job:101',
    expectedSessionId: firstSession,
    originatedAtMs: 49_000,
    originRuntimeId: 'runtime-owner'
  });
  assert.equal(fixture.document.ledger.reduce((sum, row) => sum + row.durationMs, 0), 1000);
  assert.equal(fixture.document.timer.localPause.pausedAtMs, 49_000);

  fixture.setNow(60_000);
  fixture.observe(observation('CONTEXT_VERIFIED', 59_900, 1));
  fixture.run(TIMER_COMMANDS.LOCAL_RESUME, {
    contextId: 'job:101',
    originatedAtMs: 60_000,
    originRuntimeId: 'runtime-owner'
  });
  assert.equal(fixture.document.timer.active.startedAtMs, 60_000);
  assert.equal(fixture.document.timer.active.cycleId, fixture.document.ledger[0].cycleId);
  assert.notEqual(fixture.document.timer.active.sessionId, firstSession);
});

test('UT-B2-TIMER-005 direct A to B switch is atomic and same-project metadata is not a boundary', () => {
  const fixture = harness(70_000);
  fixture.observe(observation('CONTEXT_DETECTED', 65_000, 0));
  const sessionId = fixture.document.timer.active.sessionId;
  fixture.observe(observation('CONTEXT_METADATA_UPDATED', 66_000, 1, {
    context: context('101', { label: 'Job 101 - Finishing', department: 'Finishing' })
  }));
  assert.equal(fixture.document.timer.active.sessionId, sessionId);
  assert.equal(fixture.document.ledger.length, 0);

  fixture.observe(observation('CONTEXT_CHANGED', 68_000, 2, {
    priorContextId: 'job:101',
    context: context('202'),
    boundaryAtMs: 67_500,
    boundaryCertainty: 'NATIVE_CONFIRMED',
    stateCertainty: 'NATIVE_CONFIRMED_POSTSTATE'
  }));
  assert.equal(fixture.document.ledger[0].endAtMs, 67_500);
  assert.equal(fixture.document.ledger[0].endReason, 'native-context-switch');
  assert.equal(fixture.document.timer.active.contextId, 'job:202');
  assert.equal(fixture.document.timer.active.startedAtMs, 67_500);
  assert.equal(fixture.document.timer.active.startCause, 'native-switch-in');
});

test('UT-B2-TIMER-006 distinct Context Left and later enter preserve an unattributed gap', () => {
  const fixture = harness(80_000);
  fixture.observe(observation('CONTEXT_DETECTED', 75_000, 0));
  fixture.observe(observation('CONTEXT_LEFT', 77_000, 1, {
    priorContextId: 'job:101',
    stateCertainty: 'NATIVE_CONFIRMED_POSTSTATE',
    boundaryAtMs: 77_000,
    boundaryCertainty: 'NATIVE_CONFIRMED'
  }));
  fixture.observe(observation('CONTEXT_DETECTED', 79_000, 2, {
    context: context('202'),
    boundaryAtMs: 79_000,
    boundaryCertainty: 'DETECTED'
  }));
  assert.equal(fixture.document.ledger[0].endAtMs, 77_000);
  assert.equal(fixture.document.ledger[0].endReason, 'native-context-left');
  assert.equal(fixture.document.timer.active.startedAtMs, 79_000);
});

test('UT-B2-TIMER-007 brief UNKNOWN recovers continuously; prolonged UNKNOWN holds at last verification', () => {
  const fixture = harness(100_000, { verificationGraceMs: 10_000 });
  fixture.observe(observation('CONTEXT_DETECTED', 80_000, 0));
  fixture.observe(observation('CONTEXT_VERIFIED', 90_000, 1));
  fixture.observe(observation('STATE_UNKNOWN', 95_000, 2));
  assert.equal(fixture.document.timer.active.safetyHold, null);
  assert.equal(fixture.document.timer.active.provisionalSinceMs, 95_000);
  fixture.observe(observation('CONTEXT_VERIFIED', 99_000, 3));
  assert.equal(fixture.document.timer.active.provisionalSinceMs, null);
  assert.equal(fixture.document.timer.active.lastVerifiedAtMs, 99_000);

  fixture.setNow(120_000);
  fixture.observe(observation('STATE_UNKNOWN', 115_000, 4));
  assert.equal(fixture.document.timer.active.safetyHold.holdAtMs, 99_000);
  assert.equal(fixture.document.timer.active.safetyHold.reason, 'verification-gap');
});

test('UT-B2-TIMER-008 same Context after long hold finalizes evidence and becomes Pending without backfill', () => {
  const fixture = harness(150_000, { verificationGraceMs: 10_000 });
  fixture.observe(observation('CONTEXT_DETECTED', 100_000, 0));
  fixture.observe(observation('CONTEXT_VERIFIED', 110_000, 1));
  fixture.observe(observation('STATE_CONFLICT', 130_000, 2));
  fixture.observe(observation('CONTEXT_VERIFIED', 140_000, 3));
  assert.equal(fixture.document.timer.active, null);
  assert.equal(fixture.document.timer.pending.contextId, 'job:101');
  assert.equal(fixture.document.timer.pending.safeStartAnchorMs, 140_000);
  assert.equal(fixture.document.ledger.reduce((sum, row) => sum + row.durationMs, 0), 10_000);
  assert.equal(fixture.document.ledger[0].endReason, 'conservative-end');
});

test('UT-B2-TIMER-009 strong action-2 hold is confirmed, specifically disproved, or conservatively re-entered', () => {
  const makeStrongUnknown = (seq, atMs, candidateId) => observation('STATE_UNKNOWN', atMs, seq, {
    strongUnconfirmedTransition: {
      candidateId,
      nativeAction: 2,
      boundaryAtMs: atMs - 100,
      strength: 'STRONG_UNCONFIRMED',
      resolution: 'PENDING'
    }
  });

  const confirmed = harness(210_000);
  confirmed.observe(observation('CONTEXT_DETECTED', 200_000, 0));
  confirmed.observe(makeStrongUnknown(1, 205_000, 'candidate-confirm'));
  confirmed.observe(observation('CLOCKED_OUT', 206_000, 2, {
    priorContextId: 'job:101',
    stateCertainty: 'NATIVE_CONFIRMED_POSTSTATE',
    boundaryAtMs: 204_900,
    boundaryCertainty: 'NATIVE_CONFIRMED',
    transitionCandidateId: 'candidate-confirm'
  }));
  assert.equal(confirmed.document.timer.active, null);
  assert.equal(confirmed.document.ledger[0].endAtMs, 204_900);
  assert.equal(confirmed.document.ledger[0].endReason, 'native-clock-out');

  const disproved = harness(310_000);
  disproved.observe(observation('CONTEXT_DETECTED', 300_000, 0));
  disproved.observe(makeStrongUnknown(1, 305_000, 'candidate-disprove'));
  disproved.observe(observation('CONTEXT_VERIFIED', 306_000, 2, {
    candidateResolution: {
      candidateId: 'candidate-disprove',
      nativeAction: 2,
      resolution: 'SPECIFICALLY_DISPROVED'
    }
  }));
  assert.equal(disproved.document.timer.active.safetyHold, null);
  assert.equal(disproved.document.timer.active.lastVerifiedAtMs, 306_000);
  assert.equal(disproved.document.ledger.length, 0);

  const reentered = harness(410_000);
  reentered.observe(observation('CONTEXT_DETECTED', 400_000, 0));
  reentered.observe(makeStrongUnknown(1, 405_000, 'candidate-reenter'));
  reentered.observe(observation('CONTEXT_VERIFIED', 406_000, 2, {
    candidateResolution: {
      candidateId: 'candidate-reenter',
      nativeAction: 2,
      resolution: 'POSTSTATE_CONTEXT_WITHOUT_DISPROOF'
    }
  }));
  assert.equal(reentered.document.timer.active, null);
  assert.equal(reentered.document.timer.pending.contextId, 'job:101');
  assert.equal(reentered.document.ledger[0].endAtMs, 404_900);
});

test('UT-B2-TIMER-010 Companion Disable caps at an earlier hold and never emits a SquareCoil mutation', () => {
  const fixture = harness(500_000, { verificationGraceMs: 10_000 });
  fixture.observe(observation('CONTEXT_DETECTED', 470_000, 0));
  fixture.observe(observation('CONTEXT_VERIFIED', 480_000, 1));
  fixture.observe(observation('STATE_UNKNOWN', 495_000, 2));
  const sessionId = fixture.document.timer.active.sessionId;
  const result = fixture.run(TIMER_COMMANDS.COMPANION_DISABLE, {
    contextId: 'job:101',
    expectedSessionId: sessionId,
    originatedAtMs: 499_000,
    originRuntimeId: 'runtime-owner',
    squareCoilAction: 2
  });
  assert.equal(result.state, 'IDLE');
  assert.equal(fixture.document.ledger.at(-1).endAtMs, 480_000);
  assert.equal(fixture.document.ledger.at(-1).endReason, 'companion-disabled');
  assert.equal(fixture.document.checkpoint.terminationDisposition, 'USER_DISABLED_CLEAN');
});

test('UT-B2-TIMER-011 stale Bridge sequence/time and stale terminal Context are rejected', () => {
  const fixture = harness(600_000);
  fixture.observe(observation('CONTEXT_DETECTED', 590_000, 4));
  assert.throws(
    () => fixture.observe(observation('CONTEXT_VERIFIED', 591_000, 4)),
    /timer-observation-stale-sequence/
  );
  assert.throws(
    () => fixture.observe(observation('CONTEXT_VERIFIED', 589_000, 5)),
    /timer-observation-stale-time/
  );
  assert.throws(() => fixture.observe(observation('CLOCKED_OUT', 592_000, 6, {
    priorContextId: 'job:999',
    stateCertainty: 'NATIVE_CONFIRMED_POSTSTATE',
    boundaryAtMs: 592_000,
    boundaryCertainty: 'NATIVE_CONFIRMED'
  })), /timer-terminal-observation-stale-context/);
});

test('UT-B2-TIMER-012 Pending continuity break refreshes its anchor before Resume', () => {
  const fixture = harness(700_000, { verificationGraceMs: 10_000 });
  addRememberedContext(fixture.document, '101');
  fixture.observe(observation('CONTEXT_DETECTED', 650_000, 0, {
    boundaryAtMs: 649_000,
    boundaryCertainty: 'DETECTED'
  }));
  fixture.observe(observation('STATE_UNKNOWN', 670_000, 1));
  assert.equal(fixture.document.timer.pending.continuityState, 'BROKEN');
  fixture.observe(observation('CONTEXT_VERIFIED', 690_000, 2));
  assert.equal(fixture.document.timer.pending.safeStartAnchorMs, 690_000);
  fixture.run(TIMER_COMMANDS.RESUME, {
    contextId: 'job:101',
    originatedAtMs: 695_000,
    originRuntimeId: 'runtime-owner'
  });
  assert.equal(fixture.document.timer.active.startedAtMs, 690_000);
});

test('UT-B2-TIMER-013 user command timestamps reject impossible future and pre-state history', () => {
  const fixture = harness(800_000, { clockSkewMs: 5_000 });
  fixture.observe(observation('CONTEXT_DETECTED', 790_000, 0));
  const sessionId = fixture.document.timer.active.sessionId;
  assert.throws(() => fixture.run(TIMER_COMMANDS.LOCAL_PAUSE, {
    contextId: 'job:101',
    expectedSessionId: sessionId,
    originatedAtMs: 805_001,
    originRuntimeId: 'runtime-owner'
  }), /timer-command-time-in-future/);
  assert.throws(() => fixture.run(TIMER_COMMANDS.LOCAL_PAUSE, {
    contextId: 'job:101',
    expectedSessionId: sessionId,
    originatedAtMs: 789_999,
    originRuntimeId: 'runtime-owner'
  }), /timer-command-time-before-state/);
});

test('UT-B2-TIMER-014 controlled teardown creates no boundary; fresh ownership reconciliation keeps the session', () => {
  const fixture = harness(900_000);
  fixture.observe(observation('CONTEXT_DETECTED', 890_000, 0));
  const sessionId = fixture.document.timer.active.sessionId;
  const cycleId = fixture.document.timer.active.cycleId;
  fixture.run(TIMER_COMMANDS.CONTROLLED_TEARDOWN, {
    contextId: 'job:101',
    expectedSessionId: sessionId
  });
  assert.equal(fixture.document.ledger.length, 0);
  assert.equal(fixture.document.timer.active.sessionId, sessionId);
  assert.equal(fixture.document.checkpoint.terminationDisposition, 'CONTROLLED_RELOAD');

  fixture.setNow(905_000);
  const nextOwner = trusted({
    requester: { runtimeId: 'runtime-next', documentToken: 'document-next', tabId: 2 },
    writer: {
      runtimeId: 'runtime-next',
      documentToken: 'document-next',
      tabId: 2,
      coordinationEpoch: 5,
      fencingToken: 10
    },
    coordinationEpoch: 5
  });
  const result = fixture.run(TIMER_COMMANDS.RECONCILE_OWNERSHIP, {
    observation: observation('CONTEXT_VERIFIED', 904_000, 1, {
      bridgeGeneration: 1
    })
  }, nextOwner);
  assert.equal(result.ownershipChanged, true);
  assert.equal(fixture.document.timer.active.sessionId, sessionId);
  assert.equal(fixture.document.timer.active.cycleId, cycleId);
  assert.equal(fixture.document.timer.active.accrualOwnerToken, '10');
  assert.equal(fixture.document.ledger.length, 0);
});

test('UT-B2-TIMER-015 unexpected interruption preserves only verified time and returns same Context as Pending', () => {
  const fixture = harness(1_000_000);
  fixture.observe(observation('CONTEXT_DETECTED', 950_000, 0));
  fixture.observe(observation('CONTEXT_VERIFIED', 960_000, 1));
  fixture.run(TIMER_COMMANDS.RECOVER_INTERRUPTION, {
    observation: observation('CONTEXT_VERIFIED', 999_000, 2)
  });
  assert.equal(fixture.document.timer.active, null);
  assert.equal(fixture.document.timer.pending.contextId, 'job:101');
  assert.equal(fixture.document.timer.pending.safeStartAnchorMs, 999_000);
  assert.equal(fixture.document.ledger.reduce((sum, row) => sum + row.durationMs, 0), 10_000);
  assert.equal(fixture.document.ledger[0].certainty, 'VERIFIED_RECOVERY');
  assert.equal(fixture.document.ledger[0].endReason, 'conservative-end');
});
