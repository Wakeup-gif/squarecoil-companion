'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { AUTHORITY_COMMANDS } = require('../../src/data/migration-command');
const { TIMER_COMMANDS } = require('../../src/timer/service');
const {
  COMMAND_ACCESS,
  commandAccess,
  isPublicTimerCommandType,
  isOwnerOnlyTimerCommandType,
  createAuthorityCommandDispatcher
} = require('../../src/data/command-dispatcher');

function context(disposition = 'OWNER') {
  return Object.freeze({
    requester: Object.freeze({
      runtimeId: disposition === 'OWNER' ? 'runtime-owner' : 'runtime-observer',
      documentToken: disposition === 'OWNER' ? 'document-owner' : 'document-observer',
      tabId: disposition === 'OWNER' ? 1 : 2
    }),
    requesterDisposition: disposition,
    coordinationEpoch: 4,
    fencingToken: 7,
    writer: Object.freeze({
      runtimeId: 'runtime-owner',
      documentToken: 'document-owner',
      tabId: 1,
      coordinationEpoch: 4,
      fencingToken: 7
    })
  });
}

test('UT-B2-DISPATCH-001 exposes only the bounded TIMER command surface to content', () => {
  assert.equal(commandAccess(AUTHORITY_COMMANDS.MIGRATE_V07), COMMAND_ACCESS.DIRECT_OWNER);
  assert.equal(isPublicTimerCommandType(AUTHORITY_COMMANDS.MIGRATE_V07), false);
  assert.equal(commandAccess(TIMER_COMMANDS.LOCAL_PAUSE), COMMAND_ACCESS.PUBLIC_REQUESTER);
  assert.equal(isPublicTimerCommandType(TIMER_COMMANDS.LOCAL_PAUSE), true);
  assert.equal(isOwnerOnlyTimerCommandType(TIMER_COMMANDS.LOCAL_PAUSE), false);
  assert.equal(commandAccess(TIMER_COMMANDS.ACCEPT_OBSERVATION), COMMAND_ACCESS.PUBLIC_OWNER);
  assert.equal(isOwnerOnlyTimerCommandType(TIMER_COMMANDS.ACCEPT_OBSERVATION), true);
  assert.equal(commandAccess('TIMER_NOT_A_REAL_COMMAND'), null);
  assert.equal(isPublicTimerCommandType('TIMER_NOT_A_REAL_COMMAND'), false);
});

test('UT-B2-DISPATCH-002 routes direct migration and TIMER commands without sharing handlers', async () => {
  const calls = [];
  const dispatcher = createAuthorityCommandDispatcher({
    migrationHandler: async (document, command, trusted) => {
      calls.push({ handler: 'migration', document, command, trusted });
      return { migrated: true };
    },
    timerHandler: async (document, command, trusted) => {
      calls.push({ handler: 'timer', document, command, trusted });
      return { state: 'IDLE' };
    }
  });
  const document = {};
  const trusted = context();

  assert.deepEqual(await dispatcher(document, {
    type: AUTHORITY_COMMANDS.MIGRATE_V07
  }, trusted), { migrated: true });
  assert.deepEqual(await dispatcher(document, {
    type: TIMER_COMMANDS.RECONCILE_OWNERSHIP
  }, trusted), { state: 'IDLE' });
  assert.deepEqual(calls.map(call => call.handler), ['migration', 'timer']);
  assert.equal(calls[0].trusted, trusted);
  assert.equal(calls[1].trusted, trusted);
});

test('UT-B2-DISPATCH-003 rejects observer-only internal writes before either handler runs', async () => {
  let calls = 0;
  const dispatcher = createAuthorityCommandDispatcher({
    migrationHandler: async () => { calls += 1; },
    timerHandler: async () => { calls += 1; }
  });
  const observer = context('OBSERVER_CONNECTED');

  await assert.rejects(
    dispatcher({}, { type: TIMER_COMMANDS.ACCEPT_OBSERVATION }, observer),
    /authority-command-owner-required/
  );
  await assert.rejects(
    dispatcher({}, { type: AUTHORITY_COMMANDS.MIGRATE_V07 }, observer),
    /authority-command-owner-required/
  );
  await assert.rejects(
    dispatcher({}, { type: 'TIMER_UNKNOWN' }, observer),
    /authority-command-type-unsupported/
  );
  assert.equal(calls, 0);
});

test('UT-B2-DISPATCH-004 allows observer user commands while preserving trusted requester context', async () => {
  let received = null;
  const dispatcher = createAuthorityCommandDispatcher({
    migrationHandler: async () => { throw new Error('wrong-handler'); },
    timerHandler: async (_document, command, trusted) => {
      received = { command, trusted };
      return { accepted: true };
    }
  });
  const observer = context('OBSERVER_CONNECTED');
  const command = {
    type: TIMER_COMMANDS.LOCAL_PAUSE,
    originRuntimeId: observer.requester.runtimeId
  };

  assert.deepEqual(await dispatcher({}, command, observer), { accepted: true });
  assert.equal(received.command, command);
  assert.equal(received.trusted, observer);
});
