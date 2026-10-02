'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { BUILD_ID, CANDIDATE_FINGERPRINT } = require('../../src/core/build-identity');
const DOCUMENT_TOKEN = 'document-token-background-12345';
const DOCUMENT_ID = 'document-id-background';

function installChromeHarness({
  timerEnabled,
  runtimeSnapshot = null,
  roots = [],
  onSetEnabled = null,
  onRetryTeardown = null,
  onRevalidate = null,
  onRecover = null,
  onTabMessage = null
}) {
  let currentSnapshot = runtimeSnapshot ? { candidateFingerprint: CANDIDATE_FINGERPRINT, ...runtimeSnapshot } : null;
  for (const root of roots) {
    if (root?.dataset?.squarecoilCompanionRoot !== 'rebuild') continue;
    if (!root.dataset.packageVersion) root.dataset.packageVersion = runtimeSnapshot?.packageVersion || '0.7.1';
    if (!root.dataset.candidateFingerprint) root.dataset.candidateFingerprint = CANDIDATE_FINGERPRINT;
  }
  let enableCalls = 0;
  let retryCalls = 0;
  let revalidateCalls = 0;
  let recoverCalls = 0;
  let fileInjections = 0;

  global.window = {
    location: {
      origin: 'https://ussignandmill.squarecoil.net',
      href: 'https://ussignandmill.squarecoil.net/__b1_fixture__/'
    },
    __squareCoilCompanionRuntime: runtimeSnapshot ? {
      buildId: runtimeSnapshot.buildId,
      packageVersion: currentSnapshot.packageVersion,
      candidateFingerprint: currentSnapshot.candidateFingerprint,
      runtimeInstanceId: runtimeSnapshot.runtimeInstanceId,
      documentToken: runtimeSnapshot.documentToken || DOCUMENT_TOKEN,
      getHealth: () => currentSnapshot,
      boot: async () => currentSnapshot,
      teardown: async () => currentSnapshot,
      setEnabled: async enabled => {
        enableCalls += 1;
        const overridden = onSetEnabled
          ? await onSetEnabled({ enabled, currentSnapshot, roots })
          : null;
        currentSnapshot = overridden || {
            ...currentSnapshot,
            mode: enabled ? 'ENABLED' : 'DISABLED',
            teardownInProgress: false
          };
        return currentSnapshot;
      },
      retryTeardown: async () => {
        retryCalls += 1;
        const overridden = onRetryTeardown ? await onRetryTeardown({ currentSnapshot, roots }) : null;
        currentSnapshot = overridden || currentSnapshot;
        return currentSnapshot;
      },
      revalidate: async () => {
        revalidateCalls += 1;
        const overridden = onRevalidate ? await onRevalidate({ currentSnapshot, roots }) : null;
        currentSnapshot = overridden || currentSnapshot;
        return currentSnapshot;
      },
      recover: async () => {
        recoverCalls += 1;
        const overridden = onRecover ? await onRecover({ currentSnapshot, roots }) : null;
        currentSnapshot = overridden || currentSnapshot;
        return currentSnapshot;
      }
    } : null
  };
  if (!runtimeSnapshot) delete global.window.__squareCoilCompanionRuntime;
  global.window.top = global.window;
  global.document = {
    documentElement: { dataset: { squarecoilCompanionDocumentToken: DOCUMENT_TOKEN } },
    querySelectorAll: () => roots
  };
  global.chrome = {
    tabs: {
      sendMessage: async (tabId, message, options) => onTabMessage
        ? onTabMessage({ tabId, message, options })
        : ({
            ok: true,
            disconnected: true,
            protocolVersion: message.protocolVersion,
            documentToken: message.documentToken,
            runtimeInstanceId: message.runtimeInstanceId
          })
    },
    scripting: {
      executeScript: async options => {
        if (options.files) {
          fileInjections += 1;
          const bootstrap = global.window.__squareCoilCompanionBootstrap;
          if (bootstrap) {
            currentSnapshot = {
              buildId: bootstrap.buildId,
              packageVersion: bootstrap.packageVersion,
              candidateFingerprint: bootstrap.candidateFingerprint,
              runtimeInstanceId: bootstrap.runtimeInstanceId,
              documentToken: bootstrap.documentToken,
              mode: 'ENABLED',
              state: 'DEGRADED',
              reason: 'coordination-not-implemented-b1',
              teardownInProgress: false,
              readiness: {
                oneLifecycleOwner: true,
                validRuntimeIdentity: true,
                oneOwnedRoot: true,
                interactionReady: true,
                persistenceAvailable: true,
                bridgeInitialized: true,
                initialObservationAttempted: true,
                featureRegistryInitialized: true,
                teardownRegistered: true,
                coordinationPositive: false
              },
              ui: { rootPresent: true, interactionReady: true }
            };
            const freshRuntime = {
              buildId: bootstrap.buildId,
              packageVersion: bootstrap.packageVersion,
              candidateFingerprint: bootstrap.candidateFingerprint,
              runtimeInstanceId: bootstrap.runtimeInstanceId,
              documentToken: bootstrap.documentToken,
              getHealth: () => currentSnapshot,
              boot: async () => currentSnapshot,
              teardown: async () => currentSnapshot,
              setEnabled: async () => currentSnapshot,
              retryTeardown: async () => currentSnapshot,
              revalidate: async () => currentSnapshot,
              recover: async () => currentSnapshot
            };
            global.window.__squareCoilCompanionRuntime = freshRuntime;
            roots.push({
              dataset: {
                squarecoilCompanionRoot: 'rebuild',
                runtimeInstanceId: bootstrap.runtimeInstanceId,
                buildId: bootstrap.buildId,
                packageVersion: bootstrap.packageVersion,
                candidateFingerprint: bootstrap.candidateFingerprint,
                documentToken: bootstrap.documentToken
              }
            });
            delete global.window.__squareCoilCompanionBootstrap;
            delete global.window.__squareCoilCompanionInjectionClaim;
          }
          return [{ documentId: DOCUMENT_ID, frameId: 0 }];
        }
        const result = await options.func(...(options.args || []));
        return [{ result, documentId: DOCUMENT_ID, frameId: 0 }];
      }
    },
    storage: {
      local: {
        get: async () => ({ timerEnabled }),
        set: async values => {
          if (Object.hasOwn(values, 'timerEnabled')) timerEnabled = values.timerEnabled;
        },
        remove: async () => {}
      }
    },
    runtime: {
      id: 'squarecoil-test-extension-id',
      getManifest: () => ({ version: '0.7.1' }),
      onInstalled: { addListener: () => {} },
      onMessage: { addListener: () => {} }
    }
  };

  return {
    enableCalls: () => enableCalls,
    retryCalls: () => retryCalls,
    revalidateCalls: () => revalidateCalls,
    recoverCalls: () => recoverCalls,
    fileInjections: () => fileInjections
  };
}

function loadBackground() {
  const modulePath = require.resolve('../../src/extension/background-entry');
  delete require.cache[modulePath];
  return require(modulePath);
}

function completeB2SettlementAcknowledgment(message) {
  return {
    ok: true,
    type: 'SC_COMPANION_AUTHORITY_B2_SETTLEMENT_ACK',
    protocolVersion: message.protocolVersion,
    settlementId: message.settlementId,
    settlementMode: message.settlementMode,
    workerInstanceId: message.workerInstanceId,
    documentToken: message.documentToken,
    runtimeInstanceId: message.runtimeInstanceId,
    authority: {
      enabled: true,
      healthy: true,
      subscribed: true,
      errorFree: true,
      capturedAtMs: Date.now(),
      leaseExpiry: Date.now() + 60_000,
      disposition: 'OWNER',
      coordinationEpoch: 3,
      workerInstanceId: message.workerInstanceId,
      revision: 0
    },
    core: {
      initialized: true,
      disposed: false,
      blocked: false,
      authorityOwner: true,
      authorityTenure: { coordinationEpoch: 3, workerInstanceId: message.workerInstanceId },
      revision: 0,
      readModelError: null,
      preflight: { checked: true, blocked: false, disposition: 'NOT_REQUIRED', reason: 'legacy-not-present' },
      bridge: {
        initialized: true,
        active: true,
        owner: true,
        disposed: false,
        listenersAttached: true,
        verificationInFlight: false,
        capability: 'FULL',
        requestCount: 1,
        ownerInitialObservationCompleted: true,
        authorityTenure: { coordinationEpoch: 3, workerInstanceId: message.workerInstanceId }
      }
    }
  };
}

