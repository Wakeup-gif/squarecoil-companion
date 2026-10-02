'use strict';

const MIGRATION_SCHEMA_VERSION = 1;
const V07_MIGRATION_MARKER_ID = 'squarecoil-v07-localstorage-v1';
const V07_MIGRATION_VERSION = 1;
const V07_MIGRATION_SOURCE_SCHEMA = 'v0.7-localstorage';
const LEGACY_SOURCE_KEYS = Object.freeze({
  CURRENT: 'ussign-squarecoil-job-timer-v1',
  ARCHIVE: 'ussign-squarecoil-job-timer-archive-v1',
  ACTIVITY: 'ussign-squarecoil-job-timer-activity-v1'
});

module.exports = {
  MIGRATION_SCHEMA_VERSION,
  V07_MIGRATION_MARKER_ID,
  V07_MIGRATION_VERSION,
  V07_MIGRATION_SOURCE_SCHEMA,
  LEGACY_SOURCE_KEYS
};
