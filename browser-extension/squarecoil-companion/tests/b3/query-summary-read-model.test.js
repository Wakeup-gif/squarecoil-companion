'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { createEmptyDocument, validateDocument } = require('../../src/data/model');
const { DAY_MS, createQueryService, localDateAt, splitInterval, virtualActiveSegments, weekStartDate } = require('../../src/data/ledger');
const { createQuerySummary } = require('../../src/data/query-summary');
const { createTimerReadModel, lastRecordedActivity } = require('../../src/timer/read-model');
const { createDataSafetyReadModel } = require('../../src/data/data-safety');

// Keep the unchanged canonical query service as the reference. Reload the read
// models in memory with this adapter to compare their complete public outputs,
// rather than testing only a few totals or maintaining a second Timer model.
function naiveSummary(document, atMs, options = {}) {
  const queries = createQueryService(() => document, { now: () => atMs });
  if (options.totalsOnly === true) return { getContextTotal: contextId => queries.getContextTotal(contextId) };
  const currentWeekStart = weekStartDate(atMs, document.workdayZone);
  const allSegments = [...document.ledger, ...virtualActiveSegments(document, atMs)];
  return {
    ...queries,
    todayDate: localDateAt(atMs, document.workdayZone),
    currentWeekStart,
    currentWeekEnd: new Date(Date.parse(`${currentWeekStart}T12:00:00Z`) + 7 * DAY_MS).toISOString().slice(0, 10),
    allSegments,
    getContextByDay: contextId => queries.getContextByDay(contextId, { atMs }),
    getContextRecordedTotal: contextId => document.ledger.filter(row => row.contextId === contextId)
      .reduce((total, row) => total + row.durationMs, 0),
    getLastRecordedActivity: contextId => lastRecordedActivity(document, contextId),
    getDaySummaries: () => {
      const days = new Map();
      for (const segment of allSegments) {
        const day = days.get(segment.localDate) || { durationMs: 0, contextIds: new Set(), top: new Map() };
        day.durationMs += segment.durationMs;
        day.contextIds.add(segment.contextId);
        day.top.set(segment.contextId, (day.top.get(segment.contextId) || 0) + segment.durationMs);
        days.set(segment.localDate, day);
      }
      return [...days.entries()].map(([localDate, day]) => {
        const top = [...day.top.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || null;
        return { localDate, durationMs: day.durationMs, contextCount: day.contextIds.size,
          topContextId: top?.[0] || null, topContextDurationMs: top?.[1] || 0 };
      }).sort((a, b) => b.localDate.localeCompare(a.localDate));
    }
  };
}

function referenceModule(relativePath) {
  const filename = path.resolve(__dirname, relativePath);
  const reference = new Module(filename, module);
  reference.filename = filename;
  reference.paths = Module._nodeModulePaths(path.dirname(filename));
  const requireFromSource = Module.createRequire(filename);
  reference.require = request => request.endsWith('/query-summary')
    ? { createQuerySummary: naiveSummary } : requireFromSource(request);
  reference._compile(fs.readFileSync(filename, 'utf8'), filename);
  return reference.exports;
}
const referenceTimer = referenceModule('../../src/timer/read-model.js');
const referenceData = referenceModule('../../src/data/data-safety.js');

function addContext(document, projectId, index = 0) {
  const contextId = projectId === null ? 'general:factory' : `job:${projectId}`;
  document.contexts[contextId] = { contextId, kind: projectId === null ? 'general' : 'job',
    ...(projectId === null ? {} : { projectId: String(projectId) }), currentLabel: `Synthetic context ${index}`,
    shortLabel: String(index), aliases: [], createdAtMs: 0, lastSeenAtMs: Math.max(0, document.updatedAtMs - index),
    workspaceMembership: index % 3 === 0 ? 'ARCHIVED' : 'RECENT',
    archivedAtMs: index % 3 === 0 ? Math.max(0, document.updatedAtMs - 1000) : null,
    legacyUnattributedMs: index * 17 };
  return contextId;
}

function fixture(seed, state, atMs) {
  const document = createEmptyDocument({ nowMs: atMs - 2000, workdayZone: 'America/New_York' });
  const ids = [30, 2, 101, 12, null, 20].map((id, index) => addContext(document, id, index));
  let randomState = seed;
  const random = limit => { randomState = (randomState * 1664525 + 1013904223) >>> 0; return randomState % limit; };
  const zones = ['America/New_York', 'UTC', 'Europe/London', 'Pacific/Kiritimati'];
  for (let index = 0; index < 64; index++) {
    const startAtMs = atMs - (3 + random(40)) * DAY_MS + random(20 * 3600000);
    const endAtMs = startAtMs + 1000 + random(4 * 3600000);
    document.ledger.push(...splitInterval({ sessionId: `synthetic-${seed}-${index}`, cycleId: `cycle-${index}`,
      contextId: ids[random(ids.length)], startAtMs, endAtMs, workdayZone: zones[random(zones.length)],
      createdAtMs: endAtMs, source: 'synthetic-summary', provenance: { fixture: seed, nested: ['retained'] } }));
  }
  // A zero row and equal totals test context/date presence and lexical tie order.
  for (const contextId of ids.slice(0, 2)) document.ledger.push({ segmentId: `zero-${contextId}`, sessionId: `zero-${contextId}`,
    cycleId: 'zero-cycle', contextId, startAtMs: atMs, endAtMs: atMs, durationMs: 0,
    localDate: localDateAt(atMs, document.workdayZone), workdayZone: document.workdayZone, createdAtMs: atMs });
  if (['ACTIVE', 'HELD', 'PROVISIONAL', 'FUTURE_START'].includes(state)) {
    const startedAtMs = state === 'FUTURE_START' ? atMs + 1000 : atMs - 28 * 3600000;
    document.timer.active = { contextId: ids[2], sessionId: 'live-summary', cycleId: 'live-cycle',
      startedAtMs, lastVerifiedAtMs: Math.max(startedAtMs, atMs - 10000), accrualOwnerToken: 'synthetic-owner',
      source: 'synthetic-current', certainty: 'VERIFIED',
      safetyHold: state === 'HELD' ? { holdAtMs: atMs - 4 * 3600000, reason: 'synthetic-hold' } : null,
      provisionalSinceMs: state === 'PROVISIONAL' ? atMs - 5000 : null };
  } else if (state === 'PENDING') document.timer.pending = { contextId: ids[2], safeStartAnchorMs: atMs - 10000,
    lastContinuityVerifiedAtMs: atMs - 5000, continuityState: 'VALID' };
  else if (state === 'PAUSED') document.timer.localPause = { contextId: ids[2], cycleId: 'paused-cycle', pausedAtMs: atMs - 5000 };
  validateDocument(document);
  return document;
}

function assertDeepFrozen(value) {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child);
}

