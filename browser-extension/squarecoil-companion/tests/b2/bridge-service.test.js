'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ACTION_7_PATH,
  ACTION_7_BODY,
  readAuditedDomSnapshot,
  createSquareCoilBridgeService
} = require('../../src/squarecoil/bridge-service');

function element(innerHTML = '', textContent = '') {
  return {
    innerHTML,
    textContent,
    hidden: false,
    style: { display: '', visibility: '' },
    getAttribute() { return null; }
  };
}

function browserFixture(overrides = {}) {
  const listeners = new Map();
  const selectors = new Map([
    ['#clockin-remaining-time', [element(
      '<a href="/project.php?id=260702">260702 - Fabrication</a>',
      '260702 - Fabrication'
    )]],
    ['#clockin-debug', []],
    ['#clockin', []],
    ['#clockout', [element()]],
    ['.timeclock-container', [element()]]
  ]);
  for (const [key, value] of Object.entries(overrides.selectors || {})) selectors.set(key, value);
  const document = {
    visibilityState: 'visible',
    documentElement: {},
    querySelectorAll(selector) { return selectors.get(selector) || []; },
    addEventListener(type, listener) { listeners.set(`document:${type}`, listener); },
    removeEventListener(type) { listeners.delete(`document:${type}`); }
  };
  class MutationObserver {
    constructor(callback) { this.callback = callback; }
    observe() { this.connected = true; }
    disconnect() { this.connected = false; }
  }
  const window = {
    location: { origin: 'https://ussignandmill.squarecoil.net' },
    URL,
    AbortController,
    MutationObserver,
    Element: class {},
    addEventListener(type, listener) { listeners.set(`window:${type}`, listener); },
    removeEventListener(type) { listeners.delete(`window:${type}`); }
  };
  const intervals = new Map();
  const timeouts = new Map();
  let timerSequence = 0;
  const timers = {
    setInterval(callback, delayMs) {
      const id = ++timerSequence;
      intervals.set(id, { callback, delayMs });
      return id;
    },
    clearInterval(id) { intervals.delete(id); },
    setTimeout(callback, delayMs) {
      const id = ++timerSequence;
      timeouts.set(id, { callback, delayMs });
      return id;
    },
    clearTimeout(id) { timeouts.delete(id); }
  };
  return { document, window, timers, listeners, intervals, timeouts };
}

test('UT-B2-BRIDGE-025 audited DOM extraction rejects duplicate clock ownership and reads no arbitrary project links', () => {
  const duplicate = browserFixture({
    selectors: {
      '#clockin-remaining-time': [element(), element()]
    }
  });
  assert.deepEqual(readAuditedDomSnapshot(duplicate.document), {
    available: false,
    snapshot: null,
    reason: 'AMBIGUOUS_AUDITED_CLOCK_DOM'
  });

  const scoped = browserFixture();
  scoped.document.querySelectorAll = selector => selector === 'a[href*="project.php"]'
    ? [element('', 'arbitrary job link')]
    : new Map([
      ['#clockin-remaining-time', []],
      ['#clockin-debug', []],
      ['#clockin', []],
      ['#clockout', []],
      ['.timeclock-container', []]
    ]).get(selector) || [];
  const captured = readAuditedDomSnapshot(scoped.document);
  assert.equal(captured.available, true);
  assert.equal(captured.snapshot.remainingTime.html, '');
  assert.equal(captured.snapshot.debug.html, '');
});

test('UT-B2-BRIDGE-026 live Bridge transport can issue only exact read-only action 7 and commits ordered semantic events', async () => {
  const fixture = browserFixture();
  const requests = [];
  const events = [];
  let time = 100;
  const bridge = createSquareCoilBridgeService({
    document: fixture.document,
    window: fixture.window,
    timers: fixture.timers,
    fetch: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        async text() {
          return '<span id="clockin-remaining-time"><a href="/project.php?id=260702">260702 - Fabrication</a></span>';
        }
      };
    },
    now: () => time++,
    sourceRuntimeId: 'runtime-bridge-service-001',
    onEvents: async values => { events.push(...values); }
  });

  const health = await bridge.ensure({ owner: true });
  assert.equal(requests.length, 1);
  assert.equal(new URL(requests[0].url).pathname, ACTION_7_PATH);
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.body, ACTION_7_BODY);
  assert.equal(requests[0].options.credentials, 'same-origin');
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'CONTEXT_DETECTED');
  assert.equal(events[0].context.contextId, 'job:260702');
  assert.equal(health.nativeMutationRequestCount, 0);
  assert.equal(health.capability, 'VERIFICATION_FALLBACK');

  const tornDown = await bridge.teardown();
  assert.equal(tornDown.active, false);
  assert.equal(tornDown.listenersAttached, false);
  assert.equal(fixture.intervals.size, 0);
});