test.afterEach(() => {
  delete global.chrome;
  delete global.document;
  delete global.window;
});

test('UT-B5-CINE-042 a granted exact Bing origin is recognized without accepting broader permission changes', () => {
  installChromeHarness({ timerEnabled: true });
  const { includesBingPermission, BING_PERMISSION_ORIGIN, B5B_PERMISSION_CHANGED_MESSAGE } = loadBackground();
  assert.equal(BING_PERMISSION_ORIGIN, 'https://www.bing.com/*');
  assert.equal(B5B_PERMISSION_CHANGED_MESSAGE, 'SC_COMPANION_B5B_PERMISSION_CHANGED');
  assert.equal(includesBingPermission({ origins: ['https://www.bing.com/*'] }), true);
  assert.equal(includesBingPermission({ origins: ['https://bing.com/*'] }), false);
  assert.equal(includesBingPermission({ origins: ['https://www.bing.com.evil.example/*'] }), false);
  assert.equal(includesBingPermission({ origins: ['<all_urls>'] }), false);
  assert.equal(includesBingPermission({ permissions: ['tabs'] }), false);
});

test('UT-B5-BING-008 Native background cleanup retains required host access and exact acknowledgment', async () => {
  installChromeHarness({ timerEnabled: true });
  let listener; let permissionMutations = 0; const removedKeys = [];
  global.chrome.runtime.onMessage.addListener = value => { listener = value; };
  global.chrome.permissions = {
    contains: async () => true,
    request: () => { permissionMutations += 1; },
    remove: () => { permissionMutations += 1; }
  };
  global.chrome.storage.local.remove = async key => { removedKeys.push(key); };
  const background = loadBackground();
  const message = { type: background.B5B_CLEAR_WALLPAPER_MESSAGE, requestId: 'skin-cleanup-12345', documentToken: DOCUMENT_TOKEN,
    buildId: BUILD_ID, packageVersion: '0.7.1', candidateFingerprint: CANDIDATE_FINGERPRINT };
  const sender = { tab: { id: 7 }, frameId: 0, documentId: DOCUMENT_ID,
    url: 'https://ussignandmill.squarecoil.net/dashboard.php?show=2' };
  let response;
  const listening = listener(message, sender, value => { response = value; });
  assert.equal(listening, true);
  for (let index = 0; index < 12 && !response; index += 1) await Promise.resolve();
  assert.equal(response?.cacheCleared, true);
  assert.equal(response?.type, background.B5B_ACK_MESSAGE);
  assert.equal(response?.requestId, message.requestId);
  assert.equal(response?.candidateFingerprint, CANDIDATE_FINGERPRINT);
  assert.deepEqual(removedKeys, [[
    'squarecoilCompanionB5BWallpaperCacheV1',
    'squarecoilCompanionB5BWallpaperRetryV1'
  ]]);
  assert.equal(permissionMutations, 0);
  assert.equal(await global.chrome.permissions.contains(), true);
});

test('UT-B5-BING-009 stale, wrong-frame, non-Glass and non-content messages cannot retrieve wallpaper', async () => {
  installChromeHarness({ timerEnabled: true });
  let listener; let requestCalls = 0;
  global.chrome.runtime.onMessage.addListener = value => { listener = value; };
  global.chrome.permissions = { contains: async () => false, request: () => { requestCalls += 1; return true; } };
  const background = loadBackground();
  const message = { type: background.B5B_WALLPAPER_MESSAGE, requestId: 'skin-request-12345',
    websiteTheme: 'LIGHT_GLASS', documentToken: DOCUMENT_TOKEN,
    buildId: BUILD_ID, packageVersion: '0.7.1', candidateFingerprint: CANDIDATE_FINGERPRINT };
  const sender = { tab: { id: 7 }, frameId: 0, documentId: DOCUMENT_ID,
    url: 'https://ussignandmill.squarecoil.net/dashboard.php?show=2' };
  for (const [value, from] of [
    [{ ...message, candidateFingerprint: 'stale' }, sender],
    [message, { ...sender, frameId: 1 }],
    [message, { ...sender, url: 'https://unrelated.example/' }],
    [{ ...message, websiteTheme: 'ORIGINAL' }, sender],
    [{ ...message, requestId: 'bad' }, sender],
    [message, {}]
  ]) {
    let response;
    listener(value, from, result => { response = result; });
    for (let index = 0; index < 12 && !response; index += 1) await Promise.resolve();
    assert.equal(response?.ok, false);
  }
  assert.equal(requestCalls, 0);
});

test('boot request waits for teardown, retires the old runtime, and injects a fresh generation', async () => {
  const runtimeInstanceId = 'runtime-teardown-race';
  const root = {
    dataset: {
      squarecoilCompanionRoot: 'rebuild',
      runtimeInstanceId,
      buildId: BUILD_ID,
      documentToken: DOCUMENT_TOKEN
    }
  };
  const harness = installChromeHarness({
    timerEnabled: true,
    roots: [root],
    runtimeSnapshot: {
      buildId: BUILD_ID,
      packageVersion: '0.7.1',
      runtimeInstanceId,
      documentToken: DOCUMENT_TOKEN,
      mode: 'DISABLED',
      state: 'DEGRADED',
      reason: 'coordination-not-implemented-b1',
      teardownInProgress: true,
      readiness: null,
      ui: { rootPresent: true, interactionReady: true }
    },
    onSetEnabled: async ({ enabled, currentSnapshot, roots: liveRoots }) => {
      assert.equal(enabled, true);
      liveRoots.splice(0);
      delete global.window.__squareCoilCompanionRuntime;
      return {
        ...currentSnapshot,
        mode: 'ENABLED',
        state: 'UNINITIALIZED',
        reason: 'fresh-runtime-required',
        teardownInProgress: false,
        ui: { rootPresent: false, interactionReady: false }
      };
    }
  });
  const background = loadBackground();

  const result = await background.bootPage(17);

  assert.equal(harness.enableCalls(), 1);
  assert.equal(harness.fileInjections(), 1);
  assert.equal(result.source, 'fresh-boot');
});

test('a newer disable during retirement prevents the older boot from injecting', async () => {
  const runtimeInstanceId = 'runtime-disable-wins';
  const roots = [{
    dataset: {
      squarecoilCompanionRoot: 'rebuild',
      runtimeInstanceId,
      buildId: BUILD_ID,
      documentToken: DOCUMENT_TOKEN
    }
  }];
  const harness = installChromeHarness({
    timerEnabled: true,
    roots,
    runtimeSnapshot: {
      buildId: BUILD_ID,
      packageVersion: '0.7.1',
      runtimeInstanceId,
      documentToken: DOCUMENT_TOKEN,
      mode: 'DISABLED',
      state: 'DEGRADED',
      reason: 'coordination-not-implemented-b1',
      teardownInProgress: true,
      readiness: null,
      ui: { rootPresent: true, interactionReady: true }
    },
    onSetEnabled: async ({ currentSnapshot, roots: liveRoots }) => {
      await global.chrome.storage.local.set({ timerEnabled: false });
      liveRoots.splice(0);
      delete global.window.__squareCoilCompanionRuntime;
      return {
        ...currentSnapshot,
        mode: 'ENABLED',
        state: 'UNINITIALIZED',
        reason: 'fresh-runtime-required',
        teardownInProgress: false,
        ui: { rootPresent: false, interactionReady: false }
      };
    }
  });
  const background = loadBackground();

  const result = await background.bootPage(19);

  assert.equal(harness.enableCalls(), 1);
  assert.equal(harness.fileInjections(), 0);
  assert.equal(result.enabled, false);
  assert.equal(result.health.state, 'UNINITIALIZED');
});

