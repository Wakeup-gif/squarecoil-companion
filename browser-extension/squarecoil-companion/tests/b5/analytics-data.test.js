'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createEmptyDocument } = require('../../src/data/model');
const { splitInterval, createQueryService } = require('../../src/data/ledger');
const { createAnalyticsSnapshot } = require('../../src/presentation/analytics-data');

function context(document, id, values = {}) {
  const contextId = `job:${id}`;
  document.contexts[contextId] = { contextId, kind: 'job', projectId: id, currentLabel: `Job ${id}`, shortLabel: id,
    aliases: [], createdAtMs: 1, lastSeenAtMs: 1, archivedAtMs: null, workspaceMembership: 'RECENT', legacyUnattributedMs: 0, ...values };
  return contextId;
}
function interval(document, contextId, start, end, id = 'a', zone = document.workdayZone) {
  document.ledger.push(...splitInterval({ contextId, sessionId: id, cycleId: id, startAtMs: Date.parse(start), endAtMs: Date.parse(end),
    workdayZone: zone, createdAtMs: Date.parse(end) }));
}
test('UT-B5-DASH-DATA-001 canonical workday totals, scopes, links and undated legacy balances remain one read-only revision', () => {
  const atMs = Date.parse('2026-09-04T16:00:00Z');
  const document = createEmptyDocument({ nowMs: atMs, workdayZone: 'America/New_York' });
  const id = context(document, '101', { legacyUnattributedMs: 90000 });
  context(document, '202', { workspaceMembership: 'ARCHIVED', archivedAtMs: atMs - 1000 });
  context(document, '303', { workspaceMembership: 'INACTIVE_NON_RECENT' });
  interval(document, id, '2026-09-04T03:30:00Z', '2026-09-04T04:30:00Z');
  const before = structuredClone(document);
  const result = createAnalyticsSnapshot(document, { atMs, period: 'week' });
  const query = createQueryService(() => document);
  assert.equal(result.todayMs, query.getTodayTotal(atMs));
  assert.equal(result.todayMs, 1800000);
  assert.equal(result.weekMs, query.getWeekTotal(atMs));
  assert.equal(result.periodMs, 3600000);
  assert.equal(result.rows[0].totalMs, 3690000);
  assert.equal(result.legacyMs, 90000);
  assert.equal(result.rows[0].href, '/project.php?id=101');
  assert.deepEqual(result.scopeCounts, { tracked: 1, history: 1, archived: 1 });
  assert.equal(result.rows[0].values.reduce((sum, value) => sum + value, 0), result.rows[0].periodMs);
  assert.equal(result.revision, document.revision);
  assert.deepEqual(document, before);
});
test('UT-B5-DASH-DATA-002 day buckets respect 23/25-hour workdays and conserve canonical durations across repeated hours', () => {
  for (const [date, size, start, end] of [
    ['2026-11-01', 25, '2026-11-01T05:30:00Z', '2026-11-01T07:30:00Z'],
    ['2026-03-08', 23, '2026-03-08T06:30:00Z', '2026-03-08T08:30:00Z']
  ]) {
    const atMs = Date.parse(`${date}T20:00:00Z`);
    const document = createEmptyDocument({ nowMs: atMs, workdayZone: 'America/New_York' });
    const id = context(document, '101'); interval(document, id, start, end);
    const result = createAnalyticsSnapshot(document, { atMs, period: 'day', anchor: date });
    assert.equal(result.buckets.length, size);
    assert.equal(result.periodMs, 7200000);
    assert.equal(result.rows[0].values.reduce((sum, value) => sum + value, 0), result.periodMs);
    assert.equal(new Set(result.buckets.map(bucket => bucket.label)).size, size);
  }
});
test('UT-B5-DASH-DATA-003 uses canonical capped live contribution and retains protected/provisional truth', () => {
  const atMs = Date.parse('2026-09-04T16:00:00Z');
  const document = createEmptyDocument({ nowMs: atMs, workdayZone: 'UTC' });
  const id = context(document, '101');
  document.timer.active = { contextId: id, sessionId: 'live', cycleId: 'live', startedAtMs: atMs - 120000, lastVerifiedAtMs: atMs - 30000,
    source: 'fixture', certainty: 'VERIFIED_SERVER', accrualOwnerToken: 'owner', startCause: 'new-context',
    safetyHold: { holdAtMs: atMs - 30000, reason: 'verification-gap' }, provisionalSinceMs: atMs - 45000 };
  const result = createAnalyticsSnapshot(document, { atMs, period: 'day' });
  assert.equal(result.todayMs, 90000);
  assert.equal(result.periodMs, 90000);
  assert.equal(result.rows[0].values.reduce((sum, value) => sum + value, 0), 90000);
  assert.equal(result.rows[0].protected, true);
  assert.equal(result.rows[0].status, 'VERIFICATION_HOLD');
  assert.equal(result.safetyHeld, true);
});
test('UT-B5-DASH-DATA-004 empty data stays empty and more than 100 finalized sessions are not truncated', () => {
  const atMs = Date.parse('2026-09-04T20:00:00Z');
  const document = createEmptyDocument({ nowMs: atMs, workdayZone: 'UTC' });
  const empty = createAnalyticsSnapshot(document, { atMs });
  assert.equal(empty.hasRecordedTime, false); assert.equal(empty.rows.length, 0); assert.equal(empty.periodMs, 0);
  const id = context(document, '101');
  for (let index = 0; index < 150; index += 1) {
    const startAtMs = Date.parse('2026-09-04T10:00:00Z') + index * 120000;
    document.ledger.push(...splitInterval({ contextId: id, sessionId: `s${index}`, cycleId: `s${index}`, startAtMs, endAtMs: startAtMs + 60000, workdayZone: 'UTC', createdAtMs: atMs }));
  }
  const result = createAnalyticsSnapshot(document, { atMs, period: 'month' });
  assert.equal(result.periodMs, 150 * 60000);
  assert.equal(result.rows[0].values.reduce((sum, value) => sum + value, 0), result.periodMs);
});
test('UT-B5-DASH-DATA-005 saved zone changes preserve day attribution and decline ambiguous hourly redistribution', () => {
  const atMs = Date.parse('2026-09-04T20:00:00Z');
  const document = createEmptyDocument({ nowMs: atMs, workdayZone: 'UTC' });
  const id = context(document, '101');
  interval(document, id, '2026-09-04T04:00:00Z', '2026-09-04T05:00:00Z', 'saved-zone', 'America/New_York');
  const result = createAnalyticsSnapshot(document, { atMs, period: 'day' });
  assert.equal(result.periodMs, 3600000);
  assert.equal(result.intradayAvailable, false);
  assert.equal(result.rows[0].values, null);
});
