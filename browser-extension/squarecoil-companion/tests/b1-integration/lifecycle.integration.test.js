'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ROOT_ID,
  SUPPORTED_URL,
  createA3Harness
} = require('./harness');

const MESSAGES = Object.freeze({
  BOOT: 'SC_COMPANION_BOOT',
  HEALTH: 'SC_COMPANION_GET_HEALTH',
  ENABLE: 'SC_COMPANION_SET_ENABLED',
  REVALIDATE: 'SC_COMPANION_REVALIDATE',
  RETRY_TEARDOWN: 'SC_COMPANION_RETRY_TEARDOWN'
});

function addRoot(page, values = {}) {
  const root = page.document.createElement('section');
  root.id = ROOT_ID;
  for (const [key, value] of Object.entries(values)) root.dataset[key] = value;
  page.document.body.appendChild(root);
  return root;
}

async function bootPreparedPage(harness, page, token = `document-token-${page.tabId}-000000`) {
  page.setDocumentToken(token);
  const result = await harness.sendFromPage(page, { type: MESSAGES.BOOT });
  const health = await harness.waitForStableRuntime(page);
  return { result, health };
}

function assertExpectedB1Shell(health) {
  assert.equal(health.state, 'DEGRADED');
  assert.equal(health.reason, 'coordination-not-implemented-b1');
  assert.equal(health.mode, 'ENABLED');
  assert.equal(health.ui.rootPresent, true);
  assert.equal(health.ui.interactionReady, true);
  assert.equal(health.readiness.coordinationPositive, false);
}

test('A3 B1 regression guard executes the three real B6 candidate dist bundles', () => {
  const harness = createA3Harness();
  assert.equal(harness.buildInfo.stage, 'B6');
  assert.match(harness.buildInfo.buildId, /b6-release-candidate/i);
  assert.deepEqual(Object.keys(harness.bundleEvidence).sort(), [
    'background.js',
    'companion-app.js',
    'content-controller.js'
  ]);
  for (const evidence of Object.values(harness.bundleEvidence)) {
    assert.ok(evidence.bytes > 100);
    assert.match(evidence.sha256, /^[a-f0-9]{64}$/);
  }
});

test('B1-LC-001/002/015: fresh and concurrent repeated boot produce one generation and one injection', async () => {
  const harness = createA3Harness();
  const page = harness.createPage();
  page.setDocumentToken('document-token-concurrent-0001');

  const results = await Promise.all([
    harness.sendFromPage(page, { type: MESSAGES.BOOT }),
    harness.sendFromPage(page, { type: MESSAGES.BOOT }),
    harness.sendFromPage(page, { type: MESSAGES.BOOT })
  ]);
  const health = await harness.waitForStableRuntime(page);
  const runtimeInstanceId = health.runtimeInstanceId;

  assert.equal(results.every(result => result?.ok === true), true);
  assertExpectedB1Shell(health);
  assert.equal(page.metrics.companionInjections, 1);
  assert.equal(page.roots.length, 1);

  const repeated = await harness.sendFromPage(page, { type: MESSAGES.BOOT });
  assert.equal(repeated.ok, true);
  assert.equal(page.health.runtimeInstanceId, runtimeInstanceId);
  assert.equal(page.metrics.companionInjections, 1);
  assert.equal(page.roots.length, 1);
});

test('B1-LC-001/004/012: a renamed preboot orphan is removed before one fresh runtime is injected', async () => {
  const harness = createA3Harness();
  const page = harness.createPage();
  page.setDocumentToken('document-token-hidden-orphan-01');
  const orphan = page.document.createElement('section');
  orphan.id = 'renamed-orphan';
  orphan.dataset.squarecoilCompanionRoot = 'rebuild';
  orphan.dataset.runtimeInstanceId = 'runtime-hidden-orphan-0001';
  orphan.dataset.buildId = harness.buildInfo.buildId;
  orphan.dataset.packageVersion = harness.buildInfo.packageVersion;
  orphan.dataset.candidateFingerprint = harness.buildInfo.candidateFingerprint;
  orphan.dataset.documentToken = page.documentToken;
  page.document.body.appendChild(orphan);

  const result = await harness.sendFromPage(page, { type: MESSAGES.BOOT });
  const health = await harness.waitForStableRuntime(page);
  const rebuildNodes = page.document.body.children.filter(node => node.dataset.squarecoilCompanionRoot === 'rebuild');

  assert.equal(result.source, 'orphan-root-recovered');
  assert.equal(orphan.isConnected, false);
  assert.equal(rebuildNodes.length, 1);
  assert.equal(rebuildNodes[0].id, ROOT_ID);
  assert.equal(page.metrics.companionInjections, 1);
  assertExpectedB1Shell(health);
});

