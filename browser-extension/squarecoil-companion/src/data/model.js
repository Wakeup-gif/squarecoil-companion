'use strict';

const {
  MIGRATION_SCHEMA_VERSION,
  V07_MIGRATION_MARKER_ID,
  V07_MIGRATION_VERSION,
  V07_MIGRATION_SOURCE_SCHEMA,
  LEGACY_SOURCE_KEYS
} = require('./migration-schema');

const DATA_SCHEMA_VERSION = 1;
const TIMER_STATES = Object.freeze({
  IDLE: 'IDLE',
  ACTIVE: 'ACTIVE',
  PENDING: 'PENDING',
  LOCAL_PAUSED: 'LOCAL_PAUSED'
});
const CHECKPOINT_CLEAN_TERMINATION_DISPOSITIONS = Object.freeze([
  'CLEAN',
  'CLEAN_TEARDOWN',
  'TEARDOWN_COMPLETE',
  'USER_DISABLED_CLEAN',
  'CLEAN_NON_RUNNING',
  'CLEAN_PENDING',
  'CLEAN_PENDING_AFTER_HOLD',
  'CLEAN_LOCAL_PAUSE',
  'CLEAN_LOCAL_PAUSE_RECOVERED',
  'CLEAN_NATIVE_CLOCK_OUT',
  'CLEAN_NATIVE_CONTEXT_LEFT'
]);
const CHECKPOINT_OWNERSHIP_DISPOSITIONS = Object.freeze([
  'OWNER',
  'OBSERVER_CONNECTED',
  'RELEASED',
  'UNAVAILABLE_LEGACY',
  'UNKNOWN'
]);
const WORKDAY_ZONE_SOURCES = Object.freeze([
  'PERSISTED',
  'CONFIGURED',
  'RUNTIME',
  'UTC_FALLBACK'
]);
const MAX_DATE_TIMESTAMP_MS = 8_640_000_000_000_000;
const MAX_COMMAND_RECEIPTS = 4096;
const DATA_SAFETY_SCHEMA_VERSION = 1;
const DATA_ACTIVITY_LIMIT = 500;

function deepClone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isFiniteInteger(value) {
  return Number.isSafeInteger(value);
}

function isTimestamp(value) {
  return isNonNegativeInteger(value) && value <= MAX_DATE_TIMESTAMP_MS;
}

function isNonNegativeInteger(value) {
  return isFiniteInteger(value) && value >= 0;
}

function requireText(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(name + ' is required');
  return value;
}

function assertWorkdayZone(value) {
  const zone = requireText(value, 'workdayZone');
  if (/^[+-]\d{2}:\d{2}$/.test(zone)) {
    throw new Error('workday-zone-offset-only:' + zone);
  }
  try {
    const resolved = new Intl.DateTimeFormat('en', { timeZone: zone })
      .resolvedOptions().timeZone;
    if (!resolved) throw new Error('missing resolved zone');
    return resolved;
  } catch (_) {
    throw new Error('workday-zone-invalid:' + zone);
  }
}

function assertLocalDate(value, name = 'localDate') {
  const localDate = requireText(value, name);
  const match = localDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error('local-date-invalid:' + localDate);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > monthDays[month - 1]) {
    throw new Error('local-date-invalid:' + localDate);
  }
  return localDate;
}

function localDateForValidation(timestampMs, workdayZone) {
  if (!isTimestamp(timestampMs)) throw new Error('timestamp-invalid');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: assertWorkdayZone(workdayZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(timestampMs));
  const values = {};
  for (const part of parts) if (part.type !== 'literal') values[part.type] = part.value;
  return `${values.year}-${values.month}-${values.day}`;
}

function isCleanCheckpointDisposition(value) {
  return CHECKPOINT_CLEAN_TERMINATION_DISPOSITIONS.includes(String(value || '').toUpperCase());
}

