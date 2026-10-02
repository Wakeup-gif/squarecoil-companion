'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDefaultAuthorityKernel, AUTHORITY_STORAGE_KEY } = require('../../src/extension/authority-kernel');
const { createAuthorityRouter } = require('../../src/extension/authority-router');
const { createAuthorityClient } = require('../../src/extension/authority-client');
const { AUTHORITY_MESSAGES, AUTHORITY_PROTOCOL_VERSION } = require('../../src/extension/authority-protocol');
const { createTrustedTransitionCore } = require('../../src/content/trusted-transition-core');
const { createSquareCoilBridgeService } = require('../../src/squarecoil/bridge-service');
const { createTimerCommandHandler, TIMER_COMMANDS } = require('../../src/timer/service');
const { LEGACY_KEYS } = require('../../src/data/legacy-preflight');

// Real authority, migration, trusted-core, Bridge and Timer/Ledger composition.
// Transport, page and persistence are synthetic; failures are injected only at
// the narrow validation/storage boundaries so retries traverse the real stack.
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

function createFixture(sources = {}, options = {}) {
  const values = {};
  const clock = { value: 10_000_000 };
  const area = {
    async get(key) { return { [key]: values[key] === undefined ? undefined : structuredClone(values[key]) }; },
    async set(patch) {
      const next = patch[AUTHORITY_STORAGE_KEY]?.document;
      if (options.failNextObservationWrite && next?.timer?.lastObservation?.type === 'CONTEXT_DETECTED') {
        options.failNextObservationWrite = false;
        throw new Error('fictional-persistence-failure');
      }
      Object.assign(values, structuredClone(patch));
    },
    read() { return structuredClone(values[AUTHORITY_STORAGE_KEY].document); }
  };
  let queue = Promise.resolve();
  const lockManager = { request(_name, _options, callback) {
    const run = queue.then(callback, callback);
    queue = run.then(() => undefined, () => undefined);
    return run;
  } };
  const kernel = createDefaultAuthorityKernel({ area, lockManager, runtimeWorkdayZone: 'UTC',
    now: () => clock.value, makeId: ids('general-kernel'), leaseDurationMs: 60_000, buildVersion: '0.7.6', timerHandler: options.timerHandler });
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

function createCore(fixture, page, options = {}) {
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
        if (page.deferNext) {
          page.deferNext = false;
          return new Promise(resolve => { page.releaseFetch = () => resolve({
            ok: true, text: async () => `<span id="clockin-remaining-time">${page.html}</span>`
          }); });
        }
        return { ok: true, text: async () => `<span id="clockin-remaining-time">${page.html}</span>` };
      }
    },
    createBridge: bridgeOptions => {
      const originalDelivery = bridgeOptions.onEvents;
      bridge = createSquareCoilBridgeService({ ...bridgeOptions,
        onEvents: events => originalDelivery(options.transformEvents ? options.transformEvents(events) : events) });
      return bridge;
    }
  });
  return { core, requests, bridge: () => bridge };
}

function sourcesWithSavedHour() {
  return {
    [LEGACY_KEYS[0]]: JSON.stringify({ schema: 3, contexts: {}, active: null, pending: null, meta: {} }),
    [LEGACY_KEYS[1]]: JSON.stringify({ contexts: { 'job:950001': {
      key: 'job:950001', kind: 'job', projectId: '950001', label: '950001 - Historical',
      accumulatedMs: 3_600_000, sessions: [{ id: 'retained-rejection-session', cycleId: 'retained-rejection-cycle',
        startAt: 10_000, endAt: 3_610_000, durationMs: 3_600_000 }]
    } } }),
    [LEGACY_KEYS[2]]: JSON.stringify([{ type: 'fictional-retained-event' }])
  };
}

function projectLink(id, label = `${id} - Production`) {
  return `<a href="/project.php?id=${id}">${label}</a>`;
}

function rejectionDetail(error) { return error?.response?.detail || error?.message; }

