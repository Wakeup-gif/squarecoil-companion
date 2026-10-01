'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { copyPackageFiles } = require('../../scripts/package-inventory');
const { computeCandidateFingerprint } = require('../../scripts/candidate-identity');
const { verifySelectedContext, verifyDashboardJourney, verifyDesignProfileJourney } = require('./prototype-journey');

const ORIGIN = 'https://ussignandmill.squarecoil.net';
const LAB_ROOT = '/__companion_lab__';
const WEBSITE_LOGO_FILENAME = 'US-Sign&-Mill-Logo - sized for SC site.png';
const BROWSER_PATHS = Object.freeze({
  chrome: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  edge: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
});
const ROUTED_PAGES = new Set([
  `${LAB_ROOT}/index.html`, '/dashboard.php', '/project.php', '/project_designs.php', '/leads.php', '/calendar.php'
]);
const BING_MARKETS = new Set(['en-US','en-GB','en-CA','en-IN','de-DE','fr-FR','fr-CA','es-ES','it-IT','ja-JP','pt-BR','zh-CN']);
const JOBS = Object.freeze([
  { projectId: '910001', contextId: 'job:910001', title: 'Northstar Museum Wayfinding', label: '910001 - Design', department: 'Design', summary: 'Interior signs and donor wall', color: '#2d8bd0' },
  { projectId: '910002', contextId: 'job:910002', title: 'Riverline Market Hall', label: '910002 - Fabrication', department: 'Fabrication', summary: 'Channel letters and blade signs', color: '#a566d1' },
  { projectId: '910003', contextId: 'job:910003', title: 'Cedar Point Learning Center', label: '910003 - Installation', department: 'Installation', summary: 'Campus directional package', color: '#e48242' },
  { projectId: '0', contextId: 'general:production-general', title: 'Production (General)', label: 'Production (General)', department: 'General', summary: 'Audited non-job context', color: '#27a176' }
]);
const EVIDENCE_FILES = Object.freeze({
  tabs: '01-tabs-short-viewport.png',
  archiveVeil: '02-archive-veil-preview.png',
  darkGlass: '03-dark-glass-fallback.png',
  lightGlass: '04-light-glass-fallback.png',
  refinedLight: '05-refined-light.png',
  settings: '06-settings-nested.png',
  selectedContext: '07-selected-vs-operational.png',
  dashboard: '08-dashboard-canonical-history.png',
  dashboardNarrow: '09-dashboard-narrow.png',
  dashboardSidebar: '10-dashboard-sidebar-width.png',
  dashboardSidebarRow: '11-dashboard-sidebar-row.png',
  dashboardNarrowRow: '12-dashboard-narrow-row.png',
  designProfile: '13-design-dashboard-profile.png',
  storeWorkspace: '14-store-workspace-1280x800.png',
  storeSettings: '15-store-settings-1280x800.png',
  manifest: 'visual-evidence.json'
});

async function captureStoreScreenshot(page, filename) {
  const previousViewport = page.viewportSize();
  await page.setViewportSize({ width: 1280, height: 800 });
  try {
    await page.screenshot({ path: filename, fullPage: false, animations: 'disabled', caret: 'hide' });
  } finally {
    await page.setViewportSize(previousViewport);
  }
}

