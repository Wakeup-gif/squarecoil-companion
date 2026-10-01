'use strict';

const {
  DATA_SAFETY_SCHEMA_VERSION,
  DATA_ACTIVITY_LIMIT,
  deepClone,
  deepFreeze,
  isRecord,
  isTimestamp,
  assertWorkdayZone,
  assertLocalDate,
  timerKind,
  isCleanCheckpointDisposition,
  validateSegment,
  validateMigrationMetadata,
  validateDocument
} = require('./model');
const {
  splitInterval,
  intervalFingerprint,
  virtualActiveSegments,
  createQueryService
} = require('./ledger');
const { restoredPreferenceStorage } = require('../preferences/preferences');

const BACKUP_FORMAT = 'squarecoil-companion-backup';
const BACKUP_SCHEMA_VERSION = 1;
const HISTORY_CSV_SCHEMA = 'squarecoil-companion-history-csv-v1';
const LEGACY_HISTORY_CSV_SCHEMA = 'squarecoil-job-timer-csv-v1';
const REPORT_CSV_SCHEMA = 'squarecoil-companion-time-report-v1';
const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const MAX_RECORDS = 50_000;
const MAX_STRING_LENGTH = 8_192;
const MAX_STRUCTURE_DEPTH = 20;

const DATA_COMMANDS = Object.freeze({
  ARCHIVE_CONTEXT: 'DATA_ARCHIVE_CONTEXT',
  ARCHIVE_ELIGIBLE: 'DATA_ARCHIVE_ELIGIBLE',
  RESTORE_ARCHIVED: 'DATA_RESTORE_ARCHIVED',
  CLEAR_RECENT: 'DATA_CLEAR_RECENT',
  DELETE_CONTEXT: 'DATA_DELETE_CONTEXT',
  DELETE_ALL_ARCHIVED: 'DATA_DELETE_ALL_ARCHIVED',
  WIPE_HISTORY: 'DATA_WIPE_HISTORY',
  RESTORE_BACKUP: 'DATA_RESTORE_BACKUP',
  IMPORT_HISTORY_CSV: 'DATA_IMPORT_HISTORY_CSV'
});

const RESTORE_MODES = Object.freeze({ MERGE: 'MERGE', REPLACE: 'REPLACE' });
const DATA_COMMAND_TYPES = new Set(Object.values(DATA_COMMANDS));
const FORMULA_PREFIX = /^['=+\-@]/;

function requireText(value, code) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(code);
  if (text.length > MAX_STRING_LENGTH) throw new Error('external-string-limit-exceeded');
  return text;
}

function nonNegativeInteger(value, code) {
  const number = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value;
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(code);
  return number;
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  const bytes = new TextEncoder().encode(String(value));
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function byteLength(value) {
  return new TextEncoder().encode(String(value)).length;
}

function assertResourceShape(value, depth = 0, seen = new WeakSet()) {
  if (depth > MAX_STRUCTURE_DEPTH) throw new Error('external-structure-depth-exceeded');
  if (typeof value === 'string' && value.length > MAX_STRING_LENGTH) {
    throw new Error('external-string-limit-exceeded');
  }
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) throw new Error('external-structure-cycle');
  seen.add(value);
  const children = Array.isArray(value) ? value : Object.values(value);
  if (children.length > MAX_RECORDS) throw new Error('external-record-limit-exceeded');
  for (const child of children) assertResourceShape(child, depth + 1, seen);
  seen.delete(value);
}

function makeIdFactory(seed) {
  let serial = 0;
  return prefix => `${prefix}-${fnv1a(`${seed}:${prefix}:${serial++}`)}`;
}

function readableDocument(source) {
  const document = deepClone(source);
  if (!document?.authorityView?.redacted) return document;
  if (document.authorityView.schemaVersion !== 1) throw new Error('data-safety-authority-view-unsupported');
  delete document.authorityView;
  document.commandReceipts = {};
  document.commandReceiptOrder = [];
  if (document.revision > 0) {
    document.commitFence = { ownerRuntimeId: 'redacted-authority-owner', coordinationEpoch: 1, fencingToken: 1 };
  }
  if (document.timer?.active) {
    if (document.timer.active.accrualOwnershipBound !== true) throw new Error('data-safety-active-ownership-unproven');
    delete document.timer.active.accrualOwnershipBound;
    document.timer.active.accrualOwnerToken = 'redacted-authority-owner';
  }
  if (document.checkpoint?.ownershipEvidence) {
    const evidence = document.checkpoint.ownershipEvidence;
    const disposition = String(evidence.disposition || '').toUpperCase();
    if (['OWNER', 'OBSERVER_CONNECTED'].includes(disposition)) {
      if (evidence.ownershipBound !== true) throw new Error('data-safety-checkpoint-ownership-unproven');
      document.checkpoint.ownershipEvidence = { ownerRuntimeId: 'redacted-authority-owner', coordinationEpoch: 1,
        fencingToken: 'redacted-authority-fence', disposition };
    } else {
      document.checkpoint.ownershipEvidence = { ownerRuntimeId: null, coordinationEpoch: null, fencingToken: null, disposition };
    }
  }
  return document;
}

function normalizeWorkspace(value, contexts) {
  const source = isRecord(value) ? value : {};
  function list(name) {
    const result = [];
    for (const item of Array.isArray(source[name]) ? source[name] : []) {
      const contextId = String(item || '').trim();
      if (contextId && contexts[contextId] && !result.includes(contextId)) result.push(contextId);
    }
    return result;
  }
  return { order: list('order'), hiddenContextIds: list('hiddenContextIds') };
}

function sanitizePreferences(value) {
  if (!isRecord(value)) return {};
  assertResourceShape(value);
  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(key)) continue;
    if (entry === null || ['string', 'boolean', 'number'].includes(typeof entry) ||
        (Array.isArray(entry) && entry.length <= 100 && entry.every(item => ['string', 'boolean', 'number'].includes(typeof item)))) {
      result[key] = deepClone(entry);
    }
  }
  return result;
}

function ensureDataSafety(document, options = {}) {
  const nowMs = isTimestamp(options.nowMs) ? options.nowMs : Date.now();
  if (!isRecord(document.dataSafety)) {
    document.dataSafety = {
      schemaVersion: DATA_SAFETY_SCHEMA_VERSION,
      datasetId: String(options.datasetId || `dataset-${fnv1a(`${document.updatedAtMs}:${Object.keys(document.contexts || {}).sort().join('|')}`)}`),
      workspace: { order: [], hiddenContextIds: [] },
      preferences: {},
      activityLog: [],
      legacyBalanceLineages: {},
      lastMutation: null
    };
  }
  const data = document.dataSafety;
  if (data.schemaVersion !== DATA_SAFETY_SCHEMA_VERSION) throw new Error('data-safety-schema-unsupported');
  data.datasetId = requireText(data.datasetId, 'data-safety-dataset-id-required');
  data.workspace = normalizeWorkspace(data.workspace, document.contexts || {});
  data.preferences = sanitizePreferences(data.preferences);
  if (!Array.isArray(data.activityLog)) data.activityLog = [];
  if (!isRecord(data.legacyBalanceLineages)) data.legacyBalanceLineages = {};
  for (const [contextId, context] of Object.entries(document.contexts || {})) {
    const durationMs = Math.max(0, Number(context.legacyUnattributedMs) || 0);
    if (durationMs > 0 && !isRecord(data.legacyBalanceLineages[contextId])) {
      data.legacyBalanceLineages[contextId] = {
        lineageId: `dataset:${data.datasetId}:context:${contextId}`,
        durationMs
      };
    }
    if (durationMs === 0) delete data.legacyBalanceLineages[contextId];
  }
  for (const contextId of Object.keys(data.legacyBalanceLineages)) {
    if (!document.contexts?.[contextId]) delete data.legacyBalanceLineages[contextId];
  }
  if (data.lastMutation === undefined) data.lastMutation = null;
  void nowMs;
  return data;
}

function mergeWorkspaceState(document, workspace, preferences) {
  const data = ensureDataSafety(document);
  if (isRecord(workspace)) data.workspace = normalizeWorkspace(workspace, document.contexts || {});
  if (isRecord(preferences)) data.preferences = sanitizePreferences(preferences);
}

