'use strict';

const { TIMER_COMMANDS } = require('../timer/commands');
const { DATA_COMMANDS, MAX_INPUT_BYTES } = require('../data/data-safety');
const { DEFAULT_PREFERENCES, validLimits } = require('../preferences/preferences');
const { prototypeDockStyle } = require('./prototype-dock-style');
const { captureDockText, revealDockMorph } = require('./dock-morph');
const {
  SUPPORT_EMAIL,
  TICKET_TYPES,
  FEEDBACK_CATEGORIES,
  createDiagnosticSnapshot,
  composeSupportMessage
} = require('../support/support-service');
const {
  MAX_VISIBLE_JOB_TABS,
  THRESHOLD_LABELS,
  deriveTabWorkspace,
  focusIntentIsCurrent,
  placeContext
} = require('../workspace/model');

const ROOT_ID = 'ussign-job-timer';
const ICON_PATHS = Object.freeze({
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  jobs: '<rect x="3" y="6" width="18" height="15" rx="3"/><path d="M8 6V3h8v3M3 12h18"/>',
  history: '<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6M12 2v3"/>',
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  settings: '<path d="m9 3-.6 3-2.7 1.5-2.9-.9-1.5 2.6 2.3 2v3l-2.3 2 1.5 2.6 2.9-.9L8.4 19l.6 3h3l.6-3 2.7-1.5 2.9.9 1.5-2.6-2.3-2v-3l2.3-2-1.5-2.6-2.9.9L12.6 6 12 3Z" transform="translate(1 -1)"/><circle cx="11.5" cy="11.5" r="3"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  next: '<path d="m9 6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  external: '<path d="M14 3h7v7M21 3 10 14M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6"/>'
});
function uiIcon(name) {
  return `<svg class="sc-ui-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[name] || ICON_PATHS.timer}</svg>`;
}
const UI_STORAGE_DEFAULTS = Object.freeze({
  protoUiTheme: 'light',
  protoUiSurface: 'solid',
  themePreference: null,
  timerSurface: null,
  squareCoilTheme: null,
  protoUiCollapsed: false,
  protoUiHiddenTabs: [],
  b3WorkspaceOrder: [],
  b3LastSelectedContextId: null,
  b3WorkspaceRevision: 0,
  companionPanelVisible: true
});
const WORKSPACE_STORAGE_KEYS = new Set(['protoUiHiddenTabs', 'b3WorkspaceOrder', 'b3WorkspaceRevision']);
const VIEW_IDS = new Set([
  'main', 'home', 'recent', 'overview', 'by-day', 'by-context', 'history', 'context-detail',
  'settings', 'timer-appearance', 'website-theme', 'dashboard', 'design-dashboard', 'quick-file-paths', 'quick-clock', 'timer-limits', 'submit-ticket',
  'send-feedback', 'developer-support', 'data-tools', 'advanced-diagnostics'
]);
const SETTINGS_VIEW_IDS = new Set([
  'settings', 'timer-appearance', 'website-theme', 'dashboard', 'design-dashboard', 'quick-file-paths', 'quick-clock', 'timer-limits', 'submit-ticket',
  'send-feedback', 'developer-support', 'data-tools', 'advanced-diagnostics'
]);
const TIMER_ACTIONS = Object.freeze({
  pause: TIMER_COMMANDS.LOCAL_PAUSE,
  resume: TIMER_COMMANDS.RESUME,
  fresh: TIMER_COMMANDS.START_FRESH,
  localResume: TIMER_COMMANDS.LOCAL_RESUME
});
const REFRESH_MS = 1_000;
const HISTORY_PAGE_SIZE = 100;
const PORTABLE_FILE_LIMIT_MIB = Math.round(MAX_INPUT_BYTES / (1024 * 1024));
const COMPANION_DRAG_MIME = 'application/x-squarecoil-companion-tab';

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDuration(value, options = {}) {
  const ms = Math.max(0, Number(value) || 0);
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (options.compact === true) return hours > 0 ? `${hours}h ${String(minutes).padStart(2, '0')}m` : `${minutes}m`;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatClockTime(timestampMs) {
  if (!Number.isSafeInteger(timestampMs)) return 'Unknown';
  try { return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(timestampMs)); }
  catch (_) { return 'Unknown'; }
}

function formatDateTime(timestampMs) {
  if (!Number.isSafeInteger(timestampMs)) return 'Unknown';
  try { return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestampMs)); }
  catch (_) { return 'Unknown'; }
}

function statusLabel(status) {
  return ({
    RUNNING: 'Running',
    RUNNING_PROVISIONAL: 'Running · verifying',
    VERIFICATION_HOLD: 'Verification hold',
    AWAITING_CHOICE: 'Awaiting choice',
    LOCALLY_PAUSED: 'Locally paused',
    NOT_RUNNING: 'Not running',
    SYNCING: 'Syncing'
  })[status] || 'Syncing';
}

function statusTone(status) {
  if (status === 'RUNNING') return 'positive';
  if (status === 'RUNNING_PROVISIONAL' || status === 'AWAITING_CHOICE') return 'warning';
  if (status === 'VERIFICATION_HOLD') return 'danger';
  if (status === 'LOCALLY_PAUSED') return 'paused';
  return 'muted';
}

function friendlyCompanionStatus(core, timer) {
  if (core?.blocked) return Object.freeze({ label: 'Needs attention', tone: 'danger', message: 'Open Settings for recovery options.' });
  if (!core || (!core.initialized && !timer && !String(core.status || '').includes('recover'))) return Object.freeze({ label: 'Connecting', tone: 'warning', message: 'Getting your saved workspace ready.' });
  if (timer?.running) return Object.freeze({ label: 'Working', tone: 'positive', message: 'Watching your current SquareCoil activity.' });
  if (core?.initialized && timer) return Object.freeze({ label: 'Ready', tone: 'positive', message: 'Companion is ready when you are.' });
  if (String(core?.status || '').includes('recover')) return Object.freeze({ label: 'Working', tone: 'warning', message: 'Reconnecting to this SquareCoil page.' });
  return Object.freeze({ label: 'Setup required', tone: 'warning', message: 'Open a supported SquareCoil page to finish setup.' });
}

function safeProjectId(value) {
  const id = String(value || '').trim();
  return /^[1-9]\d*$/.test(id) ? id : null;
}

function eligibleRows(timer) {
  return (timer?.contextRows || []).filter(row => row.archivedAtMs == null &&
    String(row.workspaceMembership || '').toUpperCase() === 'RECENT');
}

function deriveVisibleTabs(rows, state = {}) {
  const protectedIds = new Set([state.selectedContextId, state.operationalContextId].filter(Boolean).map(String));
  return deriveTabWorkspace(rows, {
    ...state,
    hiddenContextIds: (state.hiddenContextIds || []).filter(value => !protectedIds.has(String(value)))
  }).visibleRows;
}

function archiveGestureEligibility(core, contextId, options = {}) {
  const id = String(contextId || '');
  const timer = core?.timer;
  const data = core?.data;
  const fail = (reason, message) => Object.freeze({ eligible: false, reason, message, contextId: id, label: null });
  if (!id || core?.initialized !== true || options.snapshotStale === true || options.busy === true || core?.blocked === true) {
    return fail('WORKSPACE_NOT_SETTLED', 'Companion is still verifying this workspace. The job was not archived.');
  }
  if (!timer || !data || !Number.isSafeInteger(timer.revision) || data.revision !== timer.revision) {
    return fail('PROTECTION_STATE_UNAVAILABLE', 'Job protection could not be verified. The job was not archived.');
  }
  const timerRow = (timer.contextRows || []).find(row => String(row.contextId) === id);
  const dataRow = (data.recentRows || []).find(row => String(row.contextId) === id);
  if (!timerRow || !dataRow || timerRow.archivedAtMs != null ||
      String(timerRow.workspaceMembership || '').toUpperCase() !== 'RECENT') {
    return fail('CONTEXT_NOT_RECENT', 'Only a visible, inactive recent job can be archived from the tab strip.');
  }
  if (dataRow.protected !== false || timer.currentContextId === id || timerRow.status !== 'NOT_RUNNING') {
    return fail('CONTEXT_PROTECTED', 'Current, paused, pending, or recovery-protected jobs cannot be archived.');
  }
  return Object.freeze({ eligible: true, reason: 'ELIGIBLE', message: 'Hours and history stay saved.',
    contextId: id, label: String(timerRow.label || dataRow.label || id) });
}

function sameWorkspaceNode(current, next) {
  if (current.nodeType !== next.nodeType) return false;
  if (current.nodeType !== 1) return true;
  if (current.tagName !== next.tagName) return false;
  for (const name of ['id', 'data-action', 'data-context', 'data-view', 'data-group', 'data-timer-action', 'data-data-type', 'data-sc-view-key']) {
    if (current.getAttribute(name) !== next.getAttribute(name)) return false;
  }
  return true;
}

function patchWorkspaceNode(current, next) {
  if (current.nodeType !== 1) {
    if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
    return;
  }
  for (const attribute of [...current.attributes]) {
    if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
  }
  for (const attribute of [...next.attributes]) {
    if (current.getAttribute(attribute.name) !== attribute.value) current.setAttribute(attribute.name, attribute.value);
  }
  patchWorkspaceChildren(current, next);
}

function patchWorkspaceChildren(current, next) {
  let oldChild = current.firstChild;
  for (const newChild of [...next.childNodes]) {
    if (!oldChild) { current.appendChild(newChild.cloneNode(true)); continue; }
    if (sameWorkspaceNode(oldChild, newChild)) {
      patchWorkspaceNode(oldChild, newChild);
      oldChild = oldChild.nextSibling;
    } else {
      const after = oldChild.nextSibling;
      oldChild.replaceWith(newChild.cloneNode(true));
      oldChild = after;
    }
  }
  while (oldChild) {
    const after = oldChild.nextSibling;
    oldChild.remove();
    oldChild = after;
  }
}

function updateWorkspaceMarkup(target, markup) {
  const document = target.ownerDocument;
  if (!document?.createElement || !target.firstChild || !target.appendChild) {
    target.innerHTML = markup;
    return;
  }
  const template = document.createElement('template');
  template.innerHTML = markup;
  if (!template.content) { target.innerHTML = markup; return; }
  patchWorkspaceChildren(target, template.content);
}

