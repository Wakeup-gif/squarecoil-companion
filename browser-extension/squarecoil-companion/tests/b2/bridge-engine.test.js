'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseServerSnapshot,
  parseDomSnapshot
} = require('../../src/squarecoil/bridge-parser');
const {
  NATIVE_ACTIONS,
  EVENT_TYPES,
  BOUNDARY_CERTAINTY,
  CANDIDATE_RESOLUTIONS,
  createBridgeEngineState,
  recordNativeCompletion,
  beginVerification,
  acceptVerification,
  teardownBridge,
  reinitializeBridge
} = require('../../src/squarecoil/bridge-engine');

function jobEvidence(projectId, label, observedAtMs, department) {
  return parseServerSnapshot(`
    <span id="clockin-remaining-time">
      <a href="/project.php?id=${projectId}">${label}</a>
    </span>
  `, { observedAtMs, department });
}

function serverNoContext(observedAtMs) {
  return parseServerSnapshot('<span id="clockin-remaining-time"></span>', { observedAtMs });
}

function verify(state, evidence, requestStartedAtMs, options = {}) {
  const started = beginVerification(state, {
    bridgeGeneration: state.bridgeGeneration,
    requestStartedAtMs,
    ...(Object.prototype.hasOwnProperty.call(options, 'candidateId')
      ? { candidateId: options.candidateId }
      : {})
  });
  assert.equal(started.accepted, true);
  return acceptVerification(started.state, {
    request: started.request,
    evidence,
    ...(options.candidateResolution ? { candidateResolution: options.candidateResolution } : {})
  });
}

function confirmJob(state, projectId, label, atMs, department) {
  return verify(state, jobEvidence(projectId, label, atMs, department), atMs - 1, {
    candidateId: null
  });
}

function nativeCandidate(state, nativeAction, completedAtMs, options = {}) {
  return recordNativeCompletion(state, {
    bridgeGeneration: state.bridgeGeneration,
    nativeAction,
    completedAtMs,
    sourceRuntimeId: options.sourceRuntimeId || 'runtime-owner',
    requestProjectId: options.requestProjectId,
    requestDepartment: options.requestDepartment,
    completionKey: options.completionKey
  });
}

test('UT-B2-BRIDGE-010 action 3 A-to-B emits one native-confirmed Context change', () => {
  const initial = confirmJob(createBridgeEngineState(), '260701', '260701 - Design', 100);
  const candidate = nativeCandidate(initial.state, NATIVE_ACTIONS.CHANGE_CONTEXT, 200, {
    requestProjectId: '260702'
  });
  const changed = verify(
    candidate.state,
    jobEvidence('260702', '260702 - Fabrication', 202),
    201
  );

  assert.equal(changed.events.length, 1);
  assert.equal(changed.events[0].type, EVENT_TYPES.CONTEXT_CHANGED);
  assert.equal(changed.events[0].priorContextId, 'job:260701');
  assert.equal(changed.events[0].context.contextId, 'job:260702');
  assert.equal(changed.events[0].boundaryAtMs, 200);
  assert.equal(changed.events[0].boundaryCertainty, BOUNDARY_CERTAINTY.NATIVE_CONFIRMED);
  assert.equal(changed.state.candidates.length, 0);
});

test('UT-B2-BRIDGE-011 same-project label or department change has no timer boundary', () => {
  const initial = confirmJob(
    createBridgeEngineState(),
    '260701',
    '260701 - Design',
    300,
    'Design'
  );
  const candidate = nativeCandidate(initial.state, NATIVE_ACTIONS.CHANGE_CONTEXT, 310, {
    requestProjectId: '260701',
    requestDepartment: 'Engineering'
  });
  const updated = verify(
    candidate.state,
    jobEvidence('260701', '260701 - Engineering', 312, 'Engineering'),
    311
  );

  assert.equal(updated.events[0].type, EVENT_TYPES.CONTEXT_METADATA_UPDATED);
  assert.equal(updated.events[0].context.contextId, 'job:260701');
  assert.equal(updated.events[0].boundaryAtMs, null);
  assert.equal(updated.events[0].boundaryCertainty, BOUNDARY_CERTAINTY.NONE);
  assert.equal(updated.events[0].metadataChanged, true);
});

