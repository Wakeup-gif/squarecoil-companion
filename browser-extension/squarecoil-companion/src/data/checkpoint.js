'use strict';

const {
  CHECKPOINT_CLEAN_TERMINATION_DISPOSITIONS,
  deepClone,
  deepFreeze,
  isRecord,
  isNonNegativeInteger,
  isTimestamp,
  isCleanCheckpointDisposition,
  validateCheckpointOwnershipEvidence
} = require('./model');
const { splitInterval } = require('./ledger');

const CHECKPOINT_SCHEMA_VERSION = 1;
const CLEAN_TERMINATION_DISPOSITIONS = new Set(CHECKPOINT_CLEAN_TERMINATION_DISPOSITIONS);

function requireText(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('checkpoint-' + name + '-required');
  }
  return value.trim();
}

function optionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalToken(value) {
  if (value === null || value === undefined) return null;
  const token = String(value).trim();
  return token || null;
}

function normalizeOwnershipEvidence(input) {
  const source = isRecord(input) ? input : {};
  const normalized = {
    ownerRuntimeId: optionalText(source.ownerRuntimeId),
    coordinationEpoch: isNonNegativeInteger(source.coordinationEpoch)
      ? source.coordinationEpoch
      : null,
    fencingToken: optionalToken(source.fencingToken),
    disposition: (optionalText(source.disposition) || 'UNKNOWN').toUpperCase()
  };
  return normalized;
}

function validateRecoveryCheckpoint(checkpoint) {
  if (!isRecord(checkpoint)) throw new Error('checkpoint-invalid');
  if (checkpoint.schemaVersion !== CHECKPOINT_SCHEMA_VERSION) {
    throw new Error('checkpoint-schema-unsupported');
  }

  requireText(checkpoint.runtimeInstanceId, 'runtime-instance-id');
  requireText(checkpoint.buildVersion, 'build-version');
  requireText(checkpoint.terminationDisposition, 'termination-disposition');
  if (!isTimestamp(checkpoint.checkpointedAtMs)) {
    throw new Error('checkpoint-time-invalid');
  }
  if (!isRecord(checkpoint.ownershipEvidence)) {
    throw new Error('checkpoint-ownership-evidence-invalid');
  }

  const timingFields = [
    checkpoint.contextId,
    checkpoint.sessionId,
    checkpoint.cycleId,
    checkpoint.startedAtMs,
    checkpoint.lastVerifiedAtMs
  ];
  const hasTimingEvidence = timingFields.some(value => value !== null && value !== undefined);

  if (hasTimingEvidence) {
    requireText(checkpoint.contextId, 'context-id');
    requireText(checkpoint.sessionId, 'session-id');
    requireText(checkpoint.cycleId, 'cycle-id');
    if (!isTimestamp(checkpoint.startedAtMs)) {
      throw new Error('checkpoint-start-invalid');
    }
    if (!isTimestamp(checkpoint.lastVerifiedAtMs)) {
      throw new Error('checkpoint-verification-invalid');
    }
    if (checkpoint.lastVerifiedAtMs < checkpoint.startedAtMs) {
      throw new Error('checkpoint-verification-before-start');
    }
    if (checkpoint.checkpointedAtMs < checkpoint.lastVerifiedAtMs) {
      throw new Error('checkpoint-before-verification');
    }
  }

  const disposition = checkpoint.terminationDisposition.toUpperCase();
  if (/^CLEAN(?:_|$)/.test(disposition) && !isCleanCheckpointDisposition(disposition)) {
    throw new Error('checkpoint-clean-disposition-unsupported');
  }
  validateCheckpointOwnershipEvidence(checkpoint.ownershipEvidence, {
    hasTimingEvidence,
    source: checkpoint.source || 'companion'
  });

  return true;
}

function createRecoveryCheckpoint(input, options = {}) {
  if (!isRecord(input)) throw new Error('checkpoint-input-invalid');
  const checkpointedAtMs = options.checkpointedAtMs === undefined
    ? input.checkpointedAtMs
    : options.checkpointedAtMs;
  if (!isTimestamp(checkpointedAtMs)) throw new Error('checkpoint-time-invalid');

  const checkpoint = {
    schemaVersion: CHECKPOINT_SCHEMA_VERSION,
    runtimeInstanceId: requireText(input.runtimeInstanceId, 'runtime-instance-id'),
    contextId: optionalText(input.contextId),
    sessionId: optionalText(input.sessionId),
    cycleId: optionalText(input.cycleId),
    startedAtMs: input.startedAtMs === undefined ? null : input.startedAtMs,
    lastVerifiedAtMs: input.lastVerifiedAtMs === undefined ? null : input.lastVerifiedAtMs,
    ownershipEvidence: normalizeOwnershipEvidence(
      input.ownershipEvidence || {
        ownerRuntimeId: input.ownerRuntimeId,
        coordinationEpoch: input.coordinationEpoch,
        fencingToken: input.fencingToken,
        disposition: input.ownershipDisposition
      }
    ),
    checkpointedAtMs,
    terminationDisposition: requireText(
      input.terminationDisposition,
      'termination-disposition'
    ),
    buildVersion: requireText(input.buildVersion, 'build-version'),
    source: optionalText(input.source) || 'companion'
  };

  validateRecoveryCheckpoint(checkpoint);
  return deepFreeze(checkpoint);
}

