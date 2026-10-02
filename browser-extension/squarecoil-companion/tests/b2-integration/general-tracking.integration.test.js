'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { createDefaultAuthorityKernel, AUTHORITY_STORAGE_KEY } = require('../../src/extension/authority-kernel');
const { createAuthorityRouter } = require('../../src/extension/authority-router');
const { createAuthorityClient } = require('../../src/extension/authority-client');
const { AUTHORITY_MESSAGES, AUTHORITY_PROTOCOL_VERSION } = require('../../src/extension/authority-protocol');
const { createTrustedTransitionCore } = require('../../src/content/trusted-transition-core');
const { createSquareCoilBridgeService } = require('../../src/squarecoil/bridge-service');
const { parseClockContext } = require('../../src/squarecoil/bridge-parser');
const { TIMER_COMMANDS } = require('../../src/timer/commands');
const { LEGACY_KEYS } = require('../../src/data/legacy-preflight');

// Synthetic transport, clock, storage and page; production Bridge, authority,
// migration, trusted core and Timer/Ledger implementations are composed here.
class FakeTimers {
  constructor() { this.intervals = new Map(); this.sequence = 0; }
  setTimeout(callback, delayMs) { return setTimeout(callback, delayMs); }
  clearTimeout(id) { clearTimeout(id); }
  setInterval(callback, delayMs) { const id = ++this.sequence; this.intervals.set(id, { callback, delayMs }); return id; }
  clearInterval(id) { this.intervals.delete(id); }
}

function ids(namespace) {
  let sequence = 0;
  return prefix => `${namespace}-${prefix}-${String(++sequence).padStart(6, '0')}`;
}

function createFixture(sources = {}) {
  const values = {};
  const clock = { value: 10_000_000 };
  const area = {
    async get(key) { return { [key]: values[key] === undefined ? undefined : structuredClone(values[key]) }; },
    async set(patch) { Object.assign(values, structuredClone(patch)); },
    read() { return structuredClone(values[AUTHORITY_STORAGE_KEY].document); }
  };
  let queue = Promise.resolve();
  const lockManager = { request(_name, _options, callback) {
    const run = queue.then(callback, callback);
    queue = run.then(() => undefined, () => undefined);
    return run;
  } };
  const kernel = createDefaultAuthorityKernel({ area, lockManager, runtimeWorkdayZone: 'UTC',
    now: () => clock.value, makeId: ids('general-kernel'), leaseDurationMs: 60_000, buildVersion: '0.7.6' });
  let client;
  const router = createAuthorityRouter({ adapter: kernel, workerInstanceId: 'worker-general-tracking',
    randomId: ids('general-router'), now: () => clock.value,
    publish: async update => {
      client?.handleWorkerUpdate({ type: AUTHORITY_MESSAGES.UPDATE,
        protocolVersion: AUTHORITY_PROTOCOL_VERSION, ...update });
      return true;
    }
  });
  const identity = { tabId: 901, expectedDocumentId: 'browser-document-general',
    documentToken: 'document-general-tracking', buildId: 'build-general-tracking',
    packageVersion: '0.7.6', candidateFingerprint: 'e'.repeat(64) };
  client = createAuthorityClient({ send: message => router.route(identity, message),
    runtimeInstanceId: 'runtime-general-tracking', documentToken: identity.documentToken,
    requestTimeoutMs: 2_000, heartbeatIntervalMs: 30_000,
    randomId: ids('general-client'), timers: new FakeTimers() });
  const legacyStorage = {
    getItem(key) { return sources[key] ?? null; },
    setItem() { assert.fail('retained source write'); },
    removeItem() { assert.fail('retained source removal'); },
    clear() { assert.fail('retained source clear'); }
  };
  return { area, clock, client, legacyStorage };
}

