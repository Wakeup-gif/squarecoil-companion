'use strict';

const ROOT = '#ussign-job-timer';
const DASHBOARD = '#squarecoil-companion-analytics';

function check(condition, message, proof) {
  if (!condition) throw new Error(`${message}: ${JSON.stringify(proof)}`);
}

async function settled(page, timeout) {
  await page.waitForFunction(() => {
    const root = document.querySelector('#ussign-job-timer');
    return root?.dataset.workspaceState === 'loaded' && root.dataset.busy === 'false';
  }, null, { timeout });
}

async function home(page, timeout) {
  await settled(page, timeout);
  const expand = page.locator(`${ROOT} [data-action="expand"]`);
  if (await expand.count()) await expand.click();
  if (await page.locator(ROOT).getAttribute('data-proto-collapsed') === 'true') {
    await page.locator(`${ROOT} [data-action="collapse"]`).click();
  }
  const close = page.locator(`${ROOT} [data-action="settings-close"]`);
  if (await close.count()) await close.click();
  const main = page.locator(`${ROOT} [data-action="view"][data-view="main"]`);
  if (await main.count()) await main.first().click();
  await settled(page, timeout);
}

async function settingsRoute(page, group, view, timeout) {
  await home(page, timeout);
  await page.locator(`${ROOT} .sc-proto-topbar [data-action="view"][data-view="settings"]`).click();
  const toggle = page.locator(`${ROOT} [data-action="settings-toggle-group"][data-group="${group}"]`);
  await toggle.waitFor({ state: 'visible', timeout });
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await page.locator(`${ROOT} [data-action="settings-route"][data-view="${view}"]`).click();
  await settled(page, timeout);
}

async function nativeDashboardSnapshot(page) {
  return page.evaluate(() => {
    const selectors = ['#widget-tasks', '#widget-designs', '#widget-estimates', '#page-content'];
    return selectors.map(selector => {
      const node = document.querySelector(selector);
      return { selector, html: node?.outerHTML || null, visible: Boolean(node && node.getClientRects().length),
        links: Array.from(node?.querySelectorAll('a') || []).map(link => link.getAttribute('href')),
        disabled: Array.from(node?.querySelectorAll('button,input,select') || []).map(control => control.disabled) };
    });
  });
}

async function dashboardSnapshot(page) {
  return page.evaluate(() => {
    const host = document.querySelector('#squarecoil-companion-analytics');
    const shadow = host?.shadowRoot;
    const rect = host?.getBoundingClientRect();
    return {
      count: document.querySelectorAll('#squarecoil-companion-analytics').length,
      owned: host?.getAttribute('data-squarecoil-companion-owned') || null,
      shadow: Boolean(shadow), text: Array.from(shadow?.children || []).filter(node => node.tagName !== 'STYLE').map(node => node.textContent).join('\n'),
      canvasCount: shadow?.querySelectorAll('canvas,svg').length || 0,
      hostAttributes: host ? Object.fromEntries(Array.from(host.attributes).map(attr => [attr.name, attr.value])) : {},
      rect: rect ? { left: rect.left, right: rect.right, top: rect.top, width: rect.width } : null,
      viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      hostScrollWidth: host?.scrollWidth || 0,
      widestShadowElements: Array.from(shadow?.querySelectorAll('*') || []).map(node => {
        const bounds = node.getBoundingClientRect();
        return { tag: node.tagName, className: String(node.className || ''), left: bounds.left, right: bounds.right, width: bounds.width };
      }).filter(bounds => bounds.right > innerWidth + 1).slice(0, 8),
      pageOverflow: document.documentElement.scrollWidth > innerWidth + 1
    };
  });
}

