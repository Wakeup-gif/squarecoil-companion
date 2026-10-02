'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PACKAGE_FILES, CANDIDATE_EMBEDDED_BUNDLES, copyPackageFiles, assertExactPackageFiles } = require('../../scripts/package-inventory');
const { candidateInputFiles, computeCandidateFingerprint } = require('../../scripts/candidate-identity');
const { canonicalText, isCanonicalTextPath } = require('../../scripts/canonical-text');

const root = path.resolve(__dirname, '..', '..');
const repositoryRoot = path.resolve(root, '..', '..');
const read = relative => fs.readFileSync(path.join(root, ...relative.split('/')), 'utf8');

test('UT-B6-PKG-001 one canonical inventory drives build validation browser packaging and CI', () => {
  assert.equal(PACKAGE_FILES.length, 16);
  assert.equal(PACKAGE_FILES.includes('assets/us-sign-dark-logo.png'), true);
  assert.equal(candidateInputFiles(root).includes('assets/us-sign-dark-logo.png'), true);
  assert.equal(new Set(PACKAGE_FILES).size, PACKAGE_FILES.length);
  assert.deepEqual(CANDIDATE_EMBEDDED_BUNDLES, [
    'dist/background.js',
    'dist/companion-app.js',
    'dist/content-controller.js',
    'dist/presentation-bootstrap.js'
  ]);
  for (const source of ['scripts/build.js', 'scripts/validate.js', 'scripts/validate-package.js', 'tests/b1-browser/run.js']) {
    assert.match(read(source), /package-inventory/);
  }
  assert.match(read('scripts/build.js'), /status','--porcelain','--untracked-files=all','--','\.',[\s\S]*squarecoil-extension-validate\.yml/);
  const lab = read('dev/local-lab/run.js');
  assert.match(lab, /copyPackageFiles/);
  assert.match(lab, /NON_ACCEPTANCE_SEALED_LAB_VISUAL_EVIDENCE/);
  assert.match(lab, /packageIdentity[\s\S]*candidateFingerprint[\s\S]*sourceSha[\s\S]*sourceDirty/);
  assert.match(lab, /screenshotDigests/);
  const workflow = fs.readFileSync(path.join(repositoryRoot, '.github', 'workflows', 'squarecoil-extension-validate.yml'), 'utf8');
  assert.match(workflow, /scripts\/package-inventory\.js" --copy-to/);
  assert.match(workflow, /actions\/checkout@v4[\s\S]*?fetch-depth:\s*0/);

  const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'squarecoil-package-inventory-test-'));
  try {
    copyPackageFiles(root, destination);
    assert.deepEqual(assertExactPackageFiles(destination), [...PACKAGE_FILES].sort());
  } finally {
    fs.rmSync(destination, { recursive: true, force: true });
  }
});

test('UT-B6-DOC-001 current authority documents agree on migration repair and retain historical evidence', () => {
  const documents = [
    read('AGENTS.md'),
    read('REBUILD-START-HERE.md'),
    read('implementation/NEXT-CHAT-HANDOFF.md'),
    read('docs/EXECUTION-GATE-MATRIX.md')
  ];
  for (const document of documents) {
    assert.match(document, /v0\.7\.3 migration/);
    assert.match(document, /fix\/clock-detection-custom-dark-logo/);
    assert.match(document, /codex\/squarecoil-combined-2026-10-01/);
    assert.match(document, /608ddab4206810788570632518809d22bd345de1/);
    assert.match(document, /9f79a2094da6f2baa04120933ef635126ae2c05b/);
    assert.match(document, /COMBINED-WORKTREE-EVIDENCE\.md/);
    assert.match(document, /UI\/theme\/lab\/Figma stabilization/);
    assert.match(document, /PROTOTYPE-INTEGRATION-2026-09-14\.md/);
  }
  for (const document of documents.slice(0, 3)) {
    assert.doesNotMatch(document, /current authorization covers only the Glass\/theme and recovery stabilization batch/i);
  }
});

test('UT-B6-PKG-002 candidate identity is identical for LF and CRLF text checkouts', () => {
  const lfRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'squarecoil-candidate-lf-'));
  const crlfRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'squarecoil-candidate-crlf-'));
  try {
    for (const relative of candidateInputFiles(root)) {
      const source = path.join(root, ...relative.split('/'));
      const lfDestination = path.join(lfRoot, ...relative.split('/'));
      const crlfDestination = path.join(crlfRoot, ...relative.split('/'));
      fs.mkdirSync(path.dirname(lfDestination), { recursive: true });
      fs.mkdirSync(path.dirname(crlfDestination), { recursive: true });
      const contents = fs.readFileSync(source);
      if (isCanonicalTextPath(relative)) {
        const lf = canonicalText(contents.toString('utf8'));
        fs.writeFileSync(lfDestination, lf, 'utf8');
        fs.writeFileSync(crlfDestination, lf.replace(/\n/g, '\r\n'), 'utf8');
      } else {
        fs.writeFileSync(lfDestination, contents);
        fs.writeFileSync(crlfDestination, contents);
      }
    }
    assert.equal(computeCandidateFingerprint(lfRoot), computeCandidateFingerprint(crlfRoot));
  } finally {
    fs.rmSync(lfRoot, { recursive: true, force: true });
    fs.rmSync(crlfRoot, { recursive: true, force: true });
  }
});
