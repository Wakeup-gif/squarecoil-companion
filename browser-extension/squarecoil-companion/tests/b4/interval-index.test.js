'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const { createIntervalIndex } = require('../../src/data/interval-index');
const { createEmptyDocument, validateDocument } = require('../../src/data/model');
const { splitInterval } = require('../../src/data/ledger');
const safety = require('../../src/data/data-safety');

const NOW = Date.parse('2026-08-28T15:00:00Z');

// Independent oracle: the importer previously scanned ledger order followed by
// active/recovery order for every incoming positive half-open interval.
function createNaiveIndex(ledger = [], activeIntervals = []) {
  let rows = ledger.slice();
  const active = activeIntervals.slice();
  return {
    add: row => rows.push(row),
    remove: id => { rows = rows.filter(row => row.segmentId !== id); },
    overlaps: incoming => [...rows, ...active].filter(row => row.durationMs > 0 && incoming.durationMs > 0 &&
      row.startAtMs < incoming.endAtMs && incoming.startAtMs < row.endAtMs)
  };
}

function naiveImporter() {
  const filename = require.resolve('../../src/data/data-safety');
  const instance = new Module(filename, module);
  instance.filename = filename;
  instance.paths = module.paths;
  const normalRequire = Module.createRequire(filename);
  instance.require = name => name === './interval-index' ? { createIntervalIndex: createNaiveIndex } : normalRequire(name);
  instance._compile(fs.readFileSync(filename, 'utf8'), filename);
  return instance.exports;
}

function random(seed) {
  return maximum => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % maximum;
  };
}

function interval(id, start, end, contextId = 'job:1') {
  return { segmentId: id, contextId, startAtMs: start, endAtMs: end, durationMs: end - start };
}

function documentFixture(id = 'index-fixture') {
  const document = createEmptyDocument({ nowMs: NOW, workdayZone: 'UTC', datasetId: id });
  for (let number = 1; number <= 4; number += 1) {
    const contextId = `job:${number}`;
    document.contexts[contextId] = { contextId, kind: 'job', projectId: String(number), currentLabel: `Job ${number}`,
      shortLabel: String(number), aliases: [], createdAtMs: NOW - 200_000, lastSeenAtMs: NOW - 1_000,
      workspaceMembership: 'RECENT', archivedAtMs: null, legacyUnattributedMs: 0 };
  }
  return document;
}

function segment(id, start, end, contextId = 'job:1') {
  return splitInterval({ contextId, sessionId: `session-${id}`, cycleId: `cycle-${id}`, startAtMs: start, endAtMs: end,
    workdayZone: 'UTC', source: 'fixture', certainty: 'VERIFIED', createdAtMs: end }, { makeId: () => id })[0];
}

function requestFor(document, id = 'interval-backup') {
  return { type: safety.DATA_COMMANDS.RESTORE_BACKUP, mode: 'MERGE',
    input: safety.createFullBackup(document, { backupId: id, exportedAtMs: NOW }) };
}

function resolve(current, request, staged, resolution) {
  return { ...request, resolutions: { ...request.resolutions, [staged.plan.conflicts[0].id]: resolution } };
}

function assertNoOverlap(document) {
  const positive = document.ledger.filter(row => row.durationMs > 0).sort((left, right) => left.startAtMs - right.startAtMs);
  for (let index = 1; index < positive.length; index += 1) {
    assert.ok(positive[index - 1].endAtMs <= positive[index].startAtMs, 'committed intervals remain globally disjoint');
  }
}