function validateCheckpointOwnershipEvidence(evidence, options = {}) {
  if (!isRecord(evidence)) throw new Error('checkpoint-ownership-invalid');
  const disposition = requireText(evidence.disposition, 'checkpoint.ownershipEvidence.disposition').toUpperCase();
  if (!CHECKPOINT_OWNERSHIP_DISPOSITIONS.includes(disposition)) {
    throw new Error('checkpoint-ownership-disposition-invalid');
  }
  const ownerRuntimeId = evidence.ownerRuntimeId == null ? null : requireText(evidence.ownerRuntimeId, 'checkpoint.ownerRuntimeId');
  const coordinationEpoch = evidence.coordinationEpoch == null ? null : evidence.coordinationEpoch;
  const fencingToken = evidence.fencingToken == null ? null : requireText(String(evidence.fencingToken), 'checkpoint.fencingToken');
  const tupleComplete = Boolean(ownerRuntimeId && isNonNegativeInteger(coordinationEpoch) && fencingToken);
  const tupleEmpty = ownerRuntimeId === null && coordinationEpoch === null && fencingToken === null;

  if (disposition === 'OWNER' && !tupleComplete) throw new Error('checkpoint-owner-evidence-incomplete');
  if (disposition === 'OBSERVER_CONNECTED' && !tupleComplete) {
    throw new Error('checkpoint-observer-evidence-incomplete');
  }
  if (['UNKNOWN', 'UNAVAILABLE_LEGACY', 'RELEASED'].includes(disposition) && !tupleEmpty) {
    throw new Error('checkpoint-owner-evidence-unexpected');
  }
  if (disposition === 'UNAVAILABLE_LEGACY' && options.source !== 'v07-migration') {
    throw new Error('checkpoint-legacy-ownership-source-invalid');
  }
  if (options.hasTimingEvidence && !['OWNER', 'UNAVAILABLE_LEGACY'].includes(disposition)) {
    throw new Error('checkpoint-timing-owner-unproven');
  }
  return true;
}

function timerKind(timer) {
  if (!isRecord(timer)) throw new Error('timer-state-invalid');
  for (const key of ['active', 'pending', 'localPause']) {
    if (timer[key] !== null && timer[key] !== undefined && !isRecord(timer[key])) {
      throw new Error('timer-state-record-invalid:' + key);
    }
  }
  const count = [timer.active, timer.pending, timer.localPause]
    .filter(value => value !== null && value !== undefined).length;
  if (count > 1) throw new Error('timer-state-mutual-exclusivity');
  if (timer && timer.active) return TIMER_STATES.ACTIVE;
  if (timer && timer.pending) return TIMER_STATES.PENDING;
  if (timer && timer.localPause) return TIMER_STATES.LOCAL_PAUSED;
  return TIMER_STATES.IDLE;
}

function validateContext(context, key) {
  if (!isRecord(context)) throw new Error('invalid-context:' + key);
  requireText(context.contextId, 'contextId:' + key);
  if (context.contextId !== key) throw new Error('context-key-mismatch:' + key);
  if (!['job', 'general'].includes(context.kind)) throw new Error('invalid-context-kind:' + key);
  if (context.kind === 'job') {
    requireText(String(context.projectId || ''), 'projectId:' + key);
    if (!/^[1-9]\d*$/.test(String(context.projectId))) throw new Error('invalid-project-id:' + key);
  }
  if (!isNonNegativeInteger(context.legacyUnattributedMs ?? 0)) {
    throw new Error('invalid-legacy-balance:' + key);
  }
  if (context.createdAtMs !== undefined && !isTimestamp(context.createdAtMs)) {
    throw new Error('invalid-context-created-at:' + key);
  }
  if (context.lastSeenAtMs !== undefined && !isTimestamp(context.lastSeenAtMs)) {
    throw new Error('invalid-context-last-seen-at:' + key);
  }
  if (context.archivedAtMs !== null && context.archivedAtMs !== undefined && !isTimestamp(context.archivedAtMs)) {
    throw new Error('invalid-context-archived-at:' + key);
  }
  if (context.aliases !== undefined && (!Array.isArray(context.aliases) || context.aliases.some(alias => typeof alias !== 'string'))) {
    throw new Error('invalid-context-aliases:' + key);
  }
}

