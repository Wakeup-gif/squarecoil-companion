'use strict';

const {
  AUTHORITY_PROTOCOL_VERSION,
  AUTHORITY_MESSAGES,
  isAuthorityUpdateAcknowledgment
} = require('./authority-protocol');

function createAuthorityUpdateTransport(options = {}) {
  const tabs = options.tabs;
  if (!tabs || typeof tabs.sendMessage !== 'function') {
    return Object.freeze({ available: false, publish: async () => false });
  }

  async function publish(update) {
    const message = {
      type: AUTHORITY_MESSAGES.UPDATE,
      protocolVersion: AUTHORITY_PROTOCOL_VERSION,
      documentToken: update.documentToken,
      runtimeInstanceId: update.runtimeInstanceId,
      sessionId: update.sessionId,
      workerInstanceId: update.workerInstanceId,
      sequence: update.sequence,
      event: update.event
    };
    const target = update.expectedDocumentId
      ? { documentId: update.expectedDocumentId }
      : { frameId: 0 };
    try {
      const acknowledgment = await tabs.sendMessage(update.tabId, message, target);
      return isAuthorityUpdateAcknowledgment(acknowledgment, message);
    } catch (_) {
      return false;
    }
  }

  return Object.freeze({ available: true, publish });
}

module.exports = { createAuthorityUpdateTransport };
