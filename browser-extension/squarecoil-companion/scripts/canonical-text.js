'use strict';

const fs = require('fs');
const path = require('path');

const CANONICAL_TEXT_EXTENSIONS = new Set([
  '.css', '.html', '.js', '.json', '.md', '.svg', '.txt', '.yml', '.yaml'
]);

function isCanonicalTextPath(filePath) {
  return CANONICAL_TEXT_EXTENSIONS.has(path.extname(String(filePath || '')).toLowerCase());
}

function canonicalText(value) {
  return String(value).replace(/\r\n?/g, '\n');
}

function canonicalFileBytes(filePath) {
  const contents = fs.readFileSync(filePath);
  return isCanonicalTextPath(filePath) ? Buffer.from(canonicalText(contents.toString('utf8')), 'utf8') : contents;
}

module.exports = { CANONICAL_TEXT_EXTENSIONS, isCanonicalTextPath, canonicalText, canonicalFileBytes };
