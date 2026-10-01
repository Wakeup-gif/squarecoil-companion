'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ROOT_ID, createWorkspaceUi } = require('../../src/ui/workspace-ui');
const { MAX_INPUT_BYTES } = require('../../src/data/data-safety');

function timer() {
  return { revision: 4, sourcePreferenceRevision: 1, workdayZone: 'UTC', timeBasis: { disclosed: false },
    currentContextId: null, lastObservation: null, focusIntent: null, contextRows: [], todayByContext: [], byDayRows: [],
    byContextRows: [], contextDetails: {}, historyRows: [], historyTotal: 0, historyHasMore: false,
    todayTotalMs: 0, weekTotalMs: 0, availableActions: {}, running: null };
}

async function harness({ confirms = [], clipboardAvailable = true, cinematicPermission = true } = {}) {
  const listeners = {};
  const preferenceCommands = [];
  const opens = [];
  const copied = [];
  const permissionCalls = [];
  const commandOrder = [];
  const nativeClock = {
    clockIn: { outsideCompanion: true, hidden: false, scrolls: [], focuses: 0, clicks: 0,
      getAttribute() { return null; }, scrollIntoView(options) { this.scrolls.push(options); },
      focus() { this.focuses += 1; }, click() { this.clicks += 1; } },
    clockOut: { outsideCompanion: true, hidden: true, scrolls: [], focuses: 0, clicks: 0,
      getAttribute() { return null; }, scrollIntoView(options) { this.scrolls.push(options); },
      focus() { this.focuses += 1; }, click() { this.clicks += 1; } },
    container: { outsideCompanion: true, hidden: false, scrolls: [], clicks: 0,
      getAttribute() { return null; }, scrollIntoView(options) { this.scrolls.push(options); }, click() { this.clicks += 1; } }
  };
  function makeRoot() {
    return { dataset: {}, innerHTML: '', classList: { add() {} }, contains(element) { return element?.outsideCompanion !== true; }, querySelector() { return null; },
      addEventListener(type, listener) { listeners[type] = listener; }, removeEventListener(type, listener) { if (listeners[type] === listener) delete listeners[type]; } };
  }
  let activeRoot = makeRoot();
  const document = { getElementById(id) { return id === ROOT_ID ? activeRoot : null; },
    querySelector(selector) { return selector === '#clockin' ? nativeClock.clockIn : selector === '#clockout' ? nativeClock.clockOut : null; },
    querySelectorAll(selector) { return selector === '.timeclock-container' ? [nativeClock.container] : [activeRoot]; } };
  const window = { location: new URL('https://ussignandmill.squarecoil.net/project.php?id=private-job'), localStorage: { getItem() { return null; } },
    navigator: { userAgent: 'Mozilla/5.0 Chrome/151.0.7922.174 Safari/537.36', clipboard: { async writeText(value) {
      if (!clipboardAvailable) throw new Error('clipboard unavailable');
      copied.push(value);
    } } },
    open(...args) { opens.push(args); }, confirm() { return confirms.length ? confirms.shift() : true; },
    setInterval() { return 1; }, clearInterval() {} };
  const core = { initialized: true, blocked: false, status: 'trusted-core-owner-active', timer: timer(),
    bridge: { initialized: true, active: true, capability: 'FULL' },
    preferences: { initialized: true, preferenceRevision: 1, timerAppearance: 'LIGHT', panelFinish: 'SOLID', websiteTheme: 'ORIGINAL',
      cinematicBackground: 'NONE',
      yellowMinutes: 60, orangeMinutes: 120, redMinutes: 240 },
    presentation: { timerAppearanceEffective: 'LIGHT', panelFinishEffective: 'SOLID', websiteThemeEffective: 'ORIGINAL', logoStatus: 'native-logo',
      optional: { cinematic: { state: 'DISABLED' } } },
    data: { quiescent: true, recentRows: [], archivedRows: [] } };
  const handle = { coreSnapshot() { return core; }, async syncBridge() {},
    async preferenceAction(patch, expectedPreferenceRevision) {
      commandOrder.push('preference');
      preferenceCommands.push({ patch: structuredClone(patch), expectedPreferenceRevision });
      Object.assign(core.preferences, patch);
      core.preferences.preferenceRevision += 1;
      core.timer.sourcePreferenceRevision = core.preferences.preferenceRevision;
      if (patch.timerAppearance) core.presentation.timerAppearanceEffective = patch.timerAppearance;
      if (patch.panelFinish) core.presentation.panelFinishEffective = patch.panelFinish;
      if (patch.websiteTheme) {
        core.presentation.websiteThemeEffective = patch.websiteTheme;
        core.preferences.cinematicBackground = ['SLEEK_DARK', 'LIGHT_GLASS'].includes(patch.websiteTheme) ? 'CINEMATIC' : 'NONE';
        core.presentation.optional.cinematic = core.preferences.cinematicBackground !== 'CINEMATIC'
          ? { state: 'DISABLED' }
          : cinematicPermission
            ? { state: 'SHOWING', source: 'REMOTE', statusCode: 'BING_IMAGE_ACTIVE' }
            : { state: 'DEGRADED_FALLBACK', source: 'FALLBACK', statusCode: 'BING_ACCESS_RESTRICTED' };
      }
      if (patch.cinematicBackground) core.presentation.optional.cinematic.state = patch.cinematicBackground === 'CINEMATIC' ? 'DEGRADED_FALLBACK' : 'DISABLED';
    },
    requestCinematicAccess() { permissionCalls.push('request'); commandOrder.push('permission'); return Promise.resolve({ ok: cinematicPermission, granted: cinematicPermission, reason: cinematicPermission ? null : 'bing-permission-denied' }); },
    async clearCinematicBackground() { permissionCalls.push('clear'); return { ok: true, cleared: true }; } };
  const storage = { async get(defaults) { return defaults; }, async set() {} };
  const ui = createWorkspaceUi({ document, window, storage, packageVersion: '0.7.1', userAgent: window.navigator.userAgent,
    getCoreHandle: () => handle });
  await ui.start();
  function click(dataset, trusted = true) {
    const target = { dataset, closest(selector) { return selector === '[data-action]' ? target : null; } };
    listeners.click({ target, isTrusted: trusted, stopPropagation() {} });
  }
  function inputLimit(name, value) {
    const target = { name, value, closest(selector) { return selector === '[data-sc-limits-form] input[name]' ? target : null; } };
    listeners.input({ target });
  }
  function supportField(kind, field, value, checked = false, change = false) {
    const form = { dataset: { supportKind: kind } };
    const target = { value, checked, type: field === 'includeDiagnostics' ? 'checkbox' : 'text', dataset: { supportField: field },
      closest(selector) { if (selector === '[data-support-field]') return target; if (selector === '[data-sc-support-form]') return form; return null; } };
    listeners[change ? 'change' : 'input']({ target });
  }
  function submit(kind) {
    const target = { dataset: kind ? { supportKind: kind } : {}, matches(selector) {
      return kind ? selector === '[data-sc-support-form]' : selector === '[data-sc-limits-form]';
    } };
    listeners.submit({ target, isTrusted: true, preventDefault() {} });
  }
  async function drain() { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); }
  return { ui, get root() { return activeRoot; }, core, nativeClock, preferenceCommands, permissionCalls, commandOrder, opens, copied, click, inputLimit, supportField, submit, drain,
    change(target) { listeners.change({ target }); },
    replaceRoot() { activeRoot = makeRoot(); ui.render(); } };
}

