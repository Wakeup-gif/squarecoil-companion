'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDiagnosticLog, STORAGE_KEY } = require('../../src/extension/diagnostic-log');

function fixture(startMs = Date.parse('2026-10-01T12:00:00Z')) {
  let currentMs = startMs;
  let failsGet = false;
  let failsSet = false;
  const items = {};
  const storage = {
    async get(key) {
      if (failsGet) throw new Error('synthetic read failure with private job 251184');
      return { [key]: items[key] };
    },
    async set(value) {
      if (failsSet) throw new Error('synthetic write failure with private job 251184');
      Object.assign(items, structuredClone(value));
    }
  };
  const log = createDiagnosticLog({ storage, now: () => currentMs });
  return {
    log, items,
    setNow(value) { currentMs = value; },
    advance(deltaMs) { currentMs += deltaMs; },
    failGet(value) { failsGet = value; },
    failSet(value) { failsSet = value; }
  };
}

test('UT-DIAG-001 stores and exports only fixed technical event fields', async () => {
  const h = fixture();
  const privateDetail = { url: 'https://ussignandmill.squarecoil.net/project.php?id=251184',
    customer: 'Private Customer', cookie: 'account-token', message: 'secret details' };
  assert.equal(await h.log.record('WORKER_STARTED', privateDetail), true);
  assert.equal(await h.log.record('arbitrary-private-event', privateDetail), false);
  const result = await h.log.read();
  assert.equal(result.ok, true);
  assert.equal(result.schemaVersion, 1);
  assert.deepEqual(result.retention, { maxEntries: 200, maxAgeDays: 30, maxBytes: 65536 });
  assert.equal(result.entries.length, 1);
  assert.deepEqual(Object.keys(result.entries[0]).sort(), ['area', 'atMs', 'code', 'severity']);
  assert.equal(result.entries[0].code, 'WORKER_STARTED');
  assert.equal(result.entries[0].atMs, Date.parse('2026-10-01T12:00:00Z'));
  assert.doesNotMatch(JSON.stringify(result), /251184|Private Customer|account-token|secret details|project\.php|arbitrary-private-event/i);
  assert.doesNotMatch(JSON.stringify(h.items[STORAGE_KEY]), /251184|Private Customer|account-token|secret details|project\.php/i);
});

test('UT-DIAG-002 deduplicates a repeated code for five minutes while preserving distinct events', async () => {
  const h = fixture();
  assert.equal(await h.log.record('COMPANION_LIMITED'), true);
  h.advance(60_000);
  assert.equal(await h.log.record('COMPANION_LIMITED'), true);
  assert.equal((await h.log.read()).entries.length, 1);
  assert.equal(await h.log.record('WALLPAPER_FAILED'), true);
  assert.equal((await h.log.read()).entries.length, 2);
  h.advance(5 * 60_000 + 1);
  assert.equal(await h.log.record('WALLPAPER_FAILED'), true);
  assert.equal((await h.log.read()).entries.length, 3);
});

test('UT-DIAG-003 caps event count and bytes, then removes entries older than thirty days', async () => {
  const h = fixture();
  const codes = ['WORKER_STARTED', 'COMPANION_READY', 'WALLPAPER_FALLBACK'];
  for (let index = 0; index < 205; index += 1) {
    assert.equal(await h.log.record(codes[index % codes.length]), true);
    h.advance(6 * 60_000);
  }
  let result = await h.log.read();
  assert.equal(result.entries.length, 200);
  assert.ok(Buffer.byteLength(JSON.stringify(h.items[STORAGE_KEY]), 'utf8') <= 65536);
  h.advance(31 * 24 * 60 * 60_000);
  assert.equal(await h.log.record('WORKER_STARTED'), true);
  result = await h.log.read();
  assert.deepEqual(result.entries.map(entry => entry.code), ['WORKER_STARTED']);
});

test('UT-DIAG-004 storage failures never throw or falsely report a saved event', async () => {
  const h = fixture();
  h.failGet(true);
  assert.equal(await h.log.record('WORKER_STARTED'), false);
  const unavailable = await h.log.read();
  assert.equal(unavailable.ok, false);
  assert.deepEqual(unavailable.entries, []);
  h.failGet(false);
  h.failSet(true);
  assert.equal(await h.log.record('WORKER_STARTED'), false);
  assert.equal(await h.log.clear(), false);
  h.failSet(false);
  assert.equal(await h.log.record('WORKER_STARTED'), true);
  assert.equal(await h.log.clear(), true);
  assert.deepEqual((await h.log.read()).entries, []);
});

test('UT-DIAG-005 read strips tampered fields and invalid persisted entries before export', async () => {
  const h = fixture();
  assert.equal(await h.log.record('WORKER_STARTED'), true);
  const saved = h.items[STORAGE_KEY];
  saved.entries[0].area = 'PRIVATE_CUST_251184';
  saved.entries[0].severity = 'private-secret';
  saved.entries[0].url = 'https://ussignandmill.squarecoil.net/project.php?id=251184';
  saved.entries.push({ atMs: saved.entries[0].atMs, code: 'PRIVATE_CUST_251184',
    area: 'CLOCK', severity: 'info', detail: 'private customer' });
  saved.entries.push({ atMs: saved.entries[0].atMs + 60_000, code: 'COMPANION_FAILED',
    area: 'LIFECYCLE', severity: 'error', detail: 'future customer' });
  const result = await h.log.read();
  assert.equal(result.ok, true);
  assert.equal(result.entries.length, 1);
  assert.deepEqual(result.entries[0], {
    atMs: Date.parse('2026-10-01T12:00:00Z'), code: 'WORKER_STARTED', area: 'LIFECYCLE', severity: 'info'
  });
  assert.doesNotMatch(JSON.stringify(result), /251184|private customer|future customer|project\.php/i);
});