test('B1-LC-005/008: BFCache and service-worker restart reuse the live page runtime', async () => {
  const harness = createA3Harness();
  const page = harness.createPage();
  await harness.startContentController(page);
  const initial = await harness.waitForStableRuntime(page);
  const runtimeInstanceId = initial.runtimeInstanceId;

  assertExpectedB1Shell(initial);
  assert.equal(page.metrics.contentExecutions, 1);
  assert.equal(page.metrics.companionInjections, 1);
  assert.equal(page.window.listenerCount('pageshow'), 2);
  await page.runIntervals();
  await harness.waitFor(() => /sc-proto-shell/.test(page.root.innerHTML), 'workspace shell startup');
  assert.match(page.root.innerHTML, /sc-proto-shell/);

  page.dispatchPageHide(true);
  page.dispatchPageShow(true);
  page.dispatchPageShow(true);
  await harness.tick(8);
  assert.equal(page.health.runtimeInstanceId, runtimeInstanceId);
  assert.equal(page.metrics.companionInjections, 1);
  assert.equal(page.roots.length, 1);
  assert.equal(page.window.listenerCount('pageshow'), 2);
  assert.match(page.root.innerHTML, /sc-proto-shell/);
  const settingsButton = page.document.createElement('button');
  settingsButton.dataset.action = 'view';
  settingsButton.dataset.view = 'settings';
  settingsButton.closest = selector => selector === '[data-action]' ? settingsButton : null;
  page.root.appendChild(settingsButton);
  page.root.dispatchEvent({ type: 'click', target: settingsButton, isTrusted: true });
  assert.match(page.root.innerHTML, /Companion appearance/);

  harness.restartWorker();
  const result = await harness.sendFromPage(page, { type: MESSAGES.BOOT });
  await harness.waitForStableRuntime(page);
  assert.equal(result.ok, true);
  assert.equal(harness.workerStarts, 2);
  assert.equal(page.health.runtimeInstanceId, runtimeInstanceId);
  assert.equal(page.metrics.companionInjections, 1);
  assert.equal(page.roots.length, 1);
});

test('B1-LC-005/009/014: current transport failure recovers once after the worker restarts', async () => {
  const harness = createA3Harness();
  const page = harness.createPage();
  harness.runtimeOnMessage.clear();

  await harness.startContentController(page);
  assert.equal(page.runtime, null);
  assert.equal(page.roots.length, 0);
  assert.equal(page.document.documentElement.dataset.squarecoilCompanionController, 'attention');
  assert.equal(page.document.documentElement.dataset.squarecoilCompanionProbe, 'TRANSPORT_ERROR');

  harness.restartWorker();
  await new Promise(resolve => setTimeout(resolve, 325));
  const health = await harness.waitForStableRuntime(page);

  assertExpectedB1Shell(health);
  assert.equal(page.metrics.companionInjections, 1);
  assert.equal(page.roots.length, 1);
  assert.equal(page.document.documentElement.dataset.squarecoilCompanionController, 'booted');
  assert.equal(page.document.documentElement.dataset.squarecoilCompanionProbe, 'BOOTING_SAME_BUILD');
});

test('B1-LC-005/006: BFCache restore reconciles a disabled mode change missed while frozen', async () => {
  const harness = createA3Harness();
  const page = harness.createPage();
  await harness.startContentController(page);
  const initial = await harness.waitForStableRuntime(page);
  const retiredRuntime = page.runtime;

  assertExpectedB1Shell(initial);
  harness.storage.setSilently({ timerEnabled: false });

  page.dispatchPageShow(true);
  await harness.tick(12);

  assert.equal(harness.storage.snapshot().timerEnabled, false);
  assert.equal(retiredRuntime.getHealth().state, 'UNINITIALIZED');
  assert.equal(retiredRuntime.getHealth().mode, 'DISABLED');
  assert.equal(page.runtime, null);
  assert.equal(page.roots.length, 0);
  assert.equal(page.document.documentElement.dataset.squarecoilCompanionEnabled, 'false');
  assert.equal(page.document.documentElement.dataset.squarecoilCompanionController, 'disabled');
});

test('B1-LC-005/006/008: BFCache restore reconciles an enable missed while frozen', async () => {
  const harness = createA3Harness({ storage: { timerEnabled: false } });
  const page = harness.createPage();
  await harness.startContentController(page);

  assert.equal(page.runtime, null);
  assert.equal(page.roots.length, 0);
  assert.equal(page.document.documentElement.dataset.squarecoilCompanionEnabled, 'false');

  harness.storage.setSilently({ timerEnabled: true });
  page.dispatchPageShow(true);
  const health = await harness.waitForStableRuntime(page);

  assertExpectedB1Shell(health);
  assert.equal(page.metrics.companionInjections, 1);
  assert.equal(page.roots.length, 1);
  assert.equal(page.document.documentElement.dataset.squarecoilCompanionEnabled, 'true');
  assert.notEqual(page.document.documentElement.dataset.squarecoilCompanionReloadRequired, 'true');
});

test('B1-LC-006: clean disable retires the old runtime and re-enable creates exactly one fresh generation', async () => {
  const harness = createA3Harness();
  const page = harness.createPage();
  const { health: initial } = await bootPreparedPage(harness, page, 'document-token-clean-toggle-01');
  const oldRuntime = page.runtime;

  await harness.storage.set({ timerEnabled: false });
  const disabled = await harness.sendFromPage(page, { type: MESSAGES.ENABLE, enabled: false });
  await harness.tick();
  assert.equal(disabled.ok, true);
  assert.equal(disabled.health.state, 'UNINITIALIZED');
  assert.equal(disabled.health.mode, 'DISABLED');
  assert.equal(page.runtime, null);
  assert.equal(page.roots.length, 0);
  assert.equal(oldRuntime.getHealth().state, 'UNINITIALIZED');

  await harness.storage.set({ timerEnabled: true });
  const enabled = await harness.sendFromPage(page, { type: MESSAGES.ENABLE, enabled: true });
  const fresh = await harness.waitForStableRuntime(page);
  assert.equal(enabled.ok, true);
  assertExpectedB1Shell(fresh);
  assert.notEqual(fresh.runtimeInstanceId, initial.runtimeInstanceId);
  assert.equal(page.metrics.companionInjections, 2);
  assert.equal(page.roots.length, 1);
});