async function verifySelectedContext({ page, timeout, readBoundary, screenshot }) {
  await home(page, timeout);
  const before = await readBoundary();
  const original = await page.evaluate(() => ({
    selected: document.querySelector('#ussign-job-timer .sc-tab[data-selected="true"]')?.dataset.context,
    operational: document.querySelector('#ussign-job-timer .sc-tab[data-operational="true"]')?.dataset.context,
    native: document.querySelector('#clockin-remaining-time')?.textContent.trim(),
    actions: document.querySelector('#metric-actions')?.textContent
  }));
  check(original.operational === 'job:910002', 'Expected canonical operational fictional job before inspection', original);
  await page.locator(`${ROOT} .sc-tab[data-context="job:910001"]`).evaluate(node => node.scrollIntoView({ block: 'nearest', inline: 'center' }));
  await page.locator(`${ROOT} .sc-tab[data-context="job:910001"]`).click({ force: true });
  await page.waitForFunction(() => document.querySelector('#ussign-job-timer .sc-tab[data-selected="true"]')?.dataset.context === 'job:910001', null, { timeout });
  const inspected = await page.evaluate(() => ({
    selected: document.querySelector('#ussign-job-timer .sc-tab[data-selected="true"]')?.dataset.context,
    operational: document.querySelector('#ussign-job-timer .sc-tab[data-operational="true"]')?.dataset.context,
    native: document.querySelector('#clockin-remaining-time')?.textContent.trim(),
    actions: document.querySelector('#metric-actions')?.textContent,
    currentStrip: document.querySelector('#ussign-job-timer .sc-current-strip')?.textContent.trim(),
    timerControls: Array.from(document.querySelectorAll('#ussign-job-timer [data-timer-action]')).map(node => node.dataset.timerAction)
  }));
  const after = await readBoundary();
  check(inspected.selected === 'job:910001' && inspected.operational === original.operational &&
    inspected.native === original.native && inspected.actions === original.actions &&
    JSON.stringify(before) === JSON.stringify(after), 'Selecting a historical tab changed operational timing or native state', { before, after, original, inspected });
  if (screenshot) await page.screenshot({ path: screenshot, fullPage: false, animations: 'disabled' });
  await page.locator(`${ROOT} .sc-tab[data-context="${original.selected}"]`).evaluate(node => node.scrollIntoView({ block: 'nearest', inline: 'center' }));
  await page.locator(`${ROOT} .sc-tab[data-context="${original.selected}"]`).click({ force: true });
  return { fixtureId: 'PI-UI-001', original, inspected, canonicalBoundaryUnchanged: true };
}

async function captureDashboardRow(page, screenshot) {
  const row = page.locator(`${DASHBOARD}`).locator('.job-row').first();
  await row.evaluate(node => {
    const bounds = node.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + bounds.top - Math.max(110, (innerHeight - bounds.height) / 2), behavior: 'instant' });
  });
  const action = row.locator('[data-action="archive"], [data-action="restore"]').first();
  await action.hover();
  const proof = await action.evaluate(node => {
    const bounds = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const shadow = node.getRootNode();
    const target = shadow.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    return { action: node.dataset.action, disabled: node.disabled, text: node.textContent.trim(),
      left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom,
      width: bounds.width, height: bounds.height, viewport: { width: innerWidth, height: innerHeight },
      visible: style.display !== 'none' && style.visibility !== 'hidden', receivesPointer: target === node || node.contains(target) };
  });
  check(proof.visible && proof.receivesPointer && proof.width > 0 && proof.height > 0 && proof.left >= 0 &&
    proof.right <= proof.viewport.width && proof.top >= 0 && proof.bottom <= proof.viewport.height,
  'Dashboard row action is clipped or unreachable', proof);
  if (screenshot) await row.screenshot({ path: screenshot, animations: 'disabled' });
  return proof;
}

