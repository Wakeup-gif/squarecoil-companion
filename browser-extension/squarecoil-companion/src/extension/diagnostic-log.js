'use strict';

// This is a local, deliberately small event history. Never accept a message,
// exception, URL, identifier, or arbitrary detail as an event payload.
const STORAGE_KEY = 'scCompanionDiagnosticLogV1';
const SCHEMA_VERSION = 1;
const MAX_ENTRIES = 200;
const MAX_AGE_DAYS = 30;
const MAX_BYTES = 65_536;
const MAX_AGE_MS = MAX_AGE_DAYS * 24 * 60 * 60 * 1_000;
const DEDUPE_MS = 5 * 60 * 1_000;
const RETENTION = Object.freeze({ maxEntries: MAX_ENTRIES, maxAgeDays: MAX_AGE_DAYS, maxBytes: MAX_BYTES });
const EVENT_CODES = Object.freeze({
  WORKER_STARTED: Object.freeze({ area: 'LIFECYCLE', severity: 'info' }),
  EXTENSION_INSTALLED: Object.freeze({ area: 'LIFECYCLE', severity: 'info' }),
  EXTENSION_UPDATED: Object.freeze({ area: 'LIFECYCLE', severity: 'info' }),
  COMPANION_READY: Object.freeze({ area: 'LIFECYCLE', severity: 'info' }),
  COMPANION_LIMITED: Object.freeze({ area: 'LIFECYCLE', severity: 'warning' }),
  COMPANION_FAILED: Object.freeze({ area: 'LIFECYCLE', severity: 'error' }),
  COMPANION_ENABLED: Object.freeze({ area: 'LIFECYCLE', severity: 'info' }),
  COMPANION_DISABLED: Object.freeze({ area: 'LIFECYCLE', severity: 'info' }),
  NATIVE_CLOCK_OBSERVED: Object.freeze({ area: 'CLOCK', severity: 'info' }),
  NATIVE_CLOCK_FORWARD_FAILED: Object.freeze({ area: 'CLOCK', severity: 'warning' }),
  WALLPAPER_READY: Object.freeze({ area: 'APPEARANCE', severity: 'info' }),
  WALLPAPER_FALLBACK: Object.freeze({ area: 'APPEARANCE', severity: 'warning' }),
  WALLPAPER_FAILED: Object.freeze({ area: 'APPEARANCE', severity: 'warning' }),
  WALLPAPER_CLEARED: Object.freeze({ area: 'APPEARANCE', severity: 'info' })
});

function createDiagnosticLog(options = {}) {
  const storage = options.storage;
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  let queue = Promise.resolve();

  function timestamp() {
    const value = now();
    return Number.isSafeInteger(value) && value >= 0 ? value : Date.now();
  }

  function serialized(task) {
    const run = queue.then(task, task);
    queue = run.then(() => undefined, () => undefined);
    return run;
  }

  function cleanEntries(raw, atMs) {
    const supplied = raw?.schemaVersion === SCHEMA_VERSION && Array.isArray(raw.entries)
      ? raw.entries.slice(-1_000) : [];
    const entries = [];
    for (const entry of supplied) {
      const details = entry && typeof entry.code === 'string' && Object.prototype.hasOwnProperty.call(EVENT_CODES, entry.code)
        ? EVENT_CODES[entry.code] : null;
      if (!details || !Number.isSafeInteger(entry.atMs) || entry.atMs < atMs - MAX_AGE_MS || entry.atMs > atMs) continue;
      entries.push({ atMs: entry.atMs, code: entry.code, area: details.area, severity: details.severity });
    }
    entries.sort((left, right) => left.atMs - right.atMs);
    if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
    while (entries.length && JSON.stringify({ schemaVersion: SCHEMA_VERSION, entries }).length > MAX_BYTES) entries.shift();
    return entries;
  }

  async function load(atMs) {
    const stored = await storage.get(STORAGE_KEY);
    const raw = stored?.[STORAGE_KEY];
    return { raw, entries: cleanEntries(raw, atMs) };
  }

  function envelope(entries) { return { schemaVersion: SCHEMA_VERSION, entries }; }

  function record(code) {
    if (typeof code !== 'string' || !Object.prototype.hasOwnProperty.call(EVENT_CODES, code)) return Promise.resolve(false);
    return serialized(async () => {
      if (!storage?.get || !storage?.set) return false;
      try {
        const atMs = timestamp();
        const { entries } = await load(atMs);
        const previous = entries[entries.length - 1];
        if (previous?.code === code && atMs - previous.atMs < DEDUPE_MS) return true;
        const details = EVENT_CODES[code];
        entries.push({ atMs, code, area: details.area, severity: details.severity });
        while (entries.length > MAX_ENTRIES || JSON.stringify(envelope(entries)).length > MAX_BYTES) entries.shift();
        await storage.set({ [STORAGE_KEY]: envelope(entries) });
        return true;
      } catch (_) { return false; }
    });
  }

  function read() {
    return serialized(async () => {
      const exportedAtMs = timestamp();
      const result = { ok: false, schemaVersion: SCHEMA_VERSION, exportedAtMs,
        retention: RETENTION, entries: [] };
      if (!storage?.get) return result;
      try {
        const { raw, entries } = await load(exportedAtMs);
        if (storage?.set && JSON.stringify(raw) !== JSON.stringify(envelope(entries))) {
          try { await storage.set({ [STORAGE_KEY]: envelope(entries) }); } catch (_) {}
        }
        return { ...result, ok: true, entries };
      } catch (_) { return result; }
    });
  }

  function clear() {
    return serialized(async () => {
      if (!storage?.set) return false;
      try {
        await storage.set({ [STORAGE_KEY]: envelope([]) });
        return true;
      } catch (_) { return false; }
    });
  }

  return Object.freeze({ record, read, clear });
}

module.exports = { STORAGE_KEY, SCHEMA_VERSION, RETENTION, EVENT_CODES, createDiagnosticLog };
