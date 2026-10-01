'use strict';

const { DATA_SAFETY_SCHEMA_VERSION, deepClone, isRecord } = require('../data/model');

const PREFERENCE_SCHEMA_VERSION = 3;
const COMPATIBLE_PREFERENCE_SCHEMA_VERSIONS = new Set([1, 2, PREFERENCE_SCHEMA_VERSION]);
const DEFAULT_PREFERENCES = Object.freeze({
  timerAppearance: 'LIGHT',
  panelFinish: 'SOLID',
  websiteTheme: 'ORIGINAL',
  cinematicBackground: 'NONE',
  dashboardProfile: 'OFF',
  dashboardEnabled: false,
  dashboardAppearance: 'SITE',
  yellowMinutes: 60,
  orangeMinutes: 120,
  redMinutes: 240
});
const PREFERENCE_COMMANDS = Object.freeze({
  INITIALIZE: 'PREFERENCES_INITIALIZE',
  COMMIT: 'PREFERENCES_COMMIT'
});
const PREFERENCE_COMMAND_TYPES = new Set(Object.values(PREFERENCE_COMMANDS));
const VALUE_KEYS = Object.freeze(Object.keys(DEFAULT_PREFERENCES));

function cinematicBackgroundForTheme(websiteTheme) {
  return ['SLEEK_DARK', 'LIGHT_GLASS'].includes(websiteTheme) ? 'CINEMATIC' : 'NONE';
}

function enumValue(value, allowed, aliases = {}) {
  const key = String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  const resolved = aliases[key] || key;
  return allowed.includes(resolved) ? resolved : null;
}

function integer(value) {
  const parsed = typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : value;
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function first(source, keys) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}

function preferenceCandidates(raw) {
  const source = isRecord(raw) ? raw : {};
  const nested = isRecord(source.settings) ? source.settings : {};
  const timerAppearance = enumValue(first(source, ['timerAppearance', 'themePreference', 'protoUiTheme', 'theme']) ??
    first(nested, ['timerAppearance', 'themePreference', 'protoUiTheme', 'theme']),
    ['LIGHT', 'DARK', 'AUTO']);
  const panelFinish = enumValue(first(source, ['panelFinish', 'timerSurface', 'protoUiSurface', 'surface']) ??
    first(nested, ['panelFinish', 'timerSurface', 'protoUiSurface', 'surface']),
    ['SOLID', 'GLASS'], { GLASS_BLUR: 'GLASS', BLUR: 'GLASS' });
  const websiteTheme = enumValue(first(source, ['websiteTheme', 'squareCoilTheme']) ?? first(nested, ['websiteTheme', 'squareCoilTheme']),
    ['ORIGINAL', 'LIGHT_GLASS', 'REFINED_LIGHT', 'SLEEK_DARK'], {
      LIGHT: 'REFINED_LIGHT',
      DARK: 'SLEEK_DARK',
      DARK_GLASS: 'SLEEK_DARK',
      REFINED: 'REFINED_LIGHT',
      SLEEK: 'SLEEK_DARK'
    });
  const cinematicBackground = enumValue(first(source, ['cinematicBackground']) ?? first(nested, ['cinematicBackground']), ['NONE', 'CINEMATIC'],
    { OFF: 'NONE', ON: 'CINEMATIC' });
  const dashboardProfile = enumValue(first(source, ['dashboardProfile']) ?? first(nested, ['dashboardProfile']), ['OFF', 'ON']);
  const dashboardValue = first(source, ['dashboardEnabled']) ?? first(nested, ['dashboardEnabled']);
  const dashboardEnabled = typeof dashboardValue === 'boolean' ? dashboardValue : null;
  const dashboardAppearance = enumValue(first(source, ['dashboardAppearance']) ?? first(nested, ['dashboardAppearance']), ['SITE', 'LIGHT', 'DARK']);
  const yellowMinutes = integer(first(source, ['yellowMinutes', 'timerYellowMinutes', 'yellow']) ?? nested.yellow);
  const orangeMinutes = integer(first(source, ['orangeMinutes', 'timerOrangeMinutes', 'orange']) ?? nested.orange);
  const redMinutes = integer(first(source, ['redMinutes', 'timerRedMinutes', 'red']) ?? nested.red);
  return { timerAppearance, panelFinish, websiteTheme, cinematicBackground, dashboardProfile, dashboardEnabled, dashboardAppearance,
    yellowMinutes, orangeMinutes, redMinutes };
}

