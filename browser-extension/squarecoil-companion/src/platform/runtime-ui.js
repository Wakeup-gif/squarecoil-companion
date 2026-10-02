'use strict';

const ROOT_ID = 'ussign-job-timer';
const ROOT_MARKER = 'rebuild';
const PROBE_EVENT = 'squarecoil-companion:interaction-probe';

function createRuntimeUi(options = {}) {
  const doc = options.document || document;
  const runtimeInstanceId = String(options.runtimeInstanceId || 'runtime-unknown');
  const buildId = String(options.buildId || 'build-unknown');
  const packageVersion = String(options.packageVersion || '0.0.0');
  const candidateFingerprint = String(options.candidateFingerprint || 'candidate-unknown');
  const documentToken = String(options.documentToken || 'document-unknown');
  let root = null;
  let boundRoot = null;

  function interactionHandler(event) {
    const detail = event && event.detail;
    if (!detail || !detail.token) return;
    detail.ackRuntimeInstanceId = runtimeInstanceId;
    detail.ackToken = detail.token;
  }

  function createRoot() {
    const host = doc.body || doc.documentElement;
    if (!host) throw new Error('timer root host unavailable');
    const element = doc.createElement('section');
    element.id = ROOT_ID;
    element.dataset.squarecoilCompanionRoot = ROOT_MARKER;
    element.dataset.runtimeInstanceId = runtimeInstanceId;
    element.dataset.buildId = buildId;
    element.dataset.packageVersion = packageVersion;
    element.dataset.candidateFingerprint = candidateFingerprint;
    element.dataset.documentToken = documentToken;
    element.setAttribute('role', 'status');
    element.setAttribute('aria-live', 'polite');
    element.style.cssText = [
      'position:fixed',
      'right:18px',
      'bottom:18px',
      'z-index:2147483000',
      'max-width:320px',
      'padding:10px 12px',
      'border-radius:12px',
      'background:#1f252b',
      'color:#f5f7f8',
      'font:13px/1.35 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'box-shadow:0 10px 30px rgba(0,0,0,.22)'
    ].join(';');
    element.innerHTML = '<strong>SquareCoil Companion</strong><div data-sc-lifecycle-fallback-status>Starting Companion…</div>';
    host.appendChild(element);
    return element;
  }

  function unbind() {
    if (boundRoot) {
      boundRoot.removeEventListener(PROBE_EVENT, interactionHandler);
    }
    boundRoot = null;
  }

  function bind() {
    if (!root) return;
    if (boundRoot === root) return;
    unbind();
    root.addEventListener(PROBE_EVENT, interactionHandler);
    boundRoot = root;
  }

  function probeInteraction() {
    if (!root || !root.isConnected || boundRoot !== root) return false;
    const token = `${runtimeInstanceId}:${Date.now()}:${Math.random()}`;
    const detail = { token, ackToken: null, ackRuntimeInstanceId: null };
    const EventCtor = (doc.defaultView && doc.defaultView.CustomEvent) || CustomEvent;
    root.dispatchEvent(new EventCtor(PROBE_EVENT, { detail }));
    return detail.ackToken === token && detail.ackRuntimeInstanceId === runtimeInstanceId;
  }

  async function ensure() {
    const roots = [...doc.querySelectorAll(`#${ROOT_ID}`)];
    for (const marked of doc.querySelectorAll(`[data-squarecoil-companion-root="${ROOT_MARKER}"]`)) {
      if (!roots.includes(marked)) roots.push(marked);
    }
    if (root && root.isConnected && !roots.includes(root)) {
      if (roots.length > 0) throw new Error('ownership-conflict:known-root-and-canonical-root');
      // The owned node is still connected, so retain its resource identity and
      // repair the canonical selector instead of abandoning it and leaking a
      // second root.
      root.id = ROOT_ID;
      roots.push(root);
    }
    if (roots.length > 1) throw new Error('ownership-conflict:multiple-timer-roots');

    if (roots.length === 1) {
      const existing = roots[0];
      if (existing.dataset.squarecoilCompanionRoot !== ROOT_MARKER) {
        throw new Error('ownership-conflict:foreign-timer-root');
      }
      const knownOwnedRoot = existing === root;
      if (!knownOwnedRoot && !existing.dataset.runtimeInstanceId) {
        throw new Error('ownership-conflict:root-runtime-identity-missing');
      }
      if (!knownOwnedRoot && !existing.dataset.buildId) {
        throw new Error('ownership-conflict:root-build-identity-missing');
      }
      if (!knownOwnedRoot && !existing.dataset.packageVersion) {
        throw new Error('ownership-conflict:root-package-version-missing');
      }
      if (!knownOwnedRoot && !existing.dataset.candidateFingerprint) {
        throw new Error('ownership-conflict:root-candidate-identity-missing');
      }
      if (!knownOwnedRoot && !existing.dataset.documentToken) {
        throw new Error('ownership-conflict:root-document-identity-missing');
      }
      if (existing.dataset.runtimeInstanceId && existing.dataset.runtimeInstanceId !== runtimeInstanceId) {
        throw new Error('ownership-conflict:root-owned-by-another-runtime');
      }
      if (existing.dataset.buildId && existing.dataset.buildId !== buildId) {
        throw new Error('ownership-conflict:root-build-mismatch');
      }
      if (existing.dataset.packageVersion && existing.dataset.packageVersion !== packageVersion) {
        throw new Error('version-mismatch:root-package-version');
      }
      if (existing.dataset.candidateFingerprint && existing.dataset.candidateFingerprint !== candidateFingerprint) {
        throw new Error('version-mismatch:root-candidate-fingerprint');
      }
      if (existing.dataset.documentToken && existing.dataset.documentToken !== documentToken) {
        throw new Error('ownership-conflict:root-document-mismatch');
      }
      root = existing;
      root.id = ROOT_ID;
    } else {
      root = createRoot();
    }

    root.dataset.runtimeInstanceId = runtimeInstanceId;
    root.dataset.buildId = buildId;
    root.dataset.packageVersion = packageVersion;
    root.dataset.candidateFingerprint = candidateFingerprint;
    root.dataset.documentToken = documentToken;
    bind();
    if (!probeInteraction()) {
      unbind();
      bind();
    }

    return {
      rootCount: 1,
      owned: true,
      interactionReady: probeInteraction(),
      teardownRegistered: true
    };
  }

  function setLifecycle(snapshot) {
    if (!root || !snapshot) return;
    root.dataset.lifecycleState = snapshot.state || 'UNKNOWN';
    root.dataset.lifecycleReason = snapshot.reason || '';
    const status = root.querySelector('[data-sc-lifecycle-fallback-status]');
    if (status) {
      status.textContent = snapshot.state === 'READY'
        ? 'Companion is ready.'
        : snapshot.state === 'FAILED'
          ? 'Companion needs attention. Open the extension for details.'
          : 'Companion is reconnecting. No SquareCoil data was changed.';
    }
  }

  async function teardown() {
    unbind();
    if (root && root.isConnected) root.remove();
    root = null;
  }

  function snapshot() {
    return {
      rootPresent: Boolean(root && root.isConnected),
      interactionReady: probeInteraction(),
      runtimeInstanceId,
      buildId,
      packageVersion,
      candidateFingerprint,
      documentToken
    };
  }

  return { ensure, teardown, setLifecycle, snapshot, probeInteraction };
}

module.exports = { ROOT_ID, ROOT_MARKER, PROBE_EVENT, createRuntimeUi };