test('BFCache revalidation cannot boot a page while Companion is disabled', async () => {
  const harness = installChromeHarness({ timerEnabled: false });
  const background = loadBackground();

  const result = await background.revalidatePage(23);

  assert.equal(result.enabled, false);
  assert.equal(result.health.state, 'UNINITIALIZED');
  assert.equal(result.health.reason, 'user-disabled');
  assert.equal(harness.fileInjections(), 0);
});

test('disable never invokes an older-build runtime and requires a reload boundary', async () => {
  const olderBuildId = 'rebuild-older-incompatible-build';
  const root = {
    dataset: {
      squarecoilCompanionRoot: 'rebuild',
      runtimeInstanceId: 'runtime-older',
      buildId: olderBuildId,
      documentToken: DOCUMENT_TOKEN
    }
  };
  const harness = installChromeHarness({
    timerEnabled: false,
    roots: [root],
    runtimeSnapshot: {
      buildId: olderBuildId,
      packageVersion: '0.7.0',
      runtimeInstanceId: 'runtime-older',
      documentToken: DOCUMENT_TOKEN,
      mode: 'ENABLED',
      state: 'READY',
      reason: 'ready',
      teardownInProgress: false,
      readiness: {},
      ui: { rootPresent: true, interactionReady: true }
    }
  });
  const background = loadBackground();

  const result = await background.bootPage(29);

  assert.equal(harness.enableCalls(), 0);
  assert.equal(harness.fileInjections(), 0);
  assert.equal(result.enabled, false);
  assert.equal(result.classification, 'VERSION_MISMATCH');
  assert.equal(result.reloadRequired, true);
  assert.equal(result.reason, 'version-mismatch-reload-required');
});

test('disable rechecks identity when a different runtime wins an orphan-removal race', async () => {
  const roots = [];
  let incompatibleEnableCalls = 0;
  const olderSnapshot = {
    buildId: 'rebuild-race-older-build',
    packageVersion: '0.7.0',
    runtimeInstanceId: 'runtime-race-older',
    documentToken: DOCUMENT_TOKEN,
    mode: 'ENABLED',
    state: 'READY',
    reason: 'ready',
    teardownInProgress: false,
    readiness: {},
    ui: { rootPresent: false, interactionReady: false }
  };
  const orphan = {
    dataset: {
      squarecoilCompanionRoot: 'rebuild',
      runtimeInstanceId: 'orphan-runtime',
      buildId: BUILD_ID,
      documentToken: DOCUMENT_TOKEN
    },
    remove() {
      roots.splice(0);
      global.window.__squareCoilCompanionRuntime = {
        buildId: olderSnapshot.buildId,
        runtimeInstanceId: olderSnapshot.runtimeInstanceId,
        documentToken: DOCUMENT_TOKEN,
        getHealth: () => olderSnapshot,
        setEnabled: async () => {
          incompatibleEnableCalls += 1;
          return olderSnapshot;
        }
      };
    }
  };
  roots.push(orphan);
  installChromeHarness({ timerEnabled: true, roots });
  const background = loadBackground();
  await global.chrome.storage.local.set({ timerEnabled: false });

  const result = await background.setPageEnabled(31, false);

  assert.equal(incompatibleEnableCalls, 0);
  assert.equal(result.classification, 'VERSION_MISMATCH');
  assert.equal(result.reloadRequired, true);
});

test('concurrent persistence preflights use isolated probe keys', async () => {
  installChromeHarness({ timerEnabled: true });
  const values = new Map();
  const probeKeys = [];
  let writes = 0;
  let releaseWrites;
  const bothWritten = new Promise(resolve => { releaseWrites = resolve; });
  global.chrome.storage.local = {
    set: async entries => {
      for (const [key, value] of Object.entries(entries)) {
        values.set(key, value);
        if (key.startsWith('__scCompanionB1PersistenceProbe:')) probeKeys.push(key);
      }
      writes += 1;
      if (writes === 2) releaseWrites();
      await bothWritten;
    },
    get: async key => ({ [key]: values.get(key) }),
    remove: async key => { values.delete(key); }
  };
  const background = loadBackground();

  const results = await Promise.all([
    background.checkPersistence(),
    background.checkPersistence()
  ]);

  assert.deepEqual(results, [true, true]);
  assert.equal(probeKeys.length, 2);
  assert.equal(new Set(probeKeys).size, 2);
  assert.equal([...values.keys()].some(key => key.startsWith('__scCompanionB1PersistenceProbe:')), false);
});

function diagnosticWorkerHarness(entries = []) {
  const harness = installChromeHarness({ timerEnabled: true });
  const storageKey = 'scCompanionDiagnosticLogV1';
  const values = new Map([
    [storageKey, { schemaVersion: 1, entries }],
    ['timerEnabled', true],
    ['unrelated-authority-fixture', { revision: 7, timer: 'preserve', ledger: ['preserve'] }]
  ]);
  let failsGet = false;
  let failsSet = false;
  let reads = 0;
  let writes = 0;
  let tabMessages = 0;
  global.chrome.tabs.sendMessage = async () => {
    tabMessages += 1;
    throw new Error('diagnostics must not message a SquareCoil tab');
  };
  global.chrome.storage.local = {
    get: async key => {
      reads += 1;
      if (failsGet) throw new Error('private diagnostic read failure: job 251184');
      return { [key]: values.get(key) };
    },
    set: async batch => {
      writes += 1;
      if (failsSet) throw new Error('private diagnostic write failure: account-token');
      for (const [key, value] of Object.entries(batch)) values.set(key, structuredClone(value));
    },
    remove: async key => { values.delete(key); }
  };
  let listener;
  global.chrome.runtime.onMessage.addListener = value => { listener = value; };
  const background = loadBackground();
  const extensionId = global.chrome.runtime.id;
  const popupSender = { id: extensionId, url: `chrome-extension://${extensionId}/popup/popup.html` };
  return {
    background, listener, popupSender, values, storageKey, harness,
    counts: () => ({ reads, writes, tabMessages }),
    failGet(value) { failsGet = value; },
    failSet(value) { failsSet = value; },
    async request(type) {
      return new Promise(resolve => {
        assert.equal(listener({ type }, popupSender, resolve), true);
      });
    }
  };
}

test('UT-DIAG-008 worker serves a bounded private-data-free log to the exact popup without a SquareCoil tab', async () => {
  const atMs = Date.now() - 1_000;
  const entries = Array.from({ length: 205 }, (_, index) => ({
    atMs: atMs - index * 1_000, code: 'WALLPAPER_FALLBACK',
    area: 'Private Customer 251184', severity: 'account-token',
    url: 'https://ussignandmill.squarecoil.net/project.php?id=251184'
  }));
  entries.push({ atMs: atMs - 31 * 24 * 60 * 60_000, code: 'NATIVE_CLOCK_OBSERVED' });
  entries.push({ atMs, code: 'PRIVATE_CUST_251184', message: 'private support message' });
  const h = diagnosticWorkerHarness(entries);
  const authorityBefore = structuredClone(h.values.get('unrelated-authority-fixture'));
  const result = await h.request(h.background.GET_DIAGNOSTIC_LOG_MESSAGE);
  assert.equal(result.ok, true);
  assert.equal(result.schemaVersion, 1);
  assert.deepEqual(result.retention, { maxEntries: 200, maxAgeDays: 30, maxBytes: 65536 });
  assert.equal(result.entries.length, 200);
  assert.equal(result.entries.some(entry => entry.code === 'WORKER_STARTED'), true);
  assert.equal(result.entries.some(entry => entry.code === 'NATIVE_CLOCK_OBSERVED'), false);
  assert.equal(result.entries.every(entry => Object.keys(entry).sort().join(',') === 'area,atMs,code,severity'), true);
  assert.doesNotMatch(JSON.stringify(result), /251184|Private Customer|account-token|private support message|project\.php/);
  assert.ok(Buffer.byteLength(JSON.stringify(h.values.get(h.storageKey)), 'utf8') <= 65536);
  assert.deepEqual(h.values.get('unrelated-authority-fixture'), authorityBefore);
  assert.equal(h.values.get('timerEnabled'), true);
  assert.equal(h.counts().tabMessages, 0);
  assert.equal(h.harness.fileInjections(), 0);
  assert.equal(h.harness.enableCalls(), 0);
});