test('UT-B5-UI-001 one Settings router exposes the settled user-facing feature groups', async () => {
  const h = await harness();
  h.click({ action: 'view', view: 'settings' });
  for (const label of ['Appearance', 'Time tracking', 'Jobs', 'Notifications', 'Privacy and data',
    'Help', 'Companion appearance', 'SquareCoil theme', 'Local data and backups', 'Submit a ticket']) {
    assert.match(h.root.innerHTML, new RegExp(label));
  }
  assert.equal((h.root.innerHTML.match(/data-action="settings-toggle-group"/g) || []).length, 7);
  assert.equal((h.root.innerHTML.match(/aria-expanded="false"/g) || []).length, 7);
  h.ui.teardown();
});

test('UT-B5-UI-027 Clear appearance describes its effective glass finish', async () => {
  const h = await harness();
  h.core.preferences.timerAppearance = 'CLEAR';
  h.core.preferences.panelFinish = 'SOLID';
  h.ui.render();
  h.click({ action: 'view', view: 'settings' });
  h.click({ action: 'settings-toggle-group', group: 'appearance' });
  assert.match(h.root.innerHTML, /Companion appearance<\/strong><small>Transparent glass<\/small>/);
  assert.doesNotMatch(h.root.innerHTML, /Companion appearance<\/strong><small>Solid panel finish<\/small>/);
  h.ui.teardown();
});