function currentNativeContextId(document) {
  const observation = document.timer?.lastObservation;
  if (!observation || ['CONTEXT_LEFT', 'CLOCKED_OUT', 'STATE_UNKNOWN', 'STATE_CONFLICT'].includes(observation.type)) return null;
  return typeof observation.contextId === 'string' ? observation.contextId : null;
}

function unresolvedRecoveryContextIds(document) {
  const knownContextIds = new Set(Object.keys(document.contexts || {}).map(String));
  const result = new Set();
  const checkpoint = document.checkpoint;
  const checkpointId = checkpoint?.contextId;
  if (typeof checkpointId === 'string' && knownContextIds.has(checkpointId) &&
      !isCleanCheckpointDisposition(checkpoint?.terminationDisposition)) {
    result.add(checkpointId);
  }
  const candidates = document.migration?.recoveryCandidates;
  if (isRecord(candidates)) {
    const records = [candidates, ...Object.values(candidates)].filter(isRecord);
    for (const candidate of records) {
      const contextId = candidate.contextId;
      if (typeof contextId === 'string' && knownContextIds.has(contextId)) result.add(contextId);
    }
  }
  return result;
}

function protectedContextIds(document) {
  return new Set([
    document.timer?.active?.contextId,
    document.timer?.pending?.contextId,
    document.timer?.localPause?.contextId,
    currentNativeContextId(document),
    ...unresolvedRecoveryContextIds(document)
  ].filter(Boolean).map(String));
}

function unresolvedRecovery(document) {
  const checkpoint = document.checkpoint;
  const checkpointTiming = checkpoint && !isCleanCheckpointDisposition(checkpoint.terminationDisposition) && [
    checkpoint.contextId,
    checkpoint.sessionId,
    checkpoint.cycleId,
    checkpoint.startedAtMs,
    checkpoint.lastVerifiedAtMs
  ].some(value => value !== null && value !== undefined);
  const candidates = document.migration?.recoveryCandidates;
  return Boolean(checkpointTiming || (isRecord(candidates) && Object.keys(candidates).length));
}

function isQuiescent(document) {
  return timerKind(document.timer) === 'IDLE' && !document.timer?.active?.safetyHold && !unresolvedRecovery(document);
}

function contextTotal(document, contextId) {
  const query = createQueryService(() => document, { now: () => document.updatedAtMs });
  return query.getContextTotal(contextId, document.updatedAtMs);
}

function createDataSafetyReadModel(document) {
  const normalized = readableDocument(document);
  validateDocument(normalized);
  ensureDataSafety(normalized);
  const protectedIds = protectedContextIds(normalized);
  const rows = Object.values(normalized.contexts).map(context => ({
    contextId: context.contextId,
    kind: context.kind,
    projectId: context.projectId || null,
    label: String(context.currentLabel || context.shortLabel || context.contextId),
    shortLabel: String(context.shortLabel || context.projectId || 'General'),
    workspaceMembership: context.workspaceMembership || 'INACTIVE_NON_RECENT',
    archivedAtMs: context.archivedAtMs ?? null,
    lastSeenAtMs: context.lastSeenAtMs ?? null,
    totalMs: contextTotal(normalized, context.contextId),
    protected: protectedIds.has(context.contextId)
  }));
  const archivedRows = rows.filter(row => row.workspaceMembership === 'ARCHIVED' || row.archivedAtMs !== null)
    .sort((a, b) => (b.archivedAtMs || 0) - (a.archivedAtMs || 0) || a.contextId.localeCompare(b.contextId));
  const recentRows = rows.filter(row => row.workspaceMembership === 'RECENT' && row.archivedAtMs == null)
    .sort((a, b) => (b.lastSeenAtMs || 0) - (a.lastSeenAtMs || 0) || a.contextId.localeCompare(b.contextId));
  return deepFreeze({
    revision: normalized.revision,
    datasetId: normalized.dataSafety.datasetId,
    quiescent: isQuiescent(normalized),
    archivedRows,
    recentRows,
    workspace: deepClone(normalized.dataSafety.workspace),
    preferences: deepClone(normalized.dataSafety.preferences),
    lastMutation: deepClone(normalized.dataSafety.lastMutation)
  });
}