test('UT-B2-BRIDGE-027 OBSERVER attaches passive audited listeners but performs no server verification or Timer delivery', async () => {
  const fixture = browserFixture();
  let requests = 0;
  let deliveries = 0;
  const bridge = createSquareCoilBridgeService({
    document: fixture.document,
    window: fixture.window,
    timers: fixture.timers,
    fetch: async () => { requests += 1; throw new Error('observer-fetch-prohibited'); },
    now: () => 200,
    sourceRuntimeId: 'runtime-bridge-observer-001',
    onEvents: async () => { deliveries += 1; }
  });

  const health = await bridge.ensure({ owner: false });
  assert.equal(health.owner, false);
  assert.equal(health.listenersAttached, true);
  assert.equal(requests, 0);
  assert.equal(deliveries, 0);
  assert.equal((await bridge.verifyNow('observer-manual')).reason, 'observer-no-server-verification');
  await bridge.teardown();
});

test('UT-B2-BRIDGE-028 NAT-C01/C03 OWNER records successful completion then verifies exactly one native boundary', async () => {
  const fixture = browserFixture();
  let project = '260702';
  fixture.document.querySelectorAll = selector => {
    if (selector === '#clockin-remaining-time') return [element(
      `<a href="/project.php?id=${project}">${project} - Fabrication</a>`, `${project} - Fabrication`)];
    if (selector === '#clockout' || selector === '.timeclock-container') return [element()];
    return [];
  };
  const events = [];
  let time = 1_000;
  const bridge = createSquareCoilBridgeService({ document: fixture.document, window: fixture.window,
    timers: fixture.timers, sourceRuntimeId: 'runtime-native-owner-0001', now: () => time++,
    fetch: async () => ({ ok: true, text: async () =>
      `<span id="clockin-remaining-time"><a href="/project.php?id=${project}">${project} - Fabrication</a></span>` }),
    onEvents: async values => events.push(...values) });
  await bridge.ensure({ owner: true });
  project = '260703';
  const completion = await bridge.observeNativeCompletion({ nativeAction: 3, successful: true,
    completedAtMs: 1_010, completionKey: 'native-owner-completion-01', requestProjectId: '260703' });
  assert.equal(completion.accepted, true);
  const changes = events.filter(event => event.type === 'CONTEXT_CHANGED');
  assert.equal(changes.length, 1);
  assert.equal(changes[0].boundaryAtMs, 1_010);
  assert.equal(changes[0].boundaryCertainty, 'NATIVE_CONFIRMED');
  assert.equal(bridge.snapshot().nativeMutationRequestCount, 0);
});

test('UT-B2-BRIDGE-029 NAT-C02/C06/C09 OBSERVER fallback hint performs no verification or writes locally', async () => {
  const fixture = browserFixture();
  const hints = [];
  let requests = 0;
  let writes = 0;
  const bridge = createSquareCoilBridgeService({ document: fixture.document, window: fixture.window,
    timers: fixture.timers, sourceRuntimeId: 'runtime-native-observer-01',
    documentToken: 'document-native-observer-01', now: () => 2_000,
    fetch: async () => { requests += 1; throw new Error('observer-must-not-verify'); },
    onVerificationHint: async evidence => hints.push(evidence), onEvents: async () => { writes += 1; } });
  const health = await bridge.ensure({ owner: false });
  assert.equal(health.capability, 'VERIFICATION_FALLBACK');
  fixture.listeners.get('document:click')({ target: { closest: selector => selector === '.clock-actions' ? {} : null } });
  await Promise.resolve();
  assert.deepEqual(hints, [{ kind: 'PASSIVE_ACTIVITY_HINT' }]);
  assert.equal(requests, 0);
  assert.equal(writes, 0);
  assert.equal((await bridge.observeNativeCompletion({ nativeAction: 2, successful: false })).accepted, false);
  await bridge.teardown();
  assert.equal((await bridge.observeNativeCompletion({ nativeAction: 4, successful: true })).reason,
    'NATIVE_COMPLETION_UNSUCCESSFUL');
  assert.equal(hints.length, 1);
});

