'use strict';

const {
  isRecord,
  isTimestamp,
  timerKind,
  validateDocument
} = require('../data/model');
const { dedupeSegments, splitInterval } = require('../data/ledger');
const { createRecoveryCheckpoint } = require('../data/checkpoint');
const { TIMER_COMMANDS } = require('./commands');

const DEFAULT_VERIFICATION_GRACE_MS = 90 * 1000;
const DEFAULT_CLOCK_SKEW_MS = 5 * 1000;

const OBSERVATION_TYPES = new Set([
  'CONTEXT_DETECTED',
  'CONTEXT_CHANGED',
  'CONTEXT_VERIFIED',
  'CONTEXT_METADATA_UPDATED',
  'CONTEXT_LEFT',
  'CLOCKED_OUT',
  'STATE_UNKNOWN',
  'STATE_CONFLICT'
]);

const POSITIVE_TYPES = new Set([
  'CONTEXT_DETECTED',
  'CONTEXT_CHANGED',
  'CONTEXT_VERIFIED',
  'CONTEXT_METADATA_UPDATED'
]);

const POSITIVE_CERTAINTIES = new Set([
  'VERIFIED_SERVER',
  'NATIVE_CONFIRMED_POSTSTATE',
  'OBSERVED_DOM',
  'FALLBACK'
]);

const BOUNDARY_CERTAINTIES = new Set(['NATIVE_CONFIRMED', 'DETECTED', 'NONE']);
const USER_COMMANDS = new Set([
  TIMER_COMMANDS.RESUME,
  TIMER_COMMANDS.START_FRESH,
  TIMER_COMMANDS.LOCAL_PAUSE,
  TIMER_COMMANDS.LOCAL_RESUME,
  TIMER_COMMANDS.COMPANION_DISABLE
]);

function randomId(prefix) {
  try {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  } catch (_) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function requireText(value, name) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`${name}-required`);
  return normalized;
}

function requireSafeCounter(value, name, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`${name}-invalid`);
  return value;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function currentContextId(document) {
  return document.timer.active?.contextId ||
    document.timer.pending?.contextId ||
    document.timer.localPause?.contextId ||
    null;
}

function currentState(document) {
  return timerKind(document.timer);
}

function normalizeTrustedContext(value) {
  if (!isRecord(value)) throw new Error('timer-trusted-context-required');
  const requester = value.requester;
  const writer = value.writer;
  if (!isRecord(requester)) throw new Error('timer-trusted-requester-required');
  if (!isRecord(writer)) throw new Error('timer-trusted-writer-required');

  const normalized = {
    requester: {
      runtimeId: requireText(requester.runtimeId, 'timer-requester-runtime-id'),
      documentToken: requireText(requester.documentToken, 'timer-requester-document-token'),
      tabId: requireSafeCounter(requester.tabId, 'timer-requester-tab-id')
    },
    requesterDisposition: requireText(
      value.requesterDisposition,
      'timer-requester-disposition'
    ).toUpperCase(),
    coordinationEpoch: requireSafeCounter(
      value.coordinationEpoch,
      'timer-coordination-epoch',
      1
    ),
    writer: {
      runtimeId: requireText(writer.runtimeId, 'timer-writer-runtime-id'),
      documentToken: requireText(writer.documentToken, 'timer-writer-document-token'),
      tabId: requireSafeCounter(writer.tabId, 'timer-writer-tab-id'),
      coordinationEpoch: requireSafeCounter(
        writer.coordinationEpoch,
        'timer-writer-coordination-epoch',
        1
      ),
      fencingToken: requireSafeCounter(
        writer.fencingToken,
        'timer-writer-fencing-token',
        1
      )
    }
  };
  if (!['OWNER', 'OBSERVER_CONNECTED'].includes(normalized.requesterDisposition)) {
    throw new Error('timer-requester-disposition-ineligible');
  }
  if (normalized.writer.coordinationEpoch !== normalized.coordinationEpoch) {
    throw new Error('timer-writer-epoch-mismatch');
  }
  const requesterIsWriter = normalized.requester.runtimeId === normalized.writer.runtimeId &&
    normalized.requester.documentToken === normalized.writer.documentToken &&
    normalized.requester.tabId === normalized.writer.tabId;
  if ((normalized.requesterDisposition === 'OWNER') !== requesterIsWriter) {
    throw new Error('timer-requester-writer-disposition-mismatch');
  }
  return Object.freeze({
    requester: Object.freeze(normalized.requester),
    requesterDisposition: normalized.requesterDisposition,
    coordinationEpoch: normalized.coordinationEpoch,
    writer: Object.freeze(normalized.writer)
  });
}

function safeStartAnchor(observation) {
  const certainty = String(observation.boundaryCertainty || 'NONE').toUpperCase();
  if (['NATIVE_CONFIRMED', 'DETECTED'].includes(certainty) &&
      isTimestamp(observation.boundaryAtMs)) {
    return observation.boundaryAtMs;
  }
  if (!isTimestamp(observation.observedAtMs)) throw new Error('timer-safe-start-anchor-unavailable');
  return observation.observedAtMs;
}

function contextHasHistory(document, contextId) {
  const context = document.contexts[contextId];
  if (!context) return false;
  if (Number(context.legacyUnattributedMs) > 0) return true;
  return document.ledger.some(segment => (
    segment.contextId === contextId && segment.durationMs > 0
  ));
}

