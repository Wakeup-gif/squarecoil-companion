'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createEmptyDocument, validateDocument } = require('../../src/data/model');
const { splitInterval } = require('../../src/data/ledger');
const { DEFAULT_PREFERENCES, preferenceStorage } = require('../../src/preferences/preferences');
const {
  BACKUP_FORMAT,
  BACKUP_SCHEMA_VERSION,
  HISTORY_CSV_SCHEMA,
  LEGACY_HISTORY_CSV_SCHEMA,
  REPORT_CSV_SCHEMA,
  MAX_INPUT_BYTES,
  DATA_COMMANDS,
  createDataSafetyReadModel,
  createFullBackup,
  createHistoryCsv,
  createTimeReportCsv,
  normalizeBackup,
  normalizeHistoryCsv,
  stageDataOperation,
  commitStagedDataOperation
} = require('../../src/data/data-safety');

const NOW = Date.parse('2026-08-28T15:00:00Z');

function documentFixture() {
  return createEmptyDocument({ nowMs: NOW, workdayZone: 'UTC', datasetId: 'dataset-fixture-001' });
}

function addContext(document, projectId, values = {}) {
  const contextId = `job:${projectId}`;
  document.contexts[contextId] = {
    contextId,
    kind: 'job',
    projectId: String(projectId),
    currentLabel: values.label || `Job ${projectId}`,
    shortLabel: String(projectId),
    aliases: [],
    createdAtMs: NOW - 100_000,
    lastSeenAtMs: NOW - 1_000,
    workspaceMembership: values.membership || 'RECENT',
    archivedAtMs: values.membership === 'ARCHIVED' ? NOW - 500 : null,
    legacyUnattributedMs: values.legacyUnattributedMs || 0
  };
  if (values.legacyUnattributedMs) {
    document.dataSafety.legacyBalanceLineages[contextId] = {
      lineageId: values.lineageId || `fixture:${contextId}`,
      durationMs: values.legacyUnattributedMs
    };
  }
  return contextId;
}

function addSegment(document, contextId, values = {}) {
  const startAtMs = values.startAtMs || NOW - 60_000;
  const endAtMs = values.endAtMs || NOW - 30_000;
  const rows = splitInterval({
    sessionId: values.sessionId || `session-${contextId}`,
    cycleId: values.cycleId || `cycle-${contextId}`,
    contextId,
    startAtMs,
    endAtMs,
    workdayZone: 'UTC',
    source: 'fixture',
    certainty: 'VERIFIED',
    createdAtMs: endAtMs
  }, { makeId: prefix => `${prefix}-${values.suffix || contextId}` });
  document.ledger.push(...rows);
  return rows[0];
}

function committed(document, request, values = {}) {
  const staged = stageDataOperation(document, request, { nowMs: NOW });
  const result = commitStagedDataOperation(document, {
    request,
    stagedRevision: staged.plan.stagedRevision,
    planId: staged.plan.planId,
    operationId: values.operationId || 'operation-fixture-001',
    confirmationTokens: values.confirmationTokens || staged.plan.requiredConfirmations,
    preBackupDisposition: values.preBackupDisposition
  }, { nowMs: NOW });
  return { staged, ...result };
}

test('UT-B4-DATA-001 archive preserves authoritative time and restore never creates live state', () => {
  const document = documentFixture();
  const contextId = addContext(document, '260801');
  addSegment(document, contextId);
  const total = document.ledger[0].durationMs;
  const archived = committed(document, { type: DATA_COMMANDS.ARCHIVE_CONTEXT, contextId, atMs: NOW }).document;
  assert.equal(archived.contexts[contextId].workspaceMembership, 'ARCHIVED');
  assert.equal(archived.ledger.reduce((sum, row) => sum + row.durationMs, 0), total);
  const restored = committed(archived, { type: DATA_COMMANDS.RESTORE_ARCHIVED, contextId }).document;
  assert.equal(restored.contexts[contextId].workspaceMembership, 'RECENT');
  assert.equal(restored.timer.active, null);
  assert.equal(restored.ledger.length, 1);
});

test('UT-B4-DATA-002 protected archive and delete fail closed without mutating the source', () => {
  const document = documentFixture();
  const contextId = addContext(document, '260802');
  document.timer.pending = { contextId, safeStartAnchorMs: NOW - 1_000, lastContinuityVerifiedAtMs: NOW - 500, continuityState: 'VALID' };
  const before = structuredClone(document);
  assert.throws(() => stageDataOperation(document, { type: DATA_COMMANDS.ARCHIVE_CONTEXT, contextId, atMs: NOW }), /data-context-protected/);
  assert.throws(() => stageDataOperation(document, { type: DATA_COMMANDS.DELETE_CONTEXT, contextId }), /data-context-protected/);
  assert.deepEqual(document, before);
});