function createWorkspaceUi(options = {}) {
  const document = options.document;
  const window = options.window;
  const storage = options.storage;
  const storageChanges = options.storageChanges || null;
  const getCoreHandle = options.getCoreHandle;
  const packageVersion = String(options.packageVersion || '0.7.1');
  const buildId = String(options.buildId || 'unknown');
  const buildStage = String(options.buildStage || 'unknown');
  const candidateFingerprint = String(options.candidateFingerprint || 'unknown');
  const userAgent = String(options.userAgent || window?.navigator?.userAgent || '');
  if (!document || !window || !storage || typeof getCoreHandle !== 'function') throw new Error('workspace-ui-options-required');

  let started = false;
  let disposed = false;
  let intervalId = null;
  let viewHeightAnimation = null;
  let cancelDockMorph = () => {};
  let cycleHoverFrame = null;
  let cycleHoverDirection = 0;
  let cycleHoverTime = 0;
  let root = null;
  let selectedContextId = null;
  let lastOperationalContextId = null;
  let view = 'main';
  let detailReturnView = 'main';
  let theme = 'LIGHT';
  let surface = 'SOLID';
  let websiteTheme = 'ORIGINAL';
  let cinematicBackground = 'NONE';
  let dashboardProfile = 'OFF';
  let dashboardEnabled = false;
  let dashboardAppearance = 'SITE';
  let quickFilePathsEnabled = false;
  let quickClockControlsEnabled = false;
  let preferenceRevision = 0;
  let preferenceInitialized = false;
  let presentation = null;
  let collapsed = false;
  let panelVisible = true;
  let hiddenTabs = new Set();
  let durableOrder = [];
  let workspaceRevision = 0;
  let busyAction = null;
  let errorMessage = null;
  let lastTechnicalError = null;
  let preferencesLoaded = false;
  let lastGoodCore = null;
  let snapshotStale = false;
  let historyLimit = HISTORY_PAGE_SIZE;
  let processedFocusIntentId = null;
  let pendingFocusIntent = null;
  let selectionSerial = 0;
  let routeProtection = { dirty: false, inProgress: false };
  let draggedContextId = null;
  let draggedArchiveEligibility = null;
  let dragAttemptedOutside = false;
  let ownedDragActive = false;
  let archiveNotice = null;
  let archiveNoticeTimer = null;
  let archiveNoticeShouldReveal = false;
  let pendingFileMode = null;
  let advancedDiagnosticsOpen = false;
  let quickToolsOpen = false;
  let pendingImport = null;
  let invalidCsvRows = null;
  const backupRestoreOptions = {
    mergeWorkspace: false,
    mergePreferences: false,
    replaceWorkspace: true,
    replacePreferences: true,
    replaceActivity: false,
    keepCurrentZone: false
  };
  let dataMessage = null;
  let dataProgress = null;
  let cancelFileRead = null;
  const pendingPaintYields = new Set();
  let legacyPreferenceCandidates = {};
  let preferenceInitializationInFlight = false;
  let settingsReturnView = null;
  let expandedSettingsGroup = null;
  let focusTarget = null;
  let limitDraft = null;
  let supportMessage = null;
  let supportManualCopy = null;
  const supportDrafts = {
    ticket: { category: 'Bug', subject: '', description: '', includeDiagnostics: false, diagnostics: null, dirty: false },
    feedback: { category: 'Suggestion', subject: '', description: '', includeDiagnostics: false, diagnostics: null, dirty: false }
  };

  function coreHandle() { return getCoreHandle() || null; }

  function recordTechnicalError(error, friendlyMessage) {
    lastTechnicalError = String(error?.message || error || 'unknown-error');
    errorMessage = friendlyMessage;
  }

  function deviceTimeZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; }
    catch (_) { return null; }
  }

  function readCoreSnapshot() {
    const handle = coreHandle();
    if (!handle || typeof handle.coreSnapshot !== 'function') {
      snapshotStale = Boolean(lastGoodCore);
      return lastGoodCore;
    }
    try {
      const candidate = handle.coreSnapshot({ selectedContextId, historyLimit, deviceTimeZone: deviceTimeZone() });
      const currentRevision = lastGoodCore?.timer?.revision;
      const nextRevision = candidate?.timer?.revision;
      if (!candidate?.timer) {
        if (lastGoodCore) { snapshotStale = true; return lastGoodCore; }
        if (candidate && typeof candidate === 'object') {
          adoptPreferenceState(candidate);
          snapshotStale = false;
          return candidate;
        }
        throw new Error('Companion data is not available yet.');
      }
      if (Number.isSafeInteger(currentRevision) && (!Number.isSafeInteger(nextRevision) || nextRevision < currentRevision)) {
        snapshotStale = true;
        errorMessage = 'An older update was ignored; showing the latest saved values.';
        return lastGoodCore;
      }
      lastGoodCore = candidate;
      adoptPreferenceState(candidate);
      maybeInitializePreferences(candidate);
      snapshotStale = false;
      return candidate;
    } catch (_) {
      snapshotStale = Boolean(lastGoodCore);
      return lastGoodCore;
    }
  }

  function mountRoot() {
    const candidate = document.getElementById(ROOT_ID);
    if (!candidate) {
      if (draggedContextId) clearDragState({ preserveOwnership: true });
      return null;
    }
    if (root === candidate) return root;
    if (root && root !== candidate && SETTINGS_VIEW_IDS.has(view)) {
      view = 'settings';
      settingsReturnView = null;
      expandedSettingsGroup = null;
      pendingImport = null;
      limitDraft = null;
      supportDrafts.ticket = { category: 'Bug', subject: '', description: '', includeDiagnostics: false, diagnostics: null, dirty: false };
      supportDrafts.feedback = { category: 'Suggestion', subject: '', description: '', includeDiagnostics: false, diagnostics: null, dirty: false };
      supportMessage = null;
      supportManualCopy = null;
    }
    if (root && root !== candidate) {
      if (draggedContextId) clearDragState({ preserveOwnership: true });
      root.removeEventListener('click', onClick); root.removeEventListener('dblclick', onDoubleClick);
      root.removeEventListener('submit', onSubmit); root.removeEventListener('dragstart', onDragStart);
      root.removeEventListener('dragover', onDragOver); root.removeEventListener('drop', onDrop);
      root.removeEventListener('dragend', onDragEnd); root.removeEventListener('change', onChange);
      root.removeEventListener('cancel', onFileCancel);
      root.removeEventListener('input', onInput); root.removeEventListener('keydown', onKeyDown);
      root.removeEventListener('scroll', onTabScroll, true);
      root.removeEventListener('wheel', onTabWheel);
      root.removeEventListener('pointermove', onCyclePointerEnter, true);
      root.removeEventListener('pointerleave', onCyclePointerLeave, true);
    }
    root = candidate;
    root.classList.add('sc-proto-root');
    root.dataset.panelHidden = panelVisible ? 'false' : 'true';
    root.addEventListener('click', onClick);
    root.addEventListener('dblclick', onDoubleClick);
    root.addEventListener('submit', onSubmit);
    root.addEventListener('dragstart', onDragStart);
    root.addEventListener('dragover', onDragOver);
    root.addEventListener('drop', onDrop);
    root.addEventListener('dragend', onDragEnd);
    root.addEventListener('change', onChange);
    root.addEventListener('cancel', onFileCancel);
    root.addEventListener('input', onInput);
    root.addEventListener('keydown', onKeyDown);
    root.addEventListener('scroll', onTabScroll, true);
    root.addEventListener('wheel', onTabWheel, { passive: false });
    root.addEventListener('pointermove', onCyclePointerEnter, true);
    root.addEventListener('pointerleave', onCyclePointerLeave, true);
    return root;
  }

  function stopCycleHover() {
    cycleHoverDirection = 0;
    cycleHoverTime = 0;
    if (cycleHoverFrame !== null) window.cancelAnimationFrame?.(cycleHoverFrame);
    cycleHoverFrame = null;
    root?.querySelector?.('.sc-tabs')?.classList?.remove?.('is-hover-scrolling');
  }

  function updateTabCycleButtons() {
    const strip = root?.querySelector?.('.sc-tabs');
    const previous = root?.querySelector?.('.sc-tab-cycle-prev');
    const next = root?.querySelector?.('.sc-tab-cycle-next');
    if (!strip || !previous || !next) { stopCycleHover(); return; }
    const maxScroll = Math.max(0, strip.scrollWidth - strip.clientWidth);
    const hasLeft = maxScroll > 2 && strip.scrollLeft > 2;
    const hasRight = maxScroll > 2 && strip.scrollLeft < maxScroll - 2;
    const slots = [...strip.querySelectorAll('.sc-tab-slot')];
    const selectedIndex = slots.findIndex(slot => slot.dataset.selected === 'true');
    // Keep both arrows visible whenever the rail overflows. The dimmed arrow
    // still marks the edge, while a click changes the selected job.
    previous.hidden = maxScroll <= 2;
    next.hidden = maxScroll <= 2;
    previous.dataset.atEnd = selectedIndex <= 0 ? 'true' : 'false';
    next.dataset.atEnd = selectedIndex >= slots.length - 1 ? 'true' : 'false';
    strip.classList.toggle('has-left-overflow', hasLeft);
    strip.classList.toggle('has-right-overflow', hasRight);
    if ((cycleHoverDirection < 0 && !hasLeft) || (cycleHoverDirection > 0 && !hasRight)) stopCycleHover();
  }

  function onTabScroll(event) {
    if (event.target?.matches?.('.sc-tabs')) updateTabCycleButtons();
  }

  function onTabWheel(event) {
    const strip = event.target?.closest?.('.sc-tabs');
    if (!strip || !root?.contains(strip) || Math.abs(event.deltaX || 0) < 1 ||
      strip.scrollWidth <= strip.clientWidth + 2) return;
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? strip.clientWidth : 1;
    event.preventDefault?.();
    strip.style.scrollBehavior = 'auto';
    strip.scrollLeft += event.deltaX * scale;
    updateTabCycleButtons();
    window.requestAnimationFrame?.(() => {
      if (strip.isConnected) strip.style.removeProperty('scroll-behavior');
    });
  }

  function hoverCycleTick(time) {
    if (!cycleHoverDirection) return;
    const strip = root?.querySelector?.('.sc-tabs');
    if (!strip) { stopCycleHover(); return; }
    if (cycleHoverTime) strip.scrollLeft += cycleHoverDirection * 110 * Math.min(34, time - cycleHoverTime) / 1000;
    cycleHoverTime = time;
    updateTabCycleButtons();
    if (cycleHoverDirection) cycleHoverFrame = window.requestAnimationFrame?.(hoverCycleTick) ?? null;
  }

  function onCyclePointerEnter(event) {
    const button = event.target?.closest?.('.sc-tab-cycle:not([hidden])');
    if (draggedContextId || !button) return;
    const direction = button.dataset.direction === 'next' ? 1 : -1;
    if (cycleHoverDirection === direction) return;
    const strip = root?.querySelector?.('.sc-tabs');
    const maxScroll = Math.max(0, (strip?.scrollWidth || 0) - (strip?.clientWidth || 0));
    if ((direction > 0 && (strip?.scrollLeft || 0) >= maxScroll - 2) ||
      (direction < 0 && (strip?.scrollLeft || 0) <= 2)) return;
    stopCycleHover();
    cycleHoverDirection = direction;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      strip.scrollLeft += cycleHoverDirection * 64;
      stopCycleHover();
      updateTabCycleButtons();
      return;
    }
    root?.querySelector?.('.sc-tabs')?.classList?.add?.('is-hover-scrolling');
    // Move on entry so a live timer patch cannot make a brief edge hover inert.
    strip.scrollLeft += direction * 14;
    updateTabCycleButtons();
    if (cycleHoverDirection) cycleHoverFrame = window.requestAnimationFrame?.(hoverCycleTick) ?? null;
  }

  function onCyclePointerLeave(event) {
    if (event.target?.matches?.('.sc-tab-cycle')) stopCycleHover();
  }

  function cycleTabs(direction) {
    stopCycleHover();
    const strip = root?.querySelector?.('.sc-tabs');
    const slots = [...(strip?.querySelectorAll?.('.sc-tab-slot') || [])];
    if (!strip || slots.length < 2) return;
    const selectedIndex = slots.findIndex(slot => slot.dataset.selected === 'true');
    const index = Math.max(0, Math.min(slots.length - 1, selectedIndex + direction));
    if (index === selectedIndex || !slots[index]?.dataset.context) return;
    const contextId = slots[index].dataset.context;
    selectContext(contextId);
    focusTarget = `.sc-tab[data-context="${contextId}"]`;
    render();
    const nextStrip = root?.querySelector?.('.sc-tabs');
    const nextSlot = [...(nextStrip?.querySelectorAll?.('.sc-tab-slot') || [])]
      .find(slot => slot.dataset.context === contextId);
    if (nextStrip && nextSlot) {
      const left = Math.max(0, Math.min(nextStrip.scrollWidth - nextStrip.clientWidth, nextSlot.offsetLeft));
      // A click snaps the chosen tab into view. Native smooth scrolling can be
      // interrupted by the next live timer patch and leave it offscreen.
      nextStrip.style.scrollBehavior = 'auto';
      nextStrip.style.scrollSnapType = 'none';
      nextStrip.scrollLeft = left;
      window.requestAnimationFrame?.(() => {
        if (!nextStrip.isConnected) return;
        nextStrip.style.removeProperty('scroll-behavior');
        nextStrip.style.removeProperty('scroll-snap-type');
        updateTabCycleButtons();
      });
    }
    updateTabCycleButtons();
  }

  function updateTitlePan() {
    const clip = root?.querySelector?.('.sc-timer-card .sc-title-clip');
    const title = clip?.querySelector?.('.sc-title');
    if (!clip || !title) return;
    const travel = Math.max(0, title.scrollWidth - clip.clientWidth);
    clip.dataset.overflow = travel > 2 ? 'true' : 'false';
    clip.style.setProperty('--sc-title-travel', `${Math.ceil(travel)}px`);
    clip.style.setProperty('--sc-title-pan-duration', `${Math.max(2600, Math.ceil(travel * 32))}ms`);
    clip.tabIndex = travel > 2 ? 0 : -1;
  }

  function closingTabGhost(slot) {
    if (!slot?.cloneNode || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return null;
    const bounds = slot.getBoundingClientRect();
    const parent = root.getBoundingClientRect();
    const ghost = slot.cloneNode(true);
    ghost.classList.add('sc-tab-closing');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    ghost.style.left = `${bounds.left - parent.left}px`;
    ghost.style.top = `${bounds.top - parent.top}px`;
    ghost.style.width = `${bounds.width}px`;
    ghost.style.height = `${bounds.height}px`;
    return ghost;
  }

  async function loadPreferences() {
    if (preferencesLoaded) return;
    preferencesLoaded = true;
    try {
      const value = await storage.get(UI_STORAGE_DEFAULTS);
      collapsed = value.protoUiCollapsed === true;
      panelVisible = value.companionPanelVisible !== false;
      if (root) root.dataset.panelHidden = panelVisible ? 'false' : 'true';
      hiddenTabs = new Set(Array.isArray(value.protoUiHiddenTabs) ? value.protoUiHiddenTabs.map(String) : []);
      durableOrder = Array.isArray(value.b3WorkspaceOrder) ? value.b3WorkspaceOrder.map(String) : [];
      selectedContextId = value.b3LastSelectedContextId ? String(value.b3LastSelectedContextId) : null;
      workspaceRevision = Number.isSafeInteger(value.b3WorkspaceRevision) ? value.b3WorkspaceRevision : 0;
      legacyPreferenceCandidates = {
        themePreference: value.themePreference || value.protoUiTheme,
        timerSurface: value.timerSurface || value.protoUiSurface,
        squareCoilTheme: value.squareCoilTheme
      };
      try {
        const legacy = JSON.parse(window.localStorage?.getItem?.('ussign-squarecoil-job-timer-v1') || 'null');
        if (legacy?.settings) legacyPreferenceCandidates.settings = legacy.settings;
      } catch (_) {}
    } catch (_) {}
  }

  function savePreferences() {
    if (disposed) return;
    workspaceRevision = Math.max(workspaceRevision + 1, Date.now());
    storage.set({
      protoUiCollapsed: collapsed,
      protoUiHiddenTabs: [...hiddenTabs],
      b3WorkspaceOrder: [...durableOrder],
      b3LastSelectedContextId: selectedContextId,
      b3WorkspaceRevision: workspaceRevision
    }).catch(() => {});
  }

  function adoptPreferenceState(core) {
    const next = core?.preferences;
    if (!next) return;
    theme = next.timerAppearance || DEFAULT_PREFERENCES.timerAppearance;
    surface = next.panelFinish || DEFAULT_PREFERENCES.panelFinish;
    websiteTheme = next.websiteTheme || DEFAULT_PREFERENCES.websiteTheme;
    cinematicBackground = next.cinematicBackground || DEFAULT_PREFERENCES.cinematicBackground;
    dashboardProfile = next.dashboardProfile || DEFAULT_PREFERENCES.dashboardProfile;
    dashboardEnabled = next.dashboardEnabled === true;
    dashboardAppearance = next.dashboardAppearance || 'SITE';
    quickFilePathsEnabled = next.quickFilePathsEnabled === true;
    quickClockControlsEnabled = next.quickClockControlsEnabled === true;
    preferenceRevision = Number.isSafeInteger(next.preferenceRevision) ? next.preferenceRevision : 0;
    preferenceInitialized = next.initialized === true;
    presentation = core.presentation || presentation;
    if (!limitDraft || limitDraft.dirty !== true) {
      limitDraft = {
        yellowMinutes: next.yellowMinutes,
        orangeMinutes: next.orangeMinutes,
        redMinutes: next.redMinutes,
        baseRevision: preferenceRevision,
        dirty: false
      };
    }
  }

  function maybeInitializePreferences(core) {
    if (preferenceInitialized || preferenceInitializationInFlight || !core?.initialized) return;
    const handle = coreHandle();
    if (!handle || typeof handle.initializePreferences !== 'function') return;
    preferenceInitializationInFlight = true;
    handle.initializePreferences(legacyPreferenceCandidates).catch(error => {
      if (!/already-initialized|revision-conflict/.test(String(error?.message || error))) {
        errorMessage = 'Preferences could not be initialized; safe defaults remain effective.';
      }
    }).finally(() => {
      preferenceInitializationInFlight = false;
      render();
    });
  }

  function onStorageChanged(changes, areaName) {
    if (disposed) return;
    if (areaName && areaName !== 'local') return;
    if (changes?.companionPanelVisible) {
      panelVisible = changes.companionPanelVisible.newValue !== false;
      const target = mountRoot();
      if (target) target.dataset.panelHidden = panelVisible ? 'false' : 'true';
    }
    if (!Object.keys(changes || {}).some(key => WORKSPACE_STORAGE_KEYS.has(key))) return;
    const incomingRevision = changes.b3WorkspaceRevision?.newValue;
    if (Number.isSafeInteger(incomingRevision) && incomingRevision < workspaceRevision) return;
    if (changes.protoUiHiddenTabs) hiddenTabs = new Set(Array.isArray(changes.protoUiHiddenTabs.newValue) ? changes.protoUiHiddenTabs.newValue.map(String) : []);
    if (changes.b3WorkspaceOrder) durableOrder = Array.isArray(changes.b3WorkspaceOrder.newValue) ? changes.b3WorkspaceOrder.newValue.map(String) : [];
    if (Number.isSafeInteger(incomingRevision)) workspaceRevision = incomingRevision;
    if (draggedContextId) clearDragState({ preserveOwnership: true });
    render();
  }

  function currentRow(timer) { return (timer?.contextRows || []).find(row => row.contextId === timer.currentContextId) || null; }

  function selectedRow(timer) {
    const rows = timer?.contextRows || [];
    return rows.find(row => row.contextId === selectedContextId) || rows.find(row => row.contextId === timer.currentContextId) || rows[0] || null;
  }

  function applyFocusIntent(intent, timer) {
    if (!focusIntentIsCurrent(intent, timer) || !eligibleRows(timer).some(row => row.contextId === intent.contextId)) return false;
    hiddenTabs.delete(intent.contextId);
    selectedContextId = intent.contextId;
    view = 'main';
    collapsed = false;
    processedFocusIntentId = intent.intentId;
    pendingFocusIntent = null;
    savePreferences();
    return true;
  }

  function syncSelection(timer) {
    const allRows = timer?.contextRows || [];
    const rows = eligibleRows(timer);
    const operational = timer?.currentContextId || null;
    const operationalIsRecent = Boolean(operational && rows.some(row => row.contextId === operational));
    const intent = timer?.focusIntent || null;
    const intentIsCurrent = Boolean(intent && operationalIsRecent && focusIntentIsCurrent(intent, timer));
    const firstSnapshot = lastOperationalContextId === null && processedFocusIntentId === null;
    let visibilityChanged = false;
    let selectionReconciled = false;
    if (operational && hiddenTabs.has(operational)) {
      hiddenTabs.delete(operational);
      visibilityChanged = true;
    }
    if (firstSnapshot && intentIsCurrent) {
      selectedContextId = operational;
    } else if (!selectedContextId || (view === 'main'
      ? !rows.some(row => row.contextId === selectedContextId)
      : !allRows.some(row => row.contextId === selectedContextId))) {
      const priorSelection = selectedContextId;
      const visible = deriveTabWorkspace(rows, { hiddenContextIds: [...hiddenTabs], durableOrder, selectedContextId: null, operationalContextId: operationalIsRecent ? operational : null });
      selectedContextId = (intentIsCurrent && operational) || visible.visibleRows[0]?.contextId || (view === 'main' ? null : allRows[0]?.contextId) || null;
      selectionReconciled = Boolean(priorSelection && priorSelection !== selectedContextId);
    }

    if (firstSnapshot) {
      processedFocusIntentId = intent?.intentId || '__baseline__';
    } else if (intent && intent.intentId !== processedFocusIntentId && intentIsCurrent) {
      if (routeProtection.dirty || currentDraftKind() || routeProtection.inProgress || busyAction) {
        if (!pendingFocusIntent || intent.sourceStateRevision >= pendingFocusIntent.intent.sourceStateRevision) {
          pendingFocusIntent = { intent, selectionSerialAtDeferral: selectionSerial };
        }
        processedFocusIntentId = intent.intentId;
      } else applyFocusIntent(intent, timer);
    } else if (timer.lastObservation === undefined && operationalIsRecent && lastOperationalContextId && operational !== lastOperationalContextId) {
      // Compatibility for the inherited B2 prototype fixture. Canonical B3
      // snapshots always include lastObservation/focusIntent provenance.
      selectedContextId = operational;
      view = 'main';
      collapsed = false;
    }
    lastOperationalContextId = operational;
    if (visibilityChanged || selectionReconciled) savePreferences();
  }

  function flushDeferredFocus(timer) {
    if (!pendingFocusIntent || routeProtection.dirty || currentDraftKind() || routeProtection.inProgress || busyAction) return false;
    const pending = pendingFocusIntent;
    pendingFocusIntent = null;
    if (selectionSerial !== pending.selectionSerialAtDeferral) return false;
    return applyFocusIntent(pending.intent, timer);
  }

  function styleBlock() {
    return `<style data-sc-proto-style>
#${ROOT_ID}.sc-proto-root{all:initial;box-sizing:border-box!important;position:fixed!important;right:20px!important;bottom:20px!important;z-index:2147483640!important;width:460px!important;max-width:calc(100vw - 24px)!important;padding:42px 0 0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;color-scheme:light;--sc-bg:#f5f8fb;--sc-panel:#fff;--sc-panel-2:#edf3f7;--sc-text:#17212c;--sc-muted:#65717d;--sc-border:#d2dbe4;--sc-accent:#347fbd;--sc-accent-soft:#e5f1fa;--sc-positive:#26734d;--sc-positive-soft:#e4f3eb;--sc-warning:#8b5a12;--sc-warning-soft:#fff1d7;--sc-danger:#a13a3a;--sc-danger-soft:#fae6e6;--sc-shadow:0 22px 60px rgba(17,30,42,.24),0 3px 14px rgba(17,30,42,.12);font:400 13.5px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important}#${ROOT_ID}.sc-proto-root[data-has-tabs="false"]{padding-top:0!important}
#${ROOT_ID}.sc-proto-root[data-proto-theme="dark"]{color-scheme:dark;--sc-bg:#0e151c;--sc-panel:#151e27;--sc-panel-2:#1c2934;--sc-text:#eef5fb;--sc-muted:#9aa9b6;--sc-border:rgba(192,221,244,.14);--sc-accent:#61aef7;--sc-accent-soft:#17344b;--sc-positive:#7bcfa3;--sc-positive-soft:#163729;--sc-warning:#edbe6f;--sc-warning-soft:#3b2f1b;--sc-danger:#f09d9d;--sc-danger-soft:#442323;--sc-shadow:0 24px 64px rgba(0,0,0,.52),0 3px 14px rgba(0,0,0,.34)}
#${ROOT_ID}.sc-proto-root *{box-sizing:border-box!important;font:inherit}#${ROOT_ID} .sc-proto-shell{position:relative;z-index:3;overflow:hidden;border:1px solid var(--sc-border);border-radius:15px;background:var(--sc-bg);color:var(--sc-text);box-shadow:var(--sc-shadow)}#${ROOT_ID}[data-has-tabs="true"] .sc-proto-shell{border-top-left-radius:9px}#${ROOT_ID}[data-proto-surface="glass"] .sc-proto-shell{background:color-mix(in srgb,var(--sc-bg) 84%,transparent);-webkit-backdrop-filter:blur(18px) saturate(120%);backdrop-filter:blur(18px) saturate(120%)}
#${ROOT_ID} .sc-proto-topbar{display:flex;align-items:center;gap:9px;min-height:52px;padding:9px 10px;background:color-mix(in srgb,var(--sc-panel) 92%,transparent);border-bottom:1px solid color-mix(in srgb,var(--sc-border) 52%,transparent)}#${ROOT_ID} .sc-proto-brand{min-width:0;flex:1}#${ROOT_ID} .sc-proto-brand strong{display:block;font-weight:720;font-size:13px;letter-spacing:-.01em}#${ROOT_ID} .sc-proto-status{display:inline-flex;align-items:center;gap:5px;color:var(--sc-muted);font-size:10px;white-space:nowrap}#${ROOT_ID} .sc-proto-status::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}#${ROOT_ID} .sc-proto-status[data-tone="positive"]{color:var(--sc-positive)}#${ROOT_ID} .sc-proto-status[data-tone="warning"]{color:var(--sc-warning)}#${ROOT_ID} .sc-proto-status[data-tone="danger"]{color:var(--sc-danger)}#${ROOT_ID} button,#${ROOT_ID} input{color:inherit}#${ROOT_ID} button{border:0;background:var(--sc-panel-2);border-radius:8px;padding:6px 9px;cursor:pointer;transition:background-color .14s ease,transform .14s ease}#${ROOT_ID} button:hover{background:color-mix(in srgb,var(--sc-panel-2) 78%,var(--sc-accent) 22%)}#${ROOT_ID} button:active{transform:translateY(1px)}#${ROOT_ID} button:focus-visible,#${ROOT_ID} input:focus-visible,#${ROOT_ID} select:focus-visible,#${ROOT_ID} textarea:focus-visible,#${ROOT_ID} summary:focus-visible{outline:2px solid var(--sc-accent);outline-offset:2px}#${ROOT_ID} button[disabled]{opacity:.5;cursor:not-allowed}#${ROOT_ID} .sc-icon-btn{width:30px;height:30px;padding:0;display:grid;place-items:center}
#${ROOT_ID} .sc-tabs{position:absolute;z-index:4;top:0;right:10px;left:10px;height:43px;display:flex;gap:3px;align-items:flex-end;padding:3px 0 0;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;scrollbar-width:none;touch-action:pan-x pinch-zoom;background:transparent;border:0;scroll-snap-type:x proximity}#${ROOT_ID} .sc-tabs::-webkit-scrollbar{display:none;width:0;height:0}#${ROOT_ID} .sc-tab-help{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}#${ROOT_ID} .sc-tab-slot{position:relative;flex:0 0 116px;min-width:82px;max-width:132px;height:40px;scroll-snap-align:start}#${ROOT_ID} .sc-tab{--sc-tab-threshold:transparent;width:100%;height:40px;display:grid;grid-template-columns:8px minmax(0,1fr);grid-template-rows:auto auto;gap:0 5px;padding:5px 25px 5px 9px;border:1px solid var(--sc-border);border-bottom-color:color-mix(in srgb,var(--sc-border) 78%,transparent);border-radius:12px 12px 0 0;background:var(--sc-panel-2);color:var(--sc-muted);box-shadow:inset 0 3px var(--sc-tab-threshold),0 -2px 9px rgba(17,30,42,.08);cursor:grab}#${ROOT_ID} .sc-tab:active{cursor:grabbing}#${ROOT_ID} .sc-tab[data-selected="true"]{position:relative;z-index:2;color:var(--sc-text);background:var(--sc-panel);border-bottom-color:var(--sc-panel);box-shadow:inset 0 3px var(--sc-tab-threshold),0 -5px 16px rgba(17,30,42,.13)}#${ROOT_ID} .sc-tab-slot[data-selected="true"]::after{content:"";position:absolute;z-index:3;right:0;bottom:-1px;left:0;height:2px;background:var(--sc-panel)}#${ROOT_ID} .sc-tab-label,#${ROOT_ID} .sc-tab-time{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}#${ROOT_ID} .sc-tab-label{font-size:10.5px;font-weight:700}#${ROOT_ID} .sc-tab-time{font-size:9px}#${ROOT_ID} .sc-tab-x{position:absolute;z-index:5;top:7px;right:5px;width:19px;height:19px;display:grid;place-items:center;padding:0;border:0;border-radius:50%;background:transparent;font-size:13px;line-height:1}#${ROOT_ID} .sc-tab-slot[data-drop-position="before"]::before,#${ROOT_ID} .sc-tab-slot[data-drop-position="after"]::after{content:"";position:absolute;z-index:8;top:4px;bottom:2px;width:3px;border-radius:3px;background:var(--sc-accent);box-shadow:0 0 0 2px var(--sc-accent-soft)}#${ROOT_ID} .sc-tab-slot[data-drop-position="before"]::before{left:-3px}#${ROOT_ID} .sc-tab-slot[data-drop-position="after"]::after{right:-3px}#${ROOT_ID} .sc-dot{width:6px;height:6px;border-radius:50%;align-self:center;background:var(--sc-muted)}#${ROOT_ID} .sc-dot[data-tone="positive"]{background:var(--sc-positive)}#${ROOT_ID} .sc-dot[data-tone="warning"]{background:var(--sc-warning)}#${ROOT_ID} .sc-dot[data-tone="danger"]{background:var(--sc-danger)}#${ROOT_ID} .sc-tab[data-threshold="YELLOW"]{--sc-tab-threshold:#d9a51f}#${ROOT_ID} .sc-tab[data-threshold="ORANGE"]{--sc-tab-threshold:#d97820}#${ROOT_ID} .sc-tab[data-threshold="RED"]{--sc-tab-threshold:var(--sc-danger)}
#${ROOT_ID} .sc-content{max-height:min(700px,calc(100vh - 154px));overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}#${ROOT_ID} .sc-view{padding:12px}#${ROOT_ID} .sc-current-strip{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 10px;margin-bottom:9px;border:0;background:var(--sc-panel);border-radius:10px}#${ROOT_ID} .sc-eyebrow{color:var(--sc-muted);font-size:9.5px;text-transform:uppercase;letter-spacing:.075em;font-weight:650}#${ROOT_ID} .sc-title{margin-top:2px;font-size:15px;font-weight:700;overflow-wrap:anywhere}#${ROOT_ID} .sc-status{display:inline-flex;align-items:center;gap:6px;margin-top:6px;border-radius:999px;padding:3px 7px;font-size:10.5px;font-weight:650;background:var(--sc-panel-2);color:var(--sc-muted)}#${ROOT_ID} .sc-status[data-tone="positive"]{background:var(--sc-positive-soft);color:var(--sc-positive)}#${ROOT_ID} .sc-status[data-tone="warning"]{background:var(--sc-warning-soft);color:var(--sc-warning)}#${ROOT_ID} .sc-status[data-tone="danger"]{background:var(--sc-danger-soft);color:var(--sc-danger)}
#${ROOT_ID} .sc-timer-card{padding:13px;border:0;border-radius:11px;background:var(--sc-panel)}#${ROOT_ID} .sc-metrics,#${ROOT_ID} .sc-summary-grid{display:grid;grid-template-columns:1.25fr 1fr;gap:9px;margin-top:12px}#${ROOT_ID} .sc-metric,#${ROOT_ID} .sc-summary{padding:10px;border:0;border-radius:9px;background:var(--sc-panel-2)}#${ROOT_ID} .sc-metric strong,#${ROOT_ID} .sc-summary strong{display:block;margin-top:2px;font-size:18px;font-weight:700}#${ROOT_ID} .sc-session{margin-top:10px;color:var(--sc-muted);font-size:11px;display:flex;justify-content:space-between}#${ROOT_ID} .sc-actions,#${ROOT_ID} .sc-row-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}#${ROOT_ID} .sc-actions .sc-primary{background:var(--sc-accent);color:var(--sc-bg);font-weight:650}#${ROOT_ID} .sc-nav-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}#${ROOT_ID} .sc-nav-grid button{text-align:left;min-height:44px}#${ROOT_ID} .sc-nav-grid strong{display:block;font-size:11.5px;font-weight:650}#${ROOT_ID} .sc-nav-grid small{display:block;color:var(--sc-muted);font-size:9.5px;margin-top:2px}#${ROOT_ID} .sc-search{display:flex;gap:7px;margin-top:10px}#${ROOT_ID} .sc-search input{min-width:0;flex:1;border:1px solid color-mix(in srgb,var(--sc-border) 72%,transparent);border-radius:8px;background:var(--sc-panel);padding:7px 9px}
#${ROOT_ID} .sc-view-head{display:flex;align-items:center;gap:8px;margin-bottom:12px}#${ROOT_ID} .sc-view-head strong{flex:1;font-size:14px;font-weight:700}#${ROOT_ID} .sc-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid color-mix(in srgb,var(--sc-border) 48%,transparent)}#${ROOT_ID} .sc-row-title{font-weight:640;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#${ROOT_ID} .sc-row-meta{color:var(--sc-muted);font-size:10px;margin-top:2px}#${ROOT_ID} .sc-row-actions{margin-top:0;justify-content:flex-end}#${ROOT_ID} .sc-row-actions button{padding:4px 7px;font-size:10px}#${ROOT_ID} .sc-choice{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:7px}#${ROOT_ID} .sc-choice button[data-active="true"]{background:var(--sc-accent-soft);color:var(--sc-accent);box-shadow:inset 3px 0 var(--sc-accent);font-weight:650}#${ROOT_ID} .sc-note,#${ROOT_ID} .sc-stale{margin-top:9px;padding:8px 9px;border-radius:8px;background:var(--sc-panel-2);color:var(--sc-muted);font-size:10px}#${ROOT_ID} .sc-stale{background:var(--sc-warning-soft);color:var(--sc-warning)}#${ROOT_ID} .sc-error{margin:0 12px 10px;padding:8px 9px;border-radius:8px;background:var(--sc-danger-soft);color:var(--sc-danger);font-size:10px}#${ROOT_ID} .sc-empty{padding:20px 10px;text-align:center;color:var(--sc-muted);font-size:11px}#${ROOT_ID} .sc-empty strong{display:block;margin-bottom:4px;color:var(--sc-text);font-size:12px}#${ROOT_ID} .sc-archive-notice{display:flex;align-items:center;gap:8px;margin:10px 12px 0;padding:9px 10px;border:0;border-radius:9px;background:var(--sc-positive-soft);color:var(--sc-positive);font-size:10.5px;box-shadow:inset 3px 0 var(--sc-positive)}#${ROOT_ID} .sc-archive-notice span{min-width:0;flex:1}#${ROOT_ID} .sc-archive-notice button{padding:4px 8px;font-weight:700}#${ROOT_ID} .sc-archive-veil{position:fixed;z-index:1;inset:0;display:grid;place-items:center;padding:24px 520px 24px 24px;pointer-events:none;visibility:hidden;opacity:0;background:rgba(51,58,66,.32);transition:opacity .14s ease,visibility .14s ease}#${ROOT_ID} .sc-archive-veil[data-visible="true"]{visibility:visible;opacity:1}#${ROOT_ID} .sc-archive-veil[data-tone="blocked"]{background:rgba(76,68,55,.22)}#${ROOT_ID} .sc-archive-veil>div{width:min(440px,100%);padding:14px 18px;color:#fff;background:#141b22;border:0;border-radius:12px;box-shadow:0 18px 48px rgba(0,0,0,.28);text-align:center;font-weight:750}#${ROOT_ID} .sc-archive-veil small{display:block;margin-top:4px;color:#d6e0e8;font-weight:500}#${ROOT_ID} .sc-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;border-top:1px solid color-mix(in srgb,var(--sc-border) 48%,transparent);background:var(--sc-panel);color:var(--sc-muted);font-size:9.5px}#${ROOT_ID} .sc-foot button{border:0;background:transparent;padding:3px;color:var(--sc-muted);font-size:9.5px}#${ROOT_ID}[data-proto-collapsed="true"][data-has-tabs="false"]{width:292px!important}#${ROOT_ID}[data-proto-collapsed="true"] .sc-content,#${ROOT_ID}[data-proto-collapsed="true"] .sc-foot{display:none}@media(max-width:760px){#${ROOT_ID} .sc-archive-veil{place-items:start center;padding:20px}}@media(max-width:500px){#${ROOT_ID}.sc-proto-root{right:8px!important;bottom:8px!important;width:calc(100vw - 16px)!important}}
#${ROOT_ID} .sc-section-label{margin-top:16px}#${ROOT_ID} .sc-choice-three{grid-template-columns:repeat(3,1fr)}#${ROOT_ID} label{display:block;margin-top:9px;color:var(--sc-muted);font-size:10px}#${ROOT_ID} label input,#${ROOT_ID} label select,#${ROOT_ID} label textarea{display:block;width:100%;margin-top:4px;padding:7px 8px;border:1px solid color-mix(in srgb,var(--sc-border) 72%,transparent);border-radius:8px;background:var(--sc-panel);color:var(--sc-text)}#${ROOT_ID} label textarea{resize:vertical;min-height:86px}#${ROOT_ID} .sc-field-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}#${ROOT_ID} .sc-check{display:flex;align-items:center;gap:7px}#${ROOT_ID} .sc-check input{display:inline-block;width:auto;margin:0}#${ROOT_ID} .sc-unavailable{min-height:48px;padding:8px 9px;border:0;border-radius:9px;background:color-mix(in srgb,var(--sc-panel-2) 60%,transparent);opacity:.72}#${ROOT_ID} .sc-unavailable strong,#${ROOT_ID} .sc-unavailable small{display:block}#${ROOT_ID} .sc-unavailable strong{font-size:11.5px}#${ROOT_ID} .sc-unavailable small{margin-top:2px;color:var(--sc-muted);font-size:9.5px}#${ROOT_ID} .sc-theme-list{display:grid;gap:7px}#${ROOT_ID} .sc-theme-choice{display:grid;grid-template-columns:16px minmax(0,1fr) 18px;align-items:center;gap:10px;width:100%;padding:8px;text-align:left}#${ROOT_ID} .sc-theme-choice>span:nth-child(2)>strong,#${ROOT_ID} .sc-theme-choice>span:nth-child(2)>small{display:block}#${ROOT_ID} .sc-theme-choice small{margin-top:2px;color:var(--sc-muted);font-size:9.5px}#${ROOT_ID} .sc-theme-choice[data-active="true"]{box-shadow:inset 3px 0 var(--sc-accent)}#${ROOT_ID} .sc-theme-swatch{display:block;width:8px;height:32px;justify-self:center;border:0;border-radius:999px;background:linear-gradient(180deg,#70a8d0 0 50%,#e8eef3 50%)}#${ROOT_ID} .sc-theme-swatch[data-theme-swatch="SLEEK_DARK"]{background:linear-gradient(180deg,#1c3850,#09121b)}#${ROOT_ID} .sc-theme-swatch[data-theme-swatch="LIGHT_GLASS"]{background:linear-gradient(180deg,#dff2fb,#9bc9de)}#${ROOT_ID} .sc-theme-swatch[data-theme-swatch="REFINED_LIGHT"]{background:linear-gradient(180deg,#fff,#dce7ef)}#${ROOT_ID} .sc-radio{width:14px;height:14px;border:2px solid var(--sc-border);border-radius:50%}#${ROOT_ID} .sc-theme-choice[data-active="true"] .sc-radio{border:4px solid var(--sc-accent)}#${ROOT_ID} .sc-health-summary{display:flex;align-items:center;gap:10px;padding:11px;border:0;border-radius:10px;background:var(--sc-panel)}#${ROOT_ID} .sc-health-icon{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:var(--sc-positive-soft);color:var(--sc-positive);font-weight:800}#${ROOT_ID} .sc-health-summary[data-tone="warning"] .sc-health-icon{background:var(--sc-warning-soft);color:var(--sc-warning)}#${ROOT_ID} .sc-health-summary[data-tone="danger"] .sc-health-icon{background:var(--sc-danger-soft);color:var(--sc-danger)}#${ROOT_ID} .sc-health-summary strong,#${ROOT_ID} .sc-health-summary small{display:block}#${ROOT_ID} .sc-health-summary small{margin-top:2px;color:var(--sc-muted);font-size:10px}#${ROOT_ID} .sc-technical{margin-top:10px;padding:9px;border:0;border-radius:9px;background:var(--sc-panel)}#${ROOT_ID} .sc-technical summary{cursor:pointer;font-weight:650}#${ROOT_ID} .sc-technical p{margin:8px 0 0;color:var(--sc-muted);font-size:10px}#${ROOT_ID} .sc-diagnostics{max-height:190px;overflow:auto;white-space:pre-wrap;word-break:break-word;margin:9px 0 0;padding:8px;border:0;border-radius:8px;background:var(--sc-panel-2);color:var(--sc-text);font:10px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace!important}
#${ROOT_ID} .sc-proto-shell{color:var(--sc-text)!important;background:var(--sc-bg)!important;border-color:var(--sc-border)!important}#${ROOT_ID}[data-proto-surface="glass"] .sc-proto-shell{background:color-mix(in srgb,var(--sc-bg) 84%,transparent)!important}#${ROOT_ID} .sc-proto-topbar,#${ROOT_ID} .sc-foot{color:var(--sc-text)!important;background:color-mix(in srgb,var(--sc-panel) 92%,transparent)!important}#${ROOT_ID} button{color:var(--sc-text)!important;background:var(--sc-panel-2)!important;border:0!important;box-shadow:none!important}#${ROOT_ID} button:hover{background:color-mix(in srgb,var(--sc-panel-2) 78%,var(--sc-accent) 22%)!important}#${ROOT_ID} button.sc-tab{color:var(--sc-muted)!important;background:var(--sc-panel-2)!important;border:1px solid var(--sc-border)!important;box-shadow:inset 0 3px var(--sc-tab-threshold),0 -2px 9px rgba(17,30,42,.08)!important}#${ROOT_ID} button.sc-tab[data-selected="true"]{color:var(--sc-text)!important;background:var(--sc-panel)!important;border-bottom-color:var(--sc-panel)!important;box-shadow:inset 0 3px var(--sc-tab-threshold),0 -5px 16px rgba(17,30,42,.13)!important}#${ROOT_ID} button.sc-tab-x{background:transparent!important;border:0!important}#${ROOT_ID} button.sc-primary,#${ROOT_ID} .sc-actions .sc-primary{color:var(--sc-bg)!important;background:var(--sc-accent)!important}#${ROOT_ID} strong,#${ROOT_ID} .sc-title,#${ROOT_ID} .sc-view-head{color:var(--sc-text)!important}#${ROOT_ID} small,#${ROOT_ID} .sc-note,#${ROOT_ID} .sc-empty,#${ROOT_ID} .sc-row-meta,#${ROOT_ID} .sc-eyebrow{color:var(--sc-muted)!important}#${ROOT_ID} .sc-archive-veil small{color:#d6e0e8!important}#${ROOT_ID} .sc-theme-choice[data-active="true"],#${ROOT_ID} .sc-choice button[data-active="true"]{color:var(--sc-accent)!important;background:var(--sc-accent-soft)!important}#${ROOT_ID} input,#${ROOT_ID} select,#${ROOT_ID} textarea{color:var(--sc-text)!important;background:var(--sc-panel)!important;border-color:color-mix(in srgb,var(--sc-border) 72%,transparent)!important}
@media(prefers-reduced-motion:reduce){#${ROOT_ID} button,#${ROOT_ID} .sc-archive-veil{transition:none}}@media(forced-colors:active){#${ROOT_ID}.sc-proto-root{forced-color-adjust:auto}#${ROOT_ID} .sc-proto-shell,#${ROOT_ID} button,#${ROOT_ID} input,#${ROOT_ID} select,#${ROOT_ID} textarea{border:1px solid ButtonText!important;box-shadow:none!important;background:Canvas!important;color:CanvasText!important}#${ROOT_ID}[data-proto-surface="glass"] .sc-proto-shell{-webkit-backdrop-filter:none;backdrop-filter:none}#${ROOT_ID} .sc-archive-veil{background:Canvas!important}#${ROOT_ID} .sc-archive-veil>div{color:CanvasText!important;background:Canvas!important;border:2px solid CanvasText!important}#${ROOT_ID} .sc-archive-veil small{color:CanvasText!important}}
@media(max-width:760px){#${ROOT_ID} .sc-archive-veil{z-index:9;place-items:center;padding:20px}}
#${ROOT_ID} .sc-settings-intro{margin:-3px 0 10px;color:var(--sc-muted);font-size:10.5px}#${ROOT_ID} .sc-settings-list{display:grid;gap:7px}#${ROOT_ID} .sc-settings-group{overflow:hidden;border:0;border-radius:11px;background:var(--sc-panel)}#${ROOT_ID} .sc-settings-group-toggle{display:flex;width:100%;min-height:54px;align-items:center;justify-content:space-between;gap:12px;padding:9px 11px!important;border:0!important;border-radius:0!important;background:transparent!important;text-align:left!important}#${ROOT_ID} .sc-settings-group-toggle>span{min-width:0}#${ROOT_ID} .sc-settings-group-toggle strong{display:block;font-size:12px;font-weight:700}#${ROOT_ID} .sc-settings-group-toggle small{display:block;margin-top:2px;color:var(--sc-muted);font-size:9.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#${ROOT_ID} .sc-settings-chevron{width:18px;height:18px;flex:0 0 18px;color:var(--sc-muted);transition:transform .16s ease}#${ROOT_ID} .sc-settings-group[data-expanded="true"]{box-shadow:inset 3px 0 var(--sc-accent)}#${ROOT_ID} .sc-settings-group[data-expanded="true"] .sc-settings-group-toggle{background:var(--sc-panel-2)!important}#${ROOT_ID} .sc-settings-group[data-expanded="true"] .sc-settings-chevron{transform:rotate(180deg);color:var(--sc-accent)}#${ROOT_ID} .sc-settings-group-panel[hidden]{display:none!important}#${ROOT_ID} .sc-settings-group-panel{padding:0 8px 8px;border-top:1px solid color-mix(in srgb,var(--sc-border) 42%,transparent)}#${ROOT_ID} .sc-settings-group-panel .sc-nav-grid{grid-template-columns:1fr;margin-top:8px}#${ROOT_ID} .sc-settings-group-panel .sc-nav-grid button,#${ROOT_ID} .sc-settings-group-panel .sc-unavailable{min-height:45px;padding:8px 10px;border-radius:8px}#${ROOT_ID} .sc-settings-group-panel .sc-unavailable{margin:0}
${prototypeDockStyle(ROOT_ID)}
</style>`;
  }

  function marker(row) {
    if (row?.isSafetyHeld) return ' · held';
    if (row?.isProvisional) return ' · provisional';
    return '';
  }

  function tabMarkup(timer, core) {
    const workspace = deriveTabWorkspace(eligibleRows(timer), { hiddenContextIds: [...hiddenTabs], durableOrder, selectedContextId, operationalContextId: timer.currentContextId });
    durableOrder = [...workspace.order];
    if (!workspace.visibleRows.length) return '';
    return `<div class="sc-tabs" role="tablist" aria-label="Open job tabs"><span class="sc-tab-help" id="sc-tab-help">Scroll to see more jobs. Drag tabs to reorder. Drag an inactive job onto the SquareCoil page to archive it without deleting its history.</span>${workspace.visibleRows.map(row => {
      const selected = row.contextId === selectedContextId;
      const archiveEligibility = archiveGestureEligibility(core, row.contextId, { snapshotStale, busy: Boolean(busyAction) });
      const canHide = archiveEligibility.eligible;
      const threshold = row.thresholdLevel || 'NONE';
      const thresholdText = THRESHOLD_LABELS[threshold] || THRESHOLD_LABELS.NONE;
      const label = `${row.label}, Today ${formatDuration(row.todayMs, { compact: true })}, ${thresholdText}, ${statusLabel(row.status)}${marker(row)}`;
      const projectId = safeProjectId(row.projectId);
      return `<div class="sc-tab-slot" data-context="${escapeHtml(row.contextId)}" data-selected="${selected}"><button class="sc-tab" draggable="true" role="tab" aria-selected="${selected}" aria-controls="sc-workspace-panel" aria-describedby="sc-tab-help" tabindex="${selected ? '0' : '-1'}" data-action="select" data-context="${escapeHtml(row.contextId)}" data-selected="${selected}" data-operational="${row.isOperational === true}" data-threshold="${escapeHtml(threshold)}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><span class="sc-dot" data-tone="${statusTone(row.status)}"></span><span class="sc-tab-label">${escapeHtml(row.shortLabel || row.label)}</span><span></span><span class="sc-tab-time">${formatDuration(row.todayMs, { compact: true })}${row.isProvisional ? '*' : ''}</span></button>${projectId ? `<button class="sc-tab-open" data-action="open-job" data-project="${escapeHtml(projectId)}" aria-label="Open job ${escapeHtml(projectId)} in SquareCoil" title="Open in SquareCoil">${uiIcon('external')}</button>` : ''}${canHide ? `<button class="sc-tab-x" data-action="hide-tab" data-context="${escapeHtml(row.contextId)}" aria-label="Hide ${escapeHtml(row.label)} from the tab strip" title="Hide from tabs">${uiIcon('close')}</button>` : ''}</div>`;
    }).join('')}</div><button class="sc-tab-cycle sc-tab-cycle-prev" data-action="cycle-tabs" data-direction="prev" aria-label="Previous job tabs" title="Previous jobs" hidden>${uiIcon('back')}</button><button class="sc-tab-cycle sc-tab-cycle-next" data-action="cycle-tabs" data-direction="next" aria-label="Next job tabs" title="Next jobs" hidden>${uiIcon('next')}</button>`;
  }

  function viewHeader(title, backView = 'main') {
    const settingsRoute = SETTINGS_VIEW_IDS.has(view);
    const effectiveBack = settingsReturnView === view ? 'settings' : backView;
    return `<div class="sc-view-head"><button class="sc-icon-btn" data-action="${settingsRoute ? 'settings-back' : 'view'}" data-view="${escapeHtml(effectiveBack)}" aria-label="Back">${uiIcon('back')}</button><strong tabindex="-1" data-sc-view-heading>${escapeHtml(title)}</strong>${settingsRoute ? '<button class="sc-icon-btn" data-action="settings-close" aria-label="Close Settings">' + uiIcon('close') + '</button>' : ''}</div>`;
  }
  function openButton(row, label = 'Open Job') { return safeProjectId(row?.projectId) ? `<button data-action="open-job" data-project="${escapeHtml(row.projectId)}">${escapeHtml(label)}</button>` : ''; }
  function searchMarkup() { return `<form class="sc-search" data-sc-search-form><input name="projectId" inputmode="search" autocomplete="off" aria-label="Find a job" placeholder="Find a job"><button type="submit">Find</button></form>`; }

  function mainNavigationMarkup() {
    return '<div class="sc-nav-grid"><button data-action="view" data-view="recent"><strong>Jobs</strong><small>Recent work</small></button><button data-action="view" data-view="overview"><strong>Time</strong><small>Today and this week</small></button><button data-action="view" data-view="history"><strong>History</strong><small>Completed sessions</small></button><button data-action="view" data-view="settings"><strong>Settings</strong><small>Appearance and privacy</small></button></div>';
  }

  function currentStrip(timer, operational, selected) {
    if (!operational || operational.contextId === selected?.contextId) return '';
    return `<div class="sc-current-strip"><span title="${escapeHtml(operational.label)}">Working now · ${escapeHtml(operational.label)}</span></div>`;
  }

  function homeView(timer) {
    const operational = timer ? currentRow(timer) : null;
    const currentLabel = operational?.label || 'No current job';
    const currentDetail = operational
      ? `${statusLabel(operational.status)} · Today ${formatDuration(operational.todayMs, { compact: true })}${marker(operational)}`
      : 'Open a SquareCoil job to begin. ';
    return `<div class="sc-view sc-home-view">${viewHeader('Home')}<p class="sc-home-intro">Your time at a glance.</p><div class="sc-home-section">Current timer</div><div class="sc-home-current"><div class="sc-home-current-copy"><strong>${escapeHtml(currentLabel)}</strong><small>${escapeHtml(currentDetail)}</small></div>${operational ? `<span class="sc-home-current-time">${formatDuration(operational.todayMs)}</span>` : ''}<button data-action="view" data-view="main">View timer</button></div><div class="sc-home-section">Tools</div>${mainNavigationMarkup()}<div class="sc-home-section">Find a job</div>${searchMarkup()}</div>`;
  }

  function mainView(timer) {
    const selected = selectedRow(timer);
    const operational = currentRow(timer);
    if (!selected) return `<div class="sc-view"><div class="sc-empty"><strong>No recent jobs yet.</strong><br>Open a SquareCoil job to begin. Settings, history and local data tools are available now.</div>${mainNavigationMarkup()}${searchMarkup()}</div>`;
    const selectedOperational = selected.contextId === timer.currentContextId;
    const status = selected.status || 'NOT_RUNNING';
    const actions = [];
    if (selectedOperational && timer.availableActions?.localPause) actions.push(`<button class="sc-primary" data-action="timer" data-timer-action="pause">${uiIcon('pause')}<span>Pause locally</span></button>`);
    if (selectedOperational && timer.availableActions?.resume) { actions.push('<button class="sc-primary" data-action="timer" data-timer-action="resume">Resume</button>'); actions.push('<button data-action="timer" data-timer-action="fresh">Start fresh</button>'); }
    if (selectedOperational && timer.availableActions?.localResume) actions.push('<button class="sc-primary" data-action="timer" data-timer-action="localResume">Resume locally</button>');
    const open = safeProjectId(selected.projectId) ? `<button data-action="open-job" data-project="${escapeHtml(selected.projectId)}">${uiIcon('external')}<span>Open Job</span></button>` : ''; if (open) actions.push(open);
    actions.push(`<button data-action="context-detail" data-context="${escapeHtml(selected.contextId)}">${uiIcon('info')}<span>Details</span></button>`);
    const pending = selectedOperational && timer.pending ? `<div class="sc-note">Choose Resume or Start fresh. Time is not added until you choose.</div>` : '';
    const hold = selected.isSafetyHeld ? '<div class="sc-note">Time is paused here while Companion verifies the page. Your SquareCoil clock was not changed.</div>' : '';
    const native = timer.nativeDisposition && timer.nativeDisposition !== 'TRACKABLE_CONTEXT'
      ? '<div class="sc-note">Tracking isn’t available on this page.</div>' : '';
    const jobId = selected.kind === 'job' ? `<span class="sc-job-id">Job ${escapeHtml(selected.projectId)}</span>` : '';
    const viewCurrent = operational && operational.contextId !== selected.contextId
      ? `<button class="sc-view-current" data-action="select" data-context="${escapeHtml(operational.contextId)}" aria-label="View current job, ${escapeHtml(operational.label)}">View current</button>` : '';
    return `<div class="sc-view">${currentStrip(timer, operational, selected)}<section class="sc-timer-card" data-threshold="${escapeHtml(selected.thresholdLevel || 'NONE')}"><div class="sc-timer-heading"><div class="sc-job-identity">${jobId}<div class="sc-title-clip" title="${escapeHtml(selected.label)}"><div class="sc-title">${escapeHtml(selected.label)}</div></div></div><div class="sc-status" data-tone="${statusTone(status)}"><span class="sc-dot" data-tone="${statusTone(status)}"></span>${escapeHtml(statusLabel(status))}</div></div><div class="sc-metrics"><div class="sc-metric"><span class="sc-eyebrow sc-visually-hidden">Today</span><strong>${formatDuration(selected.todayMs)}${selected.isProvisional ? '*' : ''}</strong></div><div class="sc-total-area">${viewCurrent}<div class="sc-metric sc-metric-total"><span class="sc-eyebrow">${selected.kind === 'job' ? 'Job total' : 'Total'}</span><strong>${formatDuration(selected.totalMs)}${selected.isProvisional ? '*' : ''}</strong></div></div></div>${pending}${hold}${native}<div class="sc-actions">${busyAction ? '<button disabled>Working…</button>' : actions.join('')}</div></section><details class="sc-quick-links"${quickToolsOpen ? ' open' : ''}><summary>More tools</summary><div class="sc-tool-panel"><div class="sc-tool-buttons"><button data-action="view" data-view="recent">${uiIcon('jobs')}<span>Jobs</span></button><button data-action="view" data-view="overview">${uiIcon('timer')}<span>Overview</span></button><button data-action="view" data-view="history">${uiIcon('history')}<span>History</span></button></div>${searchMarkup()}</div></details></div>`;
  }

  function recentView(timer, core) {
    const rows = eligibleRows(timer);
    const workspace = deriveTabWorkspace(rows, { hiddenContextIds: [...hiddenTabs], durableOrder, selectedContextId, operationalContextId: timer.currentContextId });
    return `<div class="sc-view">${viewHeader('Recent Jobs')}<div class="sc-actions"><button data-action="data-simple" data-data-type="${DATA_COMMANDS.ARCHIVE_ELIGIBLE}">Archive eligible</button><button data-action="data-simple" data-data-type="${DATA_COMMANDS.CLEAR_RECENT}">Clear list</button></div><div class="sc-note">Clearing this list keeps your saved time.</div><div class="sc-list-scroll" data-sc-list="recent" role="region" aria-label="Recent jobs" tabindex="0">${rows.length ? rows.map(row => {
      const disposition = workspace.dispositionByContextId[row.contextId] || 'OVERFLOW';
      const archiveEligibility = archiveGestureEligibility(core, row.contextId, { snapshotStale, busy: Boolean(busyAction) });
      return `<div class="sc-row"><div><div class="sc-row-title">${escapeHtml(row.label)}</div><div class="sc-row-meta">Today ${formatDuration(row.todayMs, { compact: true })}${marker(row)} · Total ${formatDuration(row.totalMs, { compact: true })} · ${escapeHtml(statusLabel(row.status))}</div><div class="sc-row-meta">Last seen ${escapeHtml(formatDateTime(row.lastSeenAtMs))} · Last recorded ${escapeHtml(formatDateTime(row.lastRecordedActivityAtMs))} · ${escapeHtml(disposition.toLowerCase())}</div></div><div class="sc-row-actions"><button data-action="select" data-context="${escapeHtml(row.contextId)}">View</button><button data-action="data-context" data-data-type="${DATA_COMMANDS.ARCHIVE_CONTEXT}" data-context="${escapeHtml(row.contextId)}" title="${escapeHtml(archiveEligibility.message)}" ${archiveEligibility.eligible ? '' : 'disabled'}>Archive</button>${disposition !== 'VISIBLE' ? `<button data-action="show-tab" data-context="${escapeHtml(row.contextId)}">Show in Tabs</button>` : ''}${openButton(row, 'Open')}</div></div>`;
    }).join('') : '<div class="sc-empty">No recent jobs in the workspace.</div>'}</div></div>`;
  }

  function overviewView(timer) {
    const rows = timer.todayByContext || [];
    const basis = timer.timeBasis?.disclosed ? `<div class="sc-note">Workday time zone: ${escapeHtml(timer.timeBasis.label)}${timer.timeBasis.deviceMismatch ? ` · Your device: ${escapeHtml(timer.timeBasis.deviceTimeZone)}` : ''}</div>` : '';
    return `<div class="sc-view">${viewHeader('Time Overview')}<div class="sc-summary-grid"><div class="sc-summary"><span class="sc-eyebrow">Today total</span><strong>${formatDuration(timer.todayTotalMs)}${timer.todayTotalIsProvisional ? '*' : ''}</strong></div><div class="sc-summary"><span class="sc-eyebrow">This week</span><strong>${formatDuration(timer.weekTotalMs)}${timer.weekTotalIsProvisional ? '*' : ''}</strong></div></div><div class="sc-eyebrow">Today by job</div><div class="sc-list-scroll" data-sc-list="overview" role="region" aria-label="Today by job" tabindex="0">${rows.length ? rows.map(row => `<div class="sc-row"><div><div class="sc-row-title">${escapeHtml(row.label)}</div><div class="sc-row-meta">${escapeHtml(statusLabel(row.status))}${marker(row)}</div></div><button data-action="context-detail" data-context="${escapeHtml(row.contextId)}">${formatDuration(row.durationMs, { compact: true })}</button></div>`).join('') : '<div class="sc-empty">No Companion time recorded today.</div>'}</div><div class="sc-nav-grid"><button data-action="view" data-view="by-day"><strong>By Day</strong><small>Daily totals</small></button><button data-action="view" data-view="by-context"><strong>By job</strong><small>Job totals</small></button></div>${basis}<div class="sc-note">Companion tracks your own time. SquareCoil’s official time is unchanged.</div></div>`;
  }

  function byDayView(timer) {
    const rows = timer.byDayRows || [];
    return `<div class="sc-view">${viewHeader('By Day', 'overview')}${rows.length ? rows.map(row => `<div class="sc-row"><div><div class="sc-row-title">${escapeHtml(row.localDate)}</div><div class="sc-row-meta">${row.contextCount} job${row.contextCount === 1 ? '' : 's'}${row.topContextLabel ? ` · top ${escapeHtml(row.topContextLabel)} ${formatDuration(row.topContextDurationMs, { compact: true })}` : ''}</div></div><strong>${formatDuration(row.durationMs, { compact: true })}</strong></div>`).join('') : '<div class="sc-empty">No daily time yet.</div>'}</div>`;
  }

  function byContextView(timer) {
    const rows = timer.byContextRows || [];
    return `<div class="sc-view">${viewHeader('By job', 'overview')}${rows.length ? rows.map(row => `<div class="sc-row"><div><div class="sc-row-title">${escapeHtml(row.label)}</div><div class="sc-row-meta">Today ${formatDuration(row.todayMs, { compact: true })} · Last active ${escapeHtml(formatDateTime(row.lastRecordedActivityAtMs))}${row.legacyUnattributedMs ? ` · Earlier time ${formatDuration(row.legacyUnattributedMs, { compact: true })}` : ''}</div></div><button data-action="context-detail" data-context="${escapeHtml(row.contextId)}">${formatDuration(row.totalMs, { compact: true })}</button></div>`).join('') : '<div class="sc-empty">No time recorded yet.</div>'}</div>`;
  }

  function historyView(timer) {
    const rows = timer.historyRows || [];
    return `<div class="sc-view">${viewHeader('History')}<div class="sc-list-scroll" data-sc-list="history" role="region" aria-label="Completed sessions" tabindex="0">${rows.length ? rows.map(row => `<div class="sc-row" data-history-session="${escapeHtml(row.sessionId || '')}"><div><div class="sc-row-title">${escapeHtml(row.label)}</div><div class="sc-row-meta">${escapeHtml(row.localDates?.join(' → ') || row.localDate)} · ${escapeHtml(formatClockTime(row.startAtMs))} to ${escapeHtml(formatClockTime(row.endAtMs))}</div></div><strong>${formatDuration(row.durationMs, { compact: true })}</strong></div>`).join('') : '<div class="sc-empty">No completed Companion sessions yet.</div>'}</div>${timer.historyHasMore ? `<div class="sc-actions"><button data-action="load-history">Load more (${timer.historyRows.length} of ${timer.historyTotal})</button></div>` : ''}<div class="sc-note">Current work stays on the timer until the session is complete.</div></div>`;
  }

  function contextDetailView(timer) {
    const detail = timer.contextDetails?.[selectedContextId] || null;
    if (!detail) return `<div class="sc-view">${viewHeader('Details', detailReturnView)}<div class="sc-empty">No matching job found.</div></div>`;
    return `<div class="sc-view">${viewHeader('Details', detailReturnView)}<div class="sc-title">${escapeHtml(detail.label)}</div><div class="sc-status" data-tone="${statusTone(detail.status)}">${escapeHtml(statusLabel(detail.status))}${marker(detail)}</div><div class="sc-summary-grid"><div class="sc-summary"><span class="sc-eyebrow">Recorded Today</span><strong>${formatDuration(detail.todayMs)}</strong></div><div class="sc-summary"><span class="sc-eyebrow">This Week</span><strong>${formatDuration(detail.weekMs)}</strong></div><div class="sc-summary"><span class="sc-eyebrow">Total</span><strong>${formatDuration(detail.totalMs)}</strong></div><div class="sc-summary"><span class="sc-eyebrow">Dated history</span><strong>${formatDuration(detail.datedMs)}</strong></div></div>${detail.legacyUnattributedMs ? `<div class="sc-note">Undated time: ${formatDuration(detail.legacyUnattributedMs)}. Included in the total only.</div>` : ''}<div class="sc-eyebrow" style="margin-top:12px">Daily totals</div>${detail.dailyRows?.length ? detail.dailyRows.slice().reverse().map(day => `<div class="sc-row"><span>${escapeHtml(day.localDate)}</span><strong>${formatDuration(day.durationMs, { compact: true })}</strong></div>`).join('') : '<div class="sc-empty">No daily history yet.</div>'}<div class="sc-eyebrow" style="margin-top:12px">Past sessions</div>${detail.finalizedSessions?.length ? detail.finalizedSessions.slice(0, 20).map(session => `<div class="sc-row"><span>${escapeHtml(formatDateTime(session.endAtMs))}</span><strong>${formatDuration(session.durationMs, { compact: true })}</strong></div>`).join('') : '<div class="sc-empty">No past sessions.</div>'}<div class="sc-actions">${openButton(detail)}</div></div>`;
  }

  function settingsNav(viewName, title, detail) {
    return `<button data-action="settings-route" data-view="${escapeHtml(viewName)}"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></button>`;
  }

  function settingsUnavailable(title, detail) {
    return `<div class="sc-unavailable" aria-disabled="true"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></div>`;
  }

  function settingsGroup(group, title, summary, contents) {
    const expanded = expandedSettingsGroup === group;
    const panelId = `sc-settings-group-${group}`;
    return `<section class="sc-settings-group" data-group="${escapeHtml(group)}" data-expanded="${expanded}"><button class="sc-settings-group-toggle" data-action="settings-toggle-group" data-group="${escapeHtml(group)}" aria-expanded="${expanded}" aria-controls="${panelId}"><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(summary)}</small></span><svg class="sc-settings-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="m6.5 8 3.5 3.5L13.5 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="sc-settings-group-panel" id="${panelId}" role="region" aria-label="${escapeHtml(title)} settings"${expanded ? '' : ' hidden'}><div class="sc-nav-grid">${contents}</div></div></section>`;
  }

  function websiteThemeLabel(value) {
    return ({
      ORIGINAL: 'Original',
      SLEEK_DARK: 'Dark Glass',
      LIGHT_GLASS: 'Light Glass',
      REFINED_LIGHT: 'Refined Light'
    })[value] || 'Original';
  }

  function optionalStateLabel(feature) {
    const state = String(feature?.state || 'DISABLED');
    if (state === 'APPLIED') return 'On';
    if (state === 'PARTIAL_SAFE') return 'Limited on this page';
    if (state === 'DEGRADED_FALLBACK') return 'Built-in gradient fallback';
    if (state === 'SUSPENDED_ACCESSIBILITY') return 'Off for accessibility';
    if (state === 'SUSPENDED_THEME') return 'Choose a Glass theme first';
    if (state === 'INACTIVE_PAGE') return 'Ready on supported pages';
    return 'Off';
  }

  function cinematicStateLabel(feature) {
    const state = String(feature?.state || 'DISABLED');
    const source = String(feature?.source || 'NONE');
    const reason = String(feature?.reason || '');
    const status = String(feature?.statusCode || '');
    const failure = String(feature?.failureCode || '');
    if (status === 'ACCESSIBILITY_OVERRIDE' || state === 'SUSPENDED_ACCESSIBILITY') return 'Accessibility override; built-in background only';
    if (status === 'BING_IMAGE_ACTIVE' || (state === 'SHOWING' && source === 'REMOTE')) return 'Bing image active';
    if (status === 'RECENT_CACHED_BING_IMAGE_ACTIVE' || (state === 'SHOWING' && source === 'CACHE_FRESH')) return 'Recent cached Bing image active';
    if (status === 'OLDER_CACHED_BING_IMAGE_RETAINED' || state === 'DEGRADED_CACHE' || ['CACHE_RETAINED', 'CACHE'].includes(source)) {
      if (failure === 'BING_ACCESS_RESTRICTED' || /permission|access/i.test(reason)) return 'Older cached Bing image retained after a failure; Bing access restricted by browser';
      if (failure === 'BING_RESPONSE_REJECTED' || /rejected/i.test(reason)) return 'Older cached Bing image retained after a failure; Bing response rejected';
      return 'Older cached Bing image retained after a failure; network unavailable';
    }
    if (status === 'BING_ACCESS_RESTRICTED' || /bing-origin-access-restricted/.test(reason)) return 'Bing access restricted by browser; built-in gradient fallback active';
    if (status === 'BING_RESPONSE_REJECTED' || /bing-response-rejected/.test(reason)) return 'Bing response rejected; built-in gradient fallback active';
    if (status === 'NETWORK_UNAVAILABLE' || /network-unavailable/.test(reason)) return 'Network unavailable; built-in gradient fallback active';
    if (state === 'DEGRADED_FALLBACK' || source === 'FALLBACK') return 'Built-in gradient fallback active';
    if (state === 'LOADING_INITIAL' || state === 'LOADING' || state === 'REFRESHING') return 'Loading Bing image; built-in gradient fallback active';
    if (state === 'SUSPENDED_THEME') return 'Choose Dark Glass or Light Glass to use a Bing background';
    if (state === 'INACTIVE_PAGE') return 'Bing background ready on supported SquareCoil pages';
    return 'Background off';
  }

  function settingsView() {
    const appearanceSummary = `${theme === 'AUTO' ? 'System' : theme === 'DARK' ? 'Dark' : theme === 'CLEAR' ? 'Clear' : 'Light'} Companion · ${websiteThemeLabel(websiteTheme)}`;
    const companionFinishLabel = theme === 'CLEAR' ? 'Transparent glass' : `${surface === 'GLASS' ? 'Glass' : 'Solid'} panel finish`;
    const appearanceRoutes = `${settingsNav('timer-appearance', 'Companion appearance', companionFinishLabel)}${settingsNav('website-theme', 'SquareCoil theme', websiteThemeLabel(websiteTheme))}`;
    const featureRoutes = `${settingsNav('dashboard', 'Analytics dashboard', dashboardEnabled ? 'On' : 'Off')}${settingsNav('design-dashboard', 'Dashboard restyle', dashboardProfile === 'ON' ? 'On · Dark Glass' : 'Off')}${settingsNav('quick-file-paths', 'Quick file paths', quickFilePathsEnabled ? 'On · Design and project pages' : 'Off')}${settingsNav('quick-clock', 'Quick clock controls', quickClockControlsEnabled ? 'On · SquareCoil clock' : 'Off')}${settingsUnavailable('Design page layout', 'Coming soon · scan and copy')}${settingsUnavailable('Sidebar menu toggle', 'Coming soon · hide menus')}`;
    const timeRoutes = `${settingsNav('overview', 'Time overview', 'Today, week, day and job')}${settingsNav('history', 'History', 'Past sessions')}${settingsNav('timer-limits', 'Time color limits', `${limitDraft?.yellowMinutes ?? 60} / ${limitDraft?.orangeMinutes ?? 120} / ${limitDraft?.redMinutes ?? 240} min`)}`;
    const jobRoutes = `${settingsNav('recent', 'Recent jobs', 'Manage recent jobs')}${settingsUnavailable('Watched-job changes', 'Coming soon')}`;
    const helpRoutes = `${settingsNav('submit-ticket', 'Submit a ticket', `Email ${SUPPORT_EMAIL}`)}${settingsNav('send-feedback', 'Send feedback', 'Suggestion, UI / UX or feature idea')}${settingsNav('advanced-diagnostics', 'Technical details', 'Connection and troubleshooting')}${settingsNav('developer-support', 'Support the developer', 'Free app · optional tips')}`;
    return `<div class="sc-view">${viewHeader('Settings')}<div class="sc-settings-list">${settingsGroup('appearance', 'Appearance', appearanceSummary, appearanceRoutes)}${settingsGroup('features', 'Features', 'Dashboard and job-page tools', featureRoutes)}${settingsGroup('time', 'Time tracking', 'Totals, history and color limits', timeRoutes)}${settingsGroup('jobs', 'Jobs', 'Recent jobs', jobRoutes)}${settingsGroup('notifications', 'Notifications', 'SquareCoil alerts', settingsUnavailable('SquareCoil alerts', 'Coming soon'))}${settingsGroup('privacy', 'Privacy and data', 'Backups, restore and cleanup', settingsNav('data-tools', 'Local data and backups', 'Export, restore and cleanup'))}${settingsGroup('help', 'Help', 'Support and feedback', helpRoutes)}</div></div>`;
  }

  function choiceMarkup(action, values, current) {
    const disabled = busyAction ? ' disabled aria-disabled="true"' : '';
    return `<div class="sc-choice sc-choice-three">${values.map(([value, label]) => `<button data-action="${action}" data-value="${value}" data-active="${current === value}"${disabled}>${label}</button>`).join('')}</div>`;
  }

  function timerAppearanceView() {
    const effectiveTheme = presentation?.timerAppearanceEffective || theme;
    const effectiveFinish = presentation?.panelFinishEffective || surface;
    const finishNote = (surface === 'GLASS' || theme === 'CLEAR') && effectiveFinish === 'SOLID_FALLBACK'
      ? '<div class="sc-note">Glass is selected, but this browser or accessibility mode currently uses a readable Solid fallback.</div>' : '';
    return `<div class="sc-view">${viewHeader('Companion appearance', 'settings')}<div class="sc-eyebrow">Color</div>${choiceMarkup('preference', [['LIGHT', 'Light'], ['CLEAR', 'Clear'], ['DARK', 'Dark'], ['AUTO', 'System']], theme)}<div class="sc-note">System follows your browser or operating-system appearance.</div><div class="sc-eyebrow sc-section-label">Panel finish</div>${theme === 'CLEAR' ? '<div class="sc-note">Transparent glass, like the prototype.</div>' : choiceMarkup('preference-finish', [['SOLID', 'Solid'], ['GLASS', 'Glass']], surface)}${finishNote}</div>`;
  }

  function dashboardView() {
    const analytics = presentation?.optional?.analytics || {};
    const state = analytics.state || 'DISABLED';
    const status = state === 'APPLIED' ? 'Visible on this page'
      : state === 'INACTIVE_PAGE' ? 'Ready on the SquareCoil dashboard'
        : dashboardEnabled ? 'Waiting for a supported dashboard and Companion data' : 'Off';
    return `<div class="sc-view">${viewHeader('Analytics dashboard', 'settings')}<div class="sc-eyebrow">Show on SquareCoil</div>${choiceMarkup('preference-dashboard', [['true', 'On'], ['false', 'Off']], String(dashboardEnabled))}<div class="sc-note" role="status">${escapeHtml(status)}. The dashboard appears beneath SquareCoil’s shortcuts and shows your recorded Companion time.</div><div class="sc-eyebrow sc-section-label">Dashboard appearance</div>${choiceMarkup('preference-dashboard-appearance', [['SITE', 'Website'], ['LIGHT', 'Light'], ['DARK', 'Dark']], dashboardAppearance)}<div class="sc-note">Website follows the selected SquareCoil theme. Light and Dark apply only to the analytics dashboard.</div></div>`;
  }

  function designDashboardView() {
    const profile = presentation?.optional?.dashboard || {};
    const status = profile.state === 'APPLIED' ? 'Active on this dashboard'
      : profile.state === 'PARTIAL_SAFE' ? 'Available on parts of this page'
        : dashboardProfile === 'ON' ? 'Ready on the Design dashboard with Dark Glass' : 'Off';
    return `<div class="sc-view">${viewHeader('Dashboard restyle', 'settings')}<div class="sc-eyebrow">Design dashboard</div>${choiceMarkup('preference-design-dashboard', [['OFF', 'Off'], ['ON', 'On']], dashboardProfile)}<div class="sc-note" role="status">${escapeHtml(status)}. Changes the dashboard’s look and adds a time summary.</div><div class="sc-note">This does not change an individual job’s Design page. Analytics is a separate feature.</div></div>`;
  }

  function quickFilePathsView() {
    const paths = presentation?.optional?.quickFilePaths || {};
    const status = !quickFilePathsEnabled ? 'Off' : paths.state === 'APPLIED' ? 'Files found on this page'
      : paths.state === 'EMPTY' ? 'No paths or links found here'
        : paths.state === 'SOURCE_MISSING' ? 'No supported job details on this page'
          : 'Ready on job Design and project pages';
    return `<div class="sc-view">${viewHeader('Quick file paths', 'settings')}<div class="sc-eyebrow">Show quick files</div>${choiceMarkup('preference-quick-files', [['true', 'On'], ['false', 'Off']], String(quickFilePathsEnabled))}<div class="sc-note" role="status">${escapeHtml(status)}.</div><div class="sc-note">Finds paths and links in Design Description and project Important Details. Copy file paths or open web links from the page.</div></div>`;
  }

  function quickClockView() {
    return `<div class="sc-view">${viewHeader('Quick clock controls', 'settings')}<div class="sc-eyebrow">SquareCoil clock shortcut</div>${choiceMarkup('preference-quick-clock', [['true', 'On'], ['false', 'Off']], String(quickClockControlsEnabled))}<div class="sc-note">A clock button appears in Companion’s top bar. It takes you to SquareCoil’s clock controls; you choose Clock in or Clock out there.</div>${quickClockControlsEnabled ? `<div class="sc-actions"><button class="sc-primary" data-action="open-native-clock">${uiIcon('timer')}<span>Find clock controls</span></button></div>` : ''}</div>`;
  }

  function websiteThemeView() {
    const cinematic = presentation?.optional?.cinematic || {};
    return `<div class="sc-view">${viewHeader('SquareCoil theme', 'settings')}<div class="sc-theme-list">${[
      ['ORIGINAL', 'Native / Off', 'Use SquareCoil as provided.'],
      ['SLEEK_DARK', 'Dark Glass', 'A darker, softer SquareCoil workspace'],
      ['LIGHT_GLASS', 'Light Glass', 'A brighter, softer SquareCoil workspace'],
      ['REFINED_LIGHT', 'Refined Light', 'v1.0.1 · bright, high-clarity workspace']
    ].map(([value, label, detail]) => `<button class="sc-theme-choice" data-action="preference-site" data-value="${value}" data-active="${websiteTheme === value}"${busyAction ? ' disabled aria-disabled="true"' : ''}><span class="sc-theme-swatch" data-theme-swatch="${value}" aria-hidden="true"></span><span><strong>${label}</strong><small>${detail}</small></span><span class="sc-radio" aria-hidden="true"></span></button>`).join('')}</div><div class="sc-note"><strong>Background status:</strong> ${escapeHtml(cinematicStateLabel(cinematic))}.</div><div class="sc-note">To turn Bing photos on or off, open Companion from Chrome’s toolbar and use the switch beside the theme choice. Glass keeps a built-in background when photos are off or unavailable. Image requests contain no job, timer, page, or account data.</div></div>`;
  }

  function timerLimitsView() {
    const draft = limitDraft || { ...DEFAULT_PREFERENCES, baseRevision: preferenceRevision, dirty: false };
    const stale = draft.dirty && draft.baseRevision !== preferenceRevision;
    return `<div class="sc-view">${viewHeader('Time color limits', 'settings')}<form data-sc-limits-form><div class="sc-field-grid"><label>Yellow minutes<input type="number" min="1" step="1" name="yellowMinutes" value="${escapeHtml(draft.yellowMinutes)}"></label><label>Orange minutes<input type="number" min="1" step="1" name="orangeMinutes" value="${escapeHtml(draft.orangeMinutes)}"></label><label>Red minutes<input type="number" min="1" step="1" name="redMinutes" value="${escapeHtml(draft.redMinutes)}"></label></div>${stale ? '<div class="sc-note">Settings changed in another tab. Reopen this form before saving.</div>' : ''}<div class="sc-actions"><button class="sc-primary" type="submit" ${stale ? 'disabled' : ''}>Save limits</button><button type="button" data-action="reset-limits">Reset to 60 / 120 / 240</button></div></form><div class="sc-note">These limits change tab colors only. They never change recorded time.</div></div>`;
  }

  function supportView(kind) {
    const draft = supportDrafts[kind];
    const ticket = kind === 'ticket';
    const choices = ticket ? TICKET_TYPES : FEEDBACK_CATEGORIES;
    const title = ticket ? 'Submit a Ticket' : 'Send Feedback';
    const categoryLabel = ticket ? 'Type' : 'Category';
    const diagnostics = draft.includeDiagnostics && draft.diagnostics
      ? `<pre class="sc-diagnostics" data-sc-diagnostics>${escapeHtml(draft.diagnostics.text)}</pre>` : '';
    return `<div class="sc-view">${viewHeader(title, 'settings')}<div class="sc-note">This opens an email draft addressed to ${SUPPORT_EMAIL}. Companion never sends it automatically; review and send it in your mail app.</div><form data-sc-support-form data-support-kind="${kind}"><label>${categoryLabel}<select name="category" data-support-field="category">${choices.map(value => `<option value="${escapeHtml(value)}" ${draft.category === value ? 'selected' : ''}>${escapeHtml(value)}</option>`).join('')}</select></label><label>Subject${ticket ? '' : ' (optional)'}<input name="subject" maxlength="160" value="${escapeHtml(draft.subject)}" data-support-field="subject"></label><label>Description<textarea name="description" maxlength="12000" rows="7" data-support-field="description">${escapeHtml(draft.description)}</textarea></label><label class="sc-check"><input type="checkbox" name="includeDiagnostics" data-support-field="includeDiagnostics" ${draft.includeDiagnostics ? 'checked' : ''}> Include privacy-safe diagnostics</label>${diagnostics}${supportMessage ? `<div class="sc-note">${escapeHtml(supportMessage)}</div>` : ''}${supportManualCopy ? `<pre class="sc-diagnostics" data-sc-manual-copy>${escapeHtml(supportManualCopy)}</pre>` : ''}<div class="sc-actions"><button class="sc-primary" type="submit">Open Email Draft</button><button type="button" data-action="copy-message" data-support-kind="${kind}">Copy Message</button><button type="button" data-action="copy-support-email">Copy Support Email</button>${draft.includeDiagnostics ? `<button type="button" data-action="refresh-diagnostics" data-support-kind="${kind}">Refresh Diagnostics</button><button type="button" data-action="copy-diagnostics" data-support-kind="${kind}">Copy Diagnostics</button>` : ''}</div></form></div>`;
  }

  function developerSupportView() {
    return `<div class="sc-view">${viewHeader('Support the Developer', 'settings')}<div class="sc-title">Free app. Free updates. Optional tips.</div><div class="sc-note">The tiny development gremlins appreciate caffeine, but every Companion feature remains available whether or not you tip.</div><div class="sc-empty">Tips aren’t available yet.</div></div>`;
  }

  function advancedDiagnosticsView(core) {
    const status = friendlyCompanionStatus(core, core?.timer);
    const diagnostics = frozenDiagnostics();
    return `<div class="sc-view">${viewHeader('Advanced diagnostics', 'settings')}<section class="sc-health-summary" data-tone="${status.tone}"><span class="sc-health-icon" aria-hidden="true">${status.tone === 'positive' ? '✓' : '!'}</span><div><strong>${escapeHtml(status.label)}</strong><small>${escapeHtml(status.message)}</small></div></section><details class="sc-technical"${advancedDiagnosticsOpen ? ' open' : ''}><summary>Technical details</summary><p>Privacy-safe status only. Job names, customer data, page content and account tokens are excluded.</p><pre class="sc-diagnostics" data-sc-advanced-diagnostics>${escapeHtml(diagnostics.text)}</pre></details>${supportMessage ? `<div class="sc-note">${escapeHtml(supportMessage)}</div>` : ''}${supportManualCopy ? `<pre class="sc-diagnostics" data-sc-manual-copy>${escapeHtml(supportManualCopy)}</pre>` : ''}<div class="sc-actions"><button class="sc-primary" data-action="copy-advanced-diagnostics">Copy diagnostics</button><button data-action="sync">Refresh status</button></div></div>`;
  }

  function conflictMarkup() {
    if (invalidCsvRows) {
      const shown = invalidCsvRows.rows.map(item => `<div class="sc-row"><div><div class="sc-row-title">Row ${escapeHtml(item.row)}</div><div class="sc-row-meta">${escapeHtml(item.code)}</div></div></div>`).join('');
      return `<div class="sc-note"><strong>History CSV needs correction.</strong> ${invalidCsvRows.count} invalid row${invalidCsvRows.count === 1 ? '' : 's'} found. Nothing was imported. Fix the file and try again.</div>${shown}${invalidCsvRows.count > invalidCsvRows.rows.length ? `<div class="sc-note">Showing the first ${invalidCsvRows.rows.length} rows.</div>` : ''}`;
    }
    if (!pendingImport?.plan?.conflicts?.length) return '';
    return `<div class="sc-note"><strong>Import needs review.</strong> Nothing has been written.</div>${pendingImport.plan.conflicts.map(conflict => `<div class="sc-row"><div><div class="sc-row-title">${escapeHtml(conflict.code)}</div><div class="sc-row-meta">${escapeHtml(conflict.contextId || '')}${conflict.incomingSegmentId ? ` · incoming ${escapeHtml(conflict.incomingSegmentId)}` : ''}</div></div>${conflict.resolvable ? `<div class="sc-row-actions"><button data-action="resolve-conflict" data-conflict="${escapeHtml(conflict.id)}" data-resolution="KEEP_CURRENT">Keep Current</button><button data-action="resolve-conflict" data-conflict="${escapeHtml(conflict.id)}" data-resolution="USE_INCOMING">Use Incoming</button></div>` : '<span class="sc-status" data-tone="danger">Must fix file</span>'}</div>`).join('')}`;
  }

  function restoreOptionsMarkup() {
    const choice = (key, label) => `<label class="sc-check"><input type="checkbox" data-restore-option="${key}" ${backupRestoreOptions[key] ? 'checked' : ''}>${label}</label>`;
    return `<div class="sc-note"><strong>Merge backup options</strong>${choice('mergeWorkspace', 'Also restore saved job tabs and archive organization')}${choice('mergePreferences', 'Also restore saved settings')}</div><div class="sc-note"><strong>Replace backup options</strong>${choice('replaceWorkspace', 'Restore saved job tabs and archive organization')}${choice('replacePreferences', 'Restore saved settings')}${choice('replaceActivity', 'Restore saved activity log')}${choice('keepCurrentZone', 'Keep this device’s current time zone for future time')}</div>`;
  }

  function dataProgressMarkup() {
    if (!dataProgress) return '';
    const history = dataProgress.kind === 'HISTORY';
    const phases = {
      READING: ['Reading file', 1],
      CHECKING: [history ? 'Checking history' : 'Checking backup', 2],
      REVIEW: [history ? 'Review history import' : 'Review backup restore', 3],
      SAVING: [history ? 'Saving history' : 'Saving backup', 4],
      FINISHED: [history ? 'History import finished' : dataProgress.kind === 'EXPORT' ? 'File ready' : 'Backup restore finished', 4],
      EXPORTING: ['Preparing file', null],
      CANCELED: ['Import canceled', null],
      FAILED: ['Import needs attention', null]
    };
    const [label, step] = phases[dataProgress.phase] || phases.FAILED;
    const measured = dataProgress.phase === 'READING' && Number.isSafeInteger(dataProgress.loaded) &&
      Number.isSafeInteger(dataProgress.total) && dataProgress.total > 0;
    const percent = measured ? Math.min(100, Math.floor(dataProgress.loaded * 100 / dataProgress.total)) : null;
    const working = busyAction && ['READING', 'CHECKING', 'SAVING', 'EXPORTING'].includes(dataProgress.phase);
    const meter = working ? `<div class="sc-data-progress-meter" role="progressbar" aria-label="${label}"${measured ? ` aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" aria-valuetext="${dataProgress.loaded} of ${dataProgress.total} bytes read"` : ''}><span${measured ? ` style="width:${percent}%"` : ''} data-measured="${measured}"></span></div>` : '';
    return `<section class="sc-data-progress" data-sc-data-progress="${dataProgress.phase}" role="status" aria-live="polite" aria-atomic="true"><strong>${label}</strong>${step && dataProgress.kind !== 'EXPORT' ? `<small>Step ${step} of 4</small>` : ''}${measured ? `<small>${percent}% · ${dataProgress.loaded} of ${dataProgress.total} bytes read</small>` : ''}${dataProgress.detail ? `<p>${escapeHtml(dataProgress.detail)}</p>` : ''}${meter}</section>`;
  }

  function dataToolsView(core) {
    const data = core?.data;
    const archived = data?.archivedRows || [];
    const readiness = data ? (data.quiescent ? 'Cleanup is available' : 'Stop timing before replacing a backup or deleting all history') : 'Your data is not ready yet';
    return `<div class="sc-view">${viewHeader('Backups and data', 'settings')}${dataProgressMarkup()}${dataMessage ? `<div class="sc-note">${escapeHtml(dataMessage)}</div>` : ''}<fieldset class="sc-data-controls" ${busyAction ? 'disabled' : ''}><div class="sc-eyebrow">Your files</div><div class="sc-actions"><button data-action="data-export" data-export="FULL_BACKUP">Download backup</button><button data-action="data-export" data-export="HISTORY_CSV">Download history</button><button data-action="data-export" data-export="TIME_REPORT_CSV">Download report</button></div><div class="sc-actions"><button data-action="pick-file" data-file-mode="BACKUP_MERGE">Add from backup</button><button data-action="pick-file" data-file-mode="BACKUP_REPLACE" ${data?.quiescent ? '' : 'disabled'}>Replace from backup</button><button data-action="pick-file" data-file-mode="HISTORY_CSV">Import history</button></div>${restoreOptionsMarkup()}<input data-sc-data-file type="file" accept=".json,.csv,application/json,text/csv" hidden><div class="sc-note">Full Backup JSON saves Companion jobs, time history, settings, and the activity log without a live clock state. History CSV can restore finalized time. Time Report CSV is for spreadsheets only and cannot be imported.</div>${conflictMarkup()}<div class="sc-eyebrow" style="margin-top:12px">Archived in Companion</div>${archived.length ? archived.map(row => `<div class="sc-row"><div><div class="sc-row-title">${escapeHtml(row.label)}</div><div class="sc-row-meta">Total ${formatDuration(row.totalMs, { compact: true })} · archived ${escapeHtml(formatDateTime(row.archivedAtMs))}</div></div><div class="sc-row-actions"><button data-action="data-context" data-data-type="${DATA_COMMANDS.RESTORE_ARCHIVED}" data-context="${escapeHtml(row.contextId)}">Restore</button><button data-action="data-context" data-data-type="${DATA_COMMANDS.DELETE_CONTEXT}" data-context="${escapeHtml(row.contextId)}" data-label="${escapeHtml(row.label)}" ${row.protected ? 'disabled' : ''}>Delete data</button></div></div>`).join('') : '<div class="sc-empty">No archived jobs.</div>'}<div class="sc-eyebrow" style="margin-top:12px">Clear saved data</div><div class="sc-actions"><button data-action="data-simple" data-data-type="${DATA_COMMANDS.DELETE_ALL_ARCHIVED}" ${archived.length ? '' : 'disabled'}>Delete archived data</button><button data-action="data-simple" data-data-type="${DATA_COMMANDS.WIPE_HISTORY}" ${data?.quiescent ? '' : 'disabled'}>Delete all time history</button></div><div class="sc-note">${escapeHtml(readiness)}. These tools only affect Companion data; SquareCoil official time is never changed.</div></fieldset></div>`;
  }

  function unavailableMainView(core) {
    if (!core || (!core.initialized && !core.blocked && !String(core.status || '').includes('recover'))) {
      return `<div class="sc-view sc-loading-view"><div class="sc-loading-heading" role="status"><span class="sc-loading-spinner" aria-hidden="true"></span><div><strong>Loading…</strong></div></div><div class="sc-loading-card" aria-hidden="true"><span class="sc-skeleton sc-skeleton-label"></span><span class="sc-skeleton sc-skeleton-time"></span><div class="sc-loading-columns"><span class="sc-skeleton"></span><span class="sc-skeleton"></span></div></div><div class="sc-nav-grid"><button data-action="view" data-view="settings"><strong>Settings</strong><small>Appearance and support</small></button><button data-action="open-diagnostics"><strong>Technical details</strong><small>Status and support</small></button></div></div>`;
    }
    const status = friendlyCompanionStatus(core, null);
    const message = core?.blocked
      ? 'Companion paused time and data actions because a safety check needs attention. Appearance, support and privacy-safe diagnostics remain available.'
      : 'Companion is reconnecting to this page. Appearance, Settings and diagnostics remain available while time and data actions stay paused.';
    return `<div class="sc-view"><section class="sc-health-summary" data-tone="${status.tone}"><span class="sc-health-icon" aria-hidden="true">!</span><div><strong>${escapeHtml(status.label)}</strong><small>${escapeHtml(message)}</small></div></section><div class="sc-nav-grid" style="margin-top:10px"><button data-action="view" data-view="settings"><strong>Settings</strong><small>Appearance and support</small></button><button data-action="open-diagnostics"><strong>Technical details</strong><small>Status and support</small></button></div></div>`;
  }

  function bodyMarkup(timer, core) {
    if (view === 'home') return homeView(timer);
    if (!timer) {
      if (view === 'settings') return settingsView();
      if (view === 'timer-appearance') return timerAppearanceView();
      if (view === 'website-theme') return websiteThemeView();
      if (view === 'dashboard') return dashboardView();
      if (view === 'design-dashboard') return designDashboardView();
      if (view === 'quick-file-paths') return quickFilePathsView();
      if (view === 'quick-clock') return quickClockView();
      if (view === 'timer-limits') return timerLimitsView();
      if (view === 'submit-ticket') return supportView('ticket');
      if (view === 'send-feedback') return supportView('feedback');
      if (view === 'developer-support') return developerSupportView();
      if (view === 'advanced-diagnostics') return advancedDiagnosticsView(core);
      return unavailableMainView(core);
    }
    if (view === 'recent') return recentView(timer, core);
    if (view === 'overview') return overviewView(timer);
    if (view === 'by-day') return byDayView(timer);
    if (view === 'by-context') return byContextView(timer);
    if (view === 'history') return historyView(timer);
    if (view === 'context-detail') return contextDetailView(timer);
    if (view === 'settings') return settingsView();
    if (view === 'timer-appearance') return timerAppearanceView();
    if (view === 'website-theme') return websiteThemeView();
    if (view === 'dashboard') return dashboardView();
    if (view === 'design-dashboard') return designDashboardView();
    if (view === 'quick-file-paths') return quickFilePathsView();
    if (view === 'quick-clock') return quickClockView();
    if (view === 'timer-limits') return timerLimitsView();
    if (view === 'submit-ticket') return supportView('ticket');
    if (view === 'send-feedback') return supportView('feedback');
    if (view === 'developer-support') return developerSupportView();
    if (view === 'data-tools') return dataToolsView(core);
    if (view === 'advanced-diagnostics') return advancedDiagnosticsView(core);
    return mainView(timer);
  }

  function archiveNoticeMarkup() {
    if (!archiveNotice) return '';
    return `<div class="sc-archive-notice" role="status"><span><strong>${escapeHtml(archiveNotice.label)}</strong> was archived. Its Companion time and history are still saved.</span><button data-action="undo-archive" data-context="${escapeHtml(archiveNotice.contextId)}">Undo</button></div>`;
  }

  const FOCUS_DATA_KEYS = Object.freeze(['action', 'context', 'view', 'timerAction', 'dataType', 'value', 'group', 'supportKind', 'supportField']);

  function captureFocusDescriptor(target) {
    const node = document.activeElement;
    if (!node || !target?.contains?.(node)) return null;
    const data = {};
    for (const key of FOCUS_DATA_KEYS) {
      if (node.dataset?.[key] !== undefined) data[key] = String(node.dataset[key]);
    }
    return Object.freeze({
      tagName: String(node.tagName || '').toLowerCase(),
      name: node.getAttribute?.('name') || null,
      role: node.getAttribute?.('role') || null,
      data: Object.freeze(data)
    });
  }

  function findFocusDescriptor(target, descriptor) {
    if (!descriptor) return null;
    const candidates = Array.from(target.querySelectorAll?.('button,input,select,textarea,summary,[tabindex]') || []);
    return candidates.find(node => {
      if (descriptor.tagName && String(node.tagName || '').toLowerCase() !== descriptor.tagName) return false;
      if ((node.getAttribute?.('name') || null) !== descriptor.name || (node.getAttribute?.('role') || null) !== descriptor.role) return false;
      return Object.entries(descriptor.data).every(([key, value]) => String(node.dataset?.[key]) === value);
    }) || null;
  }

  function render({ allowInteractionDeferral = false } = {}) {
    if (disposed) return;
    const target = mountRoot(); if (!target) return;
    // Replacing the subtree detaches the native drag source. Every render path,
    // including async completions and notice timers, must wait for dragend/drop.
    if (draggedContextId) return;
    if (allowInteractionDeferral && (pendingFileMode || target.querySelector?.('input:focus, textarea:focus, select:focus'))) return;
    const quickTools = target.querySelector?.('.sc-quick-links');
    if (quickTools) quickToolsOpen = quickTools.open === true;
    const technicalDetails = target.querySelector?.('.sc-technical');
    if (technicalDetails) advancedDiagnosticsOpen = technicalDetails.open === true;
    const retainedFocus = captureFocusDescriptor(target);
    const outgoingViewKey = target.querySelector?.('.sc-view')?.dataset.scViewKey;
    const navigationChanged = outgoingViewKey && outgoingViewKey.split(':')[0] !== view;
    const outgoingText = navigationChanged ? captureDockText(target) : null;
    const previousScroll = target.querySelector?.('.sc-content')?.scrollTop || 0;
    const previousListScroll = new Map(Array.from(target.querySelectorAll?.('.sc-list-scroll[data-sc-list]') || [])
      .map(node => [node.dataset.scList, node.scrollTop]));
    const previousTabScroll = target.querySelector?.('.sc-tabs')?.scrollLeft || 0;
    const core = readCoreSnapshot();
    const timer = core?.timer || null;
    if (timer) { syncSelection(timer); flushDeferredFocus(timer); }
    target.dataset.protoTheme = String(presentation?.timerAppearanceEffective || theme).toLowerCase();
    target.dataset.protoSurface = String(presentation?.panelFinishEffective || (theme === 'CLEAR' ? 'GLASS' : surface)).startsWith('GLASS') ? 'glass' : 'solid';
    target.dataset.protoCollapsed = collapsed ? 'true' : 'false';
    target.dataset.protoMenu = SETTINGS_VIEW_IDS.has(view) || view === 'home' ? 'true' : 'false';
    target.dataset.workspaceState = snapshotStale ? 'stale' : timer ? 'loaded' : core?.blocked ? 'blocked' : 'loading';
    target.dataset.busy = busyAction ? 'true' : 'false';
    target.setAttribute?.('aria-busy', busyAction ? 'true' : 'false');
    const tabs = timer ? tabMarkup(timer, core) : '';
    target.dataset.hasTabs = tabs ? 'true' : 'false';
    target.dataset.dragging = draggedContextId ? 'true' : 'false';
    const friendlyStatus = friendlyCompanionStatus(core, timer);
    const basis = timer?.timeBasis?.disclosed ? timer.timeBasis.label : timer?.workdayZone || '';
    const selected = timer ? selectedRow(timer) : null;
    target.dataset.selectedThreshold = selected?.thresholdLevel || 'NONE';
    const summaryContext = selected?.kind === 'job' ? selected.projectId : selected ? 'General' : 'No job';
    const summaryTime = selected ? formatDuration(selected.todayMs) : '--:--:--';
    const viewKey = `${view}:${timer ? 'ready' : core?.blocked ? 'blocked' : 'loading'}`;
    // Key only navigation/readiness changes. Canonical clock ticks patch the
    // existing view, preserving focus and never restarting its reveal motion.
    const previousViewKey = target.querySelector?.('.sc-view')?.dataset.scViewKey;
    const routeChanged = Boolean(previousViewKey && previousViewKey !== viewKey);
    const previousHeight = routeChanged ? target.querySelector?.('.sc-content')?.getBoundingClientRect?.().height : 0;
    const contentBody = bodyMarkup(timer, core).replace('<div class="sc-view', `<div data-sc-view-key="${viewKey}" class="sc-view`);
    const clockShortcut = quickClockControlsEnabled
      ? `<button class="sc-icon-btn" data-action="open-native-clock" aria-label="Find SquareCoil clock controls" title="SquareCoil clock">${uiIcon('timer')}</button>` : '';