function latestCycleId(document, contextId) {
  let latest = null;
  for (const segment of document.ledger) {
    if (segment.contextId !== contextId) continue;
    if (!latest || segment.endAtMs > latest.endAtMs ||
        (segment.endAtMs === latest.endAtMs && segment.segmentId > latest.segmentId)) {
      latest = segment;
    }
  }
  return latest?.cycleId || null;
}

function normalizeContext(input) {
  if (!isRecord(input)) throw new Error('timer-observation-context-required');
  const contextId = requireText(input.contextId, 'timer-observation-context-id');
  const kind = requireText(input.kind, 'timer-observation-context-kind').toLowerCase();
  if (!['job', 'general'].includes(kind)) throw new Error('timer-observation-context-kind-invalid');
  let projectId = null;
  if (kind === 'job') {
    projectId = String(input.projectId || '').trim();
    if (!/^[1-9]\d*$/.test(projectId) || contextId !== `job:${projectId}`) {
      throw new Error('timer-observation-job-identity-invalid');
    }
  } else if (contextId !== 'general:production-general') {
    throw new Error('timer-observation-general-identity-invalid');
  }
  const label = requireText(
    input.label || input.currentLabel || input.shortLabel || contextId,
    'timer-observation-context-label'
  );
  const shortLabel = requireText(
    input.shortLabel || input.projectId || label,
    'timer-observation-context-short-label'
  );
  return {
    contextId,
    kind,
    projectId,
    label,
    shortLabel,
    department: typeof input.department === 'string' && input.department.trim()
      ? input.department.trim()
      : null
  };
}

function ensureContext(document, input, atMs) {
  const incoming = normalizeContext(input);
  const existing = document.contexts[incoming.contextId];
  if (!existing) {
    const created = {
      contextId: incoming.contextId,
      kind: incoming.kind,
      projectId: incoming.projectId,
      currentLabel: incoming.label,
      shortLabel: incoming.shortLabel,
      aliases: [],
      createdAtMs: atMs,
      lastSeenAtMs: atMs,
      workspaceMembership: 'RECENT',
      archivedAtMs: null,
      legacyUnattributedMs: 0
    };
    if (incoming.department) created.department = incoming.department;
    document.contexts[incoming.contextId] = created;
    return created;
  }
  if (existing.kind !== incoming.kind ||
      (incoming.kind === 'job' && String(existing.projectId) !== incoming.projectId)) {
    throw new Error('timer-context-identity-conflict');
  }
  if (existing.currentLabel && existing.currentLabel !== incoming.label) {
    existing.aliases = [...new Set([...(existing.aliases || []), existing.currentLabel])];
  }
  existing.currentLabel = incoming.label;
  existing.shortLabel = incoming.shortLabel;
  if (incoming.department) existing.department = incoming.department;
  existing.lastSeenAtMs = Math.max(existing.lastSeenAtMs || 0, atMs);
  existing.workspaceMembership = 'RECENT';
  existing.archivedAtMs = null;
  return existing;
}

function checkpointOwnership(trusted) {
  return {
    ownerRuntimeId: trusted.writer.runtimeId,
    coordinationEpoch: trusted.writer.coordinationEpoch,
    fencingToken: String(trusted.writer.fencingToken),
    disposition: 'OWNER'
  };
}

function checkpointActive(document, active, trusted, atMs, buildVersion, disposition = 'RUNNING') {
  document.checkpoint = createRecoveryCheckpoint({
    runtimeInstanceId: trusted.writer.runtimeId,
    contextId: active.contextId,
    sessionId: active.sessionId,
    cycleId: active.cycleId,
    startedAtMs: active.startedAtMs,
    lastVerifiedAtMs: active.lastVerifiedAtMs,
    ownershipEvidence: checkpointOwnership(trusted),
    checkpointedAtMs: Math.max(atMs, active.lastVerifiedAtMs),
    terminationDisposition: disposition,
    buildVersion
  });
}

function checkpointNonRunning(document, trusted, atMs, buildVersion, disposition) {
  document.checkpoint = createRecoveryCheckpoint({
    runtimeInstanceId: trusted.writer.runtimeId,
    ownershipEvidence: checkpointOwnership(trusted),
    checkpointedAtMs: atMs,
    terminationDisposition: disposition,
    buildVersion
  });
}

function pendingFor(document, contextId, observation, makeId, overrides = {}) {
  const anchor = safeStartAnchor(observation);
  return {
    contextId,
    safeStartAnchorMs: anchor,
    lastContinuityVerifiedAtMs: observation.observedAtMs,
    continuityState: 'VALID',
    detectedAtMs: observation.observedAtMs,
    source: observation.source,
    boundaryCertainty: observation.boundaryCertainty,
    createdAtMs: observation.observedAtMs,
    cycleId: overrides.cycleId || latestCycleId(document, contextId) || makeId('cycle')
  };
}

function activeFor(contextId, anchorMs, observation, trusted, makeId, startCause, cycleId) {
  return {
    contextId,
    sessionId: makeId('session'),
    cycleId: cycleId || makeId('cycle'),
    startedAtMs: anchorMs,
    lastVerifiedAtMs: observation.observedAtMs,
    source: observation.source,
    certainty: observation.stateCertainty,
    accrualOwnerToken: String(trusted.writer.fencingToken),
    startCause,
    safetyHold: null,
    provisionalSinceMs: null
  };
}

