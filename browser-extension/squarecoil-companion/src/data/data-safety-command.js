'use strict';

const { deepClone, isRecord } = require('./model');
const { DATA_COMMAND_TYPES, commitStagedDataOperation } = require('./data-safety');

function replaceDocument(target, source) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, deepClone(source));
}

function createDataSafetyCommandHandler(options = {}) {
  const now = options.now || (() => Date.now());
  return async function applyDataSafetyCommand(document, command) {
    if (!isRecord(command) || !DATA_COMMAND_TYPES.has(command.type) || !isRecord(command.request) || command.request.type !== command.type) {
      throw new Error('data-command-invalid');
    }
    const result = commitStagedDataOperation(document, command, { nowMs: now(), datasetId: options.makeId?.('dataset') });
    replaceDocument(document, result.document);
    return {
      command: command.type,
      operationId: command.operationId || result.plan.planId,
      planId: result.plan.planId,
      summary: deepClone(result.plan.summary)
    };
  };
}

module.exports = { createDataSafetyCommandHandler };