test('UT-B4-INTERVAL-001 half-open global matches preserve ledger order ahead of live/recovery sentinels', () => {
  const late = interval('late', 40, 80, 'job:2');
  const early = interval('early', 10, 30);
  const spanning = interval('spanning', 0, 100, 'job:3');
  const zero = interval('zero', 20, 20);
  const live = interval('LIVE_ACTIVE', 30, 50, 'job:4');
  const recovery = interval('UNRESOLVED_RECOVERY', 20, 45, 'job:2');
  const index = createIntervalIndex([late, early, spanning, zero], [live, recovery]);
  const expected = createNaiveIndex([late, early, spanning, zero], [live, recovery]);
  for (const incoming of [interval('q', 20, 45), interval('q', 30, 40), interval('q', 80, 100), interval('q', 10, 10)]) {
    assert.deepEqual(index.overlaps(incoming), expected.overlaps(incoming));
  }
  assert.deepEqual(index.overlaps(interval('q', 30, 40)), [spanning, live, recovery]);
  const accepted = interval('accepted', 22, 25, 'job:4');
  index.add(accepted); expected.add(accepted);
  assert.deepEqual(index.overlaps(interval('q', 22, 24)), [early, spanning, accepted, recovery]);
  index.remove('spanning'); expected.remove('spanning');
  index.remove('unknown'); expected.remove('unknown');
  assert.deepEqual(index.overlaps(interval('q', 20, 45)), expected.overlaps(interval('q', 20, 45)));
  // Removing a ledger record with a sentinel's literal ID leaves that sentinel.
  const collision = createIntervalIndex([interval('LIVE_ACTIVE', 0, 10)], [live]);
  collision.remove('LIVE_ACTIVE');
  assert.deepEqual(collision.overlaps(interval('q', 0, 60)), [live]);
});

test('UT-B4-INTERVAL-002 randomized inserts removals and disordered/nested intervals equal the naive scan', () => {
  const next = random(0x5a17c01);
  const active = [interval('LIVE_ACTIVE', 10, 190), interval('UNRESOLVED_RECOVERY', 60, 110)];
  const index = createIntervalIndex([], active);
  const expected = createNaiveIndex([], active);
  const ids = [];
  for (let operation = 0; operation < 900; operation += 1) {
    if (ids.length && next(4) === 0) {
      const selected = next(ids.length);
      const [id] = ids.splice(selected, 1);
      index.remove(id); expected.remove(id);
    } else {
      const start = next(200);
      const row = interval(`random-${operation}`, start, start + next(160), `job:${1 + next(4)}`);
      ids.push(row.segmentId);
      index.add(row); expected.add(row);
    }
    for (let query = 0; query < 3; query += 1) {
      const start = next(260);
      const incoming = interval('query', start, start + next(80));
      assert.deepEqual(index.overlaps(incoming), expected.overlaps(incoming), `operation ${operation}, query ${query}`);
    }
  }
});

test('UT-B4-INTERVAL-003 sorted insertions and deletion of long/nested rows retain correct maxima', () => {
  const index = createIntervalIndex();
  const remaining = [];
  for (let number = 0; number < 12_000; number += 1) {
    const row = interval(`sorted-${number}`, number * 3, number * 3 + 2);
    index.add(row);
    if (number % 2) remaining.push(row);
  }
  const longest = interval('longest', 0, 50_000);
  index.add(longest);
  for (let number = 0; number < 12_000; number += 2) {
    index.remove(`sorted-${number}`);
  }
  index.remove('longest');
  const expected = createNaiveIndex(remaining);
  for (const incoming of [interval('q', 0, 12), interval('q', 35_990, 50_000), interval('q', 10_000, 20_000)]) {
    assert.deepEqual(index.overlaps(incoming), expected.overlaps(incoming));
  }
});

