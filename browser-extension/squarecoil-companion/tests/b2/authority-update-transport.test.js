'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AUTHORITY_PROTOCOL_VERSION,
  AUTHORITY_MESSAGES,
  createAuthorityUpdateAcknowledgment
} = require('../../src/extension/authority-protocol');
const { createAuthorityClient } = require('../../src/extension/authority-client');
const { createAuthorityUpdateTransport } = require('../../src/extension/authority-update-transport');

function runtimeSurface() {
  let listener = null;
  let lastReturn;
  let responseCount = 0;
  return {
    addListener(value) { listener = value; },
    removeListener(value) { if (listener === value) listener = null; },
    async deliver(message) {
      let response;
      lastReturn = listener?.(message, {}, value => {
        responseCount += 1;
        response = value;
      });
      return response;
    },
    get lastReturn() { return lastReturn; },
    get responseCount() { return responseCount; }
  };
}

function clientTransport(runtimeInstanceId, documentToken) {
  const sessionId = 'authority-session-transport-001';
  const workerInstanceId = 'worker-transport-000001';
  return async request => ({
    ok: true,
    protocolVersion: AUTHORITY_PROTOCOL_VERSION,
    type: request.type,
    requestId: request.requestId,
    sessionId,
    workerInstanceId,
    disposition: 'OWNER',
    sequence: 0,
    revision: 0,
    disconnected: request.type === AUTHORITY_MESSAGES.DISCONNECT,
    result: request.type === AUTHORITY_MESSAGES.READ ? { document: { revision: 0 } } : undefined
  });
}

function timers() {
  return {
    setTimeout,
    clearTimeout,
    setInterval() { return 1; },
    clearInterval() {}
  };
}

test('UT-B2-AUTH-009 Chrome update delivery acknowledges exactly once and rejects stale or malformed responses', async () => {
  const runtime = runtimeSurface();
  const runtimeInstanceId = 'runtime-update-transport-001';
  const documentToken = 'document-update-transport-01';
  const events = [];
  const client = createAuthorityClient({
    send: clientTransport(runtimeInstanceId, documentToken),
    runtimeOnMessage: runtime,
    runtimeInstanceId,
    documentToken,
    randomId: prefix => `${prefix}-transport-0001`,
    requestTimeoutMs: 1_000,
    heartbeatIntervalMs: 30_000,
    timers: timers()
  });
  await client.ensure();
  client.subscribe(event => events.push(event));
  const snapshot = client.snapshot();
  const tabs = { sendMessage: async (_tabId, message) => runtime.deliver(message) };
  const transport = createAuthorityUpdateTransport({ tabs });
  const update = {
    tabId: 77,
    expectedDocumentId: 'browser-document-update-001',
    documentToken,
    runtimeInstanceId,
    sessionId: 'authority-session-transport-001',
    workerInstanceId: snapshot.workerInstanceId,
    sequence: 1,
    event: { nativeEvidence: { kind: 'NATIVE_MUTATION_COMPLETION' } }
  };

  assert.equal(await transport.publish(update), true);
  assert.equal(runtime.lastReturn, false);
  assert.equal(runtime.responseCount, 1);
  assert.deepEqual(events, [update.event]);
  assert.equal(await transport.publish(update), false);
  assert.equal(runtime.responseCount, 1);
  assert.equal(events.length, 1);
  assert.equal(await transport.publish({ ...update, sequence: 2,
    sessionId: 'authority-session-wrong-001' }), false);
  assert.equal(runtime.responseCount, 1);

  for (const mutate of [
    () => undefined,
    () => ({}),
    message => ({ ...createAuthorityUpdateAcknowledgment(message),
      sessionId: 'authority-session-wrong-ack' }),
    message => ({ ...createAuthorityUpdateAcknowledgment(message),
      workerInstanceId: 'worker-wrong-ack-0001' }),
    message => ({ ...createAuthorityUpdateAcknowledgment(message), sequence: message.sequence - 1 })
  ]) {
    const malformed = createAuthorityUpdateTransport({ tabs: {
      sendMessage: async (_tabId, message) => mutate(message)
    } });
    assert.equal(await malformed.publish({ ...update, sequence: 2 }), false);
  }
  await client.teardown();
});