function spreadsheetSafeText(value) {
  const text = String(value ?? '');
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function reverseSpreadsheetEscape(value) {
  const text = String(value ?? '');
  return text.startsWith("'") && FORMULA_PREFIX.test(text.slice(1)) ? text.slice(1) : text;
}

function csvCell(value, userControlled = false) {
  const text = userControlled ? spreadsheetSafeText(value) : String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseCsv(text) {
  const source = String(text ?? '').replace(/^\uFEFF/, '');
  if (byteLength(source) > MAX_INPUT_BYTES) throw new Error('external-file-size-limit-exceeded');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') {
      if (field) throw new Error('csv-quote-invalid');
      quoted = true;
    } else if (character === ',') { row.push(field); field = ''; }
    else if (character === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += character;
    if (field.length > MAX_STRING_LENGTH) throw new Error('external-string-limit-exceeded');
  }
  if (quoted) throw new Error('csv-unclosed-quote');
  if (field.length || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  if (rows.length > MAX_RECORDS + 1) throw new Error('external-record-limit-exceeded');
  return rows.filter(values => values.some(value => String(value).length));
}

function contextForExport(context) {
  const result = deepClone(context);
  delete result.legacyUnattributedMs;
  return result;
}

function recoveryEvidenceForBackup(document) {
  const checkpoint = document.checkpoint;
  if (!checkpoint || !checkpoint.contextId || !checkpoint.sessionId || !checkpoint.cycleId ||
      !isTimestamp(checkpoint.startedAtMs) || !isTimestamp(checkpoint.lastVerifiedAtMs) ||
      checkpoint.lastVerifiedAtMs < checkpoint.startedAtMs) return [];
  return [{
    disposition: 'NON_LIVE_RECOVERY_EVIDENCE',
    contextId: checkpoint.contextId,
    sessionId: checkpoint.sessionId,
    cycleId: checkpoint.cycleId,
    startedAtMs: checkpoint.startedAtMs,
    lastVerifiedAtMs: checkpoint.lastVerifiedAtMs,
    checkpointedAtMs: checkpoint.checkpointedAtMs,
    source: checkpoint.source || 'companion-checkpoint',
    provenance: 'full-backup-recovery-evidence'
  }];
}

function createFullBackup(document, options = {}) {
  const snapshot = readableDocument(document);
  validateDocument(snapshot);
  ensureDataSafety(snapshot);
  mergeWorkspaceState(snapshot, options.workspace, options.preferences);
  const contexts = Object.values(snapshot.contexts).sort((a, b) => a.contextId.localeCompare(b.contextId)).map(contextForExport);
  const ledgerSegments = snapshot.ledger.slice().sort((a, b) => a.startAtMs - b.startAtMs || a.segmentId.localeCompare(b.segmentId));
  const legacyBalances = Object.values(snapshot.contexts).filter(context => Number(context.legacyUnattributedMs) > 0).map(context => ({
    contextId: context.contextId,
    durationMs: context.legacyUnattributedMs,
    lineageId: snapshot.dataSafety.legacyBalanceLineages[context.contextId]?.lineageId ||
      `dataset:${snapshot.dataSafety.datasetId}:context:${context.contextId}`,
    provenance: 'full-backup'
  }));
  const recoveryEvidence = recoveryEvidenceForBackup(snapshot);
  const activityLog = options.includeActivity === false ? [] : deepClone(snapshot.dataSafety.activityLog);
  const envelope = {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    backupId: requireText(options.backupId || `backup-${fnv1a(`${snapshot.dataSafety.datasetId}:${snapshot.revision}:${options.exportedAtMs ?? Date.now()}`)}`, 'backup-id-required'),
    exportedAtMs: isTimestamp(options.exportedAtMs) ? options.exportedAtMs : Date.now(),
    appVersion: String(options.appVersion || 'unknown'),
    sourcePlatform: String(options.sourcePlatform || 'browser-extension'),
    sourceDatasetId: snapshot.dataSafety.datasetId,
    snapshotRevision: snapshot.revision,
    recordCounts: {
      contexts: contexts.length,
      ledgerSegments: ledgerSegments.length,
      legacyBalances: legacyBalances.length,
      activityLog: activityLog.length,
      recoveryEvidence: recoveryEvidence.length
    },
    workdayZone: snapshot.workdayZone,
    workdayZoneDisposition: deepClone(snapshot.workdayZoneDisposition),
    contexts,
    ledgerSegments,
    legacyBalances,
    workspace: {
      ...deepClone(snapshot.dataSafety.workspace),
      memberships: Object.fromEntries(Object.values(snapshot.contexts).map(context => [context.contextId, {
        workspaceMembership: context.workspaceMembership || 'INACTIVE_NON_RECENT',
        archivedAtMs: context.archivedAtMs ?? null
      }]))
    },
    preferences: deepClone(snapshot.dataSafety.preferences),
    migrationMetadata: deepClone(snapshot.migration),
    activityLog,
    recoveryEvidence
  };
  assertResourceShape(envelope);
  // The downloaded JSON uses this exact compact encoding. Reject before offering
  // a file that the bounded importer cannot read back in this version.
  if (byteLength(`${JSON.stringify(envelope)}\n`) > MAX_INPUT_BYTES) {
    throw new Error('backup-export-size-limit-exceeded');
  }
  return deepFreeze(envelope);
}

function createHistoryCsv(document) {
  const snapshot = readableDocument(document);
  validateDocument(snapshot);
  ensureDataSafety(snapshot);
  const header = [
    'schema_version', 'record_type', 'context_id', 'context_kind', 'project_id', 'context_label',
    'segment_id', 'session_id', 'cycle_id', 'start_at_iso', 'end_at_iso', 'duration_ms',
    'local_date', 'workday_zone', 'start_cause', 'end_reason', 'source', 'certainty', 'provenance',
    'legacy_unattributed_ms', 'legacy_lineage_id'
  ];
  const rows = [header.map(value => csvCell(value))];
  for (const segment of snapshot.ledger.slice().sort((a, b) => a.startAtMs - b.startAtMs || a.segmentId.localeCompare(b.segmentId))) {
    const context = snapshot.contexts[segment.contextId];
    rows.push([
      HISTORY_CSV_SCHEMA, 'SEGMENT', segment.contextId, context.kind, context.projectId || '',
      csvCell(context.currentLabel || context.shortLabel || context.contextId, true), segment.segmentId,
      segment.sessionId, segment.cycleId, new Date(segment.startAtMs).toISOString(),
      new Date(segment.endAtMs).toISOString(), segment.durationMs, segment.localDate, segment.workdayZone,
      csvCell(segment.startCause || '', true), csvCell(segment.endReason || segment.reason || '', true),
      csvCell(segment.source || '', true), csvCell(segment.certainty || '', true),
      csvCell(typeof segment.provenance === 'string' ? segment.provenance : stableStringify(segment.provenance || ''), true), '', ''
    ].map((value, index) => [5, 14, 15, 16, 17, 18].includes(index) ? String(value) : csvCell(value)));
  }
  for (const context of Object.values(snapshot.contexts).filter(value => Number(value.legacyUnattributedMs) > 0).sort((a, b) => a.contextId.localeCompare(b.contextId))) {
    const lineage = snapshot.dataSafety.legacyBalanceLineages[context.contextId];
    rows.push([
      HISTORY_CSV_SCHEMA, 'LEGACY_BALANCE', context.contextId, context.kind, context.projectId || '',
      csvCell(context.currentLabel || context.shortLabel || context.contextId, true), '', '', '', '', '', '', '', '', '', '',
      'history-csv', '', '', context.legacyUnattributedMs, lineage?.lineageId || `dataset:${snapshot.dataSafety.datasetId}:context:${context.contextId}`
    ].map((value, index) => index === 5 ? String(value) : csvCell(value)));
  }
  const text = rows.map(row => row.join(',')).join('\r\n');
  if (byteLength(text) > MAX_INPUT_BYTES) throw new Error('history-csv-export-size-limit-exceeded');
  return deepFreeze({
    filename: `squarecoil-companion-history-${new Date(snapshot.updatedAtMs).toISOString().slice(0, 10)}.csv`,
    mimeType: 'text/csv;charset=utf-8',
    snapshotRevision: snapshot.revision,
    recordCount: rows.length - 1,
    text
  });
}

function createTimeReportCsv(document, options = {}) {
  const snapshot = readableDocument(document);
  validateDocument(snapshot);
  const atMs = isTimestamp(options.atMs) ? options.atMs : Date.now();
  const allSegments = [...snapshot.ledger, ...virtualActiveSegments(snapshot, atMs)];
  const grouped = new Map();
  for (const segment of allSegments) {
    if (segment.durationMs <= 0) continue;
    const key = `${segment.localDate}\u0000${segment.contextId}`;
    grouped.set(key, (grouped.get(key) || 0) + segment.durationMs);
  }
  const query = createQueryService(() => snapshot, { now: () => atMs });
  const header = ['schema', 'Date', 'Job Number', 'Job / Context Name', 'Context Type', 'Daily Recorded Hours', 'Overall Job / Context Hours as of export', 'Status / Provisional', 'As Of'];
  const rows = [header.map(value => csvCell(value))];
  for (const [key, durationMs] of [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const [localDate, contextId] = key.split('\u0000');
    const context = snapshot.contexts[contextId];
    const provisional = snapshot.timer?.active?.contextId === contextId &&
      virtualActiveSegments(snapshot, atMs).some(segment => segment.contextId === contextId && segment.localDate === localDate);
    rows.push([
      REPORT_CSV_SCHEMA,
      localDate,
      context.kind === 'job' ? context.projectId : '',
      csvCell(context.currentLabel || context.shortLabel || context.contextId, true),
      context.kind,
      (durationMs / 3_600_000).toFixed(6),
      (query.getContextTotal(contextId, atMs) / 3_600_000).toFixed(6),
      provisional ? 'PROVISIONAL' : 'FINALIZED',
      new Date(atMs).toISOString()
    ].map((value, index) => index === 3 ? String(value) : csvCell(value)));
  }
  return deepFreeze({
    filename: `squarecoil-companion-time-report-${new Date(atMs).toISOString().slice(0, 10)}.csv`,
    mimeType: 'text/csv;charset=utf-8',
    snapshotRevision: snapshot.revision,
    recordCount: rows.length - 1,
    text: rows.map(row => row.join(',')).join('\r\n')
  });
}

function parseJsonInput(input) {
  const text = typeof input === 'string' ? input : stableStringify(input);
  if (byteLength(text) > MAX_INPUT_BYTES) throw new Error('external-file-size-limit-exceeded');
  let value;
  try { value = typeof input === 'string' ? JSON.parse(input) : deepClone(input); }
  catch (_) { throw new Error('backup-json-invalid'); }
  assertResourceShape(value);
  if (!isRecord(value)) throw new Error('backup-envelope-invalid');
  return value;
}

function arrayFrom(value, name) {
  if (Array.isArray(value)) return value;
  if (isRecord(value)) return Object.values(value);
  throw new Error(`backup-${name}-invalid`);
}

function validateContextRecord(raw) {
  if (!isRecord(raw)) throw new Error('backup-context-invalid');
  const contextId = requireText(raw.contextId || raw.key, 'backup-context-id-invalid');
  const kind = raw.kind === 'general' || raw.context_kind === 'general' ? 'general' : 'job';
  const projectId = kind === 'job' ? requireText(raw.projectId || raw.project_id, 'backup-context-project-invalid') : null;
  if (kind === 'job' && (!/^[1-9]\d*$/.test(projectId) || !contextId.startsWith('job:'))) {
    throw new Error('backup-context-identity-invalid');
  }
  if (kind === 'general' && !contextId.startsWith('general:')) throw new Error('backup-context-identity-invalid');
  return {
    contextId,
    kind,
    ...(projectId ? { projectId } : {}),
    currentLabel: reverseSpreadsheetEscape(raw.currentLabel || raw.contextLabel || raw.context_label || raw.label || contextId),
    shortLabel: reverseSpreadsheetEscape(raw.shortLabel || raw.short_label || projectId || 'General'),
    aliases: Array.isArray(raw.aliases) ? raw.aliases.map(value => reverseSpreadsheetEscape(requireText(value, 'backup-context-alias-invalid'))) : [],
    createdAtMs: isTimestamp(raw.createdAtMs) ? raw.createdAtMs : 0,
    lastSeenAtMs: isTimestamp(raw.lastSeenAtMs) ? raw.lastSeenAtMs : 0,
    workspaceMembership: ['RECENT', 'ARCHIVED', 'INACTIVE_NON_RECENT'].includes(raw.workspaceMembership) ? raw.workspaceMembership : 'INACTIVE_NON_RECENT',
    archivedAtMs: isTimestamp(raw.archivedAtMs) ? raw.archivedAtMs : null,
    legacyUnattributedMs: 0
  };
}

function validateSegmentRecord(raw) {
  if (!isRecord(raw)) throw new Error('backup-segment-invalid');
  const result = deepClone(raw);
  for (const name of ['segmentId', 'sessionId', 'cycleId', 'contextId']) result[name] = requireText(result[name], `backup-segment-${name}-invalid`);
  result.startAtMs = nonNegativeInteger(result.startAtMs, 'backup-segment-start-invalid');
  result.endAtMs = nonNegativeInteger(result.endAtMs, 'backup-segment-end-invalid');
  result.durationMs = nonNegativeInteger(result.durationMs, 'backup-segment-duration-invalid');
  result.localDate = assertLocalDate(result.localDate);
  result.workdayZone = assertWorkdayZone(result.workdayZone);
  if (result.createdAtMs === undefined) result.createdAtMs = result.endAtMs;
  validateSegment(result);
  return result;
}

function normalizeBackup(input) {
  const raw = parseJsonInput(input);
  if (raw.format !== BACKUP_FORMAT) throw new Error('backup-format-unsupported');
  const schemaVersion = nonNegativeInteger(raw.schemaVersion, 'backup-schema-invalid');
  if (schemaVersion > BACKUP_SCHEMA_VERSION) throw new Error('backup-schema-newer-unsupported');
  if (![0, BACKUP_SCHEMA_VERSION].includes(schemaVersion)) throw new Error('backup-schema-unsupported');
  const rawContexts = arrayFrom(raw.contexts || [], 'contexts');
  const rawSegments = arrayFrom(raw.ledgerSegments || raw.ledger || [], 'ledger');
  const rawBalances = arrayFrom(raw.legacyBalances || [], 'legacy-balances');
  const rawActivity = arrayFrom(raw.activityLog || raw.optionalActivityLog || [], 'activity');
  const rawRecovery = arrayFrom(raw.recoveryEvidence || [], 'recovery-evidence');
  const counts = raw.recordCounts;
  if (!isRecord(counts) ||
      nonNegativeInteger(counts.contexts, 'backup-count-contexts-invalid') !== rawContexts.length ||
      nonNegativeInteger(counts.ledgerSegments ?? counts.ledger, 'backup-count-ledger-invalid') !== rawSegments.length ||
      nonNegativeInteger(counts.legacyBalances || 0, 'backup-count-balances-invalid') !== rawBalances.length ||
      nonNegativeInteger(counts.activityLog || 0, 'backup-count-activity-invalid') !== rawActivity.length ||
      nonNegativeInteger(counts.recoveryEvidence || 0, 'backup-count-recovery-invalid') !== rawRecovery.length) {
    throw new Error('backup-record-count-mismatch');
  }
  const contexts = rawContexts.map(validateContextRecord);
  const contextIds = new Set();
  for (const context of contexts) {
    if (contextIds.has(context.contextId)) throw new Error('backup-context-duplicate');
    contextIds.add(context.contextId);
  }
  const segments = rawSegments.map(validateSegmentRecord);
  for (const segment of segments) if (!contextIds.has(segment.contextId)) throw new Error('backup-segment-context-missing');
  const balances = rawBalances.map(value => ({
    contextId: requireText(value.contextId, 'backup-balance-context-invalid'),
    durationMs: nonNegativeInteger(value.durationMs ?? value.legacyUnattributedMs, 'backup-balance-duration-invalid'),
    lineageId: requireText(value.lineageId || value.lineage, 'backup-balance-lineage-invalid'),
    provenance: String(value.provenance || 'full-backup')
  }));
  for (const balance of balances) if (!contextIds.has(balance.contextId)) throw new Error('backup-balance-context-missing');
  const recoveryEvidence = rawRecovery.map(value => {
    if (!isRecord(value) || value.disposition !== 'NON_LIVE_RECOVERY_EVIDENCE') throw new Error('backup-recovery-evidence-invalid');
    const result = {
      disposition: value.disposition,
      contextId: requireText(value.contextId, 'backup-recovery-context-invalid'),
      sessionId: requireText(value.sessionId, 'backup-recovery-session-invalid'),
      cycleId: requireText(value.cycleId, 'backup-recovery-cycle-invalid'),
      startedAtMs: nonNegativeInteger(value.startedAtMs, 'backup-recovery-start-invalid'),
      lastVerifiedAtMs: nonNegativeInteger(value.lastVerifiedAtMs, 'backup-recovery-end-invalid'),
      checkpointedAtMs: nonNegativeInteger(value.checkpointedAtMs, 'backup-recovery-checkpoint-invalid'),
      source: String(value.source || 'full-backup'),
      provenance: String(value.provenance || 'full-backup-recovery-evidence')
    };
    if (result.lastVerifiedAtMs < result.startedAtMs || result.checkpointedAtMs < result.lastVerifiedAtMs || !contextIds.has(result.contextId)) {
      throw new Error('backup-recovery-evidence-invalid');
    }
    return result;
  });
  const workdayZone = assertWorkdayZone(raw.workdayZone);
  if (raw.migrationMetadata !== undefined) validateMigrationMetadata(raw.migrationMetadata);
  return {
    sourceKind: 'BACKUP',
    sourceSchemaVersion: schemaVersion,
    sourceId: requireText(raw.backupId, 'backup-id-invalid'),
    sourceDatasetId: requireText(raw.sourceDatasetId || `backup:${raw.backupId}`, 'backup-dataset-id-invalid'),
    workdayZone,
    workdayZoneDisposition: isRecord(raw.workdayZoneDisposition) ? deepClone(raw.workdayZoneDisposition) : { source: 'CONFIGURED', fallback: false, diagnostic: null },
    contexts,
    segments,
    balances,
    workspace: isRecord(raw.workspace) ? deepClone(raw.workspace) : null,
    preferences: sanitizePreferences(raw.preferences),
    migrationMetadata: raw.migrationMetadata === undefined ? null : deepClone(raw.migrationMetadata),
    activityLog: rawActivity,
    recoveryEvidence
  };
}

function absoluteTimestamp(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(text)) {
    throw new Error('csv-timestamp-ambiguous');
  }
  const timestamp = Date.parse(text);
  if (!isTimestamp(timestamp)) throw new Error('csv-timestamp-invalid');
  return timestamp;
}

function normalizeCanonicalCsv(rows, headers, sourceChecksum) {
  const index = Object.fromEntries(headers.map((name, position) => [name, position]));
  for (const required of ['schema_version', 'record_type', 'context_id', 'context_kind', 'context_label']) {
    if (index[required] === undefined) throw new Error('history-csv-header-invalid');
  }
  const contexts = new Map();
  const segments = [];
  const balances = [];
  const invalidRows = [];
  function cell(row, name) { return index[name] === undefined ? '' : row[index[name]] ?? ''; }
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    try {
      if (cell(row, 'schema_version') !== HISTORY_CSV_SCHEMA) throw new Error('history-csv-schema-invalid');
      const context = validateContextRecord({
        contextId: cell(row, 'context_id'), kind: cell(row, 'context_kind'), projectId: cell(row, 'project_id'),
        currentLabel: reverseSpreadsheetEscape(cell(row, 'context_label'))
      });
      if (contexts.has(context.contextId)) {
        const prior = contexts.get(context.contextId);
        if (prior.kind !== context.kind || String(prior.projectId || '') !== String(context.projectId || '')) throw new Error('HARD_CONTEXT_IDENTITY_CONFLICT');
      } else contexts.set(context.contextId, context);
      const type = cell(row, 'record_type');
      if (type === 'SEGMENT') {
        const startAtMs = absoluteTimestamp(cell(row, 'start_at_iso'));
        const endAtMs = absoluteTimestamp(cell(row, 'end_at_iso'));
        const durationMs = nonNegativeInteger(cell(row, 'duration_ms'), 'csv-duration-invalid');
        if (durationMs !== endAtMs - startAtMs) throw new Error('csv-duration-timestamp-mismatch');
        segments.push(validateSegmentRecord({
          segmentId: cell(row, 'segment_id'), sessionId: cell(row, 'session_id'), cycleId: cell(row, 'cycle_id'),
          contextId: context.contextId, startAtMs, endAtMs, durationMs, localDate: cell(row, 'local_date'),
          workdayZone: cell(row, 'workday_zone'), startCause: reverseSpreadsheetEscape(cell(row, 'start_cause')),
          endReason: reverseSpreadsheetEscape(cell(row, 'end_reason')), source: reverseSpreadsheetEscape(cell(row, 'source')) || 'history-csv',
          certainty: reverseSpreadsheetEscape(cell(row, 'certainty')) || 'IMPORTED',
          provenance: reverseSpreadsheetEscape(cell(row, 'provenance')) || 'history-csv', createdAtMs: endAtMs
        }));
      } else if (type === 'LEGACY_BALANCE') {
        balances.push({ contextId: context.contextId,
          durationMs: nonNegativeInteger(cell(row, 'legacy_unattributed_ms'), 'csv-balance-invalid'),
          lineageId: requireText(cell(row, 'legacy_lineage_id'), 'csv-balance-lineage-invalid'), provenance: 'history-csv' });
      } else throw new Error('history-csv-record-type-invalid');
    } catch (error) {
      invalidRows.push({ row: rowIndex + 1, code: String(error?.message || error) });
    }
  }
  return { sourceKind: 'HISTORY_CSV', sourceSchemaVersion: 1, sourceId: `csv:${sourceChecksum}`,
    sourceDatasetId: `csv:${sourceChecksum}`, contexts: [...contexts.values()], segments, balances,
    workspace: null, preferences: {}, migrationMetadata: null, activityLog: [], recoveryEvidence: [], invalidRows };
}

function normalizeLegacyCsv(rows, headers, sourceChecksum) {
  const index = Object.fromEntries(headers.map((name, position) => [name, position]));
  if (index.record_type === undefined || index.context_key === undefined) throw new Error('legacy-csv-header-invalid');
  const groups = new Map();
  const invalidRows = [];
  function cell(row, name) { return index[name] === undefined ? '' : row[index[name]] ?? ''; }
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (cell(row, 'schema') && cell(row, 'schema') !== LEGACY_HISTORY_CSV_SCHEMA) {
      invalidRows.push({ row: rowIndex + 1, code: 'legacy-csv-schema-invalid' });
      continue;
    }
    try {
      const key = requireText(cell(row, 'context_key'), 'legacy-csv-context-invalid');
      const kind = cell(row, 'context_type') === 'general' ? 'general' : 'job';
      const projectId = kind === 'job' ? requireText(cell(row, 'project_id') || key.replace(/^job:/, ''), 'legacy-csv-project-invalid') : null;
      const contextId = kind === 'job' ? `job:${projectId}` : key.startsWith('general:') ? key : `general:${key}`;
      const context = validateContextRecord({ contextId, kind, projectId,
        currentLabel: reverseSpreadsheetEscape(cell(row, 'label') || cell(row, 'short_label') || contextId),
        shortLabel: reverseSpreadsheetEscape(cell(row, 'short_label') || projectId || 'General') });
      let group = groups.get(contextId);
      if (!group) { group = { context, baselineMs: 0, segments: [], durationOnlyMs: 0 }; groups.set(contextId, group); }
      const recordType = String(cell(row, 'record_type')).toLowerCase();
      if (recordType === 'context') {
        group.baselineMs = Math.max(group.baselineMs, nonNegativeInteger(cell(row, 'total_ms') || 0, 'legacy-csv-total-invalid'));
      } else if (recordType === 'session') {
        const startRaw = String(cell(row, 'session_start_at')).trim();
        const endRaw = String(cell(row, 'session_end_at')).trim();
        const storedDuration = nonNegativeInteger(cell(row, 'session_duration_ms') || 0, 'legacy-csv-duration-invalid');
        const startAtMs = /^\d+$/.test(startRaw) ? Number(startRaw) : null;
        const endAtMs = /^\d+$/.test(endRaw) ? Number(endRaw) : null;
        if (isTimestamp(startAtMs) && isTimestamp(endAtMs)) {
          if (endAtMs < startAtMs) throw new Error('legacy-csv-session-reversed');
          const sessionId = String(cell(row, 'session_id') || `legacy-session-${fnv1a(`${sourceChecksum}:${rowIndex}`)}`);
          const cycleId = String(cell(row, 'session_cycle_id') || `legacy-cycle-${fnv1a(`${sourceChecksum}:${contextId}`)}`);
          group.segments.push(...splitInterval({ sessionId, cycleId, contextId, startAtMs, endAtMs,
            workdayZone: 'UTC', startCause: 'legacy-csv-import', endReason: reverseSpreadsheetEscape(cell(row, 'reason')) || 'legacy-csv-import',
            source: reverseSpreadsheetEscape(cell(row, 'source')) || 'legacy-csv-import', certainty: reverseSpreadsheetEscape(cell(row, 'certainty')) || 'IMPORTED',
            createdAtMs: endAtMs }, { makeId: makeIdFactory(`${sourceChecksum}:${rowIndex}`) }));
        } else if (storedDuration > 0) group.durationOnlyMs += storedDuration;
      } else throw new Error('legacy-csv-record-type-invalid');
    } catch (error) { invalidRows.push({ row: rowIndex + 1, code: String(error?.message || error) }); }
  }
  const contexts = [];
  const segments = [];
  const balances = [];
  for (const group of groups.values()) {
    contexts.push(group.context);
    segments.push(...group.segments);
    const attributedMs = group.segments.reduce((sum, segment) => sum + segment.durationMs, 0);
    const balance = Math.max(group.durationOnlyMs, Math.max(0, group.baselineMs - attributedMs));
    if (balance > 0) balances.push({ contextId: group.context.contextId, durationMs: balance,
      lineageId: `legacy-csv:${sourceChecksum}:${group.context.contextId}`, provenance: 'v07-history-csv' });
  }
  return { sourceKind: 'HISTORY_CSV_V07', sourceSchemaVersion: 0, sourceId: `csv:${sourceChecksum}`,
    sourceDatasetId: `csv:${sourceChecksum}`, contexts, segments, balances, workspace: null, preferences: {},
    migrationMetadata: null, activityLog: [], recoveryEvidence: [], invalidRows };
}