test('UT-B2-BRIDGE-030 FULL capability requires production webRequest observation availability', async () => {
  const fixture = browserFixture();
  const bridge = createSquareCoilBridgeService({ document: fixture.document, window: fixture.window,
    timers: fixture.timers, sourceRuntimeId: 'runtime-jquery-observer-01',
    documentToken: 'document-jquery-observer-01', now: () => 3_000,
    fetch: async () => { throw new Error('observer-must-not-verify'); },
    completionObservationAvailable: true });
  assert.equal((await bridge.ensure({ owner: false })).capability, 'FULL');
  await bridge.teardown();
});

test('UT-B2-BRIDGE-032 successful observed action 2 verifies one native-confirmed CLOCKED_OUT boundary', async () => {
  const fixture = browserFixture();
  let clockedOut = false;
  fixture.document.querySelectorAll = selector => {
    if (!clockedOut && selector === '#clockin-remaining-time') return [element(
      '<a href="/project.php?id=260702">260702 - Fabrication</a>', '260702 - Fabrication')];
    if (clockedOut && selector === '#clockin') return [element()];
    if (!clockedOut && selector === '#clockout') return [element()];
    if (selector === '.timeclock-container') return [element()];
    return [];
  };
  const events = [];
  let time = 4_000;
  const bridge = createSquareCoilBridgeService({ document: fixture.document, window: fixture.window,
    timers: fixture.timers, sourceRuntimeId: 'runtime-action-two-owner', now: () => time++,
    completionObservationAvailable: true,
    fetch: async () => ({ ok: true, text: async () => clockedOut
      ? '<span id="clockin-remaining-time"></span>'
      : '<span id="clockin-remaining-time"><a href="/project.php?id=260702">260702 - Fabrication</a></span>' }),
    onEvents: async values => events.push(...values) });
  await bridge.ensure({ owner: true });
  clockedOut = true;
  time = 4_020;
  await bridge.observeNativeCompletion({ nativeAction: 2, successful: true, completedAtMs: 4_010,
    completionKey: 'webrequest:worker:request-action-two' });
  const boundaries = events.filter(event => event.type === 'CLOCKED_OUT');
  assert.equal(boundaries.length, 1);
  assert.equal(boundaries[0].boundaryAtMs, 4_010);
  assert.equal(boundaries[0].boundaryCertainty, 'NATIVE_CONFIRMED');
});

test('UT-B2-BRIDGE-034 OWNER readiness waits for a completed observation in the current authority tenure', async () => {
  const fixture = browserFixture();
  const pendingFetches = [];
  const events = [];
  let project = '260702';
  fixture.document.querySelectorAll = selector => {
    if (selector === '#clockin-remaining-time') return [element(
      `<a href="/project.php?id=${project}">${project} - Fabrication</a>`,
      `${project} - Fabrication`
    )];
    if (selector === '#clockout' || selector === '.timeclock-container') return [element()];
    return [];
  };
  const bridge = createSquareCoilBridgeService({
    document: fixture.document,
    window: fixture.window,
    timers: fixture.timers,
    sourceRuntimeId: 'runtime-owner-tenure-ready-01',
    now: () => 5_000,
    fetch: () => new Promise(resolve => pendingFetches.push(resolve)),
    onEvents: async values => events.push(...values)
  });
  const finishFetch = (resolve, projectId = project) => resolve({
    ok: true,
    text: async () => `<span id="clockin-remaining-time"><a href="/project.php?id=${projectId}">${projectId} - Fabrication</a></span>`
  });
  const waitForFetchCount = async expected => {
    for (let attempt = 0; attempt < 20 && pendingFetches.length < expected; attempt += 1) {
      await Promise.resolve();
    }
    assert.equal(pendingFetches.length, expected);
  };

  const initialEnsure = bridge.ensure({ owner: true });
  await waitForFetchCount(1);
  assert.equal(bridge.snapshot().verificationInFlight, true);
  assert.equal(bridge.snapshot().requestCount, 1);
  assert.equal(bridge.snapshot().ownerInitialObservationCompleted, false);
  finishFetch(pendingFetches[0]);
  await initialEnsure;
  assert.equal(bridge.snapshot().ownerInitialObservationCompleted, true);
  events.length = 0;

  const oldTenureVerification = bridge.verifyNow('old-owner-tenure');
  await waitForFetchCount(2);
  await bridge.setOwner(false);
  const reacquired = bridge.setOwner(true);
  assert.equal(bridge.snapshot().ownerInitialObservationCompleted, false);
  await waitForFetchCount(3);
  project = '260703';
  finishFetch(pendingFetches[1], project);
  const staleResult = await oldTenureVerification;
  assert.equal(staleResult.accepted, false);
  assert.equal(staleResult.reason, 'STALE_OWNER_TENURE');
  assert.equal(events.length, 0);
  assert.equal(bridge.snapshot().ownerInitialObservationCompleted, false);
  finishFetch(pendingFetches[2], project);
  await reacquired;
  assert.equal(bridge.snapshot().ownerInitialObservationCompleted, true);
  assert.equal(events.filter(event => event.type === 'CONTEXT_CHANGED').length, 1);

  await bridge.teardown();
  assert.equal(bridge.snapshot().ownerInitialObservationCompleted, false);
});

