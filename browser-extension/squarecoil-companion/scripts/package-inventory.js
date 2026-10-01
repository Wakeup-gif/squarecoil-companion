'use strict';

const fs = require('fs');
const path = require('path');
const { canonicalFileBytes } = require('./canonical-text');

const PACKAGE_FILES = Object.freeze([
  'dist/background.js',
  'dist/build-info.json',
  'dist/companion-app.js',
  'dist/content-controller.js',
  'dist/popup.js',
  'dist/presentation-bootstrap.js',
  'dist/themes/dark-glass.css',
  'dist/themes/light-glass.css',
  'icons/icon-16.png',
  'icons/icon-32.png',
  'icons/icon-48.png',
  'icons/icon-128.png',
  'manifest.json',
  'popup/popup.css',
  'popup/popup.html'
]);

const CANDIDATE_EMBEDDED_BUNDLES = Object.freeze([
  'dist/background.js',
  'dist/companion-app.js',
  'dist/content-controller.js',
  'dist/presentation-bootstrap.js'
]);

function slash(value) {
  return value.split(path.sep).join('/');
}

function listFiles(directory, prefix = '') {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(absolute, relative));
    else if (entry.isFile()) files.push(slash(relative));
    else throw new Error(`Unsupported package entry: ${relative}`);
  }
  return files.sort();
}

function assertExactPackageFiles(directory) {
  const actual = listFiles(directory);
  const expected = [...PACKAGE_FILES].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Exact package inventory mismatch. Actual files: ${actual.join(', ')}`);
  }
  return actual;
}

function copyPackageFiles(sourceRoot, destinationRoot) {
  const existing = listFiles(destinationRoot);
  if (existing.length) throw new Error(`Package destination must be empty: ${destinationRoot}`);
  for (const relative of PACKAGE_FILES) {
    const source = path.join(sourceRoot, ...relative.split('/'));
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) {
      throw new Error(`Missing canonical package source: ${relative}`);
    }
    const destination = path.join(destinationRoot, ...relative.split('/'));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, canonicalFileBytes(source));
  }
  assertExactPackageFiles(destinationRoot);
  return destinationRoot;
}

if (require.main === module) {
  const [command, value] = process.argv.slice(2);
  if (command === '--copy-to' && value) {
    copyPackageFiles(path.resolve(__dirname, '..'), path.resolve(value));
  } else if (command === '--json' && !value) {
    process.stdout.write(`${JSON.stringify(PACKAGE_FILES, null, 2)}\n`);
  } else {
    process.stderr.write('Usage: node scripts/package-inventory.js --copy-to <empty-directory> | --json\n');
    process.exitCode = 1;
  }
}

module.exports = { PACKAGE_FILES, CANDIDATE_EMBEDDED_BUNDLES, listFiles, assertExactPackageFiles, copyPackageFiles };
