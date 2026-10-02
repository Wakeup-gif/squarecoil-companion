'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createEmptyDocument } = require('../../src/data/model');
const { splitInterval } = require('../../src/data/ledger');
const { createFullBackup } = require('../../src/data/data-safety');

const DAY_MS = 86_400_000;
const FIRST_START = Date.parse('2016-01-01T04:30:00Z');
const SOURCE_NOW = Date.parse('2020-01-01T00:00:00Z');
const REQUIRED_PHASES = ['READING', 'CHECKING', 'REVIEW', 'SAVING', 'FINISHED'];

function createSyntheticLargeImport(family, sessionCount = 1200) {
  assert.match(family, /^(chrome|edge)$/);
  assert.ok(Number.isSafeInteger(sessionCount) && sessionCount >= 1000 && sessionCount <= 3000);
  const prefix = `a4-import-perf-${family}`;
  const document = createEmptyDocument({ nowMs: SOURCE_NOW, workdayZone: 'America/New_York', datasetId: prefix });
  const contextIds = Array.from({ length: 30 }, (_, index) => {
    const projectId = String(890000 + index);
    const contextId = `job:${projectId}`;
    document.contexts[contextId] = { contextId, kind: 'job', projectId,
      currentLabel: `Synthetic import job ${projectId}`, shortLabel: projectId, aliases: [],
      createdAtMs: FIRST_START, lastSeenAtMs: SOURCE_NOW, workspaceMembership: 'RECENT',
      archivedAtMs: null, legacyUnattributedMs: 0 };
    return contextId;
  });
  // All source time is finalized, fictional and years before the live fixture.
  // Daily intervals remain globally disjoint; some cross New York midnight.
  for (let index = 0; index < sessionCount; index += 1) {
    const startAtMs = FIRST_START + index * DAY_MS;
    const durationMs = 10_800_000 + index % 97;
    document.ledger.push(...splitInterval({ sessionId: `${prefix}-session-${index}`,
      cycleId: `${prefix}-cycle-${index}`, contextId: contextIds[index % contextIds.length],
      startAtMs, endAtMs: startAtMs + durationMs, workdayZone: document.workdayZone,
      source: 'synthetic-installed-import', certainty: 'VERIFIED', createdAtMs: startAtMs + durationMs }));
  }
  const backup = createFullBackup(document, { backupId: `${prefix}-backup`, exportedAtMs: SOURCE_NOW,
    appVersion: '0.7.1', sourcePlatform: 'synthetic-installed-browser', includeActivity: false });
  const buffer = Buffer.from(`${JSON.stringify(backup)}\n`, 'utf8');
  return { prefix, sessionCount, contextIds, rows: document.ledger, buffer,
    filename: `${prefix}.json`,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex') };
}

function ledgerIdentity(rows) {
  return rows.map(row => ({ segmentId: row.segmentId, sessionId: row.sessionId, cycleId: row.cycleId,
    contextId: row.contextId, startAtMs: row.startAtMs, endAtMs: row.endAtMs,
    durationMs: row.durationMs, localDate: row.localDate, workdayZone: row.workdayZone }))
    .sort((a, b) => a.segmentId.localeCompare(b.segmentId));
}

function ledgerSummary(rows) {
  const contextDayTotals = {};
  for (const row of rows) {
    const key = `${row.contextId}|${row.localDate}|${row.workdayZone}`;
    contextDayTotals[key] = (contextDayTotals[key] || 0) + row.durationMs;
  }
  return { segments: rows.length, sessions: new Set(rows.map(row => row.sessionId)).size,
    totalMs: rows.reduce((total, row) => total + row.durationMs, 0),
    contextDayTotalsSha256: crypto.createHash('sha256')
      .update(JSON.stringify(Object.entries(contextDayTotals).sort(([a], [b]) => a.localeCompare(b)))).digest('hex'),
    ledgerIdentitySha256: crypto.createHash('sha256').update(JSON.stringify(ledgerIdentity(rows))).digest('hex') };
}

function liveIdentity(document) {
  const active = document.timer?.active;
  return { active: active ? { contextId: active.contextId, sessionId: active.sessionId,
    cycleId: active.cycleId, startedAtMs: active.startedAtMs, accrualOwnerToken: active.accrualOwnerToken,
    safetyHold: active.safetyHold || null } : null,
  pending: document.timer?.pending || null, localPause: document.timer?.localPause || null,
  workdayZone: document.workdayZone, preferences: document.dataSafety?.preferences || null };
}

async function installProgressObserver(page, rootId, bindingName) {
  await page.evaluate(({ rootId: id, bindingName: binding }) => {
    const root = document.getElementById(id);
    if (!root) throw new Error('large-import-root-missing');
    const records = [];
    let previous = null;
    const state = { records, fileChanges: [], pickerClicks: [], observer: null, click: null, change: null };
    const capture = () => {
      const status = root.querySelector('[data-sc-data-progress]');
      if (!status) return;
      const fieldset = root.querySelector('fieldset.sc-data-controls');
      const controls = [...(fieldset?.querySelectorAll('button,input') || [])];
      const meter = status.querySelector('[role="progressbar"]');
      const snapshot = { phase: status.dataset.scDataProgress, role: status.getAttribute('role'),
        ariaLive: status.getAttribute('aria-live'), ariaAtomic: status.getAttribute('aria-atomic'),
        text: status.textContent.trim(), fieldsetDisabled: fieldset?.disabled === true,
        controlCount: controls.length, allDataControlsDisabled: controls.length > 0 && controls.every(node => node.matches(':disabled')),
        meter: meter ? { label: meter.getAttribute('aria-label'), min: meter.getAttribute('aria-valuemin'),
          max: meter.getAttribute('aria-valuemax'), value: meter.getAttribute('aria-valuenow'),
          text: meter.getAttribute('aria-valuetext') } : null };
      const signature = JSON.stringify(snapshot);
      if (signature === previous) return;
      previous = signature;
      snapshot.elapsedMs = Math.round(performance.now());
      records.push(snapshot);
      // Binding is a read-only observation channel, never an import API.
      Promise.resolve(window[binding](snapshot)).catch(() => {});
    };
    state.click = event => {
      if (event.target.closest?.('[data-action="pick-file"][data-file-mode="BACKUP_MERGE"]')) {
        state.pickerClicks.push({ trusted: event.isTrusted, elapsedMs: Math.round(performance.now()) });
      }
    };
    state.change = event => {
      if (event.target.matches?.('[data-sc-data-file]')) {
        state.fileChanges.push({ trusted: event.isTrusted, fileCount: event.target.files?.length || 0,
          elapsedMs: Math.round(performance.now()) });
      }
    };
    root.addEventListener('click', state.click, true);
    root.addEventListener('change', state.change, true);
    state.observer = new MutationObserver(capture);
    state.observer.observe(root, { subtree: true, childList: true, attributes: true });
    window.__a4LargeImportObservation = state;
  }, { rootId, bindingName });
}

async function verifyLargeImportJourney({ page, family, rootId, timeoutMs, readDocument,
  nativeMutationCount, captureReviewScreenshot }) {
  const fixture = createSyntheticLargeImport(family);
  const started = Date.now();
  const observed = [];
  const dialogs = [];
  const rounds = [];
  let dialogError = null;
  let acceptReview = true;
  let screenshot = null;
  let screenshotsRequested = false;
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  let ownedDirectory = null;
  const bindingName = '__a4RecordLargeImportProgress';
  const before = await readDocument();
  assert.ok(before?.timer?.active, 'Large import must exercise an existing ACTIVE Companion session');
  assert.ok(fixture.rows.at(-1).endAtMs < before.timer.active.startedAtMs, 'Synthetic history must predate the fixture active interval');
  const beforeLive = liveIdentity(before);
  const nativeBefore = nativeMutationCount();
  const expectedRows = ledgerIdentity(fixture.rows);
  const expectedSummary = ledgerSummary(fixture.rows);
  const expectedCombined = ledgerIdentity([...before.ledger, ...fixture.rows]);
  const evidence = { syntheticOnly: true, fixtureId: 'IMPORT-PERF-001', sessionCount: fixture.sessionCount,
    contextCount: fixture.contextIds.length, fileBytes: fixture.buffer.length, fileSha256: fixture.sha256,
    historicalYears: [new Date(fixture.rows[0].startAtMs).getUTCFullYear(), new Date(fixture.rows.at(-1).endAtMs).getUTCFullYear()],
    baseline: ledgerSummary(before.ledger), expectedImported: expectedSummary, rounds, dialogs, screenshot: null };
  await page.exposeFunction(bindingName, snapshot => observed.push(snapshot));
  await installProgressObserver(page, rootId, bindingName);
  const dialogHandler = async dialog => {
    const record = { type: dialog.type(), message: dialog.message(), accepted: acceptReview,
      elapsedMs: Date.now() - started, progressAtDialog: observed.at(-1) || null };
    dialogs.push(record);
    try {
      assert.equal(dialog.type(), 'confirm', 'Import produced an unexpected browser dialog');
      assert.match(dialog.message(), /^Import \d+ new finalized Segments?\? Duplicate records add no time\.$/);
      assert.equal(record.progressAtDialog?.phase, 'REVIEW', 'Confirmation appeared before the review status was observed');
      if (!screenshotsRequested && captureReviewScreenshot) {
        screenshotsRequested = true;
        // Direct CDP capture does not need renderer JavaScript while the native
        // confirmation dialog is open. No artificial import delay is injected.
        screenshot = await captureReviewScreenshot();
      }
    } catch (error) { dialogError = error; }
    finally {
      try { if (acceptReview && !dialogError) await dialog.accept(); else await dialog.dismiss(); }
      catch (error) { dialogError ||= error; }
    }
  };
  page.on('dialog', dialogHandler);
  async function upload(filePath, expectedTerminal, label, accept = true) {
    acceptReview = accept;
    const roundStarted = Date.now();
    const recordStart = await page.evaluate(() => window.__a4LargeImportObservation.records.length);
    const dialogsBefore = dialogs.length;
    const chooserPromise = page.waitForEvent('filechooser', { timeout: timeoutMs });
    await page.locator(`#${rootId} [data-action="pick-file"][data-file-mode="BACKUP_MERGE"]`).click({ timeout: timeoutMs });
    const chooser = await chooserPromise;
    assert.equal(chooser.isMultiple(), false, 'Backup picker unexpectedly accepts several files at once');
    assert.ok(path.isAbsolute(filePath), 'Synthetic browser import must use a native absolute file path');
    // A path uses Chromium DOM.setFileInputFiles. Buffer payloads inject a
    // synthetic change event and cannot prove the trusted-input contract.
    await chooser.setFiles(filePath);
    await page.waitForFunction(id => {
      const root = document.getElementById(id);
      const phase = root?.querySelector('[data-sc-data-progress]')?.dataset.scDataProgress;
      return ['FINISHED', 'FAILED', 'CANCELED'].includes(phase) && root?.querySelector('fieldset.sc-data-controls')?.disabled === false;
    }, rootId, { timeout: timeoutMs });
    const state = await page.evaluate(() => ({ records: window.__a4LargeImportObservation.records,
      fileChanges: window.__a4LargeImportObservation.fileChanges, pickerClicks: window.__a4LargeImportObservation.pickerClicks }));
    if (dialogError) throw dialogError;
    const progress = state.records.slice(recordStart);
    const phaseOrder = progress.map(row => row.phase).filter((phase, index, phases) => index === 0 || phase !== phases[index - 1]);
    const terminal = state.records.at(-1);
    assert.equal(terminal?.phase, expectedTerminal, `${label}: unexpected terminal import state`);
    assert.ok(progress.length > 0, `${label}: no progress was observed`);
    for (const row of progress) {
      assert.equal(row.role, 'status');
      assert.equal(row.ariaLive, 'polite');
      assert.equal(row.ariaAtomic, 'true');
      if (['READING', 'CHECKING', 'REVIEW', 'SAVING'].includes(row.phase)) {
        assert.ok(row.fieldsetDisabled && row.allDataControlsDisabled, `${label}: data actions remained enabled during ${row.phase}`);
      }
      if (row.meter?.value !== null && row.meter?.value !== undefined) {
        assert.equal(row.phase, 'READING', 'Only measured file reading may display a percentage');
        assert.equal(row.meter.min, '0');
        assert.equal(row.meter.max, '100');
        assert.match(row.meter.text, /^\d+ of \d+ bytes read$/);
        const [loaded, total] = row.meter.text.match(/\d+/g).map(Number);
        assert.ok(total > 0 && loaded >= 0 && loaded <= total);
        assert.equal(Number(row.meter.value), Math.floor(loaded * 100 / total));
      }
    }
    if (expectedTerminal === 'FINISHED') {
      assert.deepEqual(phaseOrder, REQUIRED_PHASES, `${label}: import skipped or reordered its phases`);
      assert.equal(dialogs.length - dialogsBefore, 1, `${label}: duplicate confirmation or commit submission`);
    }
    assert.ok(state.fileChanges.at(-1)?.trusted && state.fileChanges.at(-1).fileCount === 1, 'Import did not use a trusted browser file change');
    assert.ok(state.pickerClicks.at(-1)?.trusted, 'Import did not begin with a trusted picker click');
    const round = { label, terminal: expectedTerminal, durationMs: Date.now() - roundStarted,
      phases: phaseOrder, progress, confirmationCount: dialogs.length - dialogsBefore,
      trustedPicker: state.pickerClicks.at(-1), trustedFileChange: state.fileChanges.at(-1) };
    rounds.push(round);
    return round;
  }
  function assertProtected(document) {
    assert.deepEqual(liveIdentity(document), beforeLive, 'Import changed the active session, pending/pause state, current zone or saved settings');
    assert.equal(nativeMutationCount(), nativeBefore, 'Import attempted a native SquareCoil write');
  }
  try {
    ownedDirectory = fs.mkdtempSync(path.join(temporaryRoot, 'squarecoil-a4-import-'));
    const backupPath = path.join(ownedDirectory, fixture.filename);
    const malformedPath = path.join(ownedDirectory, 'synthetic-malformed-backup.json');
    fs.writeFileSync(backupPath, fixture.buffer);
    fs.writeFileSync(malformedPath, '{not-json', 'utf8');
    await upload(backupPath, 'FINISHED', 'first-large-merge');
    const first = await readDocument();
    assertProtected(first);
    assert.deepEqual(ledgerIdentity(first.ledger), expectedCombined, 'Large import omitted, invented or changed a historical interval');
    const importedRows = first.ledger.filter(row => row.sessionId.startsWith(`${fixture.prefix}-session-`));
    assert.deepEqual(ledgerIdentity(importedRows), expectedRows, 'Imported durations, dates, zones or session identities changed');
    rounds[0].saved = ledgerSummary(first.ledger);
    rounds[0].imported = ledgerSummary(importedRows);
    await upload(backupPath, 'FINISHED', 'duplicate-large-merge');
    const duplicate = await readDocument();
    assertProtected(duplicate);
    assert.deepEqual(ledgerIdentity(duplicate.ledger), ledgerIdentity(first.ledger), 'Repeat import duplicated or changed recorded time');
    rounds[1].saved = ledgerSummary(duplicate.ledger);
    assert.match(dialogs.at(-1).message, /^Import 0 new finalized Segments\?/);
    await upload(malformedPath, 'FAILED', 'malformed-file-fails-closed');
    const failed = await readDocument();
    assertProtected(failed);
    assert.deepEqual(ledgerIdentity(failed.ledger), ledgerIdentity(first.ledger), 'Failed import changed recorded time');
    assert.equal(rounds[2].confirmationCount, 0, 'Malformed input reached commit confirmation');
    await upload(backupPath, 'CANCELED', 'cancel-review-preserves-data', false);
    const canceled = await readDocument();
    assertProtected(canceled);
    assert.deepEqual(ledgerIdentity(canceled.ledger), ledgerIdentity(first.ledger), 'Cancelled review changed recorded time');
    assert.equal(rounds[3].confirmationCount, 1);
    evidence.final = ledgerSummary(canceled.ledger);
    evidence.activeIdentityPreserved = true;
    evidence.nativeMutationCountBeforeAndAfter = [nativeBefore, nativeMutationCount()];
    evidence.screenshot = screenshot;
    evidence.durationMs = Date.now() - started;
    return evidence;
  } catch (error) {
    evidence.durationMs = Date.now() - started;
    evidence.progressObserved = observed;
    evidence.screenshot = screenshot;
    error.details = { ...(error.details || {}), importJourney: evidence };
    throw error;
  } finally {
    page.off('dialog', dialogHandler);
    await page.evaluate(id => {
      const state = window.__a4LargeImportObservation;
      state?.observer?.disconnect();
      const root = document.getElementById(id);
      if (state?.click) root?.removeEventListener('click', state.click, true);
      if (state?.change) root?.removeEventListener('change', state.change, true);
      delete window.__a4LargeImportObservation;
    }, rootId).catch(() => {});
    // The one observer binding expires when this isolated fixture page closes.
    if (ownedDirectory && fs.existsSync(ownedDirectory)) {
      const resolvedDirectory = fs.realpathSync(ownedDirectory);
      const relativeDirectory = path.relative(temporaryRoot, resolvedDirectory);
      assert.equal(resolvedDirectory, path.resolve(ownedDirectory), 'Synthetic import cleanup resolved to a different directory');
      assert.equal(relativeDirectory, path.basename(ownedDirectory), 'Synthetic import cleanup escaped its temporary root');
      assert.ok(relativeDirectory.startsWith('squarecoil-a4-import-'), 'Synthetic import cleanup lost its owned prefix');
      fs.rmSync(resolvedDirectory, { recursive: true, force: true });
    }
  }
}

module.exports = { createSyntheticLargeImport, ledgerIdentity, ledgerSummary, verifyLargeImportJourney };
