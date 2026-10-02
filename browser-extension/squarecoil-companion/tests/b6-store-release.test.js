'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { compareVersions, checkStoreIdentity, checkReleaseVersions } = require('../scripts/check-store-release');

const STORE_ID = 'abcdefghijklmnopabcdefghijklmnop';

function release(version) {
  return {
    latestVersion: version,
    distribution: {
      stableBranch: 'release/squarecoil-companion',
      recommended: 'chrome-web-store',
      chrome: {
        branch: 'release/squarecoil-companion',
        artifact: `SquareCoil-Companion-v${version}-CHROME.zip`,
        storeUrl: `https://chromewebstore.google.com/detail/squarecoil-companion/${STORE_ID}`
      },
      edge: { artifact: `SquareCoil-Companion-v${version}-EDGE.zip` }
    }
  };
}

test('Chrome version ordering compares numeric components', () => {
  assert.equal(compareVersions('0.7.10', '0.7.9'), 1);
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
  assert.equal(compareVersions('0.7.1', '0.7.2'), -1);
  assert.throws(() => compareVersions('0.7.65536', '0.7.1'), /65535/);
});

test('store release accepts only a strictly newer coherent version', () => {
  const manifest = { version: '0.7.2', version_name: '0.7.2 Companion Workspace' };
  const packageJson = { version: '0.7.2' };
  const previous = { version: '0.7.1' };
  assert.equal(checkReleaseVersions(manifest, packageJson, release('0.7.2'), previous, STORE_ID), '0.7.2');
  assert.throws(() => checkReleaseVersions(manifest, packageJson, release('0.7.2'), manifest, STORE_ID), /newer/);
  assert.throws(() => checkReleaseVersions(manifest, { version: '0.7.1' }, release('0.7.2'), previous, STORE_ID), /package.json/);
  assert.throws(() => checkReleaseVersions(manifest, packageJson, release('0.7.1'), previous, STORE_ID), /release.json latestVersion/);
  assert.throws(() => checkReleaseVersions({ ...manifest, version_name: '0.7.1 Companion Workspace' }, packageJson, release('0.7.2'), previous, STORE_ID), /version_name/);
  const staleArtifact = release('0.7.2');
  staleArtifact.distribution.chrome.artifact = 'SquareCoil-Companion-v0.7.1-CHROME.zip';
  assert.throws(() => checkReleaseVersions(manifest, packageJson, staleArtifact, previous, STORE_ID), /chrome artifact/);
});

test('store submission requires the exact configured item and honest release metadata', () => {
  const candidate = release('0.7.2');
  assert.equal(checkStoreIdentity(candidate, STORE_ID), STORE_ID);
  assert.throws(() => checkStoreIdentity({ ...candidate, distribution: { ...candidate.distribution, chrome: { ...candidate.distribution.chrome, branch: 'release/squarecoil-companion-chrome' } } }, STORE_ID), /update branch/);
  assert.throws(() => checkStoreIdentity(candidate, ''), /CWS_EXTENSION_ID/);
  assert.throws(() => checkStoreIdentity(candidate, 'q'.repeat(32)), /CWS_EXTENSION_ID/);
  assert.throws(() => checkStoreIdentity(candidate, 'a'.repeat(31)), /CWS_EXTENSION_ID/);
  assert.throws(() => checkStoreIdentity({ ...candidate, distribution: { ...candidate.distribution, recommended: 'developer-mode' } }, STORE_ID), /chrome-web-store/);
  assert.throws(() => checkStoreIdentity({ ...candidate, distribution: { ...candidate.distribution, chrome: { ...candidate.distribution.chrome, storeUrl: null } } }, STORE_ID), /storeUrl/);
  assert.throws(() => checkStoreIdentity({ ...candidate, distribution: { ...candidate.distribution, chrome: { ...candidate.distribution.chrome, storeUrl: `https://chromewebstore.google.com/detail/squarecoil-companion/${'a'.repeat(32)}` } } }, STORE_ID), /match CWS_EXTENSION_ID/);
  assert.throws(() => checkStoreIdentity({ ...candidate, distribution: { ...candidate.distribution, chrome: { ...candidate.distribution.chrome, storeUrl: `https://example.com/detail/${STORE_ID}` } } }, STORE_ID), /match CWS_EXTENSION_ID/);
});
