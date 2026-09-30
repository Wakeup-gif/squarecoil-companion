'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { BUILD_ID, BUILD_STAGE } = require('../src/core/build-identity');
const { PACKAGE_FILES } = require('./package-inventory');
const { validateManifestPolicy } = require('./manifest-policy');

function assert(condition, message) { if (!condition) throw new Error(message); }

function parseArguments(argv) {
  const packageArgument = argv[0];
  assert(packageArgument && !packageArgument.startsWith('--'), 'Usage: validate-package.js <package-directory> --expected-source-sha <sha> [--evidence <path>] [--allow-dirty]');
  const options = {
    packageRoot: path.resolve(packageArgument),
    expectedSourceSha: null,
    evidencePath: null,
    allowDirty: false
  };
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--allow-dirty') {
      options.allowDirty = true;
      continue;
    }
    if (argument !== '--expected-source-sha' && argument !== '--evidence') {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const value = argv[index + 1];
    assert(value && !value.startsWith('--'), `Missing value for ${argument}`);
    index += 1;
    if (argument === '--expected-source-sha') options.expectedSourceSha = value.trim().toLowerCase();
    else options.evidencePath = path.resolve(value);
  }
  assert(/^[0-9a-f]{40}$/.test(options.expectedSourceSha || ''), '--expected-source-sha must be a concrete 40-character Git SHA');
  return options;
}

function slash(value) {
  return value.split(path.sep).join('/');
}

function listFiles(directory, prefix = '') {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(absolute, relative));
    else if (entry.isFile()) files.push(slash(relative));
    else throw new Error(`Package contains unsupported entry type: ${relative}`);
  }
  return files.sort();
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function readTagAttributes(fragment, label) {
  const attributes = Object.create(null);
  let remaining = fragment.trim().replace(/\/$/, '').trim();
  while (remaining) {
    const match = /^([A-Za-z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?\s*/.exec(remaining);
    assert(match, `Unable to parse ${label} attributes: ${remaining}`);
    const name = match[1].toLowerCase();
    assert(!Object.hasOwn(attributes, name), `Duplicate ${label} attribute: ${name}`);
    attributes[name] = match[2] ?? match[3] ?? match[4] ?? true;
    remaining = remaining.slice(match[0].length);
  }
  return attributes;
}

function validatePopupHtml(html) {
  assert(!/<base\b/i.test(html), 'Packaged popup must not redefine its local base URL');
  assert(!/<(?:iframe|object|embed)\b/i.test(html), 'Packaged popup must not embed executable documents or plugins');
  assert(!/\son[a-z]+\s*=/i.test(html), 'Packaged popup must not use inline event handlers');
  assert(!/javascript\s*:/i.test(html), 'Packaged popup must not use javascript: URLs');
  assert(!/\b(?:src|href)\s*=\s*["']\s*(?:https?:)?\/\//i.test(html), 'Packaged popup executable/style references must be local');

  const scriptTags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  const scriptOpenCount = (html.match(/<script\b/gi) || []).length;
  assert(scriptTags.length === 1 && scriptOpenCount === 1, 'Packaged popup must contain exactly one closed script tag');
  const scriptAttributes = readTagAttributes(scriptTags[0][1], 'script');
  assert(JSON.stringify(Object.keys(scriptAttributes).sort()) === JSON.stringify(['src']), 'Packaged popup script may only declare src');
  assert(scriptAttributes.src === '../dist/popup.js', 'Packaged popup must load only ../dist/popup.js');
  assert(scriptTags[0][2].trim() === '', 'Packaged popup must not contain inline JavaScript');

  const linkTags = [...html.matchAll(/<link\b([^>]*)>/gi)];
  assert(linkTags.length === 1, 'Packaged popup must contain exactly one local stylesheet link');
  const linkAttributes = readTagAttributes(linkTags[0][1], 'link');
  assert(JSON.stringify(Object.keys(linkAttributes).sort()) === JSON.stringify(['href', 'rel']), 'Packaged popup stylesheet may only declare rel and href');
  assert(String(linkAttributes.rel).toLowerCase() === 'stylesheet', 'Packaged popup link must be a stylesheet');
  assert(linkAttributes.href === 'popup.css', 'Packaged popup must load only popup.css');
}


const options = parseArguments(process.argv.slice(2));
const { packageRoot, expectedSourceSha, evidencePath, allowDirty } = options;
assert(fs.existsSync(packageRoot), `Package directory does not exist: ${packageRoot}`);
assert(fs.statSync(packageRoot).isDirectory(), `Package path is not a directory: ${packageRoot}`);

const files = listFiles(packageRoot);
assert(JSON.stringify(files) === JSON.stringify([...PACKAGE_FILES].sort()), `Package allowlist mismatch. Actual: ${files.join(', ')}`);

const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'manifest.json'), 'utf8'));
const buildInfo = JSON.parse(fs.readFileSync(path.join(packageRoot, 'dist/build-info.json'), 'utf8'));
const contentScripts = validateManifestPolicy(manifest);
assert(buildInfo.buildId === BUILD_ID, `Packaged buildId must be ${BUILD_ID}`);
assert(buildInfo.stage === BUILD_STAGE, `Packaged stage must be ${BUILD_STAGE}`);
assert(/^[0-9a-f]{64}$/.test(buildInfo.candidateFingerprint), 'Packaged candidate fingerprint must be a concrete SHA-256');
assert(/^[0-9a-f]{40}$/.test(buildInfo.sourceSha), 'Packaged build-info sourceSha must be concrete');
assert(buildInfo.sourceSha === expectedSourceSha, `Packaged source SHA ${buildInfo.sourceSha} does not match expected ${expectedSourceSha}`);
assert(buildInfo.packageVersion === manifest.version, 'Packaged build-info version must match manifest');
assert(typeof buildInfo.sourceDirty === 'boolean', 'Packaged build-info sourceDirty must be boolean');
assert(allowDirty || buildInfo.sourceDirty === false, 'Candidate package was built from dirty source bytes');

const references = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  ...contentScripts.flatMap(entry => [...(entry.js || []), ...(entry.css || [])])
];
for (const reference of references) {
  assert(PACKAGE_FILES.includes(reference), `Manifest reference is outside the package allowlist: ${reference}`);
  assert(fs.existsSync(path.join(packageRoot, reference)), `Packaged manifest reference is missing: ${reference}`);
}