function finalizeActive(document, active, requestedEndAtMs, endReason, options = {}) {
  let endAtMs = Math.max(active.startedAtMs, requestedEndAtMs);
  if (active.safetyHold) endAtMs = Math.min(endAtMs, active.safetyHold.holdAtMs);
  const rows = splitInterval({
    sessionId: active.sessionId,
    cycleId: active.cycleId,
    contextId: active.contextId,
    startAtMs: active.startedAtMs,
    endAtMs,
    workdayZone: document.workdayZone,
    startCause: active.startCause,
    endReason,
    source: active.source,
    certainty: options.certainty || active.certainty || 'VERIFIED_SERVER',
    createdAtMs: options.createdAtMs === undefined ? endAtMs : options.createdAtMs,
    provenance: options.provenance || null
  }, {
    makeId: (_sessionId, index) => `${active.sessionId}:segment:${index}`
  });
  document.ledger = dedupeSegments([...document.ledger, ...rows]);
  return { endAtMs, segments: rows };
}

function eventEndBoundary(active, observation, verificationGraceMs) {
  const nativeBoundary = observation.boundaryCertainty === 'NATIVE_CONFIRMED' &&
    isTimestamp(observation.boundaryAtMs);
  let endAtMs;
  if (nativeBoundary) {
    endAtMs = observation.boundaryAtMs;
  } else {
    const detectedAtMs = observation.boundaryCertainty === 'DETECTED' &&
      isTimestamp(observation.boundaryAtMs)
      ? observation.boundaryAtMs
      : observation.observedAtMs;
    endAtMs = detectedAtMs - active.lastVerifiedAtMs <= verificationGraceMs
      ? detectedAtMs
      : active.lastVerifiedAtMs;
  }
  endAtMs = Math.max(active.startedAtMs, endAtMs);
  if (active.safetyHold) endAtMs = Math.min(endAtMs, active.safetyHold.holdAtMs);
  return endAtMs;
}

function normalizeObservation(input, trusted, receiveAtMs, clockSkewMs, lastObservation) {
  if (!isRecord(input)) throw new Error('timer-observation-required');
  const type = requireText(input.type, 'timer-observation-type').toUpperCase();
  if (!OBSERVATION_TYPES.has(type)) throw new Error(`timer-observation-type-unsupported:${type}`);
  const bridgeGeneration = requireSafeCounter(
    input.bridgeGeneration,
    'timer-observation-bridge-generation',
    1
  );
  const bridgeSeq = requireSafeCounter(input.bridgeSeq, 'timer-observation-bridge-seq');
  const observationId = requireText(input.observationId, 'timer-observation-id');
  let observedAtMs = input.observedAtMs;
  if (!isTimestamp(observedAtMs)) throw new Error('timer-observation-time-invalid');
  if (observedAtMs > receiveAtMs + clockSkewMs) throw new Error('timer-observation-time-in-future');
  if (observedAtMs > receiveAtMs) observedAtMs = receiveAtMs;
  const source = requireText(input.source, 'timer-observation-source');
  const stateCertainty = requireText(
    input.stateCertainty,
    'timer-observation-state-certainty'
  ).toUpperCase();
  const boundaryCertainty = String(input.boundaryCertainty || 'NONE').toUpperCase();
  if (!BOUNDARY_CERTAINTIES.has(boundaryCertainty)) {
    throw new Error('timer-observation-boundary-certainty-invalid');
  }
  const boundaryAtMs = input.boundaryAtMs == null ? null : input.boundaryAtMs;
  if (boundaryAtMs !== null && !isTimestamp(boundaryAtMs)) {
    throw new Error('timer-observation-boundary-time-invalid');
  }
  if (boundaryAtMs !== null && boundaryAtMs > observedAtMs) {
    throw new Error('timer-observation-boundary-after-observation');
  }
  if (POSITIVE_TYPES.has(type) && !POSITIVE_CERTAINTIES.has(stateCertainty)) {
    throw new Error('timer-positive-observation-ineligible');
  }
  if (type === 'STATE_UNKNOWN' && stateCertainty !== 'UNKNOWN') {
    throw new Error('timer-unknown-certainty-invalid');
  }
  if (type === 'STATE_CONFLICT' && stateCertainty !== 'CONFLICT') {
    throw new Error('timer-conflict-certainty-invalid');
  }
  if (['CONTEXT_LEFT', 'CLOCKED_OUT'].includes(type) &&
      !POSITIVE_CERTAINTIES.has(stateCertainty)) {
    throw new Error('timer-terminal-observation-ineligible');
  }

  const streamRuntimeId = trusted.requester.runtimeId;
  if (lastObservation) {
    const sameStream = lastObservation.streamRuntimeId === streamRuntimeId;
    if (sameStream) {
      if (bridgeGeneration < lastObservation.bridgeGeneration ||
          (bridgeGeneration === lastObservation.bridgeGeneration &&
           bridgeSeq <= lastObservation.bridgeSeq)) {
        throw new Error('timer-observation-stale-sequence');
      }
    }
    if (observedAtMs < lastObservation.observedAtMs) {
      throw new Error('timer-observation-stale-time');
    }
    if (observationId === lastObservation.observationId) {
      throw new Error('timer-observation-duplicate-id');
    }
  }

  const observation = {
    type,
    bridgeGeneration,
    bridgeSeq,
    observationId,
    observedAtMs,
    source,
    stateCertainty,
    boundaryAtMs,
    boundaryCertainty,
    transitionCandidateId: input.transitionCandidateId == null
      ? null
      : requireText(input.transitionCandidateId, 'timer-transition-candidate-id'),
    verificationId: input.verificationId == null
      ? null
      : requireText(input.verificationId, 'timer-verification-id'),
    streamRuntimeId
  };

  if (POSITIVE_TYPES.has(type)) observation.context = normalizeContext(input.context);
  if (type === 'CONTEXT_CHANGED') {
    observation.priorContextId = requireText(input.priorContextId, 'timer-prior-context-id');
  } else if (['CONTEXT_LEFT', 'CLOCKED_OUT'].includes(type)) {
    observation.priorContextId = input.priorContextId == null
      ? null
      : requireText(input.priorContextId, 'timer-prior-context-id');
  }
  if (isRecord(input.strongUnconfirmedTransition)) {
    const strong = input.strongUnconfirmedTransition;
    const candidateId = requireText(strong.candidateId, 'timer-strong-candidate-id');
    if (strong.nativeAction !== 2 || strong.strength !== 'STRONG_UNCONFIRMED' ||
        strong.resolution !== 'PENDING' || !isTimestamp(strong.boundaryAtMs) ||
        strong.boundaryAtMs > observedAtMs) {
      throw new Error('timer-strong-clock-out-candidate-invalid');
    }
    observation.strongUnconfirmedTransition = {
      candidateId,
      nativeAction: 2,
      boundaryAtMs: strong.boundaryAtMs,
      strength: 'STRONG_UNCONFIRMED',
      resolution: 'PENDING'
    };
  }
  if (isRecord(input.candidateResolution)) {
    const resolution = input.candidateResolution;
    if (resolution.nativeAction !== 2 ||
        !['SPECIFICALLY_DISPROVED', 'POSTSTATE_CONTEXT_WITHOUT_DISPROOF'].includes(resolution.resolution)) {
      throw new Error('timer-candidate-resolution-invalid');
    }
    observation.candidateResolution = {
      candidateId: requireText(resolution.candidateId, 'timer-resolution-candidate-id'),
      nativeAction: 2,
      resolution: resolution.resolution
    };
  }
  return observation;
}