test('UT-B4-DATA-003 bulk archive and Clear Recent operate atomically on eligible sets', () => {
  const document = documentFixture();
  const first = addContext(document, '260803');
  const second = addContext(document, '260804');
  const protectedId = addContext(document, '260805');
  document.timer.localPause = { contextId: protectedId, cycleId: 'cycle-protected', pausedAtMs: NOW - 100 };
  const archived = committed(document, { type: DATA_COMMANDS.ARCHIVE_ELIGIBLE, atMs: NOW }).document;
  assert.equal(archived.contexts[first].workspaceMembership, 'ARCHIVED');
  assert.equal(archived.contexts[second].workspaceMembership, 'ARCHIVED');
  assert.equal(archived.contexts[protectedId].workspaceMembership, 'RECENT');
  const restored = committed(archived, { type: DATA_COMMANDS.RESTORE_ARCHIVED, contextId: first }).document;
  const cleared = committed(restored, { type: DATA_COMMANDS.CLEAR_RECENT }).document;
  assert.equal(cleared.contexts[first].workspaceMembership, 'INACTIVE_NON_RECENT');
  assert.equal(cleared.contexts[protectedId].workspaceMembership, 'RECENT');
});

test('UT-B4-DATA-004 exact Context deletion removes only target-owned data and redacts target activity', () => {
  const document = documentFixture();
  const target = addContext(document, '260806', { legacyUnattributedMs: 5_000 });
  const other = addContext(document, '260807');
  addSegment(document, target, { suffix: 'target' });
  addSegment(document, other, { startAtMs: NOW - 120_000, endAtMs: NOW - 90_000, suffix: 'other' });
  document.dataSafety.workspace.order = [target, other];
  document.dataSafety.activityLog.push({ eventId: 'target-entry', type: 'VIEW', atMs: NOW - 1, contextId: target });
  const result = committed(document, { type: DATA_COMMANDS.DELETE_CONTEXT, contextId: target }, { confirmationTokens: [`DELETE:${target}`] }).document;
  assert.equal(result.contexts[target], undefined);
  assert.ok(result.contexts[other]);
  assert.equal(result.ledger.length, 1);
  assert.equal(result.ledger[0].contextId, other);
  assert.equal(result.dataSafety.activityLog.some(entry => entry.contextId === target), false);
  assert.equal(result.dataSafety.activityLog.at(-1).summary.deletedContextCount, 1);
  assert.equal(JSON.stringify(result.dataSafety.activityLog.at(-1)).includes(target), false);
});

test('UT-B4-DATA-005 delete all archived requires one explicit confirmation and a backup opportunity', () => {
  const document = documentFixture();
  addContext(document, '260808', { membership: 'ARCHIVED' });
  const request = { type: DATA_COMMANDS.DELETE_ALL_ARCHIVED };
  const staged = stageDataOperation(document, request);
  assert.throws(() => commitStagedDataOperation(document, { request, stagedRevision: 0, planId: staged.plan.planId,
    confirmationTokens: ['DELETE_ALL_ARCHIVED'] }, { nowMs: NOW }), /data-pre-backup-opportunity-required/);
  const result = commitStagedDataOperation(document, { request, stagedRevision: 0, planId: staged.plan.planId,
    confirmationTokens: ['DELETE_ALL_ARCHIVED'], preBackupDisposition: 'DECLINED' }, { nowMs: NOW });
  assert.equal(Object.keys(result.document.contexts).length, 0);
});

test('UT-B4-DATA-006 wipe is quiescence-gated, preserves workspace/preferences, and cannot remigrate retained v0.7 sources', () => {
  const active = documentFixture();
  const activeId = addContext(active, '260809');
  active.timer.active = { contextId: activeId, sessionId: 'session-active', cycleId: 'cycle-active', startedAtMs: NOW - 1_000,
    lastVerifiedAtMs: NOW, source: 'fixture', certainty: 'VERIFIED', accrualOwnerToken: 'owner', safetyHold: null };
  assert.throws(() => stageDataOperation(active, { type: DATA_COMMANDS.WIPE_HISTORY }), /data-operation-quiescence-required/);

  const idle = documentFixture();
  const contextId = addContext(idle, '260810', { legacyUnattributedMs: 2_000 });
  addSegment(idle, contextId);
  idle.dataSafety.preferences = { theme: 'dark' };
  idle.migration.completedSources = {};
  const wiped = committed(idle, { type: DATA_COMMANDS.WIPE_HISTORY }, {
    confirmationTokens: ['WIPE_ALL_TIME_HISTORY'], preBackupDisposition: 'CREATED'
  }).document;
  assert.equal(wiped.ledger.length, 0);
  assert.equal(wiped.contexts[contextId].legacyUnattributedMs, 0);
  assert.equal(wiped.contexts[contextId].workspaceMembership, 'RECENT');
  assert.equal(wiped.dataSafety.preferences.theme, 'dark');
});