function assertReadOnly(journey, sources, retained) {
  assert.deepEqual(sources, retained);
  assert.equal(journey.bridge().snapshot().nativeMutationRequestCount, 0);
  assert.ok(journey.requests.every(request => request.body === 'action=7' && request.method === 'POST' &&
    request.credentials === 'same-origin' &&
    request.url === 'https://ussignandmill.squarecoil.net/ajax_time_clock.php'));
}

test('IT-B2-BRIDGE-REJECT-001 a rejected historical General head cannot prevent a later valid numeric job observation', async () => {
  const sources = sourcesWithSavedHour();
  const retained = structuredClone(sources);
  // Reproduce the exact prior v0.7.6 validator branch without modifying the
  // current production Timer: it rejected any General except Production.
  // All other commands still execute the real current Timer handler.
  let rejected = 0;
  let fixture;
  const timer = createTimerCommandHandler({ now: () => fixture.clock.value, makeId: ids('rejected-event-timer') });
  const priorGeneralHandler = (document, command, trusted) => {
    const context = command.observation?.context;
    if (context?.kind === 'general' && context.contextId !== 'general:production-general') {
      rejected += 1;
      throw new Error('timer-observation-general-identity-invalid');
    }
    return timer(document, command, trusted);
  };
  fixture = createFixture(sources, { timerHandler: priorGeneralHandler });
  const page = { html: projectLink('0', 'Design (General)') };
  const journey = createCore(fixture, page);
  try {
    await assert.rejects(journey.core.ensure(), error => rejectionDetail(error) === 'timer-observation-general-identity-invalid');
    const originalHistory = structuredClone(fixture.area.read().ledger);
    assert.equal(originalHistory.length, 1);
    assert.equal(originalHistory[0].durationMs, 3_600_000);
    assert.equal(fixture.area.read().timer.active, null);
    assert.equal(fixture.area.read().timer.pending, null);
    assert.equal(journey.requests.length, 1);
    page.html = projectLink('260801');
    fixture.clock.value += 1_000;
    const recovery = await journey.core.verifyNow('valid-job-after-rejected-general').catch(error => ({ error }));
    assert.equal(recovery.error, undefined, 'permanently rejected General must not be replayed before fresh action 7');
    assert.equal(journey.requests.length, 2);
    assert.equal(rejected, 1);
    assert.equal(journey.bridge().snapshot().pendingEventCount, 0);
    assert.equal(fixture.area.read().timer.active.contextId, 'job:260801');
    assert.equal(fixture.area.read().timer.active.startedAtMs, 10_001_000);
    assert.deepEqual(fixture.area.read().ledger, originalHistory);
    const settled = await journey.core.settle();
    assert.equal(settled.initialized, true);
    assert.equal(settled.blocked, false);
    assert.equal(settled.authorityOwner, true);
    assert.equal(settled.preflight.disposition, 'COMPLETE_MATCH');
    fixture.clock.value += 1_000;
    await journey.core.verifyNow('verify-after-rejected-general');
    fixture.clock.value += 1_000;
    await journey.core.prepareDisable();
    assert.deepEqual(fixture.area.read().ledger.slice(0, 1), originalHistory);
    assert.deepEqual(fixture.area.read().ledger.map(row => row.durationMs), [3_600_000, 2_000]);
    assertReadOnly(journey, sources, retained);
  } finally { await journey.core.teardown(); await fixture.client.teardown(); }
});