function normalizeHistoryCsv(text, options = {}) {
  const source = String(text ?? '');
  const rows = parseCsv(source);
  if (rows.length < 2) throw new Error('history-csv-empty');
  const headers = rows[0].map(value => String(value || '').trim());
  if (headers[0] === 'schema' && rows.slice(1).some(row => row[0] === REPORT_CSV_SCHEMA)) {
    throw new Error('time-report-csv-not-importable');
  }
  const checksum = fnv1a(source);
  let normalized;
  if (headers.includes('schema_version')) normalized = normalizeCanonicalCsv(rows, headers, checksum);
  else if (headers.includes('schema')) normalized = normalizeLegacyCsv(rows, headers, checksum);
  else throw new Error('history-csv-header-invalid');
  if (normalized.invalidRows.length && options.excludedRows === undefined) throw Object.assign(new Error('history-csv-review-required'), { invalidRows: normalized.invalidRows });
  const excluded = new Set(Array.isArray(options.excludedRows) ? options.excludedRows.map(Number) : []);
  const invalidNumbers = new Set(normalized.invalidRows.map(row => row.row));
  if (invalidNumbers.size && (excluded.size !== invalidNumbers.size || [...invalidNumbers].some(row => !excluded.has(row)))) {
    throw new Error('history-csv-reviewed-subset-invalid');
  }
  normalized.reviewedExcludedRows = [...excluded].sort((a, b) => a - b);
  return normalized;
}