test('UT-B4-INTERVAL-004 merge plans candidates and commits equal naive scanning for randomized resolutions', () => {
  const naive = naiveImporter();
  const next = random(0x1a11a7);
  for (let fixture = 0; fixture < 24; fixture += 1) {
    const current = documentFixture(`current-${fixture}`);
    const incoming = documentFixture(`incoming-${fixture}`);
    const start = NOW - 100_000;
    for (let number = 0; number < 12; number += 1) {
      current.ledger.push(segment(`old-${fixture}-${number}`, start + number * 4_000, start + number * 4_000 + 2_000,
        `job:${1 + next(4)}`));
    }
    // Existing records are intentionally not chronological: the first matching
    // ledger record remains the conflict's identity and determines the plan ID.
    current.ledger = [...current.ledger.filter((row, index) => index % 2), ...current.ledger.filter((row, index) => !(index % 2))];
    const duplicateIndex = next(current.ledger.length);
    incoming.ledger.push(structuredClone(current.ledger[duplicateIndex]));
    const duplicate = structuredClone(current.ledger[(duplicateIndex + 1) % current.ledger.length]);
    duplicate.segmentId = `fingerprint-${fixture}`;
    incoming.ledger.push(duplicate);
    const changed = structuredClone(current.ledger[(duplicateIndex + 2) % current.ledger.length]);
    changed.endAtMs += 500; changed.durationMs += 500;
    incoming.ledger.push(changed);
    for (let number = 0; number < 12; number += 1) {
      const from = start + next(24) * 2_000 + number;
      incoming.ledger.push(segment(`new-${fixture}-${number}`, from, from + 500 + next(4) * 1_000, `job:${1 + next(4)}`));
    }
    // A backup may contain cross-context overlaps; normalization validates the
    // records, then merge resolves their global relationships in input order.
    let request = requestFor(incoming, `random-backup-${fixture}`);
    for (let review = 0; review < 5; review += 1) {
      const indexed = safety.stageDataOperation(current, request, { nowMs: NOW });
      const scanned = naive.stageDataOperation(current, request, { nowMs: NOW });
      assert.deepEqual(indexed, scanned, `fixture ${fixture}, review ${review}`);
      assert.deepEqual(current.timer.active, null);
      if (!indexed.plan.blocked) {
        const command = { request, planId: indexed.plan.planId, stagedRevision: indexed.plan.stagedRevision,
          operationId: `indexed-${fixture}`, confirmationTokens: indexed.plan.requiredConfirmations };
        const actual = safety.commitStagedDataOperation(current, command, { nowMs: NOW });
        const reference = naive.commitStagedDataOperation(current, command, { nowMs: NOW });
        assert.deepEqual(actual, reference);
        assertNoOverlap(actual.document);
        assert.equal(validateDocument(actual.document), true);
        break;
      }
      const resolutions = { ...request.resolutions };
      for (const conflict of indexed.plan.conflicts) {
        // Alternate KEEP and USE first, then KEEP the remaining conflict so
        // guarded same-ID corrections never need guessed removal of another row.
        resolutions[conflict.id] = review > 1 || next(2) === 0 ? 'KEEP_CURRENT' : 'USE_INCOMING';
      }
      request = { ...request, resolutions };
      assert.ok(review < 4, 'review converges to a fully resolved plan');
    }
  }
});

test('UT-B4-INTERVAL-005 cross-context replacement removes every selected overlap and indexes accepted rows', () => {
  const current = documentFixture();
  current.ledger = [segment('late-old', NOW - 40_000, NOW - 30_000, 'job:2'),
    segment('early-old', NOW - 60_000, NOW - 50_000, 'job:1')];
  const incoming = documentFixture();
  incoming.ledger = [segment('spanning-new', NOW - 65_000, NOW - 25_000, 'job:3'),
    segment('later-new', NOW - 60_000, NOW - 55_000, 'job:4')];
  const request = requestFor(incoming);
  const initial = safety.stageDataOperation(current, request, { nowMs: NOW });
  assert.equal(initial.plan.conflicts[0].existingSegmentId, 'late-old');
  const useFirst = resolve(current, request, initial, 'USE_INCOMING');
  const replaced = safety.stageDataOperation(current, useFirst, { nowMs: NOW });
  assert.equal(replaced.plan.summary.recordsReplaced, 2);
  assert.equal(replaced.plan.conflicts[0].existingSegmentId, 'spanning-new');
  assert.deepEqual(replaced.candidate.ledger.map(row => row.segmentId), ['spanning-new']);
  const keepSecond = resolve(current, useFirst, replaced, 'KEEP_CURRENT');
  const done = safety.stageDataOperation(current, keepSecond, { nowMs: NOW });
  assert.equal(done.plan.blocked, false);
  assert.deepEqual(done.plan.requiredConfirmations, ['USE_INCOMING']);
  assertNoOverlap(done.candidate);
  assert.deepEqual(current.ledger.map(row => row.segmentId), ['late-old', 'early-old']);
});

