'use strict';

const { BUILD_ID, BUILD_STAGE, CANDIDATE_FINGERPRINT } = require('../core/build-identity');
const { ROOT_ID, createWorkspaceUi } = require('./workspace-ui');
const { createWorkspaceStarter } = require('./workspace-start');

const SEARCH_INPUT_SELECTOR = `#${ROOT_ID} [data-sc-search-form] input[name="projectId"]`;
const SEARCH_FORM_SELECTOR = `#${ROOT_ID} [data-sc-search-form]`;

function createSearchFocusGuard() {
  let active = false;
  let value = '';
  let selectionStart = null;
  let selectionEnd = null;

  function remember(event) {
    const input = event.target?.closest?.(SEARCH_INPUT_SELECTOR);
    if (!input) return;
    active = true;
    value = input.value;
    selectionStart = input.selectionStart;
    selectionEnd = input.selectionEnd;
  }

  function releaseWhenLeaving(event) {
    if (!event.target?.closest?.(SEARCH_FORM_SELECTOR)) active = false;
  }

  function releaseOnSubmit(event) {
    if (event.target?.matches?.(SEARCH_FORM_SELECTOR)) active = false;
  }

  function restore() {
    if (!active) return;
    const input = document.querySelector(SEARCH_INPUT_SELECTOR);
    if (!input) return;
    if (input.value !== value) input.value = value;
    if (document.activeElement !== input) input.focus({ preventScroll: true });
    if (Number.isInteger(selectionStart) && Number.isInteger(selectionEnd)) {
      try { input.setSelectionRange(selectionStart, selectionEnd); } catch (_) {}
    }
  }

  document.addEventListener('focusin', remember, true);
  document.addEventListener('input', remember, true);
  document.addEventListener('keyup', remember, true);
  document.addEventListener('pointerdown', releaseWhenLeaving, true);
  document.addEventListener('submit', releaseOnSubmit, true);

  const observer = new MutationObserver(restore);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  return () => {
    observer.disconnect();
    document.removeEventListener('focusin', remember, true);
    document.removeEventListener('input', remember, true);
    document.removeEventListener('keyup', remember, true);
    document.removeEventListener('pointerdown', releaseWhenLeaving, true);
    document.removeEventListener('submit', releaseOnSubmit, true);
  };
}

(function startPrototypeWorkspace() {
  if (window.top !== window) return;
  void CANDIDATE_FINGERPRINT;

  const releaseSearchFocusGuard = createSearchFocusGuard();
  const ui = createWorkspaceUi({
    document,
    window,
    storage: chrome.storage.local,
    storageChanges: chrome.storage.onChanged,
    packageVersion: chrome.runtime.getManifest().version,
    buildId: BUILD_ID,
    buildStage: BUILD_STAGE,
    candidateFingerprint: CANDIDATE_FINGERPRINT,
    userAgent: window.navigator?.userAgent || '',
    getCoreHandle: () => globalThis.__squareCoilCompanionAuthorityHealth || null
  });

  let retired = false;
  const workspaceStarter = createWorkspaceStarter({ ui, document, rootId: ROOT_ID });
  void workspaceStarter.start();
  window.addEventListener('pagehide', event => {
    if (event.persisted === true || retired) return;
    retired = true;
    workspaceStarter.retire();
    releaseSearchFocusGuard();
    ui.teardown();
  });
})();