async function verifyDashboardJourney({ page, origin, timeout, readBoundary, screenshot, narrowScreenshot, sidebarScreenshot,
  sidebarRowScreenshot, narrowRowScreenshot, expectedLabels = [], beforeNavigate, afterNavigate }) {
  const boundaryBefore = await readBoundary();
  const startUrl = page.url();
  if (beforeNavigate) await beforeNavigate();
  await page.goto(`${origin}/dashboard.php?show=2`, { waitUntil: 'domcontentloaded' });
  if (afterNavigate) await afterNavigate();
  await settled(page, timeout);
  const nativeBefore = await nativeDashboardSnapshot(page);
  check(nativeBefore.every(item => item.html && item.visible), 'Dashboard fixture omitted native mount/cleanup anchors', nativeBefore);
  check(await page.locator(DASHBOARD).count() === 0, 'Dashboard is not off by default');
  await settingsRoute(page, 'appearance', 'dashboard', timeout);
  await page.locator(`${ROOT} [data-action="preference-dashboard"][data-value="true"]`).click();
  await page.waitForFunction(() => Boolean(document.querySelector('#squarecoil-companion-analytics')?.shadowRoot?.querySelector('[data-action="period"]')), null, { timeout });
  await settled(page, timeout);
  await home(page, timeout);
  const enabled = await dashboardSnapshot(page);
  check(enabled.count === 1 && enabled.owned === 'analytics-dashboard' && enabled.shadow,
    'Dashboard did not mount as one owned isolated surface', enabled);
  for (const label of expectedLabels) check(enabled.text.includes(label), 'Dashboard omitted a canonical Context label', { label, text: enabled.text });
  check(JSON.stringify(await nativeDashboardSnapshot(page)) === JSON.stringify(nativeBefore), 'Enabling dashboard changed native content or controls');

  const host = page.locator(DASHBOARD);
  await settingsRoute(page, 'appearance', 'dashboard', timeout);
  const appearanceBefore = await page.evaluate(() => ({
    website: document.documentElement.getAttribute('data-squarecoil-companion-site-theme'),
    companion: document.querySelector('#ussign-job-timer')?.dataset.protoTheme,
    finish: document.querySelector('#ussign-job-timer')?.dataset.protoSurface
  }));
  await page.locator(`${ROOT} [data-action="preference-dashboard-appearance"][data-value="DARK"]`).click();
  await page.waitForFunction(() => document.querySelector('#squarecoil-companion-analytics')?.dataset.theme === 'dark', null, { timeout });
  const appearanceAfter = await page.evaluate(() => ({
    website: document.documentElement.getAttribute('data-squarecoil-companion-site-theme'),
    companion: document.querySelector('#ussign-job-timer')?.dataset.protoTheme,
    finish: document.querySelector('#ussign-job-timer')?.dataset.protoSurface
  }));
  check(JSON.stringify(appearanceBefore) === JSON.stringify(appearanceAfter), 'Dashboard appearance changed Companion or website preferences', { appearanceBefore, appearanceAfter });
  await page.locator(`${ROOT} [data-action="preference-dashboard-appearance"][data-value="LIGHT"]`).click();
  await page.waitForFunction(() => document.querySelector('#squarecoil-companion-analytics')?.dataset.theme === 'light', null, { timeout });
  await page.locator(`${ROOT} [data-action="preference-dashboard-appearance"][data-value="SITE"]`).click();
  await settled(page, timeout);
  await home(page, timeout);
  // The floating Companion is deliberately collapsible so website controls
  // remain reachable. Use that real control before testing the dashboard.
  await page.locator(`${ROOT} [data-action="collapse"]`).click();
  await page.waitForFunction(() => document.querySelector('#ussign-job-timer')?.dataset.protoCollapsed === 'true', null, { timeout });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await host.locator('[data-action="period"][data-period="week"]').click();
  await host.locator('[data-action="chart-mode"][data-value="line"]').click();
  await host.locator('[data-action="scope"][data-value="history"]').click();
  const interaction = await dashboardSnapshot(page);
  check(interaction.count === 1 && interaction.canvasCount > 0 &&
    await host.locator('[data-action="period"][data-period="week"]').getAttribute('aria-pressed') === 'true' &&
    await host.locator('[data-action="chart-mode"][data-value="line"]').getAttribute('aria-pressed') === 'true' &&
    await host.locator('[data-action="scope"][data-value="history"]').getAttribute('aria-pressed') === 'true',
  'Dashboard graph interactions failed to update visible controls and chart', interaction);
  await host.locator('[data-chart-job]').first().focus();
  const tooltip = await host.locator('[role="tooltip"]:visible').first().innerText();
  check(tooltip.trim().length > 0, 'Keyboard chart focus did not reveal the per-job tooltip', { tooltip });
  if (screenshot) await host.screenshot({ path: screenshot, animations: 'disabled' });

  const desktop = page.viewportSize();
  await host.locator('[data-action="scope"][data-value="tracked"]').click();
  await page.setViewportSize({ width: 900, height: 760 });
  const sidebarWidth = await dashboardSnapshot(page);
  if (sidebarScreenshot) await page.screenshot({ path: sidebarScreenshot, fullPage: false, animations: 'disabled' });
  check(sidebarWidth.rect?.width > 0 && sidebarWidth.rect.left >= -1 && sidebarWidth.rect.right <= 901 && !sidebarWidth.pageOverflow,
    'Dashboard overflowed the available width beside the website sidebar', sidebarWidth);
  const sidebarRow = await captureDashboardRow(page, sidebarRowScreenshot);
  await page.setViewportSize({ width: 390, height: 844 });
  await host.evaluate(node => window.scrollTo({ top: window.scrollY + node.getBoundingClientRect().top - 110, behavior: 'instant' }));
  const narrow = await dashboardSnapshot(page);
  if (narrowScreenshot) await page.screenshot({ path: narrowScreenshot, fullPage: false, animations: 'disabled' });
  check(narrow.rect?.width > 0 && narrow.rect.left >= -1 && narrow.rect.right <= 391 && !narrow.pageOverflow,
    'Dashboard overflowed a narrow viewport', narrow);
  const narrowRow = await captureDashboardRow(page, narrowRowScreenshot);
  if (desktop) await page.setViewportSize(desktop);

  if (beforeNavigate) await beforeNavigate();
  await page.reload({ waitUntil: 'domcontentloaded' });
  if (afterNavigate) await afterNavigate();
  await settled(page, timeout);
  await page.waitForSelector(DASHBOARD, { timeout });
  check(await page.locator(DASHBOARD).count() === 1, 'Dashboard preference did not restore one root after reload');
  await page.evaluate(() => { history.pushState({}, '', '/dashboard.php?show=1'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await page.waitForFunction(() => !document.querySelector('#squarecoil-companion-analytics'), null, { timeout });
  check(JSON.stringify(await nativeDashboardSnapshot(page)) === JSON.stringify(nativeBefore), 'Route cleanup altered native dashboard');
  await page.evaluate(() => { history.pushState({}, '', '/dashboard.php?show=2'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await page.waitForSelector(DASHBOARD, { timeout });
  check(await page.locator(DASHBOARD).count() === 1, 'Returning to dashboard duplicated its root');
  await settingsRoute(page, 'appearance', 'dashboard', timeout);
  await page.locator(`${ROOT} [data-action="preference-dashboard"][data-value="false"]`).click();
  await page.waitForFunction(() => !document.querySelector('#squarecoil-companion-analytics'), null, { timeout });
  check(JSON.stringify(await nativeDashboardSnapshot(page)) === JSON.stringify(nativeBefore), 'Disabling dashboard failed to restore native page');
  const boundaryAfter = await readBoundary();
  check(JSON.stringify(boundaryBefore) === JSON.stringify(boundaryAfter), 'Dashboard journey changed Timer/Ledger authority', { boundaryBefore, boundaryAfter });
  if (beforeNavigate) await beforeNavigate();
  await page.goto(startUrl, { waitUntil: 'domcontentloaded' });
  if (afterNavigate) await afterNavigate();
  await settled(page, timeout);
  return { fixtureIds: ['PI-DASH-001', 'PI-DASH-002', 'PI-THEME-001'], enabled, interaction, sidebarWidth, narrow, sidebarRow, narrowRow, tooltip,
    dashboardAppearanceIndependent: true,
    restoredAfterReload: true, removedOnRouteChange: true, nativeContentUnchanged: true, canonicalBoundaryUnchanged: true };
}

async function verifyDesignProfileJourney({ page, origin, timeout, readBoundary, screenshot, beforeNavigate, afterNavigate }) {
  const boundaryBefore = await readBoundary();
  const startUrl = page.url();
  if (beforeNavigate) await beforeNavigate();
  await page.goto(`${origin}/dashboard.php?show=2`, { waitUntil: 'domcontentloaded' });
  if (afterNavigate) await afterNavigate();
  await settled(page, timeout);
  const nativeBefore = await nativeDashboardSnapshot(page);
  const profile = '#squarecoil-companion-design-dashboard-profile';
  const summary = '#squarecoil-companion-dashboard-summary';
  check(await page.locator(profile).count() === 0 && await page.locator(summary).count() === 0,
    'Design Dashboard restyle must be off by default');

  await settingsRoute(page, 'appearance', 'website-theme', timeout);
  await page.locator(`${ROOT} [data-action="preference-site"][data-value="SLEEK_DARK"]`).click();
  await settled(page, timeout);
  await settingsRoute(page, 'appearance', 'design-dashboard', timeout);
  await page.locator(`${ROOT} [data-action="preference-design-dashboard"][data-value="ON"]`).click();
  await page.waitForFunction(() => document.documentElement.getAttribute('data-squarecoil-companion-dashboard-profile') === 'active' &&
    document.querySelectorAll('#squarecoil-companion-design-dashboard-profile').length === 1, null, { timeout });
  check(await page.locator(summary).count() === 1, 'Design Dashboard summary did not mount once');
  check(JSON.stringify(await nativeDashboardSnapshot(page)) === JSON.stringify(nativeBefore),
    'Design Dashboard restyle changed native values, controls or order');
  await home(page, timeout);
  if (screenshot) await page.screenshot({ path: screenshot });

  await page.evaluate(() => { history.pushState({}, '', '/dashboard.php?show=1'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await page.waitForFunction(() => !document.querySelector('#squarecoil-companion-design-dashboard-profile') &&
    !document.querySelector('#squarecoil-companion-dashboard-summary'), null, { timeout });
  await page.evaluate(() => { history.pushState({}, '', '/dashboard.php?show=2'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-squarecoil-companion-dashboard-profile') === 'active' &&
    document.querySelectorAll('#squarecoil-companion-design-dashboard-profile').length === 1, null, { timeout });
  check(await page.locator(profile).count() === 1 && await page.locator(summary).count() === 1,
    'Design Dashboard restyle duplicated on route return');

  await settingsRoute(page, 'appearance', 'design-dashboard', timeout);
  await page.locator(`${ROOT} [data-action="preference-design-dashboard"][data-value="OFF"]`).click();
  await page.waitForFunction(() => !document.querySelector('#squarecoil-companion-design-dashboard-profile') &&
    !document.querySelector('#squarecoil-companion-dashboard-summary'), null, { timeout });
  await settingsRoute(page, 'appearance', 'website-theme', timeout);
  await page.locator(`${ROOT} [data-action="preference-site"][data-value="ORIGINAL"]`).click();
  await settled(page, timeout);
  check(JSON.stringify(await nativeDashboardSnapshot(page)) === JSON.stringify(nativeBefore),
    'Disabling Design Dashboard restyle failed to preserve native content');
  const boundaryAfter = await readBoundary();
  check(JSON.stringify(boundaryBefore) === JSON.stringify(boundaryAfter),
    'Design Dashboard restyle changed Timer/Ledger authority', { boundaryBefore, boundaryAfter });
  if (beforeNavigate) await beforeNavigate();
  await page.goto(startUrl, { waitUntil: 'domcontentloaded' });
  if (afterNavigate) await afterNavigate();
  await settled(page, timeout);
  return { fixtureIds: ['PI-DESIGN-001'], defaultOff: true, exactRouteOnly: true,
    profileLayerCount: 1, nativeContentUnchanged: true, canonicalBoundaryUnchanged: true };
}

module.exports = { verifySelectedContext, verifyDashboardJourney, verifyDesignProfileJourney, dashboardSnapshot };
