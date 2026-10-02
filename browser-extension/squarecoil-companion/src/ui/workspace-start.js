'use strict';

const DEFAULT_RETRY_DELAYS_MS = Object.freeze([250, 1000, 3000]);

function createWorkspaceStarter(options = {}) {
  const ui = options.ui;
  const document = options.document;
  const rootId = String(options.rootId || 'ussign-job-timer');
  const retryDelays = Array.isArray(options.retryDelays) ? [...options.retryDelays] : [...DEFAULT_RETRY_DELAYS_MS];
  const setTimer = options.setTimer || globalThis.setTimeout;
  const clearTimer = options.clearTimer || globalThis.clearTimeout;
  if (!ui || typeof ui.start !== 'function') throw new Error('workspace-start-ui-required');
  let retryTimer = null;
  let retired = false;
  let state = 'IDLE';
  let lastReason = null;

  function showStartFailure() {
    const root = document?.getElementById?.(rootId) || null;
    if (!root) return;
    root.dataset.workspaceStartState = 'FAILED';
    root.dataset.workspaceStartReason = 'workspace-start-failed';
    const status = root.querySelector?.('[data-sc-lifecycle-fallback-status]');
    if (status) status.textContent = 'Companion workspace could not start. Reload this SquareCoil page to try again.';
  }

  async function start(attempt = 0) {
    if (retired) return snapshot();
    state = attempt === 0 ? 'STARTING' : 'RETRYING';
    try {
      await ui.start();
      state = 'STARTED';
      lastReason = null;
    } catch (error) {
      lastReason = String(error?.message || error || 'workspace-start-failed');
      if (attempt >= retryDelays.length) {
        state = 'FAILED';
        showStartFailure();
      } else {
        state = 'RETRY_SCHEDULED';
        retryTimer = setTimer(() => {
          retryTimer = null;
          void start(attempt + 1);
        }, retryDelays[attempt]);
      }
    }
    return snapshot();
  }

  function retire() {
    if (retired) return snapshot();
    retired = true;
    state = 'RETIRED';
    if (retryTimer !== null) clearTimer(retryTimer);
    retryTimer = null;
    return snapshot();
  }

  function snapshot() {
    return Object.freeze({ state, lastReason, retired, retryPending: retryTimer !== null });
  }

  return Object.freeze({ start, retire, snapshot });
}

module.exports = { DEFAULT_RETRY_DELAYS_MS, createWorkspaceStarter };