function createCore(fixture, page) {
  const requests = [];
  let bridge;
  const document = { visibilityState: 'visible', documentElement: {},
    querySelectorAll(selector) {
      if (page.domText === undefined || selector !== '#clockin-remaining-time') return [];
      return [{ innerHTML: page.domHtml ?? page.html, textContent: page.domText,
        hidden: false, style: { display: '', visibility: '' }, getAttribute() { return null; } }];
    }, addEventListener() {}, removeEventListener() {} };
  class MutationObserver { observe() {} disconnect() {} }
  const window = { location: { origin: 'https://ussignandmill.squarecoil.net' }, URL, AbortController,
    MutationObserver, Element: class {}, addEventListener() {}, removeEventListener() {} };
  const core = createTrustedTransitionCore({ authorityClient: fixture.client,
    legacyStorage: fixture.legacyStorage, now: () => fixture.clock.value,
    randomId: ids('general-core'),
    bridgeEnvironment: { document, window, timers: new FakeTimers(), now: () => fixture.clock.value,
      fetch: async (url, options) => {
        requests.push({ url, body: options.body, method: options.method, credentials: options.credentials });
        const status = page.httpStatus ?? 200;
        return { ok: status >= 200 && status < 300, status,
          text: async () => page.rawResponse ?? `<span id="clockin-remaining-time">${page.html}</span>` };
      }
    },
    createBridge: options => { bridge = createSquareCoilBridgeService(options); return bridge; }
  });
  return { core, requests, bridge: () => bridge };
}

function generalLink(label) { return `<a href="/project.php?id=0">${label}</a>`; }

function prototypeContext(projectId, label) {
  // This retained runtime is byte-identical to the user's pinned v1.1.2
  // @require at test_repo 6b8c3b7d8a0c9f40ae35a0e8fdd8e881e2925a22.
  // Evaluate only the original identity functions, never the userscript boot
  // or its localStorage writes. v1.1.3 and v1.1.4 wrap it with CSS only.
  const source = fs.readFileSync(path.join(__dirname, '../../page/timer-runtime.js'), 'utf8');
  assert.equal(crypto.createHash('sha256').update(source).digest('hex'),
    '2f1ee6b2a498e790c7352b50a4c75bd201541c65779ddecbf4425475f9c23a42');
  const start = source.indexOf('  function projectIdFromLabel(label) {');
  const end = source.indexOf('  function fromDom() {', start);
  assert.ok(start > 0 && end > start);
  const context = vm.runInNewContext(`${source.slice(start, end)}\nmakeContext(${JSON.stringify(projectId)}, ${JSON.stringify(label)});`);
  return JSON.parse(JSON.stringify(context));
}

function historySources(context) {
  return {
    [LEGACY_KEYS[0]]: JSON.stringify({ schema: 3, contexts: {}, active: null, pending: null, meta: {} }),
    [LEGACY_KEYS[1]]: JSON.stringify({ contexts: { [context.key]: {
      ...context, accumulatedMs: 3_600_000,
      sessions: [{ id: 'prototype-retained-session', cycleId: 'prototype-retained-cycle',
        startAt: 10_000, endAt: 3_610_000, durationMs: 3_600_000 }]
    } } }),
    [LEGACY_KEYS[2]]: JSON.stringify([{ type: 'fictional-retained-event' }])
  };
}

test('IT-B2-GENERAL-001 real Bridge Design General starts, accrues and finalizes once through fenced authority', async () => {
  const fixture = createFixture();
  const page = { html: generalLink('Design (General)') };
  const journey = createCore(fixture, page);
  const { core } = journey;
  try {
    const initial = await core.ensure().catch(error => assert.fail(error.response?.detail || error.message));
    assert.equal(fixture.client.snapshot().disposition, 'OWNER');
    assert.equal(initial.bridge.capability, 'SERVER_FALLBACK');
    assert.equal(initial.lastError, null);
    assert.equal(fixture.area.read().timer.active?.contextId, 'general:design-general');
    assert.equal(fixture.area.read().timer.active.startedAtMs, 10_000_000);
    fixture.clock.value += 1_000;
    await core.verifyNow('general-accrual-verification');
    assert.equal(fixture.area.read().timer.active.lastVerifiedAtMs, 10_001_000);
    assert.equal(core.snapshot().timer.selectedContextTotalMs, 1_000);
    fixture.clock.value += 1_000;
    await core.prepareDisable();
    const final = fixture.area.read();
    assert.equal(final.timer.active, null);
    assert.deepEqual(final.ledger.map(row => ({ contextId: row.contextId, durationMs: row.durationMs })),
      [{ contextId: 'general:design-general', durationMs: 2_000 }]);
    const revision = final.revision;
    await core.prepareDisable();
    assert.equal(fixture.area.read().revision, revision);
    assert.equal(journey.bridge().snapshot().nativeMutationRequestCount, 0);
    assert.ok(journey.requests.every(request => request.body === 'action=7'));
  } finally { await core.teardown(); await fixture.client.teardown(); }
});

