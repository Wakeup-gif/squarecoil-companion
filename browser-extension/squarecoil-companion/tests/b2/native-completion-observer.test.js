'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createNativeCompletionObserver } = require('../../src/extension/native-completion-observer');

function eventSurface() {
  let listener = null;
  return { addListener(value) { listener = value; }, removeListener(value) { if (listener === value) listener = null; },
    emit(value) { listener?.(value); }, get attached() { return Boolean(listener); } };
}

test('UT-B2-NATIVE-001 production webRequest observer emits only successful audited completions with request identity', async () => {
  const before = eventSurface();
  const completed = eventSurface();
  const failed = eventSurface();
  const evidence = [];
  const observer = createNativeCompletionObserver({ webRequest: { onBeforeRequest: before, onCompleted: completed,
    onErrorOccurred: failed }, now: () => 9_000, onCompletion: value => evidence.push(value) });
  assert.equal(observer.available, true);
  const base = { requestId: 'request-stable-1', tabId: 3, documentId: 'document-native-1', method: 'POST',
    url: 'https://ussignandmill.squarecoil.net/ajax_time_clock.php', type: 'xmlhttprequest',
    requestBody: { formData: { action: ['2'] } } };
  before.emit(base);
  assert.equal(evidence.length, 0);
  completed.emit({ ...base, statusCode: 500 });
  assert.equal(evidence.length, 0);
  before.emit(base);
  completed.emit({ ...base, statusCode: 200 });
  completed.emit({ ...base, statusCode: 200 });
  await Promise.resolve();
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].requestId, 'request-stable-1');
  assert.equal(evidence[0].nativeAction, 2);
  assert.equal(evidence[0].completedAtMs, 9_000);
  observer.teardown();
  assert.equal(before.attached, false);
});
