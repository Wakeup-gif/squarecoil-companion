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
  assert.match(html, /Companion workspace/);
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

test('UT-B5-POPUP-003 popup requests exact Bing access from its trusted click and refreshes SquareCoil tabs', async () => {
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
  let granted = false; const requests = []; const tabMessages = [];
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
  assert.equal(permissionCard.dataset.granted, 'false');
  await nodes.get('enableWallpaper').onclick();
  assert.equal(JSON.stringify(requests.find(item => item.type === 'request').request), JSON.stringify({ origins: ['https://www.bing.com/*'] }));
  assert.equal(permissionCard.dataset.granted, 'true');
  assert.match(nodes.get('wallpaperPermission').textContent, /Allowed for rotating Bing images/);
  assert.equal(tabMessages.some(item => item.message.type === 'SC_COMPANION_B5B_PERMISSION_CHANGED'), true);
});

test('UT-B5-POPUP-004 denied Bing access remains permission-required and sends no grant notification', async () => {
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
  await nodes.get('enableWallpaper').onclick();
  assert.equal(requestCalls, 1);
  assert.equal(permissionCard.dataset.granted, 'false');
  assert.match(nodes.get('wallpaperPermission').textContent, /Not allowed.*built-in gradient/i);
  assert.equal(messages.some(message => message.type === 'SC_COMPANION_B5B_PERMISSION_CHANGED'), false);
});
