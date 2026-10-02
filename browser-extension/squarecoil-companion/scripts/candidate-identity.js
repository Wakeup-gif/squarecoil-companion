'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { canonicalFileBytes } = require('./canonical-text');

const EXPLICIT_INPUTS = Object.freeze([
  'manifest.json',
  'popup/popup.css',
  'popup/popup.html',
  'scripts/build.js',
  'scripts/canonical-text.js',
  'scripts/candidate-identity.js',
  'scripts/package-inventory.js'
]);

function slash(value) {
  return value.split(path.sep).join('/');
}

function listFiles(directory, root) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Candidate identity input may not be a symbolic link: ${slash(path.relative(root, absolute))}`);
    if (entry.isDirectory()) files.push(...listFiles(absolute, root));
    else if (entry.isFile()) files.push(slash(path.relative(root, absolute)));
    else throw new Error(`Unsupported candidate identity input: ${slash(path.relative(root, absolute))}`);
  }
  return files;
}

function candidateInputFiles(root) {
  const files = [...EXPLICIT_INPUTS, ...listFiles(path.join(root, 'src'), root)];
  return [...new Set(files)].sort();
}

function computeCandidateFingerprint(root) {
  const hash = crypto.createHash('sha256');
  hash.update('squarecoil-companion-rebuild-candidate-v3\0', 'utf8');
  for (const relative of candidateInputFiles(root)) {
    const absolute = path.join(root, ...relative.split('/'));
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      throw new Error(`Missing candidate identity input: ${relative}`);
    }
    const contents = canonicalFileBytes(absolute);
    hash.update(relative, 'utf8');
    hash.update('\0', 'utf8');
    hash.update(String(contents.length), 'utf8');
    hash.update('\0', 'utf8');
    hash.update(contents);
    hash.update('\0', 'utf8');
  }
  return hash.digest('hex');
}

module.exports = { EXPLICIT_INPUTS, candidateInputFiles, computeCandidateFingerprint };
