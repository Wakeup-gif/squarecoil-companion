'use strict';

const ROOT = '#ussign-job-timer';
const DASHBOARD = '#squarecoil-companion-analytics';

function check(condition, message, proof) {
  if (!condition) throw new Error(`${message}: ${JSON.stringify(proof)}`);
}

async function settled(page, timeout, diagnostic) {
  const predicate = () => {
    const root = document.querySelector('#ussign-job-timer');
    return root?.dataset.workspaceState === 'loaded' && root.dataset.busy === 'false';
  };
  if (diagnostic) {
    await waitForDashboardStage(page, predicate, diagnostic.stage, timeout, diagnostic.readDiagnosticState);
  } else {
    await page.waitForFunction(predicate, null, { timeout });
  }
}

async function home(page, timeout, diagnostic) {
  await settled(page, timeout, diagnostic && { ...diagnostic, stage: `${diagnostic.stage}: opening` });
  const expand = page.locator(`${ROOT} [data-action="expand"]`);
  if (await expand.count()) await expand.click();
  if (await page.locator(ROOT).getAttribute('data-proto-collapsed') === 'true') {
    await page.locator(`${ROOT} [data-action="collapse"]`).click();
  }
  const close = page.locator(`${ROOT} [data-action="settings-close"]`);
  if (await close.count()) await close.click();
  const main = page.locator(`${ROOT} [data-action="view"][data-view="main"]`);
  if (await main.count()) await main.first().click();
  await settled(page, timeout, diagnostic && { ...diagnostic, stage: `${diagnostic.stage}: ready` });
}

