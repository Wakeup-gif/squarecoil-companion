'use strict';
const { createWorkspaceUi } = require('../../src/ui/workspace-ui');
const { DEFAULT_PREFERENCES } = require('../../src/preferences/preferences');
const rows = ['910001', '910002', '910003', '910004', '910005', '910006'].map((projectId, index) => ({
  contextId: `job:${projectId}`, kind: 'job', projectId,
  label: ['Lobby signage', 'Exterior lettering', 'Wayfinding system', 'North wing signs and corridor wayfinding — Phase 2', 'Reception graphics', 'Window decals'][index], shortLabel: projectId,
  todayMs: [5120000, 2740000, 10200000, 17100000, 4200000, 8000000][index],
  totalMs: [18720000, 12600000, 17200000, 35100000, 13200000, 15600000][index],
  thresholdLevel: ['YELLOW', 'NONE', 'ORANGE', 'RED', 'YELLOW', 'ORANGE'][index], status: index === 0 ? 'RUNNING' : 'NOT_RUNNING',
  isOperational: index === 0, isProvisional: false, isSafetyHeld: false,
  archivedAtMs: null, workspaceMembership: 'RECENT', lastSeenAtMs: 3000 - index,
  lastRecordedActivityAtMs: 2000 - index, legacyUnattributedMs: 0
}));
const timer = {
  revision: 1, sourcePreferenceRevision: 0, workdayZone: 'America/New_York',
  timeBasis: { disclosed: false, label: 'America/New_York', deviceMismatch: false },
  currentContextId: rows[0].contextId, lastObservation: null, focusIntent: null, contextRows: rows,
  todayTotalMs: rows.reduce((total, row) => total + row.todayMs, 0),
  weekTotalMs: rows.reduce((total, row) => total + row.todayMs, 18000000),
  todayByContext: rows.map(row => ({ ...row, durationMs: row.todayMs })),
  byDayRows: [], byContextRows: rows,
  contextDetails: Object.fromEntries(rows.map(row => [row.contextId, { ...row, weekMs: row.totalMs, datedMs: row.totalMs, dailyRows: [], finalizedSessions: [] }])),
  historyRows: [], historyTotal: 0, historyHasMore: false,
  availableActions: { localPause: true, resume: false, startFresh: false, localResume: false },
  running: { elapsedMs: 780000, provisional: false }
};
let loading = true;
let loadingTimer;
const core = {
  initialized: true, blocked: false, status: 'trusted-core-owner-active', timer,
  preferences: { ...DEFAULT_PREFERENCES, initialized: true, preferenceRevision: 1, timerAppearance: 'DARK', panelFinish: 'GLASS' },
  presentation: { timerAppearanceEffective: 'DARK', panelFinishEffective: 'GLASS' },
  data: { revision: 1, recentRows: rows.map(row => ({ ...row, protected: row.isOperational })), archivedRows: [], quiescent: false }
};
const handle = {
  coreSnapshot() { return loading ? { initialized: false, blocked: false, status: 'initializing', preferences: core.preferences, presentation: core.presentation } : structuredClone(core); },
  async preferenceAction(patch) {
    Object.assign(core.preferences, patch);
    core.preferences.preferenceRevision++;
    core.presentation.timerAppearanceEffective = core.preferences.timerAppearance === 'AUTO' ? 'DARK' : core.preferences.timerAppearance;
    core.presentation.panelFinishEffective = core.preferences.timerAppearance === 'CLEAR' ? 'GLASS' : core.preferences.panelFinish;
  },
  async syncBridge() {},
  async timerAction() { throw new Error('This preview shows fictional data. Use the sealed extension lab for timer interactions.'); }
};
const values = {};
function createUi() { return createWorkspaceUi({ document, window, storage: {
  async get(defaults) { return { ...defaults, ...values }; },
  async set(patch) { Object.assign(values, patch); }
}, getCoreHandle: () => handle }); }
let ui = createUi();
async function replayLoading() {
  clearTimeout(loadingTimer); loading = true;
  ui.teardown(); values.protoUiCollapsed = false; ui = createUi(); await ui.start();
  loadingTimer = setTimeout(() => { loading = false; ui.render(); }, 1800);
}
replayLoading();
document.getElementById('replay-loading').onclick = replayLoading;
for (const [id, patch] of Object.entries({ 'theme-clear': { timerAppearance: 'CLEAR' }, 'theme-dark': { timerAppearance: 'DARK' }, 'theme-light': { timerAppearance: 'LIGHT' }, 'finish-glass': { panelFinish: 'GLASS' }, 'finish-solid': { panelFinish: 'SOLID' } })) {
  document.getElementById(id).onclick = async () => { await handle.preferenceAction(patch); ui.render(); };
}