test('UT-B2-BRIDGE-012 distinct action episodes are queued and preserve separate boundaries', () => {
  const initial = confirmJob(createBridgeEngineState(), '260701', '260701 - Design', 400);
  const leaveCandidate = nativeCandidate(initial.state, NATIVE_ACTIONS.LEAVE_CONTEXT, 410);
  const enterCandidate = nativeCandidate(leaveCandidate.state, NATIVE_ACTIONS.CHANGE_CONTEXT, 430, {
    requestProjectId: '260702'
  });
  assert.equal(enterCandidate.state.candidates.length, 2);

  const reconciled = verify(
    enterCandidate.state,
    jobEvidence('260702', '260702 - Fabrication', 432),
    431
  );

  assert.equal(reconciled.events.length, 2);
  assert.equal(reconciled.events[0].type, EVENT_TYPES.CONTEXT_LEFT);
  assert.equal(reconciled.events[0].boundaryAtMs, 410);
  assert.equal(reconciled.events[1].type, EVENT_TYPES.CONTEXT_DETECTED);
  assert.equal(reconciled.events[1].boundaryAtMs, 430);
  assert.equal(reconciled.events[1].bridgeSeq, reconciled.events[0].bridgeSeq + 1);
  assert.equal(reconciled.state.candidates.length, 0);
  assert.notEqual(
    reconciled.events[0].transitionCandidateId,
    reconciled.events[1].transitionCandidateId
  );
});

test('UT-B2-BRIDGE-013 one native completion key coalesces without merging distinct episodes', () => {
  const initial = createBridgeEngineState();
  const first = nativeCandidate(initial, NATIVE_ACTIONS.CHANGE_CONTEXT, 500, {
    completionKey: 'ajax-request-1'
  });
  const duplicate = nativeCandidate(first.state, NATIVE_ACTIONS.CHANGE_CONTEXT, 500, {
    completionKey: 'ajax-request-1'
  });
  const distinct = nativeCandidate(duplicate.state, NATIVE_ACTIONS.CHANGE_CONTEXT, 501, {
    completionKey: 'ajax-request-2'
  });

  assert.equal(duplicate.reason, 'NATIVE_COMPLETION_COALESCED');
  assert.equal(duplicate.changed, false);
  assert.equal(duplicate.state.candidates.length, 1);
  assert.equal(distinct.state.candidates.length, 2);
});

test('UT-B2-BRIDGE-014 verification is single-flight and requests predating mutation are rejected', () => {
  const initial = confirmJob(createBridgeEngineState(), '260701', '260701 - Design', 600);
  const first = beginVerification(initial.state, {
    bridgeGeneration: initial.state.bridgeGeneration,
    requestStartedAtMs: 601,
    candidateId: null,
    trigger: 'heartbeat'
  });
  const coalesced = beginVerification(first.state, {
    bridgeGeneration: first.state.bridgeGeneration,
    requestStartedAtMs: 602,
    candidateId: null,
    trigger: 'focus'
  });
  const mutation = nativeCandidate(coalesced.state, NATIVE_ACTIONS.CHANGE_CONTEXT, 603, {
    requestProjectId: '260702'
  });
  const stale = acceptVerification(mutation.state, {
    request: first.request,
    evidence: jobEvidence('260701', '260701 - Design', 604)
  });

  assert.equal(coalesced.reason, 'VERIFICATION_COALESCED');
  assert.equal(coalesced.request.requestId, first.request.requestId);
  assert.equal(coalesced.state.requestSequence, first.state.requestSequence);
  assert.equal(stale.accepted, false);
  assert.equal(stale.reason, 'STALE_REQUEST_STATE_SEQUENCE');
  assert.equal(stale.needsVerification, true);

  const fresh = verify(stale.state, jobEvidence('260702', '260702 - Fabrication', 606), 605);
  assert.equal(fresh.events[0].type, EVENT_TYPES.CONTEXT_CHANGED);
});

test('UT-B2-BRIDGE-015 expired candidates cannot donate a native boundary', () => {
  const initial = confirmJob(
    createBridgeEngineState({ candidateWindowMs: 10 }),
    '260701',
    '260701 - Design',
    700
  );
  const candidate = nativeCandidate(initial.state, NATIVE_ACTIONS.CHANGE_CONTEXT, 710, {
    requestProjectId: '260702'
  });
  const changed = verify(
    candidate.state,
    jobEvidence('260702', '260702 - Fabrication', 721),
    720
  );

  assert.equal(changed.events[0].type, EVENT_TYPES.CONTEXT_CHANGED);
  assert.equal(changed.events[0].boundaryAtMs, 721);
  assert.equal(changed.events[0].boundaryCertainty, BOUNDARY_CERTAINTY.DETECTED);
  assert.equal(changed.events[0].transitionCandidateId, null);
});