test('IT-B2-BRIDGE-REJECT-002 a rejected padded identity head cannot prevent a later valid numeric job observation', async () => {
  const sources = sourcesWithSavedHour();
  const retained = structuredClone(sources);
  const fixture = createFixture(sources);
  let paddedDeliveries = 0;
  const page = { html: projectLink('260800') };
  const journey = createCore(fixture, page, { transformEvents: events => events.map(event => {
    // Model the formerly inconsistent leading-zero wire identity precisely at
    // its trusted delivery boundary; the real Timer rejects this value.
    if (event.context?.contextId !== 'job:260800') return event;
    paddedDeliveries += 1;
    return { ...event, context: { ...event.context, contextId: 'job:0260800', projectId: '0260800' } };
  }) });
  try {
    await assert.rejects(journey.core.ensure(), error => rejectionDetail(error) === 'timer-observation-job-identity-invalid');
    const originalHistory = structuredClone(fixture.area.read().ledger);
    assert.equal(fixture.area.read().timer.active, null);
    page.html = projectLink('260801');
    fixture.clock.value += 1_000;
    const recovery = await journey.core.verifyNow('valid-job-after-rejected-padded-id').catch(error => ({ error }));
    assert.equal(recovery.error, undefined, 'permanently rejected padded identity must not poison later observations');
    assert.equal(journey.requests.length, 2);
    assert.equal(paddedDeliveries, 1);
    assert.equal(journey.bridge().snapshot().pendingEventCount, 0);
    assert.equal(fixture.area.read().timer.active.contextId, 'job:260801');
    assert.equal(fixture.area.read().timer.active.startedAtMs, 10_001_000);
    assert.deepEqual(fixture.area.read().ledger, originalHistory);
    const settled = await journey.core.settle();
    assert.equal(settled.initialized, true);
    assert.equal(settled.blocked, false);
    assert.equal(settled.authorityOwner, true);
    assert.equal(settled.preflight.disposition, 'COMPLETE_MATCH');
    assertReadOnly(journey, sources, retained);
  } finally { await journey.core.teardown(); await fixture.client.teardown(); }
});

test('IT-B2-BRIDGE-REJECT-003 genuine persistence failures retain the pending observation and retry its time exactly once', async () => {
  const sources = sourcesWithSavedHour();
  const retained = structuredClone(sources);
  const fixture = createFixture(sources, { failNextObservationWrite: true });
  const journey = createCore(fixture, { html: projectLink('260801') });
  try {
    await assert.rejects(journey.core.ensure(), error => rejectionDetail(error) === 'fictional-persistence-failure');
    const originalHistory = structuredClone(fixture.area.read().ledger);
    const completedMigration = structuredClone(fixture.area.read().migration.completedSources);
    assert.equal(fixture.area.read().timer.active, null);
    assert.equal(journey.bridge().snapshot().pendingEventCount, 1);
    assert.equal(journey.requests.length, 1);
    fixture.clock.value += 1_000;
    await journey.core.verifyNow('retry-real-persistence-failure');
    assert.equal(journey.requests.length, 2);
    assert.equal(journey.bridge().snapshot().pendingEventCount, 0);
    assert.equal(fixture.area.read().timer.active.contextId, 'job:260801');
    // Preserve the positively observed time while retrying a durable write.
    assert.equal(fixture.area.read().timer.active.startedAtMs, 10_000_000);
    assert.deepEqual(fixture.area.read().ledger, originalHistory);
    const settled = await journey.core.settle();
    assert.equal(settled.initialized, true);
    assert.equal(settled.blocked, false);
    assert.equal(settled.authorityOwner, true);
    assert.equal(settled.preflight.disposition, 'COMPLETE_MATCH');
    assert.deepEqual(fixture.area.read().migration.completedSources, completedMigration);
    fixture.clock.value += 1_000;
    await journey.core.verifyNow('verify-successful-retry');
    await journey.core.prepareDisable();
    assert.deepEqual(fixture.area.read().ledger.slice(0, 1), originalHistory);
    assert.deepEqual(fixture.area.read().ledger.map(row => row.durationMs), [3_600_000, 2_000]);
    assertReadOnly(journey, sources, retained);
  } finally { await journey.core.teardown(); await fixture.client.teardown(); }
});

