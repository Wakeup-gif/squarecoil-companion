'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const GET_APPEARANCE = 'SC_COMPANION_GET_APPEARANCE';
const SET_APPEARANCE = 'SC_COMPANION_SET_APPEARANCE';
const EXTENSION_ID = 'squarecoil-test-extension';

function appearanceHandlerSource() {
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/content/controller.js'), 'utf8');
  const start = source.indexOf('  function onAuthorityControl(');
  const end = source.indexOf('\n  if (chrome.runtime.onMessage', start);
  assert.ok(start >= 0 && end > start, 'the content message handler must remain testable');
  return source.slice(start, end);
}

function harness() {
  const calls = { preferences: [], nativeClock: 0, timer: 0, storageRead: 0 };
  const timer = { currentContextId: 'job-123', todayMs: 84_000, revision: 9 };
  const preferences = { websiteTheme: 'SLEEK_DARK', cinematicBackground: 'CINEMATIC', preferenceRevision: 4 };
  const trustedCore = {
    snapshot() { return { timer: { ...timer }, preferences: { ...preferences } }; },
    async preferenceCommand(patch, expectedRevision) {
      calls.preferences.push({ patch: { ...patch }, expectedRevision });
      if (expectedRevision !== preferences.preferenceRevision) throw new Error('preference-revision-conflict');
      Object.assign(preferences, patch);
      preferences.preferenceRevision += 1;
    },
    timerAction() { calls.timer += 1; throw new Error('timer-action-must-not-run'); },
    nativeClock() { calls.nativeClock += 1; throw new Error('native-clock-must-not-run'); }
  };
  const chrome = { runtime: { id: EXTENSION_ID }, storage: { local: {
    async get() { calls.storageRead += 1; return { companionPanelVisible: false }; }
  } } };
  const handler = vm.runInNewContext(`(() => {${appearanceHandlerSource()}\nreturn onAuthorityControl;})()`, {
    chrome, trustedCore, POPUP_GET_APPEARANCE_MESSAGE: GET_APPEARANCE,
    POPUP_SET_APPEARANCE_MESSAGE: SET_APPEARANCE
  }, { filename: 'src/content/controller.js:onAuthorityControl' });

  function send(message, sender = { id: EXTENSION_ID }) {
    let returned;
    const response = new Promise(resolve => { returned = handler(message, sender, resolve); });
    return { returned, response };
  }
  return { calls, timer, preferences, send };
}

test('UT-B5-POPUP-008 appearance messages reject non-extension senders before reading or changing preferences', async () => {
  const h = harness();
  for (const message of [
    { type: GET_APPEARANCE },
    { type: SET_APPEARANCE, patch: { websiteTheme: 'LIGHT_GLASS' }, expectedPreferenceRevision: 4 }
  ]) {
    const request = h.send(message, { id: 'untrusted-page' });
    assert.equal(request.returned, false);
    assert.equal((await request.response).reason, 'extension-sender-required');
  }
  assert.equal(h.calls.storageRead, 0);
  assert.equal(h.calls.preferences.length, 0);
  assert.equal(h.preferences.preferenceRevision, 4);
});

test('UT-B5-POPUP-009 appearance accepts only one allowlisted field and a current preference revision', async () => {
  const h = harness();
  for (const message of [
    { type: SET_APPEARANCE, patch: { timerEnabled: false }, expectedPreferenceRevision: 4 },
    { type: SET_APPEARANCE, patch: { websiteTheme: 'LIGHT_GLASS', cinematicBackground: 'NONE' }, expectedPreferenceRevision: 4 },
    { type: SET_APPEARANCE, patch: { websiteTheme: 'LIGHT_GLASS' } }
  ]) {
    const request = h.send(message);
    assert.equal(request.returned, true);
    assert.equal((await request.response).reason, 'appearance-command-invalid');
  }
  const stale = await h.send({ type: SET_APPEARANCE, patch: { websiteTheme: 'LIGHT_GLASS' },
    expectedPreferenceRevision: 3 }).response;
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'preference-revision-conflict');
  assert.equal(h.preferences.websiteTheme, 'SLEEK_DARK');
  assert.equal(h.preferences.preferenceRevision, 4);
  assert.equal(h.calls.preferences.length, 1);
  assert.equal(h.calls.storageRead, 0);
});

test('UT-B5-POPUP-010 revisioned theme/photo changes leave Timer and native SquareCoil untouched', async () => {
  const h = harness();
  const beforeTimer = { ...h.timer };
  const read = await h.send({ type: GET_APPEARANCE }).response;
  assert.equal(read.ok, true);
  assert.equal(read.preferences.websiteTheme, 'SLEEK_DARK');
  assert.equal(read.preferences.cinematicBackground, 'CINEMATIC');
  assert.equal(read.preferences.preferenceRevision, 4);
  assert.equal(read.panelVisible, false);

  const photo = await h.send({ type: SET_APPEARANCE, patch: { cinematicBackground: 'NONE' },
    expectedPreferenceRevision: 4 }).response;
  assert.equal(photo.ok, true);
  assert.equal(photo.preferences.cinematicBackground, 'NONE');
  assert.equal(photo.preferences.preferenceRevision, 5);
  const theme = await h.send({ type: SET_APPEARANCE, patch: { websiteTheme: 'LIGHT_GLASS' },
    expectedPreferenceRevision: 5 }).response;
  assert.equal(theme.ok, true);
  assert.equal(theme.preferences.websiteTheme, 'LIGHT_GLASS');
  assert.equal(theme.preferences.preferenceRevision, 6);
  assert.equal(JSON.stringify(h.calls.preferences), JSON.stringify([
    { patch: { cinematicBackground: 'NONE' }, expectedRevision: 4 },
    { patch: { websiteTheme: 'LIGHT_GLASS' }, expectedRevision: 5 }
  ]));
  assert.deepEqual(h.timer, beforeTimer);
  assert.equal(h.calls.timer, 0);
  assert.equal(h.calls.nativeClock, 0);
});