function validateActive(active, contexts) {
  requireText(active.contextId, 'active.contextId');
  requireText(active.sessionId, 'active.sessionId');
  requireText(active.cycleId, 'active.cycleId');
  requireText(active.accrualOwnerToken, 'active.accrualOwnerToken');
  if (!contexts[active.contextId]) throw new Error('active-context-missing');
  if (!isTimestamp(active.startedAtMs)) throw new Error('active-start-invalid');
  if (!isTimestamp(active.lastVerifiedAtMs)) throw new Error('active-verification-invalid');
  if (active.lastVerifiedAtMs < active.startedAtMs) throw new Error('active-verification-before-start');
  if (active.safetyHold) {
    if (!isTimestamp(active.safetyHold.holdAtMs)) throw new Error('safety-hold-invalid');
    if (active.safetyHold.holdAtMs < active.startedAtMs) throw new Error('safety-hold-before-start');
    requireText(active.safetyHold.reason, 'safetyHold.reason');
  }
}

function validatePending(pending, contexts) {
  requireText(pending.contextId, 'pending.contextId');
  if (!contexts[pending.contextId]) throw new Error('pending-context-missing');
  if (!isTimestamp(pending.safeStartAnchorMs)) throw new Error('pending-anchor-invalid');
  if (!isTimestamp(pending.lastContinuityVerifiedAtMs)) {
    throw new Error('pending-continuity-verification-invalid');
  }
  if (!['VALID', 'BROKEN', 'UNKNOWN'].includes(pending.continuityState)) {
    throw new Error('pending-continuity-state-invalid');
  }
}

function validateLocalPause(localPause, contexts) {
  requireText(localPause.contextId, 'localPause.contextId');
  requireText(localPause.cycleId, 'localPause.cycleId');
  if (!contexts[localPause.contextId]) throw new Error('local-pause-context-missing');
  if (!isTimestamp(localPause.pausedAtMs)) throw new Error('local-pause-time-invalid');
}

function validateSegment(segment) {
  if (!isRecord(segment)) throw new Error('invalid-ledger-segment');
  for (const field of ['segmentId', 'sessionId', 'cycleId', 'contextId', 'localDate', 'workdayZone']) {
    requireText(segment[field], 'segment.' + field);
  }
  if (!isTimestamp(segment.startAtMs) || !isTimestamp(segment.endAtMs)) {
    throw new Error('segment-time-invalid:' + segment.segmentId);
  }
  if (segment.endAtMs < segment.startAtMs) throw new Error('segment-reversed:' + segment.segmentId);
  if (!isNonNegativeInteger(segment.durationMs) || segment.durationMs !== segment.endAtMs - segment.startAtMs) {
    throw new Error('segment-duration-mismatch:' + segment.segmentId);
  }
  const workdayZone = assertWorkdayZone(segment.workdayZone);
  const localDate = assertLocalDate(segment.localDate, 'segment.localDate');
  if (localDateForValidation(segment.startAtMs, workdayZone) !== localDate) {
    throw new Error('segment-local-date-mismatch:' + segment.segmentId);
  }
  if (segment.endAtMs > segment.startAtMs &&
      localDateForValidation(segment.endAtMs - 1, workdayZone) !== localDate) {
    throw new Error('segment-crosses-workday:' + segment.segmentId);
  }
  if (segment.createdAtMs !== undefined && !isTimestamp(segment.createdAtMs)) {
    throw new Error('segment-created-at-invalid:' + segment.segmentId);
  }
}

