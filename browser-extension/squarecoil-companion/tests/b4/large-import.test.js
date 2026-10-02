'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createEmptyDocument, validateDocument } = require('../../src/data/model');
const { splitInterval } = require('../../src/data/ledger');
const { DEFAULT_PREFERENCES, preferenceStorage } = require('../../src/preferences/preferences');
const { DATA_COMMANDS, createFullBackup, normalizeBackup, stageDataOperation, commitStagedDataOperation } = require('../../src/data/data-safety');
const { deriveTabWorkspace } = require('../../src/workspace/model');

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-12-03T15:00:00Z');
const FIRST_START = Date.parse('2024-01-01T04:30:00Z');
const LARGE_SESSION_COUNT = 960;

function addContext(document, projectId) {
  const contextId = `job:${projectId}`;
  document.contexts[contextId] = { contextId, kind: 'job', projectId: String(projectId),
    currentLabel: `Synthetic import job ${projectId}`, shortLabel: String(projectId), aliases: [],
    createdAtMs: FIRST_START, lastSeenAtMs: NOW - 100_000, workspaceMembership: 'RECENT',
    archivedAtMs: null, legacyUnattributedMs: 0 };
  return contextId;
}

function sourceFixture(sessionCount = LARGE_SESSION_COUNT) {
  const document = createEmptyDocument({ nowMs: NOW, workdayZone: 'America/New_York', datasetId: 'synthetic-large-source' });
  const contextIds = Array.from({ length: 20 }, (_, index) => addContext(document, 880000 + index));
  const expectedSessions = [];
  for (let index = 0; index < sessionCount; index += 1) {
    const startAtMs = FIRST_START + index * DAY_MS;
    const durationMs = 3 * 60 * 60 * 1000 + index % 97;
    const interval = { sessionId: `synthetic-session-${index}`, cycleId: `synthetic-cycle-${index}`,
      contextId: contextIds[index % contextIds.length], startAtMs, endAtMs: startAtMs + durationMs,
      workdayZone: document.workdayZone, source: 'synthetic-import-fixture', certainty: 'VERIFIED',
      createdAtMs: startAtMs + durationMs };
    document.ledger.push(...splitInterval(interval));
    expectedSessions.push(interval);
  }
  // A source's operational state is deliberately not a portable restore instruction.
  document.timer.pending = { contextId: contextIds[0], safeStartAnchorMs: NOW - 1_000,
    lastContinuityVerifiedAtMs: NOW - 500, continuityState: 'VALID' };
  document.dataSafety.preferences = preferenceStorage({ ...DEFAULT_PREFERENCES, timerAppearance: 'DARK' }, 1);
  document.dataSafety.workspace = { order: contextIds, hiddenContextIds: [] };
  const backup = createFullBackup(document, { backupId: `synthetic-large-${sessionCount}`, exportedAtMs: NOW,
    appVersion: '0.7.1', includeActivity: false });
  return { document, backup, expectedSessions };
}

function commit(document, request, operationId) {
  const staged = stageDataOperation(document, request, { nowMs: NOW });
  assert.equal(staged.plan.blocked, false);
  const result = commitStagedDataOperation(document, { request, stagedRevision: staged.plan.stagedRevision,
    planId: staged.plan.planId, operationId, confirmationTokens: staged.plan.requiredConfirmations }, { nowMs: NOW });
  return { staged, document: result.document };
}

function totalsByContextAndDay(rows) {
  const totals = {};
  for (const row of rows) {
    const key = `${row.contextId}|${row.localDate}|${row.workdayZone}`;
    totals[key] = (totals[key] || 0) + row.durationMs;
  }
  return totals;
}

function assertHistoricalSessions(document, expectedSessions) {
  const groups = new Map();
  for (const row of document.ledger) {
    if (!groups.has(row.sessionId)) groups.set(row.sessionId, []);
    groups.get(row.sessionId).push(row);
  }
  for (const expected of expectedSessions) {
    const rows = groups.get(expected.sessionId).sort((a, b) => a.startAtMs - b.startAtMs);
    assert.equal(rows[0].startAtMs, expected.startAtMs);
    assert.equal(rows.at(-1).endAtMs, expected.endAtMs);
    assert.ok(rows.every(row => row.contextId === expected.contextId && row.cycleId === expected.cycleId));
    for (let index = 1; index < rows.length; index += 1) assert.equal(rows[index - 1].endAtMs, rows[index].startAtMs);
    assert.equal(rows.reduce((sum, row) => sum + row.durationMs, 0), expected.endAtMs - expected.startAtMs);
  }
}

