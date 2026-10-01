'use strict';

const ROOT = '#ussign-job-timer';
const HOST = '#squarecoil-companion-quick-file-paths';

function check(condition, message, proof = {}) {
  if (!condition) throw new Error(`${message}: ${JSON.stringify(proof)}`);
}

async function settled(page, timeout) {
  await page.waitForFunction(() => {
    const root = document.querySelector('#ussign-job-timer');
    return root?.dataset.workspaceState === 'loaded' && root.dataset.busy === 'false';
  }, null, { timeout });
}

async function settingsRoute(page, view, timeout) {
  await settled(page, timeout);
  const close = page.locator(`${ROOT} [data-action="settings-close"]`);
  if (await close.count()) await close.click();
  const expand = page.locator(`${ROOT} [data-action="expand"]`);
  if (await expand.count()) await expand.click();
  if (await page.locator(ROOT).getAttribute('data-proto-collapsed') === 'true') {
    await page.locator(`${ROOT} [data-action="collapse"]`).click();
  }
  await page.locator(`${ROOT} .sc-proto-topbar [data-action="view"][data-view="settings"]`).click();
  const features = page.locator(`${ROOT} [data-action="settings-toggle-group"][data-group="features"]`);
  await features.waitFor({ state: 'visible', timeout });
  if (await features.getAttribute('aria-expanded') !== 'true') await features.click();
  await page.locator(`${ROOT} [data-action="settings-route"][data-view="${view}"]`).click();
  await settled(page, timeout);
}

async function toolbarSnapshot(page) {
  return page.evaluate(() => {
    const hosts = [...document.querySelectorAll('#squarecoil-companion-quick-file-paths')];
    const shadow = hosts[0]?.shadowRoot;
    return {
      count: hosts.length,
      owned: hosts[0]?.getAttribute('data-squarecoil-companion-owned') || null,
      paths: shadow?.querySelectorAll('.value.path').length || 0,
      copies: shadow?.querySelectorAll('button.action').length || 0,
      links: [...(shadow?.querySelectorAll('a.action') || [])].map(anchor => ({
        href: anchor.href, target: anchor.target, rel: anchor.rel
      }))
    };
  });
}