function validateCheckpoint(checkpoint) {
  if (checkpoint === null) return;
  if (!isRecord(checkpoint) || checkpoint.schemaVersion !== 1) {
    throw new Error('checkpoint-invalid');
  }
  requireText(checkpoint.runtimeInstanceId, 'checkpoint.runtimeInstanceId');
  const terminationDisposition = requireText(checkpoint.terminationDisposition, 'checkpoint.terminationDisposition').toUpperCase();
  if (/^CLEAN(?:_|$)/.test(terminationDisposition) && !isCleanCheckpointDisposition(terminationDisposition)) {
    throw new Error('checkpoint-clean-disposition-unsupported');
  }
  requireText(checkpoint.buildVersion, 'checkpoint.buildVersion');
  if (!isTimestamp(checkpoint.checkpointedAtMs)) {
    throw new Error('checkpoint-time-invalid');
  }
  const timingValues = [
    checkpoint.contextId,
    checkpoint.sessionId,
    checkpoint.cycleId,
    checkpoint.startedAtMs,
    checkpoint.lastVerifiedAtMs
  ];
  if (timingValues.some(value => value !== null && value !== undefined)) {
    requireText(checkpoint.contextId, 'checkpoint.contextId');
    requireText(checkpoint.sessionId, 'checkpoint.sessionId');
    requireText(checkpoint.cycleId, 'checkpoint.cycleId');
    if (!isTimestamp(checkpoint.startedAtMs) ||
        !isTimestamp(checkpoint.lastVerifiedAtMs) ||
        checkpoint.lastVerifiedAtMs < checkpoint.startedAtMs ||
        checkpoint.checkpointedAtMs < checkpoint.lastVerifiedAtMs) {
      throw new Error('checkpoint-timing-invalid');
    }
  }
  validateCheckpointOwnershipEvidence(checkpoint.ownershipEvidence, {
    hasTimingEvidence: timingValues.some(value => value !== null && value !== undefined),
    source: checkpoint.source || 'companion'
  });
}

function validateCommitFence(document) {
  if (document.revision === 0) {
    if (document.commitFence !== null && document.commitFence !== undefined) {
      throw new Error('data-initial-commit-fence-invalid');
    }
    if (document.commitId !== null && document.commitId !== undefined) {
      throw new Error('data-initial-commit-id-invalid');
    }
    return;
  }
  requireText(document.commitId, 'commitId');
  if (!isRecord(document.commitFence)) throw new Error('data-commit-fence-missing');
  requireText(document.commitFence.ownerRuntimeId, 'commitFence.ownerRuntimeId');
  if (!Number.isSafeInteger(document.commitFence.coordinationEpoch) || document.commitFence.coordinationEpoch < 1) {
    throw new Error('data-commit-fence-epoch-invalid');
  }
  if (!Number.isSafeInteger(document.commitFence.fencingToken) || document.commitFence.fencingToken < 1) {
    throw new Error('data-commit-fence-token-invalid');
  }
}

function validateCommandReceipts(document) {
  if (!isRecord(document.commandReceipts)) throw new Error('command-receipts-invalid');
  if (!Array.isArray(document.commandReceiptOrder)) throw new Error('command-receipt-order-invalid');
  const receiptIds = Object.keys(document.commandReceipts);
  if (receiptIds.length > MAX_COMMAND_RECEIPTS || document.commandReceiptOrder.length > MAX_COMMAND_RECEIPTS) {
    throw new Error('command-receipt-limit-exceeded');
  }
  const seenReceipts = new Set();
  for (const commandId of document.commandReceiptOrder) {
    requireText(commandId, 'commandReceiptOrder.commandId');
    if (seenReceipts.has(commandId)) throw new Error('command-receipt-order-duplicate:' + commandId);
    if (!Object.prototype.hasOwnProperty.call(document.commandReceipts, commandId)) {
      throw new Error('command-receipt-order-orphan:' + commandId);
    }
    const receipt = document.commandReceipts[commandId];
    if (!isRecord(receipt) || receipt.commandId !== commandId) {
      throw new Error('command-receipt-invalid:' + commandId);
    }
    requireText(receipt.requestFingerprint, 'commandReceipt.requestFingerprint');
    requireText(receipt.commitId, 'commandReceipt.commitId');
    if (!Number.isSafeInteger(receipt.revision) || receipt.revision < 1 || receipt.revision > document.revision) {
      throw new Error('command-receipt-revision-invalid:' + commandId);
    }
    if (!isTimestamp(receipt.committedAtMs) || receipt.committedAtMs > document.updatedAtMs) {
      throw new Error('command-receipt-time-invalid:' + commandId);
    }
    seenReceipts.add(commandId);
  }
  if (receiptIds.length !== document.commandReceiptOrder.length) {
    throw new Error('command-receipt-index-mismatch');
  }
}