test('UT-B2-BRIDGE-016 passive negatives require bounded, separated confirmation', () => {
  const initial = confirmJob(
    createBridgeEngineState({
      negativeConfirmationMinMs: 100,
      negativeConfirmationWindowMs: 500
    }),
    '260701',
    '260701 - Design',
    800
  );
  const first = verify(initial.state, parseDomSnapshot({
    clockInVisible: true,
    clockOutVisible: false
  }, { observedAtMs: 810 }), 809, { candidateId: null });
  const tooSoon = verify(first.state, parseDomSnapshot({
    clockInVisible: true,
    clockOutVisible: false
  }, { observedAtMs: 850 }), 849, { candidateId: null });
  const confirmed = verify(tooSoon.state, parseDomSnapshot({
    clockInVisible: true,
    clockOutVisible: false
  }, { observedAtMs: 920 }), 919, { candidateId: null });

  assert.equal(first.reason, 'NEGATIVE_CONFIRMATION_PENDING');
  assert.equal(first.events.length, 0);
  assert.equal(first.needsVerification, true);
  assert.equal(tooSoon.events.length, 0);
  assert.equal(confirmed.events[0].type, EVENT_TYPES.CLOCKED_OUT);
  assert.equal(confirmed.events[0].boundaryAtMs, 920);
  assert.equal(confirmed.events[0].boundaryCertainty, BOUNDARY_CERTAINTY.DETECTED);
});

test('UT-B2-BRIDGE-017 strong DOM plus compatible independent server negative confirms once', () => {
  const initial = confirmJob(createBridgeEngineState(), '260701', '260701 - Design', 1_000);
  const first = verify(initial.state, parseDomSnapshot({
    clockOutVisible: true,
    clockInVisible: false
  }, { observedAtMs: 1_010 }), 1_009, { candidateId: null });
  const independent = verify(first.state, serverNoContext(1_011), 1_010, { candidateId: null });

  assert.equal(independent.events.length, 1);
  assert.equal(independent.events[0].type, EVENT_TYPES.CONTEXT_LEFT);
  assert.equal(independent.events[0].negativeKind, 'NO_TRACKABLE_CONTEXT');
  assert.equal(independent.events[0].stateCertainty, 'OBSERVED_DOM');
});

test('UT-B2-BRIDGE-018 action 2 unavailable post-state holds strong evidence until confirmation', () => {
  const initial = confirmJob(createBridgeEngineState(), '260701', '260701 - Design', 1_100);
  const candidate = nativeCandidate(initial.state, NATIVE_ACTIONS.FULL_CLOCK_OUT, 1_110);
  const unavailable = verify(candidate.state, parseServerSnapshot(null, {
    observedAtMs: 1_112,
    available: false
  }), 1_111);

  assert.equal(unavailable.events[0].type, EVENT_TYPES.STATE_UNKNOWN);
  assert.equal(unavailable.events[0].strongUnconfirmedTransition.boundaryAtMs, 1_110);
  assert.equal(unavailable.events[0].strongUnconfirmedTransition.resolution, 'PENDING');
  assert.equal(unavailable.state.lastConfirmed.context.contextId, 'job:260701');
  assert.equal(unavailable.state.candidates[0].verificationStatus, 'STRONG_UNCONFIRMED');

  const confirmed = verify(unavailable.state, serverNoContext(1_114), 1_113);
  assert.equal(confirmed.events[0].type, EVENT_TYPES.CLOCKED_OUT);
  assert.equal(confirmed.events[0].boundaryAtMs, 1_110);
  assert.equal(confirmed.events[0].stateCertainty, 'NATIVE_CONFIRMED_POSTSTATE');
});

