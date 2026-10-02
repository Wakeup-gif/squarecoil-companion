'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDefaultAuthorityKernel, AUTHORITY_STORAGE_KEY } = require('../../src/extension/authority-kernel');
const { PREFERENCE_COMMANDS, normalizePreferenceSnapshot } = require('../../src/preferences/preferences');

function storageArea() {
  const values = {};
  let failWrite = false;
  return {
    async get(key) { return { [key]: values[key] === undefined ? undefined : structuredClone(values[key]) }; },
    async set(patch) { if (failWrite) { failWrite = false; throw new Error('synthetic-preference-storage-failure'); }
      Object.assign(values, structuredClone(patch)); },
    failNextWrite() { failWrite = true; },
    read() { return structuredClone(values[AUTHORITY_STORAGE_KEY]); }
  };
}

function exclusiveLocks() {
  let queue = Promise.resolve();
  return { request(_name, _options, callback) { const run = queue.then(callback, callback); queue = run.then(() => undefined, () => undefined); return run; } };
}

function fixture() {
  let serial = 0;
  const area = storageArea();
  const kernel = createDefaultAuthorityKernel({ area, lockManager: exclusiveLocks(), runtimeWorkdayZone: 'UTC', now: () => 10_000,
    makeId: prefix => `${prefix}-b5-integration-${++serial}`, leaseDurationMs: 60_000, buildVersion: 'b5-integration' });
  return { area, kernel };
}

function command(type, commandId, expectedRevision, expectedPreferenceRevision, values = {}) {
  return { type, commandId, expectedRevision, expectedPreferenceRevision, ...values };
}

test('IT-B5-PREF-001 an OBSERVER preference request commits once through the fenced authority and is visible cross-tab', async () => {
  const { kernel } = fixture();
  const owner = await kernel.connect({ runtimeId: 'runtime-b5-owner-001', documentToken: 'document-b5-owner-001', tabId: 1 });
  const observer = await kernel.connect({ runtimeId: 'runtime-b5-observer-001', documentToken: 'document-b5-observer-001', tabId: 2 });
  await kernel.command(observer.session, command(PREFERENCE_COMMANDS.INITIALIZE, 'preference-init-001', 0, 0,
    { legacyPreferences: { themePreference: 'auto', settings: { yellow: 30, orange: 60, red: 90 } } }));
  const ownerRead = await kernel.read(owner.session);
  const observerRead = await kernel.read(observer.session);
  assert.equal(ownerRead.revision, 1);
  assert.deepEqual(normalizePreferenceSnapshot(ownerRead.document.dataSafety.preferences),
    normalizePreferenceSnapshot(observerRead.document.dataSafety.preferences));
  assert.equal(normalizePreferenceSnapshot(ownerRead.document.dataSafety.preferences).timerAppearance, 'AUTO');
  assert.equal(ownerRead.document.timer.active, null);
  assert.equal(ownerRead.document.ledger.length, 0);
});

test('IT-B5-PREF-002 concurrent tab preference writes cannot both commit from one document and preference revision', async () => {
  const { kernel } = fixture();
  const owner = await kernel.connect({ runtimeId: 'runtime-b5-owner-002', documentToken: 'document-b5-owner-002', tabId: 1 });
  const observer = await kernel.connect({ runtimeId: 'runtime-b5-observer-002', documentToken: 'document-b5-observer-002', tabId: 2 });
  await kernel.command(owner.session, command(PREFERENCE_COMMANDS.INITIALIZE, 'preference-init-002', 0, 0, { legacyPreferences: {} }));
  const outcomes = await Promise.allSettled([
    kernel.command(owner.session, command(PREFERENCE_COMMANDS.COMMIT, 'preference-race-owner', 1, 1, { patch: { timerAppearance: 'DARK' } })),
    kernel.command(observer.session, command(PREFERENCE_COMMANDS.COMMIT, 'preference-race-observer', 1, 1, { patch: { panelFinish: 'GLASS' } }))
  ]);
  assert.equal(outcomes.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(value => value.status === 'rejected').length, 1);
  assert.match(outcomes.find(value => value.status === 'rejected').reason.message, /stale-revision/);
  const after = await kernel.read(owner.session);
  assert.equal(after.revision, 2);
  assert.equal(normalizePreferenceSnapshot(after.document.dataSafety.preferences).preferenceRevision, 2);
});

test('IT-B5-PREF-003 persistence failure leaves the committed preference snapshot and Timer Ledger unchanged', async () => {
  const { area, kernel } = fixture();
  const owner = await kernel.connect({ runtimeId: 'runtime-b5-owner-003', documentToken: 'document-b5-owner-003', tabId: 1 });
  await kernel.command(owner.session, command(PREFERENCE_COMMANDS.INITIALIZE, 'preference-init-003', 0, 0, { legacyPreferences: {} }));
  const before = area.read();
  area.failNextWrite();
  await assert.rejects(kernel.command(owner.session, command(PREFERENCE_COMMANDS.COMMIT, 'preference-fail-003', 1, 1,
    { patch: { yellowMinutes: 15, orangeMinutes: 30, redMinutes: 45 } })), /synthetic-preference-storage-failure/);
  const after = area.read();
  assert.deepEqual(after.document.dataSafety.preferences, before.document.dataSafety.preferences);
  assert.deepEqual(after.document.timer, before.document.timer);
  assert.deepEqual(after.document.ledger, before.document.ledger);
});

test('IT-B5-PREF-004 optional presentation enable and disable settle cross-tab without authority mutation', async () => {
  const { kernel } = fixture();
  const owner = await kernel.connect({ runtimeId: 'runtime-b5-owner-004', documentToken: 'document-b5-owner-004', tabId: 1 });
  const observer = await kernel.connect({ runtimeId: 'runtime-b5-observer-004', documentToken: 'document-b5-observer-004', tabId: 2 });
  await kernel.command(owner.session, command(PREFERENCE_COMMANDS.INITIALIZE, 'preference-init-004', 0, 0, { legacyPreferences: {} }));
  const baseline = await kernel.read(owner.session);
  await kernel.command(observer.session, command(PREFERENCE_COMMANDS.COMMIT, 'preference-enable-004', 1, 1,
    { patch: { websiteTheme: 'SLEEK_DARK' } }));
  const enabled = await kernel.read(owner.session);
  assert.deepEqual(normalizePreferenceSnapshot(enabled.document.dataSafety.preferences),
    normalizePreferenceSnapshot((await kernel.read(observer.session)).document.dataSafety.preferences));
  assert.equal(enabled.document.dataSafety.preferences.cinematicBackground, 'CINEMATIC');
  await kernel.command(owner.session, command(PREFERENCE_COMMANDS.COMMIT, 'preference-disable-004', 2, 2,
    { patch: { websiteTheme: 'ORIGINAL' } }));
  const disabled = await kernel.read(observer.session);
  assert.deepEqual([disabled.document.dataSafety.preferences.websiteTheme, disabled.document.dataSafety.preferences.cinematicBackground],
    ['ORIGINAL', 'NONE']);
  assert.deepEqual(disabled.document.timer, baseline.document.timer);
  assert.deepEqual(disabled.document.ledger, baseline.document.ledger);
});