test('UT-B5-UI-020 Settings disclosures reveal one nested category at a time and collapse on a second click', async () => {
  const h = await harness();
  h.click({ action: 'view', view: 'settings' });
  h.click({ action: 'settings-toggle-group', group: 'appearance' });
  assert.match(h.root.innerHTML, /data-group="appearance" aria-expanded="true"/);
  assert.match(h.root.innerHTML, /id="sc-settings-group-appearance" role="region" aria-label="Appearance settings"><div/);

  h.click({ action: 'settings-toggle-group', group: 'time' });
  assert.match(h.root.innerHTML, /data-group="appearance" aria-expanded="false"/);
  assert.match(h.root.innerHTML, /id="sc-settings-group-appearance" role="region" aria-label="Appearance settings" hidden/);
  assert.match(h.root.innerHTML, /data-group="time" aria-expanded="true"/);
  assert.equal((h.root.innerHTML.match(/aria-expanded="true"/g) || []).length, 1);

  h.click({ action: 'settings-toggle-group', group: 'time' });
  assert.equal((h.root.innerHTML.match(/aria-expanded="true"/g) || []).length, 0);
  h.ui.teardown();
});

test('UT-B5-UI-021 Companion chrome is text-only and uses quiet surfaces without removing accessible focus or job-tab edges', async () => {
  const h = await harness();
  h.click({ action: 'view', view: 'settings' });
  assert.match(h.root.innerHTML, /<strong>SquareCoil Companion<\/strong>/);
  assert.doesNotMatch(h.root.innerHTML, /sc-brand-mark|<img\b|US Sign &amp; Mill|>SC<\/span>/);
  assert.match(h.root.innerHTML, /button\{border:0;background:var\(--sc-panel-2\)/);
  assert.match(h.root.innerHTML, /\.sc-settings-group\{overflow:hidden;border:0;/);
  assert.match(h.root.innerHTML, /button:focus-visible[^\{]+\{outline:2px solid var\(--sc-accent\)/);
  assert.match(h.root.innerHTML, /button\.sc-tab\{[^}]*border:1px solid var\(--sc-border\)!important/);
  h.ui.teardown();
});

test('UT-B5-UI-002 appearance controls require a trusted click and commit through the revisioned Preferences service', async () => {
  const h = await harness();
  h.click({ action: 'view', view: 'settings' });
  h.click({ action: 'settings-route', view: 'timer-appearance' });
  h.click({ action: 'preference', value: 'DARK' }, false);
  assert.equal(h.preferenceCommands.length, 0);
  h.click({ action: 'preference', value: 'DARK' }, true);
  await h.drain();
  assert.deepEqual(h.preferenceCommands[0], { patch: { timerAppearance: 'DARK' }, expectedPreferenceRevision: 1 });
  assert.equal(h.root.dataset.protoTheme, 'dark');
  h.ui.teardown();
});

test('UT-B5-UI-003 valid Timer Limits save as one coherent batch while invalid order remains uncommitted', async () => {
  const h = await harness();
  h.click({ action: 'view', view: 'settings' });
  h.click({ action: 'settings-route', view: 'timer-limits' });
  h.inputLimit('yellowMinutes', '90'); h.inputLimit('orangeMinutes', '30'); h.inputLimit('redMinutes', '120');
  h.submit();
  assert.equal(h.preferenceCommands.length, 0);
  assert.match(h.root.innerHTML, /1 ≤ Yellow ≤ Orange ≤ Red/);
  h.inputLimit('yellowMinutes', '30'); h.inputLimit('orangeMinutes', '60'); h.inputLimit('redMinutes', '120');
  h.submit(); await h.drain();
  assert.deepEqual(h.preferenceCommands[0].patch, { yellowMinutes: 30, orangeMinutes: 60, redMinutes: 120 });
  h.ui.teardown();
});

test('UT-B5-UI-004 a newer cross-tab preference revision marks an unsaved Limits draft stale and blocks Save', async () => {
  const h = await harness();
  h.click({ action: 'view', view: 'settings' }); h.click({ action: 'settings-route', view: 'timer-limits' });
  h.inputLimit('yellowMinutes', '30');
  h.core.preferences.preferenceRevision = 2;
  h.ui.render();
  assert.match(h.root.innerHTML, /Settings changed in another tab/);
  h.submit();
  assert.equal(h.preferenceCommands.length, 0);
  h.ui.teardown();
});

test('UT-B5-UI-005 modified Support draft cannot be silently discarded by Back', async () => {
  const h = await harness({ confirms: [false, true] });
  h.click({ action: 'view', view: 'settings' }); h.click({ action: 'settings-route', view: 'submit-ticket' });
  h.supportField('ticket', 'subject', 'Do not lose this');
  h.click({ action: 'settings-back', view: 'settings' });
  h.ui.render();
  assert.match(h.root.innerHTML, /Do not lose this/);
  h.click({ action: 'settings-back', view: 'settings' });
  assert.match(h.root.innerHTML, /Companion appearance/);
  h.ui.teardown();
});

test('UT-B5-UI-006 diagnostics are opt-in frozen previews and mailto remains an explicit user action', async () => {
  const h = await harness();
  h.click({ action: 'view', view: 'settings' }); h.click({ action: 'settings-route', view: 'send-feedback' });
  h.supportField('feedback', 'description', 'A useful idea');
  h.supportField('feedback', 'includeDiagnostics', '', true, true);
  const frozen = /<pre[^>]*>([\s\S]*?)<\/pre>/.exec(h.root.innerHTML)?.[1];
  assert.ok(frozen);
  h.core.status = 'changed-after-preview';
  h.ui.render();
  assert.equal(/<pre[^>]*>([\s\S]*?)<\/pre>/.exec(h.root.innerHTML)?.[1], frozen);
  assert.equal(h.opens.length, 0);
  h.submit('feedback');
  assert.equal(h.opens.length, 1);
  assert.match(h.opens[0][0], /^mailto:/);
  h.ui.teardown();
});

test('UT-B5-UI-007 unavailable clipboard exposes the full requested value for manual copy', async () => {
  const h = await harness({ clipboardAvailable: false });
  h.click({ action: 'view', view: 'settings' }); h.click({ action: 'settings-route', view: 'submit-ticket' });
  h.click({ action: 'copy-support-email' });
  await h.drain();
  assert.match(h.root.innerHTML, /Clipboard access was unavailable/);
  assert.match(h.root.innerHTML, /cristian@ussignandmill\.com/);
  h.ui.teardown();
});

test('UT-B5-UI-008 recovered Companion root returns to Settings Home without restoring transient Support text', async () => {
  const h = await harness();
  h.click({ action: 'view', view: 'settings' }); h.click({ action: 'settings-route', view: 'submit-ticket' });
  h.supportField('ticket', 'subject', 'transient private draft');
  h.replaceRoot();
  assert.match(h.root.innerHTML, /Companion appearance/);
  assert.doesNotMatch(h.root.innerHTML, /transient private draft/);
  h.ui.teardown();
});

test('UT-B5-UI-009 Glass uses installed capability without runtime permission requests and restricted access keeps fallback', async () => {
  const denied = await harness({ cinematicPermission: false });
  denied.click({ action: 'view', view: 'settings' }); denied.click({ action: 'settings-route', view: 'website-theme' });
  assert.doesNotMatch(denied.root.innerHTML, /preference-cinematic/);
  denied.click({ action: 'preference-site', value: 'SLEEK_DARK' }, false);
  assert.deepEqual(denied.permissionCalls, []);
  assert.deepEqual(denied.preferenceCommands, []);
  denied.click({ action: 'preference-site', value: 'SLEEK_DARK' }); await denied.drain();
  assert.deepEqual(denied.permissionCalls, []);
  assert.deepEqual(denied.commandOrder, ['preference']);
  assert.deepEqual(denied.preferenceCommands[0], { patch: { websiteTheme: 'SLEEK_DARK' }, expectedPreferenceRevision: 1 });
  assert.equal(denied.core.preferences.websiteTheme, 'SLEEK_DARK');
  assert.equal(denied.core.preferences.cinematicBackground, 'CINEMATIC');
  assert.match(denied.root.innerHTML, /built-in gradient fallback active/i);
  denied.ui.teardown();

  const granted = await harness({ cinematicPermission: true });
  granted.click({ action: 'view', view: 'settings' }); granted.click({ action: 'settings-route', view: 'website-theme' });
  granted.click({ action: 'preference-site', value: 'SLEEK_DARK' }); await granted.drain();
  assert.deepEqual(granted.permissionCalls, []);
  assert.deepEqual(granted.preferenceCommands[0], { patch: { websiteTheme: 'SLEEK_DARK' }, expectedPreferenceRevision: 1 });
  assert.equal(granted.core.preferences.cinematicBackground, 'CINEMATIC');
  assert.match(granted.root.innerHTML, /open Companion from Chrome’s toolbar and use the switch beside the theme choice/i);
  assert.match(granted.root.innerHTML, /Image requests contain no job, timer, page, or account data/i);
  granted.ui.teardown();
});

test('UT-B5-UI-010 Native clears background state without requesting or revoking installed Bing capability', async () => {
  const h = await harness();
  Object.assign(h.core.preferences, { websiteTheme: 'SLEEK_DARK', cinematicBackground: 'CINEMATIC' });
  h.ui.render(); h.click({ action: 'view', view: 'settings' }); h.click({ action: 'settings-route', view: 'website-theme' });
  h.click({ action: 'preference-site', value: 'ORIGINAL' }); await h.drain();
  assert.deepEqual(h.preferenceCommands[0].patch, { websiteTheme: 'ORIGINAL' });
  assert.deepEqual(h.permissionCalls, ['clear']); h.ui.teardown();
});

test('UT-B5-UI-011 zero-history Home keeps Library and Settings reachable before the first clock-in', async () => {
  const h = await harness();
  assert.match(h.root.innerHTML, /No recent jobs yet/);
  for (const destination of ['recent', 'overview', 'history', 'settings']) {
    assert.match(h.root.innerHTML, new RegExp(`data-action="view" data-view="${destination}"`));
  }
  const before = structuredClone(h.core.timer);
  h.click({ action: 'view', view: 'settings' });
  assert.match(h.root.innerHTML, /Companion appearance/);
  assert.deepEqual(h.core.timer, before);
  assert.equal(h.preferenceCommands.length, 0);
  h.ui.teardown();
});

test('UT-B5-UI-012 theme choices and Advanced diagnostics stay available with zero history', async () => {
  const h = await harness();
  h.click({ action: 'view', view: 'settings' });
  h.click({ action: 'settings-route', view: 'website-theme' });
  for (const label of ['Native / Off', 'Dark Glass', 'Light Glass', 'Refined Light']) assert.match(h.root.innerHTML, new RegExp(label));
  h.click({ action: 'preference-site', value: 'LIGHT_GLASS' });
  await h.drain();
  assert.deepEqual(h.permissionCalls, []);
  assert.deepEqual(h.preferenceCommands[0], { patch: { websiteTheme: 'LIGHT_GLASS' }, expectedPreferenceRevision: 1 });
  h.click({ action: 'settings-back', view: 'settings' });
  h.click({ action: 'settings-route', view: 'advanced-diagnostics' });
  assert.match(h.root.innerHTML, /Advanced diagnostics/);
  assert.match(h.root.innerHTML, /Technical details/);
  assert.match(h.root.innerHTML, /privacy-safe/i);
  h.ui.teardown();
});

test('UT-B5-UI-013 long job labels remain contained and escaped in the compact workspace', async () => {
  const h = await harness();
  const longLabel = `260701 - ${'Very long production label '.repeat(12)}<script>private</script>`;
  h.core.timer.contextRows = [{
    contextId: 'job:260701', kind: 'job', projectId: '260701', label: longLabel, shortLabel: '260701',
    status: 'NOT_RUNNING', todayMs: 0, totalMs: 0, thresholdLevel: 'NONE', isOperational: false,
    isSafetyHeld: false, isProvisional: false, lastSeenAtMs: 1, lastRecordedActivityAtMs: null
  }];
  h.ui.render();
  assert.match(h.root.innerHTML, /Very long production label/);
  assert.doesNotMatch(h.root.innerHTML, /<script>private<\/script>/);
  assert.match(h.root.innerHTML, /&lt;script&gt;private&lt;\/script&gt;/);
  assert.match(h.root.innerHTML, /overflow-wrap:anywhere/);
  h.ui.teardown();
});

test('UT-B5-UI-014 blocked startup keeps safe Settings and diagnostics available while Timer actions stay absent', async () => {
  const h = await harness();
  h.core.blocked = true;
  h.core.status = 'legacy-preflight-failed';
  h.core.timer = null;
  h.ui.render();
  assert.match(h.root.innerHTML, /Needs attention/);
  assert.match(h.root.innerHTML, /Appearance, support and privacy-safe diagnostics remain available/);
  assert.doesNotMatch(h.root.innerHTML, /data-timer-action/);
  h.click({ action: 'view', view: 'settings' });
  assert.match(h.root.innerHTML, /Companion appearance/);
  assert.match(h.root.innerHTML, /SquareCoil theme/);
  h.click({ action: 'open-diagnostics' });
  assert.match(h.root.innerHTML, /Advanced diagnostics/);
  h.ui.teardown();
});

test('UT-B5-UI-017 SquareCoil theme reports the real Bing source instead of calling every fallback a saved wallpaper', async () => {
  const h = await harness();
  h.core.presentation.optional.cinematic = { state: 'DEGRADED_FALLBACK', source: 'FALLBACK', reason: 'bing-origin-access-restricted' };
  h.click({ action: 'view', view: 'settings' });
  h.click({ action: 'settings-route', view: 'website-theme' });
  assert.match(h.root.innerHTML, /Bing access restricted by browser; built-in gradient fallback active/);
  assert.doesNotMatch(h.root.innerHTML, /Using saved wallpaper/);
  h.core.presentation.optional.cinematic = { state: 'SHOWING', source: 'REMOTE', reason: 'remote-loaded' };
  h.ui.render();
  assert.match(h.root.innerHTML, /Bing image active/);
  h.ui.teardown();
});

test('UT-B5-UI-018 initial Bing loading and accessibility suspension have truthful status copy', async () => {
  const h = await harness();
  h.core.presentation.optional.cinematic = { state: 'LOADING_INITIAL', source: null, reason: 'initial' };
  h.click({ action: 'view', view: 'settings' });
  h.click({ action: 'settings-route', view: 'website-theme' });
  assert.match(h.root.innerHTML, /Loading Bing image; built-in gradient fallback active/);

  h.core.presentation.optional.cinematic = { state: 'SUSPENDED_ACCESSIBILITY', source: null, reason: 'accessibility-override' };
  h.ui.render();
  assert.match(h.root.innerHTML, /Accessibility override; built-in background only/);
  assert.doesNotMatch(h.root.innerHTML, /Choose Dark Glass or Light Glass/);
  h.ui.teardown();
});

test('UT-B5-UI-019 Bing presentation statuses use exact source and failure wording without saved-wallpaper ambiguity', async () => {
  const h = await harness();
  h.click({ action: 'view', view: 'settings' });
  h.click({ action: 'settings-route', view: 'website-theme' });
  const cases = [
    [{ state: 'SHOWING', source: 'REMOTE', statusCode: 'BING_IMAGE_ACTIVE' }, /Bing image active/],
    [{ state: 'SHOWING', source: 'CACHE_FRESH', statusCode: 'RECENT_CACHED_BING_IMAGE_ACTIVE' }, /Recent cached Bing image active/],
    [{ state: 'DEGRADED_CACHE', source: 'CACHE_RETAINED', statusCode: 'OLDER_CACHED_BING_IMAGE_RETAINED', failureCode: 'NETWORK_UNAVAILABLE' }, /Older cached Bing image retained after a failure; network unavailable/],
    [{ state: 'DEGRADED_FALLBACK', source: 'FALLBACK', statusCode: 'BING_ACCESS_RESTRICTED' }, /Bing access restricted by browser; built-in gradient fallback active/],
    [{ state: 'DEGRADED_FALLBACK', source: 'FALLBACK', statusCode: 'BING_RESPONSE_REJECTED' }, /Bing response rejected; built-in gradient fallback active/],
    [{ state: 'DEGRADED_FALLBACK', source: 'FALLBACK', statusCode: 'NETWORK_UNAVAILABLE' }, /Network unavailable; built-in gradient fallback active/],
    [{ state: 'DEGRADED_FALLBACK', source: 'FALLBACK', statusCode: 'BUILT_IN_GRADIENT_FALLBACK' }, /Built-in gradient fallback active/],
    [{ state: 'SUSPENDED_ACCESSIBILITY', source: null, statusCode: 'ACCESSIBILITY_OVERRIDE' }, /Accessibility override; built-in background only/]
  ];
  for (const [cinematic, expected] of cases) {
    h.core.presentation.optional.cinematic = cinematic;
    h.ui.render();
    assert.match(h.root.innerHTML, expected);
    assert.doesNotMatch(h.root.innerHTML, /Using saved wallpaper/);
  }
  h.ui.teardown();
});


test('UT-B5-UI-022 dashboard controls commit independently through canonical Preferences and never touch Timer', async () => {
  const h = await harness();
  const timerBefore = structuredClone(h.core.timer);
  h.click({ action: 'view', view: 'settings' });
  assert.match(h.root.innerHTML, /Analytics dashboard/);
  h.click({ action: 'settings-route', view: 'dashboard' });
  assert.match(h.root.innerHTML, /Dashboard appearance/);
  h.click({ action: 'preference-dashboard', value: 'true' }, false);
  assert.equal(h.preferenceCommands.length, 0);
  h.click({ action: 'preference-dashboard', value: 'true' }); await h.drain();
  assert.deepEqual(h.preferenceCommands[0], { patch: { dashboardEnabled: true }, expectedPreferenceRevision: 1 });
  h.click({ action: 'preference-dashboard-appearance', value: 'DARK' }); await h.drain();
  assert.deepEqual(h.preferenceCommands[1], { patch: { dashboardAppearance: 'DARK' }, expectedPreferenceRevision: 2 });
  assert.equal(h.core.preferences.timerAppearance, 'LIGHT');
  assert.equal(h.core.preferences.websiteTheme, 'ORIGINAL');
  h.click({ action: 'preference-dashboard', value: 'false' }); await h.drain();
  assert.equal(h.core.preferences.dashboardEnabled, false);
  assert.deepEqual({ ...h.core.timer, sourcePreferenceRevision: timerBefore.sourcePreferenceRevision }, timerBefore);
  assert.deepEqual(h.permissionCalls, []);
  h.ui.teardown();
});

test('UT-B5-UI-023 Design Dashboard restyle is a separate trusted off-by-default preference', async () => {
  const h = await harness();
  const timerBefore = structuredClone(h.core.timer);
  h.click({ action: 'view', view: 'settings' });
  assert.match(h.root.innerHTML, /Dashboard restyle/);
  h.click({ action: 'settings-route', view: 'design-dashboard' });
  assert.match(h.root.innerHTML, /Changes the dashboard’s look and adds a time summary/);
  h.click({ action: 'preference-design-dashboard', value: 'ON' }, false);
  assert.equal(h.preferenceCommands.length, 0);
  h.click({ action: 'preference-design-dashboard', value: 'ON' }); await h.drain();
  assert.deepEqual(h.preferenceCommands[0], { patch: { dashboardProfile: 'ON' }, expectedPreferenceRevision: 1 });
  assert.equal(h.core.preferences.dashboardEnabled, undefined);
  assert.equal(h.core.preferences.dashboardProfile, 'ON');
  assert.deepEqual({ ...h.core.timer, sourcePreferenceRevision: timerBefore.sourcePreferenceRevision }, timerBefore);
  h.ui.teardown();
});

test('UT-B5-UI-028 an oversized import is rejected before reading the file', async () => {
  const h = await harness();
  let reads = 0;
  const input = { value: 'large.csv', files: [{ size: MAX_INPUT_BYTES + 1, async text() { reads += 1; return ''; } }],
    click() {}, closest(selector) { return selector === '[data-sc-data-file]' ? this : null; } };
  h.root.querySelector = selector => selector === '[data-sc-data-file]' ? input : null;
  h.click({ action: 'view', view: 'settings' });
  h.click({ action: 'settings-route', view: 'data-tools' });
  h.click({ action: 'pick-file', fileMode: 'HISTORY_CSV' });
  h.root.querySelector = selector => selector === '[data-sc-data-file]' ? input : null;
  h.change(input);
  await h.drain();
  assert.equal(reads, 0);
  assert.match(h.root.innerHTML, new RegExp(`larger than the ${MAX_INPUT_BYTES / (1024 * 1024)} MiB import limit`));
  h.ui.teardown();
});

test('UT-B5-UI-024 Features keeps the dashboard and job-page options distinct', async () => {
  const h = await harness();
  h.click({ action: 'view', view: 'settings' });
  h.click({ action: 'settings-toggle-group', group: 'features' });
  for (const label of ['Analytics dashboard', 'Dashboard restyle', 'Quick file paths', 'Quick clock controls',
    'Design page layout', 'Sidebar menu toggle']) assert.match(h.root.innerHTML, new RegExp(label));
  for (const route of ['dashboard', 'design-dashboard', 'quick-file-paths', 'quick-clock'])
    assert.match(h.root.innerHTML, new RegExp(`data-action="settings-route" data-view="${route}"`));
  assert.match(h.root.innerHTML, /class="sc-unavailable" aria-disabled="true"><strong>Design page layout<\/strong>/);
  h.ui.teardown();
});

test('UT-B5-UI-025 Quick file paths changes only its off-by-default preference through a trusted command', async () => {
  const h = await harness();
  const timerBefore = structuredClone(h.core.timer);
  h.click({ action: 'view', view: 'settings' });
  h.click({ action: 'settings-route', view: 'quick-file-paths' });
  assert.match(h.root.innerHTML, /Design Description and project Important Details/);
  assert.match(h.root.innerHTML, /data-action="preference-quick-files" data-value="true"/);
  h.click({ action: 'preference-quick-files', value: 'true' }, false);
  assert.equal(h.preferenceCommands.length, 0);
  h.click({ action: 'preference-quick-files', value: 'true' }); await h.drain();
  assert.deepEqual(h.preferenceCommands[0], { patch: { quickFilePathsEnabled: true }, expectedPreferenceRevision: 1 });
  assert.equal(h.core.preferences.quickFilePathsEnabled, true);
  h.click({ action: 'preference-quick-files', value: 'false' }); await h.drain();
  assert.deepEqual(h.preferenceCommands[1], { patch: { quickFilePathsEnabled: false }, expectedPreferenceRevision: 2 });
  assert.deepEqual({ ...h.core.timer, sourcePreferenceRevision: timerBefore.sourcePreferenceRevision }, timerBefore);
  h.ui.teardown();
});

test('UT-B5-UI-026 Quick clock shortcut finds native controls without clicking or submitting them', async () => {
  const h = await harness();
  const timerBefore = structuredClone(h.core.timer);
  h.click({ action: 'view', view: 'settings' });
  h.click({ action: 'settings-route', view: 'quick-clock' });
  assert.match(h.root.innerHTML, /you choose Clock in or Clock out there/);
  h.click({ action: 'preference-quick-clock', value: 'true' }, false);
  assert.equal(h.preferenceCommands.length, 0);
  h.click({ action: 'preference-quick-clock', value: 'true' }); await h.drain();
  assert.deepEqual(h.preferenceCommands[0], { patch: { quickClockControlsEnabled: true }, expectedPreferenceRevision: 1 });
  assert.match(h.root.innerHTML, /aria-label="Find SquareCoil clock controls"/);

  h.click({ action: 'open-native-clock' }, false);
  assert.equal(h.nativeClock.clockIn.scrolls.length, 0);
  h.click({ action: 'open-native-clock' });
  assert.equal(h.nativeClock.clockIn.scrolls.length, 1);
  assert.equal(h.nativeClock.clockIn.focuses, 1);
  assert.equal(h.nativeClock.clockIn.clicks, 0);
  assert.equal(h.nativeClock.clockOut.clicks, 0);

  h.nativeClock.clockIn.hidden = true;
  h.nativeClock.clockOut.hidden = false;
  h.click({ action: 'open-native-clock' });
  assert.equal(h.nativeClock.clockOut.scrolls.length, 1);
  assert.equal(h.nativeClock.clockOut.focuses, 1);
  assert.equal(h.nativeClock.clockOut.clicks, 0);
  h.nativeClock.clockOut.hidden = true;
  h.click({ action: 'open-native-clock' });
  assert.equal(h.nativeClock.container.scrolls.length, 1);
  assert.equal(h.nativeClock.container.clicks, 0);
  h.click({ action: 'preference-quick-clock', value: 'false' }); await h.drain();
  assert.deepEqual(h.preferenceCommands[1], { patch: { quickClockControlsEnabled: false }, expectedPreferenceRevision: 2 });
  assert.doesNotMatch(h.root.innerHTML, /aria-label="Find SquareCoil clock controls"/);
  assert.deepEqual({ ...h.core.timer, sourcePreferenceRevision: timerBefore.sourcePreferenceRevision }, timerBefore);
  h.ui.teardown();
});