test('UT-DIAG-009 GET and CLEAR reject every near-match sender without reading or clearing the saved log', async () => {
  const h = diagnosticWorkerHarness();
  await h.request(h.background.GET_DIAGNOSTIC_LOG_MESSAGE);
  const logBefore = structuredClone(h.values.get(h.storageKey));
  const countsBefore = h.counts();
  const rejectedSenders = [
    {},
    { url: h.popupSender.url },
    { ...h.popupSender, id: 'another-extension-id' },
    { ...h.popupSender, url: undefined },
    { ...h.popupSender, url: 'https://ussignandmill.squarecoil.net/dashboard.php?show=2' },
    { ...h.popupSender, url: 'chrome-extension://another-extension-id/popup/popup.html' },
    { ...h.popupSender, url: h.popupSender.url.replace('/popup/popup.html', '/other.html') },
    { ...h.popupSender, url: `${h.popupSender.url}?source=popup` },
    { ...h.popupSender, url: `${h.popupSender.url}#diagnostics` },
    { ...h.popupSender, tab: { id: 72, url: h.popupSender.url }, frameId: 0 }
  ];
  for (const type of [h.background.GET_DIAGNOSTIC_LOG_MESSAGE, h.background.CLEAR_DIAGNOSTIC_LOG_MESSAGE]) {
    for (const sender of rejectedSenders) {
      const responses = [];
      assert.equal(h.listener({ type }, sender, value => responses.push(value)), false);
      assert.deepEqual(responses, [{ ok: false, reason: 'extension-popup-required' }]);
    }
  }
  assert.deepEqual(h.counts(), countsBefore);
  assert.deepEqual(h.values.get(h.storageKey), logBefore);
  assert.equal(h.harness.fileInjections(), 0);
  assert.equal(h.harness.enableCalls(), 0);
});

test('UT-DIAG-010 trusted popup CLEAR removes only diagnostics and a later GET stays empty', async () => {
  const h = diagnosticWorkerHarness([{ atMs: Date.now() - 1_000, code: 'WALLPAPER_FAILED' }]);
  const authorityBefore = structuredClone(h.values.get('unrelated-authority-fixture'));
  const before = await h.request(h.background.GET_DIAGNOSTIC_LOG_MESSAGE);
  assert.equal(before.entries.some(entry => entry.code === 'WALLPAPER_FAILED'), true);
  assert.deepEqual(await h.request(h.background.CLEAR_DIAGNOSTIC_LOG_MESSAGE), { ok: true, cleared: true });
  assert.deepEqual(h.values.get(h.storageKey), { schemaVersion: 1, entries: [] });
  const after = await h.request(h.background.GET_DIAGNOSTIC_LOG_MESSAGE);
  assert.equal(after.ok, true);
  assert.deepEqual(after.entries, []);
  assert.deepEqual(h.values.get('unrelated-authority-fixture'), authorityBefore);
  assert.equal(h.values.get('timerEnabled'), true);
  assert.equal(h.counts().tabMessages, 0);
  assert.equal(h.harness.fileInjections(), 0);
  assert.equal(h.harness.enableCalls(), 0);
});

test('UT-DIAG-011 trusted popup storage failures return unavailable results without private exception text', async () => {
  const h = diagnosticWorkerHarness();
  await h.request(h.background.GET_DIAGNOSTIC_LOG_MESSAGE);
  const logBefore = structuredClone(h.values.get(h.storageKey));
  h.failGet(true);
  const unavailable = await h.request(h.background.GET_DIAGNOSTIC_LOG_MESSAGE);
  assert.equal(unavailable.ok, false);
  assert.deepEqual(unavailable.entries, []);
  assert.doesNotMatch(JSON.stringify(unavailable), /251184|private diagnostic read failure/);
  h.failGet(false);
  h.failSet(true);
  const failedClear = await h.request(h.background.CLEAR_DIAGNOSTIC_LOG_MESSAGE);
  assert.deepEqual(failedClear, { ok: false, cleared: false });
  assert.doesNotMatch(JSON.stringify(failedClear), /account-token|private diagnostic write failure/);
  assert.deepEqual(h.values.get(h.storageKey), logBefore);
  h.failSet(false);
  const result = await new Promise(resolve => {
    assert.equal(h.listener({ type: h.background.GET_DIAGNOSTIC_LOG_MESSAGE }, h.popupSender, resolve), true);
  });
  assert.equal(result.ok, true);
  assert.equal(h.counts().tabMessages, 0);
  assert.equal(h.harness.fileInjections(), 0);
  assert.equal(h.harness.enableCalls(), 0);
});

test('UT-B1-LC-23 orchestration keeps disabled checks read-only and exposes only explicit cleanup retry', async () => {
  let cleanupFailuresRemaining = 1;
  const failedSnapshot = {
    buildId: BUILD_ID,
    packageVersion: '0.7.1',
    runtimeInstanceId: 'runtime-cleanup-locked',
    documentToken: DOCUMENT_TOKEN,
    mode: 'DISABLED',
    state: 'FAILED',
    reason: 'teardown-incomplete',
    teardownInProgress: false,
    cleanupRequired: true,
    outstandingResources: ['ownership', 'bridge'],
    readiness: null,
    ui: { rootPresent: false, interactionReady: false }
  };
  const harness = installChromeHarness({
    timerEnabled: false,
    runtimeSnapshot: failedSnapshot,
    onRetryTeardown: async ({ currentSnapshot }) => {
      if (cleanupFailuresRemaining > 0) {
        cleanupFailuresRemaining -= 1;
        return currentSnapshot;
      }
      const clean = {
        ...currentSnapshot,
        state: 'UNINITIALIZED',
        reason: 'teardown-complete',
        cleanupRequired: false,
        outstandingResources: []
      };
      delete global.window.__squareCoilCompanionRuntime;
      return clean;
    }
  });
  const background = loadBackground();

  const disabledBoot = await background.bootPage(37);
  const disabledRevalidate = await background.revalidatePage(37);
  const repeatedDisable = await background.setPageEnabled(37, false);
  await global.chrome.storage.local.set({ timerEnabled: true });
  const blockedEnable = await background.setPageEnabled(37, true);

  for (const result of [disabledBoot, disabledRevalidate, repeatedDisable, blockedEnable]) {
    assert.equal(result.health.state, 'FAILED');
    assert.equal(result.health.reason, 'teardown-incomplete');
  }
  assert.equal(harness.enableCalls(), 0);
  assert.equal(harness.revalidateCalls(), 0);
  assert.equal(harness.recoverCalls(), 0);
  assert.equal(harness.retryCalls(), 0);
  assert.equal(harness.fileInjections(), 0);

  const failedRetry = await background.retryTeardown(37);
  assert.equal(failedRetry.health.state, 'FAILED');
  assert.equal(failedRetry.cleanupComplete, false);
  assert.equal(harness.retryCalls(), 1);
  assert.equal(harness.fileInjections(), 0);

  const successfulRetry = await background.retryTeardown(37);
  assert.equal(successfulRetry.health.state, 'UNINITIALIZED');
  assert.equal(successfulRetry.cleanupComplete, true);
  assert.equal(successfulRetry.restartAvailable, true);
  assert.equal(harness.retryCalls(), 2);
  assert.equal(harness.fileInjections(), 0);

  const freshBoot = await background.bootPage(37);
  assert.equal(freshBoot.injectionPerformed, true);
  assert.equal(harness.fileInjections(), 1);
});