const popupHtml = fs.readFileSync(path.join(packageRoot, 'popup/popup.html'), 'utf8');
validatePopupHtml(popupHtml);

const backgroundBundle = fs.readFileSync(path.join(packageRoot, 'dist/background.js'), 'utf8');
assert(/["']dist\/companion-app\.js["']/.test(backgroundBundle), 'Packaged background bundle must contain the local companion-app.js injection dependency');
const companionBundle = fs.readFileSync(path.join(packageRoot, 'dist/companion-app.js'), 'utf8');
const contentControllerBundle = fs.readFileSync(path.join(packageRoot, 'dist/content-controller.js'), 'utf8');
assert(backgroundBundle.includes(buildInfo.candidateFingerprint), 'Packaged background bundle must embed the candidate fingerprint');
assert(companionBundle.includes(buildInfo.candidateFingerprint), 'Packaged companion bundle must embed the candidate fingerprint');
assert(contentControllerBundle.includes(buildInfo.candidateFingerprint), 'Packaged content-controller bundle must embed the candidate fingerprint');

const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{30,}\b/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/
];
for (const file of files) {
  const absolute = path.join(packageRoot, ...file.split('/'));
  const contents = fs.readFileSync(absolute);
  const text = contents.toString('utf8');
  for (const pattern of secretPatterns) assert(!pattern.test(text), `Sensitive credential pattern detected in ${file}`);
  if (file.endsWith('.js')) {
    assert(!/\bpermissions\s*(?:\.|\?\.)\s*(?:request|remove)\s*(?:\?\.)?\s*\(/.test(text), `Runtime host permission requests or removals are prohibited in ${file}`);
    assert(!/\beval\s*\(/.test(text), `eval is prohibited in ${file}`);
    assert(!/\bnew\s+Function\s*\(/.test(text), `new Function is prohibited in ${file}`);
    assert(!/\bimportScripts\s*\(/.test(text), `importScripts is prohibited in ${file}`);
    assert(!/\bimport\s*\(/.test(text), `dynamic import is prohibited in ${file}`);
  }
}

const inventory = files.map(file => {
  const contents = fs.readFileSync(path.join(packageRoot, ...file.split('/')));
  return { path: file, bytes: contents.length, sha256: sha256(contents) };
});
const inventoryDigest = sha256(Buffer.from(inventory.map(item => `${item.sha256}  ${item.bytes}  ${item.path}`).join('\n') + '\n'));
const evidence = {
  schemaVersion: 1,
  acceptanceEligible: buildInfo.sourceDirty === false,
  packageVersion: manifest.version,
  buildId: buildInfo.buildId,
  stage: buildInfo.stage,
  candidateFingerprint: buildInfo.candidateFingerprint,
  sourceSha: buildInfo.sourceSha,
  expectedSourceSha,
  sourceDirty: buildInfo.sourceDirty,
  inventoryDigest,
  files: inventory
};

if (evidencePath) {
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n', 'utf8');
}

console.log(JSON.stringify(evidence, null, 2));
