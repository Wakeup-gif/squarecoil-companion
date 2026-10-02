'use strict';

const {
  EVIDENCE_KINDS,
  NEGATIVE_KINDS,
  STATE_CERTAINTY,
  reconcileEvidence
} = require('./bridge-parser');

const NATIVE_ACTIONS = Object.freeze({
  FULL_CLOCK_OUT: 2,
  CHANGE_CONTEXT: 3,
  LEAVE_CONTEXT: 4
});

const EVENT_TYPES = Object.freeze({
  CONTEXT_DETECTED: 'CONTEXT_DETECTED',
  CONTEXT_CHANGED: 'CONTEXT_CHANGED',
  CONTEXT_VERIFIED: 'CONTEXT_VERIFIED',
  CONTEXT_METADATA_UPDATED: 'CONTEXT_METADATA_UPDATED',
  CONTEXT_LEFT: 'CONTEXT_LEFT',
  CLOCKED_OUT: 'CLOCKED_OUT',
  STATE_UNKNOWN: 'STATE_UNKNOWN',
  STATE_CONFLICT: 'STATE_CONFLICT'
});

const BOUNDARY_CERTAINTY = Object.freeze({
  NATIVE_CONFIRMED: 'NATIVE_CONFIRMED',
  DETECTED: 'DETECTED',
  NONE: 'NONE'
});

const CANDIDATE_RESOLUTIONS = Object.freeze({
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  SPECIFICALLY_DISPROVED: 'SPECIFICALLY_DISPROVED',
  POSTSTATE_CONTEXT_WITHOUT_DISPROOF: 'POSTSTATE_CONTEXT_WITHOUT_DISPROOF'
});

const DEFAULT_CANDIDATE_WINDOW_MS = 15_000;
const DEFAULT_NEGATIVE_CONFIRMATION_MIN_MS = 250;
const DEFAULT_NEGATIVE_CONFIRMATION_WINDOW_MS = 5_000;
const MAX_RECENT_COMPLETION_KEYS = 64;
const TRANSITION_EVENT_TYPES = new Set([
  EVENT_TYPES.CONTEXT_DETECTED,
  EVENT_TYPES.CONTEXT_CHANGED,
  EVENT_TYPES.CONTEXT_LEFT,
  EVENT_TYPES.CLOCKED_OUT
]);

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clone(child)]));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function frozenClone(value) {
  return deepFreeze(clone(value));
}

