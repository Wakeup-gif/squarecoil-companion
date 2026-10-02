'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createEmptyDocument } = require('../../src/data/model');
const { selectWorkdayZone } = require('../../src/data/workday-zone');

test('UT-B2-ZONE-001 persisted Workday Zone stays authoritative across runtime-zone changes', () => {
  const result = selectWorkdayZone({
    persistedZone: 'America/New_York',
    runtimeZone: 'America/Los_Angeles',
    detectRuntime: false
  });
  assert.deepEqual(result, {
    zone: 'America/New_York',
    source: 'PERSISTED',
    fallback: false,
    diagnostic: null
  });
});

test('UT-B2-ZONE-002 runtime selection accepts IANA zones and rejects fixed offsets', () => {
  assert.equal(selectWorkdayZone({
    runtimeZone: 'America/Chicago',
    detectRuntime: false
  }).zone, 'America/Chicago');
  const fallback = selectWorkdayZone({
    runtimeZone: '-05:00',
    detectRuntime: false
  });
  assert.equal(fallback.zone, 'UTC');
  assert.equal(fallback.fallback, true);
  assert.equal(fallback.diagnostic, 'runtime-iana-zone-unavailable');
});

test('UT-B2-ZONE-003 UTC fallback disposition is explicit in a new authoritative document', () => {
  const decision = selectWorkdayZone({ runtimeZone: null, detectRuntime: false });
  const document = createEmptyDocument({
    nowMs: 1000,
    workdayZone: decision.zone,
    workdayZoneSource: decision.source,
    workdayZoneFallback: decision.fallback,
    workdayZoneDiagnostic: decision.diagnostic
  });
  assert.equal(document.workdayZone, 'UTC');
  assert.deepEqual(document.workdayZoneDisposition, {
    source: 'UTC_FALLBACK',
    fallback: true,
    diagnostic: 'runtime-iana-zone-unavailable'
  });
});

test('UT-B2-ZONE-004 configured UTC is configuration, not fallback', () => {
  const configured = selectWorkdayZone({
    configuredZone: 'UTC',
    runtimeZone: 'America/New_York',
    detectRuntime: false
  });
  assert.deepEqual(configured, {
    zone: 'UTC',
    source: 'CONFIGURED',
    fallback: false,
    diagnostic: null
  });
  const document = createEmptyDocument({
    nowMs: 1000,
    workdayZone: configured.zone,
    workdayZoneSource: configured.source,
    workdayZoneFallback: configured.fallback
  });
  assert.deepEqual(document.workdayZoneDisposition, {
    source: 'CONFIGURED',
    fallback: false,
    diagnostic: null
  });
});

test('UT-B2-ZONE-005 invalid configured zone falls back with a diagnostic', () => {
  assert.deepEqual(selectWorkdayZone({
    configuredZone: 'Not/A_Zone',
    runtimeZone: null,
    detectRuntime: false
  }), {
    zone: 'UTC',
    source: 'UTC_FALLBACK',
    fallback: true,
    diagnostic: 'configured-iana-zone-unavailable'
  });
});