test('UT-B4-INTERVAL-006 a same-ID correction cannot leave another Context overlap behind', () => {
  const current = documentFixture();
  current.ledger = [segment('matching-id', NOW - 60_000, NOW - 50_000),
    segment('other-id', NOW - 40_000, NOW - 30_000, 'job:2')];
  const incoming = documentFixture();
  incoming.ledger = [segment('matching-id', NOW - 60_000, NOW - 35_000)];
  const request = requestFor(incoming);
  const initial = safety.stageDataOperation(current, request, { nowMs: NOW });
  assert.equal(initial.plan.conflicts[0].code, 'SEGMENT_ID_CONFLICT');
  const use = safety.stageDataOperation(current, resolve(current, request, initial, 'USE_INCOMING'), { nowMs: NOW });
  assert.equal(use.plan.blocked, true);
  assert.equal(use.plan.summary.recordsReplaced, 0);
  assert.deepEqual(use.candidate.ledger, current.ledger);
  const keep = safety.stageDataOperation(current, resolve(current, request, initial, 'KEEP_CURRENT'), { nowMs: NOW });
  assert.equal(keep.plan.blocked, false);
  assert.deepEqual(keep.candidate.ledger, current.ledger);
});

test('UT-B4-INTERVAL-007 any live or recovery overlap blocks USE even behind a finalized/same-ID match', () => {
  for (const protection of ['ACTIVE', 'SAFETY_HOLD', 'RECOVERY']) {
    for (const sameId of [false, true]) {
      const current = documentFixture(`protected-${protection}-${sameId}`);
      current.ledger = [segment('old-id', NOW - 70_000, NOW - 60_000)];
      if (protection === 'RECOVERY') {
        current.checkpoint = { schemaVersion: 1, runtimeInstanceId: 'runtime-fixture', contextId: 'job:2',
          sessionId: 'recovery-session', cycleId: 'recovery-cycle', startedAtMs: NOW - 50_000,
          lastVerifiedAtMs: NOW - 20_000, checkpointedAtMs: NOW, terminationDisposition: 'UNEXPECTED_INTERRUPTION',
          buildVersion: 'fixture', source: 'companion', ownershipEvidence: { disposition: 'OWNER',
            ownerRuntimeId: 'runtime-fixture', coordinationEpoch: 1, fencingToken: '1' } };
      } else {
        current.timer.active = { contextId: 'job:2', sessionId: 'live-session', cycleId: 'live-cycle',
          startedAtMs: NOW - 50_000, lastVerifiedAtMs: NOW - 20_000, source: 'fixture', certainty: 'VERIFIED',
          accrualOwnerToken: 'owner', safetyHold: protection === 'SAFETY_HOLD' ? { holdAtMs: NOW - 25_000, reason: 'fixture' } : null };
      }
      const before = structuredClone(current);
      const incoming = documentFixture();
      incoming.ledger = [segment(sameId ? 'old-id' : 'new-id', NOW - 70_000, NOW - 30_000, 'job:3')];
      const request = requestFor(incoming, `protected-backup-${protection}-${sameId}`);
      const staged = safety.stageDataOperation(current, request, { nowMs: NOW });
      assert.equal(staged.plan.conflicts[0].existingSegmentId, 'old-id');
      assert.equal(staged.plan.conflicts[0].resolvable, false);
      const useRequest = resolve(current, request, staged, 'USE_INCOMING');
      const rejected = safety.stageDataOperation(current, useRequest, { nowMs: NOW });
      assert.equal(rejected.plan.blocked, true);
      assert.equal(rejected.plan.summary.recordsReplaced, 0);
      assert.deepEqual(rejected.candidate.ledger, before.ledger);
      assert.deepEqual(rejected.candidate.timer, before.timer);
      assert.deepEqual(rejected.candidate.checkpoint, before.checkpoint);
      assert.throws(() => safety.commitStagedDataOperation(current, { request: useRequest,
        planId: rejected.plan.planId, stagedRevision: rejected.plan.stagedRevision,
        confirmationTokens: ['USE_INCOMING'] }, { nowMs: NOW }), /data-plan-conflicts-unresolved/);
      const keepRequest = resolve(current, request, staged, 'KEEP_CURRENT');
      const kept = safety.stageDataOperation(current, keepRequest, { nowMs: NOW });
      assert.equal(kept.plan.blocked, false);
      assert.equal(kept.plan.summary.segmentsAdded, 0);
      assert.deepEqual(kept.candidate.ledger, before.ledger);
      assert.deepEqual(current, before);
    }
  }
});