test('disabled observation fails closed when the page cannot be inspected', async () => {
  installChromeHarness({ timerEnabled: false });
  global.chrome.scripting.executeScript = async () => { throw new Error('target-closed'); };
  const background = loadBackground();

  const observed = await background.bootPage(39);
  assert.equal(observed.ok, false);
  assert.equal(observed.classification, 'OWNERSHIP_CONFLICT');
  assert.equal(observed.reason, 'page-inspection-failed');
  assert.equal(observed.reloadRequired, true);

  const disabled = await background.setPageEnabled(39, false);
  assert.equal(disabled.ok, false);
  assert.equal(disabled.reason, 'page-inspection-failed');
  assert.equal(disabled.reloadRequired, true);
});

test('a forged health snapshot cannot hide a mismatched runtime handle', async () => {
  const runtimeInstanceId = 'runtime-forged-health-12345';
  const root = {
    dataset: {
      squarecoilCompanionRoot: 'rebuild',
      runtimeInstanceId,
      buildId: BUILD_ID,
      documentToken: DOCUMENT_TOKEN
    }
  };
  installChromeHarness({
    timerEnabled: true,
    roots: [root],
    runtimeSnapshot: {
      buildId: BUILD_ID,
      runtimeInstanceId,
      documentToken: DOCUMENT_TOKEN,
      mode: 'ENABLED',
      state: 'READY',
      teardownInProgress: false,
      readiness: {
        oneLifecycleOwner: true,
        validRuntimeIdentity: true,
        oneOwnedRoot: true,
        interactionReady: true,
        persistenceAvailable: true,
        bridgeInitialized: true,
        initialObservationAttempted: true,
        featureRegistryInitialized: true,
        teardownRegistered: true,
        coordinationPositive: true
      },
      ui: { rootPresent: true, interactionReady: true }
    }
  });
  global.window.__squareCoilCompanionRuntime.documentToken = 'different-document-token-12345';
  const background = loadBackground();

  const result = await background.getHealth(43);
  assert.equal(result.classification, 'OWNERSHIP_CONFLICT');
  assert.equal(result.reloadRequired, true);
});

test('UT-B2-READY-016 final B2 health requires and accepts exact refresh and confirmation acknowledgments', async () => {
  const runtimeInstanceId = 'runtime-final-settlement-12345';
  const root = {
    dataset: {
      squarecoilCompanionRoot: 'rebuild',
      runtimeInstanceId,
      buildId: BUILD_ID,
      documentToken: DOCUMENT_TOKEN
    }
  };
  installChromeHarness({
    timerEnabled: true,
    roots: [root],
    runtimeSnapshot: {
      buildId: BUILD_ID,
      packageVersion: '0.7.1',
      runtimeInstanceId,
      documentToken: DOCUMENT_TOKEN,
      mode: 'ENABLED',
      state: 'DEGRADED',
      reason: 'coordination-not-implemented-b1',
      teardownInProgress: false,
      readiness: {
        oneLifecycleOwner: true,
        validRuntimeIdentity: true,
        oneOwnedRoot: true,
        interactionReady: true,
        persistenceAvailable: true,
        bridgeInitialized: true,
        initialObservationAttempted: true,
        featureRegistryInitialized: true,
        teardownRegistered: true,
        coordinationPositive: false
      },
      ui: { rootPresent: true, interactionReady: true }
    },
    onTabMessage: ({ message }) => completeB2SettlementAcknowledgment(message)
  });
  const background = loadBackground();

  const result = await background.getHealth(61);
  assert.equal(result.ok, true);
  assert.equal(result.ready, true);
  assert.equal(result.classification, 'HEALTHY_SAME_BUILD');
  assert.equal(result.health.state, 'READY');
  assert.equal(result.b2Settlement.authorityDisposition, 'OWNER');
});

test('UT-B2-READY-014 an accepted settlement cannot outlive its exact MAIN runtime identity', async () => {
  const runtimeInstanceId = 'runtime-settlement-before-race-001';
  const replacementRuntimeInstanceId = 'runtime-settlement-after-race-002';
  const root = {
    dataset: {
      squarecoilCompanionRoot: 'rebuild',
      runtimeInstanceId,
      buildId: BUILD_ID,
      documentToken: DOCUMENT_TOKEN
    }
  };
  installChromeHarness({
    timerEnabled: true,
    roots: [root],
    runtimeSnapshot: {
      buildId: BUILD_ID,
      packageVersion: '0.7.1',
      runtimeInstanceId,
      documentToken: DOCUMENT_TOKEN,
      mode: 'ENABLED',
      state: 'DEGRADED',
      reason: 'coordination-not-implemented-b1',
      teardownInProgress: false,
      readiness: {
        oneLifecycleOwner: true,
        validRuntimeIdentity: true,
        oneOwnedRoot: true,
        interactionReady: true,
        persistenceAvailable: true,
        bridgeInitialized: true,
        initialObservationAttempted: true,
        featureRegistryInitialized: true,
        teardownRegistered: true,
        coordinationPositive: false
      },
      ui: { rootPresent: true, interactionReady: true }
    },
    onTabMessage: ({ message }) => {
      const runtime = global.window.__squareCoilCompanionRuntime;
      const health = runtime.getHealth();
      global.window.__squareCoilCompanionRuntime = {
        ...runtime,
        runtimeInstanceId: replacementRuntimeInstanceId,
        getHealth: () => ({ ...health, runtimeInstanceId: replacementRuntimeInstanceId })
      };
      root.dataset.runtimeInstanceId = replacementRuntimeInstanceId;
      return completeB2SettlementAcknowledgment(message);
    }
  });
  const background = loadBackground();

  const result = await background.getHealth(81);
  assert.equal(result.ok, false);
  assert.equal(result.ready, false);
  assert.equal(result.classification, 'DEGRADED_SAME_BUILD');
  assert.equal(result.reason, 'settlement-runtime-identity-changed');
  assert.equal(result.health.runtimeInstanceId, replacementRuntimeInstanceId);
  assert.equal(result.health.readiness.coordinationPositive, false);
});

test('UT-B2-READY-015 an accepted settlement is discarded when the final page classification changes', async () => {
  const runtimeInstanceId = 'runtime-settlement-class-race-001';
  const root = {
    dataset: {
      squarecoilCompanionRoot: 'rebuild',
      runtimeInstanceId,
      buildId: BUILD_ID,
      documentToken: DOCUMENT_TOKEN
    }
  };
  installChromeHarness({
    timerEnabled: true,
    roots: [root],
    runtimeSnapshot: {
      buildId: BUILD_ID,
      packageVersion: '0.7.1',
      runtimeInstanceId,
      documentToken: DOCUMENT_TOKEN,
      mode: 'ENABLED',
      state: 'DEGRADED',
      reason: 'coordination-not-implemented-b1',
      teardownInProgress: false,
      readiness: {
        oneLifecycleOwner: true,
        validRuntimeIdentity: true,
        oneOwnedRoot: true,
        interactionReady: true,
        persistenceAvailable: true,
        bridgeInitialized: true,
        initialObservationAttempted: true,
        featureRegistryInitialized: true,
        teardownRegistered: true,
        coordinationPositive: false
      },
      ui: { rootPresent: true, interactionReady: true }
    },
    onTabMessage: ({ message }) => {
      const runtime = global.window.__squareCoilCompanionRuntime;
      const health = runtime.getHealth();
      global.window.__squareCoilCompanionRuntime = {
        ...runtime,
        getHealth: () => ({ ...health, state: 'RECOVERING', reason: 'synthetic-settlement-race' })
      };
      return completeB2SettlementAcknowledgment(message);
    }
  });
  const background = loadBackground();

  const result = await background.getHealth(82);
  assert.equal(result.ok, false);
  assert.equal(result.ready, false);
  assert.equal(result.classification, 'DEGRADED_SAME_BUILD');
  assert.equal(result.reason, 'settlement-page-classification-changed');
  assert.equal(result.health.state, 'DEGRADED');
  assert.equal(result.health.readiness.coordinationPositive, false);
});

