'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDefaultAuthorityKernel, AUTHORITY_STORAGE_KEY } = require('../../src/extension/authority-kernel');
const { AUTHORITY_COMMANDS } = require('../../src/data/migration-command');
const { LEGACY_SOURCE_KEYS } = require('../../src/data/migration');
const { createEmptyDocument } = require('../../src/data/model');
const { splitInterval } = require('../../src/data/ledger');
const { DATA_COMMANDS, createFullBackup, stageDataOperation } = require('../../src/data/data-safety');

function storageArea() {
  const values = {};
  let failWrite = false;
  return {
    async get(key) { return { [key]: values[key] === undefined ? undefined : structuredClone(values[key]) }; },
    async set(patch) {
      if (failWrite) { failWrite = false; throw new Error('synthetic-storage-failure'); }
      Object.assign(values, structuredClone(patch));
    },
    failNextWrite() { failWrite = true; },
    read() { return values[AUTHORITY_STORAGE_KEY] === undefined ? null : structuredClone(values[AUTHORITY_STORAGE_KEY]); }
  };
}

function exclusiveLocks() {
  let queue = Promise.resolve();
  return { request(_name, options, callback) {
    assert.equal(options.mode, 'exclusive');
    const run = queue.then(callback, callback);
    queue = run.then(() => undefined, () => undefined);
    return run;
  } };
}

function ids() { let serial = 0; return prefix => `${prefix}-integration-${++serial}`; }

function fixture() {
  const area = storageArea();
  const clock = { value: 2_000 };
  const kernel = createDefaultAuthorityKernel({ area, lockManager: exclusiveLocks(), runtimeWorkdayZone: 'UTC',
    now: () => clock.value, makeId: ids(), leaseDurationMs: 60_000, buildVersion: 'b4-integration' });
  return { area, clock, kernel };
}

function legacySources(projectId = '260901') {
  return { [LEGACY_SOURCE_KEYS.CURRENT]: JSON.stringify({ contexts: { [`job:${projectId}`]: {
    key: `job:${projectId}`, projectId: Number(projectId), name: `Job ${projectId}`, accumulatedMs: 1_000,
    sessions: [{ id: `session-${projectId}`, cycleId: `cycle-${projectId}`, startAtMs: 0, endAtMs: 1_000 }]
  } } }) };
}

async function migrate(kernel, owner, projectId = '260901') {
  return kernel.command(owner.session, { type: AUTHORITY_COMMANDS.MIGRATE_V07,
    commandId: `migration-${projectId}`, expectedRevision: 0, legacySources: legacySources(projectId) });
}

function commandFor(plan, request, suffix, values = {}) {
  return { type: request.type, commandId: `data-command-${suffix}`, expectedRevision: plan.stagedRevision,
    operationId: `operation-${suffix}`, stagedRevision: plan.stagedRevision, planId: plan.planId, request,
    confirmationTokens: values.confirmationTokens || plan.requiredConfirmations,
    preBackupDisposition: values.preBackupDisposition };
}

test('IT-B4-DATA-001 an OBSERVER data command commits once through the current fenced OWNER', async () => {
  const { kernel } = fixture();
  const owner = await kernel.connect({ runtimeId: 'runtime-owner-001', documentToken: 'document-owner-001', tabId: 1 });
  const observer = await kernel.connect({ runtimeId: 'runtime-observer-01', documentToken: 'document-observer-01', tabId: 2 });
  await migrate(kernel, owner);
  const read = await kernel.read(observer.session);
  const request = { type: DATA_COMMANDS.ARCHIVE_CONTEXT, contextId: 'job:260901', atMs: 2_000 };
  const plan = stageDataOperation(read.document, request).plan;
  const first = await kernel.command(observer.session, commandFor(plan, request, 'archive-001'));
  const duplicate = await kernel.command(observer.session, commandFor(plan, request, 'archive-001'));
  const after = await kernel.read(observer.session);
  assert.equal(first.revision, 2);
  assert.equal(duplicate.duplicate, true);
  assert.equal(after.document.contexts['job:260901'].workspaceMembership, 'ARCHIVED');
  assert.equal(after.document.ledger.reduce((sum, row) => sum + row.durationMs, 0), 1_000);
});