test('UT-B3-SUMMARY-001 full read models match canonical naive queries across randomized DST and Timer states', () => {
  const states = ['IDLE', 'ACTIVE', 'HELD', 'PROVISIONAL', 'PENDING', 'PAUSED', 'FUTURE_START'];
  const dates = ['2026-03-09T04:01:00Z', '2026-11-02T05:01:00Z', '2026-10-01T04:00:00Z'];
  for (const [dateIndex, date] of dates.entries()) for (const [stateIndex, state] of states.entries()) {
    const atMs = Date.parse(date);
    const document = fixture(100 + dateIndex * 10 + stateIndex, state, atMs);
    const before = structuredClone(document);
    const views = [{ atMs, historyLimit: 3 }, { atMs: atMs + 7000, historyLimit: 500,
      selectedContextId: 'job:12', deviceTimeZone: 'Europe/London' }];
    for (const view of views) {
      const actual = createTimerReadModel(() => document, { now: () => atMs }).snapshot(view);
      const expected = referenceTimer.createTimerReadModel(() => document, { now: () => atMs }).snapshot(view);
      assert.deepEqual(actual, expected, `${date} ${state}`);
      assertDeepFrozen(actual);
    }
    const actualData = createDataSafetyReadModel(document);
    assert.deepEqual(actualData, referenceData.createDataSafetyReadModel(document));
    assertDeepFrozen(actualData);
    assert.deepEqual(document, before, 'Read models must not modify or freeze their mutable source');
    assert.equal(Object.isFrozen(document.ledger[0]), false);
  }
});

test('UT-B3-SUMMARY-002 every snapshot observes mutable same-revision edits and still rejects invalid records', () => {
  const atMs = Date.parse('2026-10-01T22:00:00Z');
  const document = fixture(77, 'IDLE', atMs);
  const model = createTimerReadModel(() => document, { now: () => atMs });
  const first = model.snapshot({ selectedContextId: 'job:12' });
  document.contexts['job:12'].legacyUnattributedMs += 1234;
  document.contexts['job:12'].currentLabel = 'Changed in the same revision';
  const second = model.snapshot({ selectedContextId: 'job:12' });
  assert.equal(second.selectedContextTotalMs, first.selectedContextTotalMs + 1234);
  assert.equal(second.contextDetails['job:12'].label, 'Changed in the same revision');
  assert.deepEqual(second, referenceTimer.createTimerReadModel(() => document, { now: () => atMs })
    .snapshot({ selectedContextId: 'job:12' }));
  assert.deepEqual(createDataSafetyReadModel(document), referenceData.createDataSafetyReadModel(document));
  document.ledger[0].durationMs += 1;
  assert.throws(() => model.snapshot(), /segment-duration-mismatch/);
  assert.throws(() => createDataSafetyReadModel(document), /segment-duration-mismatch/);
  document.ledger[0].durationMs -= 1;
  assert.deepEqual(model.snapshot(), referenceTimer.createTimerReadModel(() => document, { now: () => atMs }).snapshot());
});