function observationRecord(observation) {
  return {
    type: observation.type,
    contextId: observation.context?.contextId || null,
    priorContextId: observation.priorContextId || null,
    observedAtMs: observation.observedAtMs,
    source: observation.source,
    stateCertainty: observation.stateCertainty,
    boundaryAtMs: observation.boundaryAtMs,
    boundaryCertainty: observation.boundaryCertainty,
    bridgeGeneration: observation.bridgeGeneration,
    bridgeSeq: observation.bridgeSeq,
    observationId: observation.observationId,
    transitionCandidateId: observation.transitionCandidateId,
    verificationId: observation.verificationId,
    streamRuntimeId: observation.streamRuntimeId
  };
}

function createTimerCommandHandler(options = {}) {
  const now = options.now || (() => Date.now());
  const makeId = options.makeId || randomId;
  const verificationGraceMs = options.verificationGraceMs === undefined
    ? DEFAULT_VERIFICATION_GRACE_MS
    : options.verificationGraceMs;
  const clockSkewMs = options.clockSkewMs === undefined
    ? DEFAULT_CLOCK_SKEW_MS
    : options.clockSkewMs;
  const buildVersion = String(options.buildVersion || '0.8.0-b2.2');
  if (!Number.isSafeInteger(verificationGraceMs) || verificationGraceMs < 0) {
    throw new Error('timer-verification-grace-invalid');
  }
  if (!Number.isSafeInteger(clockSkewMs) || clockSkewMs < 0) {
    throw new Error('timer-clock-skew-invalid');
  }
  requireText(buildVersion, 'timer-build-version');

  function receiveTime() {
    const value = now();
    if (!isTimestamp(value)) throw new Error('timer-owner-time-invalid');
    return value;
  }

  function validateCommand(document, command, trusted) {
    if (!isRecord(command)) throw new Error('timer-command-required');
    requireText(command.commandId, 'timer-command-id');
    const type = requireText(command.type, 'timer-command-type');
    if (!Object.values(TIMER_COMMANDS).includes(type)) {
      throw new Error(`timer-command-type-unsupported:${type}`);
    }
    if (!Number.isSafeInteger(command.expectedRevision) ||
        command.expectedRevision !== document.revision) {
      throw new Error('timer-command-stale-revision');
    }
    if (USER_COMMANDS.has(type)) {
      const suppliedOrigin = requireText(command.originRuntimeId, 'timer-command-origin-runtime-id');
      if (suppliedOrigin !== trusted.requester.runtimeId) {
        throw new Error('timer-command-origin-mismatch');
      }
      if (!hasOwn(command, 'contextId')) throw new Error('timer-command-context-required');
      if (!isTimestamp(command.originatedAtMs)) throw new Error('timer-command-originated-at-invalid');
    }
    return type;
  }

  function recordActiveCheckpoint(document, trusted, atMs, disposition) {
    checkpointActive(document, document.timer.active, trusted, atMs, buildVersion, disposition);
  }

  function recordIdleCheckpoint(document, trusted, atMs, disposition) {
    checkpointNonRunning(document, trusted, atMs, buildVersion, disposition);
  }

  function evaluateIncoming(document, observation, trusted, atMs, startCause, cycleId) {
    const context = ensureContext(document, observation.context, observation.observedAtMs);
    const candidate = document.migration?.recoveryCandidates?.localPause;
    if (candidate && candidate.contextId === context.contextId &&
        isTimestamp(candidate.pausedAtMs) && typeof candidate.cycleId === 'string' &&
        candidate.cycleId.trim()) {
      document.timer.active = null;
      document.timer.pending = null;
      document.timer.localPause = {
        contextId: context.contextId,
        cycleId: candidate.cycleId,
        pausedAtMs: candidate.pausedAtMs,
        reason: candidate.reason || 'legacy-local-pause'
      };
      delete document.migration.recoveryCandidates.localPause;
      document.timer.lastReason = 'legacy-local-pause-recovered';
      recordIdleCheckpoint(document, trusted, atMs, 'CLEAN_LOCAL_PAUSE_RECOVERED');
      return { state: 'LOCAL_PAUSED', contextId: context.contextId, recovered: true };
    }
    if (contextHasHistory(document, context.contextId)) {
      document.timer.active = null;
      document.timer.localPause = null;
      document.timer.pending = pendingFor(document, context.contextId, observation, makeId, { cycleId });
      document.timer.lastReason = 'remembered-context-pending';
      recordIdleCheckpoint(document, trusted, atMs, 'CLEAN_PENDING');
      return { state: 'PENDING', contextId: context.contextId };
    }
    document.timer.pending = null;
    document.timer.localPause = null;
    document.timer.active = activeFor(
      context.contextId,
      safeStartAnchor(observation),
      observation,
      trusted,
      makeId,
      startCause,
      cycleId
    );
    document.timer.lastReason = startCause;
    recordActiveCheckpoint(document, trusted, atMs);
    return { state: 'ACTIVE', contextId: context.contextId };
  }

  function finalizeCurrent(document, observation, trusted, atMs, endReason) {
    const active = document.timer.active;
    let finalized = null;
    if (active) {
      finalized = finalizeActive(
        document,
        active,
        eventEndBoundary(active, observation, verificationGraceMs),
        endReason,
        { createdAtMs: atMs }
      );
    }
    document.timer.active = null;
    document.timer.pending = null;
    document.timer.localPause = null;
    return finalized;
  }

  function handlePositive(document, observation, trusted, atMs) {
    const incomingId = observation.context.contextId;
    const currentId = currentContextId(document);
    if (observation.type === 'CONTEXT_CHANGED' && currentId &&
        observation.priorContextId !== currentId && incomingId !== currentId) {
      throw new Error('timer-observation-stale-prior-context');
    }
    if (observation.type === 'CONTEXT_METADATA_UPDATED' && currentId && currentId !== incomingId) {
      throw new Error('timer-metadata-context-mismatch');
    }
    ensureContext(document, observation.context, observation.observedAtMs);

    const active = document.timer.active;
    if (active && active.contextId === incomingId) {
      const hold = active.safetyHold;
      const resolution = observation.candidateResolution;
      const specificDisproof = Boolean(
        hold && hold.reason === 'strong-unconfirmed-clock-out' &&
        resolution?.resolution === 'SPECIFICALLY_DISPROVED' &&
        resolution.candidateId === hold.transitionCandidateId
      );
      if (specificDisproof) {
        active.safetyHold = null;
        active.provisionalSinceMs = null;
        active.lastVerifiedAtMs = observation.observedAtMs;
        active.accrualOwnerToken = String(trusted.writer.fencingToken);
        document.timer.lastReason = 'strong-clock-out-specifically-disproved';
        recordActiveCheckpoint(document, trusted, atMs);
        return { state: 'ACTIVE', contextId: incomingId, holdCleared: true };
      }
      if (hold || observation.observedAtMs - active.lastVerifiedAtMs > verificationGraceMs) {
        const cycleId = active.cycleId;
        const endAtMs = hold ? hold.holdAtMs : active.lastVerifiedAtMs;
        finalizeActive(document, active, endAtMs, 'conservative-end', { createdAtMs: atMs });
        document.timer.active = null;
        return {
          ...evaluateIncoming(document, observation, trusted, atMs, 'recovery-new-period', cycleId),
          longGap: true
        };
      }
      active.lastVerifiedAtMs = Math.max(active.lastVerifiedAtMs, observation.observedAtMs);
      active.provisionalSinceMs = null;
      active.accrualOwnerToken = String(trusted.writer.fencingToken);
      document.timer.lastReason = observation.type === 'CONTEXT_METADATA_UPDATED'
        ? 'context-metadata-updated'
        : 'same-context-verified';
      recordActiveCheckpoint(document, trusted, atMs);
      return { state: 'ACTIVE', contextId: incomingId };
    }

    const pending = document.timer.pending;
    if (pending && pending.contextId === incomingId) {
      const gap = observation.observedAtMs - pending.lastContinuityVerifiedAtMs;
      if (pending.continuityState !== 'VALID' || gap > verificationGraceMs) {
        pending.safeStartAnchorMs = safeStartAnchor(observation);
      }
      pending.lastContinuityVerifiedAtMs = observation.observedAtMs;
      pending.continuityState = 'VALID';
      pending.source = observation.source;
      pending.boundaryCertainty = observation.boundaryCertainty;
      document.timer.lastReason = observation.type === 'CONTEXT_METADATA_UPDATED'
        ? 'pending-metadata-updated'
        : 'pending-continuity-verified';
      recordIdleCheckpoint(document, trusted, atMs, 'CLEAN_PENDING');
      return { state: 'PENDING', contextId: incomingId };
    }

    const localPause = document.timer.localPause;
    if (localPause && localPause.contextId === incomingId) {
      document.timer.lastReason = observation.type === 'CONTEXT_METADATA_UPDATED'
        ? 'local-pause-metadata-updated'
        : 'local-pause-verified';
      recordIdleCheckpoint(document, trusted, atMs, 'CLEAN_LOCAL_PAUSE');
      return { state: 'LOCAL_PAUSED', contextId: incomingId };
    }

    if (observation.type === 'CONTEXT_METADATA_UPDATED' && !currentId) {
      document.timer.lastReason = 'idle-context-metadata-updated';
      return { state: 'IDLE', contextId: null };
    }

    if (currentId && currentId !== incomingId) {
      if (document.timer.active) {
        finalizeActive(
          document,
          document.timer.active,
          eventEndBoundary(document.timer.active, observation, verificationGraceMs),
          'native-context-switch',
          { createdAtMs: atMs }
        );
      }
      document.timer.active = null;
      document.timer.pending = null;
      document.timer.localPause = null;
    }
    return evaluateIncoming(
      document,
      observation,
      trusted,
      atMs,
      observation.type === 'CONTEXT_CHANGED' ? 'native-switch-in' : 'new-context'
    );
  }

  function handleUnknown(document, observation, trusted, atMs) {
    const active = document.timer.active;
    if (active) {
      const strong = observation.strongUnconfirmedTransition;
      if (strong) {
        const proposed = Math.max(active.startedAtMs, strong.boundaryAtMs);
        const holdAtMs = active.safetyHold
          ? Math.min(active.safetyHold.holdAtMs, proposed)
          : proposed;
        active.safetyHold = {
          holdAtMs,
          reason: 'strong-unconfirmed-clock-out',
          transitionCandidateId: strong.candidateId,
          createdAtMs: observation.observedAtMs,
          revision: document.revision + 1
        };
        active.provisionalSinceMs = active.provisionalSinceMs || observation.observedAtMs;
        document.timer.lastReason = 'strong-clock-out-safety-hold';
        recordActiveCheckpoint(document, trusted, atMs);
        return { state: 'ACTIVE', held: true, provisional: true, holdAtMs };
      }
      if (active.provisionalSinceMs == null) active.provisionalSinceMs = observation.observedAtMs;
      if (observation.observedAtMs - active.lastVerifiedAtMs > verificationGraceMs &&
          !active.safetyHold) {
        active.safetyHold = {
          holdAtMs: active.lastVerifiedAtMs,
          reason: observation.type === 'STATE_CONFLICT' ? 'state-conflict' : 'verification-gap',
          transitionCandidateId: observation.transitionCandidateId,
          createdAtMs: observation.observedAtMs,
          revision: document.revision + 1
        };
      }
      document.timer.lastReason = active.safetyHold
        ? 'verification-safety-hold'
        : 'verification-provisional';
      recordActiveCheckpoint(document, trusted, atMs);
      return {
        state: 'ACTIVE',
        held: Boolean(active.safetyHold),
        provisional: true,
        holdAtMs: active.safetyHold?.holdAtMs || null
      };
    }
    if (document.timer.pending) {
      const pending = document.timer.pending;
      pending.continuityState = observation.observedAtMs - pending.lastContinuityVerifiedAtMs > verificationGraceMs
        ? 'BROKEN'
        : 'UNKNOWN';
      document.timer.lastReason = `pending-continuity-${pending.continuityState.toLowerCase()}`;
      recordIdleCheckpoint(document, trusted, atMs, 'CLEAN_PENDING');
      return { state: 'PENDING', contextId: pending.contextId, continuityState: pending.continuityState };
    }
    document.timer.lastReason = 'bridge-state-unknown';
    return { state: document.timer.localPause ? 'LOCAL_PAUSED' : 'IDLE', contextId: currentContextId(document) };
  }

  function acceptObservation(document, input, trusted, atMs) {
    const observation = normalizeObservation(
      input,
      trusted,
      atMs,
      clockSkewMs,
      document.timer.lastObservation || null
    );
    document.timer.lastObservation = observationRecord(observation);
    if (['CONTEXT_DETECTED', 'CONTEXT_CHANGED'].includes(observation.type)) {
      document.timer.lastFocusTransition = observationRecord(observation);
    }

    if (POSITIVE_TYPES.has(observation.type)) {
      return handlePositive(document, observation, trusted, atMs);
    }
    if (['CONTEXT_LEFT', 'CLOCKED_OUT'].includes(observation.type)) {
      const stateContextId = currentContextId(document);
      if (stateContextId && observation.priorContextId !== stateContextId) {
        throw new Error('timer-terminal-observation-stale-context');
      }
      finalizeCurrent(
        document,
        observation,
        trusted,
        atMs,
        observation.type === 'CLOCKED_OUT' ? 'native-clock-out' : 'native-context-left'
      );
      document.timer.lastReason = observation.type === 'CLOCKED_OUT'
        ? 'native-clock-out'
        : 'native-context-left';
      recordIdleCheckpoint(
        document,
        trusted,
        atMs,
        observation.type === 'CLOCKED_OUT'
          ? 'CLEAN_NATIVE_CLOCK_OUT'
          : 'CLEAN_NATIVE_CONTEXT_LEFT'
      );
      return { state: 'IDLE', contextId: null };
    }
    return handleUnknown(document, observation, trusted, atMs);
  }

  function validatedActionTime(command, stateRecord, atMs) {
    let actionAtMs = command.originatedAtMs;
    if (actionAtMs > atMs + clockSkewMs) throw new Error('timer-command-time-in-future');
    if (actionAtMs > atMs) actionAtMs = atMs;
    const minimum = stateRecord?.startedAtMs ??
      stateRecord?.pausedAtMs ??
      stateRecord?.safeStartAnchorMs ??
      null;
    if (minimum !== null && actionAtMs < minimum) {
      throw new Error('timer-command-time-before-state');
    }
    return actionAtMs;
  }

  function requireExpectedContext(document, command) {
    if (command.contextId !== currentContextId(document)) {
      throw new Error('timer-command-stale-context');
    }
  }

  function requireExpectedSession(active, command) {
    if (!active || typeof command.expectedSessionId !== 'string' ||
        command.expectedSessionId !== active.sessionId) {
      throw new Error('timer-command-stale-session');
    }
  }

  function hasFreshPositiveSupport(document, contextId, atMs) {
    const observation = document.timer.lastObservation;
    return Boolean(
      observation && POSITIVE_TYPES.has(observation.type) &&
      POSITIVE_CERTAINTIES.has(observation.stateCertainty) &&
      observation.contextId === contextId &&
      atMs >= observation.observedAtMs &&
      atMs - observation.observedAtMs <= verificationGraceMs
    );
  }

  function handleUserCommand(document, command, type, trusted, atMs) {
    requireExpectedContext(document, command);
    const record = document.timer.active || document.timer.localPause || document.timer.pending;
    const actionAtMs = validatedActionTime(command, record, atMs);

    if (type === TIMER_COMMANDS.RESUME || type === TIMER_COMMANDS.START_FRESH) {
      const pending = document.timer.pending;
      if (!pending || pending.contextId !== command.contextId) {
        throw new Error('timer-command-stale-pending');
      }
      if (pending.continuityState !== 'VALID' ||
          atMs - pending.lastContinuityVerifiedAtMs > verificationGraceMs ||
          !hasFreshPositiveSupport(document, pending.contextId, atMs)) {
        throw new Error('timer-pending-not-currently-verified');
      }
      const startFresh = type === TIMER_COMMANDS.START_FRESH;
      const cycleId = startFresh ? makeId('cycle') : pending.cycleId || makeId('cycle');
      const observation = {
        observedAtMs: pending.lastContinuityVerifiedAtMs,
        source: pending.source,
        stateCertainty: document.timer.lastObservation.stateCertainty
      };
      document.timer.active = activeFor(
        pending.contextId,
        pending.safeStartAnchorMs,
        observation,
        trusted,
        makeId,
        startFresh ? 'start-fresh' : 'resume',
        cycleId
      );
      document.timer.pending = null;
      document.timer.lastReason = startFresh ? 'start-fresh' : 'resume';
      recordActiveCheckpoint(document, trusted, atMs);
      return { state: 'ACTIVE', contextId: document.timer.active.contextId };
    }

    if (type === TIMER_COMMANDS.LOCAL_PAUSE) {
      const active = document.timer.active;
      requireExpectedSession(active, command);
      const finalized = finalizeActive(document, active, actionAtMs, 'local-pause', {
        createdAtMs: atMs,
        provenance: {
          commandId: command.commandId,
          originRuntimeId: trusted.requester.runtimeId,
          originatedAtMs: command.originatedAtMs
        }
      });
      document.timer.active = null;
      document.timer.localPause = {
        contextId: active.contextId,
        cycleId: active.cycleId,
        pausedAtMs: actionAtMs,
        accrualEndedAtMs: finalized.endAtMs,
        reason: 'local-pause'
      };
      document.timer.lastReason = 'local-pause';
      recordIdleCheckpoint(document, trusted, atMs, 'CLEAN_LOCAL_PAUSE');
      return { state: 'LOCAL_PAUSED', contextId: active.contextId };
    }

    if (type === TIMER_COMMANDS.LOCAL_RESUME) {
      const localPause = document.timer.localPause;
      if (!localPause || localPause.contextId !== command.contextId) {
        throw new Error('timer-command-stale-local-pause');
      }
      if (!hasFreshPositiveSupport(document, localPause.contextId, atMs)) {
        throw new Error('timer-local-resume-not-currently-verified');
      }
      document.timer.active = activeFor(
        localPause.contextId,
        actionAtMs,
        {
          observedAtMs: actionAtMs,
          source: 'local-command',
          stateCertainty: document.timer.lastObservation.stateCertainty
        },
        trusted,
        makeId,
        'local-resume',
        localPause.cycleId
      );
      document.timer.localPause = null;
      document.timer.lastReason = 'local-resume';
      recordActiveCheckpoint(document, trusted, atMs);
      return { state: 'ACTIVE', contextId: document.timer.active.contextId };
    }

    if (type === TIMER_COMMANDS.COMPANION_DISABLE) {
      if (document.timer.active) {
        requireExpectedSession(document.timer.active, command);
        finalizeActive(document, document.timer.active, actionAtMs, 'companion-disabled', {
          createdAtMs: atMs,
          provenance: {
            commandId: command.commandId,
            originRuntimeId: trusted.requester.runtimeId,
            originatedAtMs: command.originatedAtMs
          }
        });
      }
      document.timer.active = null;
      document.timer.pending = null;
      document.timer.localPause = null;
      document.timer.lastReason = 'companion-disabled';
      recordIdleCheckpoint(document, trusted, atMs, 'USER_DISABLED_CLEAN');
      return { state: 'IDLE', contextId: null };
    }
    throw new Error(`timer-user-command-unsupported:${type}`);
  }

  function controlledTeardown(document, command, trusted, atMs) {
    const active = document.timer.active;
    if (active) {
      if (command.contextId !== active.contextId ||
          command.expectedSessionId !== active.sessionId) {
        throw new Error('timer-controlled-teardown-state-mismatch');
      }
      recordActiveCheckpoint(document, trusted, atMs, 'CONTROLLED_RELOAD');
      document.timer.lastReason = 'controlled-reload-checkpointed';
      return { state: 'ACTIVE', contextId: active.contextId, finalized: false };
    }
    recordIdleCheckpoint(document, trusted, atMs, 'CLEAN_NON_RUNNING');
    document.timer.lastReason = 'controlled-teardown-non-running';
    return { state: currentState(document), contextId: currentContextId(document), finalized: false };
  }

  function recoverInterruption(document, command, trusted, atMs) {
    const observation = normalizeObservation(
      command.observation,
      trusted,
      atMs,
      clockSkewMs,
      document.timer.lastObservation || null
    );
    if (!POSITIVE_TYPES.has(observation.type) &&
        !['CONTEXT_LEFT', 'CLOCKED_OUT'].includes(observation.type)) {
      throw new Error('timer-recovery-positive-or-terminal-observation-required');
    }
    if (document.timer.active) {
      const active = document.timer.active;
      finalizeActive(document, active, active.lastVerifiedAtMs, 'conservative-end', {
        createdAtMs: atMs,
        certainty: 'VERIFIED_RECOVERY'
      });
      document.timer.active = null;
    }
    document.timer.pending = null;
    document.timer.localPause = null;
    document.timer.lastObservation = observationRecord(observation);
    if (POSITIVE_TYPES.has(observation.type)) {
      return evaluateIncoming(
        document,
        observation,
        trusted,
        atMs,
        'recovery-new-period'
      );
    }
    document.timer.lastReason = 'recovery-no-current-context';
    recordIdleCheckpoint(document, trusted, atMs, 'CLEAN_NON_RUNNING');
    return { state: 'IDLE', contextId: null };
  }

  return function applyTimerCommand(document, command, trustedContext) {
    validateDocument(document);
    const trusted = normalizeTrustedContext(trustedContext);
    const type = validateCommand(document, command, trusted);
    const atMs = receiveTime();
    let result;
    if (type === TIMER_COMMANDS.ACCEPT_OBSERVATION) {
      result = acceptObservation(document, command.observation, trusted, atMs);
    } else if (USER_COMMANDS.has(type)) {
      result = handleUserCommand(document, command, type, trusted, atMs);
    } else if (type === TIMER_COMMANDS.RECONCILE_OWNERSHIP) {
      if (!isRecord(command.observation)) throw new Error('timer-reconcile-observation-required');
      const priorToken = document.timer.active?.accrualOwnerToken || null;
      result = acceptObservation(document, command.observation, trusted, atMs);
      result = {
        ...result,
        ownershipChanged: priorToken !== null &&
          priorToken !== document.timer.active?.accrualOwnerToken
      };
    } else if (type === TIMER_COMMANDS.CONTROLLED_TEARDOWN) {
      result = controlledTeardown(document, command, trusted, atMs);
    } else if (type === TIMER_COMMANDS.RECOVER_INTERRUPTION) {
      result = recoverInterruption(document, command, trusted, atMs);
    }
    validateDocument(document);
    return Object.freeze({
      ...result,
      commandType: type,
      originRuntimeId: trusted.requester.runtimeId
    });
  };
}

module.exports = {
  DEFAULT_VERIFICATION_GRACE_MS,
  DEFAULT_CLOCK_SKEW_MS,
  TIMER_COMMANDS,
  OBSERVATION_TYPES,
  POSITIVE_CERTAINTIES,
  safeStartAnchor,
  contextHasHistory,
  ensureContext,
  finalizeActive,
  createTimerCommandHandler
};