async function settingsRoute(page, group, view, timeout, diagnostic) {
  await home(page, timeout, diagnostic && { ...diagnostic, stage: `${diagnostic.stage}: home` });
  await page.locator(`${ROOT} .sc-proto-topbar [data-action="view"][data-view="settings"]`).click();
  const toggle = page.locator(`${ROOT} [data-action="settings-toggle-group"][data-group="${group}"]`);
  await toggle.waitFor({ state: 'visible', timeout });
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await page.locator(`${ROOT} [data-action="settings-route"][data-view="${view}"]`).click();
  await settled(page, timeout, diagnostic && { ...diagnostic, stage: `${diagnostic.stage}: destination ready` });
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

async function waitForDashboardStage(page, predicate, stage, timeout, readDiagnosticState) {
  try {
    await page.waitForFunction(predicate, null, { timeout });
  } catch (error) {
    const dom = await page.evaluate(() => {
      const root = document.querySelector('#ussign-job-timer');
      const dashboard = document.querySelector('#squarecoil-companion-analytics');
      const choice = action => Array.from(root?.querySelectorAll(`[data-action="${action}"]`) || [])
        .map(node => ({ value: node.dataset.value, active: node.dataset.active, disabled: node.disabled }));
      return {
        url: location.href,
        readyState: document.readyState,
        companion: root ? {
          workspaceState: root.dataset.workspaceState,
          busy: root.dataset.busy,
          collapsed: root.dataset.protoCollapsed,
          visibleError: root.querySelector('.sc-error')?.textContent?.trim() || null,
          dashboardChoices: choice('preference-dashboard'),
          appearanceChoices: choice('preference-dashboard-appearance')
        } : null,
        nativeAnchors: ['#content', '#widget-tasks', '#widget-designs', '#widget-estimates']
          .map(selector => ({ selector, present: Boolean(document.querySelector(selector)) })),
        analytics: dashboard ? {
          count: document.querySelectorAll('#squarecoil-companion-analytics').length,
          theme: dashboard.dataset.theme,
          owned: dashboard.dataset.squarecoilCompanionOwned,
          shadow: Boolean(dashboard.shadowRoot),
          periodControl: Boolean(dashboard.shadowRoot?.querySelector('[data-action="period"]'))
        } : null
      };
    }).catch(snapshotError => ({ error: String(snapshotError?.message || snapshotError) }));
    if (dom?.companion?.visibleError) {
      try {
        await page.locator('#ussign-job-timer [data-action="open-diagnostics"]').first().click({ timeout: 2000 });
        const raw = await page.locator('#ussign-job-timer [data-sc-advanced-diagnostics]').textContent({ timeout: 2000 });
        dom.lastTechnicalError = JSON.parse(raw || '{}').lastTechnicalError || null;
      } catch (diagnosticError) {
        dom.technicalErrorCapture = String(diagnosticError?.message || diagnosticError);
      }
    }
    const core = readDiagnosticState
      ? await Promise.resolve().then(readDiagnosticState).catch(snapshotError => ({ error: String(snapshotError?.message || snapshotError) }))
      : null;
    const failure = new Error(`Dashboard ${stage}: ${error.message}`, { cause: error });
    failure.details = { stage, dom, core };
    throw failure;
  }
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
  const viewCurrent = page.locator(`${ROOT} .sc-total-area .sc-view-current[data-action="select"]`);
  const totalRow = await page.evaluate(() => {
    const button = document.querySelector('#ussign-job-timer .sc-total-area .sc-view-current');
    const total = document.querySelector('#ussign-job-timer .sc-metric-total');
    const action = button?.getBoundingClientRect();
    const metric = total?.getBoundingClientRect();
    return { buttonRight: action?.right, totalLeft: metric?.left,
      buttonBottom: action?.bottom, totalBottom: metric?.bottom };
  });
  check(totalRow.buttonRight <= totalRow.totalLeft - 12 &&
    Math.abs(totalRow.buttonBottom - totalRow.totalBottom) <= 6,
  'View current is not aligned beside Job total', totalRow);
  if (screenshot) await page.screenshot({ path: screenshot, fullPage: false, animations: 'disabled' });
  await viewCurrent.click();
  await page.waitForFunction(context =>
    document.querySelector('#ussign-job-timer .sc-tab[data-selected="true"]')?.dataset.context === context,
  original.selected, { timeout });
  check(await page.locator(`${ROOT} .sc-current-strip`).count() === 0 &&
    JSON.stringify(before) === JSON.stringify(await readBoundary()),
  'View current did not return to the running job without changing timer state');
  return { fixtureId: 'PI-UI-001', original, inspected, totalRow, canonicalBoundaryUnchanged: true };
}

async function verifyUiPolish({ page, timeout, motionExpected = true }) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await home(page, timeout);
  const strip = page.locator(`${ROOT} .sc-tabs`);
  await strip.evaluate(node => { node.scrollLeft = 0; });
  const initialTabs = await page.evaluate(() => {
    const root = document.querySelector('#ussign-job-timer');
    const tabs = root.querySelector('.sc-tabs');
    return { scroll: tabs.scrollLeft, overflow: tabs.scrollWidth - tabs.clientWidth,
      offsets: [...tabs.querySelectorAll('.sc-tab-slot')].map(node => node.offsetLeft),
      selected: root.querySelector('.sc-tab[data-selected="true"]')?.dataset.context,
      operational: root.querySelector('.sc-tab[data-operational="true"]')?.dataset.context,
      nextContext: root.querySelector('.sc-tab[data-selected="true"]')?.closest('.sc-tab-slot')?.nextElementSibling?.dataset.context,
      previousHidden: root.querySelector('.sc-tab-cycle-prev').hidden,
      nextHidden: root.querySelector('.sc-tab-cycle-next').hidden,
      nextOpacity: Number.parseFloat(getComputedStyle(root.querySelector('.sc-tab-cycle-next')).opacity) };
  });
  check(initialTabs.overflow > 2 && !initialTabs.previousHidden && !initialTabs.nextHidden && initialTabs.nextOpacity > .5,
    'Overflow tabs did not show the cycle controls', initialTabs);
  const nextTab = page.locator(`${ROOT} .sc-tab-cycle-next`);
  await nextTab.click();
  await page.waitForTimeout(420);
  const cycledTabs = await page.evaluate(() => ({
    scroll: document.querySelector('#ussign-job-timer .sc-tabs').scrollLeft,
    selected: document.querySelector('#ussign-job-timer .sc-tab[data-selected="true"]')?.dataset.context,
    operational: document.querySelector('#ussign-job-timer .sc-tab[data-operational="true"]')?.dataset.context,
    previousHidden: document.querySelector('#ussign-job-timer .sc-tab-cycle-prev').hidden
  }));
  check(cycledTabs.selected === initialTabs.nextContext && cycledTabs.operational === initialTabs.operational &&
    cycledTabs.scroll > 20 && !cycledTabs.previousHidden,
  'Tab cycling did not select the next job and reveal it', { initialTabs, cycledTabs });
  await page.mouse.move(100, 200);
  const previousTab = page.locator(`${ROOT} .sc-tab-cycle-prev`);
  const beforeLeftHover = await strip.evaluate(node => node.scrollLeft);
  await previousTab.hover();
  await page.waitForTimeout(300);
  const afterLeftHover = await strip.evaluate(node => node.scrollLeft);
  check(afterLeftHover < beforeLeftHover - 6, 'Hovering over the left edge did not move the tabs', { beforeLeftHover, afterLeftHover });
  await page.mouse.move(100, 200);
  const beforeHover = await strip.evaluate(node => node.scrollLeft);
  await nextTab.hover();
  await page.waitForTimeout(300);
  const afterHover = await strip.evaluate(node => node.scrollLeft);
  check(afterHover > beforeHover + 2, 'Hovering over the right edge did not move the tabs', { beforeHover, afterHover });
  await page.mouse.move(100, 200);
  const tools = page.locator(`${ROOT} .sc-quick-links`);
  if (await tools.getAttribute('open') !== null) await tools.locator('summary').click();
  const toolsTarget = await tools.locator('summary').boundingBox();
  check(toolsTarget?.height >= 44, 'More tools has an inaccessible click target', toolsTarget);
  await tools.locator('summary').click();
  await page.waitForTimeout(1200);
  check(await tools.getAttribute('open') !== null && await tools.locator('.sc-tool-buttons').isVisible(),
    'Timer refresh closed More tools');
  const toolRows = await tools.evaluate(node => {
    const summary = node.querySelector('summary')?.getBoundingClientRect();
    const buttons = node.querySelector('.sc-tool-buttons')?.getBoundingClientRect();
    const search = node.querySelector('[data-sc-search-form]')?.getBoundingClientRect();
    return { summary: summary && { top: summary.top, bottom: summary.bottom },
      buttons: buttons && { top: buttons.top, bottom: buttons.bottom },
      search: search && { top: search.top, bottom: search.bottom } };
  });
  check(toolRows.buttons?.top >= toolRows.summary?.bottom - 1 && toolRows.search?.top >= toolRows.buttons?.bottom - 1,
    'More tools did not place Search below Jobs, Overview and History', toolRows);
  await tools.locator('summary').click();
  const icons = await page.locator(`${ROOT} .sc-proto-topbar .sc-ui-icon`).evaluateAll(nodes => nodes.map(node => {
    const bounds = node.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height };
  }));
  check(icons.length === 3 && icons.every(icon => icon.width === 18 && icon.height === 18), 'Toolbar SVG geometry is distorted', icons);
  await page.locator(`${ROOT} .sc-proto-topbar [data-view="settings"]`).click();
  try {
    await page.waitForFunction(() => {
      const view = document.querySelector('#ussign-job-timer .sc-view');
      return view?.dataset.scViewKey === 'settings:ready';
    }, null, { timeout });
  } catch (_) {
    const state = await page.evaluate(() => {
      const root = document.querySelector('#ussign-job-timer');
      const view = root?.querySelector('.sc-view');
      return { viewKey: view?.dataset.scViewKey, animation: view && getComputedStyle(view).animationName,
        rootView: root?.dataset.protoView, busy: root?.dataset.busy, workspaceState: root?.dataset.workspaceState,
        settingsGroups: root?.querySelectorAll('.sc-settings-group').length,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
    });
    throw new Error(`Settings route or motion did not settle: ${JSON.stringify(state)}`);
  }
  await page.waitForFunction(() => document.querySelector('#ussign-job-timer').getBoundingClientRect().width <= 371, null, { timeout });
  const menu = await page.evaluate(() => {
    const root = document.querySelector('#ussign-job-timer');
    const cards = [...root.querySelectorAll('.sc-settings-group')].map(node => node.getBoundingClientRect());
    return { width: root.getBoundingClientRect().width, vertical: cards.every((box, index) => index === 0 || box.top >= cards[index - 1].bottom),
      closeVisible: root.querySelector('[data-action="settings-close"]').getBoundingClientRect().width > 0 };
  });
  check(menu.vertical && menu.closeVisible, 'Settings lost its vertical layout or close control', menu);
  const appearance = page.locator(`${ROOT} [data-action="settings-toggle-group"][data-group="appearance"]`);
  await page.evaluate(() => {
    window.__scDisclosureProof = null;
    document.addEventListener('click', event => {
      if (!event.target.closest('#ussign-job-timer [data-action="settings-toggle-group"][data-group="appearance"]')) return;
      const before = document.querySelector('#ussign-job-timer .sc-settings-group[data-group="appearance"]')?.getBoundingClientRect().height;
      setTimeout(() => {
        const group = document.querySelector('#ussign-job-timer .sc-settings-group[data-group="appearance"]');
        window.__scDisclosureProof = {
          before, after: group?.getBoundingClientRect().height,
          heightAnimation: group?.getAnimations().some(animation => animation.effect?.getKeyframes?.().some(frame => frame.height)),
          panelAnimation: getComputedStyle(group.querySelector('.sc-settings-group-panel')).animationName
        };
      }, 0);
    }, { capture: true });
  });
  await appearance.click();
  await page.waitForFunction(() => window.__scDisclosureProof !== null, null, { timeout });
  const disclosureMotion = await page.evaluate(() => window.__scDisclosureProof);
  if (motionExpected) check(disclosureMotion.heightAnimation && disclosureMotion.panelAnimation.includes('sc-panel-slide'),
    'Settings disclosure snapped instead of sliding open', disclosureMotion);
  const view = await page.locator(`${ROOT} .sc-view`).elementHandle();
  const before = await view.evaluate(node => ({ key: node.dataset.scViewKey, animation: getComputedStyle(node).animationName }));
  await page.waitForTimeout(1200);
  const after = await view.evaluate(node => ({ connected: node.isConnected, key: node.dataset.scViewKey, animation: getComputedStyle(node).animationName }));
  check(before.key === 'settings:ready' && after.connected && before.key === after.key &&
    (!motionExpected || (before.animation.includes('sc-copy-resolve') && before.animation === after.animation)),
  'Timer refresh replayed route motion or replaced the view', { before, after });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await page.evaluate(() => ({
    animation: getComputedStyle(document.querySelector('#ussign-job-timer .sc-view')).animationName,
    transition: getComputedStyle(document.querySelector('#ussign-job-timer')).transitionDuration
  }));
  if (motionExpected) check(reduced.animation === 'none' && reduced.transition === '0s', 'Reduced motion still animates the dock', reduced);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await view.dispose();
  await home(page, timeout);
  const viewCurrent = page.locator(`${ROOT} .sc-total-area .sc-view-current[data-action="select"]`);
  if (await viewCurrent.count()) {
    const alignment = await page.evaluate(() => {
      const button = document.querySelector('#ussign-job-timer .sc-total-area .sc-view-current');
      const total = document.querySelector('#ussign-job-timer .sc-metric-total');
      const action = button?.getBoundingClientRect();
      const metric = total?.getBoundingClientRect();
      return { buttonRight: action?.right, totalLeft: metric?.left,
        buttonBottom: action?.bottom, totalBottom: metric?.bottom };
    });
    check(alignment.buttonRight <= alignment.totalLeft - 12 &&
      Math.abs(alignment.buttonBottom - alignment.totalBottom) <= 6,
    'View current is not aligned beside Job total', alignment);
    await viewCurrent.click();
  }
  check(await page.locator(`${ROOT} .sc-current-strip`).count() === 0, 'Current job is duplicated above its timer card');
  await page.locator(`${ROOT} .sc-timer-card [data-action="context-detail"]`).click();
  const detailsBack = page.locator(`${ROOT} .sc-view-head [data-action="view"][data-view="main"][aria-label="Back"]`);
  await detailsBack.waitFor({ state: 'visible', timeout });
  await detailsBack.click();
  check(await page.locator(`${ROOT} .sc-timer-card`).isVisible() &&
    await page.locator(`${ROOT} [data-sc-view-heading]`).filter({ hasText: 'Time Overview' }).count() === 0,
  'Details Back did not return directly to the timer');
  return { initialTabs, cycledTabs, icons, before, after, reduced };
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
  sidebarRowScreenshot, narrowRowScreenshot, expectedLabels = [], beforeNavigate, afterNavigate, readDiagnosticState }) {
  const diagnostic = stage => ({ stage, readDiagnosticState });
  const boundaryBefore = await readBoundary();
  const startUrl = page.url();
  if (beforeNavigate) await beforeNavigate();
  await page.goto(`${origin}/dashboard.php?show=2`, { waitUntil: 'domcontentloaded' });
  if (afterNavigate) await afterNavigate();
  await settled(page, timeout, diagnostic('initial dashboard page settlement'));
  const nativeBefore = await nativeDashboardSnapshot(page);
  check(nativeBefore.every(item => item.html && item.visible), 'Dashboard fixture omitted native mount/cleanup anchors', nativeBefore);
  check(await page.locator(DASHBOARD).count() === 0, 'Dashboard is not off by default');
  await settingsRoute(page, 'features', 'dashboard', timeout, diagnostic('open analytics settings to enable'));
  await page.locator(`${ROOT} [data-action="preference-dashboard"][data-value="true"]`).click();
  await waitForDashboardStage(page, () => Boolean(document.querySelector('#squarecoil-companion-analytics')?.shadowRoot?.querySelector('[data-action="period"]')),
    'initial analytics mount', timeout, readDiagnosticState);
  await settled(page, timeout, diagnostic('analytics enabled preference settlement'));
  await home(page, timeout, diagnostic('return home after enabling analytics'));
  const enabled = await dashboardSnapshot(page);
  check(enabled.count === 1 && enabled.owned === 'analytics-dashboard' && enabled.shadow,
    'Dashboard did not mount as one owned isolated surface', enabled);
  for (const label of expectedLabels) check(enabled.text.includes(label), 'Dashboard omitted a canonical Context label', { label, text: enabled.text });
  check(JSON.stringify(await nativeDashboardSnapshot(page)) === JSON.stringify(nativeBefore), 'Enabling dashboard changed native content or controls');

  const host = page.locator(DASHBOARD);
  await settingsRoute(page, 'features', 'dashboard', timeout, diagnostic('open analytics appearance settings'));
  const appearanceBefore = await page.evaluate(() => ({
    website: document.documentElement.getAttribute('data-squarecoil-companion-site-theme'),
    companion: document.querySelector('#ussign-job-timer')?.dataset.protoTheme,
    finish: document.querySelector('#ussign-job-timer')?.dataset.protoSurface
  }));
  await page.locator(`${ROOT} [data-action="preference-dashboard-appearance"][data-value="DARK"]`).click();
  await waitForDashboardStage(page, () => document.querySelector('#squarecoil-companion-analytics')?.dataset.theme === 'dark',
    'dark appearance', timeout, readDiagnosticState);
  const appearanceAfter = await page.evaluate(() => ({
    website: document.documentElement.getAttribute('data-squarecoil-companion-site-theme'),
    companion: document.querySelector('#ussign-job-timer')?.dataset.protoTheme,
    finish: document.querySelector('#ussign-job-timer')?.dataset.protoSurface
  }));
  check(JSON.stringify(appearanceBefore) === JSON.stringify(appearanceAfter), 'Dashboard appearance changed Companion or website preferences', { appearanceBefore, appearanceAfter });
  await page.locator(`${ROOT} [data-action="preference-dashboard-appearance"][data-value="LIGHT"]`).click();
  await waitForDashboardStage(page, () => document.querySelector('#squarecoil-companion-analytics')?.dataset.theme === 'light',
    'light appearance', timeout, readDiagnosticState);
  await page.locator(`${ROOT} [data-action="preference-dashboard-appearance"][data-value="SITE"]`).click();
  await settled(page, timeout, diagnostic('website appearance reset settlement'));
  await home(page, timeout, diagnostic('return home before analytics interaction'));
  // The floating Companion is deliberately collapsible so website controls
  // remain reachable. Use that real control before testing the dashboard.
  await page.locator(`${ROOT} [data-action="collapse"]`).click();
  await waitForDashboardStage(page, () => document.querySelector('#ussign-job-timer')?.dataset.protoCollapsed === 'true',
    'Companion collapse before dashboard interaction', timeout, readDiagnosticState);
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
  await settingsRoute(page, 'features', 'dashboard', timeout);
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
  await settingsRoute(page, 'features', 'design-dashboard', timeout);
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

  await settingsRoute(page, 'features', 'design-dashboard', timeout);
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

module.exports = { verifySelectedContext, verifyDashboardJourney, verifyDesignProfileJourney, verifyUiPolish, dashboardSnapshot };
