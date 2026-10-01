'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createEmptyDocument, validateDocument } = require('../../src/data/model');
const {
  PREFERENCE_COMMANDS,
  applyPreferenceCommand,
  normalizePreferenceSnapshot
} = require('../../src/preferences/preferences');
const {
  DATA_COMMANDS,
  createFullBackup,
  stageDataOperation,
  commitStagedDataOperation
} = require('../../src/data/data-safety');

const NOW = Date.parse('2026-10-01T15:00:00Z');
const COMBINED_CHOICES = Object.freeze({
  timerAppearance: 'CLEAR',
  websiteTheme: 'LIGHT_GLASS',
  cinematicBackground: 'NONE',
  quickFilePathsEnabled: true,
  quickClockControlsEnabled: true
});

function documentFixture(datasetId) {
  return createEmptyDocument({ nowMs: NOW, workdayZone: 'UTC', datasetId });
}

function liveSourceFixture() {
  const document = documentFixture('integration-preferences-source');
  const contextId = 'job:261001';
  document.contexts[contextId] = {
    contextId, kind: 'job', projectId: '261001', currentLabel: 'Integration fixture',
    shortLabel: '261001', aliases: [], createdAtMs: NOW - 120_000,
    lastSeenAtMs: NOW, workspaceMembership: 'RECENT', archivedAtMs: null,
    legacyUnattributedMs: 0
  };
  document.ledger.push({
    segmentId: 'integration-finalized-segment', sessionId: 'integration-finalized-session',
    cycleId: 'integration-finalized-cycle', contextId, startAtMs: NOW - 90_000,
    endAtMs: NOW - 60_000, durationMs: 30_000, localDate: '2026-10-01',
    workdayZone: 'UTC'
  });
  document.timer.active = {
    contextId, sessionId: 'integration-live-session', cycleId: 'integration-live-cycle',
    startedAtMs: NOW - 10_000, lastVerifiedAtMs: NOW - 4_000,
    source: 'integration-fixture', certainty: 'VERIFIED',
    accrualOwnerToken: 'integration-owner', safetyHold: null
  };
  document.checkpoint = {
    schemaVersion: 1, runtimeInstanceId: 'integration-runtime', contextId,
    sessionId: 'integration-live-session', cycleId: 'integration-live-cycle',
    startedAtMs: NOW - 10_000, lastVerifiedAtMs: NOW - 4_000,
    checkpointedAtMs: NOW, terminationDisposition: 'UNEXPECTED_INTERRUPTION',
    buildVersion: 'integration-fixture', source: 'companion',
    ownershipEvidence: {
      disposition: 'OWNER', ownerRuntimeId: 'integration-runtime',
      coordinationEpoch: 1, fencingToken: '1'
    }
  };
  return document;
}

function assertCombinedChoices(preferences) {
  for (const [key, value] of Object.entries(COMBINED_CHOICES)) {
    assert.equal(preferences[key], value, key);
  }
}

function commitCombinedChoices(document) {
  return applyPreferenceCommand(document, {
    type: PREFERENCE_COMMANDS.COMMIT,
    expectedPreferenceRevision: 0,
    patch: COMBINED_CHOICES
  });
}

test('IT-B5-MERGE-PREF-001 Clear, quick tools and explicit photo Off share durable v3 preferences without timing changes', () => {
  const source = liveSourceFixture();
  const timingBefore = structuredClone({ timer: source.timer, ledger: source.ledger, checkpoint: source.checkpoint });
  const committed = commitCombinedChoices(source);
  assertCombinedChoices(committed.preferences);
  assert.equal(committed.preferences.preferenceRevision, 1);
  assert.equal(source.dataSafety.preferences.preferencesSchemaVersion, 3);
  assert.equal(validateDocument(source), true);

  const persisted = JSON.parse(JSON.stringify(source));
  const normalized = normalizePreferenceSnapshot(persisted.dataSafety.preferences);
  assertCombinedChoices(normalized);
  assert.equal(normalized.schemaVersion, 3);
  assert.equal(normalized.initialized, true);
  assert.equal(normalized.preferenceRevision, 1);
  assert.equal(validateDocument(persisted), true);
  assert.deepEqual({ timer: source.timer, ledger: source.ledger, checkpoint: source.checkpoint }, timingBefore);

  applyPreferenceCommand(persisted, {
    type: PREFERENCE_COMMANDS.COMMIT, expectedPreferenceRevision: 1,
    patch: { websiteTheme: 'SLEEK_DARK' }
  });
  assert.equal(persisted.dataSafety.preferences.cinematicBackground, 'NONE');
  assert.equal(persisted.dataSafety.preferences.timerAppearance, 'CLEAR');
  assert.equal(persisted.dataSafety.preferences.quickFilePathsEnabled, true);
  assert.equal(persisted.dataSafety.preferences.quickClockControlsEnabled, true);
  assert.deepEqual({ timer: persisted.timer, ledger: persisted.ledger, checkpoint: persisted.checkpoint }, timingBefore);
});