test('IT-B2-BRIDGE-REJECT-004 an active Job survives a rejected General and a fresh Job starts without stale prior identity or gap backfill', async () => {
  const sources = sourcesWithSavedHour();
  const retained = structuredClone(sources);
  let fixture;
  let rejected = 0;
  const timer = createTimerCommandHandler({ now: () => fixture.clock.value, makeId: ids('active-rejected-event-timer') });
  fixture = createFixture(sources, { timerHandler: (document, command, trusted) => {
    const context = command.observation?.context;
    if (context?.kind === 'general' && context.contextId !== 'general:production-general') {
      rejected += 1;
      throw new Error('timer-observation-general-identity-invalid');
    }
    return timer(document, command, trusted);
  } });
  const page = { html: projectLink('260800') };
  const journey = createCore(fixture, page);
  try {
    await journey.core.ensure();
    const originalHistory = structuredClone(fixture.area.read().ledger);
    fixture.clock.value += 1_000;
    await journey.core.verifyNow('verified-active-before-rejected-general');
    const verifiedActive = structuredClone(fixture.area.read().timer.active);
    assert.equal(verifiedActive.contextId, 'job:260800');
    assert.equal(verifiedActive.lastVerifiedAtMs - verifiedActive.startedAtMs, 1_000);
    fixture.clock.value += 1_000;
    page.html = projectLink('0', 'Design (General)');
    await assert.rejects(journey.core.verifyNow('rejected-general-after-active-job'),
      error => rejectionDetail(error) === 'timer-observation-general-identity-invalid');
    assert.deepEqual(fixture.area.read().timer.active, verifiedActive);
    assert.deepEqual(fixture.area.read().ledger, originalHistory);
    assert.equal(fixture.area.read().contexts['general:design-general'], undefined);
    // Renew the same OWNER lease while the unverified gap grows beyond the
    // settled 90-second grace. Rejected evidence cannot backfill that gap.
    fixture.clock.value += 45_000;
    await fixture.client.heartbeat();
    fixture.clock.value += 46_000;
    await fixture.client.heartbeat();
    page.html = projectLink('260801');
    const freshAtMs = fixture.clock.value;
    const recovered = await journey.core.verifyNow('ordinary-job-after-rejected-general').catch(error => ({ error }));
    assert.equal(recovered.error, undefined, 'rejected General must not become the prior authoritative Job identity');
    assert.equal(rejected, 1);
    assert.equal(journey.requests.length, 4);
    assert.equal(journey.bridge().snapshot().pendingEventCount, 0);
    assert.equal(fixture.area.read().timer.active.contextId, 'job:260801');
    assert.equal(fixture.area.read().timer.active.startedAtMs, freshAtMs);
    assert.deepEqual(fixture.area.read().ledger.slice(0, originalHistory.length), originalHistory);
    const priorJob = fixture.area.read().ledger[originalHistory.length];
    assert.equal(priorJob.contextId, 'job:260800');
    assert.equal(priorJob.durationMs, 1_000);
    assert.equal(priorJob.endAtMs, verifiedActive.lastVerifiedAtMs);
    const settled = await journey.core.settle();
    assert.equal(settled.initialized, true);
    assert.equal(settled.blocked, false);
    assert.equal(settled.authorityOwner, true);
    assert.equal(settled.preflight.disposition, 'COMPLETE_MATCH');
    fixture.clock.value += 1_000;
    await journey.core.verifyNow('verify-fresh-job-after-rejected-general');
    await journey.core.prepareDisable();
    assert.deepEqual(fixture.area.read().ledger.map(row => ({ contextId: row.contextId, durationMs: row.durationMs })), [
      { contextId: 'job:950001', durationMs: 3_600_000 },
      { contextId: 'job:260800', durationMs: 1_000 },
      { contextId: 'job:260801', durationMs: 1_000 }
    ]);
    assertReadOnly(journey, sources, retained);
  } finally { await journey.core.teardown(); await fixture.client.teardown(); }
});