test('IT-B2-GENERAL-002 legacy Design General hours and source bytes survive Resume and fresh Training General tracking', async () => {
  const sources = {
    [LEGACY_KEYS[0]]: JSON.stringify({ schema: 3, contexts: {}, active: null, pending: null, meta: {} }),
    [LEGACY_KEYS[1]]: JSON.stringify({ contexts: { 'general:design-general': {
      key: 'general:design-general', kind: 'general', projectId: '0', label: 'Design (General)',
      accumulatedMs: 3_600_000, sessions: [{ id: 'historical-design-session', cycleId: 'historical-design-cycle',
        startAt: 10_000, endAt: 3_610_000, durationMs: 3_600_000 }]
    } } }),
    [LEGACY_KEYS[2]]: JSON.stringify([{ type: 'fictional-retained-event' }])
  };
  const retained = structuredClone(sources);
  const fixture = createFixture(sources);
  const page = { html: '' };
  const journey = createCore(fixture, page);
  const { core } = journey;
  try {
    const initial = await core.ensure();
    assert.equal(initial.blocked, false);
    assert.equal(initial.preflight.disposition, 'COMPLETE_MATCH');
    const imported = fixture.area.read();
    const originalHistory = structuredClone(imported.ledger);
    assert.equal(originalHistory.length, 1);
    assert.equal(originalHistory[0].contextId, 'general:design-general');
    assert.equal(originalHistory[0].durationMs, 3_600_000);
    assert.equal(imported.contexts['general:design-general'].legacyUnattributedMs, 0);
    const completedMigration = structuredClone(imported.migration.completedSources);
    assert.equal(Object.keys(completedMigration).length, 1);
    await core.settle();
    assert.deepEqual(fixture.area.read().migration.completedSources, completedMigration);
    page.html = generalLink('Design (General)');
    fixture.clock.value += 1_000;
    await core.verifyNow('remembered-design-general').catch(error => assert.fail(error.response?.detail || error.message));
    assert.equal(fixture.area.read().timer.pending?.contextId, 'general:design-general');
    assert.equal(fixture.area.read().timer.active, null);
    await core.userCommand(TIMER_COMMANDS.RESUME);
    assert.equal(fixture.area.read().timer.active.contextId, 'general:design-general');
    assert.equal(fixture.area.read().timer.active.startedAtMs, 10_001_000);
    fixture.clock.value += 1_000;
    await core.verifyNow('verify-resumed-design');
    fixture.clock.value += 1_000;
    page.html = generalLink('Training (General)');
    await core.verifyNow('fresh-training-general');
    assert.equal(fixture.area.read().timer.active.contextId, 'general:training-general');
    assert.equal(fixture.area.read().timer.active.startedAtMs, 10_003_000);
    fixture.clock.value += 1_000;
    await core.verifyNow('verify-training-general');
    fixture.clock.value += 1_000;
    await core.prepareDisable();
    const final = fixture.area.read();
    assert.deepEqual(final.ledger.slice(0, originalHistory.length), originalHistory);
    assert.deepEqual(final.ledger.map(row => ({ contextId: row.contextId, durationMs: row.durationMs })), [
      { contextId: 'general:design-general', durationMs: 3_600_000 },
      { contextId: 'general:design-general', durationMs: 2_000 },
      { contextId: 'general:training-general', durationMs: 2_000 }
    ]);
    assert.deepEqual(final.migration.completedSources, completedMigration);
    assert.deepEqual(sources, retained);
    assert.equal(journey.bridge().snapshot().nativeMutationRequestCount, 0);
    assert.ok(journey.requests.every(request => request.body === 'action=7'));
  } finally { await core.teardown(); await fixture.client.teardown(); }
});

