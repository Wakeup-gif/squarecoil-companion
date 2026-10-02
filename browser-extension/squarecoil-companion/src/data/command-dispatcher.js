'use strict';

const {
  AUTHORITY_COMMANDS,
  createMigrationCommandHandler
} = require('./migration-command');
const {
  TIMER_COMMANDS,
  createTimerCommandHandler
} = require('../timer/service');
const { DATA_COMMAND_TYPES } = require('./data-safety');
const { createDataSafetyCommandHandler } = require('./data-safety-command');
const { PREFERENCE_COMMAND_TYPES } = require('../preferences/preferences');
const { createPreferenceCommandHandler } = require('../preferences/preferences-command');

const COMMAND_ACCESS = Object.freeze({
  DIRECT_OWNER: 'DIRECT_OWNER',
  PUBLIC_OWNER: 'PUBLIC_OWNER',
  PUBLIC_REQUESTER: 'PUBLIC_REQUESTER'
});

const PUBLIC_REQUESTER_TIMER_COMMANDS = Object.freeze([
  TIMER_COMMANDS.RESUME,
  TIMER_COMMANDS.START_FRESH,
  TIMER_COMMANDS.LOCAL_PAUSE,
  TIMER_COMMANDS.LOCAL_RESUME,
  TIMER_COMMANDS.COMPANION_DISABLE
]);

const PUBLIC_OWNER_TIMER_COMMANDS = Object.freeze([
  TIMER_COMMANDS.ACCEPT_OBSERVATION,
  TIMER_COMMANDS.RECONCILE_OWNERSHIP,
  TIMER_COMMANDS.CONTROLLED_TEARDOWN,
  TIMER_COMMANDS.RECOVER_INTERRUPTION
]);

const PUBLIC_REQUESTER_TYPES = new Set(PUBLIC_REQUESTER_TIMER_COMMANDS);
const PUBLIC_OWNER_TYPES = new Set(PUBLIC_OWNER_TIMER_COMMANDS);

function commandAccess(type) {
  if (type === AUTHORITY_COMMANDS.MIGRATE_V07) return COMMAND_ACCESS.DIRECT_OWNER;
  if (DATA_COMMAND_TYPES.has(type)) return COMMAND_ACCESS.PUBLIC_REQUESTER;
  if (PREFERENCE_COMMAND_TYPES.has(type)) return COMMAND_ACCESS.PUBLIC_REQUESTER;
  if (PUBLIC_OWNER_TYPES.has(type)) return COMMAND_ACCESS.PUBLIC_OWNER;
  if (PUBLIC_REQUESTER_TYPES.has(type)) return COMMAND_ACCESS.PUBLIC_REQUESTER;
  return null;
}

function isPublicTimerCommandType(type) {
  return PUBLIC_OWNER_TYPES.has(type) || PUBLIC_REQUESTER_TYPES.has(type);
}

function isPublicAuthorityCommandType(type) {
  const access = commandAccess(type);
  return access === COMMAND_ACCESS.PUBLIC_OWNER || access === COMMAND_ACCESS.PUBLIC_REQUESTER;
}

function isOwnerOnlyTimerCommandType(type) {
  return commandAccess(type) === COMMAND_ACCESS.PUBLIC_OWNER;
}

function requireTrustedContext(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    throw new Error('authority-command-trusted-context-required');
  }
  if (!['OWNER', 'OBSERVER_CONNECTED'].includes(context.requesterDisposition)) {
    throw new Error('authority-command-requester-disposition-invalid');
  }
  return context;
}

function createAuthorityCommandDispatcher(options = {}) {
  const migrationHandler = options.migrationHandler || createMigrationCommandHandler(options);
  const timerHandler = options.timerHandler || createTimerCommandHandler(options);
  const dataSafetyHandler = options.dataSafetyHandler || createDataSafetyCommandHandler(options);
  const preferenceHandler = options.preferenceHandler || createPreferenceCommandHandler(options);
  if (typeof migrationHandler !== 'function') throw new Error('migration-command-handler-invalid');
  if (typeof timerHandler !== 'function') throw new Error('timer-command-handler-invalid');
  if (typeof dataSafetyHandler !== 'function') throw new Error('data-safety-command-handler-invalid');
  if (typeof preferenceHandler !== 'function') throw new Error('preference-command-handler-invalid');

  return async function dispatchAuthorityCommand(document, command, trustedContext) {
    if (!command || typeof command !== 'object' || Array.isArray(command)) {
      throw new Error('authority-command-invalid');
    }
    const access = commandAccess(command.type);
    if (!access) throw new Error('authority-command-type-unsupported');
    const context = requireTrustedContext(trustedContext);
    if (
      access === COMMAND_ACCESS.DIRECT_OWNER ||
      access === COMMAND_ACCESS.PUBLIC_OWNER
    ) {
      if (context.requesterDisposition !== 'OWNER') {
        throw new Error('authority-command-owner-required');
      }
    }
    if (access === COMMAND_ACCESS.DIRECT_OWNER) {
      return migrationHandler(document, command, context);
    }
    if (DATA_COMMAND_TYPES.has(command.type)) {
      return dataSafetyHandler(document, command, context);
    }
    if (PREFERENCE_COMMAND_TYPES.has(command.type)) {
      return preferenceHandler(document, command, context);
    }
    return timerHandler(document, command, context);
  };
}

module.exports = {
  COMMAND_ACCESS,
  PUBLIC_REQUESTER_TIMER_COMMANDS,
  PUBLIC_OWNER_TIMER_COMMANDS,
  commandAccess,
  isPublicTimerCommandType,
  isPublicAuthorityCommandType,
  isOwnerOnlyTimerCommandType,
  createAuthorityCommandDispatcher
};
