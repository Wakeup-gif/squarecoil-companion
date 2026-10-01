'use strict';

const HEALTH_MESSAGE = 'SC_COMPANION_GET_HEALTH';
const ENABLE_MESSAGE = 'SC_COMPANION_SET_ENABLED';
const RETRY_TEARDOWN_MESSAGE = 'SC_COMPANION_RETRY_TEARDOWN';
const POPUP_SUMMARY_MESSAGE = 'SC_COMPANION_GET_POPUP_SUMMARY';
const GET_APPEARANCE_MESSAGE = 'SC_COMPANION_GET_APPEARANCE';
const SET_APPEARANCE_MESSAGE = 'SC_COMPANION_SET_APPEARANCE';
const BING_ORIGIN_PATTERN = 'https://www.bing.com/*';
const SETTLEMENT_RETRY_DELAYS_MS = Object.freeze([50, 150, 450]);
const WEBSITE_THEMES = new Set(['ORIGINAL', 'SLEEK_DARK', 'LIGHT_GLASS', 'REFINED_LIGHT']);
const GLASS_THEMES = new Set(['SLEEK_DARK', 'LIGHT_GLASS']);
let operationEpoch = 0;
let settingQueue = Promise.resolve();
let appearanceEpoch = 0;
let appearanceQueue = Promise.resolve();
let appearanceSnapshot = null;
let panelQueue = Promise.resolve();
let panelVisible = true;

async function activeTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs?.[0]?.id ?? null;
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = String(value ?? '');
}

function setHidden(id, hidden) {
  const node = document.getElementById(id);
  if (node) node.hidden = Boolean(hidden);
}

function safeDiagnosticToken(value, fallback) {
  const token = String(value ?? '').trim();
  return /^[A-Za-z0-9_.:/+-]{1,160}$/.test(token) ? token : fallback;
}

function isSettlementStartupResult(result) {
  const reason = result?.health?.reason || result?.reason || '';
  const state = result?.health?.state;
  if (state === 'BOOTING' || state === 'RECOVERING') return true;
  return state === 'DEGRADED' && [
    'coordination-not-implemented-b1',
    'b2-settlement-required',
    'coordination-unavailable',
    'coordination-not-current',
    'settlement-runtime-unavailable',
    'settlement-refresh-in-progress',
    'settlement-health-timeout',
    'settlement-worker-generation-mismatch',
    'settlement-worker-generation-changed',
    'authority-transport-timeout',
    'settlement-authority-refresh-failed',
    'trusted-core-not-initialized',
    'trusted-core-authority-mismatch',
    'trusted-core-not-current',
    'migration-preflight-incomplete',
    'bridge-not-initialized',
    'bridge-authority-mismatch',
    'bridge-initial-observation-missing'
  ].includes(reason);
}

function friendlyHealth(result) {
  const health = result?.health || {};
  const reason = String(health.reason || result?.reason || '');
  if (health.mode === 'DISABLED' || reason === 'user-disabled') {
    return { label: 'Offline', tone: 'offline', message: 'Companion is turned off for this browser.' };
  }
  if (result?.classification === 'NO_ACTIVE_TAB') {
    return { label: 'Setup required', tone: 'setup', message: 'Open a SquareCoil tab to connect Companion.' };
  }
  if (result?.ok === true && result?.ready === true && result?.classification === 'HEALTHY_SAME_BUILD' && health.state === 'READY') {
    return { label: 'Ready', tone: 'ready', message: 'Companion is connected and ready.' };
  }
  if (health.state === 'BOOTING' || health.state === 'RECOVERING' || isSettlementStartupResult(result)) {
    return { label: 'Working', tone: 'working', message: 'Companion is connecting to this page.' };
  }
  if (health.state === 'FAILED' || result?.reloadRequired) {
    return { label: 'Needs attention', tone: 'attention', message: 'Reload the SquareCoil tab, then refresh status.' };
  }
  if (health.state === 'DEGRADED' || result?.ok === false) {
    return { label: 'Limited', tone: 'limited', message: 'Some Companion features are not available on this page.' };
  }
  return { label: 'Setup required', tone: 'setup', message: 'Open a supported SquareCoil page to finish setup.' };
}