function materialEqual(left, right) {
  return left.contextId === right.contextId && left.startAtMs === right.startAtMs &&
    left.endAtMs === right.endAtMs && left.durationMs === right.durationMs &&
    left.sessionId === right.sessionId && left.cycleId === right.cycleId;
}

function intervalsOverlap(left, right) {
  return left.durationMs > 0 && right.durationMs > 0 && left.startAtMs < right.endAtMs && right.startAtMs < left.endAtMs;
}

function conflictId(code, incoming, existing = null) {
  return `${code}:${fnv1a(stableStringify({ incoming: incoming.segmentId || incoming.contextId, existing: existing?.segmentId || existing?.contextId || null }))}`;
}

function applyRecoveryEvidence(incoming) {
  const sessionIds = new Set(incoming.segments.map(segment => segment.sessionId));
  for (const evidence of incoming.recoveryEvidence) {
    if (sessionIds.has(evidence.sessionId)) continue;
    incoming.segments.push(...splitInterval({
      sessionId: evidence.sessionId,
      cycleId: evidence.cycleId,
      contextId: evidence.contextId,
      startAtMs: evidence.startedAtMs,
      endAtMs: evidence.lastVerifiedAtMs,
      workdayZone: incoming.workdayZone,
      startCause: 'recovery-restore',
      endReason: 'recovery-finalize',
      source: evidence.source,
      certainty: 'VERIFIED_RECOVERY',
      provenance: evidence.provenance,
      createdAtMs: evidence.checkpointedAtMs
    }, { makeId: makeIdFactory(`recovery:${incoming.sourceId}:${evidence.sessionId}`) }));
    sessionIds.add(evidence.sessionId);
  }
}