test('UT-B4-BACKUP-001 full backup is one revision, count-consistent, and excludes live claims', () => {
  const document = documentFixture();
  const contextId = addContext(document, '260811');
  addSegment(document, contextId);
  document.timer.active = { contextId, sessionId: 'session-live', cycleId: 'cycle-live', startedAtMs: NOW - 5_000,
    lastVerifiedAtMs: NOW - 1_000, source: 'fixture', certainty: 'VERIFIED', accrualOwnerToken: 'owner', safetyHold: null };
  document.checkpoint = { schemaVersion: 1, runtimeInstanceId: 'runtime-fixture', contextId, sessionId: 'session-live', cycleId: 'cycle-live',
    startedAtMs: NOW - 5_000, lastVerifiedAtMs: NOW - 1_000, checkpointedAtMs: NOW,
    terminationDisposition: 'UNEXPECTED_INTERRUPTION', buildVersion: 'fixture', source: 'companion',
    ownershipEvidence: { disposition: 'OWNER', ownerRuntimeId: 'runtime-fixture', coordinationEpoch: 1, fencingToken: '1' } };
  const backup = createFullBackup(document, { backupId: 'backup-fixture-001', exportedAtMs: NOW, appVersion: '0.7.1' });
  assert.equal(backup.format, BACKUP_FORMAT);
  assert.equal(backup.schemaVersion, BACKUP_SCHEMA_VERSION);
  assert.equal(backup.snapshotRevision, document.revision);
  assert.equal(backup.recordCounts.ledgerSegments, backup.ledgerSegments.length);
  assert.equal('timer' in backup, false);
  assert.equal('checkpoint' in backup, false);
  assert.equal(backup.recoveryEvidence[0].lastVerifiedAtMs, NOW - 1_000);
  assert.equal(JSON.stringify(backup).includes('accrualOwnerToken'), false);
});

test('UT-B4-BACKUP-002 malformed, future, and count-mismatched backups are rejected', () => {
  assert.throws(() => normalizeBackup('{broken'), /backup-json-invalid/);
  const backup = createFullBackup(documentFixture(), { backupId: 'backup-fixture-002', exportedAtMs: NOW });
  assert.throws(() => normalizeBackup({ ...backup, schemaVersion: 99 }), /backup-schema-newer-unsupported/);
  assert.throws(() => normalizeBackup({ ...backup, recordCounts: { ...backup.recordCounts, contexts: 99 } }), /backup-record-count-mismatch/);
});

test('UT-B4-BACKUP-010 every offered backup fits the importer, and oversized backups fail before download', () => {
  const small = createFullBackup(documentFixture(), { backupId: 'backup-size-small', exportedAtMs: NOW });
  const downloadedText = `${JSON.stringify(small)}\n`;
  assert.ok(Buffer.byteLength(downloadedText) <= MAX_INPUT_BYTES);
  assert.equal(normalizeBackup(downloadedText).sourceId, 'backup-size-small');

  const oversized = documentFixture();
  const contextId = addContext(oversized, '260828');
  oversized.contexts[contextId].aliases = Array.from({ length: Math.ceil(MAX_INPUT_BYTES / 6_000) + 1 },
    (_, index) => `alias-${index}-${'x'.repeat(6_000)}`);
  assert.throws(() => createFullBackup(oversized, { backupId: 'backup-size-oversized', exportedAtMs: NOW }),
    /backup-export-size-limit-exceeded/);
});

test('UT-B4-BACKUP-003 supported schema zero adapts before validation', () => {
  const document = documentFixture();
  const contextId = addContext(document, '260812');
  addSegment(document, contextId);
  const current = createFullBackup(document, { backupId: 'backup-fixture-003', exportedAtMs: NOW });
  const older = { ...current, schemaVersion: 0, ledger: current.ledgerSegments };
  delete older.ledgerSegments;
  older.recordCounts = { ...older.recordCounts, ledger: older.recordCounts.ledgerSegments };
  delete older.recordCounts.ledgerSegments;
  assert.equal(normalizeBackup(older).sourceSchemaVersion, 0);
});