function validateMigrationMetadata(migration) {
  if (!isRecord(migration) || migration.schemaVersion !== MIGRATION_SCHEMA_VERSION) {
    throw new Error('migration-schema-invalid');
  }
  const migrationKeys = Object.keys(migration).sort();
  const allowedMigrationKeys = ['completedSources', 'diagnostics', 'recoveryCandidates', 'schemaVersion'];
  if (migrationKeys.some(key => !allowedMigrationKeys.includes(key))) {
    throw new Error('migration-metadata-field-unsupported');
  }
  if (!isRecord(migration.completedSources) || !Array.isArray(migration.diagnostics)) {
    throw new Error('migration-metadata-invalid');
  }
  if (migration.recoveryCandidates !== undefined && !isRecord(migration.recoveryCandidates)) {
    throw new Error('migration-recovery-candidates-invalid');
  }

  const requiredMarkerKeys = [
    'completedAtMs',
    'completionState',
    'markerId',
    'migrationVersion',
    'sourceChecksum',
    'sourceIdentity',
    'sourceSchema'
  ];
  const optionalMarkerKeys = ['activitySourceChecksum', 'authoritySourceChecksums'];
  const allowedSourceKeys = new Set(Object.values(LEGACY_SOURCE_KEYS));
  for (const [sourceId, marker] of Object.entries(migration.completedSources)) {
    if (sourceId !== V07_MIGRATION_MARKER_ID || !isRecord(marker)) {
      throw new Error('migration-completed-source-unsupported:' + sourceId);
    }
    const actualMarkerKeys = Object.keys(marker);
    if (requiredMarkerKeys.some(key => !actualMarkerKeys.includes(key)) ||
        actualMarkerKeys.some(key => !requiredMarkerKeys.includes(key) && !optionalMarkerKeys.includes(key))) {
      throw new Error('migration-marker-fields-invalid:' + sourceId);
    }
    if (marker.markerId !== sourceId ||
        marker.migrationVersion !== V07_MIGRATION_VERSION ||
        marker.sourceSchema !== V07_MIGRATION_SOURCE_SCHEMA ||
        marker.completionState !== 'COMPLETE' ||
        !isTimestamp(marker.completedAtMs)) {
      throw new Error('migration-marker-invalid:' + sourceId);
    }
    const sourceIdentity = requireText(marker.sourceIdentity, 'migration.sourceIdentity');
    const sourceParts = sourceIdentity.split('+');
    if (sourceParts.length === 0 ||
        new Set(sourceParts).size !== sourceParts.length ||
        sourceParts.some(key => !allowedSourceKeys.has(key)) ||
        sourceParts.slice().sort().join('+') !== sourceIdentity) {
      throw new Error('migration-source-identity-invalid:' + sourceId);
    }
    const checksumMatch = /^fnv1a32:[0-9a-f]{8}:(\d+)$/.exec(String(marker.sourceChecksum || ''));
    if (!checksumMatch || !Number.isSafeInteger(Number(checksumMatch[1]))) {
      throw new Error('migration-source-checksum-invalid:' + sourceId);
    }
    if (marker.authoritySourceChecksums !== undefined) {
      const checksums = marker.authoritySourceChecksums;
      const authorityKeys = [LEGACY_SOURCE_KEYS.CURRENT, LEGACY_SOURCE_KEYS.ARCHIVE].sort();
      if (!isRecord(checksums) ||
          JSON.stringify(Object.keys(checksums).sort()) !== JSON.stringify(authorityKeys) ||
          Object.values(checksums).some(value => !/^fnv1a32:[0-9a-f]{8}:\d+$/.test(String(value)))) {
        throw new Error('migration-authority-source-checksums-invalid:' + sourceId);
      }
    }
    if (marker.activitySourceChecksum !== undefined &&
        !/^fnv1a32:[0-9a-f]{8}:\d+$/.test(String(marker.activitySourceChecksum))) {
      throw new Error('migration-activity-source-checksum-invalid:' + sourceId);
    }
  }

  for (const diagnostic of migration.diagnostics) {
    if (!isRecord(diagnostic)) throw new Error('migration-diagnostic-invalid');
    requireText(diagnostic.code, 'migration.diagnostic.code');
    if (diagnostic.migrationMarkerId !== undefined &&
        diagnostic.migrationMarkerId !== V07_MIGRATION_MARKER_ID) {
      throw new Error('migration-diagnostic-marker-invalid');
    }
  }
}