function mergeIncoming(document, incoming, request, summary) {
  const candidate = deepClone(document);
  ensureDataSafety(candidate);
  const resolutions = isRecord(request.resolutions) ? request.resolutions : {};
  const conflicts = [];
  const requiredConfirmations = new Set();
  const incomingContexts = new Map(incoming.contexts.map(context => [context.contextId, deepClone(context)]));
  const memberships = isRecord(incoming.workspace?.memberships) ? incoming.workspace.memberships : {};

  for (const context of incomingContexts.values()) {
    const existing = candidate.contexts[context.contextId];
    const intrinsicIdentityMismatch = context.kind === 'job' && context.contextId !== `job:${context.projectId}`;
    if (intrinsicIdentityMismatch || (existing && (existing.kind !== context.kind || String(existing.projectId || '') !== String(context.projectId || '')))) {
      conflicts.push({ id: conflictId('HARD_CONTEXT_IDENTITY_CONFLICT', context, existing), code: 'HARD_CONTEXT_IDENTITY_CONFLICT', contextId: context.contextId, resolvable: false });
      continue;
    }
    if (!existing) {
      const wish = memberships[context.contextId];
      if (incoming.sourceKind === 'BACKUP' && request.importWorkspace === true && isRecord(wish)) {
        context.workspaceMembership = ['RECENT', 'ARCHIVED', 'INACTIVE_NON_RECENT'].includes(wish.workspaceMembership) ? wish.workspaceMembership : 'INACTIVE_NON_RECENT';
        context.archivedAtMs = context.workspaceMembership === 'ARCHIVED' && isTimestamp(wish.archivedAtMs) ? wish.archivedAtMs : null;
      } else {
        context.workspaceMembership = 'INACTIVE_NON_RECENT';
        context.archivedAtMs = null;
      }
      candidate.contexts[context.contextId] = context;
      summary.contextsAdded += 1;
    } else {
      if (!existing.currentLabel && context.currentLabel) existing.currentLabel = context.currentLabel;
      if (!existing.shortLabel && context.shortLabel) existing.shortLabel = context.shortLabel;
      existing.aliases = [...new Set([...(existing.aliases || []), ...(context.aliases || [])])];
    }
  }

  applyRecoveryEvidence(incoming);
  const byId = new Map(candidate.ledger.map(segment => [segment.segmentId, segment]));
  const byFingerprint = new Map(candidate.ledger.map(segment => [intervalFingerprint(segment), segment]));
  const activeIntervals = [];
  if (candidate.timer?.active) {
    const active = candidate.timer.active;
    const effectiveEnd = Math.max(active.startedAtMs, active.safetyHold?.holdAtMs || active.lastVerifiedAtMs || candidate.updatedAtMs);
    activeIntervals.push({ segmentId: 'LIVE_ACTIVE', contextId: active.contextId, startAtMs: active.startedAtMs, endAtMs: effectiveEnd, durationMs: effectiveEnd - active.startedAtMs });
  }
  if (candidate.checkpoint?.contextId && isTimestamp(candidate.checkpoint.startedAtMs) && isTimestamp(candidate.checkpoint.lastVerifiedAtMs)) {
    activeIntervals.push({ segmentId: 'UNRESOLVED_RECOVERY', contextId: candidate.checkpoint.contextId,
      startAtMs: candidate.checkpoint.startedAtMs, endAtMs: candidate.checkpoint.lastVerifiedAtMs,
      durationMs: candidate.checkpoint.lastVerifiedAtMs - candidate.checkpoint.startedAtMs });
  }

  for (const segment of incoming.segments) {
    if (!candidate.contexts[segment.contextId]) continue;
    const sameId = byId.get(segment.segmentId);
    const sameFingerprint = byFingerprint.get(intervalFingerprint(segment));
    if (sameId && materialEqual(sameId, segment)) { summary.duplicates += 1; continue; }
    if (!sameId && sameFingerprint) { summary.duplicates += 1; continue; }
    const overlaps = [...candidate.ledger, ...activeIntervals].filter(existing => intervalsOverlap(existing, segment));
    const code = sameId ? 'SEGMENT_ID_CONFLICT' : overlaps.length ? 'TEMPORAL_OVERLAP_CONFLICT' : null;
    if (code) {
      const existing = sameId || overlaps[0];
      const id = conflictId(code, segment, existing);
      const resolution = resolutions[id];
      if (resolution === 'KEEP_CURRENT') { summary.conflictsResolved += 1; continue; }
      if (resolution === 'USE_INCOMING' && existing.segmentId !== 'LIVE_ACTIVE' && existing.segmentId !== 'UNRESOLVED_RECOVERY') {
        const removeIds = new Set((sameId ? [sameId] : overlaps).map(value => value.segmentId));
        candidate.ledger = candidate.ledger.filter(value => !removeIds.has(value.segmentId));
        for (const idToRemove of removeIds) byId.delete(idToRemove);
        for (const [fingerprint, value] of byFingerprint) if (removeIds.has(value.segmentId)) byFingerprint.delete(fingerprint);
        summary.conflictsResolved += 1;
        summary.recordsReplaced += removeIds.size;
        requiredConfirmations.add('USE_INCOMING');
      } else {
        conflicts.push({ id, code, contextId: segment.contextId, incomingSegmentId: segment.segmentId,
          existingSegmentId: existing.segmentId, resolvable: existing.segmentId !== 'LIVE_ACTIVE' && existing.segmentId !== 'UNRESOLVED_RECOVERY' });
        continue;
      }
    }
    candidate.ledger.push(deepClone(segment));
    byId.set(segment.segmentId, segment);
    byFingerprint.set(intervalFingerprint(segment), segment);
    summary.segmentsAdded += 1;
  }

  for (const balance of incoming.balances) {
    const context = candidate.contexts[balance.contextId];
    if (!context) continue;
    const currentMs = Math.max(0, Number(context.legacyUnattributedMs) || 0);
    const lineage = candidate.dataSafety.legacyBalanceLineages[balance.contextId];
    if (currentMs === 0) {
      context.legacyUnattributedMs = balance.durationMs;
      if (balance.durationMs > 0) candidate.dataSafety.legacyBalanceLineages[balance.contextId] = { lineageId: balance.lineageId, durationMs: balance.durationMs };
      summary.balancesAdded += balance.durationMs > 0 ? 1 : 0;
    } else if (lineage?.lineageId === balance.lineageId) {
      const nextMs = Math.max(currentMs, balance.durationMs);
      context.legacyUnattributedMs = nextMs;
      candidate.dataSafety.legacyBalanceLineages[balance.contextId] = { lineageId: balance.lineageId, durationMs: nextMs };
      summary.duplicates += 1;
    } else {
      const id = `LEGACY_BALANCE_LINEAGE_CONFLICT:${fnv1a(`${balance.contextId}:${balance.lineageId}`)}`;
      const resolution = resolutions[id];
      if (resolution === 'KEEP_CURRENT') summary.conflictsResolved += 1;
      else if (resolution === 'USE_INCOMING') {
        context.legacyUnattributedMs = balance.durationMs;
        candidate.dataSafety.legacyBalanceLineages[balance.contextId] = { lineageId: balance.lineageId, durationMs: balance.durationMs };
        summary.conflictsResolved += 1;
        summary.recordsReplaced += 1;
        requiredConfirmations.add('USE_INCOMING');
      } else conflicts.push({ id, code: 'LEGACY_BALANCE_LINEAGE_CONFLICT', contextId: balance.contextId, resolvable: true });
    }
  }

  if (request.importWorkspace === true && incoming.workspace) {
    const protectedIds = protectedContextIds(candidate);
    for (const [contextId, wish] of Object.entries(memberships)) {
      const context = candidate.contexts[contextId];
      if (!context) continue;
      const desired = wish?.workspaceMembership;
      if (protectedIds.has(contextId) && desired !== 'RECENT') { summary.workspaceWishesSkipped += 1; continue; }
      if (['RECENT', 'ARCHIVED', 'INACTIVE_NON_RECENT'].includes(desired)) {
        context.workspaceMembership = desired;
        context.archivedAtMs = desired === 'ARCHIVED' && isTimestamp(wish.archivedAtMs) ? wish.archivedAtMs : null;
      }
    }
    candidate.dataSafety.workspace = normalizeWorkspace(incoming.workspace, candidate.contexts);
  }
  if (request.importPreferences === true) {
    candidate.dataSafety.preferences = restoredPreferenceStorage(candidate.dataSafety.preferences, incoming.preferences);
  }
  return { candidate, conflicts, requiredConfirmations };
}