function formatDuration(value) {
  const totalSeconds = Math.max(0, Math.floor((Number(value) || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function renderSummary(summary) {
  const current = summary?.ok === true ? summary.current : null;
  setHidden('summaryCard', !current);
  setHidden('emptySummary', Boolean(current));
  if (!current) {
    setText('emptySummaryText', summary?.ok === true
      ? 'Your saved work is still available in Companion.'
      : 'Open a SquareCoil page to see current work.');
    return;
  }
  setText('summaryLabel', current.label || 'Current work');
  setText('summaryToday', formatDuration(current.todayMs));
  setText('summarySession', formatDuration(current.sessionMs));
  setText('summaryState', summary.status === 'WORKING' ? 'Working' : 'Ready');
}

async function renderWallpaperPermission() {
  const card = document.querySelector?.('.permission-card') || null;
  let granted = false;
  try { granted = await chrome.permissions?.contains?.({ origins: [BING_ORIGIN_PATTERN] }) === true; } catch (_) {}
  if (card) card.dataset.granted = granted ? 'true' : 'false';
  setText('wallpaperPermission', granted
    ? 'Bing photos are available when the switch is on.'
    : 'Bing photos are unavailable in this browser. Glass uses a built-in background.');
  return granted;
}

function showAppearanceUnavailable(message = 'Open a SquareCoil page to change its look.') {
  appearanceSnapshot = null;
  const theme = document.getElementById('websiteTheme');
  const photo = document.getElementById('bingPhoto');
  if (theme) theme.disabled = true;
  if (photo) photo.disabled = true;
  setText('appearanceMessage', message);
}

function renderAppearance(result) {
  const preferences = result?.preferences;
  if (result?.ok !== true || !WEBSITE_THEMES.has(preferences?.websiteTheme) ||
      !['NONE', 'CINEMATIC'].includes(preferences?.cinematicBackground) ||
      !Number.isSafeInteger(preferences?.preferenceRevision) || preferences.preferenceRevision < 0) {
    showAppearanceUnavailable('Theme settings are unavailable on this page. Try Refresh.');
    return false;
  }
  appearanceSnapshot = {
    websiteTheme: preferences.websiteTheme,
    cinematicBackground: preferences.cinematicBackground,
    preferenceRevision: preferences.preferenceRevision
  };
  const theme = document.getElementById('websiteTheme');
  const photo = document.getElementById('bingPhoto');
  if (theme) {
    theme.value = preferences.websiteTheme;
    theme.disabled = false;
  }
  if (photo) {
    photo.checked = preferences.cinematicBackground === 'CINEMATIC';
    photo.disabled = !GLASS_THEMES.has(preferences.websiteTheme);
  }
  setText('appearanceMessage', GLASS_THEMES.has(preferences.websiteTheme)
    ? 'Turn the photo off to keep the Glass look with a simple background.'
    : 'Choose Dark Glass or Light Glass to use a photo background.');
  return true;
}

async function refreshAppearance() {
  if (!document.getElementById('websiteTheme')) return;
  const epoch = ++appearanceEpoch;
  await appearanceQueue;
  if (epoch !== appearanceEpoch) return;
  const tabId = await activeTabId();
  if (!Number.isInteger(tabId) || typeof chrome.tabs?.sendMessage !== 'function') {
    showAppearanceUnavailable();
    return;
  }
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: GET_APPEARANCE_MESSAGE });
    if (epoch === appearanceEpoch) renderAppearance(response);
  } catch (_) {
    if (epoch === appearanceEpoch) showAppearanceUnavailable('Theme settings are unavailable on this page. Try Refresh.');
  }
}

function setAppearance(patch) {
  const epoch = ++appearanceEpoch;
  const task = appearanceQueue.then(async () => {
    if (!appearanceSnapshot) return showAppearanceUnavailable('Theme settings are unavailable. Try Refresh.');
    const tabId = await activeTabId();
    if (!Number.isInteger(tabId) || typeof chrome.tabs?.sendMessage !== 'function') return showAppearanceUnavailable();
    const theme = document.getElementById('websiteTheme');
    const photo = document.getElementById('bingPhoto');
    if (theme) theme.disabled = true;
    if (photo) photo.disabled = true;
    setText('appearanceMessage', 'Saving your choice…');
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: SET_APPEARANCE_MESSAGE,
        patch,
        expectedPreferenceRevision: appearanceSnapshot.preferenceRevision
      });
      if (epoch === appearanceEpoch) renderAppearance(response);
      else if (response?.ok === true && response?.preferences) appearanceSnapshot = response.preferences;
    } catch (_) {
      if (epoch === appearanceEpoch) showAppearanceUnavailable('Could not save your choice. Try Refresh.');
    }
  });
  appearanceQueue = task.catch(() => {});
  return task;
}