test('B1-LC-007 / IT-B1-LC-23: failed cleanup stays locked until teardown-only success', async () => {
  const harness = createA3Harness();
  const page = harness.createPage();
  const { health: initial } = await bootPreparedPage(harness, page, 'document-token-cleanup-lock-01');
  const oldRuntime = page.runtime;
  page.failNextRootRemovals(2);

  await harness.storage.set({ timerEnabled: false });
  const disableFailed = await harness.sendFromPage(page, { type: MESSAGES.ENABLE, enabled: false });
  assert.equal(disableFailed.ok, false);
  assert.equal(disableFailed.health.state, 'FAILED');
  assert.equal(disableFailed.health.mode, 'DISABLED');
  assert.equal(disableFailed.health.reason, 'teardown-incomplete');
  assert.equal(disableFailed.health.cleanupRequired, true);
  assert.deepEqual(disableFailed.health.outstandingResources, ['ownership', 'ui']);
  assert.equal(page.runtime, oldRuntime);
  assert.equal(page.metrics.companionInjections, 1);
  assert.equal(page.metrics.rootRemovalAttempts, 1);

  const disabledBoot = await harness.sendFromPage(page, { type: MESSAGES.BOOT });
  assert.equal(disabledBoot.classification, 'FAILED_SAME_BUILD');
  assert.equal(disabledBoot.health.reason, 'teardown-incomplete');
  assert.equal(page.runtime, oldRuntime);
  assert.equal(page.metrics.rootRemovalAttempts, 1);
  assert.equal(page.metrics.companionInjections, 1);

  await harness.storage.set({ timerEnabled: true });
  const blockedEnable = await harness.sendFromPage(page, { type: MESSAGES.ENABLE, enabled: true });
  assert.equal(blockedEnable.classification, 'FAILED_SAME_BUILD');
  assert.equal(blockedEnable.health.mode, 'DISABLED');
  assert.equal(blockedEnable.health.reason, 'teardown-incomplete');
  assert.equal(page.runtime, oldRuntime);
  assert.equal(page.metrics.rootRemovalAttempts, 1);
  assert.equal(page.metrics.companionInjections, 1);

  const retryFailed = await harness.sendFromPage(page, { type: MESSAGES.RETRY_TEARDOWN });
  assert.equal(retryFailed.cleanupAttempted, true);
  assert.equal(retryFailed.cleanupComplete, false);
  assert.equal(retryFailed.health.state, 'FAILED');
  assert.deepEqual(retryFailed.health.outstandingResources, ['ownership', 'ui']);
  assert.equal(page.metrics.rootRemovalAttempts, 2);
  assert.equal(page.runtime, oldRuntime);

  const retrySucceeded = await harness.sendFromPage(page, { type: MESSAGES.RETRY_TEARDOWN });
  assert.equal(retrySucceeded.ok, true);
  assert.equal(retrySucceeded.cleanupAttempted, true);
  assert.equal(retrySucceeded.cleanupComplete, true);
  assert.equal(retrySucceeded.health.state, 'UNINITIALIZED');
  assert.equal(retrySucceeded.health.mode, 'DISABLED');
  assert.deepEqual(retrySucceeded.health.outstandingResources, []);
  assert.equal(page.metrics.rootRemovalAttempts, 3);
  assert.equal(page.runtime, null);
  assert.equal(page.roots.length, 0);
  assert.equal(page.metrics.companionInjections, 1);

  const restarted = await harness.sendFromPage(page, { type: MESSAGES.ENABLE, enabled: true });
  const fresh = await harness.waitForStableRuntime(page);
  assert.equal(restarted.ok, true);
  assertExpectedB1Shell(fresh);
  assert.notEqual(fresh.runtimeInstanceId, initial.runtimeInstanceId);
  assert.equal(page.metrics.companionInjections, 2);
  assert.equal(page.roots.length, 1);
});

test('B1-LC-009: a stale content response cannot overwrite the newer disabled state', async () => {
  const harness = createA3Harness();
  const page = harness.createPage();
  harness.holdResponses(MESSAGES.BOOT);

  await harness.startContentController(page);
  await harness.waitForHeldResponse(MESSAGES.BOOT);
  await harness.waitForStableRuntime(page);
  assert.equal(page.metrics.companionInjections, 1);

  await harness.storage.set({ timerEnabled: false });
  await harness.waitFor(() => page.runtime === null, 'newer disable completion');
  await harness.waitFor(
    () => page.document.documentElement.dataset.squarecoilCompanionController === 'disabled',
    'disabled controller publication'
  );

  harness.releaseResponses(MESSAGES.BOOT);
  await harness.tick(8);
  assert.equal(page.document.documentElement.dataset.squarecoilCompanionController, 'disabled');
  assert.equal(page.runtime, null);
  assert.equal(page.roots.length, 0);
});