test('UT-B4-BACKUP-004 Merge dedupes exact history and fails closed on same-ID conflicts', () => {
  const source = documentFixture();
  const contextId = addContext(source, '260813');
  const segment = addSegment(source, contextId);
  const backup = createFullBackup(source, { backupId: 'backup-fixture-004', exportedAtMs: NOW });
  const duplicate = stageDataOperation(source, { type: DATA_COMMANDS.RESTORE_BACKUP, mode: 'MERGE', input: backup });
  assert.equal(duplicate.plan.blocked, false);
  assert.equal(duplicate.plan.summary.duplicates, 1);
  assert.equal(duplicate.plan.summary.segmentsAdded, 0);
  const conflicting = structuredClone(backup);
  conflicting.ledgerSegments[0].endAtMs += 1_000;
  conflicting.ledgerSegments[0].durationMs += 1_000;
  const staged = stageDataOperation(source, { type: DATA_COMMANDS.RESTORE_BACKUP, mode: 'MERGE', input: conflicting });
  assert.equal(staged.plan.blocked, true);
  assert.equal(staged.plan.conflicts[0].code, 'SEGMENT_ID_CONFLICT');
  assert.equal(source.ledger[0].endAtMs, segment.endAtMs);
});

test('UT-B4-BACKUP-005 temporal overlaps and hard Context identity conflicts never silently sum', () => {
  const current = documentFixture();
  const first = addContext(current, '260814');
  addSegment(current, first);
  const incomingDocument = documentFixture();
  const second = addContext(incomingDocument, '260815');
  addSegment(incomingDocument, second, { suffix: 'incoming' });
  const overlap = createFullBackup(incomingDocument, { backupId: 'backup-fixture-005', exportedAtMs: NOW });
  const staged = stageDataOperation(current, { type: DATA_COMMANDS.RESTORE_BACKUP, mode: 'MERGE', input: overlap });
  assert.equal(staged.plan.conflicts[0].code, 'TEMPORAL_OVERLAP_CONFLICT');

  const identity = structuredClone(overlap);
  identity.contexts[0].contextId = first;
  identity.contexts[0].projectId = '999999';
  identity.ledgerSegments[0].contextId = first;
  const identityConflict = stageDataOperation(current, { type: DATA_COMMANDS.RESTORE_BACKUP, mode: 'MERGE', input: identity });
  assert.equal(identityConflict.plan.conflicts[0].code, 'HARD_CONTEXT_IDENTITY_CONFLICT');
});

test('UT-B4-BACKUP-006 Recovery Evidence finalizes only through lastVerified and dedupes a finalized Session', () => {
  const base = documentFixture();
  const contextId = addContext(base, '260816');
  const backup = createFullBackup(base, { backupId: 'backup-fixture-006', exportedAtMs: NOW });
  const withRecovery = structuredClone(backup);
  withRecovery.recoveryEvidence = [{ disposition: 'NON_LIVE_RECOVERY_EVIDENCE', contextId, sessionId: 'recovery-session', cycleId: 'recovery-cycle',
    startedAtMs: NOW - 10_000, lastVerifiedAtMs: NOW - 4_000, checkpointedAtMs: NOW, source: 'fixture' }];
  withRecovery.recordCounts.recoveryEvidence = 1;
  const target = documentFixture();
  const staged = stageDataOperation(target, { type: DATA_COMMANDS.RESTORE_BACKUP, mode: 'MERGE', input: withRecovery });
  assert.equal(staged.candidate.ledger.reduce((sum, row) => sum + row.durationMs, 0), 6_000);
  assert.equal(staged.candidate.timer.active, null);
  const committedDocument = committed(target, { type: DATA_COMMANDS.RESTORE_BACKUP, mode: 'MERGE', input: withRecovery }).document;
  const second = stageDataOperation(committedDocument, { type: DATA_COMMANDS.RESTORE_BACKUP, mode: 'MERGE', input: withRecovery });
  assert.equal(second.plan.summary.segmentsAdded, 0);
});

test('UT-B4-BACKUP-007 Replace requires quiescence, confirmation, and backup opportunity and restores no live state', () => {
  const source = documentFixture();
  addContext(source, '260817');
  const backup = createFullBackup(source, { backupId: 'backup-fixture-007', exportedAtMs: NOW });
  const target = documentFixture();
  const request = { type: DATA_COMMANDS.RESTORE_BACKUP, mode: 'REPLACE', input: backup };
  const staged = stageDataOperation(target, request);
  assert.ok(staged.plan.requiredConfirmations.includes('RESTORE_REPLACE'));
  assert.throws(() => commitStagedDataOperation(target, { request, stagedRevision: 0, planId: staged.plan.planId,
    confirmationTokens: ['RESTORE_REPLACE'] }, { nowMs: NOW }), /data-pre-backup-opportunity-required/);
  const result = commitStagedDataOperation(target, { request, stagedRevision: 0, planId: staged.plan.planId,
    confirmationTokens: ['RESTORE_REPLACE'], preBackupDisposition: 'CREATED' }, { nowMs: NOW });
  assert.equal(result.document.timer.active, null);
  assert.equal(result.document.timer.pending, null);
  assert.equal(result.document.timer.localPause, null);
});