function validateDataSafety(dataSafety, contexts) {
  // B2/B3 documents created before the B4 upgrade do not contain this layer.
  // B4 normalizes it inside the first fenced data command, so absence remains
  // a valid upgrade state while a present layer is always validated strictly.
  if (dataSafety === undefined) return true;
  if (!isRecord(dataSafety) || dataSafety.schemaVersion !== DATA_SAFETY_SCHEMA_VERSION) {
    throw new Error('data-safety-schema-invalid');
  }
  requireText(dataSafety.datasetId, 'dataSafety.datasetId');
  if (!isRecord(dataSafety.workspace) || !Array.isArray(dataSafety.workspace.order) ||
      !Array.isArray(dataSafety.workspace.hiddenContextIds)) {
    throw new Error('data-safety-workspace-invalid');
  }
  for (const [name, values] of [
    ['order', dataSafety.workspace.order],
    ['hiddenContextIds', dataSafety.workspace.hiddenContextIds]
  ]) {
    if (values.some(value => typeof value !== 'string' || !value.trim()) || new Set(values).size !== values.length) {
      throw new Error(`data-safety-workspace-${name}-invalid`);
    }
  }
  if (!isRecord(dataSafety.preferences)) throw new Error('data-safety-preferences-invalid');
  if (dataSafety.preferences.preferencesSchemaVersion !== undefined) {
    const preferences = dataSafety.preferences;
    if (![1, 2].includes(preferences.preferencesSchemaVersion) || !isNonNegativeInteger(preferences.preferenceRevision)) {
      throw new Error('preferences-schema-invalid');
    }
    if (!['LIGHT', 'DARK', 'AUTO'].includes(preferences.timerAppearance) ||
        !['SOLID', 'GLASS'].includes(preferences.panelFinish) ||
        !['ORIGINAL', 'LIGHT_GLASS', 'REFINED_LIGHT', 'SLEEK_DARK'].includes(preferences.websiteTheme)) {
      throw new Error('preferences-appearance-invalid');
    }
    if (preferences.dashboardEnabled !== undefined && typeof preferences.dashboardEnabled !== 'boolean') {
      throw new Error('preferences-dashboard-invalid');
    }
    if (preferences.dashboardProfile !== undefined && !['OFF', 'ON'].includes(preferences.dashboardProfile)) {
      throw new Error('preferences-dashboard-profile-invalid');
    }
    if (preferences.dashboardAppearance !== undefined && !['SITE', 'LIGHT', 'DARK'].includes(preferences.dashboardAppearance)) {
      throw new Error('preferences-dashboard-appearance-invalid');
    }
    if (preferences.preferencesSchemaVersion >= 2 &&
        !['NONE', 'CINEMATIC'].includes(preferences.cinematicBackground)) {
      throw new Error('preferences-optional-presentation-invalid');
    }
    if (!isFiniteInteger(preferences.yellowMinutes) || !isFiniteInteger(preferences.orangeMinutes) ||
        !isFiniteInteger(preferences.redMinutes) || preferences.yellowMinutes < 1 ||
        preferences.yellowMinutes > preferences.orangeMinutes || preferences.orangeMinutes > preferences.redMinutes) {
      throw new Error('preferences-limits-invalid');
    }
  }
  if (!Array.isArray(dataSafety.activityLog) || dataSafety.activityLog.length > DATA_ACTIVITY_LIMIT) {
    throw new Error('data-safety-activity-invalid');
  }
  for (const entry of dataSafety.activityLog) {
    if (!isRecord(entry)) throw new Error('data-safety-activity-entry-invalid');
    requireText(entry.eventId, 'dataSafety.activity.eventId');
    requireText(entry.type, 'dataSafety.activity.type');
    if (!isTimestamp(entry.atMs)) throw new Error('data-safety-activity-time-invalid');
  }
  if (!isRecord(dataSafety.legacyBalanceLineages)) {
    throw new Error('data-safety-legacy-lineages-invalid');
  }
  for (const [contextId, lineage] of Object.entries(dataSafety.legacyBalanceLineages)) {
    if (!contexts[contextId] || !isRecord(lineage)) {
      throw new Error('data-safety-legacy-lineage-context-invalid:' + contextId);
    }
    requireText(lineage.lineageId, 'dataSafety.legacyLineage.lineageId');
    if (!isNonNegativeInteger(lineage.durationMs) ||
        lineage.durationMs !== Math.max(0, Number(contexts[contextId].legacyUnattributedMs) || 0)) {
      throw new Error('data-safety-legacy-lineage-duration-invalid:' + contextId);
    }
  }
  if (dataSafety.lastMutation !== null) {
    if (!isRecord(dataSafety.lastMutation)) throw new Error('data-safety-last-mutation-invalid');
    requireText(dataSafety.lastMutation.operationId, 'dataSafety.lastMutation.operationId');
    requireText(dataSafety.lastMutation.type, 'dataSafety.lastMutation.type');
    if (!isTimestamp(dataSafety.lastMutation.committedAtMs)) {
      throw new Error('data-safety-last-mutation-time-invalid');
    }
  }
  return true;
}