test('B1-LC-009: a stale transport error cannot overwrite a newer disabled state', async () => {
  const harness = createA3Harness();
  const page = harness.createPage();
  harness.holdResponses(MESSAGES.BOOT);

  await harness.startContentController(page);
  await harness.waitForHeldResponse(MESSAGES.BOOT);
  await harness.waitForStableRuntime(page);
  await harness.storage.set({ timerEnabled: false });
  await harness.waitFor(
    () => page.document.documentElement.dataset.squarecoilCompanionController === 'disabled',
    'newer disabled publication'
  );

  harness.rejectResponses(MESSAGES.BOOT, 'old-boot-channel-closed');
  await harness.tick(8);
  assert.equal(page.document.documentElement.dataset.squarecoilCompanionController, 'disabled');
  assert.notEqual(page.document.documentElement.dataset.squarecoilCompanionControllerReason, 'old-boot-channel-closed');
  assert.equal(page.runtime, null);
  assert.equal(page.roots.length, 0);
});

test('B1-LC-009: a stale initial settings read cannot overwrite a newer enabled marker', async () => {
  const harness = createA3Harness({ storage: { timerEnabled: false } });
  const page = harness.createPage();
  const gate = harness.storage.holdNextGet();

  await harness.startContentController(page);
  await gate.started;
  await harness.storage.set({ timerEnabled: true });
  await harness.waitForStableRuntime(page);
  gate.release();
  await harness.tick(8);

  assert.equal(harness.storage.snapshot().timerEnabled, true);
  assert.equal(page.document.documentElement.dataset.squarecoilCompanionEnabled, 'true');
  assert.equal(page.document.documentElement.dataset.squarecoilCompanionController, 'booted');
  assert.equal(page.runtime !== null, true);
  assert.equal(page.roots.length, 1);
});

test('B1-LC-009: stale setting messages reconcile to storage without mutating the newer runtime state', async () => {
  const harness = createA3Harness();
  const page = harness.createPage();
  const { health: initial } = await bootPreparedPage(harness, page, 'document-token-stale-setting-001');
  const oldRuntime = page.runtime;

  const staleDisable = await harness.sendFromPage(page, { type: MESSAGES.ENABLE, enabled: false });
  assert.equal(staleDisable.staleRequestIgnored, true);
  assert.equal(staleDisable.enabled, true);
  assert.equal(page.runtime, oldRuntime);
  assert.equal(page.health.runtimeInstanceId, initial.runtimeInstanceId);
  assert.equal(page.roots.length, 1);

  await harness.storage.set({ timerEnabled: false });
  const disabled = await harness.sendFromPage(page, { type: MESSAGES.ENABLE, enabled: false });
  assert.equal(disabled.health.state, 'UNINITIALIZED');
  assert.equal(page.runtime, null);

  const staleEnable = await harness.sendFromPage(page, { type: MESSAGES.ENABLE, enabled: true });
  assert.equal(staleEnable.staleRequestIgnored, true);
  assert.equal(staleEnable.enabled, false);
  assert.equal(page.runtime, null);
  assert.equal(page.metrics.companionInjections, 1);
});

test('B1-LC-009: a newer enable during the disable probe prevents teardown', async () => {
  const harness = createA3Harness();
  const page = harness.createPage();
  const { health: initial } = await bootPreparedPage(harness, page, 'document-token-disable-race-001');
  const oldRuntime = page.runtime;
  await harness.storage.set({ timerEnabled: false });
  const gate = page.holdNextFunctionExecution();

  const disableTask = harness.sendFromPage(page, { type: MESSAGES.ENABLE, enabled: false });
  await gate.started;
  await harness.storage.set({ timerEnabled: true });
  gate.release();
  const result = await disableTask;

  assert.equal(result.staleRequestIgnored, true);
  assert.equal(result.enabled, true);
  assert.equal(page.runtime, oldRuntime);
  assert.equal(page.health.runtimeInstanceId, initial.runtimeInstanceId);
  assert.equal(page.roots.length, 1);
  assert.equal(page.metrics.companionInjections, 1);
});

test('B1-LC-009: a newer enable at the teardown boundary creates one fresh generation', async () => {
  const harness = createA3Harness();
  const page = harness.createPage();
  const { health: initial } = await bootPreparedPage(harness, page, 'document-token-teardown-race-01');
  await harness.storage.set({ timerEnabled: false });
  const gate = page.holdFunctionExecutionWhen((_func, args) => args[0] === 'setEnabled' && args[1]?.[0] === false);

  const disableTask = harness.sendFromPage(page, { type: MESSAGES.ENABLE, enabled: false });
  await gate.started;
  await harness.storage.set({ timerEnabled: true });
  gate.release();
  const result = await disableTask;
  const fresh = await harness.waitForStableRuntime(page);

  assert.equal(result.staleRequestIgnored, true);
  assert.equal(result.enabled, true);
  assert.equal(result.source, 'post-teardown-enabled-reconcile');
  assert.notEqual(fresh.runtimeInstanceId, initial.runtimeInstanceId);
  assert.equal(page.roots.length, 1);
  assert.equal(page.metrics.companionInjections, 2);
});