test('UT-B4-IMPORT-PERF-001 a large normalized backup commits twice with exact dates totals and no file-derived clock', () => {
  const { document: source, backup, expectedSessions } = sourceFixture();
  const sourceBefore = structuredClone(source);
  const input = JSON.stringify(backup);
  const normalized = normalizeBackup(input);
  assert.ok(normalized.segments.length > 1_000);
  assert.equal(new Set(normalized.segments.map(row => row.sessionId)).size, LARGE_SESSION_COUNT);
  assert.deepEqual(normalized.segments, backup.ledgerSegments);
  assert.equal(Object.hasOwn(backup, 'timer'), false);
  const target = createEmptyDocument({ nowMs: NOW, workdayZone: 'UTC', datasetId: 'synthetic-large-target' });
  const before = structuredClone(target);
  const request = { type: DATA_COMMANDS.RESTORE_BACKUP, mode: 'MERGE', input,
    importWorkspace: true, importPreferences: false };

  const originalFormatter = Intl.DateTimeFormat;
  let constructions = 0;
  Intl.DateTimeFormat = new Proxy(originalFormatter, { construct(constructor, args) {
    constructions += 1;
    return Reflect.construct(constructor, args);
  } });
  let first;
  let second;
  try {
    normalizeBackup(input);
    first = commit(target, request, 'synthetic-large-first');
    second = commit(first.document, request, 'synthetic-large-repeat');
    validateDocument(second.document);
  } finally { Intl.DateTimeFormat = originalFormatter; }
  assert.equal(constructions, 0, 'warmed import validation must reuse Intl helpers rather than construct them per ledger row');
  assert.equal(first.staged.plan.summary.segmentsAdded, backup.ledgerSegments.length);
  assert.equal(second.staged.plan.summary.segmentsAdded, 0);
  assert.equal(second.staged.plan.summary.contextsAdded, 0);
  assert.equal(second.staged.plan.summary.duplicates, backup.ledgerSegments.length);
  for (const result of [first.document, second.document]) {
    assert.equal(result.ledger.length, backup.ledgerSegments.length);
    assert.deepEqual(totalsByContextAndDay(result.ledger), totalsByContextAndDay(backup.ledgerSegments));
    assertHistoricalSessions(result, expectedSessions);
    assert.equal(result.workdayZone, 'UTC', 'Merge preserves the current future-attribution zone');
    assert.deepEqual(result.timer, target.timer);
    assert.equal(result.checkpoint, null);
    assert.deepEqual(result.dataSafety.preferences, target.dataSafety.preferences);
  }
  assert.deepEqual(source, sourceBefore);
  assert.deepEqual(target, before);
});

test('UT-B4-IMPORT-PERF-002 large Merge preserves a protected live target and local settings despite imported workspace wishes', () => {
  const { backup } = sourceFixture(320);
  const incoming = structuredClone(backup);
  const contextId = incoming.contexts[0].contextId;
  incoming.workspace.memberships[contextId] = { workspaceMembership: 'ARCHIVED', archivedAtMs: NOW };
  incoming.workspace.hiddenContextIds = [contextId];
  const target = createEmptyDocument({ nowMs: NOW, workdayZone: 'UTC', datasetId: 'synthetic-protected-target' });
  addContext(target, contextId.slice(4));
  target.timer.active = { contextId, sessionId: 'synthetic-current-session', cycleId: 'synthetic-current-cycle',
    startedAtMs: NOW - 2_000, lastVerifiedAtMs: NOW - 1_000, accrualOwnerToken: 'synthetic-owner',
    source: 'synthetic-live-target', certainty: 'VERIFIED', safetyHold: null };
  target.dataSafety.preferences = preferenceStorage({ ...DEFAULT_PREFERENCES, timerAppearance: 'LIGHT' }, 2);
  const before = structuredClone(target);
  const request = { type: DATA_COMMANDS.RESTORE_BACKUP, mode: 'MERGE', input: incoming,
    importWorkspace: true, importPreferences: false };
  const first = commit(target, request, 'synthetic-protected-first');
  const second = commit(first.document, request, 'synthetic-protected-repeat');
  assert.equal(first.staged.plan.summary.workspaceWishesSkipped, 1);
  for (const result of [first.document, second.document]) {
    assert.deepEqual(result.timer, before.timer);
    assert.equal(result.checkpoint, before.checkpoint);
    assert.deepEqual(result.dataSafety.preferences, before.dataSafety.preferences);
    assert.equal(result.contexts[contextId].workspaceMembership, 'RECENT');
    const workspace = deriveTabWorkspace(Object.values(result.contexts), {
      durableOrder: result.dataSafety.workspace.order,
      hiddenContextIds: result.dataSafety.workspace.hiddenContextIds,
      operationalContextId: result.timer.active.contextId
    });
    assert.equal(workspace.dispositionByContextId[contextId], 'VISIBLE', 'operational accessibility wins over imported hide wishes');
    assert.deepEqual(totalsByContextAndDay(result.ledger), totalsByContextAndDay(backup.ledgerSegments));
  }
  assert.equal(second.staged.plan.summary.segmentsAdded, 0);
  assert.deepEqual(target, before);
});