function validateDocument(document) {
  if (!isRecord(document)) throw new Error('data-document-invalid');
  if (document.schemaVersion !== DATA_SCHEMA_VERSION) throw new Error('data-schema-unsupported');
  if (!isNonNegativeInteger(document.revision)) throw new Error('data-revision-invalid');
  if (!isTimestamp(document.updatedAtMs)) throw new Error('data-updated-at-invalid');
  const workdayZone = assertWorkdayZone(document.workdayZone);
  if (!isRecord(document.workdayZoneDisposition) ||
      typeof document.workdayZoneDisposition.source !== 'string' ||
      typeof document.workdayZoneDisposition.fallback !== 'boolean') {
    throw new Error('workday-zone-disposition-invalid');
  }
  const disposition = document.workdayZoneDisposition;
  if (!WORKDAY_ZONE_SOURCES.includes(disposition.source)) {
    throw new Error('workday-zone-disposition-source-invalid');
  }
  if (disposition.fallback) {
    if (workdayZone !== 'UTC' || disposition.source !== 'UTC_FALLBACK' ||
        typeof disposition.diagnostic !== 'string' || !disposition.diagnostic.trim()) {
      throw new Error('workday-zone-fallback-disposition-invalid');
    }
  } else if (disposition.source === 'UTC_FALLBACK') {
    throw new Error('workday-zone-fallback-flag-missing');
  }
  if (!isRecord(document.timer) || !isRecord(document.contexts) || !Array.isArray(document.ledger)) {
    throw new Error('data-layers-invalid');
  }

  const kind = timerKind(document.timer);
  for (const [key, context] of Object.entries(document.contexts)) validateContext(context, key);
  const segmentIds = new Set();
  const materialIntervals = new Set();
  for (const segment of document.ledger) {
    validateSegment(segment);
    if (!document.contexts[segment.contextId]) throw new Error('segment-context-missing:' + segment.segmentId);
    if (segmentIds.has(segment.segmentId)) throw new Error('duplicate-segment-id:' + segment.segmentId);
    segmentIds.add(segment.segmentId);
    const materialInterval = [segment.contextId, segment.startAtMs, segment.endAtMs, segment.durationMs].join('|');
    if (materialIntervals.has(materialInterval)) {
      throw new Error('duplicate-segment-interval:' + segment.segmentId);
    }
    materialIntervals.add(materialInterval);
  }

  if (kind === TIMER_STATES.ACTIVE) {
    validateActive(document.timer.active, document.contexts);
    if (document.ledger.some(segment => segment.sessionId === document.timer.active.sessionId)) {
      throw new Error('active-session-already-finalized:' + document.timer.active.sessionId);
    }
  }
  if (kind === TIMER_STATES.PENDING) validatePending(document.timer.pending, document.contexts);
  if (kind === TIMER_STATES.LOCAL_PAUSED) validateLocalPause(document.timer.localPause, document.contexts);
  validateCheckpoint(document.checkpoint);
  validateMigrationMetadata(document.migration);
  validateDataSafety(document.dataSafety, document.contexts);
  validateCommandReceipts(document);
  validateCommitFence(document);
  return true;
}

