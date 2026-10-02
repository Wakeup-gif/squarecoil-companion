'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isSupportedSquareCoilUrl,
  isTopLevelWindow,
  isSupportedTopLevelContext,
  isConcreteDocumentToken
} = require('../../src/core/document-eligibility');

test('B1-LC-013 accepts only the exact HTTPS SquareCoil origin', () => {
  assert.equal(isSupportedSquareCoilUrl('https://ussignandmill.squarecoil.net/'), true);
  assert.equal(isSupportedSquareCoilUrl('https://ussignandmill.squarecoil.net/jobs/123?tab=time'), true);
  assert.equal(isSupportedSquareCoilUrl('http://ussignandmill.squarecoil.net/'), false);
  assert.equal(isSupportedSquareCoilUrl('https://evil.ussignandmill.squarecoil.net/'), false);
  assert.equal(isSupportedSquareCoilUrl('https://ussignandmill.squarecoil.net.evil.example/'), false);
  assert.equal(isSupportedSquareCoilUrl('not-a-url'), false);
});

test('B1-LC-013 rejects an iframe even when its URL is supported', () => {
  const top = { location: { href: 'https://ussignandmill.squarecoil.net/jobs/1' } };
  top.top = top;
  const frame = { location: { href: 'https://ussignandmill.squarecoil.net/jobs/1' }, top };

  assert.equal(isTopLevelWindow(top), true);
  assert.equal(isSupportedTopLevelContext(top), true);
  assert.equal(isTopLevelWindow(frame), false);
  assert.equal(isSupportedTopLevelContext(frame), false);
});

test('document identity rejects empty and sentinel-sized tokens', () => {
  assert.equal(isConcreteDocumentToken(''), false);
  assert.equal(isConcreteDocumentToken('short'), false);
  assert.equal(isConcreteDocumentToken('document-token-123456'), true);
  assert.equal(isConcreteDocumentToken('x'.repeat(201)), false);
});
