'use strict';

const { applyPreferenceCommand } = require('./preferences');

function createPreferenceCommandHandler(options = {}) {
  return async function handlePreferenceCommand(document, command) {
    return applyPreferenceCommand(document, command, { datasetId: options.makeId?.('dataset') });
  };
}

module.exports = { createPreferenceCommandHandler };