test('B1-LC-009: a newer disable at the injection boundary leaves no runtime allocation', async () => {
  const harness = createA3Harness();
  const page = harness.createPage();
  page.setDocumentToken('document-token-injection-race-01');
  page.document.documentElement.dataset.squarecoilCompanionEnabled = 'true';
  const gate = page.holdNextCompanionExecution();

  const bootTask = harness.sendFromPage(page, { type: MESSAGES.BOOT });
  await gate.started;
  await harness.storage.set({ timerEnabled: false });
  page.document.documentElement.dataset.squarecoilCompanionEnabled = 'false';
  gate.release();
  const result = await bootTask;

  assert.equal(result.enabled, false);
  assert.equal(result.health.state, 'UNINITIALIZED');
  assert.equal(result.health.reason, 'user-disabled');
  assert.equal(page.runtime, null);
  assert.equal(page.roots.length, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(page.window, '__squareCoilCompanionInjectionClaim'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(page.window, '__squareCoilCompanionBootstrap'), false);
});

test('B1-LC-012: a bundle that cannot publish its runtime is never reported as healthy booting', async () => {
  const harness = createA3Harness();
  const page = harness.createPage();
  page.setDocumentToken('document-token-bootstrap-loss-001');
  const gate = page.holdNextCompanionExecution();

  const bootTask = harness.sendFromPage(page, { type: MESSAGES.BOOT });
  await gate.started;
  delete page.window.__squareCoilCompanionBootstrap;
  gate.release();
  const result = await bootTask;

  assert.equal(result.ok, false);
  assert.equal(result.classification, 'OWNERSHIP_CONFLICT');
  assert.equal(result.reason, 'injection-did-not-publish-runtime');
  assert.equal(result.reloadRequired, true);
  assert.equal(result.injectionClaimReleased, true);
  assert.equal(page.runtime, null);
  assert.equal(page.roots.length, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(page.window, '__squareCoilCompanionInjectionClaim'), false);
});

test('B1-LC-013: disabled, unsupported-origin, and iframe documents do not allocate', async t => {
  await t.test('disabled supported page is observation-only', async () => {
    const harness = createA3Harness({ storage: { timerEnabled: false } });
    const page = harness.createPage();
    await harness.startContentController(page);
    await harness.waitFor(
      () => page.document.documentElement.dataset.squarecoilCompanionController === 'disabled',
      'disabled content result'
    );
    assert.ok(page.documentToken);
    assert.equal(page.runtime, null);
    assert.equal(page.roots.length, 0);
    assert.equal(page.metrics.companionInjections, 0);

    page.dispatchPageShow(true);
    await harness.tick();
    assert.equal(page.metrics.companionInjections, 0);
  });

  await t.test('unsupported origin is ignored by the content controller', async () => {
    const harness = createA3Harness();
    const page = harness.createPage({ url: 'https://example.invalid/jobs/123' });
    await harness.startContentController(page);
    await harness.tick();
    assert.equal(page.documentToken, null);
    assert.equal(page.runtime, null);
    assert.equal(page.roots.length, 0);
    assert.equal(page.metrics.companionInjections, 0);
  });

  await t.test('iframe is ignored and direct iframe transport is rejected', async () => {
    const harness = createA3Harness();
    const page = harness.createPage({ frameId: 2, topLevel: false });
    await harness.startContentController(page);
    await harness.tick();
    assert.equal(page.documentToken, null);
    assert.equal(page.metrics.companionInjections, 0);

    page.setDocumentToken('document-token-iframe-0001');
    const result = await harness.sendFromPage(page, { type: MESSAGES.BOOT });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unsupported-frame');
    assert.equal(page.runtime, null);
    assert.equal(page.roots.length, 0);
  });
});

test('B1-LC-013: navigation invalidates the exact document target before allocation', async () => {
  const harness = createA3Harness();
  const page = harness.createPage({ documentId: 'document-before-navigation' });
  page.setDocumentToken('document-token-navigation-race-01');

  const bootTask = harness.sendFromPage(page, { type: MESSAGES.BOOT });
  page.documentId = 'document-after-navigation';
  const result = await bootTask;

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'document-changed');
  assert.equal(result.reloadRequired, true);
  assert.equal(page.runtime, null);
  assert.equal(page.roots.length, 0);
  assert.equal(page.metrics.companionInjections, 0);
});

test('B1-LC-003/014: dead interaction is not healthy and root/interaction loss repairs automatically', async () => {
  const harness = createA3Harness();
  const page = harness.createPage();
  const { health: initial } = await bootPreparedPage(harness, page, 'document-token-auto-repair-01');
  const runtimeInstanceId = initial.runtimeInstanceId;

  page.breakRootInteraction();
  const dead = await harness.sendFromPage(page, { type: MESSAGES.HEALTH });
  assert.equal(dead.ready, false);
  assert.equal(dead.health.ui.interactionReady, false);

  await page.runIntervals();
  await harness.waitFor(() => page.health?.ui?.interactionReady === true, 'interaction repair');
  assert.equal(page.health.runtimeInstanceId, runtimeInstanceId);
  assert.equal(page.metrics.companionInjections, 1);
  assert.equal(page.roots.length, 1);

  const removed = page.removeRoot();
  assert.equal(removed.isConnected, false);
  await harness.waitFor(() => page.root && page.root !== removed, 'root replacement');
  await harness.waitFor(() => page.health?.ui?.interactionReady === true, 'replacement interaction readiness');
  assert.equal(page.health.runtimeInstanceId, runtimeInstanceId);
  assert.equal(page.metrics.companionInjections, 1);
  assert.equal(page.roots.length, 1);
  assertExpectedB1Shell(page.health);
});

