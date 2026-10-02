'use strict';

const EXPECTED_PERMISSIONS = Object.freeze(['storage', 'scripting', 'webRequest']);
const EXPECTED_HOST_PERMISSIONS = Object.freeze(['https://ussignandmill.squarecoil.net/*', 'https://www.bing.com/*']);
const EXPECTED_CONTENT_MATCHES = Object.freeze(['https://ussignandmill.squarecoil.net/*']);
const EXPECTED_WEB_ACCESSIBLE_RESOURCES = Object.freeze([Object.freeze({
  resources: Object.freeze(['dist/themes/dark-glass.css', 'dist/themes/light-glass.css', 'assets/us-sign-dark-logo.png']),
  matches: Object.freeze(['https://ussignandmill.squarecoil.net/*'])
})]);
const EXPECTED_CONTENT_SCRIPT_KEYS = Object.freeze(['all_frames', 'js', 'match_about_blank', 'matches', 'run_at']);
const EXPECTED_ICONS = Object.freeze({
  '16': 'icons/icon-16.png',
  '32': 'icons/icon-32.png',
  '48': 'icons/icon-48.png',
  '128': 'icons/icon-128.png'
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateManifestPolicy(manifest) {
  assert(manifest.manifest_version === 3, 'Packaged manifest must be MV3');
  assert(JSON.stringify(manifest.icons || {}) === JSON.stringify(EXPECTED_ICONS), 'Packaged manifest must declare the exact local browser/store icons');
  assert(JSON.stringify(manifest.permissions || []) === JSON.stringify(EXPECTED_PERMISSIONS), 'Packaged permissions must remain storage + scripting + passive webRequest observation only');
  assert(JSON.stringify(manifest.host_permissions || []) === JSON.stringify(EXPECTED_HOST_PERMISSIONS), 'Packaged host permissions must include only the exact SquareCoil tenant and Bing image origin');
  assert(!Object.hasOwn(manifest, 'optional_host_permissions'), 'Packaged Bing access must be declared at installation, with no optional host permissions');
  assert(JSON.stringify(manifest.web_accessible_resources || []) === JSON.stringify(EXPECTED_WEB_ACCESSIBLE_RESOURCES), 'Packaged presentation resources must remain limited to the exact CSS ports and approved dark logo on the tenant');
  assert(JSON.stringify(Object.keys(manifest.background || {}).sort()) === JSON.stringify(['service_worker']), 'Packaged background policy must contain only the service worker entry');
  assert(manifest.background.service_worker === 'dist/background.js', 'Packaged service worker reference is invalid');
  assert(manifest.action?.default_popup === 'popup/popup.html', 'Packaged popup reference is invalid');
  assert(JSON.stringify(manifest.action?.default_icon || {}) === JSON.stringify({
    '16': EXPECTED_ICONS['16'],
    '32': EXPECTED_ICONS['32']
  }), 'Packaged toolbar icon references are invalid');

  const contentScripts = manifest.content_scripts || [];
  assert(contentScripts.length === 1, 'Packaged manifest must contain exactly one content controller entry');
  const contentScript = contentScripts[0];
  assert(JSON.stringify(Object.keys(contentScript).sort()) === JSON.stringify([...EXPECTED_CONTENT_SCRIPT_KEYS].sort()), 'Packaged content controller policy contains unexpected fields');
  assert(JSON.stringify(contentScript.matches || []) === JSON.stringify(EXPECTED_CONTENT_MATCHES), 'Packaged content match must remain limited to the exact SquareCoil tenant');
  assert(JSON.stringify(contentScript.js || []) === JSON.stringify(['dist/presentation-bootstrap.js', 'dist/content-controller.js']), 'Packaged content entry ordering is invalid');
  assert(contentScript.run_at === 'document_start', 'Packaged content controller must start at document_start');
  assert(contentScript.all_frames === false, 'Packaged content controller must be top-frame only');
  assert(contentScript.match_about_blank === false, 'Packaged content controller must not enter about:blank frames');
  return contentScripts;
}

module.exports = { validateManifestPolicy };