test('UT-B4-BACKUP-011 Replace keeps local settings when selected and restores activity only by explicit choice', () => {
  const source = documentFixture();
  addContext(source, '260829');
  source.dataSafety.preferences = preferenceStorage({ ...DEFAULT_PREFERENCES, timerAppearance: 'DARK' }, 1);
  source.dataSafety.activityLog.push({ eventId: 'source-event', type: 'SOURCE', atMs: NOW - 1 });
  const backup = createFullBackup(source, { backupId: 'backup-options', exportedAtMs: NOW });

  const target = documentFixture();
  target.dataSafety.preferences = preferenceStorage({ ...DEFAULT_PREFERENCES, timerAppearance: 'LIGHT' }, 2);
  target.dataSafety.activityLog.push({ eventId: 'target-event', type: 'TARGET', atMs: NOW - 1 });
  const keep = stageDataOperation(target, { type: DATA_COMMANDS.RESTORE_BACKUP, mode: 'REPLACE', input: backup,
    importPreferences: false, restoreActivity: false }).candidate;
  assert.equal(keep.dataSafety.preferences.timerAppearance, 'LIGHT');
  assert.equal(keep.dataSafety.activityLog[0].eventId, 'target-event');
  assert.equal(keep.timer.active, null);

  const restore = stageDataOperation(target, { type: DATA_COMMANDS.RESTORE_BACKUP, mode: 'REPLACE', input: backup,
    importPreferences: true, restoreActivity: true }).candidate;
  assert.equal(restore.dataSafety.preferences.timerAppearance, 'DARK');
  assert.equal(restore.dataSafety.activityLog[0].eventId, 'source-event');
  assert.equal(restore.timer.active, null);
});

test('UT-B4-BACKUP-008 imported workspace cannot archive or hide a protected current Context', () => {
  const current = documentFixture();
  const contextId = addContext(current, '260818');
  current.timer.pending = { contextId, safeStartAnchorMs: NOW - 1_000, lastContinuityVerifiedAtMs: NOW, continuityState: 'VALID' };
  const backup = createFullBackup(current, { backupId: 'backup-fixture-008', exportedAtMs: NOW });
  const incoming = structuredClone(backup);
  incoming.workspace.memberships[contextId] = { workspaceMembership: 'ARCHIVED', archivedAtMs: NOW };
  incoming.workspace.hiddenContextIds = [contextId];
  const staged = stageDataOperation(current, { type: DATA_COMMANDS.RESTORE_BACKUP, mode: 'MERGE', input: incoming, importWorkspace: true });
  assert.equal(staged.candidate.contexts[contextId].workspaceMembership, 'RECENT');
  assert.equal(staged.plan.summary.workspaceWishesSkipped, 1);
});

test('UT-B4-BACKUP-009 independent legacy balance lineages conflict and repeated lineage dedupes', () => {
  const current = documentFixture();
  const contextId = addContext(current, '260819', { legacyUnattributedMs: 10_000, lineageId: 'lineage-current' });
  const incomingDocument = documentFixture();
  addContext(incomingDocument, '260819', { legacyUnattributedMs: 8_000, lineageId: 'lineage-incoming' });
  const incoming = createFullBackup(incomingDocument, { backupId: 'backup-fixture-009', exportedAtMs: NOW });
  const conflict = stageDataOperation(current, { type: DATA_COMMANDS.RESTORE_BACKUP, mode: 'MERGE', input: incoming });
  assert.equal(conflict.plan.conflicts[0].code, 'LEGACY_BALANCE_LINEAGE_CONFLICT');
  const same = structuredClone(incoming);
  same.legacyBalances[0].lineageId = 'lineage-current';
  const duplicate = stageDataOperation(current, { type: DATA_COMMANDS.RESTORE_BACKUP, mode: 'MERGE', input: same });
  assert.equal(duplicate.plan.blocked, false);
  assert.equal(duplicate.candidate.contexts[contextId].legacyUnattributedMs, 10_000);
});