test('IT-B2-GENERAL-003 invalid project-zero labels and forged General identities remain non-authoritative', async () => {
  for (const label of ['', 'Clock out', 'Select department', '260801 - Production']) {
    assert.equal(parseClockContext({ label, href: '/project.php?id=0' }).context, null);
  }
  const fixture = createFixture();
  const journey = createCore(fixture, { html: generalLink('Clock out') });
  const { core } = journey;
  try {
    await core.ensure();
    const before = fixture.area.read();
    assert.equal(before.timer.active, null);
    assert.equal(before.timer.pending, null);
    assert.equal(before.ledger.length, 0);
    assert.equal(Object.keys(before.contexts).length, 0);
    const invalid = [
      { contextId: 'general:', kind: 'general', generalKey: '', label: 'Design (General)' },
      { contextId: 'general:design general', kind: 'general', label: 'Design (General)' },
      { contextId: 'general:design-general', kind: 'general', generalKey: 'training-general', label: 'Design (General)' },
      { contextId: 'general:design-general', kind: 'general', projectId: '42', label: 'Design (General)' }
    ];
    for (const [index, context] of invalid.entries()) {
      await assert.rejects(fixture.client.command({ type: TIMER_COMMANDS.ACCEPT_OBSERVATION,
        commandId: `invalid-general-command-${index}`, expectedRevision: before.revision,
        observation: { type: 'CONTEXT_DETECTED',
          bridgeGeneration: before.timer.lastObservation.bridgeGeneration + 1,
          bridgeSeq: before.timer.lastObservation.bridgeSeq + index + 1,
          observationId: `invalid-general-observation-${index}`, observedAtMs: fixture.clock.value,
          source: 'SERVER_ACTION_7', stateCertainty: 'VERIFIED_SERVER', boundaryAtMs: fixture.clock.value,
          boundaryCertainty: 'DETECTED', transitionCandidateId: null, verificationId: `invalid-general-verification-${index}`,
          priorContextId: null, context }
      }), error => {
        assert.equal(error.message, 'authority-command-failed');
        assert.equal(error.response?.detail, 'timer-observation-general-identity-invalid', `invalid General case ${index}`);
        return true;
      });
      assert.deepEqual(fixture.area.read(), before);
    }
    assert.equal(journey.bridge().snapshot().nativeMutationRequestCount, 0);
  } finally { await core.teardown(); await fixture.client.teardown(); }
});

test('IT-B2-GENERAL-004 actual prototype Meeting identity keeps migrated hours and remembered Pending on rediscovery', async () => {
  const originalContext = prototypeContext('0', 'Meeting');
  assert.equal(originalContext.key, 'general:meeting');
  const sources = historySources(originalContext);
  const retained = structuredClone(sources);
  const fixture = createFixture(sources);
  const page = { html: '' };
  const journey = createCore(fixture, page);
  const { core } = journey;
  try {
    assert.equal((await core.ensure()).preflight.disposition, 'COMPLETE_MATCH');
    const originalHistory = structuredClone(fixture.area.read().ledger);
    assert.equal(originalHistory[0].contextId, originalContext.key);
    page.html = generalLink('Meeting');
    fixture.clock.value += 1_000;
    await core.verifyNow('rediscover-prototype-meeting').catch(error => assert.fail(error.response?.detail || error.message));
    const rediscovered = fixture.area.read();
    assert.equal(rediscovered.timer.active, null);
    assert.equal(rediscovered.timer.pending?.contextId, originalContext.key);
    assert.equal(rediscovered.contexts['general:meeting-general'], undefined);
    assert.deepEqual(rediscovered.ledger, originalHistory);
    await core.userCommand(TIMER_COMMANDS.RESUME);
    fixture.clock.value += 1_000;
    await core.verifyNow('verify-resumed-meeting');
    fixture.clock.value += 1_000;
    await core.prepareDisable();
    const final = fixture.area.read();
    assert.deepEqual(final.ledger.slice(0, 1), originalHistory);
    assert.deepEqual(final.ledger.map(row => ({ contextId: row.contextId, durationMs: row.durationMs })), [
      { contextId: 'general:meeting', durationMs: 3_600_000 },
      { contextId: 'general:meeting', durationMs: 2_000 }
    ]);
    assert.deepEqual(sources, retained);
    assert.equal(journey.bridge().snapshot().nativeMutationRequestCount, 0);
  } finally { await core.teardown(); await fixture.client.teardown(); }
});