function isCleanTermination(checkpoint) {
  validateRecoveryCheckpoint(checkpoint);
  const disposition = checkpoint.terminationDisposition.toUpperCase();
  return CLEAN_TERMINATION_DISPOSITIONS.has(disposition);
}

function markCheckpointClean(checkpoint, options = {}) {
  validateRecoveryCheckpoint(checkpoint);
  const clean = deepClone(checkpoint);
  const checkpointedAtMs = options.checkpointedAtMs === undefined
    ? clean.checkpointedAtMs
    : options.checkpointedAtMs;
  if (!isTimestamp(checkpointedAtMs)) throw new Error('checkpoint-time-invalid');
  if (clean.lastVerifiedAtMs !== null && checkpointedAtMs < clean.lastVerifiedAtMs) {
    throw new Error('checkpoint-before-verification');
  }
  clean.checkpointedAtMs = checkpointedAtMs;
  const requestedDisposition = (optionalText(options.terminationDisposition) || 'CLEAN_TEARDOWN').toUpperCase();
  if (!CLEAN_TERMINATION_DISPOSITIONS.has(requestedDisposition)) {
    throw new Error('checkpoint-clean-disposition-unsupported');
  }
  clean.terminationDisposition = requestedDisposition;
  validateRecoveryCheckpoint(clean);
  return deepFreeze(clean);
}

function checkpointToRecoveryEvidence(checkpoint) {
  validateRecoveryCheckpoint(checkpoint);
  const hasVerifiedInterval = Boolean(
    checkpoint.contextId &&
    checkpoint.lastVerifiedAtMs > checkpoint.startedAtMs
  );
  const unknownGap = checkpoint.contextId && checkpoint.checkpointedAtMs > checkpoint.lastVerifiedAtMs
    ? {
        startAtMs: checkpoint.lastVerifiedAtMs,
        endAtMs: checkpoint.checkpointedAtMs,
        durationMs: checkpoint.checkpointedAtMs - checkpoint.lastVerifiedAtMs
      }
    : null;

  return deepFreeze({
    kind: 'RECOVERY_CHECKPOINT',
    live: false,
    cleanTermination: isCleanTermination(checkpoint),
    contextId: checkpoint.contextId,
    sessionId: checkpoint.sessionId,
    cycleId: checkpoint.cycleId,
    verifiedInterval: hasVerifiedInterval
      ? {
          startAtMs: checkpoint.startedAtMs,
          endAtMs: checkpoint.lastVerifiedAtMs,
          durationMs: checkpoint.lastVerifiedAtMs - checkpoint.startedAtMs
        }
      : null,
    unknownGap,
    checkpoint: deepClone(checkpoint)
  });
}

function defaultSegmentId(checkpoint, index) {
  return [
    'recovery',
    checkpoint.contextId,
    checkpoint.sessionId,
    checkpoint.startedAtMs,
    checkpoint.lastVerifiedAtMs,
    index
  ].join(':');
}

function recoverVerifiedSegments(checkpoint, options = {}) {
  validateRecoveryCheckpoint(checkpoint);
  if (isCleanTermination(checkpoint) || !checkpoint.contextId) return [];
  if (checkpoint.lastVerifiedAtMs <= checkpoint.startedAtMs) return [];

  const workdayZone = String(options.workdayZone || '');
  const createdAtMs = options.createdAtMs === undefined
    ? checkpoint.checkpointedAtMs
    : options.createdAtMs;
  if (!isTimestamp(createdAtMs)) throw new Error('checkpoint-created-at-invalid');
  const makeId = typeof options.makeId === 'function'
    ? options.makeId
    : (_sessionId, index) => defaultSegmentId(checkpoint, index);

  return splitInterval({
    sessionId: checkpoint.sessionId,
    cycleId: checkpoint.cycleId,
    contextId: checkpoint.contextId,
    startAtMs: checkpoint.startedAtMs,
    endAtMs: checkpoint.lastVerifiedAtMs,
    workdayZone,
    startCause: 'recovery-checkpoint',
    endReason: 'last-verified-boundary',
    source: checkpoint.source || 'recovery-checkpoint',
    certainty: 'VERIFIED_RECOVERY',
    createdAtMs,
    provenance: {
      kind: 'recovery-checkpoint',
      runtimeInstanceId: checkpoint.runtimeInstanceId,
      checkpointedAtMs: checkpoint.checkpointedAtMs,
      terminationDisposition: checkpoint.terminationDisposition
    }
  }, { makeId });
}

module.exports = {
  CHECKPOINT_SCHEMA_VERSION,
  CLEAN_TERMINATION_DISPOSITIONS,
  validateRecoveryCheckpoint,
  createRecoveryCheckpoint,
  isCleanTermination,
  markCheckpointClean,
  checkpointToRecoveryEvidence,
  recoverVerifiedSegments
};