test('UT-B2-READY-023 READY uses a fresh exact authority confirmation after the final MAIN probe', async () => {
  const runtimeInstanceId = 'runtime-settlement-confirm-001';
  const root = {
    dataset: {
      squarecoilCompanionRoot: 'rebuild',
      runtimeInstanceId,
      buildId: BUILD_ID,
      documentToken: DOCUMENT_TOKEN
    }
  };
  const modes = [];
  const settlementIds = [];
  installChromeHarness({
    timerEnabled: true,
    roots: [root],
    runtimeSnapshot: {
      buildId: BUILD_ID,
      packageVersion: '0.7.1',
      runtimeInstanceId,
      documentToken: DOCUMENT_TOKEN,
      mode: 'ENABLED',
      state: 'DEGRADED',
      reason: 'coordination-not-implemented-b1',
      teardownInProgress: false,
      readiness: {
        oneLifecycleOwner: true,
        validRuntimeIdentity: true,
        oneOwnedRoot: true,
        interactionReady: true,
        persistenceAvailable: true,
        bridgeInitialized: true,
        initialObservationAttempted: true,
        featureRegistryInitialized: true,
        teardownRegistered: true,
        coordinationPositive: false
      },
      ui: { rootPresent: true, interactionReady: true }
    },
    onTabMessage: ({ message }) => {
      modes.push(message.settlementMode);
      settlementIds.push(message.settlementId);
      const acknowledgment = completeB2SettlementAcknowledgment(message);
      if (message.settlementMode === 'CONFIRM') {
        acknowledgment.authority = { ...acknowledgment.authority, healthy: false };
      }
      return acknowledgment;
    }
  });
  const background = loadBackground();

  const result = await background.getHealth(83);
  assert.deepEqual(modes, ['REFRESH', 'CONFIRM']);
  assert.equal(new Set(settlementIds).size, 2);
  assert.equal(result.ok, false);
  assert.equal(result.ready, false);
  assert.equal(result.reason, 'coordination-unavailable');
  assert.equal(result.health.state, 'DEGRADED');
  assert.equal(result.health.readiness.coordinationPositive, false);
});

