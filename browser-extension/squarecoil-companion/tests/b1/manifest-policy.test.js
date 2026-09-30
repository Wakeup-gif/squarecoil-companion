'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { validateManifestPolicy } = require('../../scripts/manifest-policy');
const root = path.resolve(__dirname, '../..');
const current = () => JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

test('UT-B5-BING-001 Bing is a required exact installation host, with content injection limited to SquareCoil', () => {
  const manifest = current();
  assert.doesNotThrow(() => validateManifestPolicy(manifest));
  assert.deepEqual(manifest.host_permissions, ['https://ussignandmill.squarecoil.net/*', 'https://www.bing.com/*']);
  assert.equal(Object.hasOwn(manifest, 'optional_host_permissions'), false);
  assert.deepEqual(manifest.content_scripts[0].matches, ['https://ussignandmill.squarecoil.net/*']);
});

test('UT-B5-BING-002 old optional-Bing packages and broadened or injectable Bing capabilities fail package policy', () => {
  const mutations = [
    manifest => { manifest.host_permissions.pop(); manifest.optional_host_permissions = ['https://www.bing.com/*']; },
    manifest => { manifest.optional_host_permissions = []; },
    manifest => { manifest.host_permissions[1] = 'https://*.bing.com/*'; },
    manifest => { manifest.host_permissions.push('<all_urls>'); },
    manifest => { manifest.content_scripts[0].matches.push('https://www.bing.com/*'); },
    manifest => { manifest.web_accessible_resources[0].matches.push('https://www.bing.com/*'); }
  ];
  for (const mutate of mutations) {
    const manifest = current(); mutate(manifest);
    assert.throws(() => validateManifestPolicy(manifest));
  }
});

test('UT-B5-BING-003 runtime source contains no permission request or removal path after the installation migration', () => {
  const scan = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? scan(path.join(directory, entry.name)) : entry.name.endsWith('.js') ? [path.join(directory, entry.name)] : []);
  for (const file of scan(path.join(root, 'src'))) {
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /\bpermissions\s*(?:\.|\?\.)\s*(?:request|remove)\s*(?:\?\.)?\s*\(/, file);
    assert.doesNotMatch(source, /SC_COMPANION_B5B_(?:REQUEST|REMOVE)_PERMISSION/, file);
  }
});