test('UT-B4-CSV-001 canonical History CSV round-trips precise rows and duplicate import adds no time', () => {
  const source = documentFixture();
  const contextId = addContext(source, '260820');
  addSegment(source, contextId);
  const csv = createHistoryCsv(source);
  assert.ok(csv.text.includes(HISTORY_CSV_SCHEMA));
  const target = documentFixture();
  const once = committed(target, { type: DATA_COMMANDS.IMPORT_HISTORY_CSV, input: csv.text }).document;
  assert.equal(once.ledger[0].durationMs, source.ledger[0].durationMs);
  const twice = stageDataOperation(once, { type: DATA_COMMANDS.IMPORT_HISTORY_CSV, input: csv.text });
  assert.equal(twice.plan.summary.segmentsAdded, 0);
  assert.equal(twice.plan.summary.duplicates, 1);
});

test('UT-B4-CSV-002 canonical ambiguous timestamps and duration mismatches require review', () => {
  const header = 'schema_version,record_type,context_id,context_kind,project_id,context_label,segment_id,session_id,cycle_id,start_at_iso,end_at_iso,duration_ms,local_date,workday_zone';
  const ambiguous = `${header}\n${HISTORY_CSV_SCHEMA},SEGMENT,job:260821,job,260821,Job,seg,session,cycle,2026-08-28T10:00:00,2026-08-28T10:01:00Z,60000,2026-08-28,UTC`;
  assert.throws(() => normalizeHistoryCsv(ambiguous), error => error.message === 'history-csv-review-required' && error.invalidRows[0].code === 'csv-timestamp-ambiguous');
  const mismatch = `${header}\n${HISTORY_CSV_SCHEMA},SEGMENT,job:260821,job,260821,Job,seg,session,cycle,2026-08-28T10:00:00Z,2026-08-28T10:01:00Z,1,2026-08-28,UTC`;
  assert.throws(() => normalizeHistoryCsv(mismatch), error => error.message === 'history-csv-review-required' && error.invalidRows[0].code === 'csv-duration-timestamp-mismatch');
});

test('UT-B4-CSV-003 reviewed partial CSV requires the exact rejected row set', () => {
  const source = documentFixture();
  const contextId = addContext(source, '260822');
  addSegment(source, contextId);
  const csv = createHistoryCsv(source).text + `\r\n${HISTORY_CSV_SCHEMA},BOGUS,job:260822,job,260822,Job`;
  assert.throws(() => normalizeHistoryCsv(csv), /history-csv-review-required/);
  assert.throws(() => normalizeHistoryCsv(csv, { excludedRows: [999] }), /history-csv-reviewed-subset-invalid/);
  const parsed = normalizeHistoryCsv(csv, { excludedRows: [3] });
  assert.deepEqual(parsed.reviewedExcludedRows, [3]);
  assert.equal(parsed.segments.length, 1);
});

test('UT-B4-CSV-004 v0.7 CSV uses timestamp precedence and keeps duration-only evidence undated', () => {
  const csv = [
    'schema,record_type,context_key,context_type,project_id,short_label,label,total_ms,session_id,session_cycle_id,session_start_at,session_end_at,session_duration_ms',
    `${LEGACY_HISTORY_CSV_SCHEMA},context,job:260823,job,260823,260823,Legacy,10000,,,,,,`,
    `${LEGACY_HISTORY_CSV_SCHEMA},session,job:260823,job,260823,260823,Legacy,,session-a,cycle-a,${NOW - 5000},${NOW - 2000},9999`,
    `${LEGACY_HISTORY_CSV_SCHEMA},session,job:260823,job,260823,260823,Legacy,,session-b,cycle-a,,,2000`
  ].join('\r\n');
  const parsed = normalizeHistoryCsv(csv);
  assert.equal(parsed.segments.reduce((sum, row) => sum + row.durationMs, 0), 3_000);
  assert.equal(parsed.balances[0].durationMs, 7_000);
  assert.equal(parsed.segments.some(row => row.sessionId === 'session-b'), false);
});

test('UT-B4-CSV-005 formula-like user text is escaped and restored without changing stored identity', () => {
  const source = documentFixture();
  const contextId = addContext(source, '260824', { label: '=HYPERLINK("bad")' });
  addSegment(source, contextId);
  const csv = createHistoryCsv(source);
  assert.ok(csv.text.includes("'=HYPERLINK"));
  const parsed = normalizeHistoryCsv(csv.text);
  assert.equal(parsed.contexts[0].currentLabel, '=HYPERLINK("bad")');
  assert.equal(parsed.contexts[0].contextId, contextId);
});

test('UT-B4-CSV-006 Time Report is reporting-only and cannot be imported as history authority', () => {
  const document = documentFixture();
  const contextId = addContext(document, '260825');
  addSegment(document, contextId);
  const report = createTimeReportCsv(document, { atMs: NOW });
  assert.ok(report.text.includes(REPORT_CSV_SCHEMA));
  assert.throws(() => normalizeHistoryCsv(report.text), /time-report-csv-not-importable/);
});

