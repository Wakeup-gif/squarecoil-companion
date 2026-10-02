'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function deferred() {
  let resolve;
  const promise = new Promise(next => { resolve = next; });
  return { promise, resolve };
}

async function tick(turns = 4) {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
    await new Promise(resolve => setImmediate(resolve));
  }
}

test('popup ignores an older health response after a newer toggle result', async () => {
  const listeners = new Map();
  const nodes = new Map();
  for (const id of ['classification', 'lifecycle', 'reason', 'runtimeId', 'retryCleanup', 'startFresh', 'enabled', 'refresh', 'version', 'stage']) {
    nodes.set(id, {
      id,
      textContent: '',
      hidden: false,
      checked: true,
      addEventListener(type, listener) { this[`on${type}`] = listener; }
    });
  }
  const document = {
    body: { dataset: {} },
    getElementById: id => nodes.get(id) || null,
    addEventListener: (type, listener) => listeners.set(type, listener)
  };
  const oldHealth = deferred();
  let healthRequested = false;
  const chrome = {
    tabs: { query: async () => [{ id: 7 }] },
    storage: {
      local: {
        get: async () => ({ timerEnabled: true }),
        set: async () => {}
      }
    },
    runtime: {
      getManifest: () => ({ version: '0.7.1' }),
      sendMessage: async message => {
        if (message.type === 'SC_COMPANION_GET_HEALTH') {
          healthRequested = true;
          return oldHealth.promise;
        }
        if (message.type === 'SC_COMPANION_SET_ENABLED') {
          return {
            classification: 'NONE',
            health: { state: 'UNINITIALIZED', mode: 'DISABLED', reason: 'user-disabled' }
          };
        }
        throw new Error(`unexpected message: ${message.type}`);
      }
    }
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/popup/popup.js'), 'utf8');
  vm.runInNewContext(source, { chrome, document, console }, { filename: 'src/popup/popup.js' });
  listeners.get('DOMContentLoaded')();
  while (!healthRequested) await tick(1);

  nodes.get('enabled').checked = false;
  nodes.get('enabled').onchange();
  await tick();
  assert.equal(nodes.get('lifecycle').textContent, 'UNINITIALIZED');
  assert.equal(nodes.get('reason').textContent, 'user-disabled');

  oldHealth.resolve({
    classification: 'DEGRADED_SAME_BUILD',
    health: { state: 'DEGRADED', reason: 'old-health' }
  });
  await tick();
  assert.equal(nodes.get('lifecycle').textContent, 'UNINITIALIZED');
  assert.equal(nodes.get('reason').textContent, 'user-disabled');
});

test('popup refresh waits for an in-flight toggle before reading lifecycle health', async () => {
  const listeners = new Map();
  const nodes = new Map();
  for (const id of ['classification', 'lifecycle', 'reason', 'runtimeId', 'retryCleanup', 'startFresh', 'enabled', 'refresh', 'version', 'stage']) {
    nodes.set(id, {
      id,
      textContent: '',
      hidden: false,
      checked: true,
      addEventListener(type, listener) { this[`on${type}`] = listener; }
    });
  }
  const document = {
    body: { dataset: {} },
    getElementById: id => nodes.get(id) || null,
    addEventListener: (type, listener) => listeners.set(type, listener)
  };
  const storageSet = deferred();
  let healthRequests = 0;
  const chrome = {
    tabs: { query: async () => [{ id: 7 }] },
    storage: {
      local: {
        get: async () => ({ timerEnabled: true }),
        set: async () => storageSet.promise
      }
    },
    runtime: {
      getManifest: () => ({ version: '0.7.1' }),
      sendMessage: async message => {
        if (message.type === 'SC_COMPANION_GET_HEALTH') {
          healthRequests += 1;
          return healthRequests === 1
            ? { classification: 'DEGRADED_SAME_BUILD', health: { state: 'DEGRADED', reason: 'pre-toggle-health' } }
            : { classification: 'NONE', health: { state: 'UNINITIALIZED', mode: 'DISABLED', reason: 'user-disabled' } };
        }
        if (message.type === 'SC_COMPANION_SET_ENABLED') {
          return { classification: 'NONE', health: { state: 'UNINITIALIZED', mode: 'DISABLED', reason: 'user-disabled' } };
        }
        throw new Error(`unexpected message: ${message.type}`);
      }
    }
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/popup/popup.js'), 'utf8');
  vm.runInNewContext(source, {
    chrome,
    document,
    console,
    setTimeout(callback) { queueMicrotask(callback); return 1; }
  }, { filename: 'src/popup/popup.js' });
  await listeners.get('DOMContentLoaded')();
  assert.equal(nodes.get('reason').textContent, 'pre-toggle-health');

  nodes.get('enabled').checked = false;
  nodes.get('enabled').onchange();
  nodes.get('refresh').onclick();
  await tick();
  assert.equal(healthRequests, 1);

  storageSet.resolve();
  await tick(8);
  assert.equal(healthRequests, 2);
  assert.equal(nodes.get('lifecycle').textContent, 'UNINITIALIZED');
  assert.equal(nodes.get('reason').textContent, 'user-disabled');
});

test('popup serializes cleanup retry before a following enable intent', async () => {
  const listeners = new Map();
  const nodes = new Map();
  for (const id of ['classification', 'lifecycle', 'reason', 'runtimeId', 'retryCleanup', 'startFresh', 'enabled', 'refresh', 'version', 'stage']) {
    nodes.set(id, {
      id,
      textContent: '',
      hidden: false,
      checked: false,
      addEventListener(type, listener) { this[`on${type}`] = listener; }
    });
  }
  const document = {
    body: { dataset: {} },
    getElementById: id => nodes.get(id) || null,
    addEventListener: (type, listener) => listeners.set(type, listener)
  };
  const retryTabLookup = deferred();
  const messageOrder = [];
  let tabQueries = 0;
  let storedEnabled = false;
  const chrome = {
    tabs: {
      query: async () => {
        tabQueries += 1;
        if (tabQueries === 2) return retryTabLookup.promise;
        return [{ id: 7 }];
      }
    },
    storage: {
      local: {
        get: async () => ({ timerEnabled: storedEnabled }),
        set: async values => { storedEnabled = values.timerEnabled !== false; }
      }
    },
    runtime: {
      getManifest: () => ({ version: '0.7.1' }),
      sendMessage: async message => {
        if (message.type === 'SC_COMPANION_GET_HEALTH') {
          return storedEnabled
            ? { ok: true, ready: true, classification: 'HEALTHY_SAME_BUILD', health: { state: 'READY', mode: 'ENABLED', reason: 'ready' } }
            : { classification: 'FAILED_SAME_BUILD', health: { state: 'FAILED', mode: 'DISABLED', reason: 'teardown-incomplete' } };
        }
        messageOrder.push(message.type);
        if (message.type === 'SC_COMPANION_RETRY_TEARDOWN') {
          return { classification: 'NONE', restartAvailable: true, health: { state: 'UNINITIALIZED', mode: 'DISABLED', reason: 'teardown-complete' } };
        }
        if (message.type === 'SC_COMPANION_SET_ENABLED') {
          return { classification: 'DEGRADED_SAME_BUILD', health: { state: 'DEGRADED', mode: 'ENABLED', reason: 'coordination-not-implemented-b1' } };
        }
        throw new Error(`unexpected message: ${message.type}`);
      }
    }
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/popup/popup.js'), 'utf8');
  vm.runInNewContext(source, {
    chrome,
    document,
    console,
    setTimeout(callback) { queueMicrotask(callback); return 1; }
  }, { filename: 'src/popup/popup.js' });
  await listeners.get('DOMContentLoaded')();
  assert.equal(nodes.get('reason').textContent, 'teardown-incomplete');

  nodes.get('retryCleanup').onclick();
  await tick();
  nodes.get('enabled').checked = true;
  nodes.get('enabled').onchange();
  await tick();
  assert.deepEqual(messageOrder, []);

  retryTabLookup.resolve([{ id: 7 }]);
  await tick(10);
  assert.deepEqual(messageOrder, ['SC_COMPANION_RETRY_TEARDOWN', 'SC_COMPANION_SET_ENABLED']);
  assert.equal(storedEnabled, true);
  assert.equal(nodes.get('lifecycle').textContent, 'READY');
  assert.equal(nodes.get('reason').textContent, 'ready');
  assert.equal(document.body.dataset.health, 'ok');
});

test('popup marks a missing active tab as attention instead of healthy', async () => {
  const listeners = new Map();
  const nodes = new Map();
  for (const id of ['classification', 'lifecycle', 'reason', 'runtimeId', 'retryCleanup', 'startFresh', 'enabled', 'refresh', 'version', 'stage']) {
    nodes.set(id, {
      id,
      textContent: '',
      hidden: false,
      checked: true,
      addEventListener(type, listener) { this[`on${type}`] = listener; }
    });
  }
  const document = {
    body: { dataset: {} },
    getElementById: id => nodes.get(id) || null,
    addEventListener: (type, listener) => listeners.set(type, listener)
  };
  const chrome = {
    tabs: { query: async () => [] },
    storage: { local: { get: async () => ({ timerEnabled: true }), set: async () => {} } },
    runtime: {
      getManifest: () => ({ version: '0.7.1' }),
      sendMessage: async () => { throw new Error('message should not be sent'); }
    }
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/popup/popup.js'), 'utf8');
  vm.runInNewContext(source, { chrome, document, console }, { filename: 'src/popup/popup.js' });

  await listeners.get('DOMContentLoaded')();

  assert.equal(document.body.dataset.health, 'attention');
  assert.equal(nodes.get('classification').textContent, 'NO_ACTIVE_TAB');
  assert.equal(nodes.get('lifecycle').textContent, 'UNAVAILABLE');
});

test('popup marks a runtime transport error without health as attention', async () => {
  const listeners = new Map();
  const nodes = new Map();
  for (const id of ['classification', 'lifecycle', 'reason', 'runtimeId', 'retryCleanup', 'startFresh', 'enabled', 'refresh', 'version', 'stage']) {
    nodes.set(id, {
      id,
      textContent: '',
      hidden: false,
      checked: true,
      addEventListener(type, listener) { this[`on${type}`] = listener; }
    });
  }
  const document = {
    body: { dataset: {} },
    getElementById: id => nodes.get(id) || null,
    addEventListener: (type, listener) => listeners.set(type, listener)
  };
  const chrome = {
    tabs: { query: async () => [{ id: 7 }] },
    storage: { local: { get: async () => ({ timerEnabled: true }), set: async () => {} } },
    runtime: {
      getManifest: () => ({ version: '0.7.1' }),
      sendMessage: async () => { throw new Error('worker-unavailable'); }
    }
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/popup/popup.js'), 'utf8');
  vm.runInNewContext(source, { chrome, document, console }, { filename: 'src/popup/popup.js' });

  await listeners.get('DOMContentLoaded')();

  assert.equal(document.body.dataset.health, 'attention');
  assert.equal(nodes.get('classification').textContent, 'ERROR');
  assert.equal(nodes.get('lifecycle').textContent, 'UNAVAILABLE');
  assert.equal(nodes.get('reason').textContent, 'worker-unavailable');
});

test('popup gives actionable reload guidance for terminal recovery exhaustion', async () => {
  const listeners = new Map();
  const nodes = new Map();
  for (const id of ['classification', 'lifecycle', 'reason', 'runtimeId', 'retryCleanup', 'startFresh', 'enabled', 'refresh', 'version', 'stage']) {
    nodes.set(id, {
      id,
      textContent: '',
      hidden: false,
      checked: true,
      addEventListener(type, listener) { this[`on${type}`] = listener; }
    });
  }
  const document = {
    body: { dataset: {} },
    getElementById: id => nodes.get(id) || null,
    addEventListener: (type, listener) => listeners.set(type, listener)
  };
  const chrome = {
    tabs: { query: async () => [{ id: 7 }] },
    storage: { local: { get: async () => ({ timerEnabled: true }), set: async () => {} } },
    runtime: {
      getManifest: () => ({ version: '0.7.1' }),
      sendMessage: async () => ({
        ok: false,
        classification: 'FAILED_SAME_BUILD',
        reloadRequired: true,
        reason: 'runtime-failed',
        health: { state: 'FAILED', reason: 'recovery-exhausted' }
      })
    }
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/popup/popup.js'), 'utf8');
  vm.runInNewContext(source, { chrome, document, console }, { filename: 'src/popup/popup.js' });

  await listeners.get('DOMContentLoaded')();

  assert.equal(document.body.dataset.health, 'attention');
  assert.equal(nodes.get('classification').textContent, 'FAILED_SAME_BUILD');
  assert.equal(nodes.get('lifecycle').textContent, 'FAILED');
  assert.equal(nodes.get('reason').textContent, 'recovery-exhausted');
  assert.equal(nodes.get('retryCleanup').hidden, true);
});

test('UT-B2-READY-018 popup retries transient settlement work and reaches only a later READY result', async () => {
  const listeners = new Map();
  const nodes = new Map();
  for (const id of ['classification', 'lifecycle', 'reason', 'runtimeId', 'retryCleanup', 'startFresh', 'enabled', 'refresh', 'version', 'stage']) {
    nodes.set(id, {
      id,
      textContent: '',
      hidden: false,
      checked: true,
      addEventListener(type, listener) { this[`on${type}`] = listener; }
    });
  }
  const document = {
    body: { dataset: {} },
    getElementById: id => nodes.get(id) || null,
    addEventListener: (type, listener) => listeners.set(type, listener)
  };
  const scheduled = [];
  let healthRequests = 0;
  let responses = [
    { ok: false, classification: 'DEGRADED_SAME_BUILD', health: { state: 'DEGRADED', mode: 'ENABLED', reason: 'settlement-refresh-in-progress' } },
    { ok: false, classification: 'DEGRADED_SAME_BUILD', health: { state: 'DEGRADED', mode: 'ENABLED', reason: 'settlement-health-timeout' } },
    { ok: true, ready: true, classification: 'HEALTHY_SAME_BUILD', health: { state: 'READY', mode: 'ENABLED', reason: 'ready' } }
  ];
  const chrome = {
    tabs: { query: async () => [{ id: 7 }] },
    storage: { local: { get: async () => ({ timerEnabled: true }), set: async () => {} } },
    runtime: {
      getManifest: () => ({ version: '0.7.1' }),
      sendMessage: async message => {
        assert.equal(message.type, 'SC_COMPANION_GET_HEALTH');
        const response = responses[Math.min(healthRequests, responses.length - 1)];
        healthRequests += 1;
        return response;
      }
    }
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/popup/popup.js'), 'utf8');
  vm.runInNewContext(source, {
    chrome,
    document,
    console,
    setTimeout(callback, delayMs) {
      scheduled.push({ callback, delayMs });
      return scheduled.length;
    }
  }, { filename: 'src/popup/popup.js' });

  const loaded = listeners.get('DOMContentLoaded')();
  await tick();
  assert.equal(healthRequests, 1);
  assert.equal(scheduled[0].delayMs, 50);
  scheduled.shift().callback();
  await tick();
  assert.equal(healthRequests, 2);
  assert.equal(scheduled[0].delayMs, 150);
  scheduled.shift().callback();
  await loaded;
  assert.equal(healthRequests, 3);
  assert.equal(nodes.get('lifecycle').textContent, 'READY');
  assert.equal(nodes.get('reason').textContent, 'ready');
  assert.equal(document.body.dataset.health, 'ok');

  responses = Array.from({ length: 4 }, () => ({
    ok: false,
    ready: false,
    classification: 'DEGRADED_SAME_BUILD',
    health: { state: 'DEGRADED', mode: 'ENABLED', reason: 'settlement-refresh-in-progress' }
  }));
  healthRequests = 0;
  const bounded = nodes.get('refresh').onclick();
  await tick();
  for (const expectedDelay of [50, 150, 450]) {
    assert.equal(scheduled[0].delayMs, expectedDelay);
    scheduled.shift().callback();
    await tick();
  }
  await bounded;
  assert.equal(healthRequests, 4);
  assert.equal(scheduled.length, 0);
  assert.equal(nodes.get('lifecycle').textContent, 'DEGRADED');
  assert.equal(nodes.get('reason').textContent, 'settlement-refresh-in-progress');
  assert.equal(document.body.dataset.health, 'attention');
});

test('UT-B2-READY-012 popup confirms GET_HEALTH after raw or settlement-required enable responses', async () => {
  const listeners = new Map();
  const nodes = new Map();
  for (const id of ['classification', 'lifecycle', 'reason', 'runtimeId', 'retryCleanup', 'startFresh', 'enabled', 'refresh', 'version', 'stage']) {
    nodes.set(id, {
      id,
      textContent: '',
      hidden: false,
      checked: true,
      addEventListener(type, listener) { this[`on${type}`] = listener; }
    });
  }
  const document = {
    body: { dataset: {} },
    getElementById: id => nodes.get(id) || null,
    addEventListener: (type, listener) => listeners.set(type, listener)
  };
  const messageOrder = [];
  let healthRequests = 0;
  let enableResponse = { ok: true, ready: true, classification: 'HEALTHY_SAME_BUILD', health: { state: 'READY', reason: 'ready' } };
  let settledHealth = { ok: false, ready: false, classification: 'DEGRADED_SAME_BUILD', health: { state: 'DEGRADED', reason: 'final-gate-blocked' } };
  const chrome = {
    tabs: { query: async () => [{ id: 7 }] },
    storage: { local: { get: async () => ({ timerEnabled: true }), set: async () => {} } },
    runtime: {
      getManifest: () => ({ version: '0.7.1' }),
      sendMessage: async message => {
        messageOrder.push(message.type);
        if (message.type === 'SC_COMPANION_GET_HEALTH') {
          healthRequests += 1;
          return healthRequests === 1
            ? { ok: false, classification: 'DEGRADED_SAME_BUILD', health: { state: 'DEGRADED', reason: 'initial-health' } }
            : settledHealth;
        }
        if (message.type === 'SC_COMPANION_SET_ENABLED') {
          return enableResponse;
        }
        throw new Error(`unexpected message: ${message.type}`);
      }
    }
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/popup/popup.js'), 'utf8');
  vm.runInNewContext(source, {
    chrome,
    document,
    console,
    setTimeout(callback) { queueMicrotask(callback); return 1; }
  }, { filename: 'src/popup/popup.js' });

  await listeners.get('DOMContentLoaded')();
  messageOrder.length = 0;
  nodes.get('enabled').checked = true;
  await nodes.get('enabled').onchange();
  await tick();

  assert.deepEqual(messageOrder, ['SC_COMPANION_SET_ENABLED', 'SC_COMPANION_GET_HEALTH']);
  assert.equal(nodes.get('lifecycle').textContent, 'DEGRADED');
  assert.equal(nodes.get('reason').textContent, 'final-gate-blocked');
  assert.equal(document.body.dataset.health, 'attention');

  messageOrder.length = 0;
  enableResponse = {
    ok: true,
    ready: false,
    classification: 'DEGRADED_SAME_BUILD',
    reason: 'b2-settlement-required',
    health: { state: 'DEGRADED', reason: 'b2-settlement-required' }
  };
  settledHealth = {
    ok: true,
    ready: true,
    classification: 'HEALTHY_SAME_BUILD',
    health: { state: 'READY', reason: 'ready' }
  };
  await nodes.get('enabled').onchange();
  await tick();

  assert.deepEqual(messageOrder, ['SC_COMPANION_SET_ENABLED', 'SC_COMPANION_GET_HEALTH']);
  assert.equal(nodes.get('lifecycle').textContent, 'READY');
  assert.equal(nodes.get('reason').textContent, 'ready');
  assert.equal(document.body.dataset.health, 'ok');
});

test('UT-B2-READY-019 popup settlement retry policy is exactly bounded to three backoff attempts', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/popup/popup.js'), 'utf8');
  assert.match(source, /SETTLEMENT_RETRY_DELAYS_MS\s*=\s*Object\.freeze\(\[50, 150, 450\]\)/);
});

test('UT-B2-READY-022 popup static copy preserves the final fail-closed gate behind friendly status copy', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../../popup/popup.html'), 'utf8');
  assert.match(html, /<h1>SquareCoil Companion<\/h1>/);
  assert.doesNotMatch(html, /<img\b|brand-mark|US Sign &amp; Mill/);
  assert.match(html, /Your work at a glance/);
  assert.match(html, /<summary>Appearance<\/summary>/);
  assert.match(html, /Show Companion panel/);
  assert.match(html, /Bing photo background/);
  assert.match(html, /Ready appears only after every required safety check passes\./);
  assert.match(html, /Technical details/);
  assert.doesNotMatch(html, /B6 · Release candidate|OWNER|fenced authority|trusted core|Bridge settlement/);
});

test('UT-B5-POPUP-005 popup uses quiet filled surfaces while preserving keyboard focus and forced-colors boundaries', () => {
  const css = fs.readFileSync(path.resolve(__dirname, '../../popup/popup.css'), 'utf8');
  assert.match(css, /button\{border:0;/);
  assert.match(css, /\.status-card,[^\n]+\{border:0;/);
  assert.match(css, /button:focus-visible[^\{]+\{outline:2px solid var\(--accent\)/);
  assert.match(css, /@media\(forced-colors:active\)[^\n]+border:1px solid ButtonText/);
});

test('UT-B5-POPUP-001 exact healthy status and read-only page summary render in the friendly popup', async () => {
  const listeners = new Map();
  const nodes = new Map();
  for (const id of ['classification', 'lifecycle', 'reason', 'runtimeId', 'retryCleanup', 'startFresh', 'enabled', 'refresh',
    'version', 'stage', 'friendlyStatus', 'friendlyMessage', 'statusIcon', 'summaryCard', 'emptySummary', 'emptySummaryText',
    'summaryLabel', 'summaryToday', 'summarySession', 'summaryState', 'copyDiagnostics', 'copyResult']) {
    nodes.set(id, { id, textContent: '', hidden: false, checked: true,
      addEventListener(type, listener) { this[`on${type}`] = listener; } });
  }
  const document = { body: { dataset: {} }, getElementById: id => nodes.get(id) || null,
    addEventListener: (type, listener) => listeners.set(type, listener) };
  const chrome = {
    tabs: {
      query: async () => [{ id: 17 }],
      sendMessage: async (tabId, message) => {
        assert.equal(tabId, 17); assert.equal(message.type, 'SC_COMPANION_GET_POPUP_SUMMARY');
        return { ok: true, status: 'WORKING', current: { label: 'Production (General)', todayMs: 7000, sessionMs: 4000 } };
      }
    },
    storage: { local: { get: async () => ({ timerEnabled: true }), set: async () => {} } },
    runtime: { getManifest: () => ({ version: '0.7.1' }), sendMessage: async () => ({
      ok: true, ready: true, classification: 'HEALTHY_SAME_BUILD', health: { state: 'READY', mode: 'ENABLED', reason: 'ready' }
    }) }
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/popup/popup.js'), 'utf8');
  vm.runInNewContext(source, { chrome, document, console }, { filename: 'src/popup/popup.js' });
  await listeners.get('DOMContentLoaded')();
  assert.equal(nodes.get('friendlyStatus').textContent, 'Ready');
  assert.equal(nodes.get('summaryLabel').textContent, 'Production (General)');
  assert.equal(nodes.get('summaryToday').textContent, '00:00:07');
  assert.equal(nodes.get('summarySession').textContent, '00:00:04');
  assert.equal(nodes.get('summaryCard').hidden, false);
  assert.equal(nodes.get('emptySummary').hidden, true);
});

test('UT-B5-POPUP-002 raw READY without the exact healthy gate remains Limited', async () => {
  const listeners = new Map(); const nodes = new Map();
  for (const id of ['classification', 'lifecycle', 'reason', 'runtimeId', 'retryCleanup', 'startFresh', 'enabled', 'refresh',
    'version', 'stage', 'friendlyStatus', 'friendlyMessage', 'statusIcon']) {
    nodes.set(id, { id, textContent: '', hidden: false, checked: true,
      addEventListener(type, listener) { this[`on${type}`] = listener; } });
  }
  const document = { body: { dataset: {} }, getElementById: id => nodes.get(id) || null,
    addEventListener: (type, listener) => listeners.set(type, listener) };
  const chrome = { tabs: { query: async () => [{ id: 9 }] },
    storage: { local: { get: async () => ({ timerEnabled: true }), set: async () => {} } },
    runtime: { getManifest: () => ({ version: '0.7.1' }), sendMessage: async () => ({
      ok: false, ready: false, classification: 'DEGRADED_SAME_BUILD', health: { state: 'READY', mode: 'ENABLED', reason: 'final-gate-blocked' }
    }) } };
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/popup/popup.js'), 'utf8');
  vm.runInNewContext(source, { chrome, document, console }, { filename: 'src/popup/popup.js' });
  await listeners.get('DOMContentLoaded')();
  assert.equal(nodes.get('friendlyStatus').textContent, 'Limited');
  assert.equal(document.body.dataset.health, 'attention');
});

test('UT-B3-POPUP-CLOCK-001 unreadable clock warns at startup and recovers after refresh', async () => {
  const listeners = new Map(); const nodes = new Map();
  for (const id of ['classification', 'lifecycle', 'reason', 'runtimeId', 'retryCleanup', 'startFresh', 'enabled', 'refresh',
    'version', 'stage', 'friendlyStatus', 'friendlyMessage', 'statusIcon', 'summaryCard', 'emptySummary', 'emptySummaryText',
    'summaryLabel', 'summaryToday', 'summarySession', 'summaryState']) {
    nodes.set(id, { id, textContent: '', hidden: false, checked: true,
      addEventListener(type, listener) { this[`on${type}`] = listener; } });
  }
  const document = { body: { dataset: {} }, getElementById: id => nodes.get(id) || null,
    addEventListener: (type, listener) => listeners.set(type, listener) };
  let summary = { ok: true, status: 'CLOCK_UNDETECTED', current: null };
  let healthResult = {
    ok: true, ready: true, classification: 'HEALTHY_SAME_BUILD', health: { state: 'READY', mode: 'ENABLED', reason: 'ready' }
  };
  const chrome = {
    tabs: { query: async () => [{ id: 17 }], sendMessage: async () => summary },
    storage: { local: { get: async () => ({ timerEnabled: true }), set: async () => {} } },
    runtime: { getManifest: () => ({ version: '0.7.2' }), sendMessage: async () => healthResult }
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/popup/popup.js'), 'utf8');
  vm.runInNewContext(source, { chrome, document, console }, { filename: 'src/popup/popup.js' });
  await listeners.get('DOMContentLoaded')();
  assert.equal(nodes.get('friendlyStatus').textContent, 'Clock not detected');
  assert.equal(document.body.dataset.health, 'attention');
  assert.equal(nodes.get('emptySummary').hidden, false);
  assert.match(nodes.get('emptySummaryText').textContent, /Time is not being recorded/);
  healthResult = { ok: false, reloadRequired: true, classification: 'FAILED_SAME_BUILD',
    health: { state: 'FAILED', mode: 'ENABLED', reason: 'reload-required' } };
  await nodes.get('refresh').onclick();
  assert.equal(nodes.get('friendlyStatus').textContent, 'Needs attention');
  assert.match(nodes.get('friendlyMessage').textContent, /Reload the SquareCoil tab/);
  healthResult = { ok: true, ready: true, classification: 'HEALTHY_SAME_BUILD',
    health: { state: 'READY', mode: 'ENABLED', reason: 'ready' } };
  summary = { ok: true, status: 'WORKING', current: { label: 'Design (General)', todayMs: 4000, sessionMs: 4000 } };
  await nodes.get('refresh').onclick();
  assert.equal(nodes.get('friendlyStatus').textContent, 'Ready');
  assert.equal(document.body.dataset.health, 'ok');
  assert.equal(nodes.get('summaryCard').hidden, false);
  assert.equal(nodes.get('summaryLabel').textContent, 'Design (General)');
  assert.equal(nodes.get('summaryState').textContent, 'Working');
});

test('UT-B5-POPUP-003 popup reports existing Bing access without a second consent action', async () => {
  const listeners = new Map(); const nodes = new Map();
  for (const id of ['classification', 'lifecycle', 'reason', 'runtimeId', 'retryCleanup', 'startFresh', 'enabled', 'refresh',
    'version', 'stage', 'friendlyStatus', 'friendlyMessage', 'statusIcon', 'enableWallpaper', 'wallpaperPermission']) {
    nodes.set(id, { id, textContent: '', hidden: false, checked: true, disabled: false,
      addEventListener(type, listener) { this[`on${type}`] = listener; } });
  }
  const permissionCard = { dataset: {} };
  const document = {
    body: { dataset: {} },
    getElementById: id => nodes.get(id) || null,
    querySelector: selector => selector === '.permission-card' ? permissionCard : null,
    addEventListener: (type, listener) => listeners.set(type, listener)
  };
  let granted = true; const requests = []; const tabMessages = [];
  const chrome = {
    permissions: {
      contains: async request => { requests.push({ type: 'contains', request }); return granted; },
      request: async request => { requests.push({ type: 'request', request }); granted = true; return true; }
    },
    tabs: {
      query: async () => [{ id: 7 }],
      sendMessage: async (tabId, message) => {
        tabMessages.push({ tabId, message });
        return message.type === 'SC_COMPANION_GET_POPUP_SUMMARY' ? { ok: false } : { ok: true };
      }
    },
    storage: { local: { get: async () => ({ timerEnabled: true }), set: async () => {} } },
    runtime: { getManifest: () => ({ version: '0.7.1' }), sendMessage: async () => ({
      ok: true, ready: true, classification: 'HEALTHY_SAME_BUILD', health: { state: 'READY', mode: 'ENABLED', reason: 'ready' }
    }) }
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/popup/popup.js'), 'utf8');
  vm.runInNewContext(source, { chrome, document, console }, { filename: 'src/popup/popup.js' });
  await listeners.get('DOMContentLoaded')();
  assert.equal(nodes.get('enableWallpaper').onclick, undefined);
  assert.equal(requests.some(item => item.type === 'request'), false);
  assert.equal(permissionCard.dataset.granted, 'true');
  assert.match(nodes.get('wallpaperPermission').textContent, /Bing photos are available when the switch is on/);
  assert.equal(tabMessages.some(item => item.message.type === 'SC_COMPANION_B5B_PERMISSION_CHANGED'), false);
});

test('UT-B5-POPUP-004 browser-restricted Bing access reports fallback without a runtime setup action', async () => {
  const listeners = new Map(); const nodes = new Map();
  for (const id of ['classification', 'lifecycle', 'reason', 'runtimeId', 'retryCleanup', 'startFresh', 'enabled', 'refresh',
    'version', 'stage', 'friendlyStatus', 'friendlyMessage', 'statusIcon', 'enableWallpaper', 'wallpaperPermission']) {
    nodes.set(id, { id, textContent: '', hidden: false, checked: true, disabled: false,
      addEventListener(type, listener) { this[`on${type}`] = listener; } });
  }
  const permissionCard = { dataset: {} }; const messages = []; let requestCalls = 0;
  const document = { body: { dataset: {} }, getElementById: id => nodes.get(id) || null,
    querySelector: selector => selector === '.permission-card' ? permissionCard : null,
    addEventListener: (type, listener) => listeners.set(type, listener) };
  const chrome = {
    permissions: { contains: async () => false, request: async request => {
      requestCalls += 1;
      assert.equal(JSON.stringify(request), JSON.stringify({ origins: ['https://www.bing.com/*'] }));
      return false;
    } },
    tabs: { query: async () => [{ id: 19 }], sendMessage: async (_tabId, message) => {
      messages.push(message); return message.type === 'SC_COMPANION_GET_POPUP_SUMMARY' ? { ok: false } : { ok: true };
    } },
    storage: { local: { get: async () => ({ timerEnabled: true }), set: async () => {} } },
    runtime: { getManifest: () => ({ version: '0.7.1' }), sendMessage: async () => ({
      ok: true, ready: true, classification: 'HEALTHY_SAME_BUILD', health: { state: 'READY', reason: 'ready' }
    }) }
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/popup/popup.js'), 'utf8');
  vm.runInNewContext(source, { chrome, document, console }, { filename: 'src/popup/popup.js' });
  await listeners.get('DOMContentLoaded')();
  assert.equal(nodes.get('enableWallpaper').onclick, undefined);
  assert.equal(requestCalls, 0);
  assert.equal(permissionCard.dataset.granted, 'false');
  assert.match(nodes.get('wallpaperPermission').textContent, /Bing photos are unavailable.*built-in background/i);
  assert.equal(messages.some(message => message.type === 'SC_COMPANION_B5B_PERMISSION_CHANGED'), false);
});

test('UT-B5-POPUP-006 Appearance uses revisioned theme and photo commands while panel visibility stays independent', async () => {
  const listeners = new Map(); const nodes = new Map();
  for (const id of ['classification', 'lifecycle', 'reason', 'runtimeId', 'retryCleanup', 'startFresh', 'enabled', 'refresh',
    'version', 'stage', 'friendlyStatus', 'friendlyMessage', 'statusIcon', 'summaryCard', 'emptySummary', 'emptySummaryText',
    'websiteTheme', 'bingPhoto', 'appearanceMessage', 'wallpaperPermission', 'panelVisible', 'panelMessage']) {
    nodes.set(id, { id, textContent: '', hidden: false, checked: true, disabled: false, value: '',
      addEventListener(type, listener) { this[`on${type}`] = listener; } });
  }
  const card = { dataset: {} };
  const document = { body: { dataset: {} }, getElementById: id => nodes.get(id) || null,
    querySelector: selector => selector === '.permission-card' ? card : null,
    addEventListener: (type, listener) => listeners.set(type, listener) };
  let current = { websiteTheme: 'SLEEK_DARK', cinematicBackground: 'CINEMATIC', preferenceRevision: 3 };
  const messages = []; const writes = []; let permissionRequests = 0;
  const chrome = {
    permissions: { contains: async () => true, request: async () => { permissionRequests += 1; return true; } },
    tabs: { query: async () => [{ id: 7 }], sendMessage: async (tabId, message) => {
      assert.equal(tabId, 7); messages.push(message);
      if (message.type === 'SC_COMPANION_GET_POPUP_SUMMARY') return { ok: true, current: null };
      if (message.type === 'SC_COMPANION_GET_APPEARANCE') return { ok: true, preferences: current, panelVisible: true };
      if (message.type === 'SC_COMPANION_SET_APPEARANCE') {
        assert.equal(message.expectedPreferenceRevision, current.preferenceRevision);
        current = { ...current, ...message.patch, preferenceRevision: current.preferenceRevision + 1 };
        return { ok: true, preferences: current, panelVisible: true };
      }
      throw new Error(`unexpected content message: ${message.type}`);
    } },
    storage: { local: { get: async () => ({ timerEnabled: true, companionPanelVisible: true }),
      set: async value => { writes.push(value); } } },
    runtime: { getManifest: () => ({ version: '0.7.1' }), sendMessage: async () => ({
      ok: true, ready: true, classification: 'HEALTHY_SAME_BUILD', health: { state: 'READY', mode: 'ENABLED', reason: 'ready' }
    }) }
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/popup/popup.js'), 'utf8');
  vm.runInNewContext(source, { chrome, document, console }, { filename: 'src/popup/popup.js' });
  await listeners.get('DOMContentLoaded')();
  assert.equal(nodes.get('websiteTheme').value, 'SLEEK_DARK');
  assert.equal(nodes.get('websiteTheme').disabled, false);
  assert.equal(nodes.get('bingPhoto').checked, true);
  assert.equal(nodes.get('bingPhoto').disabled, false);

  nodes.get('bingPhoto').checked = false;
  nodes.get('bingPhoto').onchange(); await tick(5);
  assert.equal(current.cinematicBackground, 'NONE');
  assert.equal(nodes.get('bingPhoto').checked, false);
  nodes.get('websiteTheme').value = 'LIGHT_GLASS';
  nodes.get('websiteTheme').onchange(); await tick(5);
  assert.equal(current.websiteTheme, 'LIGHT_GLASS');
  const commands = messages.filter(message => message.type === 'SC_COMPANION_SET_APPEARANCE');
  assert.equal(JSON.stringify(commands.map(message => [message.patch, message.expectedPreferenceRevision])),
    JSON.stringify([[{ cinematicBackground: 'NONE' }, 3], [{ websiteTheme: 'LIGHT_GLASS' }, 4]]));

  nodes.get('panelVisible').checked = false;
  nodes.get('panelVisible').onchange(); await tick(5);
  assert.equal(JSON.stringify(writes), JSON.stringify([{ companionPanelVisible: false }]));
  assert.equal(nodes.get('enabled').checked, true);
  assert.equal(permissionRequests, 0);
});

test('UT-B5-POPUP-007 unsupported page leaves Appearance safely unavailable but panel visibility usable', async () => {
  const listeners = new Map(); const nodes = new Map();
  for (const id of ['classification', 'lifecycle', 'reason', 'runtimeId', 'retryCleanup', 'startFresh', 'enabled', 'refresh',
    'version', 'stage', 'friendlyStatus', 'friendlyMessage', 'statusIcon', 'websiteTheme', 'bingPhoto',
    'appearanceMessage', 'panelVisible', 'panelMessage']) {
    nodes.set(id, { id, textContent: '', hidden: false, checked: true, disabled: false, value: '',
      addEventListener(type, listener) { this[`on${type}`] = listener; } });
  }
  const document = { body: { dataset: {} }, getElementById: id => nodes.get(id) || null,
    addEventListener: (type, listener) => listeners.set(type, listener) };
  const writes = []; const contentMessages = [];
  const chrome = {
    tabs: { query: async () => [{ id: 4 }], sendMessage: async (_tabId, message) => {
      contentMessages.push(message);
      if (message.type === 'SC_COMPANION_GET_APPEARANCE') throw new Error('no receiver');
      return { ok: false };
    } },
    storage: { local: { get: async () => ({ timerEnabled: true, companionPanelVisible: true }),
      set: async value => { writes.push(value); } } },
    runtime: { getManifest: () => ({ version: '0.7.1' }), sendMessage: async () => ({
      ok: false, classification: 'NO_ACTIVE_TAB', health: { state: 'UNAVAILABLE' }
    }) }
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/popup/popup.js'), 'utf8');
  vm.runInNewContext(source, { chrome, document, console }, { filename: 'src/popup/popup.js' });
  await listeners.get('DOMContentLoaded')();
  assert.equal(nodes.get('websiteTheme').disabled, true);
  assert.equal(nodes.get('bingPhoto').disabled, true);
  assert.match(nodes.get('appearanceMessage').textContent, /unavailable.*Refresh/);
  nodes.get('websiteTheme').value = 'LIGHT_GLASS';
  nodes.get('websiteTheme').onchange(); await tick(4);
  assert.equal(contentMessages.some(message => message.type === 'SC_COMPANION_SET_APPEARANCE'), false);

  nodes.get('panelVisible').checked = false;
  nodes.get('panelVisible').onchange(); await tick(4);
  assert.equal(JSON.stringify(writes), JSON.stringify([{ companionPanelVisible: false }]));
});

function diagnosticDownloadPopup(response) {
  const listeners = new Map();
  const nodes = new Map();
  for (const id of ['downloadDiagnosticLog', 'diagnosticDownloadResult']) {
    nodes.set(id, { textContent: '', disabled: false,
      addEventListener(type, listener) { this[`on${type}`] = listener; } });
  }
  const links = [];
  const objectUrls = [];
  const document = {
    body: { dataset: {}, appendChild(link) { links.push(link); } },
    getElementById: id => nodes.get(id) || null,
    addEventListener: (type, listener) => listeners.set(type, listener),
    createElement: tag => {
      assert.equal(tag, 'a');
      return { clicked: false, removed: false, click() { this.clicked = true; },
        remove() { this.removed = true; } };
    }
  };
  const sent = [];
  const chrome = {
    tabs: { query: async () => [] },
    storage: { local: { get: async () => ({ timerEnabled: true, companionPanelVisible: true }) } },
    runtime: { getManifest: () => ({ version: '0.7.1' }),
      sendMessage: async message => { sent.push(message); return response; } }
  };
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/popup/popup.js'), 'utf8');
  vm.runInNewContext(source, { chrome, document, Blob, Date, console,
    URL: { createObjectURL(blob) { objectUrls.push(blob); return 'blob:test-diagnostic-log'; }, revokeObjectURL() {} },
    setTimeout() { return 1; } }, { filename: 'src/popup/popup.js' });
  return { document, listeners, nodes, links, objectUrls, sent };
}

test('UT-DIAG-006 popup downloads a privacy-whitelisted JSON log without a SquareCoil tab', async () => {
  const h = diagnosticDownloadPopup({ ok: true, schemaVersion: 1,
    exportedAtMs: Date.parse('2026-10-01T12:00:00Z'),
    retention: { maxEntries: 200, maxAgeDays: 30, maxBytes: 65536 },
    entries: [{ atMs: Date.parse('2026-10-01T11:59:00Z'), code: 'WORKER_STARTED',
      area: 'LIFECYCLE', severity: 'info', customer: 'Private Customer 251184' }],
    privateData: 'account-token' });
  await h.listeners.get('DOMContentLoaded')();
  await h.nodes.get('downloadDiagnosticLog').onclick();
  assert.deepEqual(h.sent.map(message => message.type), ['SC_COMPANION_GET_DIAGNOSTIC_LOG']);
  assert.equal(h.links.length, 1);
  assert.equal(h.links[0].clicked, true);
  assert.equal(h.links[0].removed, true);
  assert.equal(h.links[0].download, 'SquareCoil-Companion-diagnostics-2026-10-01.json');
  assert.equal(h.objectUrls.length, 1);
  const json = await h.objectUrls[0].text();
  assert.match(json, /"format": "squarecoil-companion-diagnostic-log"/);
  assert.match(json, /WORKER_STARTED/);
  assert.doesNotMatch(json, /Private Customer|251184|account-token/);
  assert.match(h.nodes.get('diagnosticDownloadResult').textContent, /Download started for 1 saved event/);
  assert.equal(h.nodes.get('downloadDiagnosticLog').disabled, false);
});

test('UT-DIAG-007 unavailable log reports failure without creating a download', async () => {
  const h = diagnosticDownloadPopup({ ok: false, entries: [] });
  await h.listeners.get('DOMContentLoaded')();
  await h.nodes.get('downloadDiagnosticLog').onclick();
  assert.equal(h.links.length, 0);
  assert.equal(h.objectUrls.length, 0);
  assert.match(h.nodes.get('diagnosticDownloadResult').textContent, /Could not download the log/);
  assert.equal(h.nodes.get('downloadDiagnosticLog').disabled, false);
});


test('UT-B1-POPUP-MIG-001 popup copies sanitized migration settlement and clears stale failures after recovery', async () => {
  const listeners = new Map(); const nodes = new Map(); let copied = '';
  for (const id of ['classification', 'lifecycle', 'reason', 'runtimeId', 'enabled', 'refresh', 'version',
    'friendlyStatus', 'friendlyMessage', 'copyDiagnostics', 'copyResult', 'migrationDetails']) {
    nodes.set(id, { textContent: '', hidden: false, checked: true,
      addEventListener(type, listener) { this[`on${type}`] = listener; } });
  }
  let result = { ok: false, ready: false, classification: 'DEGRADED_SAME_BUILD', health: {
    state: 'DEGRADED', reason: 'legacy-preflight-failed', authority: { disposition: 'OWNER' },
    trustedCore: { preflight: { disposition: 'FAILED' }, migrationError: 'legacy-session-id-conflict',
      lastError: 'private-customer-job-123456', timer: { privateHours: 1234 } }
  } };
  const document = { body: { dataset: {} }, getElementById: id => nodes.get(id) || null,
    addEventListener: (type, listener) => listeners.set(type, listener) };
  const chrome = { tabs: { query: async () => [{ id: 17 }] },
    storage: { local: { get: async () => ({ timerEnabled: true }), set: async () => {} } },
    runtime: { getManifest: () => ({ version: '0.7.5' }), sendMessage: async () => result } };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../../src/popup/popup.js'), 'utf8'), {
    document, chrome, console, navigator: { clipboard: { async writeText(value) { copied = value; } } }
  });
  await listeners.get('DOMContentLoaded')();
  await nodes.get('copyDiagnostics').onclick();
  assert.match(copied, /Authority: OWNER/);
  assert.match(copied, /Migration: FAILED/);
  assert.match(copied, /Migration error: legacy-session-id-conflict/);
  assert.doesNotMatch(copied, /private-customer|privateHours|123456/);
  result = { ok: true, ready: true, classification: 'HEALTHY_SAME_BUILD', health: {
    state: 'READY', authority: { disposition: 'OWNER' },
    trustedCore: { preflight: { disposition: 'COMPLETE_MATCH' }, bridge: { capability: 'FULL' } }
  } };
  await nodes.get('refresh').onclick();
  await nodes.get('copyDiagnostics').onclick();
  assert.match(copied, /Migration: COMPLETE_MATCH/);
  assert.match(copied, /Migration error: none/);
  assert.match(copied, /Bridge: FULL/);
  assert.doesNotMatch(copied, /legacy-session-id-conflict/);
});
