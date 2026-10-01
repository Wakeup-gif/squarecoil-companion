'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const extensionRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(extensionRoot, '..', '..');
const manifestPath = 'browser-extension/squarecoil-companion/manifest.json';

function versionParts(value) {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){0,3}$/.test(value)) {
    throw new Error(`Invalid Chrome extension version: ${value}`);
  }
  const parts = value.split('.').map(Number);
  if (parts.some(part => part > 65535)) throw new Error(`Chrome extension version component exceeds 65535: ${value}`);
  return parts;
}

function compareVersions(left, right) {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  for (let index = 0; index < 4; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

function checkStoreIdentity(release, extensionId) {
  if (release.distribution?.stableBranch !== 'release/squarecoil-companion' ||
      release.distribution?.chrome?.branch !== 'release/squarecoil-companion') {
    throw new Error('release.json Chrome update branch must match release/squarecoil-companion');
  }
  if (typeof extensionId !== 'string' || !/^[a-p]{32}$/.test(extensionId)) {
    throw new Error('CWS_EXTENSION_ID must be the 32-character Chrome Web Store item ID');
  }
  if (release.distribution?.recommended !== 'chrome-web-store') {
    throw new Error('release.json must recommend chrome-web-store before a Store submission');
  }
  const storeUrl = release.distribution?.chrome?.storeUrl;
  let url;
  try {
    url = new URL(storeUrl);
  } catch {
    throw new Error('release.json Chrome storeUrl must be the existing Store item URL');
  }
  const parts = url.pathname.split('/').filter(Boolean);
  if (url.protocol !== 'https:' || url.hostname !== 'chromewebstore.google.com' ||
      parts[0] !== 'detail' || ![2, 3].includes(parts.length) ||
      parts.at(-1) !== extensionId || url.search || url.hash || url.username || url.password) {
    throw new Error('release.json Chrome storeUrl must match CWS_EXTENSION_ID');
  }
  return extensionId;
}

function checkReleaseVersions(manifest, packageJson, release, previousManifest, extensionId) {
  const version = manifest.version;
  versionParts(version);
  if (packageJson.version !== version) throw new Error(`package.json version ${packageJson.version} differs from manifest ${version}`);
  if (release.latestVersion !== version) throw new Error(`release.json latestVersion ${release.latestVersion} differs from manifest ${version}`);
  if (manifest.version_name && manifest.version_name !== version && !manifest.version_name.startsWith(`${version} `)) {
    throw new Error(`manifest version_name ${manifest.version_name} differs from version ${version}`);
  }
  checkStoreIdentity(release, extensionId);
  for (const browser of ['chrome', 'edge']) {
    const artifact = release.distribution?.[browser]?.artifact;
    if (typeof artifact !== 'string' || !artifact.includes(`-v${version}-`)) {
      throw new Error(`release.json ${browser} artifact must name version ${version}`);
    }
  }
  if (compareVersions(version, previousManifest.version) <= 0) {
    throw new Error(`Store update requires a version newer than the previous release-branch head (${previousManifest.version}); found ${version}`);
  }
  return version;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(extensionRoot, relativePath), 'utf8'));
}

function main(baseSha) {
  if (!/^[0-9a-f]{40}$/i.test(baseSha || '') || /^0{40}$/.test(baseSha)) {
    throw new Error('A previous release-branch commit SHA is required to prove a version increase');
  }
  const previousManifest = JSON.parse(execFileSync('git', ['show', `${baseSha}:${manifestPath}`], {
    cwd: repositoryRoot,
    encoding: 'utf8'
  }));
  const version = checkReleaseVersions(
    readJson('manifest.json'),
    readJson('package.json'),
    readJson('release.json'),
    previousManifest,
    process.env.CWS_EXTENSION_ID
  );
  process.stdout.write(`Chrome Web Store update version ${previousManifest.version} -> ${version}\n`);
}

if (require.main === module) {
  try {
    if (process.argv[2] !== '--base-sha' || process.argv.length !== 4) {
      throw new Error('Usage: node scripts/check-store-release.js --base-sha <previous-release-branch-sha>');
    }
    main(process.argv[3]);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { versionParts, compareVersions, checkStoreIdentity, checkReleaseVersions };