function replaceIncoming(document, incoming, request, summary) {
  if (!isQuiescent(document)) throw new Error('data-operation-quiescence-required');
  const candidate = deepClone(document);
  ensureDataSafety(candidate);
  const contexts = Object.fromEntries(incoming.contexts.map(context => [context.contextId, deepClone(context)]));
  for (const context of Object.values(contexts)) {
    context.workspaceMembership = 'INACTIVE_NON_RECENT';
    context.archivedAtMs = null;
    context.legacyUnattributedMs = 0;
  }
  candidate.contexts = contexts;
  candidate.ledger = [];
  candidate.timer.active = null;
  candidate.timer.pending = null;
  candidate.timer.localPause = null;
  candidate.timer.lastFocusTransition = null;
  candidate.timer.lastObservation = null;
  candidate.timer.lastReason = 'restore-replace-non-live';
  candidate.checkpoint = null;
  candidate.dataSafety = {
    schemaVersion: DATA_SAFETY_SCHEMA_VERSION,
    datasetId: incoming.sourceDatasetId,
    workspace: { order: [], hiddenContextIds: [] },
    preferences: deepClone(document.dataSafety?.preferences || {}),
    activityLog: request.restoreActivity === true ? incoming.activityLog.slice(-DATA_ACTIVITY_LIMIT) : deepClone(document.dataSafety?.activityLog || []),
    legacyBalanceLineages: {},
    lastMutation: null
  };
  const merged = mergeIncoming(candidate, { ...incoming, workspace: request.importWorkspace === false ? null : incoming.workspace },
    { ...request, importWorkspace: request.importWorkspace !== false, importPreferences: request.importPreferences !== false }, summary);
  if (merged.conflicts.length) return merged;
  const currentMarkers = document.migration?.completedSources || {};
  if (Object.keys(currentMarkers).length) {
    merged.candidate.migration = deepClone(document.migration);
    if (isRecord(merged.candidate.migration.recoveryCandidates)) merged.candidate.migration.recoveryCandidates = {};
  } else if (incoming.migrationMetadata) merged.candidate.migration = deepClone(incoming.migrationMetadata);
  if (!request.keepCurrentZone) {
    merged.candidate.workdayZone = incoming.workdayZone;
    merged.candidate.workdayZoneDisposition = deepClone(incoming.workdayZoneDisposition);
  }
  summary.contextsReplaced = Object.keys(contexts).length;
  summary.segmentsReplaced = merged.candidate.ledger.length;
  merged.requiredConfirmations.add('RESTORE_REPLACE');
  return merged;
}

function removeContextData(candidate, contextId) {
  delete candidate.contexts[contextId];
  candidate.ledger = candidate.ledger.filter(segment => segment.contextId !== contextId);
  const data = ensureDataSafety(candidate);
  data.workspace.order = data.workspace.order.filter(value => value !== contextId);
  data.workspace.hiddenContextIds = data.workspace.hiddenContextIds.filter(value => value !== contextId);
  delete data.legacyBalanceLineages[contextId];
  data.activityLog = data.activityLog.filter(entry => entry.contextId !== contextId && entry.targetContextId !== contextId);
  if (isRecord(candidate.migration?.recoveryCandidates)) {
    for (const [key, value] of Object.entries(candidate.migration.recoveryCandidates)) {
      if (value?.contextId === contextId) delete candidate.migration.recoveryCandidates[key];
    }
  }
  candidate.migration.diagnostics = candidate.migration.diagnostics.filter(entry => entry.contextId !== contextId);
}

function publicPlan(operation, revision, summary, conflicts, requiredConfirmations, inputIdentity) {
  const core = { operation, stagedRevision: revision, summary, conflicts, requiredConfirmations: [...requiredConfirmations].sort(), inputIdentity };
  return deepFreeze({ ...core, blocked: conflicts.length > 0, planId: `plan-${fnv1a(stableStringify(core))}` });
}

