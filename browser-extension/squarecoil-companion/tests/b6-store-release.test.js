'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { compareVersions, checkReleaseVersions } = require('../scripts/check-store-release');

function release(version) {
  return {
    latestVersion: version,
    distribution: {
      chrome: { artifact: `SquareCoil-Companion-v${version}-CHROME.zip` },
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
  const manifest = { version: '0.7.2' };
  const packageJson = { version: '0.7.2' };
  const previous = { version: '0.7.1' };
  assert.equal(checkReleaseVersions(manifest, packageJson, release('0.7.2'), previous), '0.7.2');
  assert.throws(() => checkReleaseVersions(manifest, packageJson, release('0.7.2'), manifest), /newer/);
  assert.throws(() => checkReleaseVersions(manifest, { version: '0.7.1' }, release('0.7.2'), previous), /package.json/);
  assert.throws(() => checkReleaseVersions(manifest, packageJson, release('0.7.1'), previous), /release.json latestVersion/);
  const staleArtifact = release('0.7.2');
  staleArtifact.distribution.chrome.artifact = 'SquareCoil-Companion-v0.7.1-CHROME.zip';
  assert.throws(() => checkReleaseVersions(manifest, packageJson, staleArtifact, previous), /chrome artifact/);
});