test('UT-B2-BRIDGE-019 only explicit same-episode disproof restores action-2 continuity', () => {
  const initial = confirmJob(createBridgeEngineState(), '260701', '260701 - Design', 1_200);
  const candidate = nativeCandidate(initial.state, NATIVE_ACTIONS.FULL_CLOCK_OUT, 1_210);
  const unavailable = verify(candidate.state, parseServerSnapshot(null, {
    observedAtMs: 1_212,
    available: false
  }), 1_211);
  const candidateId = unavailable.state.candidates[0].candidateId;
  const disproved = verify(
    unavailable.state,
    jobEvidence('260701', '260701 - Design', 1_214),
    1_213,
    {
      candidateResolution: {
        candidateId,
        resolution: CANDIDATE_RESOLUTIONS.SPECIFICALLY_DISPROVED,
        evidenceKind: 'CORRELATED_NATIVE_OUTCOME'
      }
    }
  );

  assert.equal(disproved.events[0].type, EVENT_TYPES.CONTEXT_VERIFIED);
  assert.equal(disproved.events[0].boundaryAtMs, null);
  assert.equal(disproved.events[0].candidateResolution.resolution, 'SPECIFICALLY_DISPROVED');
  assert.equal('strongUnconfirmedTransition' in disproved.events[0], false);
  assert.equal(disproved.state.candidates.length, 0);
});

test('UT-B2-BRIDGE-020 later same Context alone does not disprove action 2', () => {
  const initial = confirmJob(createBridgeEngineState(), '260701', '260701 - Design', 1_300);
  const candidate = nativeCandidate(initial.state, NATIVE_ACTIONS.FULL_CLOCK_OUT, 1_310);
  const unavailable = verify(candidate.state, parseServerSnapshot(null, {
    observedAtMs: 1_312,
    available: false
  }), 1_311);
  const laterSame = verify(
    unavailable.state,
    jobEvidence('260701', '260701 - Design', 1_314),
    1_313
  );

  assert.equal(laterSame.events[0].type, EVENT_TYPES.CONTEXT_VERIFIED);
  assert.equal(
    laterSame.events[0].candidateResolution.resolution,
    CANDIDATE_RESOLUTIONS.POSTSTATE_CONTEXT_WITHOUT_DISPROOF
  );
  assert.equal(laterSame.events[0].candidateResolution.candidateId, candidate.candidate.candidateId);
  assert.equal('strongUnconfirmedTransition' in laterSame.events[0], false);
  assert.equal(laterSame.events[0].boundaryAtMs, null);
});

test('UT-B2-BRIDGE-021 immediate contradictory action-2 post-state conflicts and re-verifies', () => {
  const initial = confirmJob(createBridgeEngineState(), '260701', '260701 - Design', 1_400);
  const candidate = nativeCandidate(initial.state, NATIVE_ACTIONS.FULL_CLOCK_OUT, 1_410);
  const conflict = verify(
    candidate.state,
    jobEvidence('260701', '260701 - Design', 1_412),
    1_411
  );

  assert.equal(conflict.events[0].type, EVENT_TYPES.STATE_CONFLICT);
  assert.equal(conflict.events[0].stateCertainty, 'CONFLICT');
  assert.equal(conflict.events[0].strongUnconfirmedTransition.boundaryAtMs, 1_410);
  assert.equal(conflict.state.candidates[0].verificationStatus, 'STRONG_UNCONFIRMED');
  assert.equal(conflict.needsVerification, true);
});

test('UT-B2-BRIDGE-022 fresh cross-source disagreement cannot fabricate a transition', () => {
  const initial = confirmJob(createBridgeEngineState(), '260701', '260701 - Design', 1_500);
  const server = jobEvidence('260701', '260701 - Design', 1_502);
  const dom = parseDomSnapshot({
    remainingTimeHtml: '<a href="/project.php?id=260702">260702 - Fabrication</a>'
  }, { observedAtMs: 1_503 });
  const result = verify(initial.state, [server, dom], 1_501, { candidateId: null });

  assert.equal(result.events[0].type, EVENT_TYPES.STATE_CONFLICT);
  assert.equal(result.state.lastConfirmed.context.contextId, 'job:260701');
});