function validLimits(values) {
  return Number.isSafeInteger(values.yellowMinutes) && Number.isSafeInteger(values.orangeMinutes) &&
    Number.isSafeInteger(values.redMinutes) && values.yellowMinutes >= 1 &&
    values.yellowMinutes <= values.orangeMinutes && values.orangeMinutes <= values.redMinutes;
}

function normalizePreferenceSnapshot(raw, options = {}) {
  const source = isRecord(raw) ? raw : {};
  const fallback = isRecord(options.fallback) ? options.fallback : DEFAULT_PREFERENCES;
  const candidates = preferenceCandidates(source);
  const limits = validLimits(candidates) ? candidates : fallback;
  const websiteTheme = candidates.websiteTheme || fallback.websiteTheme || DEFAULT_PREFERENCES.websiteTheme;
  const glassTheme = ['SLEEK_DARK', 'LIGHT_GLASS'].includes(websiteTheme);
  const storedVersion = source.preferencesSchemaVersion ?? source.schemaVersion;
  // v1/v2 Glass stored a derived cinematic value. Preserve that existing
  // behavior during migration, while v3 can remember a user's explicit Off.
  const requestedBackground = storedVersion === PREFERENCE_SCHEMA_VERSION
    ? (candidates.cinematicBackground || fallback.cinematicBackground || DEFAULT_PREFERENCES.cinematicBackground)
    : cinematicBackgroundForTheme(websiteTheme);
  const values = {
    timerAppearance: candidates.timerAppearance || fallback.timerAppearance || DEFAULT_PREFERENCES.timerAppearance,
    panelFinish: candidates.panelFinish || fallback.panelFinish || DEFAULT_PREFERENCES.panelFinish,
    websiteTheme,
    cinematicBackground: glassTheme ? requestedBackground : 'NONE',
    dashboardProfile: candidates.dashboardProfile || fallback.dashboardProfile || DEFAULT_PREFERENCES.dashboardProfile,
    dashboardEnabled: candidates.dashboardEnabled ?? fallback.dashboardEnabled ?? DEFAULT_PREFERENCES.dashboardEnabled,
    dashboardAppearance: candidates.dashboardAppearance || fallback.dashboardAppearance || DEFAULT_PREFERENCES.dashboardAppearance,
    yellowMinutes: limits.yellowMinutes ?? DEFAULT_PREFERENCES.yellowMinutes,
    orangeMinutes: limits.orangeMinutes ?? DEFAULT_PREFERENCES.orangeMinutes,
    redMinutes: limits.redMinutes ?? DEFAULT_PREFERENCES.redMinutes
  };
  const initialized = COMPATIBLE_PREFERENCE_SCHEMA_VERSIONS.has(source.preferencesSchemaVersion) ||
    (COMPATIBLE_PREFERENCE_SCHEMA_VERSIONS.has(source.schemaVersion) && source.initialized === true);
  const preferenceRevision = initialized && Number.isSafeInteger(source.preferenceRevision) && source.preferenceRevision >= 0
    ? source.preferenceRevision : 0;
  return Object.freeze({
    schemaVersion: PREFERENCE_SCHEMA_VERSION,
    initialized,
    preferenceRevision,
    ...values
  });
}

function validatePreferencePatch(patch) {
  if (!isRecord(patch)) throw new Error('preference-patch-invalid');
  const keys = Object.keys(patch);
  if (!keys.length || keys.some(key => !VALUE_KEYS.includes(key))) throw new Error('preference-patch-field-unsupported');
  const result = {};
  for (const key of keys) {
    const candidate = preferenceCandidates({ [key]: patch[key] })[key];
    if (candidate === null) throw new Error(`preference-value-invalid:${key}`);
    result[key] = candidate;
  }
  const limitKeys = ['yellowMinutes', 'orangeMinutes', 'redMinutes'];
  if (limitKeys.some(key => Object.hasOwn(result, key)) && !limitKeys.every(key => Object.hasOwn(result, key))) {
    throw new Error('preference-limits-batch-required');
  }
  if (limitKeys.every(key => Object.hasOwn(result, key)) && !validLimits(result)) {
    throw new Error('preference-limits-order-invalid');
  }
  return Object.freeze(result);
}

function mergeLegacyPreferences(current, legacy) {
  const candidates = preferenceCandidates(legacy);
  const merged = { ...current };
  for (const key of ['timerAppearance', 'panelFinish', 'websiteTheme']) {
    if (candidates[key] !== null) merged[key] = candidates[key];
  }
  if (validLimits(candidates)) {
    merged.yellowMinutes = candidates.yellowMinutes;
    merged.orangeMinutes = candidates.orangeMinutes;
    merged.redMinutes = candidates.redMinutes;
  }
  return merged;
}