test('UT-B2-BRIDGE-035 action-7 timeout bounds initial OWNER settlement and clears in-flight health', async () => {
  const fixture = browserFixture({
    selectors: {
      '#clockin-remaining-time': [element(), element()],
      '#clockout': [],
      '.timeclock-container': []
    }
  });
  let aborted = false;
  const bridge = createSquareCoilBridgeService({
    document: fixture.document,
    window: fixture.window,
    timers: fixture.timers,
    sourceRuntimeId: 'runtime-owner-timeout-0001',
    verificationTimeoutMs: 25,
    now: () => 6_000,
    fetch: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        aborted = true;
        reject(new Error('fetch-aborted'));
      }, { once: true });
    })
  });

  const ensuring = bridge.ensure({ owner: true });
  let timeout = null;
  for (let attempt = 0; attempt < 20 && !timeout; attempt += 1) {
    await Promise.resolve();
    timeout = [...fixture.timeouts.values()].find(value => value.delayMs === 25) || null;
  }
  assert.ok(timeout);
  timeout.callback();
  const health = await ensuring;

  assert.equal(aborted, true);
  assert.equal(health.verificationInFlight, false);
  assert.equal(health.capability, 'UNAVAILABLE');
  assert.equal(health.ownerInitialObservationCompleted, true);
  assert.equal(health.lastError, 'action-7-timeout');
  assert.equal(fixture.timeouts.size, 0);
  await bridge.teardown();
});

test('UT-B2-BRIDGE-036 a successful current-tenure follow-up latches the OWNER observation', async () => {
  const fixture = browserFixture();
  const pendingFetches = [];
  const events = [];
  let project = '260702';
  fixture.document.querySelectorAll = selector => {
    if (selector === '#clockin-remaining-time') return [element(
      `<a href="/project.php?id=${project}">${project} - Fabrication</a>`,
      `${project} - Fabrication`
    )];
    if (selector === '#clockout' || selector === '.timeclock-container') return [element()];
    return [];
  };
  const bridge = createSquareCoilBridgeService({
    document: fixture.document,
    window: fixture.window,
    timers: fixture.timers,
    sourceRuntimeId: 'runtime-owner-follow-up-latch',
    followUpMs: 17,
    now: () => 7_000,
    fetch: () => new Promise(resolve => pendingFetches.push(resolve)),
    onEvents: async values => events.push(...values)
  });
  const waitFor = async predicate => {
    for (let attempt = 0; attempt < 30 && !predicate(); attempt += 1) await Promise.resolve();
    assert.equal(predicate(), true);
  };
  const finishFetch = (resolve, projectId) => resolve({
    ok: true,
    text: async () => `<span id="clockin-remaining-time"><a href="/project.php?id=${projectId}">${projectId} - Fabrication</a></span>`
  });

  const ensuring = bridge.ensure({
    owner: true,
    authorityTenure: { coordinationEpoch: 7, workerInstanceId: 'worker-follow-up-latch' }
  });
  await waitFor(() => pendingFetches.length === 1);
  const completion = bridge.observeNativeCompletion({
    nativeAction: 3,
    successful: true,
    completedAtMs: 7_010,
    completionKey: 'native-follow-up-latch-001',
    requestProjectId: '260703'
  });
  project = '260703';
  finishFetch(pendingFetches[0], project);
  await Promise.all([ensuring, completion]);

  assert.equal(bridge.snapshot().ownerInitialObservationCompleted, false);
  const followUp = [...fixture.timeouts.values()].find(value => value.delayMs === 17);
  assert.ok(followUp);
  followUp.callback();
  await waitFor(() => pendingFetches.length === 2);
  finishFetch(pendingFetches[1], project);
  await waitFor(() => bridge.snapshot().ownerInitialObservationCompleted === true);

  assert.equal(bridge.snapshot().requestCount, 2);
  assert.equal(bridge.snapshot().ownerInitialObservationCompleted, true);
  assert.equal(events.some(event => event.type === 'CONTEXT_DETECTED'), true);
  await bridge.teardown();
});