function assertBackupRoundtrip(mode) {
  const source = liveSourceFixture();
  commitCombinedChoices(source);
  const sourceBefore = structuredClone(source);
  const backup = createFullBackup(source, {
    backupId: `integration-preferences-${mode.toLowerCase()}`,
    exportedAtMs: NOW, appVersion: 'integration-fixture'
  });
  assertCombinedChoices(backup.preferences);
  assert.equal(backup.preferences.preferencesSchemaVersion, 3);
  assert.equal(Object.hasOwn(backup, 'timer'), false);
  assert.equal(Object.hasOwn(backup, 'checkpoint'), false);
  assert.equal(JSON.stringify(backup).includes('integration-owner'), false);
  assert.equal(backup.recoveryEvidence[0].disposition, 'NON_LIVE_RECOVERY_EVIDENCE');

  const target = documentFixture(`integration-preferences-target-${mode.toLowerCase()}`);
  applyPreferenceCommand(target, {
    type: PREFERENCE_COMMANDS.COMMIT, expectedPreferenceRevision: 0,
    patch: { timerAppearance: 'DARK', websiteTheme: 'SLEEK_DARK' }
  });
  const targetBefore = structuredClone(target);
  const request = {
    type: DATA_COMMANDS.RESTORE_BACKUP, mode,
    input: `${JSON.stringify(backup)}\n`, importPreferences: true, importWorkspace: true
  };
  const staged = stageDataOperation(target, request, { nowMs: NOW });
  assert.equal(staged.plan.blocked, false);
  assert.deepEqual(target, targetBefore);
  const restored = commitStagedDataOperation(target, {
    request, stagedRevision: staged.plan.stagedRevision, planId: staged.plan.planId,
    operationId: `integration-preferences-restore-${mode.toLowerCase()}`,
    confirmationTokens: staged.plan.requiredConfirmations, preBackupDisposition: 'CREATED'
  }, { nowMs: NOW }).document;

  assertCombinedChoices(normalizePreferenceSnapshot(restored.dataSafety.preferences));
  assert.equal(restored.dataSafety.preferences.preferencesSchemaVersion, 3);
  assert.equal(restored.dataSafety.preferences.preferenceRevision, targetBefore.dataSafety.preferences.preferenceRevision + 1);
  assert.equal(restored.timer.active, null);
  assert.equal(restored.timer.pending, null);
  assert.equal(restored.timer.localPause, null);
  assert.equal(restored.checkpoint, null);
  assert.equal(restored.ledger.find(row => row.segmentId === 'integration-finalized-segment').durationMs, 30_000);
  const recovered = restored.ledger.filter(row => row.sessionId === 'integration-live-session');
  assert.equal(recovered.reduce((sum, row) => sum + row.durationMs, 0), 6_000);
  assert.ok(recovered.every(row => row.endAtMs <= NOW - 4_000));
  assert.equal(validateDocument(restored), true);
  assert.deepEqual(source, sourceBefore);
  assert.deepEqual(target, targetBefore);
}

test('IT-B5-MERGE-PREF-002 MERGE restores combined settings and finalized time without importing live state', () => {
  assertBackupRoundtrip('MERGE');
});

test('IT-B5-MERGE-PREF-003 REPLACE restores combined settings and finalized time without importing live state', () => {
  assertBackupRoundtrip('REPLACE');
});
