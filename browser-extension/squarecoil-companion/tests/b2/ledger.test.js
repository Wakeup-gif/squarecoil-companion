'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createEmptyDocument } = require('../../src/data/model');
const {
  localDateAt,
  splitInterval,
  dedupeSegments,
  createQueryService
} = require('../../src/data/ledger');

test('UT-B2-LEDGER-001 midnight split preserves exact duration and shared session identity', () => {
  const startAtMs = Date.parse('2024-01-02T04:30:00Z');
  const endAtMs = Date.parse('2024-01-02T05:30:00Z');
  const rows = splitInterval({
    sessionId: 's1',
    cycleId: 'c1',
    contextId: 'job:100001',
    startAtMs,
    endAtMs,
    workdayZone: 'America/New_York',
    startCause: 'new-context',
    endReason: 'native-clock-out',
    createdAtMs: endAtMs
  });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.localDate), ['2024-01-01', '2024-01-02']);
  assert.deepEqual(rows.map(row => row.durationMs), [30 * 60 * 1000, 30 * 60 * 1000]);
  assert.ok(rows.every(row => row.sessionId === 's1'));
});

test('UT-B2-LEDGER-002 DST uses real elapsed milliseconds instead of forced wall-clock duration', () => {
  const startAtMs = Date.parse('2024-03-10T06:30:00Z');
  const endAtMs = Date.parse('2024-03-10T07:30:00Z');
  const rows = splitInterval({
    sessionId: 'dst',
    cycleId: 'cycle',
    contextId: 'job:100002',
    startAtMs,
    endAtMs,
    workdayZone: 'America/New_York',
    createdAtMs: endAtMs
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].durationMs, 60 * 60 * 1000);
  assert.equal(localDateAt(startAtMs, 'America/New_York'), '2024-03-10');
});

test('UT-B2-LEDGER-003 rejects conflicting IDs and duplicate material intervals', () => {
  const base = splitInterval({
    sessionId: 's',
    cycleId: 'c',
    contextId: 'job:100003',
    startAtMs: 1000,
    endAtMs: 2000,
    workdayZone: 'UTC',
    createdAtMs: 2000
  })[0];
  assert.throws(
    () => dedupeSegments([base, { ...base, segmentId: 'copy' }]),
    /duplicate-segment-interval/
  );
  assert.equal(dedupeSegments([base, { ...base }]).length, 1);
  assert.throws(() => dedupeSegments([base, { ...base, endAtMs: 3000, durationMs: 2000 }]), /segment-id-conflict/);
});

test('UT-B2-LEDGER-004 queries count active once and exclude legacy balance from Today/Week', () => {
  const atMs = Date.parse('2024-01-03T12:00:00Z');
  const document = createEmptyDocument({ nowMs: atMs, workdayZone: 'UTC' });
  document.contexts['job:100004'] = {
    contextId: 'job:100004',
    kind: 'job',
    projectId: '100004',
    currentLabel: 'Job 100004',
    shortLabel: '100004',
    aliases: [],
    createdAtMs: atMs,
    lastSeenAtMs: atMs,
    workspaceMembership: 'RECENT',
    archivedAtMs: null,
    legacyUnattributedMs: 10 * 60 * 1000
  };
  document.ledger.push(...splitInterval({
    sessionId: 'historical',
    cycleId: 'cycle',
    contextId: 'job:100004',
    startAtMs: atMs - 2 * 60 * 60 * 1000,
    endAtMs: atMs - 60 * 60 * 1000,
    workdayZone: 'UTC',
    createdAtMs: atMs
  }));
  document.timer.active = {
    contextId: 'job:100004',
    sessionId: 'current',
    cycleId: 'cycle',
    startedAtMs: atMs - 30 * 60 * 1000,
    lastVerifiedAtMs: atMs - 10 * 60 * 1000,
    source: 'fixture',
    certainty: 'VERIFIED',
    accrualOwnerToken: 'token',
    startCause: 'resume',
    safetyHold: null
  };
  const queries = createQueryService(() => document, { now: () => atMs });
  assert.equal(queries.getContextToday('job:100004'), 90 * 60 * 1000);
  assert.equal(queries.getTodayTotal(), 90 * 60 * 1000);
  assert.equal(queries.getWeekTotal(), 90 * 60 * 1000);
  assert.equal(queries.getContextTotal('job:100004'), 100 * 60 * 1000);
  assert.deepEqual(queries.getContextByDay('job:100004'), [{
    localDate: '2024-01-03',
    durationMs: 90 * 60 * 1000
  }]);
  assert.deepEqual(queries.getDayByContext('2024-01-03'), [{
    contextId: 'job:100004',
    durationMs: 90 * 60 * 1000
  }]);
});