test('IT-B2-GENERAL-005 actual prototype padded job identity rediscovery uses its migrated hours without duplicate context', async () => {
  const originalContext = prototypeContext('001234', '001234 - Design');
  assert.equal(originalContext.key, 'job:001234');
  const sources = historySources(originalContext);
  const retained = structuredClone(sources);
  const fixture = createFixture(sources);
  const page = { html: '' };
  const journey = createCore(fixture, page);
  const { core } = journey;
  try {
    assert.equal((await core.ensure()).preflight.disposition, 'COMPLETE_MATCH');
    const imported = fixture.area.read();
    const originalHistory = structuredClone(imported.ledger);
    assert.equal(originalHistory[0].contextId, 'job:1234');
    assert.equal(originalHistory[0].durationMs, 3_600_000);
    page.html = '<a href="/project.php?id=001234">001234 - Design</a>';
    fixture.clock.value += 1_000;
    await core.verifyNow('rediscover-same-padded-job');
    const rediscovered = fixture.area.read();
    assert.equal(rediscovered.timer.active, null);
    assert.equal(rediscovered.timer.pending?.contextId, 'job:1234');
    assert.equal(rediscovered.contexts['job:001234'], undefined);
    assert.deepEqual(rediscovered.ledger, originalHistory);
    await core.userCommand(TIMER_COMMANDS.RESUME);
    fixture.clock.value += 1_000;
    await core.verifyNow('verify-resumed-padded-job');
    fixture.clock.value += 1_000;
    await core.prepareDisable();
    const final = fixture.area.read();
    assert.deepEqual(final.ledger.slice(0, 1), originalHistory);
    assert.deepEqual(final.ledger.map(row => ({ contextId: row.contextId, durationMs: row.durationMs })), [
      { contextId: 'job:1234', durationMs: 3_600_000 },
      { contextId: 'job:1234', durationMs: 2_000 }
    ]);
    assert.deepEqual(sources, retained);
    assert.equal(journey.bridge().snapshot().nativeMutationRequestCount, 0);
  } finally { await core.teardown(); await fixture.client.teardown(); }
});

async function paddedFallbackJourney(scenario) {
    const sources = historySources(prototypeContext('001234', '001234 - Design'));
    const retained = structuredClone(sources);
    const fixture = createFixture(sources);
    const page = { html: '' };
    const journey = createCore(fixture, page);
    const { core } = journey;
    try {
      assert.equal((await core.ensure()).preflight.disposition, 'COMPLETE_MATCH');
      const originalHistory = structuredClone(fixture.area.read().ledger);
      if (scenario === 'server-label-only') {
        page.html = '001234 - Design';
      } else {
        page.html = '<a href="/project.php?id=001234">001234 - Design</a>';
        // The same native clock can expose a project link in action 7 while
        // its audited DOM span only supplies the six-digit label.
        page.domHtml = '001234 - Design';
        page.domText = '001234 - Design';
      }
      fixture.clock.value += 1_000;
      await core.verifyNow(scenario).catch(error => assert.fail(`${scenario}: ${error.response?.detail || error.message}`));
      const rediscovered = fixture.area.read();
      assert.equal(rediscovered.timer.active, null, scenario);
      assert.equal(rediscovered.timer.pending?.contextId, 'job:1234', scenario);
      assert.equal(rediscovered.contexts['job:001234'], undefined, scenario);
      assert.deepEqual(rediscovered.ledger, originalHistory, scenario);
      assert.equal(rediscovered.timer.lastObservation.type, 'CONTEXT_DETECTED', scenario);
      await core.userCommand(TIMER_COMMANDS.RESUME);
      fixture.clock.value += 1_000;
      await core.verifyNow(`verify-${scenario}`);
      fixture.clock.value += 1_000;
      await core.prepareDisable();
      const final = fixture.area.read();
      assert.deepEqual(final.ledger.slice(0, 1), originalHistory, scenario);
      assert.deepEqual(final.ledger.map(row => ({ contextId: row.contextId, durationMs: row.durationMs })), [
        { contextId: 'job:1234', durationMs: 3_600_000 },
        { contextId: 'job:1234', durationMs: 2_000 }
      ], scenario);
      assert.deepEqual(sources, retained, scenario);
      assert.equal(journey.bridge().snapshot().nativeMutationRequestCount, 0, scenario);
      assert.ok(journey.requests.every(request => request.body === 'action=7'), scenario);
    } finally { await core.teardown(); await fixture.client.teardown(); }
}