function preferenceStorage(snapshot, revision = snapshot.preferenceRevision) {
  const cinematicBackground = ['SLEEK_DARK', 'LIGHT_GLASS'].includes(snapshot.websiteTheme) &&
    snapshot.cinematicBackground === 'CINEMATIC' ? 'CINEMATIC' : 'NONE';
  return {
    preferencesSchemaVersion: PREFERENCE_SCHEMA_VERSION,
    preferenceRevision: revision,
    timerAppearance: snapshot.timerAppearance,
    panelFinish: snapshot.panelFinish,
    websiteTheme: snapshot.websiteTheme,
    cinematicBackground,
    dashboardProfile: snapshot.dashboardProfile || DEFAULT_PREFERENCES.dashboardProfile,
    dashboardEnabled: snapshot.dashboardEnabled === true,
    dashboardAppearance: snapshot.dashboardAppearance || DEFAULT_PREFERENCES.dashboardAppearance,
    yellowMinutes: snapshot.yellowMinutes,
    orangeMinutes: snapshot.orangeMinutes,
    redMinutes: snapshot.redMinutes
  };
}

function ensurePreferenceContainer(document, options = {}) {
  if (!isRecord(document.dataSafety)) {
    document.dataSafety = {
      schemaVersion: DATA_SAFETY_SCHEMA_VERSION,
      datasetId: String(options.datasetId || `dataset-${document.updatedAtMs}`),
      workspace: { order: [], hiddenContextIds: [] },
      preferences: {},
      activityLog: [],
      legacyBalanceLineages: {},
      lastMutation: null
    };
  }
  if (!isRecord(document.dataSafety.preferences)) document.dataSafety.preferences = {};
  return document.dataSafety.preferences;
}

function applyPreferenceCommand(document, command, options = {}) {
  if (!isRecord(command) || !PREFERENCE_COMMAND_TYPES.has(command.type)) throw new Error('preference-command-invalid');
  const raw = ensurePreferenceContainer(document, options);
  const current = normalizePreferenceSnapshot(raw);
  if (!Number.isSafeInteger(command.expectedPreferenceRevision) || command.expectedPreferenceRevision !== current.preferenceRevision) {
    throw new Error('preference-revision-conflict');
  }
  if (command.type === PREFERENCE_COMMANDS.INITIALIZE && current.initialized) {
    throw new Error('preferences-already-initialized');
  }
  let next = { ...current };
  if (command.type === PREFERENCE_COMMANDS.INITIALIZE) {
    next = mergeLegacyPreferences(next, command.legacyPreferences);
    // Older Glass choices always included the photo. Keep that behavior when
    // their legacy settings first enter the canonical preference store.
    next.cinematicBackground = cinematicBackgroundForTheme(next.websiteTheme);
  }
  else {
    const patch = validatePreferencePatch(command.patch);
    Object.assign(next, patch);
    if (Object.hasOwn(patch, 'websiteTheme') && !Object.hasOwn(patch, 'cinematicBackground')) {
      if (!['SLEEK_DARK', 'LIGHT_GLASS'].includes(next.websiteTheme)) next.cinematicBackground = 'NONE';
      else if (!['SLEEK_DARK', 'LIGHT_GLASS'].includes(current.websiteTheme)) next.cinematicBackground = 'CINEMATIC';
    }
    if (next.cinematicBackground === 'CINEMATIC' && !['SLEEK_DARK', 'LIGHT_GLASS'].includes(next.websiteTheme)) {
      throw new Error('cinematic-background-glass-required');
    }
  }
  const revision = current.preferenceRevision + 1;
  document.dataSafety.preferences = preferenceStorage(next, revision);
  return Object.freeze({
    command: command.type,
    preferences: deepClone(normalizePreferenceSnapshot(document.dataSafety.preferences))
  });
}

function restoredPreferenceStorage(currentRaw, incomingRaw) {
  const current = normalizePreferenceSnapshot(currentRaw);
  const incoming = normalizePreferenceSnapshot(incomingRaw, { fallback: current });
  return preferenceStorage(incoming, current.preferenceRevision + 1);
}

module.exports = {
  PREFERENCE_SCHEMA_VERSION,
  DEFAULT_PREFERENCES,
  PREFERENCE_COMMANDS,
  PREFERENCE_COMMAND_TYPES,
  VALUE_KEYS,
  validLimits,
  cinematicBackgroundForTheme,
  preferenceCandidates,
  normalizePreferenceSnapshot,
  validatePreferencePatch,
  preferenceStorage,
  applyPreferenceCommand,
  restoredPreferenceStorage
};
