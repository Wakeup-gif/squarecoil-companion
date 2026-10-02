'use strict';

const { assertWorkdayZone } = require('./model');

function validZone(value) {
  try {
    return assertWorkdayZone(value);
  } catch (_) {
    return null;
  }
}

function detectRuntimeZone(intl = globalThis.Intl) {
  try {
    return validZone(intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch (_) {
    return null;
  }
}

function selectWorkdayZone(options = {}) {
  const persistedZone = validZone(options.persistedZone);
  if (persistedZone) {
    return Object.freeze({
      zone: persistedZone,
      source: 'PERSISTED',
      fallback: false,
      diagnostic: null
    });
  }

  const configuredZone = validZone(options.configuredZone);
  if (configuredZone) {
    return Object.freeze({
      zone: configuredZone,
      source: 'CONFIGURED',
      fallback: false,
      diagnostic: null
    });
  }

  const runtimeZone = validZone(options.runtimeZone) ||
    (options.detectRuntime === false ? null : detectRuntimeZone(options.intl));
  if (runtimeZone) {
    return Object.freeze({
      zone: runtimeZone,
      source: 'RUNTIME',
      fallback: false,
      diagnostic: null
    });
  }

  return Object.freeze({
    zone: 'UTC',
    source: 'UTC_FALLBACK',
    fallback: true,
    diagnostic: options.configuredZone != null
      ? 'configured-iana-zone-unavailable'
      : options.persistedZone != null
        ? 'persisted-iana-zone-unavailable'
        : 'runtime-iana-zone-unavailable'
  });
}

module.exports = { validZone, detectRuntimeZone, selectWorkdayZone };