test('UT-B2-BRIDGE-023 teardown invalidates generation, requests, candidates, and callbacks', () => {
  const state = createBridgeEngineState();
  const candidate = nativeCandidate(state, NATIVE_ACTIONS.CHANGE_CONTEXT, 1_600, {
    requestProjectId: '260701'
  });
  const started = beginVerification(candidate.state, {
    bridgeGeneration: candidate.state.bridgeGeneration,
    requestStartedAtMs: 1_601
  });
  const oldGeneration = started.state.bridgeGeneration;
  const tornDown = teardownBridge(started.state);

  assert.equal(tornDown.state.active, false);
  assert.equal(tornDown.state.bridgeGeneration, oldGeneration + 1);
  assert.equal(tornDown.state.candidates.length, 0);
  assert.equal(tornDown.state.activeRequest, null);

  const late = acceptVerification(tornDown.state, {
    request: started.request,
    evidence: jobEvidence('260701', '260701 - Design', 1_602)
  });
  assert.equal(late.accepted, false);
  assert.equal(late.reason, 'STALE_BRIDGE_GENERATION');

  const current = reinitializeBridge(tornDown.state);
  const staleCallback = recordNativeCompletion(current.state, {
    bridgeGeneration: oldGeneration,
    nativeAction: NATIVE_ACTIONS.CHANGE_CONTEXT,
    completedAtMs: 1_603,
    sourceRuntimeId: 'runtime-old'
  });
  assert.equal(staleCallback.accepted, false);
});

test('UT-B2-BRIDGE-024 Bridge state and events are immutable and contain no Timer or Ledger writes', () => {
  const result = confirmJob(createBridgeEngineState(), '260701', '260701 - Design', 1_700);
  const event = result.events[0];

  assert.equal(Object.isFrozen(result.state), true);
  assert.equal(Object.isFrozen(result.state.candidates), true);
  assert.equal(Object.isFrozen(event), true);
  assert.equal(Object.isFrozen(event.context), true);
  assert.equal('timerState' in event, false);
  assert.equal('ledger' in event, false);
  assert.throws(() => { event.context.contextId = 'job:evil'; }, TypeError);
});

test('UT-B2-BRIDGE-031 delayed native evidence is rejected only after a genuine newer transition', () => {
  const initial = confirmJob(createBridgeEngineState(), '260701', '260701 - Prior', 1_000);
  const transitioned = confirmJob(initial.state, '260702', '260702 - Current', 2_000);
  assert.equal(transitioned.events[0].type, EVENT_TYPES.CONTEXT_CHANGED);
  assert.equal(transitioned.state.lastTransitionAtMs, 2_000);
  for (const nativeAction of [NATIVE_ACTIONS.FULL_CLOCK_OUT, NATIVE_ACTIONS.CHANGE_CONTEXT, NATIVE_ACTIONS.LEAVE_CONTEXT]) {
    const delayed = nativeCandidate(transitioned.state, nativeAction, 1_999, {
      requestProjectId: nativeAction === NATIVE_ACTIONS.CHANGE_CONTEXT ? '260703' : null,
      completionKey: `delayed-${nativeAction}`
    });
    assert.equal(delayed.accepted, false);
    assert.equal(delayed.reason, 'NATIVE_COMPLETION_SUPERSEDED');
    assert.equal(delayed.state.candidates.length, 0);
  }
});

test('UT-B2-BRIDGE-033 same-context verification does not supersede delayed action-2 evidence', () => {
  const initial = confirmJob(createBridgeEngineState(), '260701', '260701 - Current', 1_000);
  const verified = confirmJob(initial.state, '260701', '260701 - Current', 2_000);
  assert.equal(verified.events[0].type, EVENT_TYPES.CONTEXT_VERIFIED);
  assert.equal(verified.state.lastTransitionAtMs, 1_000);

  const delayed = nativeCandidate(verified.state, NATIVE_ACTIONS.FULL_CLOCK_OUT, 1_500, {
    completionKey: 'delayed-action-two-after-verification'
  });
  assert.equal(delayed.accepted, true);
  assert.equal(delayed.state.candidates.length, 1);
  const postState = verify(
    delayed.state,
    jobEvidence('260701', '260701 - Current', 2_002),
    2_001
  );
  assert.equal(postState.events[0].type, EVENT_TYPES.STATE_CONFLICT);
  assert.equal(postState.events[0].strongUnconfirmedTransition.boundaryAtMs, 1_500);
  assert.equal(postState.state.candidates[0].verificationStatus, 'STRONG_UNCONFIRMED');
  assert.equal(postState.needsVerification, true);
});