test('B1-LC-001/003/014: id tampering repairs the connected owned root without leaking a second node', async () => {
  const harness = createA3Harness();
  const page = harness.createPage();
  const { health: initial } = await bootPreparedPage(harness, page, 'document-token-root-id-repair-01');
  const owned = page.root;

  assertExpectedB1Shell(initial);
  owned.id = 'ussign-job-timer-renamed';
  await harness.tick(12);

  const rebuildNodes = page.document.body.children.filter(node => node.dataset.squarecoilCompanionRoot === 'rebuild');
  assert.equal(rebuildNodes.length, 1);
  assert.equal(rebuildNodes[0], owned);
  assert.equal(owned.id, ROOT_ID);
  assert.equal(page.roots.length, 1);
  assert.equal(page.metrics.companionInjections, 1);
  assertExpectedB1Shell(page.health);
});

test('post-boot ownership loss self-retires every reachable resource before a fresh generation', async () => {
  const harness = createA3Harness();
  const page = harness.createPage();
  const { health: initial } = await bootPreparedPage(harness, page, 'document-token-lost-global-0001');
  const oldRuntime = page.runtime;
  assert.equal(page.activeIntervalCount, 1);
  assert.equal(page.activeObserverCount, 1);
  assert.equal(page.window.listenerCount('pageshow'), 1);

  delete page.window.__squareCoilCompanionRuntime;
  await page.runIntervals();
  await harness.waitFor(
    () => page.roots.length === 0 && page.activeIntervalCount === 0 && page.activeObserverCount === 0,
    'lost-global self-retirement'
  );
  assert.equal(page.window.listenerCount('pageshow'), 0);
  assert.equal(Object.prototype.hasOwnProperty.call(page.window, '__squareCoilCompanionInjectionClaim'), false);
  assert.equal(oldRuntime.getHealth().state, 'UNINITIALIZED');
  assert.equal(oldRuntime.getHealth().reason, 'runtime-ownership-lost');

  const restarted = await harness.sendFromPage(page, { type: MESSAGES.BOOT });
  const fresh = await harness.waitForStableRuntime(page);
  assert.equal(restarted.injectionPerformed, true);
  assert.notEqual(fresh.runtimeInstanceId, initial.runtimeInstanceId);
  assert.equal(page.metrics.companionInjections, 2);
  assert.equal(page.roots.length, 1);
});

test('a failed runtime still self-retires if its global ownership is later lost', async () => {
  const harness = createA3Harness();
  const page = harness.createPage();
  await bootPreparedPage(harness, page, 'document-token-failed-global-001');
  const oldRuntime = page.runtime;
  const runtimeInstanceId = oldRuntime.runtimeInstanceId;

  page.root.dataset.runtimeInstanceId = 'runtime-foreign-owner-0001';
  await harness.waitFor(() => page.health?.state === 'FAILED', 'ownership conflict failure');
  assert.equal(page.health.reason, 'ownership-conflict');
  assert.ok(page.health.outstandingResources.length > 0);
  page.root.dataset.runtimeInstanceId = runtimeInstanceId;

  delete page.window.__squareCoilCompanionRuntime;
  await page.runIntervals();
  await harness.waitFor(
    () => page.roots.length === 0 && page.activeIntervalCount === 0 && page.activeObserverCount === 0,
    'failed lost-global self-retirement'
  );
  assert.equal(page.window.listenerCount('pageshow'), 0);
  assert.equal(Object.prototype.hasOwnProperty.call(page.window, '__squareCoilCompanionInjectionClaim'), false);
  assert.equal(oldRuntime.getHealth().state, 'UNINITIALIZED');
});

test('queued monitor work after clean teardown cannot recreate an injection claim', async () => {
  const harness = createA3Harness();
  const page = harness.createPage();
  await bootPreparedPage(harness, page, 'document-token-stale-monitor-001');
  const oldRuntime = page.runtime;

  page.breakRootInteraction();
  page.root.dataset.buildId = harness.buildInfo.buildId;
  const tornDown = await oldRuntime.teardown('test-clean-teardown');
  await harness.tick(8);

  assert.equal(tornDown.state, 'UNINITIALIZED');
  assert.equal(page.runtime, null);
  assert.equal(page.roots.length, 0);
  assert.equal(page.activeIntervalCount, 0);
  assert.equal(page.activeObserverCount, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(page.window, '__squareCoilCompanionInjectionClaim'), false);
});