function setPanelVisible(visible) {
  const requested = visible === true;
  const task = panelQueue.then(async () => {
    const previous = panelVisible;
    try {
      await chrome.storage.local.set({ companionPanelVisible: requested });
      panelVisible = requested;
      setHidden('panelMessage', true);
    } catch (_) {
      panelVisible = previous;
      const toggle = document.getElementById('panelVisible');
      if (toggle) toggle.checked = previous;
      setText('panelMessage', 'Could not change the panel. Please try again.');
      setHidden('panelMessage', false);
    }
  });
  panelQueue = task.catch(() => {});
  return task;
}

async function loadSummary(tabId, epoch) {
  if (!Number.isInteger(tabId) || typeof chrome.tabs?.sendMessage !== 'function') return;
  try {
    const summary = await chrome.tabs.sendMessage(tabId, { type: POPUP_SUMMARY_MESSAGE });
    if (epoch === operationEpoch) renderSummary(summary);
  } catch (_) {
    if (epoch === operationEpoch) renderSummary(null);
  }
}

function renderHealth(result) {
  setText('classification', safeDiagnosticToken(result?.classification, 'UNKNOWN'));
  const health = result?.health || {};
  const cleanupRetryAvailable = health.reason === 'teardown-incomplete';
  let reason = health.reason || result?.reason || '';
  if (result?.reloadRequired && !cleanupRetryAvailable) {
    reason = reason || 'reload-required';
  }
  setText('lifecycle', safeDiagnosticToken(health.state, 'UNAVAILABLE'));
  setText('reason', safeDiagnosticToken(reason, 'unavailable'));
  setText('runtimeId', safeDiagnosticToken(health.runtimeInstanceId, '—'));
  const attention = Boolean(!result || result.ok === false || result.reloadRequired || health.state !== 'READY');
  document.body.dataset.health = attention ? 'attention' : 'ok';
  const friendly = friendlyHealth(result);
  document.body.dataset.status = friendly.tone;
  setText('friendlyStatus', friendly.label);
  setText('friendlyMessage', friendly.message);
  setText('statusIcon', ({ ready: '✓', working: '↻', limited: '!', setup: '•', attention: '!', offline: '–' })[friendly.tone] || '•');
  const retry = document.getElementById('retryCleanup');
  if (retry) retry.hidden = !cleanupRetryAvailable;
  const startFresh = document.getElementById('startFresh');
  if (startFresh) startFresh.hidden = result?.restartAvailable !== true;
}

async function settledHealthAfterEnable(tabId, initialResult, epoch) {
  let result = initialResult;
  // Command responses never establish READY. Confirm the dedicated health path
  // before rendering even if an older worker returns raw READY.
  if (result?.ready === true && epoch === operationEpoch) {
    result = await chrome.runtime.sendMessage({ type: HEALTH_MESSAGE, tabId });
  }
  for (const delayMs of SETTLEMENT_RETRY_DELAYS_MS) {
    if (!isSettlementStartupResult(result) || epoch !== operationEpoch) break;
    await new Promise(resolve => setTimeout(resolve, delayMs));
    if (epoch !== operationEpoch) break;
    result = await chrome.runtime.sendMessage({ type: HEALTH_MESSAGE, tabId });
  }
  return result;
}

async function refreshHealth() {
  const epoch = ++operationEpoch;
  await settingQueue;
  const tabId = await activeTabId();
  if (!Number.isInteger(tabId)) {
    if (epoch === operationEpoch) {
      renderHealth({ ok: false, classification: 'NO_ACTIVE_TAB', reason: 'Open a SquareCoil tab to inspect lifecycle health.' });
      renderSummary(null);
    }
    return;
  }
  try {
    let result = await chrome.runtime.sendMessage({ type: HEALTH_MESSAGE, tabId });
    result = await settledHealthAfterEnable(tabId, result, epoch);
    if (epoch === operationEpoch) {
      renderHealth(result);
      await loadSummary(tabId, epoch);
    }
  } catch (error) {
    if (epoch === operationEpoch) renderHealth({ ok: false, classification: 'ERROR', reason: String(error?.message || error) });
  }
}

