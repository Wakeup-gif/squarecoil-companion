'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const projectRoot = path.resolve(__dirname, '..', '..');
const tokensPath = path.join(projectRoot, 'docs', 'figma', 'squarecoil-companion.tokens.json');

function assertDimension(value, pathLabel, units) {
  assert.equal(typeof value, 'object', `${pathLabel} must use a structured value`);
  assert.equal(typeof value.value, 'number', `${pathLabel}.value must be numeric`);
  assert.ok(units.includes(value.unit), `${pathLabel}.unit must be ${units.join(' or ')}`);
}

function assertColor(value, pathLabel) {
  assert.equal(value?.colorSpace, 'srgb', `${pathLabel} must use sRGB`);
  assert.equal(value?.components?.length, 3, `${pathLabel} needs three components`);
  for (const component of value.components) assert.ok(typeof component === 'number' && component >= 0 && component <= 1);
  if (value.alpha !== undefined) assert.ok(typeof value.alpha === 'number' && value.alpha >= 0 && value.alpha <= 1);
  if (value.hex !== undefined) assert.match(value.hex, /^#[0-9a-f]{6}$/i);
}

function assertShadow(value, pathLabel) {
  const layers = Array.isArray(value) ? value : [value];
  assert.ok(layers.length > 0);
  for (const [index, layer] of layers.entries()) {
    assertColor(layer.color, `${pathLabel}[${index}].color`);
    for (const key of ['offsetX', 'offsetY', 'blur', 'spread']) assertDimension(layer[key], `${pathLabel}[${index}].${key}`, ['px', 'rem']);
  }
}

function assertDtcgNode(node, pathParts = [], inheritedType = null) {
  assert.ok(node && typeof node === 'object' && !Array.isArray(node));
  const type = node.$type || inheritedType;
  if (Object.prototype.hasOwnProperty.call(node, '$value')) {
    const pathLabel = pathParts.join('.');
    const value = node.$value;
    if (typeof value === 'string' && /^\{[^{}]+\}$/.test(value)) return;
    assert.equal(typeof type, 'string', `${pathLabel} needs a type or typed parent`);
    if (type === 'color') assertColor(value, pathLabel);
    else if (type === 'dimension') assertDimension(value, pathLabel, ['px', 'rem']);
    else if (type === 'duration') assertDimension(value, pathLabel, ['ms', 's']);
    else if (type === 'number') assert.equal(typeof value, 'number');
    else if (type === 'shadow') assertShadow(value, pathLabel);
    else if (type === 'fontFamily') assert.ok(typeof value === 'string' || (Array.isArray(value) && value.every(item => typeof item === 'string')));
    else assert.fail(`${pathLabel} uses an untested token type: ${type}`);
    return;
  }
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    assertDtcgNode(child, [...pathParts, key], type);
  }
}

test('UT-B5-FIGMA-001 handoff tokens remain aligned with the implemented Companion shell and tab geometry', () => {
  const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
  const source = fs.readFileSync(path.join(projectRoot, 'src', 'ui', 'workspace-ui.js'), 'utf8');
  assert.equal(tokens.size.companionWidth.$value.value, 460);
  assert.equal(tokens.size.companionCollapsedNoTabsWidth.$value.value, 292);
  assert.equal(tokens.size.tabStripHeight.$value.value, 43);
  assert.equal(tokens.size.tabHeight.$value.value, 40);
  for (const value of ['#f5f8fb', '#17212c', '#347fbd', '#0e151c', '#eef5fb', '#61aef7', '#d9a51f', '#d97820']) {
    assert.match(source, new RegExp(value));
  }
  assert.match(source, /width:460px!important/);
  assert.match(source, /width:292px!important/);
  assert.match(source, /height:43px;display:flex/);
  assert.match(source, /height:40px;display:grid/);
  assert.match(source, /var\(--sc-bg\) 84%,transparent/);
  assert.match(source, /blur\(18px\) saturate\(120%\)/);
  assert.equal(tokens.effect.glassBackgroundMix.$value, 0.84);
  assert.equal(tokens.effect.glassBlur.$value.value, 18);
  assert.equal(tokens.effect.glassSaturation.$value, 1.2);
});

test('UT-B5-FIGMA-002 handoff explicitly preserves integrated runtime Bing themes and fail-closed Archive states', () => {
  const matrix = fs.readFileSync(path.join(projectRoot, 'docs', 'figma', 'COMPONENT-STATE-MATRIX.md'), 'utf8');
  const audit = fs.readFileSync(path.join(projectRoot, 'docs', 'UI-AUDIT-AND-FIGMA-HANDOFF.md'), 'utf8');
  assert.match(matrix, /Tabs are siblings above the framed shell/);
  assert.match(matrix, /stale-revision, or recovery-protected/);
  assert.match(matrix, /760 px and below/);
  assert.match(matrix, /automatically clears after 8 seconds/);
  assert.match(matrix, /Companion color/);
  assert.match(matrix, /Companion finish/);
  assert.match(matrix, /Loading, Remote, Cache Fresh/);
  assert.match(matrix, /do not generate or package replacement background art/i);
  assert.match(audit, /integrated Bing-or-gradient background/);
  assert.match(audit, /Figma preparation does not replace browser acceptance/);
});

test('UT-B5-FIGMA-003 handoff tokens conform to the stable DTCG 2025.10 value shapes', () => {
  const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
  assert.equal(tokens.$schema, 'https://www.designtokens.org/schemas/2025.10/format.json');
  assert.equal('meta' in tokens, false);
  assert.equal(typeof tokens.$extensions?.['com.squarecoil.companion']?.runtimeWallpaper, 'string');
  assertDtcgNode(tokens);
  for (const required of [
    tokens.effect.shellShadowLight,
    tokens.effect.shellShadowDark,
    tokens.effect.tabShadow,
    tokens.effect.selectedTabShadow,
    tokens.color.threshold.yellow,
    tokens.color.threshold.orange,
    tokens.color.archiveVeil.eligible,
    tokens.color.archiveVeil.blocked
  ]) assert.ok(required?.$value);
});