test('IT-B2-BRIDGE-REJECT-005 an acknowledged native leave remains finalized when its paired General enter is rejected', async () => {
  const sources = sourcesWithSavedHour();
  const retained = structuredClone(sources);
  let fixture;
  const timer = createTimerCommandHandler({ now: () => fixture.clock.value, makeId: ids('compound-rejected-event-timer') });
  fixture = createFixture(sources, { timerHandler: (document, command, trusted) => {
    const context = command.observation?.context;
    if (context?.kind === 'general' && context.contextId !== 'general:production-general') {
      throw new Error('timer-observation-general-identity-invalid');
    }
    return timer(document, command, trusted);
  } });
  const page = { html: projectLink('260800') };
  const journey = createCore(fixture, page);
  try {
    await journey.core.ensure();
    const originalHistory = structuredClone(fixture.area.read().ledger);
    fixture.clock.value += 1_000;
    await journey.core.verifyNow('verified-active-before-compound-native-transition');
    fixture.clock.value += 1_000;
    const leaveAtMs = fixture.clock.value;
    page.html = projectLink('0', 'Design (General)');
    page.deferNext = true;
    // These are simulated observations of user-owned native completions. The
    // Companion still performs only action 7; it initiates no native mutation.
    const observedLeave = journey.bridge().observeNativeCompletion({
      nativeAction: 4, successful: true, completedAtMs: leaveAtMs,
      completionKey: 'simulated-audited-leave-before-rejected-general' });
    for (let attempt = 0; attempt < 50 && !page.releaseFetch; attempt += 1) await Promise.resolve();
    assert.ok(page.releaseFetch);
    fixture.clock.value += 1_000;
    const enterAtMs = fixture.clock.value;
    const observedEnter = journey.bridge().observeNativeCompletion({
      nativeAction: 3, successful: true, completedAtMs: enterAtMs, requestProjectId: '0',
      completionKey: 'simulated-audited-enter-rejected-general' });
    page.releaseFetch();
    await Promise.all([observedLeave, observedEnter]);
    // A current verification emits ordered LEFT and ENTER events. LEFT commits
    // first; the invalid General ENTER gets an exact negative validator ack.
    await assert.rejects(journey.core.verifyNow('current-compound-leave-enter'),
      error => rejectionDetail(error) === 'timer-observation-general-identity-invalid');
    const afterRejectedEnter = fixture.area.read();
    assert.equal(afterRejectedEnter.timer.active, null);
    assert.equal(afterRejectedEnter.timer.pending, null);
    assert.equal(afterRejectedEnter.timer.lastObservation.type, 'CONTEXT_LEFT');
    assert.equal(afterRejectedEnter.timer.lastObservation.boundaryCertainty, 'NATIVE_CONFIRMED');
    assert.equal(afterRejectedEnter.timer.lastObservation.boundaryAtMs, leaveAtMs);
    assert.equal(afterRejectedEnter.ledger[originalHistory.length].contextId, 'job:260800');
    assert.equal(afterRejectedEnter.ledger[originalHistory.length].durationMs, 2_000);
    assert.equal(afterRejectedEnter.ledger[originalHistory.length].endAtMs, leaveAtMs);
    assert.equal(afterRejectedEnter.contexts['general:design-general'], undefined);
    assert.equal(journey.bridge().snapshot().pendingEventCount, 0);
    fixture.clock.value += 1_000;
    const freshAtMs = fixture.clock.value;
    page.html = projectLink('260801');
    await journey.core.verifyNow('fresh-job-after-compound-enter-rejection');
    const fresh = fixture.area.read();
    assert.equal(fresh.timer.active.contextId, 'job:260801');
    assert.equal(fresh.timer.active.startedAtMs, freshAtMs);
    assert.equal(fresh.timer.lastObservation.boundaryCertainty, 'DETECTED');
    assert.equal(fresh.timer.lastObservation.boundaryAtMs, freshAtMs);
    assert.notEqual(fresh.timer.active.startedAtMs, enterAtMs, 'consumed native enter cannot donate time to an unrelated job');
    assert.deepEqual(fresh.ledger, afterRejectedEnter.ledger);
    const settled = await journey.core.settle();
    assert.equal(settled.initialized, true);
    assert.equal(settled.blocked, false);
    assert.equal(settled.authorityOwner, true);
    assert.equal(settled.preflight.disposition, 'COMPLETE_MATCH');
    fixture.clock.value += 1_000;
    await journey.core.verifyNow('verify-new-job-after-compound-rejection');
    await journey.core.prepareDisable();
    assert.deepEqual(fixture.area.read().ledger.slice(0, originalHistory.length), originalHistory);
    assert.deepEqual(fixture.area.read().ledger.map(row => ({ contextId: row.contextId, durationMs: row.durationMs })), [
      { contextId: 'job:950001', durationMs: 3_600_000 },
      { contextId: 'job:260800', durationMs: 2_000 },
      { contextId: 'job:260801', durationMs: 1_000 }
    ]);
    assertReadOnly(journey, sources, retained);
  } finally { await journey.core.teardown(); await fixture.client.teardown(); }
});
