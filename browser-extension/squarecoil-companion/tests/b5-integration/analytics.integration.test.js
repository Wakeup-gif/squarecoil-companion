'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDefaultAuthorityKernel } = require('../../src/extension/authority-kernel');
const { AUTHORITY_COMMANDS } = require('../../src/data/migration-command');
const { LEGACY_SOURCE_KEYS } = require('../../src/data/migration');
const { PREFERENCE_COMMANDS } = require('../../src/preferences/preferences');
const { DATA_COMMANDS, stageDataOperation } = require('../../src/data/data-safety');
const { createAnalyticsSnapshot } = require('../../src/presentation/analytics-data');

test('IT-B5-DASH-001 dashboard preference and protected lifecycle commands project one shared ledger across tabs', async () => {
  const now = Date.parse('2026-09-04T16:00:00Z'), values = {};
  let queue = Promise.resolve(), serial = 0;
  const area = { async get(key) { return { [key]: structuredClone(values[key]) }; }, async set(patch) { Object.assign(values, structuredClone(patch)); } };
  const kernel = createDefaultAuthorityKernel({ area, runtimeWorkdayZone: 'UTC', now: () => now, leaseDurationMs: 60000,
    makeId: prefix => `${prefix}-analytics-${++serial}`, lockManager: { request(_name, _options, fn) { const run = queue.then(fn, fn); queue = run.then(() => undefined, () => undefined); return run; } } });
  const owner = await kernel.connect({ runtimeId: 'analytics-owner', documentToken: 'analytics-owner-document', tabId: 1 });
  const observer = await kernel.connect({ runtimeId: 'analytics-observer', documentToken: 'analytics-observer-document', tabId: 2 });
  await kernel.command(owner.session, { type: AUTHORITY_COMMANDS.MIGRATE_V07, commandId: 'analytics-migrate', expectedRevision: 0,
    legacySources: { [LEGACY_SOURCE_KEYS.CURRENT]: JSON.stringify({ contexts: { 'job:101': {
      key: 'job:101', projectId: 101, name: 'Job 101', accumulatedMs: 60000,
      sessions: [{ id: 'source-session', cycleId: 'source-cycle', startAtMs: now - 60000, endAtMs: now }]
    } } }) } });
  const baseline = await kernel.read(owner.session);
  await kernel.command(observer.session, { type: PREFERENCE_COMMANDS.COMMIT, commandId: 'analytics-enable', expectedRevision: baseline.revision,
    expectedPreferenceRevision: 0, patch: { dashboardEnabled: true, dashboardAppearance: 'DARK' } });
  const enabled = await kernel.read(observer.session);
  const before = createAnalyticsSnapshot(enabled.document, { atMs: now });
  assert.equal(enabled.document.dataSafety.preferences.dashboardEnabled, true);
  assert.equal(enabled.document.dataSafety.preferences.dashboardAppearance, 'DARK');
  assert.equal(before.rows[0].scope, 'tracked');
  const request = { type: DATA_COMMANDS.ARCHIVE_CONTEXT, contextId: 'job:101', atMs: now };
  const staged = stageDataOperation(enabled.document, request, { nowMs: now });
  await kernel.command(observer.session, { type: request.type, commandId: 'analytics-archive', expectedRevision: staged.plan.stagedRevision,
    operationId: 'analytics-archive-operation', stagedRevision: staged.plan.stagedRevision, planId: staged.plan.planId,
    request, confirmationTokens: [] });
  const archived = await kernel.read(owner.session), after = createAnalyticsSnapshot(archived.document, { atMs: now });
  assert.equal(after.rows[0].scope, 'archived');
  assert.equal(after.periodMs, before.periodMs);
  assert.equal(after.rows[0].totalMs, before.rows[0].totalMs);
  assert.deepEqual(archived.document.timer, baseline.document.timer);
  assert.deepEqual(archived.document.ledger, baseline.document.ledger);
  assert.deepEqual(after, createAnalyticsSnapshot((await kernel.read(observer.session)).document, { atMs: now }));
  await assert.rejects(() => kernel.command(observer.session, { type: request.type, commandId: 'analytics-stale-archive', expectedRevision: staged.plan.stagedRevision,
    operationId: 'analytics-stale-operation', stagedRevision: staged.plan.stagedRevision, planId: staged.plan.planId, request, confirmationTokens: [] }), /stale-revision/);
});