test('B1-LC-004/010/012/016: orphan recovery is strict and unsafe ownership evidence never stacks', async t => {
  await t.test('fully identified same-build orphan is removed before one fresh boot', async () => {
    const harness = createA3Harness();
    const page = harness.createPage();
    const token = 'document-token-owned-orphan-01';
    page.setDocumentToken(token);
    const orphan = addRoot(page, {
      squarecoilCompanionRoot: 'rebuild',
      runtimeInstanceId: 'orphan-runtime-instance-0001',
      buildId: harness.buildInfo.buildId,
      packageVersion: harness.buildInfo.packageVersion,
      candidateFingerprint: harness.buildInfo.candidateFingerprint,
      documentToken: token
    });

    const result = await harness.sendFromPage(page, { type: MESSAGES.BOOT });
    const health = await harness.waitForStableRuntime(page);
    assert.equal(result.source, 'orphan-root-recovered');
    assert.equal(result.injectionPerformed, true);
    assert.equal(orphan.isConnected, false);
    assert.equal(page.metrics.rootRemovalAttempts, 1);
    assert.equal(page.metrics.companionInjections, 1);
    assert.notEqual(health.runtimeInstanceId, 'orphan-runtime-instance-0001');
    assert.equal(page.roots.length, 1);
  });

  await t.test('ambiguous orphan is retained and requires reload', async () => {
    const harness = createA3Harness();
    const page = harness.createPage();
    const token = 'document-token-ambiguous-root-01';
    page.setDocumentToken(token);
    const root = addRoot(page, {
      squarecoilCompanionRoot: 'rebuild',
      buildId: harness.buildInfo.buildId,
      documentToken: token
    });

    const result = await harness.sendFromPage(page, { type: MESSAGES.BOOT });
    assert.equal(result.classification, 'OWNERSHIP_CONFLICT');
    assert.equal(result.reloadRequired, true);
    assert.equal(root.isConnected, true);
    assert.equal(page.metrics.rootRemovalAttempts, 0);
    assert.equal(page.metrics.companionInjections, 0);
  });

  await t.test('different-build root is retained behind a reload boundary', async () => {
    const harness = createA3Harness();
    const page = harness.createPage();
    const token = 'document-token-version-root-0001';
    page.setDocumentToken(token);
    const root = addRoot(page, {
      squarecoilCompanionRoot: 'rebuild',
      runtimeInstanceId: 'other-runtime-instance-0001',
      buildId: 'different-build-identity',
      documentToken: token
    });

    const result = await harness.sendFromPage(page, { type: MESSAGES.BOOT });
    assert.equal(result.classification, 'VERSION_MISMATCH');
    assert.equal(result.reloadRequired, true);
    assert.equal(root.isConnected, true);
    assert.equal(page.metrics.rootRemovalAttempts, 0);
    assert.equal(page.metrics.companionInjections, 0);
  });

  await t.test('unreadable runtime global fails closed', async () => {
    const harness = createA3Harness();
    const page = harness.createPage();
    page.setDocumentToken('document-token-unreadable-global-01');
    Object.defineProperty(page.window, '__squareCoilCompanionRuntime', {
      configurable: true,
      get() { throw new Error('blocked runtime getter'); }
    });

    const result = await harness.sendFromPage(page, { type: MESSAGES.BOOT });
    assert.equal(result.classification, 'OWNERSHIP_CONFLICT');
    assert.equal(result.reloadRequired, true);
    assert.equal(page.metrics.companionInjections, 0);
    assert.equal(page.roots.length, 0);
  });

  await t.test('legacy stack is retained behind a reload boundary', async () => {
    const harness = createA3Harness();
    const page = harness.createPage();
    page.setDocumentToken('document-token-legacy-stack-0001');
    page.window.__squareCoilJobTimerUiVersion = '0.7.x';

    const result = await harness.sendFromPage(page, { type: MESSAGES.BOOT });
    assert.equal(result.classification, 'LEGACY_RUNTIME');
    assert.equal(result.reloadRequired, true);
    assert.equal(page.metrics.companionInjections, 0);
    assert.equal(page.roots.length, 0);
  });
});

test('B1-LC-016/017: a disabled older candidate runtime is retained without mutation behind a reload boundary', async () => {
  const harness = createA3Harness();
  const page = harness.createPage();
  const token = 'document-token-candidate-drift-0001';
  const runtimeInstanceId = 'runtime-older-candidate-0001';
  const oldCandidateFingerprint = 'b'.repeat(64);
  let mutationCalls = 0;
  page.setDocumentToken(token);
  const snapshot = {
    buildId: harness.buildInfo.buildId,
    packageVersion: harness.buildInfo.packageVersion,
    candidateFingerprint: oldCandidateFingerprint,
    runtimeInstanceId,
    documentToken: token,
    mode: 'DISABLED',
    state: 'DEGRADED',
    reason: 'coordination-not-implemented-b1',
    teardownInProgress: false,
    ui: { rootPresent: true, interactionReady: true }
  };
  const mutation = async () => { mutationCalls += 1; return snapshot; };
  page.window.__squareCoilCompanionRuntime = Object.freeze({
    buildId: snapshot.buildId,
    packageVersion: snapshot.packageVersion,
    candidateFingerprint: snapshot.candidateFingerprint,
    runtimeInstanceId,
    documentToken: token,
    getHealth: () => snapshot,
    boot: mutation,
    revalidate: mutation,
    recover: mutation,
    teardown: mutation,
    retryTeardown: mutation,
    setEnabled: mutation
  });
  const root = addRoot(page, {
    squarecoilCompanionRoot: 'rebuild',
    runtimeInstanceId,
    buildId: snapshot.buildId,
    packageVersion: snapshot.packageVersion,
    candidateFingerprint: oldCandidateFingerprint,
    documentToken: token
  });

  const result = await harness.sendFromPage(page, { type: MESSAGES.BOOT });

  assert.equal(result.classification, 'VERSION_MISMATCH');
  assert.equal(result.reloadRequired, true);
  assert.equal(result.reason, 'version-mismatch-reload-required');
  assert.equal(mutationCalls, 0);
  assert.equal(page.metrics.companionInjections, 0);
  assert.equal(root.isConnected, true);
});