test('UT-B4-CSV-007 oversized untrusted inputs reject rather than truncate into success', () => {
  assert.throws(() => normalizeHistoryCsv('x'.repeat(MAX_INPUT_BYTES + 1)), /external-file-size-limit-exceeded/);
});

test('UT-B4-CSV-008 exported History CSV remains within its import limit', () => {
  const small = documentFixture();
  const contextId = addContext(small, '260830');
  addSegment(small, contextId);
  const text = createHistoryCsv(small).text;
  assert.ok(Buffer.byteLength(text) <= MAX_INPUT_BYTES);
  assert.equal(normalizeHistoryCsv(text).segments.length, 1);

  const oversized = documentFixture();
  for (let index = 0; index < Math.ceil(MAX_INPUT_BYTES / 7_900) + 1; index += 1) {
    addContext(oversized, String(260831 + index), { label: 'x'.repeat(7_900), legacyUnattributedMs: 1 });
  }
  assert.throws(() => createHistoryCsv(oversized), /history-csv-export-size-limit-exceeded/);
});

test('UT-B4-DATA-007 stale plan fingerprints and missing destructive confirmations cannot commit', () => {
  const document = documentFixture();
  const contextId = addContext(document, '260826');
  const request = { type: DATA_COMMANDS.DELETE_CONTEXT, contextId };
  const staged = stageDataOperation(document, request);
  assert.throws(() => commitStagedDataOperation({ ...document, revision: 1 }, { request, stagedRevision: 0, planId: staged.plan.planId }, { nowMs: NOW }), /data-staged-revision-stale/);
  assert.throws(() => commitStagedDataOperation(document, { request, stagedRevision: 0, planId: 'plan-wrong' }, { nowMs: NOW }), /data-plan-fingerprint-mismatch/);
  assert.throws(() => commitStagedDataOperation(document, { request, stagedRevision: 0, planId: staged.plan.planId }, { nowMs: NOW }), /data-confirmation-required/);
});

test('UT-B4-DATA-008 the data read model exposes archives without becoming another time authority', () => {
  const document = documentFixture();
  const contextId = addContext(document, '260827', { membership: 'ARCHIVED' });
  addSegment(document, contextId);
  const view = createDataSafetyReadModel(document);
  assert.equal(view.archivedRows.length, 1);
  assert.equal(view.archivedRows[0].totalMs, 30_000);
  assert.equal('ledger' in view, false);
  validateDocument(document);
});

test('UT-B4-DATA-009 unresolved checkpoint and recovery candidates remain protected from archive', () => {
  const checkpointDocument = documentFixture();
  const checkpointId = addContext(checkpointDocument, '260819');
  checkpointDocument.checkpoint = {
    schemaVersion: 1,
    runtimeInstanceId: 'runtime-checkpoint',
    contextId: checkpointId,
    sessionId: 'session-checkpoint',
    cycleId: 'cycle-checkpoint',
    startedAtMs: NOW - 5_000,
    lastVerifiedAtMs: NOW - 1_000,
    checkpointedAtMs: NOW,
    terminationDisposition: 'UNEXPECTED_INTERRUPTION',
    buildVersion: 'fixture',
    source: 'companion',
    ownershipEvidence: {
      disposition: 'OWNER',
      ownerRuntimeId: 'runtime-checkpoint',
      coordinationEpoch: 1,
      fencingToken: 'fence-checkpoint'
    }
  };
  assert.equal(createDataSafetyReadModel(checkpointDocument).recentRows[0].protected, true);
  assert.throws(() => stageDataOperation(checkpointDocument, {
    type: DATA_COMMANDS.ARCHIVE_CONTEXT,
    contextId: checkpointId,
    atMs: NOW
  }), /data-context-protected/);
  const cleanCheckpointDocument = structuredClone(checkpointDocument);
  cleanCheckpointDocument.checkpoint.terminationDisposition = 'CLEAN_TEARDOWN';
  assert.equal(stageDataOperation(cleanCheckpointDocument, {
    type: DATA_COMMANDS.ARCHIVE_CONTEXT,
    contextId: checkpointId,
    atMs: NOW
  }).plan.blocked, false);
  assert.equal(stageDataOperation(cleanCheckpointDocument, {
    type: DATA_COMMANDS.WIPE_HISTORY
  }).plan.blocked, false);

  const recoveryDocument = documentFixture();
  const recoveryId = addContext(recoveryDocument, '260820');
  recoveryDocument.migration.recoveryCandidates = {
    localPause: {
      kind: 'LEGACY_LOCAL_PAUSE',
      live: false,
      contextId: recoveryId,
      cycleId: 'cycle-recovery',
      pausedAtMs: NOW - 1_000,
      source: 'fixture'
    }
  };
  assert.equal(createDataSafetyReadModel(recoveryDocument).recentRows[0].protected, true);
  assert.throws(() => stageDataOperation(recoveryDocument, {
    type: DATA_COMMANDS.ARCHIVE_CONTEXT,
    contextId: recoveryId,
    atMs: NOW
  }), /data-context-protected/);

  const activeRecoveryDocument = documentFixture();
  const activeRecoveryId = addContext(activeRecoveryDocument, '260821');
  activeRecoveryDocument.migration.recoveryCandidates = {
    active: { kind: 'LEGACY_ACTIVE', contextId: activeRecoveryId, sessionId: 'session-recovery',
      cycleId: 'cycle-active-recovery', startedAtMs: NOW - 2_000, source: 'fixture' }
  };
  assert.equal(createDataSafetyReadModel(activeRecoveryDocument).recentRows[0].protected, true);

  const unrelatedDocument = documentFixture();
  const unrelatedId = addContext(unrelatedDocument, '260822');
  unrelatedDocument.migration.recoveryCandidates = { diagnostics: { nested: { contextId: unrelatedId } } };
  assert.equal(createDataSafetyReadModel(unrelatedDocument).recentRows[0].protected, false);
  assert.equal(stageDataOperation(unrelatedDocument, {
    type: DATA_COMMANDS.ARCHIVE_CONTEXT, contextId: unrelatedId, atMs: NOW
  }).plan.blocked, false);
});