function createEmptyDocument(options = {}) {
  const nowMs = options.nowMs === undefined ? Date.now() : options.nowMs;
  if (!isTimestamp(nowMs)) throw new Error('data-initial-time-invalid');
  const configuredZone = Object.prototype.hasOwnProperty.call(options, 'workdayZone');
  const workdayZone = configuredZone ? assertWorkdayZone(options.workdayZone) : 'UTC';
  const fallback = configuredZone ? options.workdayZoneFallback === true : true;
  const source = configuredZone
    ? options.workdayZoneSource || (fallback ? 'UTC_FALLBACK' : 'CONFIGURED')
    : 'UTC_FALLBACK';
  const diagnostic = configuredZone
    ? options.workdayZoneDiagnostic || (fallback ? 'configured-iana-zone-unavailable' : null)
    : 'workday-zone-unavailable';
  const document = {
    schemaVersion: DATA_SCHEMA_VERSION,
    revision: 0,
    commitId: null,
    commitFence: null,
    updatedAtMs: nowMs,
    workdayZone,
    workdayZoneDisposition: {
      source,
      fallback,
      diagnostic
    },
    timer: {
      active: null,
      pending: null,
      localPause: null,
      lastFocusTransition: null,
      lastReason: 'initialized'
    },
    ledger: [],
    contexts: {},
    checkpoint: null,
    migration: {
      schemaVersion: 1,
      completedSources: {},
      diagnostics: []
    },
    dataSafety: {
      schemaVersion: DATA_SAFETY_SCHEMA_VERSION,
      datasetId: String(options.datasetId || `dataset-${nowMs}`),
      workspace: { order: [], hiddenContextIds: [] },
      preferences: {},
      activityLog: [],
      legacyBalanceLineages: {},
      lastMutation: null
    },
    commandReceipts: {},
    commandReceiptOrder: []
  };
  validateDocument(document);
  return document;
}

module.exports = {
  DATA_SCHEMA_VERSION,
  TIMER_STATES,
  CHECKPOINT_CLEAN_TERMINATION_DISPOSITIONS,
  CHECKPOINT_OWNERSHIP_DISPOSITIONS,
  WORKDAY_ZONE_SOURCES,
  DATA_SAFETY_SCHEMA_VERSION,
  DATA_ACTIVITY_LIMIT,
  MAX_COMMAND_RECEIPTS,
  deepClone,
  deepFreeze,
  isRecord,
  isFiniteInteger,
  isNonNegativeInteger,
  isTimestamp,
  assertWorkdayZone,
  assertLocalDate,
  isCleanCheckpointDisposition,
  validateCheckpointOwnershipEvidence,
  timerKind,
  validateSegment,
  validateCheckpoint,
  validateCommandReceipts,
  validateMigrationMetadata,
  validateDataSafety,
  validateDocument,
  createEmptyDocument
};