function stageDataOperation(document, request = {}, options = {}) {
  const readable = readableDocument(document);
  validateDocument(readable);
  if (!isRecord(request) || !DATA_COMMAND_TYPES.has(request.type)) throw new Error('data-operation-type-unsupported');
  const candidate = readable;
  ensureDataSafety(candidate, { nowMs: options.nowMs, datasetId: options.datasetId });
  mergeWorkspaceState(candidate, request.workspace, request.preferences);
  const protectedIds = protectedContextIds(candidate);
  const summary = { contextsAdded: 0, segmentsAdded: 0, balancesAdded: 0, duplicates: 0,
    conflictsResolved: 0, recordsReplaced: 0, workspaceWishesSkipped: 0 };
  let conflicts = [];
  let requiredConfirmations = new Set();
  let resultCandidate = candidate;
  let inputIdentity = null;

  if (request.type === DATA_COMMANDS.ARCHIVE_CONTEXT) {
    const contextId = requireText(request.contextId, 'data-context-id-required');
    const context = candidate.contexts[contextId];
    if (!context) throw new Error('data-context-not-found');
    if (context.workspaceMembership !== 'RECENT' || context.archivedAtMs != null) {
      throw new Error('data-context-not-recent');
    }
    if (protectedIds.has(contextId)) throw new Error('data-context-protected');
    context.workspaceMembership = 'ARCHIVED'; context.archivedAtMs = nonNegativeInteger(request.atMs, 'data-operation-time-invalid');
    summary.archivedCount = 1;
  } else if (request.type === DATA_COMMANDS.ARCHIVE_ELIGIBLE) {
    const atMs = nonNegativeInteger(request.atMs, 'data-operation-time-invalid');
    const eligible = Object.values(candidate.contexts).filter(context => context.workspaceMembership === 'RECENT' && !protectedIds.has(context.contextId));
    for (const context of eligible) { context.workspaceMembership = 'ARCHIVED'; context.archivedAtMs = atMs; }
    summary.archivedCount = eligible.length; summary.skippedProtectedCount = Object.values(candidate.contexts).filter(context => context.workspaceMembership === 'RECENT' && protectedIds.has(context.contextId)).length;
  } else if (request.type === DATA_COMMANDS.RESTORE_ARCHIVED) {
    const contextId = requireText(request.contextId, 'data-context-id-required');
    const context = candidate.contexts[contextId];
    if (!context || context.workspaceMembership !== 'ARCHIVED') throw new Error('data-archived-context-not-found');
    context.workspaceMembership = 'RECENT'; context.archivedAtMs = null; summary.restoredCount = 1;
  } else if (request.type === DATA_COMMANDS.CLEAR_RECENT) {
    const eligible = Object.values(candidate.contexts).filter(context => context.workspaceMembership === 'RECENT' && !protectedIds.has(context.contextId));
    for (const context of eligible) { context.workspaceMembership = 'INACTIVE_NON_RECENT'; context.archivedAtMs = null; }
    summary.clearedCount = eligible.length; summary.skippedProtectedCount = Object.values(candidate.contexts).filter(context => context.workspaceMembership === 'RECENT' && protectedIds.has(context.contextId)).length;
  } else if (request.type === DATA_COMMANDS.DELETE_CONTEXT) {
    const contextId = requireText(request.contextId, 'data-context-id-required');
    if (!candidate.contexts[contextId]) throw new Error('data-context-not-found');
    if (protectedIds.has(contextId)) throw new Error('data-context-protected');
    summary.deletedSegmentCount = candidate.ledger.filter(segment => segment.contextId === contextId).length;
    removeContextData(candidate, contextId); summary.deletedContextCount = 1; requiredConfirmations.add(`DELETE:${contextId}`);
  } else if (request.type === DATA_COMMANDS.DELETE_ALL_ARCHIVED) {
    const targets = Object.values(candidate.contexts).filter(context => context.workspaceMembership === 'ARCHIVED');
    if (targets.some(context => protectedIds.has(context.contextId))) throw new Error('data-archived-target-protected');
    summary.deletedSegmentCount = candidate.ledger.filter(segment => targets.some(context => context.contextId === segment.contextId)).length;
    for (const context of targets) removeContextData(candidate, context.contextId);
    summary.deletedContextCount = targets.length; requiredConfirmations.add('DELETE_ALL_ARCHIVED');
  } else if (request.type === DATA_COMMANDS.WIPE_HISTORY) {
    if (!isQuiescent(candidate)) throw new Error('data-operation-quiescence-required');
    summary.deletedSegmentCount = candidate.ledger.length;
    summary.clearedLegacyBalanceCount = Object.values(candidate.contexts).filter(context => Number(context.legacyUnattributedMs) > 0).length;
    candidate.ledger = [];
    for (const context of Object.values(candidate.contexts)) context.legacyUnattributedMs = 0;
    candidate.dataSafety.legacyBalanceLineages = {};
    candidate.checkpoint = null;
    if (isRecord(candidate.migration.recoveryCandidates)) candidate.migration.recoveryCandidates = {};
    candidate.migration.diagnostics = [];
    requiredConfirmations.add('WIPE_ALL_TIME_HISTORY');
  } else if (request.type === DATA_COMMANDS.RESTORE_BACKUP || request.type === DATA_COMMANDS.IMPORT_HISTORY_CSV) {
    const incoming = request.type === DATA_COMMANDS.RESTORE_BACKUP
      ? normalizeBackup(request.input)
      : normalizeHistoryCsv(request.input, { excludedRows: request.excludedRows });
    inputIdentity = incoming.sourceId;
    const mode = request.type === DATA_COMMANDS.IMPORT_HISTORY_CSV ? RESTORE_MODES.MERGE : String(request.mode || RESTORE_MODES.MERGE).toUpperCase();
    if (!Object.values(RESTORE_MODES).includes(mode)) throw new Error('restore-mode-invalid');
    const merged = mode === RESTORE_MODES.REPLACE
      ? replaceIncoming(candidate, incoming, request, summary)
      : mergeIncoming(candidate, incoming, request, summary);
    resultCandidate = merged.candidate; conflicts = merged.conflicts; requiredConfirmations = merged.requiredConfirmations;
    summary.mode = mode; summary.sourceKind = incoming.sourceKind; summary.reviewedExcludedRows = incoming.reviewedExcludedRows || [];
  }
  validateDocument(resultCandidate);
  const plan = publicPlan(request.type, readable.revision, summary, conflicts, requiredConfirmations, inputIdentity);
  return { plan, candidate: resultCandidate };
}

function appendActivity(document, operation, operationId, nowMs, summary) {
  const data = ensureDataSafety(document, { nowMs });
  const generic = operation === DATA_COMMANDS.DELETE_CONTEXT || operation === DATA_COMMANDS.DELETE_ALL_ARCHIVED
    ? { deletedContextCount: summary.deletedContextCount || 0, deletedSegmentCount: summary.deletedSegmentCount || 0 }
    : deepClone(summary);
  data.activityLog.push({ eventId: `activity-${fnv1a(`${operationId}:${nowMs}`)}`, type: operation, atMs: nowMs, summary: generic });
  data.activityLog = data.activityLog.slice(-DATA_ACTIVITY_LIMIT);
  data.lastMutation = { operationId, type: operation, committedAtMs: nowMs };
}

function commitStagedDataOperation(document, command, options = {}) {
  if (!isRecord(command) || !isRecord(command.request)) throw new Error('data-command-invalid');
  if (command.stagedRevision !== document.revision) throw new Error('data-staged-revision-stale');
  const staged = stageDataOperation(document, command.request, options);
  if (staged.plan.planId !== command.planId) throw new Error('data-plan-fingerprint-mismatch');
  if (staged.plan.blocked) throw new Error('data-plan-conflicts-unresolved');
  const confirmations = new Set(Array.isArray(command.confirmationTokens) ? command.confirmationTokens.map(String) : []);
  if (staged.plan.requiredConfirmations.some(token => !confirmations.has(token))) throw new Error('data-confirmation-required');
  if (staged.plan.requiredConfirmations.some(token => ['DELETE_ALL_ARCHIVED', 'WIPE_ALL_TIME_HISTORY', 'RESTORE_REPLACE'].includes(token)) &&
      !['CREATED', 'DECLINED'].includes(command.preBackupDisposition)) {
    throw new Error('data-pre-backup-opportunity-required');
  }
  const nowMs = isTimestamp(options.nowMs) ? options.nowMs : Date.now();
  appendActivity(staged.candidate, command.request.type, command.operationId || staged.plan.planId, nowMs, staged.plan.summary);
  validateDocument(staged.candidate);
  return { document: staged.candidate, plan: staged.plan };
}

module.exports = {
  BACKUP_FORMAT,
  BACKUP_SCHEMA_VERSION,
  HISTORY_CSV_SCHEMA,
  LEGACY_HISTORY_CSV_SCHEMA,
  REPORT_CSV_SCHEMA,
  MAX_INPUT_BYTES,
  MAX_RECORDS,
  MAX_STRING_LENGTH,
  MAX_STRUCTURE_DEPTH,
  DATA_COMMANDS,
  DATA_COMMAND_TYPES,
  RESTORE_MODES,
  stableStringify,
  fnv1a,
  ensureDataSafety,
  protectedContextIds,
  isQuiescent,
  createDataSafetyReadModel,
  spreadsheetSafeText,
  reverseSpreadsheetEscape,
  parseCsv,
  createFullBackup,
  createHistoryCsv,
  createTimeReportCsv,
  normalizeBackup,
  normalizeHistoryCsv,
  stageDataOperation,
  commitStagedDataOperation
};