test('UT-B2-READY-024 explicit in-progress evidence beats and clears the worker settlement watchdog', async () => {
  const runtimeInstanceId = 'runtime-settlement-in-progress-001';
  const root = {
    dataset: {
      squarecoilCompanionRoot: 'rebuild',
      runtimeInstanceId,
      buildId: BUILD_ID,
      documentToken: DOCUMENT_TOKEN
    }
  };
  const modes = [];
  installChromeHarness({
    timerEnabled: true,
    roots: [root],
    runtimeSnapshot: {
      buildId: BUILD_ID,
      packageVersion: '0.7.1',
      runtimeInstanceId,
      documentToken: DOCUMENT_TOKEN,
      mode: 'ENABLED',
      state: 'DEGRADED',
      reason: 'coordination-not-implemented-b1',
      teardownInProgress: false,
      readiness: {
        oneLifecycleOwner: true,
        validRuntimeIdentity: true,
        oneOwnedRoot: true,
        interactionReady: true,
        persistenceAvailable: true,
        bridgeInitialized: true,
        initialObservationAttempted: true,
        featureRegistryInitialized: true,
        teardownRegistered: true,
        coordinationPositive: false
      },
      ui: { rootPresent: true, interactionReady: true }
    },
    onTabMessage: ({ message }) => {
      modes.push(message.settlementMode);
      return { ok: false, reason: 'settlement-refresh-in-progress' };
    }
  });
  const background = loadBackground();
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const watchdog = Object.freeze({ settlementWatchdog: true });
  let watchdogScheduled = 0;
  let watchdogCleared = 0;
  global.setTimeout = (callback, delayMs, ...args) => {
    if (delayMs === background.B2_SETTLEMENT_CONTROL_TIMEOUT_MS) {
      watchdogScheduled += 1;
      return watchdog;
    }
    return originalSetTimeout(callback, delayMs, ...args);
  };
  global.clearTimeout = handle => {
    if (handle === watchdog) {
      watchdogCleared += 1;
      return;
    }
    originalClearTimeout(handle);
  };
  try {
    const result = await background.getHealth(84);
    assert.deepEqual(modes, ['REFRESH']);
    assert.equal(watchdogScheduled, 1);
    assert.equal(watchdogCleared, 1);
    assert.equal(result.ok, false);
    assert.equal(result.ready, false);
    assert.equal(result.reason, 'settlement-refresh-in-progress');
    assert.equal(result.health.state, 'DEGRADED');
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});

test('UT-B2-READY-017 raw same-build READY cannot bypass a mismatched final B2 settlement acknowledgment', async () => {
  const runtimeInstanceId = 'runtime-raw-ready-bypass-12345';
  const root = {
    dataset: {
      squarecoilCompanionRoot: 'rebuild',
      runtimeInstanceId,
      buildId: BUILD_ID,
      documentToken: DOCUMENT_TOKEN
    }
  };
  installChromeHarness({
    timerEnabled: true,
    roots: [root],
    runtimeSnapshot: {
      buildId: BUILD_ID,
      packageVersion: '0.7.1',
      runtimeInstanceId,
      documentToken: DOCUMENT_TOKEN,
      mode: 'ENABLED',
      state: 'READY',
      reason: 'ready',
      teardownInProgress: false,
      readiness: {
        oneLifecycleOwner: true,
        validRuntimeIdentity: true,
        oneOwnedRoot: true,
        interactionReady: true,
        persistenceAvailable: true,
        bridgeInitialized: true,
        initialObservationAttempted: true,
        featureRegistryInitialized: true,
        teardownRegistered: true,
        coordinationPositive: true
      },
      ui: { rootPresent: true, interactionReady: true }
    },
    onTabMessage: ({ message }) => ({
      ok: true,
      type: 'SC_COMPANION_AUTHORITY_B2_SETTLEMENT_ACK',
      protocolVersion: message.protocolVersion,
      settlementId: message.settlementId,
      settlementMode: message.settlementMode,
      workerInstanceId: 'worker-stale-ready-bypass',
      documentToken: message.documentToken,
      runtimeInstanceId: message.runtimeInstanceId,
      authority: {},
      core: {}
    })
  });
  const background = loadBackground();

  const result = await background.getHealth(63);
  assert.equal(result.ok, false);
  assert.equal(result.ready, false);
  assert.equal(result.classification, 'DEGRADED_SAME_BUILD');
  assert.equal(result.health.state, 'DEGRADED');
  assert.equal(result.reason, 'settlement-acknowledgment-invalid');
  assert.equal(result.health.readiness.coordinationPositive, false);
});

test('UT-B2-READY-011 lifecycle command responses never expose raw MAIN-world READY', async () => {
  const commands = [
    { name: 'boot', invoke: (background, request) => background.bootPage(request) },
    { name: 'enable', invoke: (background, request) => background.setPageEnabled(request, true) },
    { name: 'revalidate', invoke: (background, request) => background.revalidatePage(request) }
  ];
  for (const [index, command] of commands.entries()) {
    const runtimeInstanceId = `runtime-command-ready-${command.name}-12345`;
    const root = {
      dataset: {
        squarecoilCompanionRoot: 'rebuild',
        runtimeInstanceId,
        buildId: BUILD_ID,
        documentToken: DOCUMENT_TOKEN
      }
    };
    installChromeHarness({
      timerEnabled: true,
      roots: [root],
      runtimeSnapshot: {
        buildId: BUILD_ID,
        packageVersion: '0.7.1',
        runtimeInstanceId,
        documentToken: DOCUMENT_TOKEN,
        mode: 'ENABLED',
        state: 'READY',
        reason: 'ready',
        teardownInProgress: false,
        readiness: {
          oneLifecycleOwner: true,
          validRuntimeIdentity: true,
          oneOwnedRoot: true,
          interactionReady: true,
          persistenceAvailable: true,
          bridgeInitialized: true,
          initialObservationAttempted: true,
          featureRegistryInitialized: true,
          teardownRegistered: true,
          coordinationPositive: true
        },
        ui: { rootPresent: true, interactionReady: true }
      }
    });
    const background = loadBackground();
    const result = await command.invoke(background, {
      tabId: 70 + index,
      expectedDocumentId: DOCUMENT_ID,
      documentToken: DOCUMENT_TOKEN,
      source: 'content'
    });
    assert.equal(result.ok, true, command.name);
    assert.equal(result.ready, false, command.name);
    assert.equal(result.classification, 'DEGRADED_SAME_BUILD', command.name);
    assert.equal(result.health.state, 'DEGRADED', command.name);
    assert.equal(result.reason, 'b2-settlement-required', command.name);
  }
});

test('UT-B2-READY-013 a missing settlement acknowledgment times out to non-READY', async () => {
  const runtimeInstanceId = 'runtime-settlement-timeout-12345';
  const root = {
    dataset: {
      squarecoilCompanionRoot: 'rebuild',
      runtimeInstanceId,
      buildId: BUILD_ID,
      documentToken: DOCUMENT_TOKEN
    }
  };
  installChromeHarness({
    timerEnabled: true,
    roots: [root],
    runtimeSnapshot: {
      buildId: BUILD_ID,
      packageVersion: '0.7.1',
      runtimeInstanceId,
      documentToken: DOCUMENT_TOKEN,
      mode: 'ENABLED',
      state: 'READY',
      reason: 'ready',
      teardownInProgress: false,
      readiness: {
        oneLifecycleOwner: true,
        validRuntimeIdentity: true,
        oneOwnedRoot: true,
        interactionReady: true,
        persistenceAvailable: true,
        bridgeInitialized: true,
        initialObservationAttempted: true,
        featureRegistryInitialized: true,
        teardownRegistered: true,
        coordinationPositive: true
      },
      ui: { rootPresent: true, interactionReady: true }
    },
    onTabMessage: () => new Promise(() => {})
  });
  const background = loadBackground();
  assert.equal(background.B2_SETTLEMENT_CONTROL_TIMEOUT_MS, 20_000);
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const timeoutMarker = Object.freeze({ settlementTimeout: true });
  global.setTimeout = (callback, delayMs, ...args) => {
    if (delayMs === background.B2_SETTLEMENT_CONTROL_TIMEOUT_MS) {
      queueMicrotask(() => callback(...args));
      return timeoutMarker;
    }
    return originalSetTimeout(callback, delayMs, ...args);
  };
  global.clearTimeout = id => {
    if (id !== timeoutMarker) originalClearTimeout(id);
  };
  try {
    const result = await background.getHealth(79);
    assert.equal(result.ok, false);
    assert.equal(result.ready, false);
    assert.equal(result.classification, 'DEGRADED_SAME_BUILD');
    assert.equal(result.reason, 'settlement-health-timeout');
    assert.equal(result.health.state, 'DEGRADED');
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});

test('a stranded valid injection claim requires a reload boundary instead of reinjection', async () => {
  const harness = installChromeHarness({ timerEnabled: true });
  global.window.__squareCoilCompanionInjectionClaim = {
    claimId: 'claim-stranded-12345',
    buildId: BUILD_ID,
    packageVersion: '0.7.1',
    candidateFingerprint: CANDIDATE_FINGERPRINT,
    runtimeInstanceId: 'runtime-stranded-12345',
    documentToken: DOCUMENT_TOKEN
  };
  const background = loadBackground();

  const result = await background.bootPage(47);
  assert.equal(result.classification, 'BOOTING_SAME_BUILD');
  assert.equal(result.reason, 'injection-claim-incomplete');
  assert.equal(result.reloadRequired, true);
  assert.equal(harness.fileInjections(), 0);
});

test('document navigation fencing rejects stale requests before injection', async () => {
  const harness = installChromeHarness({ timerEnabled: true });
  const background = loadBackground();

  const result = await background.bootPage({
    tabId: 53,
    expectedDocumentId: 'previous-document-id',
    documentToken: DOCUMENT_TOKEN,
    source: 'content'
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'document-changed');
  assert.equal(result.reloadRequired, true);
  assert.equal(harness.fileInjections(), 0);
});

test('content setting notifications do not write global settings back out of order', async () => {
  installChromeHarness({ timerEnabled: false });
  let settingWrites = 0;
  global.chrome.storage.local.set = async values => {
    if (Object.hasOwn(values, 'timerEnabled')) settingWrites += 1;
  };
  const background = loadBackground();

  const result = await background.setPageEnabled({
    tabId: 59,
    expectedDocumentId: DOCUMENT_ID,
    documentToken: DOCUMENT_TOKEN,
    source: 'content'
  }, false);
  assert.equal(result.enabled, false);
  assert.equal(settingWrites, 0);
});

test('a stale disable message cannot tear down a runtime after the authoritative setting is enabled', async () => {
  const runtimeInstanceId = 'runtime-authoritative-enabled';
  const root = {
    dataset: {
      squarecoilCompanionRoot: 'rebuild',
      runtimeInstanceId,
      buildId: BUILD_ID,
      documentToken: DOCUMENT_TOKEN
    }
  };
  const harness = installChromeHarness({
    timerEnabled: true,
    roots: [root],
    runtimeSnapshot: {
      buildId: BUILD_ID,
      packageVersion: '0.7.1',
      runtimeInstanceId,
      documentToken: DOCUMENT_TOKEN,
      mode: 'ENABLED',
      state: 'READY',
      reason: 'ready',
      teardownInProgress: false,
      readiness: {
        oneLifecycleOwner: true,
        validRuntimeIdentity: true,
        oneOwnedRoot: true,
        interactionReady: true,
        persistenceAvailable: true,
        bridgeInitialized: true,
        initialObservationAttempted: true,
        featureRegistryInitialized: true,
        teardownRegistered: true,
        coordinationPositive: true
      },
      ui: { rootPresent: true, interactionReady: true }
    }
  });
  const diagnosticItems = new Map();
  const ordinaryGet = global.chrome.storage.local.get;
  global.chrome.storage.local.get = async key => key === 'scCompanionDiagnosticLogV1'
    ? { [key]: diagnosticItems.get(key) }
    : ordinaryGet(key);
  global.chrome.storage.local.set = async values => {
    for (const [key, value] of Object.entries(values)) diagnosticItems.set(key, value);
  };
  let messageListener;
  global.chrome.runtime.onMessage.addListener = listener => { messageListener = listener; };
  const background = loadBackground();

  const result = await background.setPageEnabled({
    tabId: 61,
    expectedDocumentId: DOCUMENT_ID,
    documentToken: DOCUMENT_TOKEN,
    source: 'content'
  }, false);
  assert.equal(result.staleRequestIgnored, true);
  assert.equal(result.enabled, true);
  assert.equal(result.ready, false);
  assert.equal(result.reason, 'b2-settlement-required');
  assert.equal(harness.enableCalls(), 0);
  assert.equal(global.window.__squareCoilCompanionRuntime.runtimeInstanceId, runtimeInstanceId);

  const staleResponse = await new Promise(resolve => messageListener({
    type: background.ENABLE_MESSAGE, enabled: false, documentToken: DOCUMENT_TOKEN,
    buildId: BUILD_ID, packageVersion: '0.7.1', candidateFingerprint: CANDIDATE_FINGERPRINT
  }, {
    tab: { id: 61 }, frameId: 0, documentId: DOCUMENT_ID,
    url: 'https://ussignandmill.squarecoil.net/dashboard.php?show=2'
  }, resolve));
  assert.equal(staleResponse.staleRequestIgnored, true);
  const history = await new Promise(resolve => messageListener({
    type: background.GET_DIAGNOSTIC_LOG_MESSAGE
  }, {
    id: 'squarecoil-test-extension-id',
    url: 'chrome-extension://squarecoil-test-extension-id/popup/popup.html'
  }, resolve));
  assert.equal(history.ok, true);
  assert.equal(history.entries.some(entry => entry.code === 'COMPANION_DISABLED' || entry.code === 'COMPANION_ENABLED'), false);
});

test('content messages reject unsupported frames before any page operation', () => {
  installChromeHarness({ timerEnabled: true });
  const background = loadBackground();
  const resolved = background.requestFromMessage(
    { type: 'SC_COMPANION_BOOT', documentToken: DOCUMENT_TOKEN },
    {
      tab: { id: 41, url: 'https://ussignandmill.squarecoil.net/jobs/1' },
      url: 'https://ussignandmill.squarecoil.net/jobs/1',
      frameId: 2,
      documentId: 'iframe-document'
    }
  );
  assert.equal(resolved.error, 'unsupported-frame');
});

test('an exact extension-origin popup page remains extension traffic when opened in a tab', () => {
  installChromeHarness({ timerEnabled: true });
  const background = loadBackground();
  const resolved = background.requestFromMessage(
    { type: 'SC_COMPANION_GET_HEALTH', tabId: 71 },
    {
      id: 'squarecoil-test-extension-id',
      tab: { id: 72, url: 'chrome-extension://squarecoil-test-extension-id/popup/popup.html' },
      url: 'chrome-extension://squarecoil-test-extension-id/popup/popup.html',
      frameId: 0
    }
  );
  assert.equal(resolved.error, undefined);
  assert.deepEqual(resolved.request, {
    tabId: 71,
    expectedDocumentId: null,
    documentToken: null,
    source: 'extension'
  });
});

test('content messages require the exact B1 package candidate identity', () => {
  installChromeHarness({ timerEnabled: true });
  const background = loadBackground();
  const sender = {
    tab: { id: 67, url: 'https://ussignandmill.squarecoil.net/jobs/1' },
    url: 'https://ussignandmill.squarecoil.net/jobs/1',
    frameId: 0,
    documentId: DOCUMENT_ID
  };

  const accepted = background.requestFromMessage({
    type: 'SC_COMPANION_BOOT',
    documentToken: DOCUMENT_TOKEN,
    buildId: BUILD_ID,
    packageVersion: '0.7.1',
    candidateFingerprint: CANDIDATE_FINGERPRINT
  }, sender);
  assert.equal(accepted.error, undefined);
  assert.equal(accepted.request.source, 'content');

  const rejected = background.requestFromMessage({
    type: 'SC_COMPANION_BOOT',
    documentToken: DOCUMENT_TOKEN,
    buildId: BUILD_ID,
    packageVersion: '0.7.1',
    candidateFingerprint: 'b'.repeat(64)
  }, sender);
  assert.equal(rejected.error, 'content-controller-version-mismatch');
  assert.equal(rejected.classification, 'VERSION_MISMATCH');
  assert.equal(rejected.reloadRequired, true);
});

test('terminal recovery exhaustion requires a reload when no safe general retry exists', async () => {
  const runtimeInstanceId = 'runtime-recovery-exhausted';
  const roots = [{
    dataset: {
      squarecoilCompanionRoot: 'rebuild',
      runtimeInstanceId,
      buildId: BUILD_ID,
      packageVersion: '0.7.1',
      candidateFingerprint: CANDIDATE_FINGERPRINT,
      documentToken: DOCUMENT_TOKEN
    }
  }];
  const harness = installChromeHarness({
    timerEnabled: true,
    roots,
    runtimeSnapshot: {
      buildId: BUILD_ID,
      packageVersion: '0.7.1',
      candidateFingerprint: CANDIDATE_FINGERPRINT,
      runtimeInstanceId,
      documentToken: DOCUMENT_TOKEN,
      mode: 'ENABLED',
      state: 'FAILED',
      reason: 'recovery-exhausted',
      teardownInProgress: false,
      cleanupRequired: false,
      outstandingResources: [],
      readiness: null,
      ui: { rootPresent: true, interactionReady: false }
    },
    onSetEnabled: async ({ enabled, currentSnapshot, roots: liveRoots }) => {
      assert.equal(enabled, false);
      liveRoots.splice(0);
      delete global.window.__squareCoilCompanionRuntime;
      return {
        ...currentSnapshot,
        mode: 'DISABLED',
        state: 'UNINITIALIZED',
        reason: 'teardown-complete',
        outstandingResources: [],
        ui: { rootPresent: false, interactionReady: false }
      };
    }
  });
  const background = loadBackground();

  const result = await background.bootPage(71);

  assert.equal(result.ok, false);
  assert.equal(result.classification, 'FAILED_SAME_BUILD');
  assert.equal(result.reason, 'runtime-failed');
  assert.equal(result.reloadRequired, true);
  assert.equal(harness.enableCalls(), 0);
  assert.equal(harness.recoverCalls(), 0);
  assert.equal(harness.fileInjections(), 0);

  await global.chrome.storage.local.set({ timerEnabled: false });
  const disabled = await background.setPageEnabled(71, false);
  assert.equal(disabled.ok, true);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.health.state, 'UNINITIALIZED');
  assert.equal(disabled.health.reason, 'teardown-complete');
  assert.equal(disabled.reloadRequired, false);
  assert.equal(harness.enableCalls(), 1);
  assert.equal(roots.length, 0);
  assert.equal(global.window.__squareCoilCompanionRuntime, undefined);
});

test('disable cannot report success when runtime ownership remains after an uninitialized result', async () => {
  const runtimeInstanceId = 'runtime-incomplete-disable';
  const roots = [{
    dataset: {
      squarecoilCompanionRoot: 'rebuild',
      runtimeInstanceId,
      buildId: BUILD_ID,
      packageVersion: '0.7.1',
      candidateFingerprint: CANDIDATE_FINGERPRINT,
      documentToken: DOCUMENT_TOKEN
    }
  }];
  const harness = installChromeHarness({
    timerEnabled: false,
    roots,
    runtimeSnapshot: {
      buildId: BUILD_ID,
      packageVersion: '0.7.1',
      candidateFingerprint: CANDIDATE_FINGERPRINT,
      runtimeInstanceId,
      documentToken: DOCUMENT_TOKEN,
      mode: 'ENABLED',
      state: 'DEGRADED',
      reason: 'ui-missing',
      teardownInProgress: false,
      readiness: null,
      ui: { rootPresent: true, interactionReady: false }
    },
    onSetEnabled: async ({ enabled, currentSnapshot }) => {
      assert.equal(enabled, false);
      return {
        ...currentSnapshot,
        mode: 'DISABLED',
        state: 'UNINITIALIZED',
        reason: 'teardown-complete',
        ui: { rootPresent: false, interactionReady: false }
      };
    }
  });
  const background = loadBackground();

  const result = await background.setPageEnabled(73, false);

  assert.equal(harness.enableCalls(), 1);
  assert.equal(result.ok, false);
  assert.equal(result.reloadRequired, true);
  assert.equal(result.reason, 'teardown-complete');
  assert.notEqual(result.classification, 'NONE');
  assert.equal(roots.length, 1);
  assert.notEqual(global.window.__squareCoilCompanionRuntime, undefined);
});