function parseArguments(argv) {
  const options = { browser: 'chrome', smoke: false, evidenceDir: null, useExistingBuild: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--browser') options.browser = String(argv[++index] || '').toLowerCase();
    else if (argv[index] === '--smoke') options.smoke = true;
    else if (argv[index] === '--evidence-dir') options.evidenceDir = String(argv[++index] || '').trim();
    else if (argv[index] === '--use-existing-build') options.useExistingBuild = true;
    else if (argv[index] === '--help' || argv[index] === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!['chrome','edge'].includes(options.browser)) throw new Error('--browser must be chrome or edge');
  if (options.evidenceDir === '') throw new Error('--evidence-dir requires a directory');
  if (options.evidenceDir && !options.smoke) throw new Error('--evidence-dir is available only with --smoke');
  return options;
}

function resolvePlaywright() {
  const candidates = [
    process.env.SC_PLAYWRIGHT_MODULE,
    'playwright',
    path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright')
  ].filter(Boolean);
  const errors = [];
  for (const candidate of candidates) {
    try { return require(candidate); } catch (error) { errors.push(`${candidate}: ${error.message}`); }
  }
  throw new Error(`Playwright is unavailable. ${errors.join(' | ')}`);
}

function isWithinTemp(target) {
  const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(target));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isSameOrWithin(parent, target) {
  const relative = path.relative(path.resolve(parent), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function prepareEvidenceDirectory(requestedDirectory, repositoryRoot) {
  if (!requestedDirectory) return null;
  const directory = path.resolve(requestedDirectory);
  if (isSameOrWithin(os.tmpdir(), directory)) {
    throw new Error(`Visual evidence must be written outside the temporary directory: ${directory}`);
  }
  if (repositoryRoot && isSameOrWithin(repositoryRoot, directory)) {
    throw new Error(`Visual evidence must be written outside this Git repository: ${directory}`);
  }
  if (fs.existsSync(directory) && !fs.statSync(directory).isDirectory()) {
    throw new Error(`Visual evidence target is not a directory: ${directory}`);
  }
  fs.mkdirSync(directory, { recursive: true });
  const canonicalDirectory = fs.realpathSync.native(directory);
  if (isSameOrWithin(fs.realpathSync.native(os.tmpdir()), canonicalDirectory)) {
    throw new Error(`Visual evidence resolves inside the temporary directory: ${canonicalDirectory}`);
  }
  if (repositoryRoot && isSameOrWithin(fs.realpathSync.native(repositoryRoot), canonicalDirectory)) {
    throw new Error(`Visual evidence resolves inside this Git repository: ${canonicalDirectory}`);
  }
  const files = Object.fromEntries(Object.entries(EVIDENCE_FILES).map(([key, filename]) => [key, path.join(canonicalDirectory, filename)]));
  const occupied = Object.values(files).filter(filename => fs.existsSync(filename));
  if (occupied.length) {
    throw new Error(`Visual evidence safety refusal: these deterministic files already exist: ${occupied.join(', ')}`);
  }
  return { directory: canonicalDirectory, files };
}

function safeRemoveTemp(target, expectedPrefix) {
  if (!target) return true;
  if (!isWithinTemp(target) || !path.basename(target).startsWith(expectedPrefix)) {
    process.stderr.write(`Safety refusal: retained unexpected path ${target}\n`);
    return false;
  }
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    return true;
  } catch (error) {
    process.stderr.write(`Cleanup warning: retained ${target}: ${error.message}\n`);
    return false;
  }
}

function loadLabAsset(filename) {
  return fs.readFileSync(path.join(__dirname, filename), 'utf8');
}

function labPageHtml(url) {
  const source = loadLabAsset('index.html');
  if (url.pathname !== '/dashboard.php') return source;
  // These native widgets are the audited dashboard mount anchors. The same
  // source is served for near-miss queries so route gating cannot pass merely
  // because a negative fixture omitted its native structure.
  const widgets = `<section id="lab-native-dashboard" class="lab-section panel" aria-label="Native dashboard fixture">
    <div class="lab-dashboard-shortcuts">
      <section id="widget-tasks"><h2>17</h2><h5>Tasks</h5></section>
      <section id="widget-designs"><h2>8</h2><h5>Designs</h5></section>
      <section id="widget-estimates"><h2>3</h2><h5>Estimates</h5></section>
    </div>
    <div id="page-content"><p>Native dashboard content remains available.</p><a href="/project.php?id=910001">Open fictional project 910001</a><button disabled>Native disabled action</button></div>
  </section>`;
  return source.replace('<main id="content">', `<main id="content">${widgets}`);
}

function sha256File(filename) {
  return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

function visibleContextHtml(current) {
  if (!current) return '<span id="clockin-remaining-time"></span>';
  return `<span id="clockin-remaining-time"><a href="/project.php?id=${encodeURIComponent(current.projectId)}">${current.label}</a></span>`;
}

function publicState(state) {
  return { companyClockedIn: state.companyClockedIn, current: state.current, jobs: JOBS, events: state.events };
}

function exactBingRequest(url) {
  if (url.origin !== 'https://www.bing.com') return false;
  if (url.pathname === '/HPImageArchive.aspx') {
    return url.searchParams.get('format') === 'js' && url.searchParams.get('idx') === '0' &&
      url.searchParams.get('n') === '1' && BING_MARKETS.has(url.searchParams.get('mkt')) &&
      url.searchParams.get('uhd') === '1' && url.searchParams.get('uhdwidth') === '3840' &&
      url.searchParams.get('uhdheight') === '2160' && [...url.searchParams.keys()].length === 7;
  }
  if (url.pathname !== '/th' || !/^OHR\.[A-Za-z0-9._-]+$/.test(url.searchParams.get('id') || '')) return false;
  const allowed = new Set(['id','rf','pid','w','h','rs','c']);
  const keys = [...url.searchParams.keys()];
  if (keys.some(key => !allowed.has(key)) || new Set(keys).size !== keys.length) return false;
  const rf = url.searchParams.get('rf');
  if (rf !== null && !/^[A-Za-z0-9_.-]{1,160}\.jpg$/i.test(rf)) return false;
  const pid = url.searchParams.get('pid');
  if (pid !== null && pid !== 'hp') return false;
  const fixed = ['w','h','rs','c'];
  const fixedCount = fixed.filter(key => url.searchParams.has(key)).length;
  return fixedCount === 0 || (fixedCount === 4 && url.searchParams.get('w') === '3840' &&
    url.searchParams.get('h') === '2160' && url.searchParams.get('rs') === '1' && url.searchParams.get('c') === '4');
}

function assertVisualCondition(condition, message, proof) {
  if (!condition) throw new Error(`${message}: ${JSON.stringify(proof)}`);
}

async function sendSealedLabClockAction(page, action, payload = {}) {
  return page.evaluate(async ({ requestedAction, requestedPayload }) => {
    const parameters = new URLSearchParams({ action: String(requestedAction), ...requestedPayload });
    const response = await fetch('/ajax_time_clock.php', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: parameters.toString()
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Sealed simulator rejected action ${requestedAction}: ${JSON.stringify(body)}`);
    return body;
  }, { requestedAction: action, requestedPayload: payload });
}

async function inspectThemeState(page, theme, bingPermissionGranted) {
  return page.evaluate(({ expectedTheme, permissionGranted }) => {
    const root = document.querySelector('#ussign-job-timer');
    const host = document.querySelector('#squarecoil-companion-cinematic-host');
    const cinematicStyle = document.querySelector('#squarecoil-companion-cinematic-style');
    const siteStyle = document.querySelector('#squarecoil-companion-site-theme');
    const parseColor = value => {
      const match = String(value || '').match(/rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)/i);
      if (!match) return null;
      const channels = match.slice(1, 4).map(Number);
      return { channels, alpha: match[4] === undefined ? 1 : Number(match[4]), brightness: Math.round((channels[0] + channels[1] + channels[2]) / 3) };
    };
    const surfaces = [
      ['outerHero', '#content .lab-hero.panel', 'outer'],
      ['metricCard', '#content .lab-metrics > .panel', 'outer'],
      ['jobsSection', '#content #jobs.panel', 'outer'],
      ['jobCard', '#content #jobs .lab-job-card.panel', 'nested'],
      ['projectSection', '#content .lab-project-preview.panel', 'outer'],
      ['projectPanel', '#content .lab-project-preview #projectbox.panel', 'nested'],
      ['projectHeading', '#content #projectbox .panel-heading', 'nested'],
      ['descriptionBody', '#content #descriptionbox .panel-body', 'nested'],
      ['sidebarSafety', '#sidebar_left .lab-sidebar-note.panel', 'outer'],
      ['projectMetaChip', '#content #customer-info > .panel', 'nested']
    ].map(([name, selector, level]) => {
      const element = document.querySelector(selector);
      const style = element ? getComputedStyle(element) : null;
      const background = parseColor(style?.backgroundColor);
      const text = parseColor(style?.color);
      const opposite = Boolean(background && background.alpha > 0.04 &&
        (expectedTheme === 'SLEEK_DARK' ? background.brightness > 150 : background.brightness < 110));
      return {
        name, selector, level, present: Boolean(element),
        backgroundColor: style?.backgroundColor || null,
        backgroundImage: style?.backgroundImage || null,
        color: style?.color || null,
        background, text, oppositeThemeSurface: opposite
      };
    });
    const textSamples = [
      ['heroValue', '#content .lab-hero.panel strong'],
      ['metricValue', '#content .lab-metrics > .panel strong'],
      ['jobTitle', '#content #jobs .lab-job-card.panel h3'],
      ['projectTitle', '#content .lab-project-preview.panel h2'],
      ['heroDescription', '#content .lab-hero.panel p'],
      ['jobDescription', '#content #jobs .lab-job-card.panel p'],
      ['metricLabel', '#content .lab-metrics > .panel > span'],
      ['sidebarNavigation', '#sidebar_left nav a'],
      ['headerMetadata', '#navbar .lab-user small'],
      ['searchPlaceholder', '#job-search', '::placeholder']
    ].map(([name, selector, pseudo]) => {
      const element = document.querySelector(selector);
      const color = element ? getComputedStyle(element, pseudo || null).color : null;
      return { name, selector, pseudo: pseudo || null, present: Boolean(element), color, parsed: parseColor(color) };
    });
    const coherentSurfaceNames = new Set(['outerHero', 'metricCard', 'jobsSection', 'jobCard', 'projectSection', 'projectPanel']);
    const surfaceRecipeMismatchCount = surfaces.filter(surface => {
      if (!surface.present || !coherentSurfaceNames.has(surface.name) || !surface.background) return false;
      if (expectedTheme === 'SLEEK_DARK') {
        return surface.background.channels.some((channel, index) => Math.abs(channel - [9,18,27][index]) > 1) ||
          Math.abs(surface.background.alpha - 0.57) > 0.02;
      }
      return surface.background.channels.some(channel => Math.abs(channel - 255) > 1) ||
        Math.abs(surface.background.alpha - 0.54) > 0.02;
    }).length;
    const textContrastMismatchCount = textSamples.filter(sample => sample.present && sample.parsed &&
      (expectedTheme === 'SLEEK_DARK' ? sample.parsed.brightness < 140 : sample.parsed.brightness > 170)).length;
    const notes = Array.from(root?.querySelectorAll('.sc-note') || []).map(node => node.textContent.replace(/\s+/g, ' ').trim());
    const backgroundStatus = notes.find(text => text.startsWith('Background status:')) || null;
    const trustedSelections = Array.isArray(window.__squareCoilLabTrustedThemeSelections)
      ? window.__squareCoilLabTrustedThemeSelections.filter(item => item.value === expectedTheme) : [];
    return {
      theme: expectedTheme,
      bingPermissionGranted: permissionGranted,
      trustedSelection: trustedSelections.at(-1) || null,
      rootTheme: document.documentElement.getAttribute('data-squarecoil-companion-site-theme'),
      rootRoute: document.documentElement.getAttribute('data-squarecoil-companion-site-route'),
      cinematicState: document.documentElement.getAttribute('data-squarecoil-companion-cinematic'),
      activeChoice: root?.querySelector(`.sc-theme-choice[data-value="${expectedTheme}"]`)?.dataset.active || null,
      companionTheme: root?.dataset.protoTheme || null,
      companionSurface: root?.dataset.protoSurface || null,
      busy: root?.dataset.busy || null,
      ariaBusy: root?.getAttribute('aria-busy') || null,
      workspaceState: root?.dataset.workspaceState || null,
      pageUrl: location.href,
      nativeActionCount: document.querySelector('#metric-actions')?.textContent || null,
      controller: document.documentElement.dataset.squarecoilCompanionController || null,
      controllerReason: document.documentElement.dataset.squarecoilCompanionControllerReason || null,
      documentToken: document.documentElement.dataset.squarecoilCompanionDocumentToken || null,
      backgroundStatus,
      hostCount: document.querySelectorAll('#squarecoil-companion-cinematic-host').length,
      hostTheme: host?.getAttribute('data-theme') || null,
      hostBackgroundImage: host ? getComputedStyle(host).backgroundImage : null,
      cinematicStyleCount: document.querySelectorAll('#squarecoil-companion-cinematic-style').length,
      siteStyleAuthoritative: siteStyle?.getAttribute('data-squarecoil-companion-theme-port') || null,
      activeImageLayers: host?.querySelectorAll('.sc-cinematic-layer[data-active="true"]').length || 0,
      inlineImageLayers: Array.from(host?.querySelectorAll('.sc-cinematic-layer') || []).filter(layer =>
        layer.style.getPropertyValue('--us-squarecoil-cine-image') || layer.style.getPropertyValue('background-image')).length,
      surfaces,
      textSamples,
      outerSurfaceCount: surfaces.filter(surface => surface.level === 'outer' && surface.present).length,
      nestedSurfaceCount: surfaces.filter(surface => surface.level === 'nested' && surface.present).length,
      oppositeSurfaceCount: surfaces.filter(surface => surface.oppositeThemeSurface).length,
      surfaceRecipeMismatchCount,
      textContrastMismatchCount,
      cinematicStyleOwned: cinematicStyle?.getAttribute('data-squarecoil-companion-owned') || null
    };
  }, { expectedTheme: theme, permissionGranted: bingPermissionGranted });
}

async function selectAndCaptureTheme(page, theme, evidenceFile, evidence, bingPermissionGranted, timeout) {
  await page.locator(`#ussign-job-timer .sc-theme-choice[data-value="${theme}"]`).click();
  try {
    await page.waitForFunction(expectedTheme => {
      const root = document.querySelector('#ussign-job-timer');
      const host = document.querySelector('#squarecoil-companion-cinematic-host');
      return document.documentElement.getAttribute('data-squarecoil-companion-site-theme') === expectedTheme &&
        document.documentElement.getAttribute('data-squarecoil-companion-cinematic') === 'DEGRADED_FALLBACK' &&
        host?.getAttribute('data-theme') === expectedTheme &&
        root?.querySelector(`.sc-theme-choice[data-value="${expectedTheme}"]`)?.dataset.active === 'true' &&
        root?.dataset.busy === 'false';
    }, theme, { timeout });
  } catch (_) {
    const unsettled = await inspectThemeState(page, theme, bingPermissionGranted);
    unsettled.isolatedDiagnostics = await inspectIsolatedDiagnostics(page);
    throw new Error(`Theme did not settle after trusted Settings selection: ${JSON.stringify(unsettled)}`);
  }
  try {
    await page.waitForFunction(() => {
      const root = document.querySelector('#ussign-job-timer');
      return Array.from(root?.querySelectorAll('.sc-note') || []).some(node =>
        node.textContent.replace(/\s+/g, ' ').trim() ===
          'Background status: Network unavailable; built-in gradient fallback active.');
    }, null, { timeout: Math.min(timeout, 8_000) });
  } catch (_) {
    const unsettled = await inspectThemeState(page, theme, bingPermissionGranted);
    throw new Error(`Offline fallback status did not settle truthfully: ${JSON.stringify(unsettled)}`);
  }
  const proof = await inspectThemeState(page, theme, bingPermissionGranted);
  proof.selectionSource = 'trusted-workspace-skin-click; Bing host granted at install';
  const expectedCompanionTheme = theme === 'SLEEK_DARK' ? 'dark' : 'light';
  assertVisualCondition(proof.bingPermissionGranted === true, 'Fresh lab profile lacks its required Bing install host', proof);
  assertVisualCondition(proof.trustedSelection?.isTrusted === true, 'Website theme was not selected through a trusted Settings click', proof);
  assertVisualCondition(proof.rootTheme === theme && proof.cinematicState === 'DEGRADED_FALLBACK' && proof.activeChoice === 'true', 'Website theme markers did not settle', proof);
  assertVisualCondition(proof.companionTheme === expectedCompanionTheme && proof.companionSurface === 'glass', 'Companion appearance is not matched to the Glass website theme', proof);
  assertVisualCondition(proof.hostCount === 1 && proof.cinematicStyleCount === 1 && proof.hostTheme === theme &&
    proof.siteStyleAuthoritative === 'authoritative' && proof.hostBackgroundImage !== 'none', 'Theme/background host is not active and singular', proof);
  assertVisualCondition(proof.activeImageLayers === 0 && proof.inlineImageLayers === 0 &&
    proof.backgroundStatus === 'Background status: Network unavailable; built-in gradient fallback active.',
  'Offline background fallback or status wording is not truthful', proof);
  assertVisualCondition(proof.outerSurfaceCount >= 5 && proof.nestedSurfaceCount >= 5 && proof.oppositeSurfaceCount === 0,
    'Representative outer or nested lab surfaces contain an opposite-theme card', proof);
  assertVisualCondition(proof.surfaceRecipeMismatchCount === 0 && proof.textContrastMismatchCount === 0,
    'Representative Glass panels or their strong text do not share the terminal theme recipe', proof);
  if (evidence) {
    await page.screenshot({ path: evidenceFile, fullPage: false, animations: 'disabled', caret: 'hide' });
  }
  return proof;
}

async function inspectIsolatedDiagnostics(page) {
  const session = await page.context().newCDPSession(page);
  const contexts = [];
  session.on('Runtime.executionContextCreated', ({ context }) => contexts.push(context));
  try {
    await session.send('Runtime.enable');
    for (const context of contexts.filter(item => item.auxData?.isDefault === false)) {
      const result = await session.send('Runtime.evaluate', {
        contextId: context.id, returnByValue: true, awaitPromise: true,
        expression: `(async () => {
          const health = globalThis.__squareCoilCompanionAuthorityHealth;
          if (!health) return null;
          const core = await health.coreSnapshot();
          return { authority: health.snapshot(), initialized: core?.initialized,
            blocked: core?.blocked, readModelError: core?.readModelError,
            preferences: core?.preferences, presentation: core?.presentation,
            timerStatus: core?.timer?.status };
        })()`
      }).catch(error => ({ exception: String(error.message) }));
      if (result.result?.value) return result.result.value;
    }
    return { unavailable: true };
  } finally { await session.detach().catch(() => {}); }
}

async function closeSettings(page, timeout) {
  const startedAt = Date.now();
  const closeButton = page.locator('#ussign-job-timer [data-action="settings-close"]');
  while ((Date.now() - startedAt) < timeout) {
    if (!await closeButton.count()) return;
    if (await closeButton.count()) await closeButton.click();
    try {
      await closeButton.waitFor({ state: 'detached', timeout: Math.min(300, Math.max(1, timeout - (Date.now() - startedAt))) });
      return;
    } catch (_) {
      await page.waitForTimeout(50);
    }
  }
  const state = await page.evaluate(() => ({
    heading: document.querySelector('#ussign-job-timer [data-sc-view-heading]')?.textContent?.trim() || null,
    error: document.querySelector('#ussign-job-timer .sc-error')?.textContent?.trim() || null
  }));
  throw new Error(`Settings did not close after its bounded preference transaction: ${JSON.stringify(state)}`);
}

async function revealLabWorkspaceTab(page, contextId, timeout) {
  const tab = page.locator(`#ussign-job-timer .sc-tab[data-context="${contextId}"]`);
  const startedAt = Date.now();
  await tab.waitFor({ state: 'attached', timeout });
  while ((Date.now() - startedAt) < timeout) {
    await tab.evaluate(node => node.scrollIntoView({ block: 'nearest', inline: 'center' })).catch(() => {});
    const tabBox = await tab.boundingBox().catch(() => null);
    const stripBox = await page.locator('#ussign-job-timer .sc-tabs').boundingBox().catch(() => null);
    if (tabBox && stripBox && tabBox.width > 0 && tabBox.height > 0 &&
      tabBox.x >= stripBox.x - 1 && tabBox.x + tabBox.width <= stripBox.x + stripBox.width + 1) {
      return { tab, tabBox, stripBox };
    }
    await page.waitForTimeout(50);
  }
  const state = await page.evaluate(id => {
    const tabNode = document.querySelector(`#ussign-job-timer .sc-tab[data-context="${id}"]`);
    const stripNode = document.querySelector('#ussign-job-timer .sc-tabs');
    return { attached: Boolean(tabNode), selected: tabNode?.dataset.selected || null,
      scrollLeft: stripNode?.scrollLeft || 0, scrollWidth: stripNode?.scrollWidth || 0, clientWidth: stripNode?.clientWidth || 0 };
  }, contextId);
  throw new Error(`Workspace tab ${contextId} could not be revealed: ${JSON.stringify(state)}`);
}

async function visibleBoundingBox(page, locator, timeout) {
  const startedAt = Date.now();
  await locator.waitFor({ state: 'attached', timeout });
  while ((Date.now() - startedAt) < timeout) {
    const box = await locator.boundingBox().catch(() => null);
    if (box && box.width > 0 && box.height > 0) return box;
    await page.waitForTimeout(50);
  }
  return null;
}

async function setCompanionAppearance(page, timerTheme, panelFinish, timeout) {
  await openSettingsDestination(page, 'appearance', 'timer-appearance', timeout);
  await page.waitForSelector('#ussign-job-timer [data-action="preference"][data-value="DARK"]', { timeout });
  const startingState = await page.evaluate(() => ({
    theme: document.querySelector('#ussign-job-timer')?.dataset.protoTheme || null,
    finish: document.querySelector('#ussign-job-timer')?.dataset.protoSurface || null,
    selectionCount: Array.isArray(window.__squareCoilLabTrustedAppearanceSelections)
      ? window.__squareCoilLabTrustedAppearanceSelections.length : 0
  }));
  const themeClickRequired = startingState.theme !== timerTheme.toLowerCase();
  if (themeClickRequired) {
    await page.locator(`#ussign-job-timer [data-action="preference"][data-value="${timerTheme}"]`).click();
    await page.waitForFunction(expected => document.querySelector('#ussign-job-timer')?.dataset.protoTheme === expected,
      timerTheme.toLowerCase(), { timeout });
    await page.waitForFunction(() => document.querySelector('#ussign-job-timer')?.dataset.busy === 'false', null, { timeout });
  }
  const finishBeforeClick = await page.evaluate(() => document.querySelector('#ussign-job-timer')?.dataset.protoSurface || null);
  const finishClickRequired = finishBeforeClick !== panelFinish.toLowerCase();
  if (finishClickRequired) {
    await page.locator(`#ussign-job-timer [data-action="preference-finish"][data-value="${panelFinish}"]`).click();
    await page.waitForFunction(expected => document.querySelector('#ussign-job-timer')?.dataset.protoSurface === expected,
      panelFinish.toLowerCase(), { timeout });
    await page.waitForFunction(() => document.querySelector('#ussign-job-timer')?.dataset.busy === 'false', null, { timeout });
  }
  const proof = await page.evaluate(({ expectedTheme, expectedFinish, selectionCount, themeClickRequired, finishClickRequired }) => {
    const selections = Array.isArray(window.__squareCoilLabTrustedAppearanceSelections)
      ? window.__squareCoilLabTrustedAppearanceSelections : [];
    const newSelections = selections.slice(selectionCount);
    return {
      requestedTheme: expectedTheme,
      requestedFinish: expectedFinish,
      themeClickRequired,
      finishClickRequired,
      themeSelection: newSelections.filter(item => item.action === 'preference' && item.value === expectedTheme).at(-1) || null,
      finishSelection: newSelections.filter(item => item.action === 'preference-finish' && item.value === expectedFinish).at(-1) || null,
      effectiveTheme: document.querySelector('#ussign-job-timer')?.dataset.protoTheme || null,
      effectiveSurface: document.querySelector('#ussign-job-timer')?.dataset.protoSurface || null
    };
  }, { expectedTheme: timerTheme, expectedFinish: panelFinish, selectionCount: startingState.selectionCount, themeClickRequired, finishClickRequired });
  assertVisualCondition((!proof.themeClickRequired || proof.themeSelection?.isTrusted === true) &&
    (!proof.finishClickRequired || proof.finishSelection?.isTrusted === true) &&
    proof.effectiveTheme === timerTheme.toLowerCase() && proof.effectiveSurface === panelFinish.toLowerCase(),
  'Companion appearance was not set through trusted Settings clicks', proof);
  await closeSettings(page, timeout);
  return proof;
}

async function openSettings(page, timeout) {
  await page.locator('#ussign-job-timer .sc-proto-topbar [data-action="view"][data-view="settings"]').click();
  await page.waitForSelector('#ussign-job-timer [data-action="settings-toggle-group"]', { state: 'visible', timeout });
}

async function openSettingsDestination(page, group, view, timeout) {
  const toggle = page.locator(`#ussign-job-timer [data-action="settings-toggle-group"][data-group="${group}"]`);
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  const destination = page.locator(`#ussign-job-timer [data-action="settings-route"][data-view="${view}"]`);
  await destination.waitFor({ state: 'visible', timeout });
  await destination.click();
}

async function verifySidebarRecovery(page, theme, timeout) {
  await page.evaluate(() => {
    window.__squareCoilLabTrustedSidebarReopen = false;
    if (window.__squareCoilLabSidebarListenerInstalled) return;
    window.__squareCoilLabSidebarListenerInstalled = true;
    document.addEventListener('click', event => {
      if (document.body.classList.contains('sb-l-m') && event.target?.closest?.('#toggle_sidemenu_l')) {
        window.__squareCoilLabTrustedSidebarReopen = event.isTrusted === true;
      }
    }, true);
  });
  try {
    await page.waitForFunction(() => {
      const logo = document.querySelector('header.navbar .navbar-brand img[data-squarecoil-companion-logo="brand"]');
      return logo && getComputedStyle(logo).display !== 'none' && logo.getBoundingClientRect().width > 20;
    }, null, { timeout: Math.min(timeout, 5_000) });
  } catch (_) {
    const logoFailure = await page.evaluate(expectedTheme => {
      const image = document.querySelector('header.navbar .navbar-brand img');
      const brand = document.querySelector('header.navbar .navbar-brand');
      const root = document.getElementById('ussign-job-timer');
      return {
        theme: expectedTheme,
        bodyClass: document.body.className,
        rootTheme: document.documentElement.getAttribute('data-squarecoil-companion-site-theme'),
        image: image ? { src: image.src, marker: image.getAttribute('data-squarecoil-companion-logo'), complete: image.complete,
          naturalWidth: image.naturalWidth, display: getComputedStyle(image).display, width: image.getBoundingClientRect().width } : null,
        brand: brand ? { display: getComputedStyle(brand).display, visibility: getComputedStyle(brand).visibility,
          width: brand.getBoundingClientRect().width } : null,
        presentation: root?.dataset.squarecoilCompanionWebsiteTheme || null
      };
    }, theme);
    throw new Error(`Website logo replacement was not visibly painted before sidebar acceptance: ${JSON.stringify(logoFailure)}`);
  }
  // The lab-only safety banner intentionally covers the native expanded-header
  // lane. Enter the collapsed fixture state directly, then require the actual
  // restore action below to be a browser-trusted pointer click.
  await page.evaluate(() => document.getElementById('toggle_sidemenu_l')?.click());
  await page.waitForFunction(() => document.body.classList.contains('sb-l-m'), null, { timeout });
  const collapsed = await page.evaluate(expectedTheme => {
    const toggle = document.getElementById('toggle_sidemenu_l');
    const logo = document.querySelector('header.navbar .navbar-brand');
    const rect = toggle?.getBoundingClientRect();
    const hit = rect ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) : null;
    const style = toggle ? getComputedStyle(toggle) : null;
    return {
      theme: expectedTheme,
      logoDisplay: logo ? getComputedStyle(logo).display : null,
      toggleVisible: Boolean(toggle && rect && rect.width >= 38 && rect.height >= 34 && style?.visibility === 'visible' && style?.pointerEvents !== 'none'),
      toggleTop: rect ? Math.round(rect.top) : null,
      toggleLeft: rect ? Math.round(rect.left) : null,
      toggleOwnsHitTarget: Boolean(hit && (hit === toggle || toggle?.contains(hit))),
      expanded: toggle?.getAttribute('aria-expanded') || null
    };
  }, theme);
  assertVisualCondition(collapsed.logoDisplay === 'none' && collapsed.toggleVisible && collapsed.toggleOwnsHitTarget &&
    collapsed.expanded === 'false', 'Collapsed site navigation did not leave one unobstructed working restore control', collapsed);
  await page.locator('#toggle_sidemenu_l').click();
  await page.waitForFunction(() => !document.body.classList.contains('sb-l-m') &&
    document.getElementById('toggle_sidemenu_l')?.getAttribute('aria-expanded') === 'true' &&
    window.__squareCoilLabTrustedSidebarReopen === true, null, { timeout });
  collapsed.trustedReopenClick = true;
  return collapsed;
}

async function selectAndCaptureRefinedLight(page, evidenceFile, evidence, timeout) {
  await page.locator('#ussign-job-timer .sc-theme-choice[data-value="REFINED_LIGHT"]').click();
  await page.waitForFunction(() => {
    const root = document.querySelector('#ussign-job-timer');
    const logo = document.querySelector('header.navbar .navbar-brand img[data-squarecoil-companion-logo="brand"]');
    return document.documentElement.getAttribute('data-squarecoil-companion-site-theme') === 'REFINED_LIGHT' &&
      document.documentElement.getAttribute('data-squarecoil-companion-cinematic') === 'DISABLED' &&
      !document.querySelector('#squarecoil-companion-cinematic-host') &&
      root?.querySelector('.sc-theme-choice[data-value="REFINED_LIGHT"]')?.dataset.active === 'true' &&
      root?.dataset.busy === 'false' &&
      Boolean(logo && logo.complete && logo.naturalWidth > 0);
  }, null, { timeout });
  const proof = await page.evaluate(() => {
    const parse = value => {
      const match = String(value || '').match(/rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)/i);
      if (!match) return null;
      const channels = match.slice(1, 4).map(Number);
      return { channels, brightness: channels.reduce((sum, channel) => sum + channel, 0) / 3 };
    };
    const samples = ['body','#content_wrapper','#content','#content .lab-metrics > .panel','#content #jobs.panel','#content #projectbox.panel'].map(selector => {
      const element = document.querySelector(selector);
      const style = element ? getComputedStyle(element) : null;
      return { selector, background: parse(style?.backgroundColor), color: parse(style?.color) };
    });
    const logo = document.querySelector('header.navbar .navbar-brand img[data-squarecoil-companion-logo="brand"]');
    return {
      trustedSelection: window.__squareCoilLabTrustedThemeSelections.filter(item => item.value === 'REFINED_LIGHT').at(-1) || null,
      rootTheme: document.documentElement.getAttribute('data-squarecoil-companion-site-theme'),
      cinematicState: document.documentElement.getAttribute('data-squarecoil-companion-cinematic'),
      siteStyleCount: document.querySelectorAll('#squarecoil-companion-site-theme').length,
      logo: logo ? { src: logo.src, width: logo.naturalWidth, display: getComputedStyle(logo).display } : null,
      companionLogoCount: document.querySelectorAll('#ussign-job-timer .sc-proto-shell img, #ussign-job-timer .sc-brand-mark').length,
      companionTitle: document.querySelector('#ussign-job-timer .sc-proto-brand strong')?.textContent || '',
      samples,
      darkSurfaceCount: samples.filter(sample => sample.background && sample.background.brightness < 160).length,
      paleTextCount: samples.filter(sample => sample.color && sample.color.brightness > 150).length
    };
  });
  assertVisualCondition(proof.trustedSelection?.isTrusted === true && proof.rootTheme === 'REFINED_LIGHT' &&
    proof.cinematicState === 'DISABLED' && proof.siteStyleCount === 1 &&
    proof.logo?.src.includes('US-Sign&-Mill-Logo%20-%20sized%20for%20SC%20site.png') &&
    proof.logo.width > 0 && proof.logo.display !== 'none' && proof.companionLogoCount === 0 &&
    proof.companionTitle === 'SquareCoil Companion' && proof.darkSurfaceCount === 0 && proof.paleTextCount === 0,
  'Refined Light did not settle as one readable light palette with the website-only logo replacement', proof);
  if (evidence) await page.screenshot({ path: evidenceFile, fullPage: false, animations: 'disabled', caret: 'hide' });
  return proof;
}

async function verifyThemeEvidence(page, evidence, bingPermissionGranted, timeout) {
  await page.evaluate(() => {
    window.__squareCoilLabTrustedThemeSelections = [];
    window.__squareCoilLabTrustedAppearanceSelections = [];
    document.addEventListener('click', event => {
      const choice = event.target?.closest?.('#ussign-job-timer .sc-theme-choice[data-action="preference-site"]');
      if (choice) window.__squareCoilLabTrustedThemeSelections.push({ value: choice.dataset.value || null, isTrusted: event.isTrusted === true });
      const appearance = event.target?.closest?.('#ussign-job-timer [data-action="preference"], #ussign-job-timer [data-action="preference-finish"]');
      if (appearance) window.__squareCoilLabTrustedAppearanceSelections.push({
        action: appearance.dataset.action || null, value: appearance.dataset.value || null, isTrusted: event.isTrusted === true
      });
    }, true);
  });
  await openSettings(page, timeout);
  const darkAppearance = await setCompanionAppearance(page, 'DARK', 'GLASS', timeout);
  await openSettings(page, timeout);
  await openSettingsDestination(page, 'appearance', 'website-theme', timeout);
  await page.waitForSelector('#ussign-job-timer .sc-theme-choice[data-value="SLEEK_DARK"]', { timeout });
  await page.evaluate(() => window.scrollTo({ top: 360, behavior: 'instant' }));
  const darkGlass = await selectAndCaptureTheme(page, 'SLEEK_DARK', evidence?.files.darkGlass, evidence, bingPermissionGranted, timeout);
  const darkSidebar = await verifySidebarRecovery(page, 'SLEEK_DARK', timeout);
  await closeSettings(page, timeout);
  await openSettings(page, timeout);
  const lightAppearance = await setCompanionAppearance(page, 'LIGHT', 'GLASS', timeout);
  await openSettings(page, timeout);
  await openSettingsDestination(page, 'appearance', 'website-theme', timeout);
  await page.waitForSelector('#ussign-job-timer .sc-theme-choice[data-value="LIGHT_GLASS"]', { timeout });
  const lightGlass = await selectAndCaptureTheme(page, 'LIGHT_GLASS', evidence?.files.lightGlass, evidence, bingPermissionGranted, timeout);
  const lightSidebar = await verifySidebarRecovery(page, 'LIGHT_GLASS', timeout);

  const refinedLight = await selectAndCaptureRefinedLight(page, evidence?.files.refinedLight, evidence, timeout);
  const refinedSidebar = await verifySidebarRecovery(page, 'REFINED_LIGHT', timeout);

  await page.locator('#ussign-job-timer .sc-theme-choice[data-value="ORIGINAL"]').click();
  await page.waitForFunction(() => {
    const root = document.querySelector('#ussign-job-timer');
    return !document.documentElement.hasAttribute('data-squarecoil-companion-site-theme') &&
      document.documentElement.getAttribute('data-squarecoil-companion-cinematic') === 'DISABLED' &&
      !document.querySelector('#squarecoil-companion-cinematic-host') &&
      root?.querySelector('.sc-theme-choice[data-value="ORIGINAL"]')?.dataset.active === 'true';
  }, null, { timeout });
  const restored = await page.evaluate(() => ({
    trustedSelection: window.__squareCoilLabTrustedThemeSelections.filter(item => item.value === 'ORIGINAL').at(-1) || null,
    rootTheme: document.documentElement.getAttribute('data-squarecoil-companion-site-theme'),
    cinematicState: document.documentElement.getAttribute('data-squarecoil-companion-cinematic'),
    hostCount: document.querySelectorAll('#squarecoil-companion-cinematic-host').length,
    cinematicStyleCount: document.querySelectorAll('#squarecoil-companion-cinematic-style').length,
    siteStyleCount: document.querySelectorAll('#squarecoil-companion-site-theme').length,
    activeChoice: document.querySelector('#ussign-job-timer .sc-theme-choice[data-value="ORIGINAL"]')?.dataset.active || null
  }));
  assertVisualCondition(restored.trustedSelection?.isTrusted === true && restored.rootTheme === null &&
    restored.cinematicState === 'DISABLED' && restored.hostCount === 0 && restored.cinematicStyleCount === 0 &&
    restored.siteStyleCount === 0 && restored.activeChoice === 'true', 'Theme audit did not restore Native / Off deterministically', restored);
  await closeSettings(page, timeout);
  await openSettings(page, timeout);
  const restoredAppearance = await setCompanionAppearance(page, 'LIGHT', 'SOLID', timeout);
  await openSettings(page, timeout);
  await page.locator('#ussign-job-timer [data-action="settings-toggle-group"][data-group="appearance"]').click();
  await page.waitForFunction(() => {
    const root = document.getElementById('ussign-job-timer');
    return root?.querySelector('[data-action="settings-toggle-group"][data-group="appearance"]')?.getAttribute('aria-expanded') === 'true' &&
      root.querySelectorAll('[data-action="settings-toggle-group"][aria-expanded="true"]').length === 1;
  }, null, { timeout });
  const settings = await page.evaluate(() => ({
    groupCount: document.querySelectorAll('#ussign-job-timer [data-action="settings-toggle-group"]').length,
    expandedCount: document.querySelectorAll('#ussign-job-timer [data-action="settings-toggle-group"][aria-expanded="true"]').length,
    visibleRoutes: Array.from(document.querySelectorAll('#ussign-job-timer [data-action="settings-route"]')).filter(node => node.getClientRects().length > 0).map(node => node.dataset.view)
  }));
  assertVisualCondition(settings.groupCount === 6 && settings.expandedCount === 1 &&
    JSON.stringify(settings.visibleRoutes) === JSON.stringify(['timer-appearance','website-theme','dashboard','design-dashboard']),
  'Settings did not render as one compact disclosure navigator', settings);
  if (evidence) {
    await page.screenshot({ path: evidence.files.settings, fullPage: false, animations: 'disabled', caret: 'hide' });
    await captureStoreScreenshot(page, evidence.files.storeSettings);
  }
  await closeSettings(page, timeout);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  return { darkGlass, lightGlass, refinedLight, settings, sidebar: { dark: darkSidebar, light: lightSidebar, refined: refinedSidebar }, restored: { ...restored, appearance: restoredAppearance }, appearance: { dark: darkAppearance, light: lightAppearance } };
}

async function verifyVisualContract(page, evidence, timeout, options = {}) {
  await page.waitForFunction(() => {
    const root = document.querySelector('#ussign-job-timer');
    return root?.querySelectorAll('.sc-tab[data-context]').length >= 4 &&
      root.querySelector('.sc-tab[data-context="job:910002"]')?.dataset.selected === 'true';
  }, null, { timeout });

  const layout = await page.evaluate(() => {
    const root = document.querySelector('#ussign-job-timer');
    const tabs = root?.querySelector('.sc-tabs');
    const shell = root?.querySelector('.sc-proto-shell');
    const toRect = element => {
      const rect = element?.getBoundingClientRect();
      return rect ? Object.fromEntries(['top','right','bottom','left','width','height'].map(key => [key, Math.round(rect[key] * 100) / 100])) : null;
    };
    const rootRect = toRect(root);
    const tabsRect = toRect(tabs);
    const shellRect = toRect(shell);
    const relation = tabs && shell ? tabs.compareDocumentPosition(shell) : 0;
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      tabCount: root?.querySelectorAll('.sc-tab[data-context]').length || 0,
      rootRect,
      tabsRect,
      shellRect,
      tabsAndShellAreRootChildren: tabs?.parentElement === root && shell?.parentElement === root,
      tabsPrecedeShellInDom: Boolean(relation & Node.DOCUMENT_POSITION_FOLLOWING),
      tabsVisuallyProtrude: Boolean(tabsRect && shellRect && tabsRect.top < shellRect.top - 4 && tabsRect.bottom >= shellRect.top - 2),
      tabScrollWidth: tabs?.scrollWidth || 0,
      tabClientWidth: tabs?.clientWidth || 0,
      tabsOverflowHorizontally: Boolean(tabs && tabs.scrollWidth > tabs.clientWidth),
      rootWithinViewport: Boolean(rootRect && rootRect.top >= -1 && rootRect.left >= -1 && rootRect.right <= window.innerWidth + 1 && rootRect.bottom <= window.innerHeight + 1),
      shellWithinViewport: Boolean(shellRect && shellRect.top >= -1 && shellRect.bottom <= window.innerHeight + 1)
    };
  });
  assertVisualCondition(layout.viewport.width === 1280 && layout.viewport.height === 720, 'Smoke viewport is not the required short deterministic viewport', layout);
  assertVisualCondition(layout.tabCount >= 4, 'Four simulated Context tabs were not visible', layout);
  assertVisualCondition(layout.tabsAndShellAreRootChildren && layout.tabsPrecedeShellInDom, 'Protruding tabs do not precede the Companion shell', layout);
  assertVisualCondition(layout.tabsVisuallyProtrude, 'Tabs are not visually protruding above the Companion shell', layout);
  assertVisualCondition(layout.tabsOverflowHorizontally, 'The simulated tab set does not exercise horizontal overflow', layout);
  assertVisualCondition(layout.rootWithinViewport && layout.shellWithinViewport, 'Companion does not fit within the short viewport', layout);

  if (evidence) {
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important} input,textarea{caret-color:transparent!important}' });
    await page.screenshot({ path: evidence.files.tabs, fullPage: false, animations: 'disabled', caret: 'hide' });
    await captureStoreScreenshot(page, evidence.files.storeWorkspace);
  }

  await page.evaluate(() => { document.querySelector('#ussign-job-timer .sc-tabs').scrollLeft = 0; });
  const tabStrip = page.locator('#ussign-job-timer .sc-tabs');
  const tabStripBox = await visibleBoundingBox(page, tabStrip, timeout);
  if (!tabStripBox) throw new Error('Overflowing Companion tab strip is not visible');
  await page.mouse.move(tabStripBox.x + (tabStripBox.width / 2), tabStripBox.y + (tabStripBox.height / 2));
  await page.mouse.wheel(320, 0);
  await page.waitForFunction(() => document.querySelector('#ussign-job-timer .sc-tabs')?.scrollLeft > 0, null, { timeout });
  const horizontalScroll = await page.evaluate(() => {
    const tabs = document.querySelector('#ussign-job-timer .sc-tabs');
    return {
      scrollLeft: tabs?.scrollLeft || 0,
      maxScrollLeft: tabs ? tabs.scrollWidth - tabs.clientWidth : 0,
      scrollWidth: tabs?.scrollWidth || 0,
      clientWidth: tabs?.clientWidth || 0
    };
  });
  assertVisualCondition(horizontalScroll.scrollLeft > 0 && horizontalScroll.maxScrollLeft > 0,
    'Horizontal wheel or trackpad input did not move the overflowing tab strip', horizontalScroll);

  const reorderBefore = await page.evaluate(() => Array.from(
    document.querySelectorAll('#ussign-job-timer .sc-tab[data-context]')
  ).map(node => node.dataset.context));
  const reorderSource = reorderBefore.at(-1);
  const reorderTarget = reorderBefore.at(-2);
  if (!reorderSource || !reorderTarget) throw new Error('Overflowing tab reorder fixtures are unavailable');
  const reorderExpected = reorderBefore.filter(contextId => contextId !== reorderSource);
  reorderExpected.splice(reorderExpected.indexOf(reorderTarget), 0, reorderSource);
  const sourceTab = (await revealLabWorkspaceTab(page, reorderSource, timeout)).tab;
  const targetTab = (await revealLabWorkspaceTab(page, reorderTarget, timeout)).tab;
  await sourceTab.dragTo(targetTab, { force: true, targetPosition: { x: 2, y: 20 } });
  await page.waitForFunction(expected => {
    const after = Array.from(document.querySelectorAll('#ussign-job-timer .sc-tab[data-context]')).map(node => node.dataset.context);
    return JSON.stringify(after) === JSON.stringify(expected);
  }, reorderExpected, { timeout });
  const tabReorder = await page.evaluate(({ before, expected }) => {
    const after = Array.from(document.querySelectorAll('#ussign-job-timer .sc-tab[data-context]')).map(node => node.dataset.context);
    const selected = document.querySelector('#ussign-job-timer .sc-tab[data-selected="true"]')?.dataset.context || null;
    return {
      before,
      expected,
      after,
      sameContexts: [...before].sort().join('|') === [...after].sort().join('|'),
      exactPlacement: JSON.stringify(after) === JSON.stringify(expected),
      selected
    };
  }, { before: reorderBefore, expected: reorderExpected });
  assertVisualCondition(tabReorder.sameContexts && tabReorder.exactPlacement && tabReorder.selected === 'job:910002',
    'Drag reorder changed Context membership or selected the wrong job', tabReorder);

  await page.evaluate(() => { document.querySelector('#ussign-job-timer .sc-tabs').scrollLeft = 0; });
  await page.locator('#ussign-job-timer .sc-tab[data-context="job:910002"]').focus();
  await page.keyboard.press('End');
  await page.waitForFunction(() =>
    document.querySelector('#ussign-job-timer .sc-tab[data-selected="true"]')?.dataset.context === 'job:910003', null, { timeout });
  const keyboardTab = await revealLabWorkspaceTab(page, 'job:910003', timeout);
  const keyboardReveal = await page.evaluate(() => ({
    selected: document.querySelector('#ussign-job-timer .sc-tab[data-selected="true"]')?.dataset.context || null,
    focused: document.activeElement?.dataset?.context || null,
    scrollLeft: document.querySelector('#ussign-job-timer .sc-tabs')?.scrollLeft || 0
  }));
  assertVisualCondition(keyboardReveal.selected === 'job:910003' && keyboardReveal.focused === 'job:910003' &&
    keyboardReveal.scrollLeft > 0 && keyboardTab.tabBox.x + keyboardTab.tabBox.width <= keyboardTab.stripBox.x + keyboardTab.stripBox.width + 1,
  'End-key navigation did not reveal and focus the last overflowing tab', keyboardReveal);
  const selectedTab = (await revealLabWorkspaceTab(page, 'job:910002', timeout)).tab;
  await selectedTab.click();
  await page.waitForFunction(() => document.querySelector('#ussign-job-timer .sc-tab[data-context="job:910002"]')?.dataset.selected === 'true', null, { timeout });

  const inactiveTabState = await revealLabWorkspaceTab(page, 'job:910001', timeout);
  const inactiveTab = inactiveTabState.tab;
  const tabBox = inactiveTabState.tabBox;
  const tabCountBeforePreview = layout.tabCount;
  const center = { x: tabBox.x + (tabBox.width / 2), y: tabBox.y + (tabBox.height / 2) };
  const viewport = page.viewportSize();
  const outside = { x: 96, y: Math.min(300, (viewport?.height || 720) - 80) };
  let pointerHeld = false;
  let archiveVeil = null;
  try {
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    pointerHeld = true;
    await page.mouse.move(center.x - 24, center.y + 8, { steps: 4 });
    await page.waitForFunction(() => document.querySelector('#ussign-job-timer')?.dataset.dragging === 'true', null, { timeout });
    await page.mouse.move(outside.x, outside.y, { steps: 12 });
    await page.waitForFunction(() => document.querySelector('#ussign-job-timer .sc-archive-veil')?.dataset.visible === 'true', null, { timeout });
    await page.waitForFunction(() => {
      const veil = document.querySelector('#ussign-job-timer .sc-archive-veil');
      const style = veil ? getComputedStyle(veil) : null;
      return style?.visibility === 'visible' && Number.parseFloat(style.opacity) >= 0.99;
    }, null, { timeout });
    archiveVeil = await page.evaluate(() => {
      const root = document.querySelector('#ussign-job-timer');
      const veil = root?.querySelector('.sc-archive-veil');
      const message = veil?.querySelector(':scope > div');
      const detailNode = veil?.querySelector('[data-sc-archive-veil-detail]');
      const shell = root?.querySelector('.sc-proto-shell');
      const style = veil ? getComputedStyle(veil) : null;
      const messageStyle = message ? getComputedStyle(message) : null;
      const rect = veil?.getBoundingClientRect();
      const messageRect = message?.getBoundingClientRect();
      const shellRect = shell?.getBoundingClientRect();
      const overlapsShell = Boolean(messageRect && shellRect && messageRect.left < shellRect.right &&
        messageRect.right > shellRect.left && messageRect.top < shellRect.bottom && messageRect.bottom > shellRect.top);
      const roundedRect = candidate => candidate ? Object.fromEntries(['top','right','bottom','left','width','height']
        .map(key => [key, Math.round(candidate[key] * 100) / 100])) : null;
      return {
        dragging: root?.dataset.dragging || null,
        visible: veil?.dataset.visible || null,
        tone: veil?.dataset.tone || null,
        ariaHidden: veil?.getAttribute('aria-hidden') || null,
        title: veil?.querySelector('[data-sc-archive-veil-title]')?.textContent?.trim() || null,
        detail: veil?.querySelector('[data-sc-archive-veil-detail]')?.textContent?.trim() || null,
        detailColor: detailNode ? getComputedStyle(detailNode).color : null,
        messageBackgroundColor: messageStyle?.backgroundColor || null,
        visibility: style?.visibility || null,
        opacity: style ? Number.parseFloat(style.opacity) : null,
        coversViewport: Boolean(rect && rect.left <= 1 && rect.top <= 1 && rect.right >= window.innerWidth - 1 && rect.bottom >= window.innerHeight - 1),
        messageRect: roundedRect(messageRect),
        shellRect: roundedRect(shellRect),
        messageWithinViewport: Boolean(messageRect && messageRect.left >= 0 && messageRect.top >= 0 &&
          messageRect.right <= window.innerWidth && messageRect.bottom <= window.innerHeight),
        messageOverlapsShell: overlapsShell
      };
    });
    assertVisualCondition(archiveVeil.dragging === 'true' && archiveVeil.visible === 'true' && archiveVeil.ariaHidden === 'false', 'Archive preview did not expose its drag state', archiveVeil);
    assertVisualCondition(archiveVeil.tone === 'eligible' && archiveVeil.title === 'Release to archive', 'Archive preview did not show the eligible release message', archiveVeil);
    assertVisualCondition(archiveVeil.detail === 'Hours and history stay saved.' && archiveVeil.detailColor === 'rgb(214, 224, 232)',
      'Archive preview detail is missing or too dim against its prompt', archiveVeil);
    assertVisualCondition(archiveVeil.messageBackgroundColor === 'rgb(20, 27, 34)',
      'Archive prompt is translucent enough for underlying controls to bleed through', archiveVeil);
    assertVisualCondition(archiveVeil.visibility === 'visible' && archiveVeil.opacity >= 0.99 && archiveVeil.coversViewport, 'Archive preview veil did not gray the full website', archiveVeil);
    assertVisualCondition(archiveVeil.messageWithinViewport && archiveVeil.messageOverlapsShell === false,
      'Archive preview message overlaps the Companion shell or leaves the viewport', archiveVeil);
    if (evidence) {
      await page.screenshot({ path: evidence.files.archiveVeil, fullPage: false, animations: 'disabled', caret: 'hide' });
    }
  } finally {
    if (pointerHeld) {
      await page.keyboard.press('Escape').catch(() => {});
      const canceled = await page.waitForFunction(() => document.querySelector('#ussign-job-timer')?.dataset.dragging === 'false', null, { timeout: 1_500 })
        .then(() => true).catch(() => false);
      if (!canceled) await page.mouse.move(center.x, center.y, { steps: 8 }).catch(() => {});
      await page.mouse.up().catch(() => {});
    }
  }

  await page.waitForFunction(() => {
    const root = document.querySelector('#ussign-job-timer');
    const veil = root?.querySelector('.sc-archive-veil');
    return root?.dataset.dragging === 'false' && veil?.dataset.visible === 'false';
  }, null, { timeout });
  const archiveCanceled = await page.evaluate(expectedTabCount => ({
    dragging: document.querySelector('#ussign-job-timer')?.dataset.dragging || null,
    veilVisible: document.querySelector('#ussign-job-timer .sc-archive-veil')?.dataset.visible || null,
    inactiveTabStillOpen: Boolean(document.querySelector('#ussign-job-timer .sc-tab[data-context="job:910001"]')),
    tabCount: document.querySelectorAll('#ussign-job-timer .sc-tab[data-context]').length,
    expectedTabCount
  }), tabCountBeforePreview);
  assertVisualCondition(archiveCanceled.dragging === 'false' && archiveCanceled.veilVisible === 'false' &&
    archiveCanceled.inactiveTabStillOpen && archiveCanceled.tabCount === archiveCanceled.expectedTabCount,
  'Archive preview was not canceled without changing the fake workspace', archiveCanceled);

  let narrowArchiveVeil = null;
  let narrowArchiveCanceled = null;
  await page.setViewportSize({ width: 720, height: 640 });
  try {
    await page.waitForFunction(() => window.innerWidth === 720 && window.innerHeight === 640, null, { timeout });
    const narrowInactiveTabState = await revealLabWorkspaceTab(page, 'job:910001', timeout);
    const narrowInactiveTab = narrowInactiveTabState.tab;
    const narrowTabBox = narrowInactiveTabState.tabBox;
    const narrowTabCountBeforePreview = await page.locator('#ussign-job-timer .sc-tab[data-context]').count();
    const narrowCenter = {
      x: narrowTabBox.x + (narrowTabBox.width / 2),
      y: narrowTabBox.y + (narrowTabBox.height / 2)
    };
    let narrowPointerHeld = false;
    try {
      await page.mouse.move(narrowCenter.x, narrowCenter.y);
      await page.mouse.down();
      narrowPointerHeld = true;
      await page.mouse.move(narrowCenter.x - 24, narrowCenter.y + 8, { steps: 4 });
      await page.waitForFunction(() => document.querySelector('#ussign-job-timer')?.dataset.dragging === 'true', null, { timeout });
      await page.mouse.move(40, 300, { steps: 12 });
      await page.waitForFunction(() => {
        const veil = document.querySelector('#ussign-job-timer .sc-archive-veil');
        const style = veil ? getComputedStyle(veil) : null;
        return veil?.dataset.visible === 'true' && style?.visibility === 'visible' && Number.parseFloat(style.opacity) >= 0.99;
      }, null, { timeout });
      narrowArchiveVeil = await page.evaluate(() => {
        const root = document.querySelector('#ussign-job-timer');
        const veil = root?.querySelector('.sc-archive-veil');
        const message = veil?.querySelector(':scope > div');
        const shell = root?.querySelector('.sc-proto-shell');
        const tabs = root?.querySelector('.sc-tabs');
        const veilStyle = veil ? getComputedStyle(veil) : null;
        const messageStyle = message ? getComputedStyle(message) : null;
        const rect = veil?.getBoundingClientRect();
        const messageRect = message?.getBoundingClientRect();
        const shellStyle = shell ? getComputedStyle(shell) : null;
        const tabsStyle = tabs ? getComputedStyle(tabs) : null;
        const numericZIndex = style => {
          const value = Number.parseInt(style?.zIndex || '', 10);
          return Number.isFinite(value) ? value : 0;
        };
        const veilZIndex = numericZIndex(veilStyle);
        const shellZIndex = numericZIndex(shellStyle);
        const tabsZIndex = numericZIndex(tabsStyle);
        const roundedRect = candidate => candidate ? Object.fromEntries(['top','right','bottom','left','width','height']
          .map(key => [key, Math.round(candidate[key] * 100) / 100])) : null;
        return {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          dragging: root?.dataset.dragging || null,
          visible: veil?.dataset.visible || null,
          title: veil?.querySelector('[data-sc-archive-veil-title]')?.textContent?.trim() || null,
          visibility: veilStyle?.visibility || null,
          opacity: veilStyle ? Number.parseFloat(veilStyle.opacity) : null,
          veilZIndex,
          shellZIndex,
          tabsZIndex,
          veilAboveShellAndTabs: veilZIndex > shellZIndex && veilZIndex > tabsZIndex,
          messageVisibility: messageStyle?.visibility || null,
          messageOpacity: messageStyle ? Number.parseFloat(messageStyle.opacity) : null,
          coversViewport: Boolean(rect && rect.left <= 1 && rect.top <= 1 &&
            rect.right >= window.innerWidth - 1 && rect.bottom >= window.innerHeight - 1),
          messageRect: roundedRect(messageRect),
          messageWithinViewport: Boolean(messageRect && messageRect.width > 0 && messageRect.height > 0 &&
            messageRect.left >= 0 && messageRect.top >= 0 &&
            messageRect.right <= window.innerWidth && messageRect.bottom <= window.innerHeight),
          messageCentered: Boolean(messageRect && Math.abs((messageRect.left + (messageRect.width / 2)) - (window.innerWidth / 2)) <= 2)
        };
      });
      assertVisualCondition(narrowArchiveVeil.viewport.width === 720 && narrowArchiveVeil.viewport.height === 640 &&
        narrowArchiveVeil.dragging === 'true' && narrowArchiveVeil.visible === 'true' &&
        narrowArchiveVeil.title === 'Release to archive',
      'Narrow archive preview did not expose its eligible drag state', narrowArchiveVeil);
      assertVisualCondition(narrowArchiveVeil.visibility === 'visible' && narrowArchiveVeil.opacity >= 0.99 &&
        narrowArchiveVeil.coversViewport && narrowArchiveVeil.messageWithinViewport && narrowArchiveVeil.messageCentered,
      'Narrow archive veil or centered prompt did not cover the visible viewport', narrowArchiveVeil);
      assertVisualCondition(narrowArchiveVeil.messageVisibility === 'visible' && narrowArchiveVeil.messageOpacity >= 0.99 &&
        narrowArchiveVeil.veilZIndex >= 9 && narrowArchiveVeil.veilAboveShellAndTabs,
      'Narrow archive prompt is not visibly stacked above the Companion shell and tabs', narrowArchiveVeil);
    } finally {
      if (narrowPointerHeld) {
        await page.keyboard.press('Escape').catch(() => {});
        const canceled = await page.waitForFunction(() => document.querySelector('#ussign-job-timer')?.dataset.dragging === 'false', null, { timeout: 1_500 })
          .then(() => true).catch(() => false);
        if (!canceled) await page.mouse.move(narrowCenter.x, narrowCenter.y, { steps: 8 }).catch(() => {});
        await page.mouse.up().catch(() => {});
      }
    }
    await page.waitForFunction(() => {
      const root = document.querySelector('#ussign-job-timer');
      return root?.dataset.dragging === 'false' && root.querySelector('.sc-archive-veil')?.dataset.visible === 'false';
    }, null, { timeout });
    narrowArchiveCanceled = await page.evaluate(expectedTabCount => ({
      dragging: document.querySelector('#ussign-job-timer')?.dataset.dragging || null,
      veilVisible: document.querySelector('#ussign-job-timer .sc-archive-veil')?.dataset.visible || null,
      inactiveTabStillOpen: Boolean(document.querySelector('#ussign-job-timer .sc-tab[data-context="job:910001"]')),
      tabCount: document.querySelectorAll('#ussign-job-timer .sc-tab[data-context]').length,
      expectedTabCount
    }), narrowTabCountBeforePreview);
    assertVisualCondition(narrowArchiveCanceled.dragging === 'false' && narrowArchiveCanceled.veilVisible === 'false' &&
      narrowArchiveCanceled.inactiveTabStillOpen && narrowArchiveCanceled.tabCount === narrowArchiveCanceled.expectedTabCount,
    'Narrow archive preview was not canceled without changing the fake workspace', narrowArchiveCanceled);
  } finally {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForFunction(() => window.innerWidth === 1280 && window.innerHeight === 720, null, { timeout });
  }
  const themes = await verifyThemeEvidence(page, evidence, options.bingPermissionGranted === true, timeout);
  return { layout, horizontalScroll, tabReorder, keyboardReveal, archiveVeil, archiveCanceled, narrowArchiveVeil, narrowArchiveCanceled, themes };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write('SquareCoil Companion Lab\n\n  npm run lab:chrome\n  npm run lab:edge\n  npm run lab:smoke\n  npm run lab:smoke:edge\n  npm run lab:evidence -- --evidence-dir <outside-repository-directory>\n  npm run lab:evidence:edge -- --evidence-dir <separate-outside-repository-directory>\n');
    return;
  }
  const extensionRoot = path.resolve(__dirname, '..', '..');
  const repositoryRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: extensionRoot, encoding: 'utf8' }).trim();
  const evidence = prepareEvidenceDirectory(options.evidenceDir, repositoryRoot);
  const executablePath = BROWSER_PATHS[options.browser];
  if (!fs.existsSync(executablePath)) throw new Error(`Installed ${options.browser} was not found at ${executablePath}`);

  if (!options.useExistingBuild) {
    process.stdout.write('Building the current Companion for an isolated, non-acceptance lab session…\n');
    execFileSync(process.execPath, [path.join(extensionRoot, 'scripts', 'build.js')], { cwd: extensionRoot, stdio: 'inherit' });
  }
  const state = { companyClockedIn: false, current: null, events: [] };
  const network = { syntheticRequests: 0, bingRequests: [], blockedUnexpected: [] };
  const browserErrors = [];
  let packageDirectory = null;
  let profileDirectory = null;
  let playwright = null;
  let context;
  let browserCdp;
  let closing = false;
  async function cleanup() {
    if (closing) return;
    closing = true;
    await browserCdp?.detach().catch(() => {});
    await context?.close().catch(() => {});
    safeRemoveTemp(profileDirectory, `squarecoil-companion-lab-${options.browser}-`);
    safeRemoveTemp(packageDirectory, 'squarecoil-companion-lab-package-');
  }

  try {
    packageDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'squarecoil-companion-lab-package-'));
    profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), `squarecoil-companion-lab-${options.browser}-`));
    copyPackageFiles(extensionRoot, packageDirectory);
    const packageIdentity = JSON.parse(fs.readFileSync(path.join(packageDirectory, 'dist', 'build-info.json'), 'utf8'));
    if (packageIdentity.candidateFingerprint !== computeCandidateFingerprint(extensionRoot)) {
      throw new Error('Existing build does not match current candidate source; rebuild before the sealed lab run.');
    }
    if (!/^[0-9a-f]{64}$/.test(String(packageIdentity.candidateFingerprint || '')) ||
      !/^[0-9a-f]{40}$/.test(String(packageIdentity.sourceSha || '')) || typeof packageIdentity.sourceDirty !== 'boolean') {
      throw new Error('Sealed lab package identity is incomplete.');
    }
    playwright = resolvePlaywright();

    context = await playwright.chromium.launchPersistentContext(profileDirectory, {
      executablePath,
      headless: options.smoke,
      viewport: options.smoke ? { width: 1280, height: 720 } : null,
      ignoreDefaultArgs: ['--disable-extensions', '--disable-back-forward-cache'],
      args: [
        '--enable-unsafe-extension-debugging',
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-sync',
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE www.bing.com',
        '--metrics-recording-only',
        '--no-default-browser-check',
        '--no-first-run',
        '--start-maximized'
      ]
    });

    await context.route('**/*', async route => {
      const request = route.request();
      let url;
      try { url = new URL(request.url()); } catch (_) { return route.abort('blockedbyclient'); }
      if (url.protocol === 'chrome-extension:' || url.protocol === 'data:') return route.continue();
      if (url.origin === ORIGIN && ROUTED_PAGES.has(url.pathname)) {
        network.syntheticRequests += 1;
        return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: labPageHtml(url) });
      }
      if (url.origin === ORIGIN && url.pathname === `${LAB_ROOT}/lab.css`) {
        return route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: loadLabAsset('lab.css') });
      }
      if (url.origin === ORIGIN && url.pathname === `${LAB_ROOT}/native-logo.svg`) {
        return route.fulfill({ status: 200, contentType: 'image/svg+xml; charset=utf-8', body: loadLabAsset('native-logo.svg') });
      }
      if (url.origin === ORIGIN && decodeURIComponent(url.pathname).endsWith(`/images/${WEBSITE_LOGO_FILENAME}`)) {
        // The sealed lab cannot read the real tenant file. Reuse its existing
        // fictional logo bytes while verifying the exact same-origin path contract.
        return route.fulfill({ status: 200, contentType: 'image/svg+xml; charset=utf-8', body: loadLabAsset('native-logo.svg') });
      }
      if (url.origin === ORIGIN && url.pathname === `${LAB_ROOT}/lab.js`) {
        return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: loadLabAsset('lab.js') });
      }
      if (url.origin === ORIGIN && url.pathname === `${LAB_ROOT}/api/state`) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(publicState(state)) });
      }
      if (url.origin === ORIGIN && url.pathname === '/favicon.ico') return route.fulfill({ status: 204, body: '' });
      if (url.origin === ORIGIN && url.pathname === '/ajax_time_clock.php') {
        const parameters = new URLSearchParams(request.postData() || '');
        const action = Number(parameters.get('action'));
        if (request.method() !== 'POST' || ![2,3,4,7].includes(action)) return route.abort('blockedbyclient');
        if (action === 7) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: visibleContextHtml(state.current) });

        const previous = state.current;
        if (action === 3) {
          const projectId = parameters.get('project_id');
          const requested = JOBS.find(job => job.projectId === projectId);
          if (!requested) return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'UNKNOWN_FAKE_JOB' }) });
          const department = parameters.get('department');
          if (department && department !== requested.department) return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'FAKE_DEPARTMENT_MISMATCH' }) });
          state.companyClockedIn = true;
          state.current = requested;
        } else if (action === 4) {
          if (!state.companyClockedIn || !state.current) {
            return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'NO_FAKE_JOB_TO_LEAVE' }) });
          }
          state.companyClockedIn = true;
          state.current = null;
        } else {
          if (!state.companyClockedIn) {
            return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'ALREADY_FAKE_CLOCKED_OUT' }) });
          }
          state.companyClockedIn = false;
          state.current = null;
        }
        const event = {
          action,
          at: Date.now(),
          contextId: state.current?.contextId || null,
          label: state.current?.label || null,
          previousContextId: previous?.contextId || null,
          previousLabel: previous?.label || null
        };
        state.events.push(event);
        if (state.events.length > 250) state.events.splice(0, state.events.length - 250);
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, event, state: publicState(state) }) });
      }
      if (exactBingRequest(url)) {
        network.bingRequests.push({ method: request.method(), url: url.href });
        // Smoke keeps the required-host request fully sealed with an offline response.
        return options.smoke ? route.abort('internetdisconnected') : route.continue();
      }
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        network.blockedUnexpected.push({ method: request.method(), url: url.href });
        process.stderr.write(`Blocked unexpected network request: ${url.href}\n`);
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });

    const browser = context.browser();
    if (!browser || typeof browser.newBrowserCDPSession !== 'function') throw new Error('Browser-level extension loading is unavailable.');
    browserCdp = await browser.newBrowserCDPSession();
    const loaded = await browserCdp.send('Extensions.loadUnpacked', { path: packageDirectory, enableInIncognito: false });
    if (!loaded?.id) throw new Error('Chrome did not load the isolated Companion package.');

    const setup = await context.newPage();
    await setup.goto(`chrome-extension://${loaded.id}/popup/popup.html`, { waitUntil: 'domcontentloaded' });
    await setup.evaluate(() => chrome.storage.local.set({ timerEnabled: true }));
    const bingPermissionGranted = await setup.evaluate(() => chrome.permissions.contains({ origins: ['https://www.bing.com/*'] }));
    if (!bingPermissionGranted) throw new Error('Fresh sealed-lab profile lacks the required Bing install host.');
    const permissionWorker = context.serviceWorkers().find(worker => worker.url().startsWith(`chrome-extension://${loaded.id}/`));
    if (!permissionWorker) throw new Error('Loaded extension worker is unavailable');
    await permissionWorker.evaluate(() => {
      globalThis.__labRuntimePermissionRequests = 0;
      const original = chrome.permissions.request.bind(chrome.permissions);
      chrome.permissions.request = (...args) => { globalThis.__labRuntimePermissionRequests += 1; return original(...args); };
    });
    await setup.close();

    const existing = context.pages();
    const page = existing[0] || await context.newPage();
    page.on('pageerror', error => browserErrors.push({ type: 'pageerror', text: error.message }));
    page.on('console', message => {
      if (['error', 'warning'].includes(message.type())) browserErrors.push({ type: message.type(), text: message.text() });
    });
    for (const extra of existing.slice(1)) await extra.close().catch(() => {});
    await page.goto(`${ORIGIN}${LAB_ROOT}/index.html`, { waitUntil: 'domcontentloaded' });
    await page.bringToFront();

    if (options.smoke) {
      const timeout = 30_000;
      const readBoundary = async () => {
        const worker = context.serviceWorkers().find(candidate => candidate.url().startsWith(`chrome-extension://${loaded.id}/`));
        if (!worker) throw new Error('Sealed-lab authority storage reader has no extension worker');
        return worker.evaluate(async () => {
          const stored = await chrome.storage.local.get('squarecoilCompanionB2AuthorityV1');
          const document = stored.squarecoilCompanionB2AuthorityV1?.document;
          if (!document || !Array.isArray(document.ledger)) throw new Error('Canonical authority document is unavailable');
          const active = document.timer.active;
          // lastVerifiedAtMs advances on the independent read-only heartbeat.
          // Session identity, start, context and finalized segments must not.
          return { timer: { active: active ? { contextId: active.contextId, cycleId: active.cycleId,
            sessionId: active.sessionId, startedAtMs: active.startedAtMs, certainty: active.certainty,
            provisionalSinceMs: active.provisionalSinceMs, safetyHold: active.safetyHold } : null,
          pending: document.timer.pending, localPause: document.timer.localPause }, ledger: document.ledger };
        });
      };
      await page.waitForSelector('#ussign-job-timer', { timeout });
      await page.waitForFunction(() => {
        const root = document.querySelector('#ussign-job-timer');
        return root?.dataset.workspaceState === 'loaded' && root?.dataset.busy === 'false' &&
          root.querySelector('[data-sc-status]')?.textContent.trim() === 'Ready' &&
          Boolean(root.querySelector('[data-action="view"][data-view="settings"]'));
      }, null, { timeout });
      await page.waitForSelector('[data-project-id="910001"]', { timeout });
      await page.click('[data-project-id="910001"]');
      await page.waitForFunction(() => document.querySelector('#clockin-remaining-time')?.textContent.includes('910001'), null, { timeout });
      await page.waitForFunction(() => document.querySelector('#ussign-job-timer')?.textContent.includes('910001'), null, { timeout });
      const stableShell = await page.evaluate(() => {
        const root = document.querySelector('#ussign-job-timer');
        const shell = root?.querySelector('.sc-proto-shell');
        const tabs = root?.querySelector('.sc-tabs');
        const focusTarget = root?.querySelector('.sc-proto-topbar [data-action="view"][data-view="home"]');
        if (!shell || !tabs || !focusTarget) return false;
        window.__squarecoilStableUi = { root, shell, tabs, focusTarget };
        focusTarget.focus();
        return document.activeElement === focusTarget;
      });
      assert(stableShell, 'Companion shell and keyboard focus should be available');
      await page.waitForTimeout(1_100);
      const stableAfterTick = await page.evaluate(() => {
        const stored = window.__squarecoilStableUi;
        const root = document.querySelector('#ussign-job-timer');
        return Boolean(stored && root === stored.root &&
          root.querySelector('.sc-proto-shell') === stored.shell &&
          root.querySelector('.sc-tabs') === stored.tabs &&
          document.activeElement === stored.focusTarget);
      });
      assert(stableAfterTick, 'Timer tick must preserve the shell, tab rail, and keyboard focus');
      // The wide dock can overlap a native job card on a short viewport. Use
      // the real keyboard activation path so this remains a trusted site click.
      await page.locator('[data-project-id="910002"]').focus();
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('#clockin-remaining-time')?.textContent.includes('910002') &&
        document.body.dataset.labBusy !== 'true', null, { timeout });
      await page.waitForFunction(() => document.querySelector('#ussign-job-timer .sc-tab[data-context="job:910002"]')?.dataset.selected === 'true', null, { timeout });
      await page.waitForTimeout(1_100);
      await sendSealedLabClockAction(page, 3, { project_id: '910003', department: 'Installation' });
      await page.waitForFunction(() => document.querySelector('#clockin-remaining-time')?.textContent.includes('910003'), null, { timeout });
      await page.waitForFunction(() => document.querySelector('#ussign-job-timer .sc-tab[data-context="job:910003"]')?.dataset.selected === 'true', null, { timeout });
      await page.waitForTimeout(1_100);
      await sendSealedLabClockAction(page, 3, { project_id: '0', department: 'General' });
      await page.waitForFunction(() => document.querySelector('#clockin-remaining-time')?.textContent.includes('Production (General)'), null, { timeout });
      await page.waitForFunction(() => document.querySelector('#ussign-job-timer .sc-tab[data-context="general:production-general"]')?.dataset.selected === 'true', null, { timeout });
      await page.waitForTimeout(1_100);
      await sendSealedLabClockAction(page, 3, { project_id: '910002', department: 'Fabrication' });
      await page.waitForFunction(() => document.querySelector('#clockin-remaining-time')?.textContent.includes('910002'), null, { timeout });
      await page.waitForFunction(() => document.querySelector('#ussign-job-timer .sc-tab[data-context="job:910002"]')?.dataset.selected === 'true', null, { timeout });
      await page.waitForSelector('#ussign-job-timer [data-action="timer"][data-timer-action="resume"]', { timeout });
      await page.click('#ussign-job-timer [data-action="timer"][data-timer-action="resume"]');
      await page.waitForFunction(() => {
        const root = document.querySelector('#ussign-job-timer');
        return root?.dataset.busy === 'false' &&
          root.querySelector('.sc-timer-card .sc-status')?.textContent.trim().startsWith('Running') &&
          !root.querySelector('[data-action="timer"][data-timer-action="resume"]');
      }, null, { timeout });
      const selectedContext = await verifySelectedContext({ page, timeout, readBoundary, screenshot: evidence?.files.selectedContext });
      const visualProof = await verifyVisualContract(page, evidence, timeout, { bingPermissionGranted });
      await page.waitForTimeout(1_100);
      await sendSealedLabClockAction(page, 4);
      await page.waitForFunction(() => document.querySelector('#metric-state')?.textContent === 'Between jobs', null, { timeout });
      // The short-viewport Companion intentionally covers lower-right lab
      // controls. Submit the same sealed native request directly; production
      // webRequest observation still sees the exact action-3 evidence.
      await sendSealedLabClockAction(page, 3, { project_id: '0', department: 'General' });
      await page.waitForFunction(() => document.querySelector('#clockin-remaining-time')?.textContent.includes('Production (General)'), null, { timeout });
      await page.waitForFunction(() => document.querySelector('#ussign-job-timer .sc-tab[data-context="general:production-general"]')?.dataset.selected === 'true', null, { timeout });
      await page.waitForSelector('#ussign-job-timer [data-action="timer"][data-timer-action="resume"]', { timeout });
      await page.click('#ussign-job-timer [data-action="timer"][data-timer-action="resume"]');
      await page.waitForFunction(() => {
        const root = document.querySelector('#ussign-job-timer');
        return root?.dataset.busy === 'false' &&
          root.querySelector('.sc-timer-card .sc-status')?.textContent.trim().startsWith('Running') &&
          !root.querySelector('[data-action="timer"][data-timer-action="resume"]');
      }, null, { timeout });
      await page.waitForTimeout(1_100);
      await sendSealedLabClockAction(page, 2);
      await page.waitForFunction(() => document.querySelector('#metric-state')?.textContent === 'Clocked out', null, { timeout });
      await page.waitForFunction(() => {
        const root = document.querySelector('#ussign-job-timer');
        return root?.dataset.workspaceState === 'loaded' && root?.dataset.busy === 'false' &&
          !root.querySelector('.sc-current-strip') &&
          root.querySelector('.sc-timer-card .sc-status')?.textContent.trim() === 'Not running';
      }, null, { timeout });
      await page.click('#ussign-job-timer .sc-proto-topbar [data-action="view"][data-view="home"]');
      await page.click('#ussign-job-timer .sc-home-view [data-action="view"][data-view="history"]');
      await page.waitForFunction(() => document.querySelectorAll('#ussign-job-timer [data-history-session]').length === 6, null, { timeout });
      const proof = await page.evaluate(() => ({
        labEvents: Number(document.querySelector('#metric-actions')?.textContent || 0),
        historyRows: document.querySelectorAll('#ussign-job-timer [data-history-session]').length,
        historyLabels: Array.from(document.querySelectorAll('#ussign-job-timer [data-history-session] .sc-row-title'))
          .map(node => node.textContent.trim()),
        rootCount: document.querySelectorAll('#ussign-job-timer').length,
        controller: document.documentElement.dataset.squarecoilCompanionController || null,
        controllerReason: document.documentElement.dataset.squarecoilCompanionControllerReason || null,
        effectiveWorkspaceStatus: document.querySelector('#ussign-job-timer [data-sc-status]')?.textContent?.trim() || null,
        workspaceState: document.querySelector('#ussign-job-timer')?.dataset.workspaceState || null,
        rawMainLifecycle: document.querySelector('#ussign-job-timer')?.dataset.lifecycleState || null,
        rawMainLifecycleReason: document.querySelector('#ussign-job-timer')?.dataset.lifecycleReason || null
      }));
      const historyCounts = label => proof.historyLabels.filter(value => value.includes(label)).length;
      if (proof.labEvents !== 8 || proof.historyRows !== 6 ||
          historyCounts('910001') !== 1 || historyCounts('910002') !== 2 || historyCounts('910003') !== 1 ||
          historyCounts('Production (General)') !== 2 || proof.rootCount !== 1) {
        throw new Error(`Lab smoke proof failed: ${JSON.stringify(proof)}`);
      }
      const dashboard = await verifyDashboardJourney({ page, origin: ORIGIN, timeout, readBoundary,
        screenshot: evidence?.files.dashboard, narrowScreenshot: evidence?.files.dashboardNarrow,
        sidebarScreenshot: evidence?.files.dashboardSidebar,
        sidebarRowScreenshot: evidence?.files.dashboardSidebarRow, narrowRowScreenshot: evidence?.files.dashboardNarrowRow,
        expectedLabels: ['910001', '910002', '910003'] });
      const designProfile = await verifyDesignProfileJourney({ page, origin: ORIGIN, timeout, readBoundary,
        screenshot: evidence?.files.designProfile });
      const identity = { url: page.url(), title: await page.title() };
      const pageContent = await page.locator('body').innerText();
      const nonblank = pageContent.includes('LOCAL SIMULATOR') && pageContent.includes('SquareCoil Companion');
      const frameworkOverlay = await page.locator('vite-error-overlay, nextjs-portal [data-nextjs-dialog-overlay], #webpack-dev-server-client-overlay').count() > 0;
      assertVisualCondition(identity.url === `${ORIGIN}${LAB_ROOT}/index.html` && identity.title === 'SquareCoil Companion Lab', 'Smoke ended on the wrong page', identity);
      assertVisualCondition(nonblank && !frameworkOverlay, 'Rendered page was blank or showed a framework error overlay', { nonblank, frameworkOverlay });
      assertVisualCondition(network.bingRequests.length > 0 && network.blockedUnexpected.length === 0, 'Sealed smoke omitted the background attempt or requested nonfixture traffic', network);
      assertVisualCondition(browserErrors.length === 0, 'Sealed smoke reported browser errors', browserErrors);
      const permissionProof = await permissionWorker.evaluate(async () => ({
        requests: globalThis.__labRuntimePermissionRequests,
        granted: await chrome.permissions.contains({ origins: ['https://www.bing.com/*'] })
      }));
      assertVisualCondition(permissionProof.requests === 0 && permissionProof.granted === true,
        'Skin selection requested runtime permission or removed required install access', permissionProof);
      if (evidence) {
        const screenshotDigests = Object.fromEntries(Object.values(EVIDENCE_FILES).filter(filename => filename.endsWith('.png'))
          .map(filename => [filename, sha256File(path.join(evidence.directory, filename))]));
        fs.writeFileSync(evidence.files.manifest, `${JSON.stringify({
          kind: 'SquareCoil Companion sealed-lab visual evidence',
          acceptanceScope: 'NON_ACCEPTANCE_SEALED_LAB_VISUAL_EVIDENCE',
          glassSelection: 'trusted-workspace-skin-click; required Bing install host; sealed offline network fixture',
          browser: options.browser,
          browserVersion: browser.version(),
          origin: ORIGIN,
          packageIdentity,
          screenshots: {
            tabsShortViewport: EVIDENCE_FILES.tabs,
            archiveVeilPreview: EVIDENCE_FILES.archiveVeil,
            darkGlassFallback: EVIDENCE_FILES.darkGlass,
            lightGlassFallback: EVIDENCE_FILES.lightGlass,
            refinedLight: EVIDENCE_FILES.refinedLight,
            nestedSettings: EVIDENCE_FILES.settings,
            selectedContext: EVIDENCE_FILES.selectedContext,
            dashboard: EVIDENCE_FILES.dashboard,
            dashboardNarrow: EVIDENCE_FILES.dashboardNarrow,
            dashboardSidebar: EVIDENCE_FILES.dashboardSidebar,
            dashboardSidebarRow: EVIDENCE_FILES.dashboardSidebarRow,
            dashboardNarrowRow: EVIDENCE_FILES.dashboardNarrowRow,
            designProfile: EVIDENCE_FILES.designProfile,
            storeWorkspace: EVIDENCE_FILES.storeWorkspace,
            storeSettings: EVIDENCE_FILES.storeSettings
          },
          screenshotDigests,
          visualProof,
          selectedContext,
          dashboard,
          designProfile,
          browserChecks: { identity, nonblank, frameworkOverlay, browserErrors, network,
            permissionProof,
            browserPath: 'Browser plugin not available; repository Playwright harness' },
          smokeProof: proof
        }, null, 2)}\n`, 'utf8');
        process.stdout.write(`Visual evidence saved outside temporary storage and the Git repository: ${evidence.directory}\n`);
      }
      process.stdout.write(`Lab smoke passed: ${JSON.stringify(proof)}\n`);
      await cleanup();
      return;
    }

    process.stdout.write(`\nSquareCoil Companion Lab is open in isolated ${options.browser}.\n`);
    process.stdout.write('No live SquareCoil page, login, cookie, or clock request can leave this profile.\n');
    process.stdout.write('Close the lab browser window when finished.\n\n');

    process.once('SIGINT', () => { void cleanup(); });
    process.once('SIGTERM', () => { void cleanup(); });
    await new Promise(resolve => context.on('close', resolve));
  } finally {
    await cleanup();
  }
}

main().catch(error => {
  process.stderr.write(`SquareCoil Companion Lab failed: ${error.stack || error.message}\n`);
  process.exitCode = 1;
});