test('IT-B2-GENERAL-006 padded label-only rediscovery resumes the migrated job without duplicate hours',
  () => paddedFallbackJourney('server-label-only'));

test('IT-B2-GENERAL-007 padded server-link and DOM-label rediscovery agree on the migrated job',
  () => paddedFallbackJourney('server-link-and-dom-label'));

test('IT-B2-LOGIN-001 OWNER preserves imported hours through 401 and full login HTML before valid clock recovery', async () => {
  const sources = historySources(prototypeContext('0', 'Meeting'));
  const retained = structuredClone(sources);
  const fixture = createFixture(sources);
  const currentJob = '<a href="/project.php?id=260801">260801 - Production</a>';
  // A plausible clock fragment is insufficient when its HTTP response failed.
  const page = { html: '', httpStatus: 401, rawResponse: currentJob };
  const journey = createCore(fixture, page);
  const { core } = journey;
  try {
    const initial = await core.ensure();
    assert.equal(initial.authorityOwner, true);
    assert.equal(initial.preflight.disposition, 'COMPLETE_MATCH');
    assert.equal(initial.bridge.capability, 'UNAVAILABLE');
    const imported = fixture.area.read();
    const originalHistory = structuredClone(imported.ledger);
    const completedMigration = structuredClone(imported.migration.completedSources);
    assert.equal(originalHistory.length, 1);
    assert.equal(originalHistory[0].durationMs, 3_600_000);
    assert.equal(imported.timer.active, null);
    assert.equal(imported.timer.pending, null);
    assert.equal(imported.timer.lastObservation.type, 'STATE_UNKNOWN');
    assert.equal(imported.contexts['job:260801'], undefined);
    assert.deepEqual(sources, retained);

    fixture.clock.value += 10_000;
    page.httpStatus = 200;
    page.rawResponse = '<!doctype html><html><body><form><input name="password"></form>' +
      `<span id="clockin-remaining-time">${currentJob}</span></body></html>`;
    const loginDocument = await core.verifyNow('full-login-document');
    assert.equal(loginDocument.authorityOwner, true);
    assert.equal(loginDocument.bridge.capability, 'UNAVAILABLE');
    const unchanged = fixture.area.read();
    assert.equal(unchanged.timer.active, null);
    assert.equal(unchanged.timer.pending, null);
    assert.equal(unchanged.timer.lastObservation.type, 'STATE_UNKNOWN');
    assert.equal(unchanged.contexts['job:260801'], undefined);
    assert.deepEqual(unchanged.ledger, originalHistory);
    assert.deepEqual(unchanged.migration.completedSources, completedMigration);
    assert.deepEqual(sources, retained);

    fixture.clock.value += 10_000;
    page.rawResponse = currentJob;
    const recovered = await core.verifyNow('valid-clock-fragment-after-login');
    assert.equal(recovered.bridge.capability, 'SERVER_FALLBACK');
    assert.equal(recovered.bridge.lastError, null);
    const active = fixture.area.read().timer.active;
    assert.equal(active.contextId, 'job:260801');
    assert.equal(active.startedAtMs, 10_020_000);
    await core.verifyNow('repeat-same-authenticated-clock');
    assert.equal(fixture.area.read().timer.active.sessionId, active.sessionId);
    fixture.clock.value += 1_000;
    await core.verifyNow('authenticated-clock-accrual');
    fixture.clock.value += 1_000;
    await core.prepareDisable();
    const final = fixture.area.read();
    assert.deepEqual(final.ledger.slice(0, 1), originalHistory);
    assert.deepEqual(final.ledger.map(row => ({ contextId: row.contextId, durationMs: row.durationMs })), [
      { contextId: 'general:meeting', durationMs: 3_600_000 },
      { contextId: 'job:260801', durationMs: 2_000 }
    ]);
    assert.deepEqual(final.migration.completedSources, completedMigration);
    assert.deepEqual(sources, retained);
    assert.equal(journey.bridge().snapshot().nativeMutationRequestCount, 0);
    assert.ok(journey.requests.every(request => request.url ===
      'https://ussignandmill.squarecoil.net/ajax_time_clock.php' && request.body === 'action=7' &&
      request.method === 'POST' && request.credentials === 'same-origin'));
  } finally { await core.teardown(); await fixture.client.teardown(); }
});