function assertSafeCounter(value, name, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${name} must be a safe integer >= ${minimum}`);
  }
  return value;
}

function assertTimestamp(value, name) {
  return assertSafeCounter(value, name, 0);
}

function nextCounter(value, name) {
  assertSafeCounter(value, name);
  if (value === Number.MAX_SAFE_INTEGER) throw new Error(`${name} exhausted`);
  return value + 1;
}

function checkedAdd(left, right, name) {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw new Error(`${name} exceeds safe integer range`);
  return result;
}

function requireText(value, name) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function normalizeOptionalText(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function freezeState(value) {
  return frozenClone({
    active: value.active,
    observationStreamId: value.observationStreamId,
    bridgeGeneration: value.bridgeGeneration,
    bridgeSeq: value.bridgeSeq,
    stateSequence: value.stateSequence,
    candidateSequence: value.candidateSequence,
    requestSequence: value.requestSequence,
    candidateWindowMs: value.candidateWindowMs,
    negativeConfirmationMinMs: value.negativeConfirmationMinMs,
    negativeConfirmationWindowMs: value.negativeConfirmationWindowMs,
    candidates: value.candidates,
    activeRequest: value.activeRequest,
    verificationQueued: value.verificationQueued,
    lastConfirmed: value.lastConfirmed,
    lastTransitionAtMs: value.lastTransitionAtMs,
    pendingNegative: value.pendingNegative,
    recentCompletionKeys: value.recentCompletionKeys
  });
}

function assertState(state) {
  if (!state || typeof state !== 'object') throw new Error('bridge state is required');
  if (typeof state.active !== 'boolean') throw new Error('bridge active flag is invalid');
  requireText(state.observationStreamId, 'observationStreamId');
  assertSafeCounter(state.bridgeGeneration, 'bridgeGeneration', 1);
  assertSafeCounter(state.bridgeSeq, 'bridgeSeq');
  assertSafeCounter(state.stateSequence, 'stateSequence');
  assertSafeCounter(state.candidateSequence, 'candidateSequence');
  assertSafeCounter(state.requestSequence, 'requestSequence');
  assertSafeCounter(state.candidateWindowMs, 'candidateWindowMs', 1);
  assertSafeCounter(state.negativeConfirmationMinMs, 'negativeConfirmationMinMs');
  assertSafeCounter(state.negativeConfirmationWindowMs, 'negativeConfirmationWindowMs', 1);
  if (state.negativeConfirmationMinMs > state.negativeConfirmationWindowMs) {
    throw new Error('negative confirmation minimum exceeds its window');
  }
  if (!Array.isArray(state.candidates) || !Array.isArray(state.recentCompletionKeys)) {
    throw new Error('bridge queue state is invalid');
  }
  if (state.lastTransitionAtMs !== null) {
    assertTimestamp(state.lastTransitionAtMs, 'lastTransitionAtMs');
  }
  return state;
}

function createBridgeEngineState(options = {}) {
  const candidateWindowMs = options.candidateWindowMs ?? DEFAULT_CANDIDATE_WINDOW_MS;
  const negativeConfirmationMinMs = options.negativeConfirmationMinMs ??
    DEFAULT_NEGATIVE_CONFIRMATION_MIN_MS;
  const negativeConfirmationWindowMs = options.negativeConfirmationWindowMs ??
    DEFAULT_NEGATIVE_CONFIRMATION_WINDOW_MS;
  assertSafeCounter(candidateWindowMs, 'candidateWindowMs', 1);
  assertSafeCounter(negativeConfirmationMinMs, 'negativeConfirmationMinMs');
  assertSafeCounter(negativeConfirmationWindowMs, 'negativeConfirmationWindowMs', 1);
  if (negativeConfirmationMinMs > negativeConfirmationWindowMs) {
    throw new Error('negative confirmation minimum exceeds its window');
  }
  const bridgeGeneration = options.bridgeGeneration ?? 1;
  assertSafeCounter(bridgeGeneration, 'bridgeGeneration', 1);
  const observationStreamId = requireText(options.observationStreamId || 'bridge', 'observationStreamId');
  return freezeState({
    active: true,
    observationStreamId,
    bridgeGeneration,
    bridgeSeq: 0,
    stateSequence: 0,
    candidateSequence: 0,
    requestSequence: 0,
    candidateWindowMs,
    negativeConfirmationMinMs,
    negativeConfirmationWindowMs,
    candidates: [],
    activeRequest: null,
    verificationQueued: false,
    lastConfirmed: null,
    lastTransitionAtMs: null,
    pendingNegative: null,
    recentCompletionKeys: []
  });
}

function result(state, accepted, changed, reason, extras = {}) {
  return deepFreeze({
    accepted,
    changed,
    reason,
    state,
    events: extras.events || [],
    request: extras.request || null,
    candidate: extras.candidate || null,
    needsVerification: extras.needsVerification ?? false
  });
}

function reject(state, reason, changed = false) {
  return result(state, false, changed, reason, {
    needsVerification: state.verificationQueued || state.candidates.length > 0
  });
}

function currentContext(state) {
  return state.lastConfirmed?.kind === EVIDENCE_KINDS.CONTEXT
    ? state.lastConfirmed.context
    : null;
}

function generationMatches(state, generation) {
  return state.active && generation === state.bridgeGeneration;
}

function pruneExpiredCandidates(state, atMs) {
  const candidates = state.candidates.filter(candidate => atMs < candidate.expiresAtMs);
  return candidates.length === state.candidates.length ? state : freezeState({ ...state, candidates });
}

function completionRecord(state, completionKey, candidateId) {
  if (!completionKey) return state.recentCompletionKeys;
  return [...state.recentCompletionKeys, { completionKey, candidateId }]
    .slice(-MAX_RECENT_COMPLETION_KEYS);
}

function recordNativeCompletion(inputState, options = {}) {
  let state = assertState(inputState);
  if (!generationMatches(state, options.bridgeGeneration)) {
    return reject(state, 'STALE_BRIDGE_GENERATION');
  }
  const nativeAction = Number(options.nativeAction);
  if (!Object.values(NATIVE_ACTIONS).includes(nativeAction)) {
    return reject(state, 'UNSUPPORTED_NATIVE_ACTION');
  }
  const completedAtMs = assertTimestamp(options.completedAtMs, 'completedAtMs');
  if (state.lastTransitionAtMs !== null && completedAtMs < state.lastTransitionAtMs) {
    return reject(state, 'NATIVE_COMPLETION_SUPERSEDED');
  }
  const sourceRuntimeId = requireText(options.sourceRuntimeId, 'sourceRuntimeId');
  const completionKey = normalizeOptionalText(options.completionKey);
  if (completionKey) {
    const duplicate = state.recentCompletionKeys.find(item => item.completionKey === completionKey);
    if (duplicate) {
      const candidate = state.candidates.find(item => item.candidateId === duplicate.candidateId) || null;
      return result(state, true, false, 'NATIVE_COMPLETION_COALESCED', {
        candidate,
        needsVerification: Boolean(candidate) || state.verificationQueued
      });
    }
  }
  state = pruneExpiredCandidates(state, completedAtMs);
  const candidateSequence = nextCounter(state.candidateSequence, 'candidateSequence');
  const candidate = frozenClone({
    candidateId: `candidate:${state.bridgeGeneration}:${candidateSequence}`,
    bridgeGeneration: state.bridgeGeneration,
    nativeAction,
    completedAtMs,
    expiresAtMs: checkedAdd(completedAtMs, state.candidateWindowMs, 'candidate expiry'),
    requestProjectId: normalizeOptionalText(options.requestProjectId),
    requestDepartment: normalizeOptionalText(options.requestDepartment),
    priorConfirmedContextId: currentContext(state)?.contextId || null,
    sourceRuntimeId,
    completionKey,
    verificationStatus: CANDIDATE_RESOLUTIONS.PENDING
  });
  const next = freezeState({
    ...state,
    stateSequence: nextCounter(state.stateSequence, 'stateSequence'),
    candidateSequence,
    candidates: [...state.candidates, candidate],
    verificationQueued: true,
    recentCompletionKeys: completionRecord(state, completionKey, candidate.candidateId)
  });
  return result(next, true, true, 'TRANSITION_CANDIDATE_QUEUED', {
    candidate,
    needsVerification: true
  });
}

function beginVerification(inputState, options = {}) {
  let state = assertState(inputState);
  if (!generationMatches(state, options.bridgeGeneration)) {
    return reject(state, 'STALE_BRIDGE_GENERATION');
  }
  const requestStartedAtMs = assertTimestamp(options.requestStartedAtMs, 'requestStartedAtMs');
  state = pruneExpiredCandidates(state, requestStartedAtMs);

  if (state.activeRequest) {
    const next = state.verificationQueued ? state : freezeState({ ...state, verificationQueued: true });
    return result(next, true, next !== state, 'VERIFICATION_COALESCED', {
      request: next.activeRequest,
      needsVerification: true
    });
  }

  let candidateId;
  if (Object.prototype.hasOwnProperty.call(options, 'candidateId')) {
    candidateId = options.candidateId === null ? null : String(options.candidateId);
  } else {
    // The latest native episode owns the current post-state. Earlier episodes
    // remain queued so a safe ordered compound (notably action 4 then action 3)
    // can preserve both real boundaries instead of donating the old timestamp
    // to the final Context.
    candidateId = state.candidates.at(-1)?.candidateId || null;
  }
  if (candidateId && !state.candidates.some(candidate => candidate.candidateId === candidateId)) {
    return reject(state, 'CANDIDATE_UNAVAILABLE');
  }

  const requestSequence = nextCounter(state.requestSequence, 'requestSequence');
  const request = frozenClone({
    bridgeGeneration: state.bridgeGeneration,
    requestId: `verification:${state.bridgeGeneration}:${requestSequence}`,
    requestStartedAtMs,
    candidateId,
    stateSequenceAtStart: state.stateSequence,
    trigger: normalizeOptionalText(options.trigger) || 'UNSPECIFIED'
  });
  const next = freezeState({
    ...state,
    requestSequence,
    activeRequest: request,
    verificationQueued: false
  });
  return result(next, true, true, 'VERIFICATION_STARTED', { request });
}

function nextBridgeEvent(state, type, evidence, fields = {}) {
  const bridgeSeq = nextCounter(state.bridgeSeq, 'bridgeSeq');
  return frozenClone({
    type,
    bridgeGeneration: state.bridgeGeneration,
    bridgeSeq,
    observationId: `observation:${state.observationStreamId}:${state.bridgeGeneration}:${bridgeSeq}`,
    observedAtMs: evidence.observedAtMs,
    source: evidence.source,
    stateCertainty: evidence.stateCertainty,
    boundaryAtMs: null,
    boundaryCertainty: BOUNDARY_CERTAINTY.NONE,
    transitionCandidateId: null,
    verificationId: null,
    ...fields
  });
}

function withEvent(state, event, changes = {}) {
  const transitionAtMs = TRANSITION_EVENT_TYPES.has(event.type) &&
    Number.isSafeInteger(event.boundaryAtMs)
    ? event.boundaryAtMs
    : null;
  const lastTransitionAtMs = transitionAtMs === null
    ? state.lastTransitionAtMs
    : state.lastTransitionAtMs === null
      ? transitionAtMs
      : Math.max(state.lastTransitionAtMs, transitionAtMs);
  return freezeState({ ...state, bridgeSeq: event.bridgeSeq, ...changes, lastTransitionAtMs });
}

function removeCandidate(candidates, candidateId) {
  return candidates.filter(candidate => candidate.candidateId !== candidateId);
}

function consumeThroughCandidate(candidates, candidateId) {
  const index = candidates.findIndex(candidate => candidate.candidateId === candidateId);
  return index < 0 ? candidates : candidates.slice(index + 1);
}

function replaceCandidate(candidates, replacement) {
  return candidates.map(candidate =>
    candidate.candidateId === replacement.candidateId ? replacement : candidate
  );
}

function metadataMatches(left, right) {
  return Boolean(
    left &&
    right &&
    left.contextId === right.contextId &&
    String(left.label || '') === String(right.label || '') &&
    String(left.department || '') === String(right.department || '') &&
    String(left.shortLabel || '') === String(right.shortLabel || '')
  );
}

function candidateMatchesContext(candidate, context) {
  if (!candidate || candidate.nativeAction === NATIVE_ACTIONS.FULL_CLOCK_OUT) return false;
  if (candidate.nativeAction === NATIVE_ACTIONS.LEAVE_CONTEXT) {
    return Boolean(
      candidate.priorConfirmedContextId &&
      candidate.priorConfirmedContextId !== context.contextId
    );
  }
  if (!candidate.requestProjectId) return true;
  if (candidate.requestProjectId === '0') {
    return context.contextId === 'general:production-general';
  }
  return String(context.projectId || '') === candidate.requestProjectId;
}

function candidateMatchesNegative(candidate, negativeKind) {
  if (!candidate) return false;
  if (candidate.nativeAction === NATIVE_ACTIONS.FULL_CLOCK_OUT) {
    return negativeKind === NEGATIVE_KINDS.CLOCKED_OUT || negativeKind === NEGATIVE_KINDS.NO_CONTEXT;
  }
  if (candidate.nativeAction === NATIVE_ACTIONS.LEAVE_CONTEXT) {
    return negativeKind === NEGATIVE_KINDS.NO_TRACKABLE_CONTEXT ||
      negativeKind === NEGATIVE_KINDS.NO_CONTEXT;
  }
  return false;
}

function strongActionTwo(candidate, resolution) {
  return frozenClone({
    candidateId: candidate.candidateId,
    nativeAction: NATIVE_ACTIONS.FULL_CLOCK_OUT,
    boundaryAtMs: candidate.completedAtMs,
    strength: 'STRONG_UNCONFIRMED',
    resolution
  });
}

function candidateResolution(candidate, resolution, fields = {}) {
  return frozenClone({
    candidateId: candidate.candidateId,
    nativeAction: candidate.nativeAction,
    resolution,
    ...fields
  });
}

function contextEventType(prior, context) {
  if (!prior) return EVENT_TYPES.CONTEXT_DETECTED;
  if (prior.contextId !== context.contextId) return EVENT_TYPES.CONTEXT_CHANGED;
  return metadataMatches(prior, context)
    ? EVENT_TYPES.CONTEXT_VERIFIED
    : EVENT_TYPES.CONTEXT_METADATA_UPDATED;
}

function validSpecificDisproof(options, candidate, evidence) {
  const resolution = options.candidateResolution;
  if (!resolution || typeof resolution !== 'object') return false;
  return (
    resolution.candidateId === candidate.candidateId &&
    resolution.resolution === CANDIDATE_RESOLUTIONS.SPECIFICALLY_DISPROVED &&
    resolution.evidenceKind === 'CORRELATED_NATIVE_OUTCOME' &&
    candidate.priorConfirmedContextId &&
    evidence.context.contextId === candidate.priorConfirmedContextId
  );
}

function queuedLeaveThenEnter(state, request, evidence, candidate) {
  if (!candidate || candidate.nativeAction !== NATIVE_ACTIONS.CHANGE_CONTEXT) return null;
  if (!candidateMatchesContext(candidate, evidence.context)) return null;
  const candidateIndex = state.candidates.findIndex(item => item.candidateId === candidate.candidateId);
  if (candidateIndex < 1) return null;
  const leaveCandidate = state.candidates[candidateIndex - 1];
  const prior = currentContext(state);
  if (
    leaveCandidate.nativeAction !== NATIVE_ACTIONS.LEAVE_CONTEXT ||
    !prior ||
    leaveCandidate.priorConfirmedContextId !== prior.contextId ||
    leaveCandidate.completedAtMs >= candidate.completedAtMs
  ) {
    return null;
  }

  const left = nextBridgeEvent(state, EVENT_TYPES.CONTEXT_LEFT, evidence, {
    stateCertainty: STATE_CERTAINTY.NATIVE_CONFIRMED_POSTSTATE,
    priorContextId: prior.contextId,
    negativeKind: NEGATIVE_KINDS.NO_TRACKABLE_CONTEXT,
    verificationId: request.requestId,
    boundaryAtMs: leaveCandidate.completedAtMs,
    boundaryCertainty: BOUNDARY_CERTAINTY.NATIVE_CONFIRMED,
    transitionCandidateId: leaveCandidate.candidateId
  });
  const afterLeave = withEvent(state, left, {
    lastConfirmed: frozenClone({
      kind: NEGATIVE_KINDS.NO_TRACKABLE_CONTEXT,
      observedAtMs: evidence.observedAtMs,
      source: evidence.source,
      stateCertainty: STATE_CERTAINTY.NATIVE_CONFIRMED_POSTSTATE
    }),
    pendingNegative: null
  });
  const entered = nextBridgeEvent(afterLeave, EVENT_TYPES.CONTEXT_DETECTED, evidence, {
    context: evidence.context,
    priorContextId: null,
    verificationId: request.requestId,
    boundaryAtMs: candidate.completedAtMs,
    boundaryCertainty: BOUNDARY_CERTAINTY.NATIVE_CONFIRMED,
    transitionCandidateId: candidate.candidateId
  });
  return {
    events: [left, entered],
    state: withEvent(afterLeave, entered, {
      candidates: consumeThroughCandidate(state.candidates, candidate.candidateId),
      lastConfirmed: frozenClone({
        kind: EVIDENCE_KINDS.CONTEXT,
        context: evidence.context,
        observedAtMs: evidence.observedAtMs,
        source: evidence.source,
        stateCertainty: evidence.stateCertainty
      }),
      pendingNegative: null
    }),
    reason: 'DISTINCT_LEAVE_AND_ENTER_CONFIRMED'
  };
}

function handleContext(state, request, evidence, candidate, options) {
  const prior = currentContext(state);
  const type = contextEventType(prior, evidence.context);
  const base = {
    context: evidence.context,
    priorContextId: prior?.contextId || null,
    verificationId: request.requestId
  };

  if (candidate?.nativeAction === NATIVE_ACTIONS.FULL_CLOCK_OUT) {
    if (validSpecificDisproof(options, candidate, evidence)) {
      const event = nextBridgeEvent(state, type, evidence, {
        ...base,
        candidateResolution: candidateResolution(
          candidate,
          CANDIDATE_RESOLUTIONS.SPECIFICALLY_DISPROVED,
          { evidenceKind: 'CORRELATED_NATIVE_OUTCOME' }
        ),
        transitionCandidateId: candidate.candidateId
      });
      return {
        event,
        state: withEvent(state, event, {
          candidates: removeCandidate(state.candidates, candidate.candidateId),
          lastConfirmed: frozenClone({
            kind: EVIDENCE_KINDS.CONTEXT,
            context: evidence.context,
            observedAtMs: evidence.observedAtMs,
            source: evidence.source,
            stateCertainty: evidence.stateCertainty
          }),
          pendingNegative: null
        }),
        reason: CANDIDATE_RESOLUTIONS.SPECIFICALLY_DISPROVED
      };
    }

    if (candidate.verificationStatus === 'STRONG_UNCONFIRMED') {
      const resolution = CANDIDATE_RESOLUTIONS.POSTSTATE_CONTEXT_WITHOUT_DISPROOF;
      const event = nextBridgeEvent(state, type, evidence, {
        ...base,
        transitionCandidateId: candidate.candidateId,
        candidateResolution: candidateResolution(candidate, resolution)
      });
      return {
        event,
        state: withEvent(state, event, {
          candidates: removeCandidate(state.candidates, candidate.candidateId),
          lastConfirmed: frozenClone({
            kind: EVIDENCE_KINDS.CONTEXT,
            context: evidence.context,
            observedAtMs: evidence.observedAtMs,
            source: evidence.source,
            stateCertainty: evidence.stateCertainty
          }),
          pendingNegative: null
        }),
        reason: resolution
      };
    }

    const retained = frozenClone({ ...candidate, verificationStatus: 'STRONG_UNCONFIRMED' });
    const event = nextBridgeEvent(state, EVENT_TYPES.STATE_CONFLICT, evidence, {
      stateCertainty: STATE_CERTAINTY.CONFLICT,
      reason: 'ACTION_2_POSTSTATE_CONTEXT_NOT_SPECIFIC_DISPROOF',
      verificationId: request.requestId,
      transitionCandidateId: candidate.candidateId,
      lastConfirmedContextId: prior?.contextId || null,
      strongUnconfirmedTransition: strongActionTwo(retained, CANDIDATE_RESOLUTIONS.PENDING)
    });
    return {
      event,
      state: withEvent(state, event, {
        candidates: replaceCandidate(state.candidates, retained),
        pendingNegative: null
      }),
      reason: EVENT_TYPES.STATE_CONFLICT
    };
  }

  if (candidate && !candidateMatchesContext(candidate, evidence.context)) {
    const event = nextBridgeEvent(state, EVENT_TYPES.STATE_CONFLICT, evidence, {
      stateCertainty: STATE_CERTAINTY.CONFLICT,
      reason: 'TRANSITION_CANDIDATE_POSTSTATE_CONFLICT',
      verificationId: request.requestId,
      transitionCandidateId: candidate.candidateId,
      lastConfirmedContextId: prior?.contextId || null,
      observedContextId: evidence.context.contextId
    });
    return {
      event,
      state: withEvent(state, event, {
        candidates: removeCandidate(state.candidates, candidate.candidateId),
        pendingNegative: null
      }),
      reason: EVENT_TYPES.STATE_CONFLICT
    };
  }

  const nativeBoundary = Boolean(
    candidate &&
    (type === EVENT_TYPES.CONTEXT_DETECTED || type === EVENT_TYPES.CONTEXT_CHANGED)
  );
  const event = nextBridgeEvent(state, type, evidence, {
    ...base,
    boundaryAtMs: nativeBoundary
      ? candidate.completedAtMs
      : type === EVENT_TYPES.CONTEXT_DETECTED || type === EVENT_TYPES.CONTEXT_CHANGED
        ? evidence.observedAtMs
        : null,
    boundaryCertainty: nativeBoundary
      ? BOUNDARY_CERTAINTY.NATIVE_CONFIRMED
      : type === EVENT_TYPES.CONTEXT_DETECTED || type === EVENT_TYPES.CONTEXT_CHANGED
        ? BOUNDARY_CERTAINTY.DETECTED
        : BOUNDARY_CERTAINTY.NONE,
    transitionCandidateId: candidate?.candidateId || null,
    metadataChanged: type === EVENT_TYPES.CONTEXT_METADATA_UPDATED
  });
  return {
    event,
    state: withEvent(state, event, {
      candidates: candidate ? removeCandidate(state.candidates, candidate.candidateId) : state.candidates,
      lastConfirmed: frozenClone({
        kind: EVIDENCE_KINDS.CONTEXT,
        context: evidence.context,
        observedAtMs: evidence.observedAtMs,
        source: evidence.source,
        stateCertainty: evidence.stateCertainty
      }),
      pendingNegative: null
    }),
    reason: type
  };
}

function combinedNegativeKind(left, right) {
  if (left === right) {
    return left === NEGATIVE_KINDS.NO_CONTEXT ? NEGATIVE_KINDS.NO_TRACKABLE_CONTEXT : left;
  }
  if (left === NEGATIVE_KINDS.NO_CONTEXT) return right;
  if (right === NEGATIVE_KINDS.NO_CONTEXT) return left;
  return null;
}

function confirmedNegativeEvent(
  state,
  request,
  evidence,
  candidate,
  negativeKind,
  boundaryAtMs,
  boundaryCertainty,
  stateCertainty
) {
  const prior = currentContext(state);
  const type = negativeKind === NEGATIVE_KINDS.CLOCKED_OUT
    ? EVENT_TYPES.CLOCKED_OUT
    : EVENT_TYPES.CONTEXT_LEFT;
  const event = nextBridgeEvent(state, type, evidence, {
    stateCertainty,
    priorContextId: prior?.contextId || null,
    negativeKind,
    verificationId: request.requestId,
    boundaryAtMs,
    boundaryCertainty,
    transitionCandidateId: candidate?.candidateId || null
  });
  return {
    event,
    state: withEvent(state, event, {
      candidates: candidate ? removeCandidate(state.candidates, candidate.candidateId) : state.candidates,
      lastConfirmed: frozenClone({
        kind: negativeKind,
        observedAtMs: evidence.observedAtMs,
        source: evidence.source,
        stateCertainty
      }),
      pendingNegative: null
    }),
    reason: type
  };
}

function handleNegative(state, request, evidence, candidate) {
  if (candidate) {
    if (!candidateMatchesNegative(candidate, evidence.negativeKind)) {
      const event = nextBridgeEvent(state, EVENT_TYPES.STATE_CONFLICT, evidence, {
        stateCertainty: STATE_CERTAINTY.CONFLICT,
        reason: 'TRANSITION_CANDIDATE_NEGATIVE_CONFLICT',
        verificationId: request.requestId,
        transitionCandidateId: candidate.candidateId,
        lastConfirmedContextId: currentContext(state)?.contextId || null,
        ...(candidate.nativeAction === NATIVE_ACTIONS.FULL_CLOCK_OUT ? {
          strongUnconfirmedTransition: strongActionTwo(candidate, CANDIDATE_RESOLUTIONS.PENDING)
        } : {})
      });
      const retained = candidate.nativeAction === NATIVE_ACTIONS.FULL_CLOCK_OUT
        ? frozenClone({ ...candidate, verificationStatus: 'STRONG_UNCONFIRMED' })
        : candidate;
      return {
        event,
        state: withEvent(state, event, {
          candidates: replaceCandidate(state.candidates, retained),
          pendingNegative: null
        }),
        reason: EVENT_TYPES.STATE_CONFLICT
      };
    }
    const negativeKind = candidate.nativeAction === NATIVE_ACTIONS.FULL_CLOCK_OUT
      ? NEGATIVE_KINDS.CLOCKED_OUT
      : NEGATIVE_KINDS.NO_TRACKABLE_CONTEXT;
    return confirmedNegativeEvent(
      state,
      request,
      evidence,
      candidate,
      negativeKind,
      candidate.completedAtMs,
      BOUNDARY_CERTAINTY.NATIVE_CONFIRMED,
      STATE_CERTAINTY.NATIVE_CONFIRMED_POSTSTATE
    );
  }

  const pending = state.pendingNegative;
  if (!pending) {
    return {
      event: null,
      state: freezeState({
        ...state,
        pendingNegative: frozenClone({
          negativeKind: evidence.negativeKind,
          firstObservedAtMs: evidence.observedAtMs,
          lastObservedAtMs: evidence.observedAtMs,
          sources: [evidence.source]
        })
      }),
      reason: 'NEGATIVE_CONFIRMATION_PENDING'
    };
  }

  const ageMs = evidence.observedAtMs - pending.firstObservedAtMs;
  const combined = combinedNegativeKind(pending.negativeKind, evidence.negativeKind);
  if (ageMs < 0 || ageMs > state.negativeConfirmationWindowMs || !combined) {
    const conflictEvent = !combined && ageMs >= 0 && ageMs <= state.negativeConfirmationWindowMs
      ? nextBridgeEvent(state, EVENT_TYPES.STATE_CONFLICT, evidence, {
        stateCertainty: STATE_CERTAINTY.CONFLICT,
        reason: 'PASSIVE_NEGATIVE_EVIDENCE_CONFLICT',
        verificationId: request.requestId,
        negativeKinds: [pending.negativeKind, evidence.negativeKind]
      })
      : null;
    const next = freezeState({
      ...state,
      ...(conflictEvent ? { bridgeSeq: conflictEvent.bridgeSeq } : {}),
      pendingNegative: frozenClone({
        negativeKind: evidence.negativeKind,
        firstObservedAtMs: evidence.observedAtMs,
        lastObservedAtMs: evidence.observedAtMs,
        sources: [evidence.source]
      })
    });
    return {
      event: conflictEvent,
      state: next,
      reason: conflictEvent ? EVENT_TYPES.STATE_CONFLICT : 'NEGATIVE_CONFIRMATION_RESTARTED'
    };
  }

  const independent = !pending.sources.includes(evidence.source);
  if (!independent && ageMs < state.negativeConfirmationMinMs) {
    return {
      event: null,
      state: freezeState({
        ...state,
        pendingNegative: frozenClone({ ...pending, lastObservedAtMs: evidence.observedAtMs })
      }),
      reason: 'NEGATIVE_CONFIRMATION_PENDING'
    };
  }
  return confirmedNegativeEvent(
    state,
    request,
    evidence,
    null,
    combined,
    evidence.observedAtMs,
    BOUNDARY_CERTAINTY.DETECTED,
    pending.sources.includes('CLOCK_DOM') || evidence.source === 'CLOCK_DOM'
      ? STATE_CERTAINTY.OBSERVED_DOM
      : STATE_CERTAINTY.FALLBACK
  );
}

function handleUnknown(state, request, evidence, candidate) {
  let candidates = state.candidates;
  let strongUnconfirmedTransition;
  if (candidate?.nativeAction === NATIVE_ACTIONS.FULL_CLOCK_OUT) {
    const retained = frozenClone({ ...candidate, verificationStatus: 'STRONG_UNCONFIRMED' });
    candidates = replaceCandidate(candidates, retained);
    strongUnconfirmedTransition = strongActionTwo(retained, CANDIDATE_RESOLUTIONS.PENDING);
  }
  const event = nextBridgeEvent(state, EVENT_TYPES.STATE_UNKNOWN, evidence, {
    reason: evidence.reason || 'STATE_UNKNOWN',
    verificationId: request.requestId,
    transitionCandidateId: candidate?.candidateId || null,
    lastConfirmedContextId: currentContext(state)?.contextId || null,
    ...(strongUnconfirmedTransition ? { strongUnconfirmedTransition } : {})
  });
  return {
    event,
    state: withEvent(state, event, { candidates, pendingNegative: null }),
    reason: strongUnconfirmedTransition ? 'STRONG_UNCONFIRMED_CLOCK_OUT' : EVENT_TYPES.STATE_UNKNOWN
  };
}

function handleConflict(state, request, evidence, candidate) {
  let candidates = state.candidates;
  let strongUnconfirmedTransition;
  if (candidate?.nativeAction === NATIVE_ACTIONS.FULL_CLOCK_OUT) {
    const retained = frozenClone({ ...candidate, verificationStatus: 'STRONG_UNCONFIRMED' });
    candidates = replaceCandidate(candidates, retained);
    strongUnconfirmedTransition = strongActionTwo(retained, CANDIDATE_RESOLUTIONS.PENDING);
  }
  const event = nextBridgeEvent(state, EVENT_TYPES.STATE_CONFLICT, evidence, {
    stateCertainty: STATE_CERTAINTY.CONFLICT,
    reason: evidence.reason || 'EVIDENCE_CONFLICT',
    verificationId: request.requestId,
    transitionCandidateId: candidate?.candidateId || null,
    lastConfirmedContextId: currentContext(state)?.contextId || null,
    ...(strongUnconfirmedTransition ? { strongUnconfirmedTransition } : {})
  });
  return {
    event,
    state: withEvent(state, event, { candidates, pendingNegative: null }),
    reason: EVENT_TYPES.STATE_CONFLICT
  };
}

function assertEvidence(value) {
  if (!value || typeof value !== 'object' || !Object.values(EVIDENCE_KINDS).includes(value.kind)) {
    throw new Error('normalized Bridge evidence is required');
  }
  assertTimestamp(value.observedAtMs, 'evidence.observedAtMs');
  return value;
}

function acceptVerification(inputState, options = {}) {
  let state = assertState(inputState);
  const request = options.request;
  if (!request || typeof request !== 'object') throw new Error('verification request is required');
  if (!state.active || request.bridgeGeneration !== state.bridgeGeneration) {
    return reject(state, 'STALE_BRIDGE_GENERATION');
  }
  if (!state.activeRequest || request.requestId !== state.activeRequest.requestId) {
    return reject(state, 'STALE_OR_SUPERSEDED_REQUEST');
  }
  if (request.stateSequenceAtStart !== state.stateSequence) {
    const next = freezeState({ ...state, activeRequest: null, verificationQueued: true });
    return reject(next, 'STALE_REQUEST_STATE_SEQUENCE', true);
  }

  const evidence = Array.isArray(options.evidence)
    ? reconcileEvidence(options.evidence)
    : assertEvidence(options.evidence);
  assertEvidence(evidence);
  if (evidence.observedAtMs < request.requestStartedAtMs) {
    const next = freezeState({ ...state, activeRequest: null, verificationQueued: true });
    return reject(next, 'STALE_EVIDENCE_CAPTURE_TIME', true);
  }
  state = pruneExpiredCandidates(state, evidence.observedAtMs);
  const candidate = request.candidateId
    ? state.candidates.find(item => item.candidateId === request.candidateId) || null
    : null;

  let handled;
  if (evidence.kind === EVIDENCE_KINDS.CONTEXT) {
    handled = queuedLeaveThenEnter(state, request, evidence, candidate) ||
      handleContext(state, request, evidence, candidate, options);
  } else if (evidence.kind === EVIDENCE_KINDS.NEGATIVE_CANDIDATE) {
    handled = handleNegative(state, request, evidence, candidate);
  } else if (evidence.kind === EVIDENCE_KINDS.STATE_CONFLICT) {
    handled = handleConflict(state, request, evidence, candidate);
  } else {
    handled = handleUnknown(state, request, evidence, candidate);
  }

  const next = freezeState({
    ...handled.state,
    activeRequest: null,
    verificationQueued: handled.state.candidates.length > 0 || Boolean(handled.state.pendingNegative)
  });
  return result(next, true, true, handled.reason, {
    events: handled.events || (handled.event ? [handled.event] : []),
    needsVerification: next.verificationQueued
  });
}

function teardownBridge(inputState) {
  const state = assertState(inputState);
  if (!state.active) return result(state, true, false, 'BRIDGE_ALREADY_TORN_DOWN');
  const next = freezeState({
    ...state,
    active: false,
    bridgeGeneration: nextCounter(state.bridgeGeneration, 'bridgeGeneration'),
    stateSequence: nextCounter(state.stateSequence, 'stateSequence'),
    candidates: [],
    activeRequest: null,
    verificationQueued: false,
    pendingNegative: null
  });
  return result(next, true, true, 'BRIDGE_TORN_DOWN');
}

function reinitializeBridge(inputState) {
  const state = assertState(inputState);
  if (state.active) return reject(state, 'BRIDGE_ALREADY_ACTIVE');
  const next = freezeState({ ...state, active: true });
  return result(next, true, true, 'BRIDGE_REINITIALIZED');
}

module.exports = {
  NATIVE_ACTIONS,
  EVENT_TYPES,
  BOUNDARY_CERTAINTY,
  CANDIDATE_RESOLUTIONS,
  DEFAULT_CANDIDATE_WINDOW_MS,
  DEFAULT_NEGATIVE_CONFIRMATION_MIN_MS,
  DEFAULT_NEGATIVE_CONFIRMATION_WINDOW_MS,
  createBridgeEngineState,
  recordNativeCompletion,
  beginVerification,
  acceptVerification,
  teardownBridge,
  reinitializeBridge
};