test('UT-B4-DATA-010 a protection transition after staging prevents the stale Archive commit', () => {
  const document = documentFixture();
  const contextId = addContext(document, '260823');
  const request = { type: DATA_COMMANDS.ARCHIVE_CONTEXT, contextId, atMs: NOW };
  const staged = stageDataOperation(document, request, { nowMs: NOW });
  document.timer.pending = { contextId, safeStartAnchorMs: NOW - 1_000, lastContinuityVerifiedAtMs: NOW - 500, continuityState: 'VALID' };
  const before = structuredClone(document);
  assert.throws(() => commitStagedDataOperation(document, {
    request,
    stagedRevision: staged.plan.stagedRevision,
    planId: staged.plan.planId,
    operationId: 'operation-protection-transition',
    confirmationTokens: staged.plan.requiredConfirmations
  }, { nowMs: NOW }), /data-context-protected|data-plan-stale/);
  assert.deepEqual(document, before);
});

test('UT-B4-DATA-011 archive requires a currently Recent and unarchived Context at stage and commit', () => {
  const inactiveDocument = documentFixture();
  const inactiveId = addContext(inactiveDocument, '260824', { membership: 'INACTIVE_NON_RECENT' });
  const inactiveBefore = structuredClone(inactiveDocument);
  assert.throws(() => stageDataOperation(inactiveDocument, {
    type: DATA_COMMANDS.ARCHIVE_CONTEXT,
    contextId: inactiveId,
    atMs: NOW
  }), /data-context-not-recent/);
  assert.deepEqual(inactiveDocument, inactiveBefore);

  const archivedDocument = documentFixture();
  const archivedId = addContext(archivedDocument, '260825', { membership: 'ARCHIVED' });
  const archivedBefore = structuredClone(archivedDocument);
  assert.throws(() => stageDataOperation(archivedDocument, {
    type: DATA_COMMANDS.ARCHIVE_CONTEXT,
    contextId: archivedId,
    atMs: NOW
  }), /data-context-not-recent/);
  assert.deepEqual(archivedDocument, archivedBefore);

  const racedDocument = documentFixture();
  const racedId = addContext(racedDocument, '260826');
  const request = { type: DATA_COMMANDS.ARCHIVE_CONTEXT, contextId: racedId, atMs: NOW };
  const staged = stageDataOperation(racedDocument, request, { nowMs: NOW });
  racedDocument.contexts[racedId].workspaceMembership = 'INACTIVE_NON_RECENT';
  const racedBefore = structuredClone(racedDocument);
  assert.throws(() => commitStagedDataOperation(racedDocument, {
    request,
    stagedRevision: staged.plan.stagedRevision,
    planId: staged.plan.planId,
    operationId: 'operation-membership-transition',
    confirmationTokens: staged.plan.requiredConfirmations
  }, { nowMs: NOW }), /data-context-not-recent/);
  assert.deepEqual(racedDocument, racedBefore);
});