const markup = `${styleBlock()}<div class="sc-archive-veil" data-visible="false" data-tone="eligible" aria-hidden="true"><div><span data-sc-archive-veil-title>Release to archive</span><small data-sc-archive-veil-detail>Hours and history stay saved.</small></div></div>${tabs}<div class="sc-proto-shell"><div class="sc-proto-topbar"><span class="sc-proto-timer-icon" aria-hidden="true">${uiIcon('timer')}</span><div class="sc-proto-brand"><strong>SquareCoil Companion</strong><span class="sc-summary-title">Job Timer <small>${escapeHtml(summaryContext)}</small></span></div><time class="sc-summary-time" aria-label="Selected job today">${summaryTime}</time><span class="sc-proto-status" data-tone="${friendlyStatus.tone}" data-sc-status>${escapeHtml(friendlyStatus.label)}</span>${clockShortcut}<button class="sc-icon-btn" data-action="view" data-view="settings" aria-label="Open Settings" title="Settings">${uiIcon('settings')}</button><button class="sc-icon-btn" data-action="collapse" aria-label="${collapsed ? 'Expand' : 'Collapse'}">${uiIcon(collapsed ? 'down' : 'up')}</button></div><div class="sc-content" role="tabpanel" id="sc-workspace-panel">${archiveNoticeMarkup()}${snapshotStale ? '<div class="sc-stale">Reconnecting…</div>' : ''}${contentBody}</div>${errorMessage ? `<div class="sc-error">${escapeHtml(errorMessage)}</div>` : ''}<div class="sc-foot">${target.dataset.protoMenu === 'true' ? '<span>SquareCoil Companion</span>' : `<span>${escapeHtml(basis)}</span><div><button data-action="sync" aria-label="Refresh Companion">Refresh</button><button data-action="open-diagnostics">Technical details</button></div>`}</div></div>`;
    cancelDockMorph();
    updateWorkspaceMarkup(target, markup);
    if (navigationChanged) cancelDockMorph = revealDockMorph(target, outgoingText, window);
    const content = target.querySelector?.('.sc-content');
    if (routeChanged) {
      viewHeightAnimation?.cancel();
      viewHeightAnimation = null;
      const nextHeight = content?.getBoundingClientRect?.().height;
      if (!collapsed && previousHeight > 0 && nextHeight > 0 && !window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches && content?.animate) {
        content.style.minHeight = '0px';
        content.style.overflow = 'hidden';
        viewHeightAnimation = content.animate([{ height: `${previousHeight}px` }, { height: `${nextHeight}px` }], {
          duration: 420, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both'
        });
        const animation = viewHeightAnimation;
        const finish = () => {
          if (viewHeightAnimation === animation) viewHeightAnimation = null;
          content.style.removeProperty('min-height');
          content.style.removeProperty('overflow');
          animation.cancel();
        };
        animation.addEventListener('finish', finish, { once: true });
        animation.addEventListener('cancel', () => {
          content.style.removeProperty('min-height');
          content.style.removeProperty('overflow');
        }, { once: true });
      }
    }
    if (content) content.scrollTop = archiveNoticeShouldReveal || routeChanged ? 0 : previousScroll;
    if (!routeChanged) {
      for (const list of target.querySelectorAll?.('.sc-list-scroll[data-sc-list]') || []) {
        list.scrollTop = previousListScroll.get(list.dataset.scList) || 0;
      }
    }
    archiveNoticeShouldReveal = false;
    const tabStrip = target.querySelector?.('.sc-tabs'); if (tabStrip) tabStrip.scrollLeft = previousTabScroll;
    updateTabCycleButtons();
    updateTitlePan();
    if (navigationChanged) window.setTimeout?.(updateTabCycleButtons, 260);
    if (focusTarget || retainedFocus) {
      const selector = focusTarget;
      focusTarget = null;
      const focusNode = selector ? target.querySelector?.(selector) : findFocusDescriptor(target, retainedFocus);
      focusNode?.focus?.({ preventScroll: true });
      if (focusNode?.matches?.('[role="tab"]')) {
        focusNode.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      }
    }
  }

  async function invokeTimerAction(key, event) {
    const type = TIMER_ACTIONS[key]; if (!type) return;
    if (event?.isTrusted !== true) { errorMessage = 'Timer actions require a real user click.'; render(); return; }
    const handle = coreHandle();
    if (!handle || typeof handle.timerAction !== 'function') { errorMessage = 'Time controls are not available yet.'; render(); return; }
    busyAction = key; errorMessage = null; render();
    try { await handle.timerAction(type); if (typeof handle.syncBridge === 'function') await handle.syncBridge(); }
    catch (error) { recordTechnicalError(error, 'That time action could not be completed. Refresh status and try again.'); }
    finally { busyAction = null; render(); }
  }

  function openJob(projectId) {
    const id = safeProjectId(projectId);
    if (!id) { errorMessage = 'Enter a valid SquareCoil job number.'; render(); return; }
    window.open(new URL(`/project.php?id=${id}`, window.location.origin).href, '_blank', 'noopener');
  }

  function selectContext(contextId, targetView = 'main') {
    if (!contextId) return;
    if (targetView === 'context-detail' && view !== 'context-detail') detailReturnView = view;
    selectionSerial += 1;
    selectedContextId = String(contextId);
    pendingFocusIntent = null;
    view = targetView;
    savePreferences();
  }

  function workspaceData() {
    return {
      workspace: { order: [...durableOrder], hiddenContextIds: [...hiddenTabs] }
    };
  }

  function showDataProgress(phase, detail = null) {
    dataProgress = { ...dataProgress, phase, detail };
    render();
  }

  function yieldForDataPaint() {
    return new Promise(resolve => {
      let frame = null;
      let timer = null;
      let deadline = null;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (frame !== null) window.cancelAnimationFrame?.(frame);
        if (timer !== null) window.clearTimeout?.(timer);
        if (deadline !== null) window.clearTimeout?.(deadline);
        pendingPaintYields.delete(finish);
        resolve();
      };
      pendingPaintYields.add(finish);
      // A task after rAF lets the status paint before synchronous validation.
      // Hidden or suspended tabs still settle, and teardown releases this wait.
      if (document.visibilityState !== 'hidden' && typeof window.requestAnimationFrame === 'function') {
        deadline = window.setTimeout(finish, 100);
        frame = window.requestAnimationFrame(() => { timer = window.setTimeout(finish, 0); });
      } else timer = window.setTimeout(finish, 0);
    });
  }

  function readDataFile(file) {
    return new Promise((resolve, reject) => {
      let reader = null;
      let settled = false;
      const finish = (error, text) => {
        if (settled) return;
        settled = true;
        cancelFileRead = null;
        if (reader) reader.onload = reader.onerror = reader.onabort = reader.onprogress = null;
        if (error) reject(error);
        else if (typeof text !== 'string') reject(new Error('file-read-invalid-result'));
        else resolve(text);
      };
      cancelFileRead = () => {
        try { reader?.abort(); } catch (_) { /* Teardown still releases a failed reader. */ }
        finish(new Error('file-read-canceled'));
      };
      try {
        if (typeof window.FileReader !== 'function') {
          Promise.resolve().then(() => file.text()).then(text => finish(null, text), error => finish(error));
          return;
        }
        reader = new window.FileReader();
        reader.onprogress = event => {
          if (settled || disposed || !event.lengthComputable || !Number.isSafeInteger(event.loaded) ||
              !Number.isSafeInteger(event.total) || event.total <= 0 || event.loaded < 0 || event.loaded > event.total) return;
          dataProgress = { ...dataProgress, loaded: event.loaded, total: event.total };
          render();
        };
        reader.onload = () => finish(null, reader.result);
        reader.onerror = () => finish(reader.error || new Error('file-read-failed'));
        reader.onabort = () => finish(new Error('file-read-canceled'));
        reader.readAsText(file);
      } catch (error) { finish(error); }
    });
  }

  function downloadArtifact(kind) {
    const handle = coreHandle();
    if (!handle || typeof handle.dataExport !== 'function') throw new Error('Data export is not available yet.');
    const exportedAtMs = Date.now();
    const result = handle.dataExport(kind, {
      ...workspaceData(),
      exportedAtMs,
      backupId: `backup-${exportedAtMs}-${Math.random().toString(36).slice(2)}`,
      sourcePlatform: navigator.userAgent || 'browser-extension'
    });
    const isBackup = kind === 'FULL_BACKUP';
    const text = isBackup ? `${JSON.stringify(result)}\n` : result.text;
    const filename = isBackup
      ? `squarecoil-companion-backup-${new Date(exportedAtMs).toISOString().slice(0, 10)}.json`
      : result.filename;
    const blob = new Blob([text], { type: isBackup ? 'application/json;charset=utf-8' : result.mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    dataMessage = `${isBackup ? 'Full Backup' : kind === 'HISTORY_CSV' ? 'History CSV' : 'Time Report CSV'} is ready.`;
    return result;
  }

  function destructiveDescription(type, values = {}) {
    if (type === DATA_COMMANDS.DELETE_CONTEXT) return `Permanently delete ${values.label || values.contextId} Companion history, time, and Context metadata? SquareCoil official time is unaffected.`;
    if (type === DATA_COMMANDS.DELETE_ALL_ARCHIVED) return 'Permanently delete every archived Companion Context and its recorded time? Non-archived data and SquareCoil official time are unaffected.';
    if (type === DATA_COMMANDS.WIPE_HISTORY) return 'Permanently remove all Companion-recorded time history? Workspace Contexts remain and SquareCoil official time is unaffected.';
    if (type === DATA_COMMANDS.RESTORE_BACKUP && values.mode === 'REPLACE') return 'Replace the current restorable Companion dataset with this validated backup? No live timer state will be restored.';
    return null;
  }

  async function commitDataPlan(plan, values = {}) {
    if (plan.blocked) {
      errorMessage = `Nothing was changed. ${plan.conflicts.length} conflict${plan.conflicts.length === 1 ? '' : 's'} require review.`;
      render();
      return false;
    }
    const handle = coreHandle();
    if (!handle || typeof handle.commitDataAction !== 'function') throw new Error('This data action is not available yet.');
    const confirmations = [...plan.requiredConfirmations];
    let preBackupDisposition;
    const globalDestructive = confirmations.some(token => ['DELETE_ALL_ARCHIVED', 'WIPE_ALL_TIME_HISTORY', 'RESTORE_REPLACE'].includes(token));
    if (globalDestructive) {
      const createBackup = window.confirm('Create a Full Backup before continuing? Choose OK to download it now, or Cancel to review the destructive action without a backup.');
      if (createBackup) {
        downloadArtifact('FULL_BACKUP');
        preBackupDisposition = 'CREATED';
      } else preBackupDisposition = 'DECLINED';
    }
    const description = values.description || (confirmations.includes('USE_INCOMING')
      ? 'Use incoming data for the selected conflicts? Existing Companion historical records will be replaced and all overlap rules will be revalidated.'
      : null);
    if ((confirmations.length || values.confirm === true) && !window.confirm(description || 'Commit this Companion data operation?')) {
      if (values.import === true) {
        pendingImport = null;
        dataMessage = 'Nothing was imported. Choose a file to try again.';
        showDataProgress('CANCELED');
      }
      return false;
    }
    if (values.import === true) {
      showDataProgress('SAVING', 'Waiting for Companion to confirm the saved data.');
      await yieldForDataPaint();
      if (disposed) return false;
    }
    await handle.commitDataAction(plan.planId, { confirmationTokens: confirmations, preBackupDisposition });
    if (disposed) return true;
    pendingImport = null;
    dataMessage = `Completed ${plan.operation.replace(/^DATA_/, '').replace(/_/g, ' ').toLowerCase()}.`;
    if (values.import === true) showDataProgress('FINISHED');
    return true;
  }

  async function runDataAction(type, values = {}) {
    const handle = coreHandle();
    if (!handle || typeof handle.stageDataAction !== 'function') throw new Error('This data tool is not available yet.');
    // UI workspace ordering lives in revisioned extension preferences. Do not
    // merge a possibly stale local tab order into authoritative data mutations.
    const request = { ...values };
    if ([DATA_COMMANDS.ARCHIVE_CONTEXT, DATA_COMMANDS.ARCHIVE_ELIGIBLE].includes(type)) request.atMs = Date.now();
    const plan = await handle.stageDataAction(type, request);
    return commitDataPlan(plan, {
      confirm: type === DATA_COMMANDS.DELETE_CONTEXT,
      description: destructiveDescription(type, values)
    });
  }

  async function stageImport(type, values) {
    const handle = coreHandle();
    if (!handle || typeof handle.stageDataAction !== 'function') throw new Error('This data tool is not available yet.');
    const request = { ...workspaceData(), ...values };
    invalidCsvRows = null;
    pendingImport = null;
    showDataProgress('CHECKING', 'Validating records and checking for duplicates and conflicts.');
    await yieldForDataPaint();
    if (disposed) return false;
    let plan;
    try { plan = await handle.stageDataAction(type, request); }
    catch (error) {
      if (type !== DATA_COMMANDS.IMPORT_HISTORY_CSV || error?.message !== 'history-csv-review-required' || !Array.isArray(error.invalidRows)) throw error;
      invalidCsvRows = {
        count: error.invalidRows.length,
        rows: error.invalidRows.slice(0, 20).map(item => ({ row: Number(item.row), code: String(item.code || 'invalid-row').slice(0, 160) }))
      };
      dataMessage = `The History CSV has ${invalidCsvRows.count} invalid row${invalidCsvRows.count === 1 ? '' : 's'}. Nothing was imported.`;
      showDataProgress('FAILED', 'Correct the rows below, then choose the file again.');
      return;
    }
    if (disposed) return false;
    pendingImport = { type, values: request, plan, resolutions: { ...(request.resolutions || {}) } };
    if (plan.blocked) {
      dataMessage = 'Import is staged only. Resolve every listed conflict before any write can occur.';
      showDataProgress('REVIEW', 'Resolve the conflicts below. Nothing has been saved.');
      return;
    }
    showDataProgress('REVIEW', 'Check the confirmation before saving. Nothing has been saved yet.');
    await yieldForDataPaint();
    if (disposed) return false;
    await commitDataPlan(plan, {
      import: true,
      confirm: true,
      description: destructiveDescription(type, values) || `Import ${plan.summary.segmentsAdded || 0} new finalized Segment${plan.summary.segmentsAdded === 1 ? '' : 's'}? Duplicate records add no time.`
    });
  }

  async function withBusy(label, task) {
    if (busyAction) return;
    busyAction = label;
    errorMessage = null;
    dataMessage = null;
    if (!['data-import', 'conflict-resolution', 'data-export'].includes(label)) dataProgress = null;
    render();
    try { await task(); }
    catch (error) {
      const reason = String(error?.message || error || '');
      const friendly = reason === 'backup-export-size-limit-exceeded'
        ? `This backup is larger than the ${PORTABLE_FILE_LIMIT_MIB} MiB file limit for this version. Nothing was downloaded or changed.`
        : reason === 'history-csv-export-size-limit-exceeded'
        ? `This history file is larger than the ${PORTABLE_FILE_LIMIT_MIB} MiB import limit for this version. Nothing was downloaded or changed.`
        : reason === 'external-file-size-limit-exceeded'
        ? `This file is larger than the ${PORTABLE_FILE_LIMIT_MIB} MiB import limit for this version. Nothing was imported.`
        : /Bing access was not granted|permission/i.test(reason)
        ? 'The selected theme keeps its readable background while Bing images are unavailable.'
        : 'That change could not be completed. No SquareCoil data was changed. Open Technical details for more information.';
      if (label === 'data-import' || label === 'conflict-resolution') {
        const canceled = reason === 'file-read-canceled';
        dataProgress = { ...dataProgress, phase: canceled ? 'CANCELED' : 'FAILED', detail: canceled
          ? 'Nothing was imported. Choose a file to try again.'
          : 'The import could not be completed or confirmed. Check your saved history before trying again.' };
        if (canceled) dataMessage = dataProgress.detail;
        else recordTechnicalError(error, friendly);
      } else {
        if (label === 'data-export') dataProgress = null;
        recordTechnicalError(error, friendly);
      }
    }
    finally { busyAction = null; render(); }
  }

  async function commitPreferencePatch(patch, expectedRevision = preferenceRevision) {
    const handle = coreHandle();
    if (!handle || typeof handle.preferenceAction !== 'function') throw new Error('Settings are not available yet.');
    await handle.preferenceAction(patch, expectedRevision);
  }

  function currentDraftKind() {
    if (view === 'timer-limits' && limitDraft?.dirty) return 'Timer Limits';
    if (view === 'submit-ticket' && supportDrafts.ticket.dirty) return 'Ticket';
    if (view === 'send-feedback' && supportDrafts.feedback.dirty) return 'Feedback';
    if (view === 'data-tools' && pendingImport) return 'staged data import';
    return null;
  }

  function clearCurrentDraft() {
    if (view === 'timer-limits') {
      const preferences = lastGoodCore?.preferences || DEFAULT_PREFERENCES;
      limitDraft = { yellowMinutes: preferences.yellowMinutes, orangeMinutes: preferences.orangeMinutes,
        redMinutes: preferences.redMinutes, baseRevision: preferenceRevision, dirty: false };
    } else if (view === 'submit-ticket') {
      supportDrafts.ticket = { category: 'Bug', subject: '', description: '', includeDiagnostics: false, diagnostics: null, dirty: false };
    } else if (view === 'send-feedback') {
      supportDrafts.feedback = { category: 'Suggestion', subject: '', description: '', includeDiagnostics: false, diagnostics: null, dirty: false };
    } else if (view === 'data-tools') {
      pendingImport = null;
    }
    supportMessage = null;
    supportManualCopy = null;
  }

  function allowSettingsDeparture() {
    if (busyAction) {
      errorMessage = 'This Settings operation is still finishing. Wait for its terminal result before leaving.';
      render();
      return false;
    }
    const kind = currentDraftKind();
    if (!kind) return true;
    if (!window.confirm(`Discard the unsaved ${kind} draft? Choose Cancel to keep editing.`)) return false;
    clearCurrentDraft();
    return true;
  }

  function navigateSettings(next, options = {}) {
    if (!VIEW_IDS.has(next) || !allowSettingsDeparture()) return false;
    if (!SETTINGS_VIEW_IDS.has(next) && next !== 'main') settingsReturnView = next;
    else if (next === 'settings' || next === 'main') settingsReturnView = null;
    view = next;
    focusTarget = '[data-sc-view-heading]';
    if (options.close === true) {
      view = 'main';
      settingsReturnView = null;
      expandedSettingsGroup = null;
      focusTarget = '[data-action="view"][data-view="settings"]';
    }
    render();
    return true;
  }

  function frozenDiagnostics() {
    const core = lastGoodCore || {};
    return createDiagnosticSnapshot({
      packageName: 'SquareCoil Companion',
      packageVersion,
      buildId,
      buildStage,
      candidateFingerprint,
      userAgent,
      url: window.location?.href,
      lifecycle: core.status || 'unavailable',
      runtimeInstanceId: document.getElementById(ROOT_ID)?.dataset?.runtimeInstanceId,
      workerInstanceId: core.authorityTenure?.workerInstanceId,
      coordinationEpoch: core.authorityTenure?.coordinationEpoch,
      settlementStatus: core.initialized && !core.blocked && core.timer ? 'ready' : core.blocked ? 'blocked' : 'not-ready',
      migrationDisposition: core.preflight?.disposition,
      migrationReason: core.preflight?.reason,
      bridgeCapability: core.bridge?.capability || 'UNAVAILABLE',
      bridgeStatus: core.bridge?.active ? 'active' : core.bridge?.initialized ? 'inactive' : 'unavailable',
      bridgeGeneration: core.bridge?.bridgeGeneration,
      bridgeReason: core.bridge?.lastError || core.bridge?.lastReason,
      lastTechnicalError: lastTechnicalError || core.lastError || core.readModelError || core.dataReadModelError,
      coreReadiness: core.initialized && !core.blocked && core.timer ? 'ready' : core.blocked ? 'blocked' : 'not-ready',
      preferences: core.preferences || DEFAULT_PREFERENCES,
      presentation: core.presentation || presentation || {},
      rootCount: document.querySelectorAll?.(`#${ROOT_ID}`)?.length || (document.getElementById(ROOT_ID) ? 1 : 0),
      capturedAtMs: Date.now()
    });
  }

  function supportComposition(kind) {
    const draft = supportDrafts[kind];
    return composeSupportMessage(kind, draft, draft.diagnostics, { packageVersion });
  }

  async function copyText(value, successMessage) {
    try {
      if (!window.navigator?.clipboard?.writeText) throw new Error('clipboard-unavailable');
      await window.navigator.clipboard.writeText(value);
      supportMessage = successMessage;
      supportManualCopy = null;
    } catch (_) {
      supportMessage = 'Clipboard access was unavailable. The complete text remains visible for manual copy.';
      supportManualCopy = String(value);
    }
  }

  function onClick(event) {
    const button = event.target.closest?.('[data-action]'); if (!button || !root?.contains(button)) return;
    const action = button.dataset.action;
    if (['data-import', 'data-export', 'conflict-resolution'].includes(busyAction)) return;
    if (action === 'open-native-clock' && event.isTrusted === true) {
      const visible = element => {
        if (!element || root.contains(element)) return false;
        for (let current = element; current && current !== document.documentElement; current = current.parentElement) {
          if (current.hidden || current.getAttribute?.('aria-hidden') === 'true') return false;
          const style = window.getComputedStyle?.(current);
          if (style?.display === 'none' || style?.visibility === 'hidden') return false;
        }
        return true;
      };
      const control = ['#clockin', '#clockout'].map(selector => document.querySelector?.(selector)).find(visible);
      const containers = [...(document.querySelectorAll?.('.timeclock-container') || [])].filter(visible);
      const target = control || (containers.length === 1 ? containers[0] : null);
      if (!target) {
        errorMessage = 'SquareCoil clock controls are not on this page.';
        render();
        return;
      }
      errorMessage = null;
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
      target.scrollIntoView?.({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'center' });
      if (control) target.focus?.({ preventScroll: true });
      return;
    }
    if (action === 'cycle-tabs') { cycleTabs(button.dataset.direction === 'next' ? 1 : -1); return; }
    if (action === 'collapse') { collapsed = !collapsed; savePreferences(); render(); return; }
    if (action === 'back') { view = 'main'; render(); return; }
    if (action === 'view') {
      const next = button.dataset.view;
      if (!VIEW_IDS.has(next)) return;
      if (next === 'settings') {
        settingsReturnView = null;
        expandedSettingsGroup = null;
        focusTarget = '[data-sc-view-heading]';
      } else if (settingsReturnView === view && next === 'settings') settingsReturnView = null;
      else if (next === 'main') settingsReturnView = null;
      view = next;
      render();
      return;
    }
    if (action === 'settings-toggle-group') {
      const group = String(button.dataset.group || '');
      const beforeHeights = new Map([...(root.querySelectorAll?.('.sc-settings-group') || [])]
        .map(node => [node.dataset.group, node.getBoundingClientRect().height]));
      const outgoingText = captureDockText(root, '.sc-settings-list');
      expandedSettingsGroup = expandedSettingsGroup === group ? null : group;
      render();
      if (!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
        for (const node of root.querySelectorAll?.('.sc-settings-group') || []) {
          const before = beforeHeights.get(node.dataset.group);
          const after = node.getBoundingClientRect().height;
          if (before > 0 && Math.abs(after - before) > 2) {
            node.animate?.([{ height: `${before}px` }, { height: `${after}px` }], {
              duration: 300, easing: 'cubic-bezier(.22,1,.36,1)'
            });
          }
        }
        cancelDockMorph = revealDockMorph(root, outgoingText, window, '.sc-settings-list');
      }
      return;
    }
    if (action === 'settings-route') { navigateSettings(button.dataset.view); return; }
    if (action === 'open-diagnostics') { navigateSettings('advanced-diagnostics'); return; }
    if (action === 'settings-back') { navigateSettings(button.dataset.view || 'settings'); return; }
    if (action === 'settings-close') { navigateSettings('main', { close: true }); return; }
    if (action === 'select') { selectContext(button.dataset.context); render(); return; }
    if (action === 'context-detail') { selectContext(button.dataset.context, 'context-detail'); render(); return; }
    if (action === 'hide-tab') {
      event.stopPropagation();
      if (event.isTrusted !== true) return;
      const id = button.dataset.context;
      const eligibility = archiveGestureEligibility(lastGoodCore, id, { snapshotStale, busy: Boolean(busyAction) });
      if (!eligibility.eligible) { errorMessage = eligibility.message; render(); return; }
      const ghost = closingTabGhost(button.closest?.('.sc-tab-slot'));
      hiddenTabs.add(id);
      if (!reconcileWorkspaceSelection()) savePreferences();
      render();
      if (ghost) { root.append(ghost); window.setTimeout(() => ghost.remove(), 260); }
      return;
    }
    if (action === 'show-tab') {
      const id = button.dataset.context;
      if (!id || event.isTrusted !== true) return;
      hiddenTabs.delete(id);
      selectContext(id);
      focusTarget = '[role="tab"][aria-selected="true"]';
      render(); return;
    }
    if (action === 'undo-archive' && event.isTrusted === true) {
      const contextId = button.dataset.context;
      withBusy('restore-archive', async () => {
        const committed = await runDataAction(DATA_COMMANDS.RESTORE_ARCHIVED, { contextId, label: archiveNotice?.label || contextId });
        if (committed) {
          archiveNotice = null;
          if (archiveNoticeTimer !== null) window.clearTimeout?.(archiveNoticeTimer);
          archiveNoticeTimer = null;
        }
      });
      return;
    }
    if (action === 'load-history') { historyLimit += HISTORY_PAGE_SIZE; render(); return; }
    if (action === 'timer') { invokeTimerAction(button.dataset.timerAction, event); return; }
    if (action === 'open-job') { if (event.isTrusted === true) openJob(button.dataset.project); return; }
    if (action === 'preference' && event.isTrusted === true) {
      withBusy('preference', () => commitPreferencePatch({ timerAppearance: button.dataset.value })); return;
    }
    if (action === 'preference-finish' && event.isTrusted === true) {
      withBusy('preference', () => commitPreferencePatch({ panelFinish: button.dataset.value })); return;
    }
    if (action === 'preference-dashboard' && event.isTrusted === true) {
      if (!['true', 'false'].includes(button.dataset.value)) return;
      withBusy('preference', () => commitPreferencePatch({ dashboardEnabled: button.dataset.value === 'true' })); return;
    }
    if (action === 'preference-dashboard-appearance' && event.isTrusted === true) {
      withBusy('preference', () => commitPreferencePatch({ dashboardAppearance: button.dataset.value })); return;
    }
    if (action === 'preference-design-dashboard' && event.isTrusted === true) {
      withBusy('preference', () => commitPreferencePatch({ dashboardProfile: button.dataset.value })); return;
    }
    if (action === 'preference-quick-files' && event.isTrusted === true) {
      if (!['true', 'false'].includes(button.dataset.value)) return;
      withBusy('preference', () => commitPreferencePatch({ quickFilePathsEnabled: button.dataset.value === 'true' })); return;
    }
    if (action === 'preference-quick-clock' && event.isTrusted === true) {
      if (!['true', 'false'].includes(button.dataset.value)) return;
      withBusy('preference', () => commitPreferencePatch({ quickClockControlsEnabled: button.dataset.value === 'true' })); return;
    }
    if (action === 'preference-site' && event.isTrusted === true) {
      if (busyAction) return;
      const value = button.dataset.value;
      const handle = coreHandle();
      const glass = ['SLEEK_DARK', 'LIGHT_GLASS'].includes(value);
      withBusy('preference', async () => {
        await commitPreferencePatch({ websiteTheme: value });
        if (!glass && typeof handle?.clearCinematicBackground === 'function') {
          await handle.clearCinematicBackground();
        }
      });
      return;
    }
    if (action === 'reset-limits' && event.isTrusted === true) {
      if (!window.confirm('Reset Timer Limits to 60 / 120 / 240 minutes?')) return;
      withBusy('preference', async () => {
        await commitPreferencePatch({ yellowMinutes: 60, orangeMinutes: 120, redMinutes: 240 }, preferenceRevision);
        limitDraft = null;
      });
      return;
    }
    if (action === 'refresh-diagnostics' && event.isTrusted === true) {
      const draft = supportDrafts[button.dataset.supportKind];
      if (draft?.includeDiagnostics) draft.diagnostics = frozenDiagnostics();
      supportMessage = 'Diagnostics refreshed. The visible snapshot is now frozen for this draft.';
      render();
      return;
    }
    if (action === 'copy-diagnostics' && event.isTrusted === true) {
      const draft = supportDrafts[button.dataset.supportKind];
      if (draft?.diagnostics?.text) withBusy('copy', () => copyText(draft.diagnostics.text, 'The visible diagnostics snapshot was copied.'));
      return;
    }
    if (action === 'copy-advanced-diagnostics' && event.isTrusted === true) {
      const diagnostics = frozenDiagnostics();
      withBusy('copy', () => copyText(diagnostics.text, 'Technical details copied.'));
      return;
    }
    if (action === 'copy-message' && event.isTrusted === true) {
      const composition = supportComposition(button.dataset.supportKind);
      if (!composition.ok) { errorMessage = composition.errors.join(' '); render(); return; }
      withBusy('copy', () => copyText(composition.copyText, 'The exact email message was copied.'));
      return;
    }
    if (action === 'copy-support-email' && event.isTrusted === true) {
      withBusy('copy', () => copyText(SUPPORT_EMAIL, 'The Support email address was copied.'));
      return;
    }
    if (action === 'data-export' && event.isTrusted === true) {
      dataProgress = { kind: 'EXPORT', phase: 'EXPORTING' };
      withBusy('data-export', async () => {
        await yieldForDataPaint();
        if (disposed) return;
        downloadArtifact(button.dataset.export);
        showDataProgress('FINISHED');
      });
      return;
    }
    if (action === 'data-context' && event.isTrusted === true) {
      const type = button.dataset.dataType;
      withBusy('data-context', async () => {
        const contextId = button.dataset.context;
        const committed = await runDataAction(type, { contextId, label: button.dataset.label || contextId });
        if (committed && [DATA_COMMANDS.ARCHIVE_CONTEXT, DATA_COMMANDS.RESTORE_ARCHIVED].includes(type)) reconcileWorkspaceSelection();
      });
      return;
    }
    if (action === 'data-simple' && event.isTrusted === true) {
      const type = button.dataset.dataType;
      withBusy('data-simple', async () => {
        const committed = await runDataAction(type, { description: destructiveDescription(type) });
        if (committed && [DATA_COMMANDS.ARCHIVE_ELIGIBLE, DATA_COMMANDS.CLEAR_RECENT].includes(type)) reconcileWorkspaceSelection();
      });
      return;
    }
    if (action === 'pick-file' && event.isTrusted === true) {
      if (busyAction || pendingFileMode) return;
      const input = root.querySelector?.('[data-sc-data-file]');
      if (!input) {
        errorMessage = 'The file picker is not available. Reopen Local data and backups and try again.';
        render();
        return;
      }
      pendingFileMode = button.dataset.fileMode;
      try { input.click(); }
      catch (error) {
        pendingFileMode = null;
        recordTechnicalError(error, 'The file picker could not open. No Companion data was changed.');
        render();
      }
      return;
    }
    if (action === 'resolve-conflict' && event.isTrusted === true && pendingImport) {
      pendingImport.resolutions[button.dataset.conflict] = button.dataset.resolution;
      withBusy('conflict-resolution', async () => {
        await stageImport(pendingImport.type, { ...pendingImport.values, resolutions: pendingImport.resolutions });
      });
      return;
    }
    if (action === 'sync' && event.isTrusted === true) { const handle = coreHandle(); if (handle && typeof handle.syncBridge === 'function') handle.syncBridge().then(render, error => { recordTechnicalError(error, 'Companion could not refresh. Reload the SquareCoil tab and try again.'); render(); }); }
  }

  function onChange(event) {
    const restoreOption = event.target?.closest?.('[data-restore-option]');
    if (restoreOption && root?.contains(restoreOption)) {
      if (busyAction) return;
      const key = restoreOption.dataset.restoreOption;
      if (Object.prototype.hasOwnProperty.call(backupRestoreOptions, key)) backupRestoreOptions[key] = restoreOption.checked === true;
      return;
    }
    const supportField = event.target?.closest?.('[data-support-field]');
    if (supportField && root?.contains(supportField)) {
      const form = supportField.closest?.('[data-sc-support-form]');
      const draft = supportDrafts[form?.dataset?.supportKind];
      if (draft) {
        const field = supportField.dataset.supportField;
        if (field === 'includeDiagnostics') {
          draft.includeDiagnostics = supportField.checked === true;
          draft.diagnostics = draft.includeDiagnostics ? frozenDiagnostics() : null;
        } else draft[field] = supportField.value;
        draft.dirty = true;
        supportMessage = null;
        supportManualCopy = null;
        render();
      }
      return;
    }
    const input = event.target?.closest?.('[data-sc-data-file]');
    if (!input || !root?.contains(input) || !pendingFileMode || busyAction) return;
    if (!input.files?.[0]) {
      pendingFileMode = null;
      input.value = '';
      render();
      return;
    }
    const file = input.files[0];
    const mode = pendingFileMode;
    const restoreOptions = mode === 'BACKUP_REPLACE' ? {
      mode: 'REPLACE', importWorkspace: backupRestoreOptions.replaceWorkspace,
      importPreferences: backupRestoreOptions.replacePreferences, restoreActivity: backupRestoreOptions.replaceActivity,
      keepCurrentZone: backupRestoreOptions.keepCurrentZone
    } : {
      mode: 'MERGE', importWorkspace: backupRestoreOptions.mergeWorkspace,
      importPreferences: backupRestoreOptions.mergePreferences
    };
    pendingFileMode = null;
    pendingImport = null;
    invalidCsvRows = null;
    dataProgress = { kind: mode === 'HISTORY_CSV' ? 'HISTORY' : 'BACKUP', phase: 'READING', loaded: null, total: null };
    withBusy('data-import', async () => {
      try {
        if (Number.isSafeInteger(file.size) && file.size > MAX_INPUT_BYTES) {
          throw new Error('external-file-size-limit-exceeded');
        }
        await yieldForDataPaint();
        if (disposed) return;
        const text = await readDataFile(file);
        if (disposed) return;
        if (mode === 'HISTORY_CSV') await stageImport(DATA_COMMANDS.IMPORT_HISTORY_CSV, { input: text });
        else await stageImport(DATA_COMMANDS.RESTORE_BACKUP, { input: text, ...restoreOptions });
      } finally { input.value = ''; }
    });
  }

  function onFileCancel(event) {
    const input = event.target?.closest?.('[data-sc-data-file]');
    if (!input || !root?.contains(input) || !pendingFileMode) return;
    pendingFileMode = null;
    input.value = '';
    render();
  }

  function onInput(event) {
    const limitInput = event.target?.closest?.('[data-sc-limits-form] input[name]');
    if (limitInput && root?.contains(limitInput)) {
      if (!limitDraft) limitDraft = { ...DEFAULT_PREFERENCES, baseRevision: preferenceRevision, dirty: false };
      limitDraft[limitInput.name] = limitInput.value;
      limitDraft.dirty = true;
      return;
    }
    const supportField = event.target?.closest?.('[data-support-field]');
    if (!supportField || !root?.contains(supportField) || supportField.type === 'checkbox') return;
    const form = supportField.closest?.('[data-sc-support-form]');
    const draft = supportDrafts[form?.dataset?.supportKind];
    if (!draft) return;
    draft[supportField.dataset.supportField] = supportField.value;
    draft.dirty = true;
    supportMessage = null;
    supportManualCopy = null;
  }

  function onKeyDown(event) {
    if (['data-import', 'data-export', 'conflict-resolution'].includes(busyAction)) {
      event.stopPropagation?.();
      return;
    }
    const focusedTab = event.target?.closest?.('.sc-tab[data-context]');
    if (focusedTab && root?.contains(focusedTab) && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      const tabs = Array.from(root.querySelectorAll?.('.sc-tab[data-context]') || []);
      const index = tabs.indexOf(focusedTab);
      if (index >= 0 && tabs.length) {
        event.preventDefault?.();
        event.stopPropagation?.();
        const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
          : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : (index + 1) % tabs.length;
        selectContext(tabs[nextIndex].dataset.context);
        focusTarget = '[role="tab"][aria-selected="true"]';
        render();
      }
      return;
    }
    if (!SETTINGS_VIEW_IDS.has(view)) return;
    if (event.target?.closest?.('input, textarea, select, [role="dialog"]')) event.stopPropagation?.();
  }

  function onDoubleClick(event) {
    if (['data-import', 'data-export', 'conflict-resolution'].includes(busyAction)) return;
    const tab = event.target.closest?.('.sc-tab[data-context]'); if (!tab || !root?.contains(tab)) return;
    selectContext(tab.dataset.context); collapsed = false; savePreferences(); render();
  }

  function clearDropIndicators() {
    for (const slot of root?.querySelectorAll?.('.sc-tab-slot[data-drop-position]') || []) delete slot.dataset.dropPosition;
  }

  function setArchiveVeil(visible, eligibility = null) {
    const veil = root?.querySelector?.('.sc-archive-veil');
    if (!veil) return;
    veil.dataset.visible = visible ? 'true' : 'false';
    veil.dataset.tone = eligibility?.eligible === false ? 'blocked' : 'eligible';
    veil.setAttribute?.('aria-hidden', visible ? 'false' : 'true');
    const title = veil.querySelector?.('[data-sc-archive-veil-title]');
    const detail = veil.querySelector?.('[data-sc-archive-veil-detail]');
    if (title) title.textContent = eligibility?.eligible === false ? 'This job stays open' : 'Release to archive';
    if (detail) detail.textContent = eligibility?.message || 'Hours and history stay saved.';
  }

  function clearDragState(options = {}) {
    clearDropIndicators();
    setArchiveVeil(false);
    root?.querySelector?.('.sc-tab-slot[data-drag-source]')?.removeAttribute?.('data-drag-source');
    draggedContextId = null;
    draggedArchiveEligibility = null;
    dragAttemptedOutside = false;
    if (options.preserveOwnership !== true) ownedDragActive = false;
    if (root) {
      root.dataset.dragging = 'false';
      root.dataset.dragAway = 'false';
    }
  }

  function isOwnedDragEvent(event) {
    if (!ownedDragActive || !event?.dataTransfer) return false;
    try {
      const types = Array.from(event.dataTransfer.types || [], value => String(value).toLowerCase());
      if (types.includes(COMPANION_DRAG_MIME)) return true;
      return event.type === 'drop' && event.dataTransfer.getData?.(COMPANION_DRAG_MIME) === 'owned';
    } catch (_) { return false; }
  }

  function consumeDragEvent(event) {
    event.preventDefault?.();
    event.stopPropagation?.();
  }

  function refreshDraggedEligibility(options = {}) {
    if (!draggedContextId) return null;
    // Dragover can fire dozens of times per second. Keep its visual preview on
    // the fenced drag-start snapshot and perform exactly one fresh read on the
    // final drop. The data authority also revalidates during stage and commit.
    if (options.force !== true && draggedArchiveEligibility) return draggedArchiveEligibility;
    const core = readCoreSnapshot();
    draggedArchiveEligibility = archiveGestureEligibility(core, draggedContextId, {
      snapshotStale,
      busy: Boolean(busyAction)
    });
    return draggedArchiveEligibility;
  }

  function reconcileWorkspaceSelection() {
    const core = readCoreSnapshot();
    const timer = core?.timer;
    if (!timer) return false;
    const rows = eligibleRows(timer);
    const selectedVisible = rows.some(row => row.contextId === selectedContextId && !hiddenTabs.has(String(row.contextId)));
    if (!selectedVisible) {
      const operational = rows.some(row => row.contextId === timer.currentContextId) ? timer.currentContextId : null;
      const workspace = deriveTabWorkspace(rows, {
        hiddenContextIds: [...hiddenTabs], durableOrder, selectedContextId: null, operationalContextId: operational
      });
      selectedContextId = operational || workspace.visibleRows[0]?.contextId || null;
      durableOrder = [...workspace.order];
      savePreferences();
      return true;
    }
    return false;
  }

  function showArchiveNotice(contextId, label) {
    if (disposed) return;
    if (archiveNoticeTimer !== null) window.clearTimeout?.(archiveNoticeTimer);
    archiveNotice = { contextId: String(contextId), label: String(label || contextId) };
    archiveNoticeShouldReveal = true;
    archiveNoticeTimer = window.setTimeout?.(() => {
      archiveNotice = null;
      archiveNoticeTimer = null;
      render();
    }, 8_000) ?? null;
  }

  function onDragStart(event) {
    if (['data-import', 'data-export', 'conflict-resolution'].includes(busyAction)) return;
    const tab = event.target.closest?.('.sc-tab[data-context]');
    if (!tab || !root?.contains(tab) || event.isTrusted !== true || !event.dataTransfer) return;
    draggedContextId = tab.dataset.context || null;
    dragAttemptedOutside = false;
    draggedArchiveEligibility = archiveGestureEligibility(lastGoodCore, draggedContextId, {
      snapshotStale,
      busy: Boolean(busyAction)
    });
    stopCycleHover();
    if (root) {
      root.dataset.dragging = draggedContextId ? 'true' : 'false';
      root.dataset.dragAway = 'false';
    }
    tab.closest('.sc-tab-slot')?.setAttribute?.('data-drag-source', 'true');
    try {
      // Keep the authoritative Context id in closure state. The page only sees
      // a generic drag payload, so a SquareCoil drop target cannot read a job id.
      event.dataTransfer.setData('text/plain', 'SquareCoil Companion job tab');
      event.dataTransfer.setData(COMPANION_DRAG_MIME, 'owned');
      event.dataTransfer.effectAllowed = 'move';
      ownedDragActive = true;
    } catch (_) { clearDragState(); }
  }

  function onDragOver(event) {
    if (!draggedContextId || event.isTrusted !== true || !isOwnedDragEvent(event)) return;
    if (!root?.contains(event.target)) return;
    consumeDragEvent(event);
    const slot = event.target.closest?.('.sc-tab-slot');
    if (!slot || !root.contains(slot)) {
      root.dataset.dragAway = 'true';
      clearDropIndicators();
      // On narrow screens the dock can occupy the whole viewport. A drag
      // outside the tab rail therefore uses the explicit retirement veil.
      if (window.innerWidth <= 760) {
        dragAttemptedOutside = true;
        const eligibility = refreshDraggedEligibility();
        setArchiveVeil(true, eligibility);
        if (event.dataTransfer) event.dataTransfer.dropEffect = eligibility?.eligible ? 'move' : 'none';
      } else {
        setArchiveVeil(false);
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
      }
      return;
    }
    root.dataset.dragAway = 'false';
    setArchiveVeil(false);
    clearDropIndicators();
    const rect = slot.getBoundingClientRect?.();
    const placement = rect && Number.isFinite(event.clientX) && event.clientX > rect.left + (rect.width / 2) ? 'after' : 'before';
    slot.dataset.dropPosition = placement;
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  function onDrop(event) {
    if (!draggedContextId || event.isTrusted !== true || !isOwnedDragEvent(event) || !root?.contains(event.target)) return;
    consumeDragEvent(event);
    const slot = event.target.closest?.('.sc-tab-slot');
    if (!slot || !root.contains(slot)) {
      if (window.innerWidth <= 760 && dragAttemptedOutside) finishArchiveDrop();
      else clearDragState();
      return;
    }
    const source = draggedContextId;
    const target = slot.dataset.context;
    const placement = slot.dataset.dropPosition === 'after' ? 'after' : 'before';
    clearDragState();
    if (source && target && source !== target) {
      const currentOrder = lastGoodCore?.timer
        ? deriveTabWorkspace(eligibleRows(lastGoodCore.timer), {
            hiddenContextIds: [...hiddenTabs],
            durableOrder,
            selectedContextId,
            operationalContextId: lastGoodCore.timer.currentContextId
          }).order
        : durableOrder;
      durableOrder = placeContext(currentOrder, source, target, placement);
      savePreferences();
      render();
    }
  }

  function onDocumentDragOver(event) {
    if (event.isTrusted !== true || !isOwnedDragEvent(event)) return;
    if (!draggedContextId) {
      consumeDragEvent(event);
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
      return;
    }
    if (root?.isConnected !== true || document.getElementById(ROOT_ID) !== root) {
      consumeDragEvent(event);
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
      clearDragState({ preserveOwnership: true });
      return;
    }
    if (root.contains(event.target)) return;
    consumeDragEvent(event);
    dragAttemptedOutside = true;
    root.dataset.dragAway = 'true';
    clearDropIndicators();
    const eligibility = refreshDraggedEligibility();
    setArchiveVeil(true, eligibility);
    if (event.dataTransfer) event.dataTransfer.dropEffect = eligibility?.eligible ? 'move' : 'none';
  }

  function onDocumentDrop(event) {
    if (event.isTrusted !== true || !isOwnedDragEvent(event)) return;
    if (!draggedContextId) {
      consumeDragEvent(event);
      clearDragState();
      return;
    }
    if (root?.isConnected !== true || document.getElementById(ROOT_ID) !== root) {
      consumeDragEvent(event);
      clearDragState();
      return;
    }
    if (root.contains(event.target)) return;
    consumeDragEvent(event);
    finishArchiveDrop();
  }

  function finishArchiveDrop() {
    const contextId = draggedContextId;
    const previewEligibility = draggedArchiveEligibility;
    const eligibility = refreshDraggedEligibility({ force: true });
    clearDragState();
    if (!previewEligibility?.eligible || !eligibility?.eligible) {
      errorMessage = previewEligibility?.eligible === false
        ? previewEligibility.message
        : eligibility?.message || 'The job was not archived because its protection state could not be verified.';
      render();
      return;
    }
    withBusy('archive-drag', async () => {
      const committed = await runDataAction(DATA_COMMANDS.ARCHIVE_CONTEXT, { contextId, label: eligibility.label });
      if (!committed || disposed) return;
      showArchiveNotice(contextId, eligibility.label);
      reconcileWorkspaceSelection();
    });
  }

  function onDragEnd() {
    if (!ownedDragActive && !draggedContextId && !dragAttemptedOutside) return;
    clearDragState();
    render();
  }

  function onGlobalKeyDown(event) {
    if (event.key === 'Escape' && draggedContextId) clearDragState({ preserveOwnership: true });
  }

  function onWindowBlur() {
    if (draggedContextId) clearDragState({ preserveOwnership: true });
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden' && draggedContextId) clearDragState({ preserveOwnership: true });
  }

  function onSubmit(event) {
    if (event.target.matches?.('[data-sc-limits-form]')) {
      event.preventDefault();
      if (event.isTrusted !== true || !limitDraft) return;
      const values = {
        yellowMinutes: Number(limitDraft.yellowMinutes),
        orangeMinutes: Number(limitDraft.orangeMinutes),
        redMinutes: Number(limitDraft.redMinutes)
      };
      if (!validLimits(values)) {
        errorMessage = 'Timer Limits require integers with 1 ≤ Yellow ≤ Orange ≤ Red.';
        render();
        return;
      }
      if (limitDraft.baseRevision !== preferenceRevision) {
        errorMessage = 'Settings changed in another tab. Reopen Time color limits before saving.';
        render();
        return;
      }
      withBusy('preference', async () => {
        await commitPreferencePatch(values, limitDraft.baseRevision);
        limitDraft = null;
      });
      return;
    }
    if (event.target.matches?.('[data-sc-support-form]')) {
      event.preventDefault();
      if (event.isTrusted !== true) return;
      const kind = event.target.dataset.supportKind;
      const composition = supportComposition(kind);
      if (!composition.ok) {
        errorMessage = composition.errors.join(' ');
        render();
        return;
      }
      if (composition.tooLarge || !composition.mailto) {
        supportMessage = 'This draft is too large for a reliable mailto link. Nothing was truncated; use Copy Message.';
        render();
        return;
      }
      window.open(composition.mailto, '_blank', 'noopener');
      supportMessage = `Email draft requested for ${composition.recipient}. Companion cannot confirm that it opened or was sent.`;
      render();
      return;
    }
    if (!event.target.matches?.('[data-sc-search-form]')) return;
    event.preventDefault(); if (event.isTrusted !== true) return;
    const query = String(new FormData(event.target).get('projectId') || '').trim();
    const rows = lastGoodCore?.timer?.contextRows || [];
    const lower = query.toLowerCase();
    const known = rows.find(row => row.contextId.toLowerCase() === lower || row.label.toLowerCase().includes(lower) || String(row.projectId || '') === query);
    if (known) {
      const targetView = eligibleRows(lastGoodCore?.timer).some(row => row.contextId === known.contextId) ? 'main' : 'context-detail';
      selectContext(known.contextId, targetView); render(); return;
    }
    if (safeProjectId(query)) { openJob(query); return; }
    errorMessage = 'No matching job found.'; render();
  }

  async function start() {
    if (started) return;
    await loadPreferences();
    if (disposed || started) return;
    started = true;
    storageChanges?.addListener?.(onStorageChanged);
    document.addEventListener?.('dragover', onDocumentDragOver, true);
    document.addEventListener?.('drop', onDocumentDrop, true);
    document.addEventListener?.('dragend', onDragEnd, true);
    document.addEventListener?.('keydown', onGlobalKeyDown, true);
    document.addEventListener?.('visibilitychange', onVisibilityChange);
    window.addEventListener?.('blur', onWindowBlur);
    window.addEventListener?.('pagehide', onWindowBlur);
    window.addEventListener?.('resize', updateTabCycleButtons);
    render();
    intervalId = window.setInterval(() => render({ allowInteractionDeferral: true }), REFRESH_MS);
  }

  function setRouteProtection(value = {}) {
    routeProtection = { dirty: value.dirty === true, inProgress: value.inProgress === true };
    render();
  }

  function teardown() {
    if (disposed) return;
    disposed = true;
    cancelFileRead?.();
    for (const finish of [...pendingPaintYields]) finish();
    stopCycleHover();
    cancelDockMorph();
    viewHeightAnimation?.cancel();
    viewHeightAnimation = null;
    if (intervalId !== null) window.clearInterval(intervalId);
    intervalId = null;
    if (archiveNoticeTimer !== null) window.clearTimeout?.(archiveNoticeTimer);
    archiveNoticeTimer = null;
    clearDragState();
    storageChanges?.removeListener?.(onStorageChanged);
    document.removeEventListener?.('dragover', onDocumentDragOver, true);
    document.removeEventListener?.('drop', onDocumentDrop, true);
    document.removeEventListener?.('dragend', onDragEnd, true);
    document.removeEventListener?.('keydown', onGlobalKeyDown, true);
    document.removeEventListener?.('visibilitychange', onVisibilityChange);
    window.removeEventListener?.('blur', onWindowBlur);
    window.removeEventListener?.('pagehide', onWindowBlur);
    window.removeEventListener?.('resize', updateTabCycleButtons);
    if (root) {
      root.removeEventListener('click', onClick); root.removeEventListener('dblclick', onDoubleClick);
      root.removeEventListener('submit', onSubmit); root.removeEventListener('dragstart', onDragStart);
      root.removeEventListener('dragover', onDragOver); root.removeEventListener('drop', onDrop);
      root.removeEventListener('dragend', onDragEnd);
      root.removeEventListener('change', onChange);
      root.removeEventListener('cancel', onFileCancel);
      root.removeEventListener('input', onInput); root.removeEventListener('keydown', onKeyDown);
      root.removeEventListener('scroll', onTabScroll, true);
      root.removeEventListener('wheel', onTabWheel);
      root.removeEventListener('pointermove', onCyclePointerEnter, true);
      root.removeEventListener('pointerleave', onCyclePointerLeave, true);
    }
    root = null;
  }

  return Object.freeze({ start, render, setRouteProtection, teardown });
}

module.exports = { ROOT_ID, UI_STORAGE_DEFAULTS, MAX_VISIBLE_JOB_TABS, formatDuration, safeProjectId, deriveVisibleTabs,
  archiveGestureEligibility, createWorkspaceUi };
