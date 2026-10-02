'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { assertWorkdayZone, createEmptyDocument, validateDocument, validateSegment } = require('../../src/data/model');
const { localDateAt, nextLocalDateBoundary, splitInterval } = require('../../src/data/ledger');

const HOUR_MS = 60 * 60 * 1000;
const START_MS = Date.parse('2026-06-01T12:00:00Z');

function countFormatterConstructions(run) {
  const original = Intl.DateTimeFormat;
  let count = 0;
  Intl.DateTimeFormat = new Proxy(original, {
    construct(target, args) {
      count += 1;
      return Reflect.construct(target, args);
    }
  });
  try { return run(() => count); } finally { Intl.DateTimeFormat = original; }
}

function segment(workdayZone = 'America/New_York') {
  return {
    segmentId: 'calendar-segment', sessionId: 'calendar-session', cycleId: 'calendar-cycle',
    contextId: 'job:880001', startAtMs: START_MS, endAtMs: START_MS + HOUR_MS,
    durationMs: HOUR_MS, localDate: localDateAt(START_MS, workdayZone), workdayZone,
    createdAtMs: START_MS + HOUR_MS, source: 'synthetic-calendar-fixture', certainty: 'VERIFIED'
  };
}

function documentFixture() {
  const document = createEmptyDocument({ nowMs: START_MS + HOUR_MS, workdayZone: 'America/New_York' });
  document.contexts['job:880001'] = {
    contextId: 'job:880001', kind: 'job', projectId: '880001', currentLabel: 'Synthetic calendar job',
    shortLabel: '880001', aliases: [], createdAtMs: START_MS, lastSeenAtMs: START_MS,
    workspaceMembership: 'RECENT', archivedAtMs: null, legacyUnattributedMs: 0
  };
  document.ledger = [segment()];
  return document;
}

test('UT-B2-CALENDAR-PERF-001 repeated validation and midnight searches reuse warmed calendar formatters', () => {
  countFormatterConstructions(readCount => {
    const document = documentFixture();
    validateDocument(document);
    assert.equal(nextLocalDateBoundary(START_MS, 'America/New_York'), Date.parse('2026-06-02T04:00:00Z'));
    const warmedCount = readCount();
    for (let iteration = 0; iteration < 500; iteration += 1) {
      validateDocument(document);
      assert.equal(localDateAt(START_MS + iteration, 'America/New_York'), '2026-06-01');
      assert.equal(nextLocalDateBoundary(START_MS + iteration, 'America/New_York'), Date.parse('2026-06-02T04:00:00Z'));
    }
    assert.equal(readCount() - warmedCount, 0, 'ledger size and boundary-search steps must not construct more Intl objects');
  });
});

test('UT-B2-CALENDAR-PERF-002 warmed calendar helpers preserve spring and autumn DST day lengths', () => {
  const cases = [
    { start: '2026-03-08T05:00:00Z', end: '2026-03-10T04:00:00Z', dates: ['2026-03-08', '2026-03-09'], hours: [23, 24] },
    { start: '2026-11-01T04:00:00Z', end: '2026-11-03T05:00:00Z', dates: ['2026-11-01', '2026-11-02'], hours: [25, 24] }
  ];
  // Warm both validation and ledger helpers before crossing either DST boundary.
  validateSegment(segment());
  for (const [index, fixture] of cases.entries()) {
    const startAtMs = Date.parse(fixture.start);
    const endAtMs = Date.parse(fixture.end);
    const rows = splitInterval({ sessionId: `dst-session-${index}`, cycleId: `dst-cycle-${index}`,
      contextId: 'job:880001', startAtMs, endAtMs, workdayZone: 'America/New_York', createdAtMs: endAtMs });
    assert.deepEqual(rows.map(row => row.localDate), fixture.dates);
    assert.deepEqual(rows.map(row => row.durationMs), fixture.hours.map(hours => hours * HOUR_MS));
    assert.equal(rows.reduce((sum, row) => sum + row.durationMs, 0), endAtMs - startAtMs);
    assert.equal(rows[0].endAtMs, rows[1].startAtMs);
    assert.equal(new Set(rows.map(row => row.sessionId)).size, 1);
    assert.equal(new Set(rows.map(row => row.cycleId)).size, 1);
    rows.forEach(validateSegment);
  }
});

test('UT-B2-CALENDAR-PERF-003 a previously valid document still rejects mutated dates durations zones and authority fields', () => {
  const mutations = [
    { apply: document => { document.ledger[0].localDate = '2026-02-30'; }, error: /local-date-invalid/ },
    { apply: document => { document.ledger[0].localDate = '2026-06-02'; }, error: /segment-local-date-mismatch/ },
    { apply: document => { document.ledger[0].durationMs += 1; }, error: /segment-duration-mismatch/ },
    { apply: document => { document.ledger[0].workdayZone = 'Not/A_Zone'; }, error: /workday-zone-invalid/ },
    { apply: document => { document.ledger[0].workdayZone = 'Pacific/Kiritimati'; }, error: /segment-local-date-mismatch/ },
    { apply: document => { document.workdayZone = '-05:00'; }, error: /workday-zone-offset-only/ },
    { apply: document => { document.ledger[0].endAtMs = Date.parse('2026-06-02T05:00:00Z');
      document.ledger[0].durationMs = document.ledger[0].endAtMs - START_MS; }, error: /segment-crosses-workday/ },
    { apply: document => { document.contexts['job:880001'].projectId = '0'; }, error: /invalid-project-id/ },
    { apply: document => { document.revision = 1; document.commitId = 'unfenced-change'; }, error: /data-commit-fence-missing/ }
  ];
  for (const mutation of mutations) {
    const document = documentFixture();
    assert.equal(validateDocument(document), true);
    mutation.apply(document);
    assert.throws(() => validateDocument(document), mutation.error);
  }
  assert.throws(() => assertWorkdayZone('Not/A_Zone'), /workday-zone-invalid/);
});

test('UT-B2-CALENDAR-PERF-004 valid imported zone diversity evicts old helpers without changing date validation', () => {
  const zones = Intl.supportedValuesOf('timeZone').slice(0, 65);
  assert.equal(zones.length, 65);
  const rows = zones.map(zone => {
    const row = segment(zone);
    validateSegment(row);
    return row;
  });
  countFormatterConstructions(readCount => {
    // Use uncached timestamps: a retained pure date conversion may correctly
    // avoid rebuilding a formatter even after that formatter was evicted.
    rows[0].startAtMs += 100;
    rows[0].endAtMs += 100;
    rows[0].createdAtMs += 100;
    validateSegment(rows[0]);
    assert.equal(readCount(), 2, 'after 65 zones both bounded 64-entry helpers must recreate the evicted zone');
    validateSegment(rows[0]);
    assert.equal(readCount(), 2, 'the recreated helper must then be reused');
    rows[0].durationMs -= 1;
    assert.throws(() => validateSegment(rows[0]), /segment-duration-mismatch/);
  });
});
