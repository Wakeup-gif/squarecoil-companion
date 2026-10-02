'use strict';

const AUDITED_PATH = '/ajax_time_clock.php';
const NATIVE_ACTIONS = new Set([2, 3, 4]);

function bodyParameters(requestBody) {
  if (requestBody?.formData && typeof requestBody.formData === 'object') {
    return new Map(Object.entries(requestBody.formData).map(([key, values]) => [key, String(values?.[0] ?? '')]));
  }
  const bytes = requestBody?.raw?.[0]?.bytes;
  if (!bytes) return new Map();
  try {
    return new URLSearchParams(new TextDecoder().decode(bytes));
  } catch (_) {
    return new Map();
  }
}

function createNativeCompletionObserver(options = {}) {
  const webRequest = options.webRequest;
  const onCompletion = options.onCompletion;
  const now = options.now || (() => Date.now());
  const pending = new Map();
  if (!webRequest?.onBeforeRequest?.addListener || !webRequest?.onCompleted?.addListener ||
      !webRequest?.onErrorOccurred?.addListener || typeof onCompletion !== 'function') {
    return Object.freeze({ available: false, teardown() {}, snapshot: () => ({ available: false, pending: 0 }) });
  }

  function before(details) {
    let url;
    try { url = new URL(details.url); } catch (_) { return; }
    if (url.pathname !== AUDITED_PATH || details.method !== 'POST' || details.tabId < 0) return;
    const parameters = bodyParameters(details.requestBody);
    const nativeAction = Number(parameters.get('action'));
    if (!NATIVE_ACTIONS.has(nativeAction)) return;
    pending.set(details.requestId, Object.freeze({
      requestId: String(details.requestId),
      tabId: details.tabId,
      documentId: String(details.documentId || ''),
      nativeAction,
      requestProjectId: parameters.get('project_id') || parameters.get('project') || null,
      requestDepartment: parameters.get('department') || null
    }));
  }

  function completed(details) {
    const request = pending.get(details.requestId);
    pending.delete(details.requestId);
    if (!request || details.statusCode < 200 || details.statusCode >= 300) return;
    Promise.resolve(onCompletion({ ...request, completedAtMs: now() })).catch(() => {});
  }

  function failed(details) { pending.delete(details.requestId); }
  const filter = { urls: [`https://ussignandmill.squarecoil.net${AUDITED_PATH}*`], types: ['xmlhttprequest'] };
  webRequest.onBeforeRequest.addListener(before, filter, ['requestBody']);
  webRequest.onCompleted.addListener(completed, filter);
  webRequest.onErrorOccurred.addListener(failed, filter);
  return Object.freeze({
    available: true,
    teardown() {
      webRequest.onBeforeRequest.removeListener(before);
      webRequest.onCompleted.removeListener(completed);
      webRequest.onErrorOccurred.removeListener(failed);
      pending.clear();
    },
    snapshot: () => ({ available: true, pending: pending.size })
  });
}

module.exports = { AUDITED_PATH, NATIVE_ACTIONS, bodyParameters, createNativeCompletionObserver };