test('IT-B4-DATA-002 concurrent staged mutations cannot both commit from one revision', async () => {
  const { kernel } = fixture();
  const owner = await kernel.connect({ runtimeId: 'runtime-owner-002', documentToken: 'document-owner-002', tabId: 1 });
  const observer = await kernel.connect({ runtimeId: 'runtime-observer-02', documentToken: 'document-observer-02', tabId: 2 });
  await migrate(kernel, owner, '260902');
  const read = await kernel.read(owner.session);
  const archiveRequest = { type: DATA_COMMANDS.ARCHIVE_CONTEXT, contextId: 'job:260902', atMs: 2_000 };
  const clearRequest = { type: DATA_COMMANDS.CLEAR_RECENT };
  const archivePlan = stageDataOperation(read.document, archiveRequest).plan;
  const clearPlan = stageDataOperation(read.document, clearRequest).plan;
  const outcomes = await Promise.allSettled([
    kernel.command(owner.session, commandFor(archivePlan, archiveRequest, 'race-archive')),
    kernel.command(observer.session, commandFor(clearPlan, clearRequest, 'race-clear'))
  ]);
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(result => result.status === 'rejected').length, 1);
  assert.match(outcomes.find(result => result.status === 'rejected').reason.message, /stale-revision/);
  assert.equal((await kernel.read(owner.session)).revision, 2);
});

test('IT-B4-DATA-003 persistence failure leaves the whole staged mutation uncommitted', async () => {
  const { area, kernel } = fixture();
  const owner = await kernel.connect({ runtimeId: 'runtime-owner-003', documentToken: 'document-owner-003', tabId: 1 });
  await migrate(kernel, owner, '260903');
  const read = await kernel.read(owner.session);
  const request = { type: DATA_COMMANDS.ARCHIVE_CONTEXT, contextId: 'job:260903', atMs: 2_000 };
  const plan = stageDataOperation(read.document, request).plan;
  area.failNextWrite();
  await assert.rejects(kernel.command(owner.session, commandFor(plan, request, 'storage-failure')), /synthetic-storage-failure/);
  const persisted = area.read();
  assert.equal(persisted.document.revision, 1);
  assert.equal(persisted.document.contexts['job:260903'].workspaceMembership, 'RECENT');
});

test('IT-B4-DATA-004 backup staging commits through the authority store and refreshes the read model', async () => {
  const source = createEmptyDocument({ nowMs: 1_000, workdayZone: 'UTC', datasetId: 'dataset-source-004' });
  source.contexts['job:260904'] = { contextId: 'job:260904', kind: 'job', projectId: '260904', currentLabel: 'Job 260904',
    shortLabel: '260904', aliases: [], createdAtMs: 0, lastSeenAtMs: 1_000, workspaceMembership: 'RECENT', archivedAtMs: null, legacyUnattributedMs: 0 };
  source.ledger.push(...splitInterval({ sessionId: 'session-source-004', cycleId: 'cycle-source-004', contextId: 'job:260904',
    startAtMs: 0, endAtMs: 1_000, workdayZone: 'UTC', source: 'fixture', certainty: 'VERIFIED', createdAtMs: 1_000 }));
  const backup = createFullBackup(source, { backupId: 'backup-integration-004', exportedAtMs: 1_000 });

  const { kernel } = fixture();
  const owner = await kernel.connect({ runtimeId: 'runtime-owner-004', documentToken: 'document-owner-004', tabId: 1 });
  const read = await kernel.read(owner.session);
  const request = { type: DATA_COMMANDS.RESTORE_BACKUP, mode: 'MERGE', input: backup };
  const plan = stageDataOperation(read.document, request).plan;
  const committed = await kernel.command(owner.session, commandFor(plan, request, 'restore-004'));
  const after = await kernel.read(owner.session);
  assert.equal(committed.result.summary.segmentsAdded, 1);
  assert.equal(after.revision, 1);
  assert.equal(after.document.ledger[0].contextId, 'job:260904');
  assert.equal(after.document.timer.active, null);
});