test('UT-B3-SUMMARY-003 summaries visit each stored row once regardless of Context count or repeated queries', () => {
  const atMs = Date.parse('2026-10-01T22:00:00Z');
  for (const contextCount of [1, 100]) {
    const document = createEmptyDocument({ nowMs: atMs, workdayZone: 'UTC' });
    const ids = Array.from({ length: contextCount }, (_, index) => addContext(document, 880000 + index, index));
    for (let index = 0; index < 2048; index++) {
      const startAtMs = atMs - (index + 1) * 60000;
      document.ledger.push({ segmentId: `visit-${index}`, sessionId: `visit-${index}`, cycleId: 'visit-cycle',
        contextId: ids[index % ids.length], startAtMs, endAtMs: startAtMs + 1000, durationMs: 1000,
        localDate: new Date(startAtMs).toISOString().slice(0, 10), workdayZone: 'UTC' });
    }
    validateDocument(document);
    let visits = 0;
    const stored = document.ledger;
    document.ledger = new Proxy(stored, { get(target, key, receiver) {
      return key === Symbol.iterator ? function* () { for (const row of target) { visits++; yield row; } }
        : Reflect.get(target, key, receiver);
    } });
    const summary = createQuerySummary(document, atMs);
    assert.equal(visits, stored.length);
    for (const contextId of ids) for (let repeat = 0; repeat < 3; repeat++) {
      summary.getContextToday(contextId); summary.getContextTotal(contextId);
      summary.getContextRecordedTotal(contextId); summary.getLastRecordedActivity(contextId);
      summary.getContextByDay(contextId);
    }
    summary.getDayByContext(summary.todayDate); summary.getDaySummaries();
    summary.getTodayTotal(); summary.getWeekTotal();
    assert.equal(visits, stored.length, 'Derived queries must never rescan stored rows');
    visits = 0;
    const totals = createQuerySummary(document, atMs, { totalsOnly: true });
    for (const contextId of ids) for (let repeat = 0; repeat < 3; repeat++) totals.getContextTotal(contextId);
    assert.equal(visits, stored.length, 'Data-tool totals must also visit rows once');
  }
});

test('UT-B3-SUMMARY-004 zero timestamps and zero-duration rows retain canonical day and activity semantics', () => {
  const document = createEmptyDocument({ nowMs: 0, workdayZone: 'UTC' });
  const ids = [2, 12].map((id, index) => addContext(document, id, index));
  for (const contextId of ids) document.ledger.push({ segmentId: contextId, sessionId: contextId, cycleId: contextId,
    contextId, startAtMs: 0, endAtMs: 0, durationMs: 0, localDate: '1970-01-01', workdayZone: 'UTC' });
  document.timer.pending = { contextId: ids[0], safeStartAnchorMs: 0, lastContinuityVerifiedAtMs: 0, continuityState: 'VALID' };
  validateDocument(document);
  const value = createTimerReadModel(() => document, { now: () => 0 }).snapshot();
  assert.equal(value.contextRows.find(row => row.contextId === ids[0]).lastRecordedActivityAtMs, null);
  assert.equal(value.byDayRows[0].contextCount, 2);
  assert.equal(value.byDayRows[0].topContextId, 'job:12');
  assert.equal(value.todayByContext.length, 2);
  assert.equal(value.historyTotal, 2);
  assert.deepEqual(value, referenceTimer.createTimerReadModel(() => document, { now: () => 0 }).snapshot());
  assert.throws(() => createQuerySummary(document, -1), /query-summary-at-invalid/);
});

test('UT-B3-SUMMARY-005 data tools do not add a calendar-range restriction to valid idle documents', () => {
  const MAX_DATE_TIMESTAMP_MS = 8_640_000_000_000_000;
  const document = createEmptyDocument({ nowMs: MAX_DATE_TIMESTAMP_MS, workdayZone: 'UTC' });
  assert.equal(document.updatedAtMs, MAX_DATE_TIMESTAMP_MS);
  addContext(document, 2, 1);
  validateDocument(document);
  const value = createDataSafetyReadModel(document);
  assert.equal(value.recentRows[0].totalMs, 17);
  assert.deepEqual(value, referenceData.createDataSafetyReadModel(document));
});