test('UT-B4-IMPORT-PERF-003 warmed large imports still block historical and current active overlaps atomically', () => {
  const { backup } = sourceFixture(120);
  const target = createEmptyDocument({ nowMs: NOW, workdayZone: 'UTC', datasetId: 'synthetic-overlap-target' });
  const contextId = backup.ledgerSegments[0].contextId;
  addContext(target, contextId.slice(4));
  target.ledger = [structuredClone(backup.ledgerSegments[0])];
  normalizeBackup(backup);
  const historical = structuredClone(backup);
  historical.ledgerSegments[0].segmentId = 'synthetic-conflicting-segment';
  historical.ledgerSegments[0].sessionId = 'synthetic-conflicting-session';
  historical.ledgerSegments[0].startAtMs += 1_000;
  historical.ledgerSegments[0].durationMs -= 1_000;
  const active = structuredClone(backup);
  target.timer.active = { contextId, sessionId: 'synthetic-live-overlap', cycleId: 'synthetic-live-cycle',
    startedAtMs: NOW - 2_000, lastVerifiedAtMs: NOW - 500, accrualOwnerToken: 'synthetic-owner' };
  active.ledgerSegments.push(...splitInterval({ sessionId: 'synthetic-incoming-overlap', cycleId: 'synthetic-incoming-cycle',
    contextId: active.contexts[1].contextId, startAtMs: NOW - 1_500, endAtMs: NOW - 1_000,
    workdayZone: 'America/New_York', createdAtMs: NOW }));
  active.recordCounts.ledgerSegments = active.ledgerSegments.length;
  const before = structuredClone(target);
  for (const input of [historical, active]) {
    const request = { type: DATA_COMMANDS.RESTORE_BACKUP, mode: 'MERGE', input };
    const staged = stageDataOperation(target, request, { nowMs: NOW });
    assert.equal(staged.plan.blocked, true);
    assert.ok(staged.plan.conflicts.some(conflict => conflict.code === 'TEMPORAL_OVERLAP_CONFLICT'));
    assert.throws(() => commitStagedDataOperation(target, { request, stagedRevision: staged.plan.stagedRevision,
      planId: staged.plan.planId, operationId: 'synthetic-blocked', confirmationTokens: [] }, { nowMs: NOW }),
    /data-plan-conflicts-unresolved/);
    assert.deepEqual(target, before);
  }
});

test('UT-B4-IMPORT-PERF-004 a warmed previously valid backup rejects mutated duration date and zone without touching the target', () => {
  const { backup } = sourceFixture(120);
  const mutations = [
    { apply: input => { input.ledgerSegments[0].durationMs += 1; }, error: /segment-duration-mismatch/ },
    { apply: input => { input.ledgerSegments[0].localDate = '2026-02-30'; }, error: /local-date-invalid/ },
    { apply: input => { input.ledgerSegments[0].workdayZone = 'Invalid/Imported_Zone'; }, error: /workday-zone-invalid/ },
    { apply: input => { input.workdayZone = '+03:00'; }, error: /workday-zone-offset-only/ }
  ];
  const target = createEmptyDocument({ nowMs: NOW, workdayZone: 'UTC', datasetId: 'synthetic-invalid-target' });
  const before = structuredClone(target);
  for (const mutation of mutations) {
    const input = structuredClone(backup);
    normalizeBackup(input);
    mutation.apply(input);
    assert.throws(() => normalizeBackup(input), mutation.error);
    assert.throws(() => stageDataOperation(target, { type: DATA_COMMANDS.RESTORE_BACKUP, mode: 'MERGE', input }), mutation.error);
    assert.deepEqual(target, before);
  }
});