async function verifyQuickToolsJourney({ page, origin, timeout = 30_000, readBoundary }) {
  check(typeof readBoundary === 'function', 'Quick tools journey requires the canonical boundary reader');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  const startBoundary = await readBoundary();
  const startActions = await page.locator('#metric-actions').innerText();

  await page.goto(`${origin}/project_designs.php`, { waitUntil: 'domcontentloaded' });
  await settingsRoute(page, 'quick-file-paths', timeout);
  check(await page.locator(HOST).count() === 0, 'Quick files appeared before opt-in');
  await page.locator(`${ROOT} [data-action="preference-quick-files"][data-value="true"]`).click();
  await page.locator(HOST).waitFor({ state: 'visible', timeout });
  const design = await toolbarSnapshot(page);
  const designLinks = new Set(design.links.map(link => link.href));
  check(design.count === 1 && design.owned === 'quick-file-paths' && design.paths === 2 && design.copies === 2 &&
    design.links.length === 2 &&
    designLinks.has(`${origin}/__companion_lab__/index.html?reference=check-set`) &&
    designLinks.has(`${origin}/__companion_lab__/index.html?reference=survey`) &&
    design.links.every(link => link.target === '_blank' && link.rel.includes('noopener') && link.rel.includes('noreferrer')),
  'Design quick files did not combine Description and Important Details with bounded Copy/Open controls', design);
  const designCopies = new Set();
  const designPathRows = page.locator(`${HOST} .row:has(.value.path)`);
  for (let index = 0; index < await designPathRows.count(); index += 1) {
    const row = designPathRows.nth(index);
    const expected = await row.locator('.value.path').innerText();
    await row.locator('button.action').click();
    await page.waitForFunction(value => navigator.clipboard.readText().then(copied => copied === value), expected, { timeout });
    designCopies.add(expected);
  }
  check(designCopies.has('C:\\Lab Jobs\\910001\\Design') && designCopies.has('\\\\lab-files\\jobs\\910001'),
    'Design route omitted a fictional path source');

  const [opened] = await Promise.all([
    page.waitForEvent('popup', { timeout }),
    page.locator(`${HOST} a.action[href*="reference=check-set"]`).click()
  ]);
  await opened.waitForLoadState('domcontentloaded', { timeout });
  check(opened.url() === `${origin}/__companion_lab__/index.html?reference=check-set`,
    'Quick Open did not use the validated fictional HTTP(S) destination');
  await opened.close();

  await page.goto(`${origin}/project.php?id=910001`, { waitUntil: 'domcontentloaded' });
  await settled(page, timeout);
  await page.locator(HOST).waitFor({ state: 'visible', timeout });
  const project = await toolbarSnapshot(page);
  check(project.count === 1 && project.paths === 1 && project.copies === 1 && project.links.length === 1 &&
    project.links[0].href === `${origin}/__companion_lab__/index.html?reference=survey`,
  'Project Important Details quick files did not render from the exact notes field', project);
  await page.locator(`${HOST} button.action`).click();
  await page.waitForFunction(() => document.querySelector('#squarecoil-companion-quick-file-paths')?.shadowRoot?.querySelector('.status')?.textContent === 'Copied', null, { timeout });
  const projectCopied = await page.evaluate(() => navigator.clipboard.readText());
  check(projectCopied === '\\\\lab-files\\jobs\\910001', 'Project folder Copy returned the wrong fictional field');

  await settingsRoute(page, 'quick-clock', timeout);
  check(await page.locator(`${ROOT} .sc-proto-topbar [data-action="open-native-clock"]`).count() === 0,
    'Quick clock shortcut appeared before opt-in');
  await page.locator(`${ROOT} [data-action="preference-quick-clock"][data-value="true"]`).click();
  await settled(page, timeout);
  await page.locator(`${ROOT} [data-action="settings-close"]`).click();
  const shortcut = page.locator(`${ROOT} .sc-proto-topbar [data-action="open-native-clock"]`);
  await shortcut.waitFor({ state: 'visible', timeout });
  const nativeBefore = await page.evaluate(() => {
    window.__quickClockNativeClicks = 0;
    for (const selector of ['#clockin', '#clockout']) {
      document.querySelector(selector)?.addEventListener('click', () => { window.__quickClockNativeClicks += 1; });
    }
    return { actions: document.querySelector('#metric-actions')?.textContent,
      clock: document.querySelector('#clockin-remaining-time')?.textContent };
  });
  await shortcut.click();
  const nativeAfter = await page.evaluate(() => ({
    focused: document.activeElement?.id || null,
    expected: document.querySelector('#clockin')?.hidden ? 'clockout' : 'clockin',
    clicks: window.__quickClockNativeClicks,
    actions: document.querySelector('#metric-actions')?.textContent,
    clock: document.querySelector('#clockin-remaining-time')?.textContent
  }));
  check(nativeAfter.focused === nativeAfter.expected && nativeAfter.clicks === 0 &&
    nativeAfter.actions === nativeBefore.actions && nativeAfter.clock === nativeBefore.clock,
  'Quick clock shortcut activated or changed SquareCoil clock state', { nativeBefore, nativeAfter });

  await settingsRoute(page, 'quick-clock', timeout);
  await page.locator(`${ROOT} [data-action="preference-quick-clock"][data-value="false"]`).click();
  await page.waitForFunction(() => !document.querySelector('#ussign-job-timer .sc-proto-topbar [data-action="open-native-clock"]'), null, { timeout });
  await settingsRoute(page, 'quick-file-paths', timeout);
  await page.locator(`${ROOT} [data-action="preference-quick-files"][data-value="false"]`).click();
  await page.locator(HOST).waitFor({ state: 'detached', timeout });
  const endBoundary = await readBoundary();
  const endActions = await page.locator('#metric-actions').innerText();
  check(JSON.stringify(endBoundary) === JSON.stringify(startBoundary) && endActions === startActions,
    'Quick tools changed canonical Timer/Ledger or native SquareCoil actions');
  await page.goto(`${origin}/__companion_lab__/index.html`, { waitUntil: 'domcontentloaded' });
  await settled(page, timeout);
  return { fixtureId: 'PI-TOOLS-001', design, project, copiedPaths: 3,
    openedSafeLink: true, nativeClockClicks: 0, canonicalBoundaryUnchanged: true,
    disabledCleanup: true };
}

module.exports = { verifyQuickToolsJourney };