test('B1-LC-016/017: an older content controller cannot drive the current worker candidate', async () => {
  const harness = createA3Harness();
  const page = harness.createPage();
  page.setDocumentToken('document-token-controller-drift-01');

  const result = await harness.sendFromPage(page, {
    type: MESSAGES.BOOT,
    candidateFingerprint: 'c'.repeat(64)
  });

  assert.equal(result.ok, false);
  assert.equal(result.classification, 'VERSION_MISMATCH');
  assert.equal(result.reason, 'content-controller-version-mismatch');
  assert.equal(result.reloadRequired, true);
  assert.equal(page.metrics.companionInjections, 0);
  assert.equal(page.roots.length, 0);
  assert.equal(page.runtime, null);
});

test('B1-LC-006/007: terminal recovery failure remains reload-safe but still permits controlled disable teardown', async () => {
  const harness = createA3Harness();
  const page = harness.createPage();
  const token = 'document-token-terminal-disable-01';
  const runtimeInstanceId = 'runtime-terminal-disable-0001';
  let setEnabledCalls = 0;
  let snapshot = {
    buildId: harness.buildInfo.buildId,
    packageVersion: harness.buildInfo.packageVersion,
    candidateFingerprint: harness.buildInfo.candidateFingerprint,
    runtimeInstanceId,
    documentToken: token,
    mode: 'ENABLED',
    state: 'FAILED',
    reason: 'recovery-exhausted',
    teardownInProgress: false,
    cleanupRequired: false,
    outstandingResources: [],
    readiness: null,
    ui: { rootPresent: true, interactionReady: false }
  };
  page.setDocumentToken(token);
  const root = addRoot(page, {
    squarecoilCompanionRoot: 'rebuild',
    runtimeInstanceId,
    buildId: snapshot.buildId,
    packageVersion: snapshot.packageVersion,
    candidateFingerprint: snapshot.candidateFingerprint,
    documentToken: token
  });
  const unchanged = async () => snapshot;
  page.window.__squareCoilCompanionRuntime = Object.freeze({
    buildId: snapshot.buildId,
    packageVersion: snapshot.packageVersion,
    candidateFingerprint: snapshot.candidateFingerprint,
    runtimeInstanceId,
    documentToken: token,
    getHealth: () => snapshot,
    boot: unchanged,
    revalidate: unchanged,
    recover: unchanged,
    teardown: unchanged,
    retryTeardown: unchanged,
    setEnabled: async enabled => {
      setEnabledCalls += 1;
      assert.equal(enabled, false);
      root.remove();
      delete page.window.__squareCoilCompanionRuntime;
      snapshot = {
        ...snapshot,
        mode: 'DISABLED',
        state: 'UNINITIALIZED',
        reason: 'teardown-complete',
        ui: { rootPresent: false, interactionReady: false }
      };
      return snapshot;
    }
  });

  const boot = await harness.sendFromPage(page, { type: MESSAGES.BOOT });
  assert.equal(boot.ok, false);
  assert.equal(boot.classification, 'FAILED_SAME_BUILD');
  assert.equal(boot.reloadRequired, true);
  assert.equal(setEnabledCalls, 0);

  harness.storage.setSilently({ timerEnabled: false });
  const disabled = await harness.sendFromPage(page, { type: MESSAGES.ENABLE, enabled: false });
  assert.equal(disabled.ok, true);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.health.state, 'UNINITIALIZED');
  assert.equal(disabled.reloadRequired, false);
  assert.equal(setEnabledCalls, 1);
  assert.equal(page.runtime, null);
  assert.equal(page.roots.length, 0);
  assert.equal(page.metrics.companionInjections, 0);
});

test('B1-LC-011: concurrent cross-tab persistence probes use distinct temporary keys', async () => {
  const harness = createA3Harness();
  const first = harness.createPage();
  const second = harness.createPage();
  first.setDocumentToken('document-token-persistence-tab01');
  second.setDocumentToken('document-token-persistence-tab02');

  await Promise.all([
    harness.sendFromPage(first, { type: MESSAGES.BOOT }),
    harness.sendFromPage(second, { type: MESSAGES.BOOT })
  ]);
  await Promise.all([
    harness.waitForStableRuntime(first),
    harness.waitForStableRuntime(second)
  ]);

  const probePrefix = '__scCompanionB1PersistenceProbe:';
  const writtenProbeKeys = harness.storage.setHistory.flat().filter(key => key.startsWith(probePrefix));
  const remainingProbeKeys = Object.keys(harness.storage.snapshot()).filter(key => key.startsWith(probePrefix));
  assert.equal(writtenProbeKeys.length, 2);
  assert.equal(new Set(writtenProbeKeys).size, 2);
  assert.deepEqual(remainingProbeKeys, []);
  assert.equal(first.metrics.companionInjections, 1);
  assert.equal(second.metrics.companionInjections, 1);
  assert.equal(first.roots.length, 1);
  assert.equal(second.roots.length, 1);
});

test('supported URL fixture remains pinned to the production SquareCoil origin', () => {
  assert.equal(new URL(SUPPORTED_URL).origin, 'https://ussignandmill.squarecoil.net');
});
