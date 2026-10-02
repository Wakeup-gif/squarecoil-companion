'use strict';

const { deepClone, deepFreeze, isRecord } = require('./model');
const {
  LEGACY_SOURCE_KEYS,
  V07_MIGRATION_MARKER_ID,
  migrateV07
} = require('./migration');

const AUTHORITY_COMMANDS = Object.freeze({
  MIGRATE_V07: 'MIGRATE_V07'
});

function requireTimestamp(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('migration-command-time-invalid');
  return value;
}

function replaceDocument(target, source) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, deepClone(source));
}

function captureV07LegacySources(storage) {
  if (!storage || typeof storage.getItem !== 'function') {
    throw new Error('legacy-local-storage-reader-required');
  }
  const captured = {};
  for (const key of Object.values(LEGACY_SOURCE_KEYS)) {
    const value = storage.getItem(key);
    if (value !== null && value !== undefined) captured[key] = String(value);
  }
  return deepFreeze(captured);
}

function hasCapturedLegacySource(sources) {
  return isRecord(sources) && Object.values(LEGACY_SOURCE_KEYS)
    .some(key => Object.prototype.hasOwnProperty.call(sources, key));
}

function createMigrationCommandHandler(options = {}) {
  const now = options.now || (() => Date.now());
  return async function applyMigrationCommand(document, command) {
    if (!isRecord(command)) throw new Error('authority-command-invalid');
    if (command.type !== AUTHORITY_COMMANDS.MIGRATE_V07) {
      throw new Error('authority-command-type-unsupported');
    }
    if (!isRecord(command.legacySources)) throw new Error('legacy-sources-invalid');
    const nowMs = requireTimestamp(now());
    const result = migrateV07(document, command.legacySources, { nowMs });
    if (result.migrated) replaceDocument(document, result.document);
    return {
      command: AUTHORITY_COMMANDS.MIGRATE_V07,
      migrated: result.migrated,
      reason: result.reason,
      markerId: result.marker?.markerId || V07_MIGRATION_MARKER_ID,
      diagnosticCodes: result.diagnostics.map(item => item.code)
    };
  };
}

module.exports = {
  AUTHORITY_COMMANDS,
  captureV07LegacySources,
  hasCapturedLegacySource,
  createMigrationCommandHandler
};