function setEnabled(enabled) {
  const epoch = ++operationEpoch;
  const task = settingQueue.then(async () => {
    try {
      const tabId = await activeTabId();
      await chrome.storage.local.set({ timerEnabled: Boolean(enabled) });
      let result = await chrome.runtime.sendMessage({ type: ENABLE_MESSAGE, enabled: Boolean(enabled), tabId });
      if (enabled) result = await settledHealthAfterEnable(tabId, result, epoch);
      if (epoch === operationEpoch) {
        renderHealth(result);
        if (enabled) await loadSummary(tabId, epoch); else renderSummary(null);
      }
    } catch (error) {
      if (epoch === operationEpoch) renderHealth({ ok: false, classification: 'ERROR', reason: String(error?.message || error) });
    }
  });
  settingQueue = task.catch(() => {});
  return task;
}

function sendToActiveTab(type) {
  const epoch = ++operationEpoch;
  const task = settingQueue.then(async () => {
    const tabId = await activeTabId();
    if (!Number.isInteger(tabId)) {
      if (epoch === operationEpoch) renderHealth({ ok: false, classification: 'NO_ACTIVE_TAB', reason: 'Open a SquareCoil tab to inspect lifecycle health.' });
      return;
    }
    try {
      const result = await chrome.runtime.sendMessage({ type, tabId });
      if (epoch === operationEpoch) renderHealth(result);
    } catch (error) {
      if (epoch === operationEpoch) renderHealth({ ok: false, classification: 'ERROR', reason: String(error?.message || error) });
    }
  });
  settingQueue = task.catch(() => {});
  return task;
}

document.addEventListener('DOMContentLoaded', async () => {
  const manifest = chrome.runtime.getManifest();
  setText('version', `v${manifest.version}`);
  setText('stage', 'Your work at a glance');

  const settings = await chrome.storage.local.get({ timerEnabled: true, companionPanelVisible: true });
  const toggle = document.getElementById('enabled');
  if (toggle) {
    toggle.checked = settings.timerEnabled !== false;
    toggle.addEventListener('change', () => setEnabled(toggle.checked));
  }

  panelVisible = settings.companionPanelVisible !== false;
  const panelToggle = document.getElementById('panelVisible');
  if (panelToggle) {
    panelToggle.checked = panelVisible;
    panelToggle.addEventListener('change', () => setPanelVisible(panelToggle.checked));
  }
  const theme = document.getElementById('websiteTheme');
  if (theme) theme.addEventListener('change', () => {
    if (WEBSITE_THEMES.has(theme.value)) void setAppearance({ websiteTheme: theme.value });
  });
  const photo = document.getElementById('bingPhoto');
  if (photo) photo.addEventListener('change', () => {
    if (!appearanceSnapshot || !GLASS_THEMES.has(appearanceSnapshot.websiteTheme)) return;
    void setAppearance({ cinematicBackground: photo.checked ? 'CINEMATIC' : 'NONE' });
  });

  document.getElementById('refresh')?.addEventListener('click', () => Promise.all([refreshHealth(), refreshAppearance(), renderWallpaperPermission()]));
  document.getElementById('retryCleanup')?.addEventListener('click', () => sendToActiveTab(RETRY_TEARDOWN_MESSAGE));
  document.getElementById('startFresh')?.addEventListener('click', () => {
    const currentToggle = document.getElementById('enabled');
    if (currentToggle) currentToggle.checked = true;
    setEnabled(true);
  });
  document.getElementById('copyDiagnostics')?.addEventListener('click', async () => {
    const values = [
      'SquareCoil Companion technical details',
      `Version: ${document.getElementById('version')?.textContent || 'unknown'}`,
      `Status: ${document.getElementById('friendlyStatus')?.textContent || 'unknown'}`,
      `Probe: ${document.getElementById('classification')?.textContent || 'unknown'}`,
      `Lifecycle: ${document.getElementById('lifecycle')?.textContent || 'unknown'}`,
      `Reason: ${document.getElementById('reason')?.textContent || 'unknown'}`,
      `Runtime: ${document.getElementById('runtimeId')?.textContent || 'unknown'}`
    ].join('\n');
    try {
      await globalThis.navigator?.clipboard?.writeText(values);
      setText('copyResult', 'Copied');
    } catch (_) { setText('copyResult', 'Copy unavailable'); }
  });
  await Promise.all([refreshHealth(), refreshAppearance(), renderWallpaperPermission()]);
});
