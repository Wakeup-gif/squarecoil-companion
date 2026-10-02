'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { PACKAGE_FILES: REQUIRED_PACKAGE_FILES, CANDIDATE_EMBEDDED_BUNDLES } = require('../../scripts/package-inventory');
const { verifyDashboardJourney } = require('../../dev/local-lab/prototype-journey');
const { EVENT_CODES: DIAGNOSTIC_EVENT_CODES } = require('../../src/extension/diagnostic-log');

const CANONICAL_BUILD_ID = 'rebuild-b6-release-candidate';
const CANONICAL_STAGE = 'B6';
const FIXTURE_ORIGIN = 'https://ussignandmill.squarecoil.net';
const WEBSITE_LOGO_FILENAME = 'US-Sign&-Mill-Logo - sized for SC site.png';
const FIXTURE_PATH = '/__b1_fixture__/a4.html';
const FRAME_PATH = '/__b1_fixture__/frame.html';
const DASHBOARD_PATH = '/dashboard.php';
const THEME_GENERIC_PATH = '/home.php';
const LEADS_PATH = '/leads.php';
const CALENDAR_PATH = '/calendar.php';
const EMPTY_UI_PATH = '/__b5d_fixture__/empty.html';
const EDITOR_FRAME_PATH = '/__b5d_fixture__/editor.html';
const VENDOR_THEME_PATH = '/project_designs.php';
const GANTT_THEME_PATH = '/project_milestones.php';
const LOOKALIKE_VENDOR_PATH = '/folder/project_designs.php';
const BING_MARKETS = Object.freeze([
  'en-US', 'en-GB', 'en-CA', 'en-IN', 'de-DE', 'fr-FR',
  'fr-CA', 'es-ES', 'it-IT', 'ja-JP', 'pt-BR', 'zh-CN'
]);
const UNSUPPORTED_URL = 'data:text/html,<meta charset="utf-8"><title>A4 unsupported document</title><p>Synthetic unsupported document</p>';
const ROOT_ID = 'ussign-job-timer';
const RUNTIME_KEY = '__squareCoilCompanionRuntime';
const CLAIM_KEY = '__squareCoilCompanionInjectionClaim';
const BOOTSTRAP_KEY = '__squareCoilCompanionBootstrap';
const DOCUMENT_TOKEN_DATASET_KEY = 'squarecoilCompanionDocumentToken';
const AUTHORITY_STORAGE_KEY = 'squarecoilCompanionB2AuthorityV1';
const WALLPAPER_CACHE_KEY = 'squarecoilCompanionB5BWallpaperCacheV1';
const EXPECTED_DEGRADED_REASON = 'coordination-not-implemented-b1';
const REQUIRED_A4_STABLE_FIXTURE_IDS = Object.freeze([
  'B1-LC-001',
  'B1-LC-002',
  'B1-LC-003',
  'B1-LC-004',
  'B1-LC-005',
  'B1-LC-006',
  'B1-LC-007',
  'B1-LC-008',
  'B1-LC-009',
  'B1-LC-010',
  'B1-LC-012',
  'B1-LC-013',
  'B1-LC-014',
  'B1-LC-015',
  'B1-LC-016',
  'B1-LC-017',
  'B1-LC-018'
]);
const REQUIRED_B2_1_A4_FIXTURE_IDS = Object.freeze([
  'B2-KERNEL-001',
  'B2-KERNEL-002'
]);
const REQUIRED_B2_2_A4_FIXTURE_IDS = Object.freeze([
  'B2-TRANSITION-001',
  'B2-TRANSITION-002',
  'B2-TRANSITION-003',
  'B2-TRANSITION-004',
  'B2-TRANSITION-005'
]);
const REQUIRED_B2_READY_A4_FIXTURE_IDS = Object.freeze([
  'B2-READY-001',
  'B2-READY-002',
  'B2-READY-003'
]);
const REQUIRED_B3_WORKSPACE_A4_FIXTURE_IDS = Object.freeze([
  'B3-WORKSPACE-001',
  'B3-WORKSPACE-002',
  'B3-WORKSPACE-003',
  'B3-WORKSPACE-004'
]);
const REQUIRED_B4_DATA_A4_FIXTURE_IDS = Object.freeze([
  'B4-DATA-001',
  'B4-DATA-002',
  'B4-DATA-003',
  'B4-DATA-004'
]);
const REQUIRED_B5_SETTINGS_A4_FIXTURE_IDS = Object.freeze([
  'B5-SETTINGS-001',
  'B5-SETTINGS-002',
  'B5-SETTINGS-003',
  'B5-SETTINGS-004',
  'B5-SETTINGS-005'
]);
const REQUIRED_B5B_A4_FIXTURE_IDS = Object.freeze([
  'B5B-CINE-001',
  'B5B-CINE-002',
  'B5B-DASH-001',
  'B5B-DASH-002',
  'B5B-SAFETY-001'
]);
const REQUIRED_B5C_A4_FIXTURE_IDS = Object.freeze([
  'B5C-THEME-001',
  'B5C-THEME-002',
  'B5C-THEME-003',
  'B5C-THEME-004'
]);
const REQUIRED_B5D_A4_FIXTURE_IDS = Object.freeze([
  'B5D-UI-001',
  'B5D-VENDOR-001',
  'B5D-OVERLAY-001',
  'B5D-EDITOR-001',
  'B5D-LAYOUT-001'
]);
const REQUIRED_B6_A4_FIXTURE_IDS = Object.freeze([
  'B6-CANDIDATE-001',
  'B6-PROFILE-001',
  'B6-PROFILE-002'
]);
const MESSAGES = Object.freeze({
  BOOT: 'SC_COMPANION_BOOT',
  HEALTH: 'SC_COMPANION_GET_HEALTH',
  ENABLE: 'SC_COMPANION_SET_ENABLED',
  REVALIDATE: 'SC_COMPANION_REVALIDATE',
  RETRY: 'SC_COMPANION_RETRY_TEARDOWN',
  B5B_WALLPAPER: 'SC_COMPANION_B5B_GET_WALLPAPER'
});
const BROWSER_DEFAULTS = Object.freeze({
  chrome: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  edge: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
});

class UnsupportedCase extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsupportedCase';
  }
}

function parseArguments(argv) {
  const options = {
    packageDirectory: null,
    archivePath: null,
    expectedSourceSha: null,
    browsers: ['chrome', 'edge'],
    profiles: ['clean', 'upgrade'],
    evidencePath: null,
    headed: false,
    liveBingOnly: false,
    allowDirtyDevelopment: false,
    timeoutMs: 30000,
    executables: { ...BROWSER_DEFAULTS }
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) throw new Error(`Missing value for ${argument}`);
      index += 1;
      return next;
    };
    if (argument === '--package') options.packageDirectory = path.resolve(value());
    else if (argument === '--archive') options.archivePath = path.resolve(value());
    else if (argument === '--expected-source-sha') options.expectedSourceSha = value();
    else if (argument === '--browser') {
      const selected = value().toLowerCase();
      options.browsers = selected === 'all' ? ['chrome', 'edge'] : [selected];
    } else if (argument === '--profile') {
      const selected = value().toLowerCase();
      options.profiles = selected === 'all' ? ['clean', 'upgrade'] : [selected];
    } else if (argument === '--evidence') options.evidencePath = path.resolve(value());
    else if (argument === '--chrome-executable') options.executables.chrome = path.resolve(value());
    else if (argument === '--edge-executable') options.executables.edge = path.resolve(value());
    else if (argument === '--timeout') options.timeoutMs = Number(value());
    else if (argument === '--headed') options.headed = true;
    else if (argument === '--live-bing-only') options.liveBingOnly = true;
    else if (argument === '--allow-dirty-development') options.allowDirtyDevelopment = true;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (options.help) return options;
  if (!options.packageDirectory) throw new Error('--package is required');
  if (!options.archivePath) throw new Error('--archive is required');
  if (!/^[0-9a-f]{40}$/.test(String(options.expectedSourceSha || ''))) {
    throw new Error('--expected-source-sha must be an exact lowercase 40-character Git SHA');
  }
  if (!options.browsers.every(browser => ['chrome', 'edge'].includes(browser))) {
    throw new Error('--browser must be chrome, edge, or all');
  }
  if (!options.profiles.every(profile => ['clean', 'upgrade'].includes(profile))) {
    throw new Error('--profile must be clean, upgrade, or all');
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1000 || options.timeoutMs > 120000) {
    throw new Error('--timeout must be between 1000 and 120000 milliseconds');
  }
  if (options.liveBingOnly) {
    options.profiles = ['clean'];
  }
  return options;
}

function usage() {
  return [
    'Usage:',
    '  node tests/b1-browser/run.js --package <exact-unpacked-directory> --archive <exact-zip> --expected-source-sha <sha> [options]',
    '',
    'Options:',
    '  --browser chrome|edge|all       Default: all',
    '  --profile clean|upgrade|all     Diagnostic subset or default full matrix',
    '  --archive <zip-path>             ZIP whose file bytes must equal the extracted package',
    '  --expected-source-sha <sha>      Required exact lowercase commit identity',
    '  --evidence <json-path>          Also write the complete JSON result',
    '  --headed                        Show browser windows',
    '  --live-bing-only    Run the direct skin/live Bing/two-Glass visual gate and exit',
    '  --timeout <milliseconds>         Per-condition timeout (default 30000)',
    '  --chrome-executable <path>       Override branded Chrome executable',
    '  --edge-executable <path>         Override branded Edge executable',
    '  --allow-dirty-development        Permit dirty bytes and label the run NON_ACCEPTANCE'
  ].join('\n');
}

function sha256(contents) {
  return crypto.createHash('sha256').update(contents).digest('hex');
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function jsonSha256(value) {
  return sha256(Buffer.from(stableJson(value)));
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
    else throw new Error(`Unsupported package entry: ${relative}`);
  }
  return files.sort();
}

function inventoryPackage(packageDirectory) {
  if (!fs.existsSync(packageDirectory) || !fs.statSync(packageDirectory).isDirectory()) {
    throw new Error(`Package directory does not exist: ${packageDirectory}`);
  }
  const files = listFiles(packageDirectory);
  const required = [...REQUIRED_PACKAGE_FILES].sort();
  if (JSON.stringify(files) !== JSON.stringify(required)) {
    throw new Error(`Exact package allowlist mismatch. Actual files: ${files.join(', ')}`);
  }
  const inventory = files.map(relative => {
    const contents = fs.readFileSync(path.join(packageDirectory, ...relative.split('/')));
    return { path: relative, bytes: contents.length, sha256: sha256(contents) };
  });
  const inventoryDigest = sha256(Buffer.from(inventory.map(item => `${item.sha256}  ${item.bytes}  ${item.path}`).join('\n') + '\n'));
  const manifest = JSON.parse(fs.readFileSync(path.join(packageDirectory, 'manifest.json'), 'utf8'));
  const buildInfo = JSON.parse(fs.readFileSync(path.join(packageDirectory, 'dist', 'build-info.json'), 'utf8'));
  const candidateFingerprint = String(buildInfo.candidateFingerprint || '');
  const candidateEmbeddingCounts = Object.fromEntries(CANDIDATE_EMBEDDED_BUNDLES.map(relative => {
    const code = fs.readFileSync(path.join(packageDirectory, ...relative.split('/')), 'utf8');
    const count = candidateFingerprint ? code.split(candidateFingerprint).length - 1 : 0;
    return [relative, count];
  }));
  return { files: inventory, inventoryDigest, manifest, buildInfo, candidateEmbeddingCounts };
}

function validatePackageIdentity(inventory, options) {
  const { manifest, buildInfo } = inventory;
  if (manifest.manifest_version !== 3) throw new Error('A4 requires a Manifest V3 package');
  if (manifest.background?.service_worker !== 'dist/background.js') throw new Error('A4 requires dist/background.js as the service worker');
  if (JSON.stringify(manifest.host_permissions || []) !== JSON.stringify([`${FIXTURE_ORIGIN}/*`, 'https://www.bing.com/*'])) throw new Error('A4 requires only the exact SquareCoil and Bing install host permissions');
  if (JSON.stringify(manifest.optional_host_permissions || []) !== JSON.stringify([])) throw new Error('A4 disallows optional runtime host grants');
  if (buildInfo.buildId !== CANONICAL_BUILD_ID) throw new Error(`A4 requires canonical buildId ${CANONICAL_BUILD_ID}`);
  if (buildInfo.stage !== CANONICAL_STAGE) throw new Error(`A4 requires canonical stage ${CANONICAL_STAGE}`);
  if (!/^[0-9a-f]{64}$/.test(String(buildInfo.candidateFingerprint || ''))) {
    throw new Error('A4 requires a concrete lowercase 64-character candidateFingerprint');
  }
  for (const relative of CANDIDATE_EMBEDDED_BUNDLES) {
    if (inventory.candidateEmbeddingCounts[relative] < 1) {
      throw new Error(`${relative} does not embed the packaged candidateFingerprint`);
    }
  }
  if (!/^[0-9a-f]{40}$/.test(String(buildInfo.sourceSha || ''))) throw new Error('A4 requires a concrete lowercase 40-character source SHA');
  if (buildInfo.sourceSha !== options.expectedSourceSha) {
    throw new Error(`Packaged source SHA ${buildInfo.sourceSha || '(missing)'} does not exactly match --expected-source-sha ${options.expectedSourceSha}`);
  }
  if (buildInfo.packageVersion !== manifest.version) throw new Error('Package and build-info versions differ');
  if (typeof buildInfo.sourceDirty !== 'boolean') throw new Error('Packaged build-info sourceDirty must be a boolean');
  if (buildInfo.sourceDirty !== false && !options.allowDirtyDevelopment) {
    throw new Error('A4 acceptance refuses a package built from dirty source bytes');
  }
}

function findEndOfCentralDirectory(buffer) {
  const minimum = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== 0x06054b50) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === buffer.length) return offset;
  }
  throw new Error('Archive is not a supported ZIP: end-of-central-directory record missing');
}

function safeArchiveEntryPath(value) {
  const normalized = String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || normalized.includes('\0') || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`Archive contains an unsafe path: ${JSON.stringify(value)}`);
  }
  const parts = normalized.split('/').filter(Boolean);
  if (parts.some(part => part === '.' || part === '..')) throw new Error(`Archive contains path traversal: ${normalized}`);
  return normalized;
}

function readZipFileEntries(archivePath) {
  if (!fs.existsSync(archivePath) || !fs.statSync(archivePath).isFile()) {
    throw new Error(`Archive does not exist: ${archivePath}`);
  }
  if (path.extname(archivePath).toLowerCase() !== '.zip') throw new Error('A4 --archive must be a .zip file');
  const archiveBytes = fs.readFileSync(archivePath);
  const eocd = findEndOfCentralDirectory(archiveBytes);
  const diskNumber = archiveBytes.readUInt16LE(eocd + 4);
  const centralDisk = archiveBytes.readUInt16LE(eocd + 6);
  const diskEntries = archiveBytes.readUInt16LE(eocd + 8);
  const totalEntries = archiveBytes.readUInt16LE(eocd + 10);
  const centralSize = archiveBytes.readUInt32LE(eocd + 12);
  const centralOffset = archiveBytes.readUInt32LE(eocd + 16);
  if (diskNumber !== 0 || centralDisk !== 0 || diskEntries !== totalEntries) throw new Error('Multi-disk ZIP archives are not supported');
  if (totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) throw new Error('ZIP64 archives are not supported');
  if (centralOffset + centralSize > eocd) throw new Error('ZIP central directory bounds are invalid');

  const entries = [];
  const seenNames = new Set();
  let cursor = centralOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (cursor + 46 > archiveBytes.length || archiveBytes.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error(`ZIP central entry ${index + 1} is malformed`);
    }
    const flags = archiveBytes.readUInt16LE(cursor + 8);
    const method = archiveBytes.readUInt16LE(cursor + 10);
    const compressedSize = archiveBytes.readUInt32LE(cursor + 20);
    const uncompressedSize = archiveBytes.readUInt32LE(cursor + 24);
    const nameLength = archiveBytes.readUInt16LE(cursor + 28);
    const extraLength = archiveBytes.readUInt16LE(cursor + 30);
    const commentLength = archiveBytes.readUInt16LE(cursor + 32);
    const localOffset = archiveBytes.readUInt32LE(cursor + 42);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new Error('ZIP64 entries are not supported');
    }
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd + extraLength + commentLength > archiveBytes.length) throw new Error('ZIP central entry exceeds archive bounds');
    const name = safeArchiveEntryPath(archiveBytes.subarray(nameStart, nameEnd).toString('utf8'));
    cursor = nameEnd + extraLength + commentLength;
    if (name.endsWith('/')) continue;
    if (seenNames.has(name)) throw new Error(`Archive contains a duplicate path: ${name}`);
    seenNames.add(name);
    if ((flags & 0x0001) !== 0) throw new Error(`Encrypted ZIP entries are not supported: ${name}`);
    if (![0, 8].includes(method)) throw new Error(`Unsupported ZIP compression method ${method}: ${name}`);
    if (localOffset + 30 > archiveBytes.length || archiveBytes.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`ZIP local header is malformed: ${name}`);
    }
    const localFlags = archiveBytes.readUInt16LE(localOffset + 6);
    const localMethod = archiveBytes.readUInt16LE(localOffset + 8);
    const localNameLength = archiveBytes.readUInt16LE(localOffset + 26);
    const localExtraLength = archiveBytes.readUInt16LE(localOffset + 28);
    const localName = safeArchiveEntryPath(archiveBytes.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString('utf8'));
    if (localName !== name || localFlags !== flags || localMethod !== method) throw new Error(`ZIP local/central metadata differs: ${name}`);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > archiveBytes.length) throw new Error(`ZIP entry data exceeds archive bounds: ${name}`);
    const compressed = archiveBytes.subarray(dataStart, dataEnd);
    const contents = method === 0 ? Buffer.from(compressed) : zlib.inflateRawSync(compressed);
    if (contents.length !== uncompressedSize) throw new Error(`ZIP entry size mismatch: ${name}`);
    entries.push({ path: name, contents });
  }
  if (cursor !== centralOffset + centralSize) throw new Error('ZIP central directory size does not match parsed entries');
  return {
    path: fs.realpathSync(archivePath),
    filename: path.basename(archivePath),
    bytes: archiveBytes.length,
    sha256: sha256(archiveBytes),
    entries
  };
}

function inventoryArchive(archivePath, extractedInventory) {
  const archive = readZipFileEntries(archivePath);
  const expectedPaths = [...REQUIRED_PACKAGE_FILES].sort();
  const rawPaths = archive.entries.map(entry => entry.path).sort();
  let rootPrefix = '';
  let normalizedEntries = archive.entries;
  if (JSON.stringify(rawPaths) !== JSON.stringify(expectedPaths)) {
    const firstParts = rawPaths[0]?.split('/') || [];
    const candidate = firstParts.length > 1 ? `${firstParts[0]}/` : '';
    if (!candidate || !rawPaths.every(entryPath => entryPath.startsWith(candidate))) {
      throw new Error(`Archive file allowlist mismatch. Actual: ${rawPaths.join(', ')}`);
    }
    normalizedEntries = archive.entries.map(entry => ({ ...entry, path: entry.path.slice(candidate.length) }));
    const normalizedPaths = normalizedEntries.map(entry => entry.path).sort();
    if (JSON.stringify(normalizedPaths) !== JSON.stringify(expectedPaths)) {
      throw new Error(`Archive file allowlist mismatch after root normalization. Actual: ${normalizedPaths.join(', ')}`);
    }
    rootPrefix = candidate;
  }
  const inventory = normalizedEntries
    .map(entry => ({ path: entry.path, bytes: entry.contents.length, sha256: sha256(entry.contents) }))
    .sort((left, right) => left.path.localeCompare(right.path));
  if (JSON.stringify(inventory) !== JSON.stringify(extractedInventory.files)) {
    throw new Error('ZIP file bytes do not exactly match the extracted package inventory');
  }
  const inventoryDigest = sha256(Buffer.from(inventory.map(item => `${item.sha256}  ${item.bytes}  ${item.path}`).join('\n') + '\n'));
  if (inventoryDigest !== extractedInventory.inventoryDigest) throw new Error('ZIP and extracted inventory digests differ');
  return {
    path: archive.path,
    filename: archive.filename,
    bytes: archive.bytes,
    sha256: archive.sha256,
    rootPrefix,
    inventoryDigest,
    files: inventory
  };
}

function pathIsWithin(candidate, directory) {
  const relative = path.relative(path.resolve(directory), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolvePlaywright() {
  const candidates = [
    process.env.SC_PLAYWRIGHT_MODULE,
    'playwright',
    path.join(os.homedir(), '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright')
  ].filter(Boolean);
  const errors = [];
  for (const candidate of candidates) {
    try {
      return { module: require(candidate), resolvedFrom: require.resolve(candidate) };
    } catch (error) {
      errors.push(`${candidate}: ${error.message}`);
    }
  }
  throw new UnsupportedCase(`Playwright 1.62+ is unavailable. Attempts: ${errors.join(' | ')}`);
}

function assert(condition, message, details = null) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

function isConcreteIdentity(value) {
  const normalized = String(value || '').trim();
  return normalized.length >= 8 && normalized.length <= 200;
}

async function waitFor(check, description, timeoutMs, intervalMs = 50) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  const suffix = lastError ? ` Last error: ${lastError.message}` : '';
  throw new Error(`Timed out waiting for ${description}.${suffix}`);
}

async function withHarnessDeadline(operation, label, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`${label}: exceeded hard deadline of ${timeoutMs} ms`);
          error.harnessDeadline = true;
          reject(error);
        }, timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function navigateInitialCleanFixture(context, page, browserCdp, family, timeoutMs, evidence) {
  const fixtureUrl = `${FIXTURE_ORIGIN}${FIXTURE_PATH}`;
  evidence.stages = [];
  evidence.timedOut = false;
  for (const [name, operation] of [
    ['FOCUS', () => page.bringToFront()],
    ['GOTO', () => page.goto(fixtureUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs })]
  ]) {
    const label = `A4-SETUP-${family === 'chrome' ? 'CH' : 'ED'}-INITIAL-FIXTURE-${name}`;
    const started = Date.now();
    process.stderr.write(`${label}: START\n`);
    try {
      await withHarnessDeadline(operation, label, timeoutMs);
      evidence.stages.push({ id: label, status: 'PASS', durationMs: Date.now() - started });
      process.stderr.write(`${label}: PASS (${Date.now() - started} ms)\n`);
    } catch (error) {
      evidence.timedOut = error.harnessDeadline === true || error.name === 'TimeoutError';
      const diagnostic = {
        fixtureUrl,
        pageUrl: page.url(),
        pageClosed: page.isClosed(),
        browserConnected: context.browser()?.isConnected() ?? false,
        pages: context.pages().slice(0, 8).map(candidate => ({ url: candidate.url().slice(0, 512), closed: candidate.isClosed() }))
      };
      process.stderr.write(`${label}: FAIL (${Date.now() - started} ms): ${error.message}\n`);
      try {
        const targets = await withHarnessDeadline(() => browserCdp.send('Target.getTargets'), `${label}-DIAGNOSTIC`, 1_500);
        diagnostic.targets = targets.targetInfos.filter(target => ['page', 'service_worker'].includes(target.type)).slice(0, 16)
          .map(target => ({ targetId: target.targetId, type: target.type, url: target.url.slice(0, 512), attached: target.attached }));
      } catch (diagnosticError) {
        diagnostic.targetSnapshotError = diagnosticError.message;
      }
      evidence.stages.push({ id: label, status: 'FAIL', durationMs: Date.now() - started, error: error.message, diagnostic });
      error.details = { ...(error.details || {}), initialFixtureNavigation: evidence };
      throw error;
    }
  }
}

async function pageState(page) {
  return page.evaluate(({ rootId, runtimeKey, claimKey, bootstrapKey, tokenKey }) => {
    function safeRead(key) {
      try {
        if (!Object.prototype.hasOwnProperty.call(window, key)) return { present: false, readable: true, value: null };
        return { present: true, readable: true, value: window[key] };
      } catch (_) {
        return { present: true, readable: false, value: null };
      }
    }
    const runtimeProperty = safeRead(runtimeKey);
    const runtime = runtimeProperty.readable ? runtimeProperty.value : null;
    let health = null;
    try { health = runtime && typeof runtime.getHealth === 'function' ? runtime.getHealth() : null; } catch (_) {}
    const rootElements = [...document.querySelectorAll(`#${rootId}`)];
    for (const marked of document.querySelectorAll('[data-squarecoil-companion-root="rebuild"]')) {
      if (!rootElements.includes(marked)) rootElements.push(marked);
    }
    const roots = rootElements.map(root => ({
      id: root.id || null,
      canonicalId: root.id === rootId,
      rebuildOwned: root.dataset.squarecoilCompanionRoot === 'rebuild',
      runtimeInstanceId: root.dataset.runtimeInstanceId || null,
      buildId: root.dataset.buildId || null,
      packageVersion: root.dataset.packageVersion || null,
      candidateFingerprint: root.dataset.candidateFingerprint || null,
      documentToken: root.dataset.documentToken || null,
      lifecycleState: root.dataset.lifecycleState || null,
      lifecycleReason: root.dataset.lifecycleReason || null,
      a4Seed: root.dataset.a4Seed || null
    }));
    return {
      url: String(location.href),
      documentToken: document.documentElement?.dataset?.[tokenKey] || null,
      controller: document.documentElement?.dataset?.squarecoilCompanionController || null,
      controllerReason: document.documentElement?.dataset?.squarecoilCompanionControllerReason || null,
      probe: document.documentElement?.dataset?.squarecoilCompanionProbe || null,
      reloadRequired: document.documentElement?.dataset?.squarecoilCompanionReloadRequired || null,
      runtimeGlobalPresent: runtimeProperty.present,
      runtimeGlobalReadable: runtimeProperty.readable,
      runtimeInstanceId: runtime && runtime.runtimeInstanceId || null,
      runtimeBuildId: runtime && runtime.buildId || null,
      runtimePackageVersion: runtime && runtime.packageVersion || null,
      runtimeCandidateFingerprint: runtime && runtime.candidateFingerprint || null,
      runtimeDocumentToken: runtime && runtime.documentToken || null,
      health,
      rootCount: roots.length,
      canonicalRootCount: roots.filter(root => root.canonicalId).length,
      rebuildMarkerCount: roots.filter(root => root.rebuildOwned).length,
      roots,
      claimPresent: safeRead(claimKey).present,
      bootstrapPresent: safeRead(bootstrapKey).present
    };
  }, {
    rootId: ROOT_ID,
    runtimeKey: RUNTIME_KEY,
    claimKey: CLAIM_KEY,
    bootstrapKey: BOOTSTRAP_KEY,
    tokenKey: DOCUMENT_TOKEN_DATASET_KEY
  });
}

function assertExpectedB1Shell(state, label, candidateIdentity) {
  assert(state.runtimeGlobalPresent && state.runtimeGlobalReadable, `${label}: runtime global is not readable`);
  assert(state.rootCount === 1, `${label}: expected exactly one canonical-or-rebuild root`, state);
  assert(state.canonicalRootCount === 1, `${label}: expected exactly one canonical timer root`, state);
  assert(state.rebuildMarkerCount === 1, `${label}: expected exactly one rebuild-owned marker`, state);
  assert(state.roots[0].canonicalId === true && state.roots[0].rebuildOwned === true, `${label}: sole root is not the canonical rebuild-owned root`, state);
  assert(isConcreteIdentity(state.runtimeInstanceId), `${label}: runtime identity is not concrete`, state);
  assert(state.roots[0].runtimeInstanceId === state.runtimeInstanceId, `${label}: root/runtime identity differs`, state);
  assert(state.runtimeBuildId === candidateIdentity.buildId, `${label}: runtime build identity differs`, state);
  assert(state.runtimePackageVersion === candidateIdentity.packageVersion, `${label}: runtime package identity differs`, state);
  assert(state.runtimeCandidateFingerprint === candidateIdentity.candidateFingerprint, `${label}: runtime candidate identity differs`, state);
  assert(state.roots[0].buildId === candidateIdentity.buildId, `${label}: root build identity differs`, state);
  assert(state.roots[0].packageVersion === candidateIdentity.packageVersion, `${label}: root package identity differs`, state);
  assert(state.roots[0].candidateFingerprint === candidateIdentity.candidateFingerprint, `${label}: root candidate identity differs`, state);
  assert(state.runtimeDocumentToken === state.documentToken, `${label}: runtime/document identity differs`, state);
  assert(state.roots[0].documentToken === state.documentToken, `${label}: root/document identity differs`, state);
  const health = state.health;
  assert(health?.state === 'DEGRADED', `${label}: isolated MAIN shell must retain the pre-settlement sentinel`, health);
  assert(health?.state !== 'READY', `${label}: isolated MAIN shell bypassed worker-owned B2 settlement`, health);
  assert(health?.reason === EXPECTED_DEGRADED_REASON, `${label}: unexpected degraded reason`, health);
  assert(health?.buildId === candidateIdentity.buildId, `${label}: health build identity differs`, health);
  assert(health?.packageVersion === candidateIdentity.packageVersion, `${label}: health package identity differs`, health);
  assert(health?.candidateFingerprint === candidateIdentity.candidateFingerprint, `${label}: health candidate identity differs`, health);
  assert(health?.ui?.rootPresent === true, `${label}: UI root is not reported present`, health);
  assert(health?.ui?.interactionReady === true, `${label}: UI interaction probe is not healthy`, health);
  assert(health?.ui?.buildId === candidateIdentity.buildId, `${label}: UI build identity differs`, health);
  assert(health?.ui?.packageVersion === candidateIdentity.packageVersion, `${label}: UI package identity differs`, health);
  assert(health?.ui?.candidateFingerprint === candidateIdentity.candidateFingerprint, `${label}: UI candidate identity differs`, health);
  const readiness = health?.readiness || {};
  const requiredTrue = [
    'oneLifecycleOwner',
    'validRuntimeIdentity',
    'persistenceAvailable',
    'oneOwnedRoot',
    'interactionReady',
    'bridgeInitialized',
    'initialObservationAttempted',
    'featureRegistryInitialized',
    'teardownRegistered'
  ];
  for (const key of requiredTrue) assert(readiness[key] === true, `${label}: readiness.${key} is not true`, readiness);
  assert(readiness.coordinationPositive === false, `${label}: B2.1 kernel-only shell unexpectedly reported full coordination readiness`, readiness);
  assert(readiness.coordinationDisposition === 'KERNEL_CONNECTED_B2_1', `${label}: B2.1 kernel connection disposition is missing`, readiness);
  assert(state.claimPresent === false, `${label}: injection claim remained after boot`, state);
  assert(state.bootstrapPresent === false, `${label}: bootstrap marker remained after boot`, state);
}

function assertHealthyB2KernelAuthority(snapshot, label, pageSnapshot = null) {
  assert(snapshot && typeof snapshot === 'object', `${label}: isolated authority snapshot is unavailable`, snapshot);
  assert(!snapshot.snapshotError, `${label}: isolated authority snapshot failed`, snapshot);
  assert(snapshot.enabled === true, `${label}: isolated authority is not enabled`, snapshot);
  assert(snapshot.healthy === true, `${label}: isolated authority is not healthy`, snapshot);
  assert(['OWNER', 'OBSERVER_CONNECTED'].includes(snapshot.disposition), `${label}: isolated authority disposition is not positive`, snapshot);
  assert(isConcreteIdentity(snapshot.workerInstanceId), `${label}: authority worker identity is not concrete`, snapshot);
  assert(Number.isSafeInteger(snapshot.coordinationEpoch) && snapshot.coordinationEpoch >= 1, `${label}: coordination epoch is not concrete`, snapshot);
  assert(Number.isSafeInteger(snapshot.coordinationRevision) && snapshot.coordinationRevision >= 0, `${label}: coordination revision is not concrete`, snapshot);
  assert(Number.isSafeInteger(snapshot.revision) && snapshot.revision >= 0, `${label}: authoritative document revision is not concrete`, snapshot);
  assert(snapshot.subscribed === true, `${label}: isolated authority subscription is not active`, snapshot);
  assert(snapshot.lastError === null, `${label}: isolated authority retained an error`, snapshot);
  assert(isConcreteIdentity(snapshot.runtimeInstanceId), `${label}: authority runtime identity is not concrete`, snapshot);
  assert(isConcreteIdentity(snapshot.documentToken), `${label}: authority document identity is not concrete`, snapshot);
  if (pageSnapshot) {
    assert(snapshot.runtimeInstanceId === pageSnapshot.runtimeInstanceId, `${label}: authority/page runtime identities differ`, { snapshot, pageSnapshot });
    assert(snapshot.documentToken === pageSnapshot.documentToken, `${label}: authority/page document identities differ`, { snapshot, pageSnapshot });
  }
}

class ContentBridge {
  constructor(context, page, extensionId, timeoutMs, candidateIdentity) {
    this.context = context;
    this.page = page;
    this.extensionId = extensionId;
    this.timeoutMs = timeoutMs;
    this.candidateIdentity = { ...candidateIdentity };
    assert(this.candidateIdentity.buildId === CANONICAL_BUILD_ID, 'Content bridge build identity is not canonical', this.candidateIdentity);
    assert(String(this.candidateIdentity.packageVersion || '').trim().length > 0, 'Content bridge package identity is not concrete', this.candidateIdentity);
    assert(/^[0-9a-f]{64}$/.test(this.candidateIdentity.candidateFingerprint), 'Content bridge candidate identity is not concrete', this.candidateIdentity);
    this.session = null;
    this.contexts = new Map();
  }

  async initialize() {
    this.session = await this.context.newCDPSession(this.page);
    this.session.on('Runtime.executionContextCreated', event => {
      this.contexts.set(event.context.id, event.context);
    });
    this.session.on('Runtime.executionContextDestroyed', event => {
      this.contexts.delete(event.executionContextId);
    });
    this.session.on('Runtime.executionContextsCleared', () => this.contexts.clear());
    await this.session.send('Runtime.enable');
    await this.findContentContext();
  }

  async evaluateInContext(contextId, expression) {
    const result = await this.session.send('Runtime.evaluate', {
      contextId,
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Content-world evaluation failed');
    }
    return result.result?.value;
  }

  async findContentContext() {
    return waitFor(async () => {
      for (const [contextId, metadata] of [...this.contexts.entries()]) {
        if (metadata.auxData?.isDefault === true) continue;
        try {
          const probe = await this.evaluateInContext(contextId, `(() => ({
            extensionId: typeof chrome === 'object' && chrome.runtime ? chrome.runtime.id : null,
            topLevel: window.top === window,
            token: document.documentElement?.dataset?.${DOCUMENT_TOKEN_DATASET_KEY} || null
          }))()`);
          if (probe?.extensionId === this.extensionId && probe.topLevel === true) return contextId;
        } catch (_) {}
      }
      return null;
    }, 'the top-frame extension content world', this.timeoutMs);
  }

  async run(expressionBuilder) {
    let contextId = await this.findContentContext();
    try {
      return await this.evaluateInContext(contextId, expressionBuilder());
    } catch (error) {
      if (!/context|execution/i.test(error.message)) throw error;
      contextId = await this.findContentContext();
      return this.evaluateInContext(contextId, expressionBuilder());
    }
  }

  async send(message) {
    const serialized = JSON.stringify(message);
    const serializedIdentity = JSON.stringify(this.candidateIdentity);
    return this.run(() => `(async () => {
      const message = ${serialized};
      Object.assign(message, ${serializedIdentity});
      message.documentToken = document.documentElement?.dataset?.${DOCUMENT_TOKEN_DATASET_KEY} || null;
      return chrome.runtime.sendMessage(message);
    })()`);
  }

  async sendConcurrent(message, count) {
    const serialized = JSON.stringify(message);
    const serializedIdentity = JSON.stringify(this.candidateIdentity);
    return this.run(() => `(async () => {
      const base = ${serialized};
      const token = document.documentElement?.dataset?.${DOCUMENT_TOKEN_DATASET_KEY} || null;
      const identity = ${serializedIdentity};
      return Promise.all(Array.from({ length: ${Number(count)} }, () => chrome.runtime.sendMessage({ ...base, ...identity, documentToken: token })));
    })()`);
  }

  async setEnabled(enabled) {
    const value = Boolean(enabled);
    const serializedIdentity = JSON.stringify(this.candidateIdentity);
    return this.run(() => `(async () => {
      await chrome.storage.local.set({ timerEnabled: ${value} });
      const documentToken = document.documentElement?.dataset?.${DOCUMENT_TOKEN_DATASET_KEY} || null;
      const identity = ${serializedIdentity};
      return chrome.runtime.sendMessage({ type: ${JSON.stringify(MESSAGES.ENABLE)}, enabled: ${value}, ...identity, documentToken });
    })()`);
  }

  async getStorage(keys) {
    const serialized = JSON.stringify(keys);
    return this.run(() => `chrome.storage.local.get(${serialized})`);
  }

  async authoritySnapshot() {
    return this.run(() => `(() => {
      const health = globalThis.__squareCoilCompanionAuthorityHealth;
      if (!health || typeof health.snapshot !== 'function') return null;
      try {
        const snapshot = health.snapshot();
        if (!snapshot || typeof snapshot !== 'object') return null;
        return {
          enabled: snapshot.enabled,
          healthy: snapshot.healthy,
          disposition: snapshot.disposition,
          workerInstanceId: snapshot.workerInstanceId,
          coordinationEpoch: snapshot.coordinationEpoch,
          coordinationRevision: snapshot.coordinationRevision,
          leaseExpiry: snapshot.leaseExpiry,
          revision: snapshot.revision,
          subscribed: snapshot.subscribed,
          lastSequence: snapshot.lastSequence,
          lastError: snapshot.lastError,
          runtimeInstanceId: snapshot.runtimeInstanceId,
          documentToken: snapshot.documentToken
        };
      } catch (error) {
        return { snapshotError: String(error?.message || error) };
      }
    })()`);
  }

  async removeStorage(keys) {
    const serialized = JSON.stringify(keys);
    return this.run(() => `chrome.storage.local.remove(${serialized})`);
  }

  async coreSnapshot() {
    return this.run(() => `(() => {
      const health = globalThis.__squareCoilCompanionAuthorityHealth;
      if (!health || typeof health.coreSnapshot !== 'function') return null;
      return health.coreSnapshot();
    })()`);
  }

  async syncBridge() {
    return this.run(() => `globalThis.__squareCoilCompanionAuthorityHealth.syncBridge()`);
  }

  async timerAction(type) {
    const serialized = JSON.stringify(type);
    return this.run(() => `globalThis.__squareCoilCompanionAuthorityHealth.timerAction(${serialized})`);
  }

  async preferenceAction(patch, expectedPreferenceRevision) {
    const serializedPatch = JSON.stringify(patch);
    const serializedRevision = JSON.stringify(expectedPreferenceRevision);
    return this.run(() => `globalThis.__squareCoilCompanionAuthorityHealth.preferenceAction(${serializedPatch}, ${serializedRevision})`);
  }

  async dataExport(kind, values = {}) {
    const serializedKind = JSON.stringify(kind);
    const serializedValues = JSON.stringify(values);
    return this.run(() => `globalThis.__squareCoilCompanionAuthorityHealth.dataExport(${serializedKind}, ${serializedValues})`);
  }

  async stageDataAction(type, values = {}) {
    const serializedType = JSON.stringify(type);
    const serializedValues = JSON.stringify(values);
    return this.run(() => `globalThis.__squareCoilCompanionAuthorityHealth.stageDataAction(${serializedType}, ${serializedValues})`);
  }

  async commitDataAction(planId, values = {}) {
    const serializedPlanId = JSON.stringify(planId);
    const serializedValues = JSON.stringify(values);
    return this.run(() => `globalThis.__squareCoilCompanionAuthorityHealth.commitDataAction(${serializedPlanId}, ${serializedValues})`);
  }

  async setLegacyValue(key, value) {
    const serializedKey = JSON.stringify(key);
    const serializedValue = JSON.stringify(value);
    return this.run(() => `(() => {
      localStorage.setItem(${serializedKey}, ${serializedValue});
      return localStorage.getItem(${serializedKey});
    })()`);
  }

  async removeLegacyValue(key) {
    const serializedKey = JSON.stringify(key);
    return this.run(() => `(() => {
      localStorage.removeItem(${serializedKey});
      return localStorage.getItem(${serializedKey});
    })()`);
  }

  async authorityTeardown() {
    return this.run(() => `(async () => {
      const health = globalThis.__squareCoilCompanionAuthorityHealth;
      if (!health || typeof health.teardown !== 'function') return { disconnected: true, absent: true };
      return health.teardown();
    })()`);
  }

  async installOneShotResponseHold(type) {
    const serialized = JSON.stringify(type);
    return this.run(() => `(() => {
      if (window.__a4MessageHold) return { installed: false, reason: 'hold-already-installed' };
      const original = chrome.runtime.sendMessage;
      const hold = { type: ${serialized}, seen: 0, releases: [], original, wrapper: null };
      hold.wrapper = function(message, ...args) {
        const result = Reflect.apply(original, chrome.runtime, [message, ...args]);
        if (message?.type !== hold.type || hold.seen > 0) return result;
        hold.seen += 1;
        return Promise.resolve(result).then(value => new Promise(resolve => hold.releases.push(() => resolve(value))));
      };
      try { chrome.runtime.sendMessage = hold.wrapper; } catch (error) {
        return { installed: false, reason: String(error?.message || error) };
      }
      if (chrome.runtime.sendMessage !== hold.wrapper) return { installed: false, reason: 'sendMessage-not-writable' };
      window.__a4MessageHold = hold;
      return { installed: true };
    })()`);
  }

  async heldResponseCount() {
    return this.run(() => `window.__a4MessageHold?.seen || 0`);
  }

  async dispatchPersistedPageShow() {
    return this.run(() => `(() => {
      const event = new Event('pageshow');
      Object.defineProperty(event, 'persisted', { configurable: true, value: true });
      return window.dispatchEvent(event);
    })()`);
  }

  async releaseAndRestoreResponseHold() {
    return this.run(() => `(() => {
      const hold = window.__a4MessageHold;
      if (!hold) return { restored: false, released: 0 };
      const releases = hold.releases.splice(0);
      chrome.runtime.sendMessage = hold.original;
      delete window.__a4MessageHold;
      for (const release of releases) release();
      return { restored: chrome.runtime.sendMessage !== hold.wrapper, released: releases.length };
    })()`);
  }

  async detach() {
    if (this.session) await this.session.detach().catch(() => {});
  }
}

async function createScriptTracker(context, page, extensionId) {
  const session = await context.newCDPSession(page);
  const scripts = new Map();
  session.on('Debugger.scriptParsed', event => {
    if (event.url && event.url.startsWith(`chrome-extension://${extensionId}/`)) {
      scripts.set(`${event.scriptId}:${event.url}`, { scriptId: event.scriptId, url: event.url });
    }
  });
  await session.send('Debugger.enable');
  return {
    companionCount: () => [...scripts.values()].filter(script => script.url.endsWith('/dist/companion-app.js')).length,
    snapshot: () => [...scripts.values()],
    detach: () => session.detach().catch(() => {})
  };
}

function clockContextHtml(clockContext) {
  const id = String(clockContext.projectId);
  const label = String(clockContext.label);
  return `<a href="/project.php?id=${id}">${label}</a>`;
}

function action7Html(clockContext) {
  return `<span id="clockin-remaining-time">${clockContextHtml(clockContext)}</span>`;
}

function fixtureHtml(clockContext) {
  const context = clockContextHtml(clockContext);
  return '<!doctype html><html><head><meta charset="utf-8"><title>SquareCoil B2.2 A4 Synthetic Fixture</title><link rel="icon" href="data:,">' +
    '<style>body,#main,#content_wrapper,#content{background:rgb(238,238,238)}</style></head><body><div id="main"><div id="content_wrapper"><main id="content"><h1>A4 synthetic lifecycle fixture</h1><p>No customer data is loaded.</p><section class="timeclock-container"><button id="clockin" hidden>Clock in</button><button id="clockout">Clock out</button><span id="clockin-debug"></span><span id="clockin-remaining-time">' + context + '</span><div class="clock-actions"></div></section><iframe id="a4-frame" src="' + FRAME_PATH + '"></iframe></main></div></div></body></html>';
}

function frameHtml() {
  return '<!doctype html><html><head><meta charset="utf-8"><title>A4 child frame</title><link rel="icon" href="data:,"></head><body><p>Synthetic child frame</p></body></html>';
}

function emptyUiFixtureHtml() {
  return '<!doctype html><html><head><meta charset="utf-8"><title>SquareCoil Companion Empty Workspace Fixture</title><link rel="icon" href="data:,"></head><body><main><h1>SquareCoil home</h1><section class="timeclock-container"><button id="clockin">Clock in</button><span id="clockin-debug"></span><span id="clockin-remaining-time"></span><div class="clock-actions"></div></section></main></body></html>';
}

function editorFrameHtml() {
  return '<!doctype html><html><head><meta charset="utf-8"><style>html,body{color:rgb(20,30,40);background:rgb(255,255,255)}</style></head><body class="cke_editable cke_editable_themed"><h2>Native editor heading</h2><p id="editor-copy" style="color:black">Native editor copy</p><a href="#native">Native link</a></body></html>';
}

function b5dThemeFixtureHtml(kind) {
  const clock = clockContextHtml({ projectId: '260701', label: '260701 - Design' });
  const nativeCss = '<style>body{margin:0}.vendor-native,.dataTables_wrapper,.select2-dropdown,.select2-selection--single,.qtip,.mfp-content,.fancybox-skin,.fancybox-inner,.dropzone,.cke,.cke_top,.cke_contents,.gantt-container,.gantt_grid,.gantt_task,#pmlt,#customer-name,#customer-info,#showbtns,#projectbox,#descriptionbox,#designbox,#filesbox{color:rgb(20,30,40);background:rgb(255,255,255);border:1px solid rgb(180,185,190);border-radius:0}.paginate_button{color:rgb(20,30,40);background:rgb(245,245,245);border:1px solid rgb(180,185,190)}.mfp-bg,.fancybox-overlay{background:rgba(20,20,20,.25)}#content{padding:30px;overflow-x:visible}.panel-body,.table-responsive{max-width:none;overflow-x:visible}</style>';
  const projectRail = kind === 'vendor' ? '<aside id="pmlt"><h1 id="project-number" class="project-number">260701</h1><div id="project-name" class="project-name">Production fixture</div><strong id="project-owner">Assigned user</strong><nav id="project_menu"><a href="#design">Design</a><a href="#files">Files</a></nav></aside>' : '';
  const productionSurfaces = kind === 'vendor' ? '<section id="customer-name"><h1 id="customer-heading" class="panel-title">Production fixture</h1></section><section id="customer-info" class="panel"><div class="panel-heading"><strong>Project information</strong></div><div class="panel-body">Project detail</div></section><section id="showbtns"><button class="btn">Edit</button></section><section id="projectbox" class="panel"><div class="panel-heading">Project</div><div class="panel-body">Project status</div></section><section id="descriptionbox" class="panel"><div class="panel-heading">Description</div><div id="production-panel-body" class="panel-body"><strong id="description-strong">Readable description</strong></div></section><section id="designbox" class="panel"><div class="panel-heading">Designs</div><div class="panel-body">Design rows</div></section><section id="filesbox" class="panel"><div class="panel-heading">Files</div><div class="panel-body">File rows</div></section>' : '';
  const vendor = kind === 'vendor' ? '<main id="content">' + productionSurfaces + '<section id="data-table" class="dataTables_wrapper"><div class="dataTables_info">Showing rows</div><div class="dataTables_paginate"><button id="paginate-current" class="paginate_button current">1</button></div></section><section id="select2" class="select2-container--default"><div id="select2-selection" class="select2-selection--single"><span class="select2-selection__rendered">Selected</span></div><div id="select2-dropdown" class="select2-dropdown"><div class="select2-results__option select2-results__option--highlighted">Option</div></div></section><aside id="qtip" class="qtip"><div class="qtip-titlebar">Tip</div><div class="qtip-content">Tip content</div></aside><div id="magnific-bg" class="mfp-bg"></div><div id="magnific" class="mfp-content"><button class="mfp-close">Close</button></div><div id="fancybox-overlay" class="fancybox-overlay"></div><div id="fancybox" class="fancybox-skin"><div class="fancybox-inner">Preview</div></div><div id="dropzone" class="dropzone dz-drag-hover">Drop files</div><div id="ckeditor" class="cke"><div id="cke-toolbar" class="cke_top"><div class="cke_toolbox"><span class="cke_toolgroup"><button class="cke_button"><span id="cke-icon" class="cke_button_icon">icon</span></button><button class="cke_button cke_button_disabled"><span id="cke-disabled-icon" class="cke_button_icon">disabled</span></button></span></div></div><div class="cke_contents"><iframe id="editor-frame" class="cke_wysiwyg_frame" src="' + EDITOR_FRAME_PATH + '"></iframe></div></div><div id="standalone-panel-body" class="panel-body"><div class="table-responsive">Responsive table</div></div></main>' : '';
  const gantt = kind === 'gantt' ? '<main id="content"><section id="gantt" class="gantt-container"><div class="gantt_grid"><div class="gantt_grid_scale"><div id="gantt-head" class="gantt_grid_head_cell">Milestone</div></div><div class="gantt_row">Row</div></div><div class="gantt_task"><div class="gantt_task_scale"><div class="gantt_scale_cell">Day</div></div><div class="gantt_task_row">Task</div></div></section></main>' : '';
  return '<!doctype html><html><head><meta charset="utf-8"><title>SquareCoil B5-D Theme Fixture</title><link rel="icon" href="data:,">' + nativeCss + '</head><body class="mobile-view sb-l-m"><div id="content_wrapper"><div id="topbar">Topbar</div>' + projectRail + vendor + gantt + '</div><section class="timeclock-container"><button id="clockin" hidden>Clock in</button><button id="clockout">Clock out</button><span id="clockin-debug"></span><span id="clockin-remaining-time">' + clock + '</span><div class="clock-actions"></div></section></body></html>';
}

function dashboardFixtureHtml() {
  const clock = clockContextHtml({ projectId: '260701', label: '260701 - Design' });
  return '<!doctype html><html><head><meta charset="utf-8"><title>SquareCoil Design Dashboard Fixture</title><link rel="icon" href="data:,"></head><body><main><div id="content"><div class="mw1000 center-block demo-block mt30"><section id="widget-tasks"><div><h2>17</h2><h5>Tasks</h5></div></section><section id="widget-designs"><div><h2>8</h2><h5>Designs</h5></div></section><section id="widget-estimates"><div><h2>3</h2><h5>Estimates</h5></div></section><div id="page-content"><div class="panel heading-border panel-primary"><div class="panel-body bg-light"><select id="multiple_location_id"><option value="shop-2" selected>Shop 2</option></select><div id="db-designs"><div id="inProgress" class="design-list-container"><a class="clickableRowx" href="/project.php?id=260701">A</a><a class="clickableRowx" href="/project.php?id=260702">B</a></div><div id="nextJob" class="design-list-container"><button disabled>Native disabled</button></div><div id="onHold" class="design-list-container"><span class="text-warning">Native warning</span></div></div></div></div></div></div><div id="description-modal"><div class="modal-content"><button>Close</button></div></div><section class="timeclock-container"><button id="clockin" hidden>Clock in</button><button id="clockout">Clock out</button><span id="clockin-debug"></span><span id="clockin-remaining-time">' + clock + '</span><div class="clock-actions"></div></section></main></body></html>';
}

function probeThemeFixtureHtml(kind) {
  const clock = clockContextHtml({ projectId: '260701', label: '260701 - Design' });
  const menu = '<header class="navbar"><ul id="user-menu" class="dropdown-menu list-group dropdown-persist"><li class="list-group-item"><a href="#user">User</a></li><li class="dropdown-footer">User footer</li></ul><ul id="help-menu" class="dropdown-menu list-group dropdown-persist"><li class="list-group-item"><button type="button">Help</button></li><li class="dropdown-footer">Help footer</li></ul></header>';
  const leads = kind === 'leads'
    ? '<section id="leads-fixture" class="admin-form"><div class="panel"><input id="lead-filter" class="gui-input" value="Open leads"><select id="lead-owner" class="input-sm"><option selected>All owners</option></select></div></section>'
    : '';
  const calendar = kind === 'calendar'
    ? '<section id="calendar-fixture" class="fc"><table><thead><tr><th class="fc-widget-header">Monday</th></tr></thead><tbody><tr><td id="calendar-day" class="fc-day fc-widget-content"><article id="calendar-event" class="fc-event" style="border-color:rgb(12, 180, 95)"><div class="fc-content"><span class="fc-title">Install</span><div class="cp"></div></div></article></td></tr></tbody></table></section>'
    : '';
  const nativeCss = '<style>.dropdown-persist,.dropdown-persist>li{color:rgb(21,31,41);background:rgb(250,250,250);border:1px solid rgb(190,195,200)}.dropdown-persist a,.dropdown-persist button{color:rgb(21,31,41)}.admin-form input,.admin-form select{color:rgb(21,31,41);background:rgb(255,255,255);border:1px solid rgb(180,185,190);border-radius:0}.fc .fc-day,.fc .fc-widget-content,.fc .fc-widget-header{color:rgb(21,31,41);background-color:rgb(255,255,255);border-color:rgb(190,195,200)}.fc .fc-event{color:rgb(21,31,41);background:rgb(250,250,250);border-width:1px;border-style:solid}.fc .fc-event .cp{height:4px;background:rgb(230,230,230)}</style>';
  return '<!doctype html><html><head><meta charset="utf-8"><title>SquareCoil B5-C Theme Fixture</title><link rel="icon" href="data:,">' + nativeCss + '</head><body>' + menu + '<main>' + leads + calendar + '<section class="timeclock-container"><button id="clockin" hidden>Clock in</button><button id="clockout">Clock out</button><span id="clockin-debug"></span><span id="clockin-remaining-time">' + clock + '</span><div class="clock-actions"></div></section></main></body></html>';
}

async function installSyntheticRouting(context, networkEvidence, transitionFixture, routingOptions = {}) {
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.protocol === 'chrome-extension:') return route.continue();
    if (url.origin === FIXTURE_ORIGIN && url.pathname === FIXTURE_PATH) {
      networkEvidence.fulfilled.push(url.href);
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixtureHtml(transitionFixture.clockContext) });
    }
    if (url.origin === FIXTURE_ORIGIN && url.pathname === FRAME_PATH) {
      networkEvidence.fulfilled.push(url.href);
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: frameHtml() });
    }
    if (url.origin === FIXTURE_ORIGIN && url.pathname === EMPTY_UI_PATH) {
      networkEvidence.fulfilled.push(url.href);
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: emptyUiFixtureHtml() });
    }
    if (url.origin === FIXTURE_ORIGIN && url.pathname === EDITOR_FRAME_PATH) {
      networkEvidence.fulfilled.push(url.href);
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: editorFrameHtml() });
    }
    if (url.origin === FIXTURE_ORIGIN && url.pathname === DASHBOARD_PATH) {
      networkEvidence.fulfilled.push(url.href);
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: dashboardFixtureHtml() });
    }
    if (url.origin === FIXTURE_ORIGIN && [THEME_GENERIC_PATH, LEADS_PATH, CALENDAR_PATH].includes(url.pathname)) {
      networkEvidence.fulfilled.push(url.href);
      const kind = url.pathname === LEADS_PATH ? 'leads' : url.pathname === CALENDAR_PATH ? 'calendar' : 'generic';
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: probeThemeFixtureHtml(kind) });
    }
    if (url.origin === FIXTURE_ORIGIN && [VENDOR_THEME_PATH, GANTT_THEME_PATH, LOOKALIKE_VENDOR_PATH].includes(url.pathname)) {
      networkEvidence.fulfilled.push(url.href);
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: b5dThemeFixtureHtml(url.pathname === GANTT_THEME_PATH ? 'gantt' : 'vendor') });
    }
    if (url.origin === FIXTURE_ORIGIN && url.pathname === '/ajax_time_clock.php') {
      const body = request.postData() || '';
      const record = { url: url.href, method: request.method(), body };
      if (request.method() === 'POST' && body === 'action=7') {
        networkEvidence.action7.push(record);
        const frameUrl = request.frame()?.url?.() || '';
        const emptySource = (() => { try { return new URL(frameUrl).pathname === EMPTY_UI_PATH; } catch (_) { return false; } })();
        return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: emptySource ? '<span id="clockin-remaining-time"></span>' : action7Html(transitionFixture.clockContext) });
      }
      networkEvidence.nativeMutationAttempts.push(record);
      return route.abort('blockedbyclient');
    }
    if (url.origin === FIXTURE_ORIGIN && decodeURIComponent(url.pathname).endsWith(`/images/${WEBSITE_LOGO_FILENAME}`)) {
      networkEvidence.fulfilled.push(url.href);
      return route.fulfill({ status: 200, contentType: 'image/png',
        body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') });
    }
    if (url.origin === 'https://www.bing.com' && url.pathname === '/HPImageArchive.aspx' &&
        url.searchParams.get('format') === 'js' && url.searchParams.get('idx') === '0' &&
        url.searchParams.get('n') === '1' && BING_MARKETS.includes(url.searchParams.get('mkt')) &&
        url.searchParams.get('uhd') === '1' && url.searchParams.get('uhdwidth') === '3840' &&
        url.searchParams.get('uhdheight') === '2160' && [...url.searchParams.keys()].length === 7) {
      const market = url.searchParams.get('mkt');
      const headers = request.headers();
      networkEvidence.bing.push({ url: url.href, resourceType: request.resourceType(), kind: 'metadata',
        cookieHeaderPresent: Boolean(headers.cookie), referrerHeaderPresent: Boolean(headers.referer || headers.referrer),
        authorizationHeaderPresent: Boolean(headers.authorization) });
      if (routingOptions.networkUnavailable !== false) return route.abort('internetdisconnected');
      if (routingOptions.liveBing === true) return route.continue();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ images: [{
        url: `/th?rf=discarded.jpg&providerFuture=discarded&id=OHR.SquareCoilAcceptance_${market}_UHD.jpg&pid=discarded&w=12&c=99`, title: `Synthetic ${market} acceptance wallpaper`, startdate: '20260828'
      }] }) });
    }
    if (url.origin === 'https://www.bing.com' && url.pathname === '/th' &&
        /^OHR\.[A-Za-z0-9][A-Za-z0-9_-]{0,180}_UHD\.jpg$/.test(url.searchParams.get('id') || '') &&
        url.searchParams.get('w') === '3840' && url.searchParams.get('h') === '2160' &&
        url.searchParams.get('rs') === '1' && url.searchParams.get('c') === '4' &&
        [...url.searchParams.keys()].join(',') === 'id,w,h,rs,c') {
      const headers = request.headers();
      networkEvidence.bing.push({ url: url.href, resourceType: request.resourceType(), kind: 'image',
        cookieHeaderPresent: Boolean(headers.cookie), referrerHeaderPresent: Boolean(headers.referer || headers.referrer),
        authorizationHeaderPresent: Boolean(headers.authorization) });
      if (routingOptions.networkUnavailable !== false) return route.abort('internetdisconnected');
      if (routingOptions.liveBing === true) return route.continue();
      return route.fulfill({ status: 200, contentType: 'image/png',
        body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') });
    }
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      networkEvidence.blockedUnexpected.push({ url: url.href, resourceType: request.resourceType() });
      return route.abort('blockedbyclient');
    }
    return route.continue();
  });
}

async function runCase(cases, id, name, task, metadata = {}) {
  const started = Date.now();
  process.stderr.write(`${id}: START\n`);
  try {
    const evidence = await task();
    const record = { id, name, ...metadata, status: 'PASS', durationMs: Date.now() - started, evidence: evidence || null };
    cases.push(record);
    process.stderr.write(`${id}: PASS (${record.durationMs}ms)\n`);
    return record;
  } catch (error) {
    const record = {
      id,
      name,
      ...metadata,
      status: error instanceof UnsupportedCase ? 'UNSUPPORTED' : 'FAIL',
      durationMs: Date.now() - started,
      error: error.message,
      details: error.details || null
    };
    cases.push(record);
    process.stderr.write(`${id}: ${record.status} (${record.durationMs}ms) ${record.error}\n`);
    return record;
  }
}

function browserFixtureId(family, stableFixtureIds, slug) {
  const browserCode = family === 'chrome' ? 'CH' : 'ED';
  const stable = stableFixtureIds.map(value => value.replace('B1-LC-', '')).join('-');
  return `A4-B1-${browserCode}-${stable}-${slug}`;
}

function runBrowserCase(cases, family, stableFixtureIds, slug, name, task) {
  for (const fixtureId of stableFixtureIds) {
    if (!REQUIRED_A4_STABLE_FIXTURE_IDS.includes(fixtureId)) throw new Error(`Unknown A4 stable fixture ID: ${fixtureId}`);
  }
  return runCase(cases, browserFixtureId(family, stableFixtureIds, slug), name, task, { stableFixtureIds });
}

async function downloadFromActionPopup(context, browserCdp, extensionId, profileDirectory, timeoutMs) {
  const worker = context.serviceWorkers().find(item => item.url().startsWith(`chrome-extension://${extensionId}/`));
  assert(worker, 'Diagnostic action popup requires the real installed extension worker');
  const beforeTargets = new Set((await browserCdp.send('Target.getTargets')).targetInfos.map(item => item.targetId));
  await worker.evaluate(() => chrome.action.openPopup());
  const target = await waitFor(async () => (await browserCdp.send('Target.getTargets')).targetInfos.find(item =>
    !beforeTargets.has(item.targetId) && item.type === 'page' && item.url === `chrome-extension://${extensionId}/popup/popup.html`),
  'genuine extension action popup target', timeoutMs);
  const { sessionId } = await browserCdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: false });
  let commandId = 0;
  const pending = new Map();
  const receive = event => {
    if (event.sessionId !== sessionId) return;
    const message = JSON.parse(event.message);
    const operation = pending.get(message.id);
    if (!operation) return;
    pending.delete(message.id);
    clearTimeout(operation.timer);
    if (message.error) operation.reject(new Error(message.error.message));
    else operation.resolve(message.result);
  };
  browserCdp.on('Target.receivedMessageFromTarget', receive);
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++commandId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Action popup CDP ${method} timed out`)); }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    browserCdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) }).catch(error => {
      clearTimeout(timer); pending.delete(id); reject(error);
    });
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert(!result.exceptionDetails, 'Action popup evaluation failed', result.exceptionDetails);
    return result.result?.value;
  };
  const click = async selector => {
    const point = await evaluate(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) return null;
      node.scrollIntoView({ block: 'center', behavior: 'instant' });
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null;
    })()`);
    assert(point, 'Genuine popup control was not visible', { selector });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  };
  const downloadDirectory = path.join(profileDirectory, 'diagnostic-download');
  assert(pathIsWithin(downloadDirectory, profileDirectory), 'Diagnostic download directory escaped its isolated profile');
  fs.mkdirSync(downloadDirectory, { recursive: true });
  let download = null;
  let progress = null;
  const begin = event => { if (event.url.startsWith(`blob:chrome-extension://${extensionId}/`)) download = event; };
  const update = event => { if (download?.guid === event.guid) progress = event; };
  browserCdp.on('Browser.downloadWillBegin', begin);
  browserCdp.on('Browser.downloadProgress', update);
  try {
    const genuinePopupView = await evaluate('chrome.extension.getViews({type:"popup"}).includes(window)');
    assert(genuinePopupView === true, 'Diagnostic fixture is an extension tab rather than the toolbar action popup');
    await evaluate(`document.addEventListener('click', event => {
      if (event.target.id === 'downloadDiagnosticLog') globalThis.__a4TrustedDiagnosticDownload = event.isTrusted;
    }, true)`);
    await click('.technical-card > summary');
    await browserCdp.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: downloadDirectory, eventsEnabled: true });
    await click('#downloadDiagnosticLog');
    await waitFor(() => {
      assert(progress?.state !== 'canceled', 'Genuine popup diagnostic download was canceled');
      return progress?.state === 'completed' ? progress : null;
    }, 'genuine popup diagnostic download completion', timeoutMs);
    const filename = download.suggestedFilename;
    assert(/^[A-Za-z0-9-]+$/.test(download.guid), 'Browser supplied an invalid diagnostic download identity');
    const downloadedPath = path.join(downloadDirectory, download.guid);
    assert(pathIsWithin(downloadedPath, downloadDirectory), 'Diagnostic download escaped its isolated directory');
    const bytes = fs.readFileSync(downloadedPath);
    const status = await evaluate('document.getElementById("diagnosticDownloadResult").textContent');
    const trustedDownloadClick = await evaluate('globalThis.__a4TrustedDiagnosticDownload === true');
    assert(trustedDownloadClick && status.startsWith('Download started for '), 'Genuine popup download omitted trusted input or success status', { trustedDownloadClick, status });
    return { bytes, filename, genuinePopupView, trustedDownloadClick };
  } finally {
    browserCdp.off('Browser.downloadWillBegin', begin);
    browserCdp.off('Browser.downloadProgress', update);
    browserCdp.off('Target.receivedMessageFromTarget', receive);
    for (const operation of pending.values()) { clearTimeout(operation.timer); operation.reject(new Error('Action popup closed')); }
    await browserCdp.send('Target.detachFromTarget', { sessionId }).catch(() => {});
    await browserCdp.send('Target.closeTarget', { targetId: target.targetId }).catch(() => {});
    await browserCdp.send('Browser.setDownloadBehavior', { behavior: 'default', eventsEnabled: false }).catch(() => {});
  }
}

function runB2KernelBrowserCase(cases, family, b2KernelFixtureIds, stableFixtureIds, slug, name, task, extraMetadata = {}) {
  for (const fixtureId of b2KernelFixtureIds) {
    if (!REQUIRED_B2_1_A4_FIXTURE_IDS.includes(fixtureId)) throw new Error(`Unknown B2.1 A4 fixture ID: ${fixtureId}`);
  }
  for (const fixtureId of stableFixtureIds) {
    if (!REQUIRED_A4_STABLE_FIXTURE_IDS.includes(fixtureId)) throw new Error(`Unknown B1 A4 stable fixture ID: ${fixtureId}`);
  }

  for (const fixtureId of extraMetadata.b2ReadyFixtureIds || []) {
    if (!REQUIRED_B2_READY_A4_FIXTURE_IDS.includes(fixtureId)) throw new Error(`Unknown final B2 READY A4 fixture ID: ${fixtureId}`);
  }
  const browserCode = family === 'chrome' ? 'CH' : 'ED';
  const fixtureCode = b2KernelFixtureIds.map(value => value.replace('B2-KERNEL-', '')).join('-');
  return runCase(
    cases,
    `A4-B2.1-${browserCode}-${fixtureCode}-${slug}`,
    name,
    task,
    {
      stableFixtureIds,
      b2KernelFixtureIds,
      b2Scope: 'ISOLATED_AUTHORITY_KERNEL_ONLY',
      ...extraMetadata
    }
  );
}

function runB2TransitionBrowserCase(cases, family, fixtureIds, slug, name, task, extraMetadata = {}) {
  for (const fixtureId of fixtureIds) {
    if (!REQUIRED_B2_2_A4_FIXTURE_IDS.includes(fixtureId)) throw new Error(`Unknown B2.2 A4 fixture ID: ${fixtureId}`);
  }
  for (const fixtureId of extraMetadata.b2ReadyFixtureIds || []) {
    if (!REQUIRED_B2_READY_A4_FIXTURE_IDS.includes(fixtureId)) throw new Error(`Unknown final B2 READY A4 fixture ID: ${fixtureId}`);
  }
  for (const fixtureId of extraMetadata.b3WorkspaceFixtureIds || []) {
    if (!REQUIRED_B3_WORKSPACE_A4_FIXTURE_IDS.includes(fixtureId)) throw new Error(`Unknown B3 workspace A4 fixture ID: ${fixtureId}`);
  }
  const browserCode = family === 'chrome' ? 'CH' : 'ED';
  const fixtureCode = fixtureIds.map(value => value.replace('B2-TRANSITION-', '')).join('-');
  return runCase(cases, `A4-B2.2-${browserCode}-${fixtureCode}-${slug}`, name, task, {
    b2TransitionFixtureIds: fixtureIds,
    b2Scope: 'TRUSTED_TRANSITION_CORE_PARTIAL',
    ...extraMetadata
  });
}

function runB3WorkspaceBrowserCase(cases, family, fixtureIds, slug, name, task) {
  for (const fixtureId of fixtureIds) {
    if (!REQUIRED_B3_WORKSPACE_A4_FIXTURE_IDS.includes(fixtureId)) throw new Error(`Unknown B3 workspace A4 fixture ID: ${fixtureId}`);
  }
  const browserCode = family === 'chrome' ? 'CH' : 'ED';
  const fixtureCode = fixtureIds.map(value => value.replace('B3-WORKSPACE-', '')).join('-');
  return runCase(cases, `A4-B3-${browserCode}-${fixtureCode}-${slug}`, name, task, {
    b3WorkspaceFixtureIds: fixtureIds,
    b3Scope: 'CANONICAL_TIME_VIEWS_WORKSPACE'
  });
}

function runB4DataBrowserCase(cases, family, fixtureIds, slug, name, task) {
  for (const fixtureId of fixtureIds) {
    if (!REQUIRED_B4_DATA_A4_FIXTURE_IDS.includes(fixtureId)) throw new Error(`Unknown B4 data A4 fixture ID: ${fixtureId}`);
  }
  const browserCode = family === 'chrome' ? 'CH' : 'ED';
  const fixtureCode = fixtureIds.map(value => value.replace('B4-DATA-', '')).join('-');
  return runCase(cases, `A4-B4-${browserCode}-${fixtureCode}-${slug}`, name, task, {
    b4DataFixtureIds: fixtureIds,
    b4Scope: 'DATA_SAFETY_BACKUP_RESTORE_CSV'
  });
}

function runB5SettingsBrowserCase(cases, family, fixtureIds, slug, name, task) {
  for (const fixtureId of fixtureIds) {
    if (!REQUIRED_B5_SETTINGS_A4_FIXTURE_IDS.includes(fixtureId)) throw new Error(`Unknown B5-A settings A4 fixture ID: ${fixtureId}`);
  }
  const browserCode = family === 'chrome' ? 'CH' : 'ED';
  const fixtureCode = fixtureIds.map(value => value.replace('B5-SETTINGS-', '')).join('-');
  return runCase(cases, `A4-B5-A-${browserCode}-${fixtureCode}-${slug}`, name, task, {
    b5SettingsFixtureIds: fixtureIds,
    b5Scope: 'SETTINGS_PRESENTATION_READINESS'
  });
}

function runB5OptionalBrowserCase(cases, family, fixtureIds, slug, name, task) {
  for (const fixtureId of fixtureIds) {
    if (!REQUIRED_B5B_A4_FIXTURE_IDS.includes(fixtureId)) throw new Error(`Unknown B5-B A4 fixture ID: ${fixtureId}`);
  }
  const browserCode = family === 'chrome' ? 'CH' : 'ED';
  const fixtureCode = fixtureIds.map(value => value.replace('B5B-', '')).join('-');
  return runCase(cases, `A4-B5-B-${browserCode}-${fixtureCode}-${slug}`, name, task, {
    b5OptionalFixtureIds: fixtureIds,
    b5OptionalScope: 'OPTIONAL_PRESENTATION_PACKS'
  });
}

function runB5CThemeBrowserCase(cases, family, fixtureIds, slug, name, task) {
  for (const fixtureId of fixtureIds) {
    if (!REQUIRED_B5C_A4_FIXTURE_IDS.includes(fixtureId)) throw new Error(`Unknown B5-C A4 fixture ID: ${fixtureId}`);
  }
  const browserCode = family === 'chrome' ? 'CH' : 'ED';
  const fixtureCode = fixtureIds.map(value => value.replace('B5C-', '')).join('-');
  return runCase(cases, `A4-B5-C-${browserCode}-${fixtureCode}-${slug}`, name, task, {
    b5cThemeFixtureIds: fixtureIds,
    b5cThemeScope: 'PROBE_BACKED_ROUTE_BOUNDED_THEME_ADAPTERS'
  });
}

function runB5DThemeBrowserCase(cases, family, fixtureIds, slug, name, task) {
  for (const fixtureId of fixtureIds) {
    if (!REQUIRED_B5D_A4_FIXTURE_IDS.includes(fixtureId)) throw new Error(`Unknown B5-D A4 fixture ID: ${fixtureId}`);
  }
  const browserCode = family === 'chrome' ? 'CH' : 'ED';
  const fixtureCode = fixtureIds.map(value => value.replace('B5D-', '')).join('-');
  return runCase(cases, `A4-B5-D-${browserCode}-${fixtureCode}-${slug}`, name, task, {
    b5dThemeFixtureIds: fixtureIds,
    b5dThemeScope: 'ROUTE_BOUNDED_VENDOR_THEME_AND_ZERO_HISTORY_UI'
  });
}

async function captureUiEvidence(page, options, family, name, selector = 'body') {
  if (!options.evidencePath) return null;
  const evidenceBase = path.basename(options.evidencePath, path.extname(options.evidencePath));
  const directory = path.join(path.dirname(options.evidencePath), `${evidenceBase}-screenshots`);
  fs.mkdirSync(directory, { recursive: true });
  const outputPath = path.join(directory, `${family}-${name}.png`);
  await page.locator(selector).screenshot({ path: outputPath, animations: 'disabled' });
  return outputPath;
}

async function capturePageEvidence(page, options, family, name) {
  if (!options.evidencePath) return null;
  const evidenceBase = path.basename(options.evidencePath, path.extname(options.evidencePath));
  const directory = path.join(path.dirname(options.evidencePath), `${evidenceBase}-screenshots`);
  fs.mkdirSync(directory, { recursive: true });
  const outputPath = path.join(directory, `${family}-${name}.png`);
  await page.screenshot({ path: outputPath, fullPage: true, animations: 'disabled' });
  return outputPath;
}

async function inspectVisibleCinematicPhoto(page, expectedTheme) {
  return page.evaluate(async expected => {
    const host = document.getElementById('squarecoil-companion-cinematic-host');
    const layers = Array.from(host?.querySelectorAll('.sc-cinematic-layer') || []);
    const active = layers.find(layer => layer.getAttribute('data-active') === 'true') || null;
    if (!host || !active) return { expectedTheme: expected, host: false, activeLayer: false };
    const customImage = active.style.getPropertyValue('--us-squarecoil-cine-image');
    const computed = getComputedStyle(active);
    const rect = active.getBoundingClientRect();
    const match = /^url\(["']?(data:image\/(?:jpeg|png|webp);base64,[^)"']+)["']?\)$/.exec(customImage);
    let decoded = null;
    if (match) decoded = await new Promise(resolve => {
      const image = new Image();
      const timer = setTimeout(() => resolve({ error: 'decode-timeout' }), 5000);
      image.onload = () => {
        clearTimeout(timer);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 32; canvas.height = 18;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          const buckets = new Set(); let minLuma = 255; let maxLuma = 0;
          for (let index = 0; index < pixels.length; index += 4) {
            buckets.add(`${pixels[index] >> 4}-${pixels[index + 1] >> 4}-${pixels[index + 2] >> 4}`);
            const luma = (pixels[index] * .2126) + (pixels[index + 1] * .7152) + (pixels[index + 2] * .0722);
            minLuma = Math.min(minLuma, luma); maxLuma = Math.max(maxLuma, luma);
          }
          resolve({ width: image.naturalWidth, height: image.naturalHeight,
            sampledPixels: canvas.width * canvas.height, uniqueColorBuckets: buckets.size,
            luminanceRange: Number((maxLuma - minLuma).toFixed(2)) });
        } catch (error) { resolve({ error: String(error?.message || error) }); }
      };
      image.onerror = () => { clearTimeout(timer); resolve({ error: 'decode-failed' }); };
      image.src = match[1];
    });
    return {
      expectedTheme: expected,
      host: true,
      hostTheme: host.dataset.theme || null,
      activeLayer: true,
      activeLayerCount: layers.filter(layer => layer.getAttribute('data-active') === 'true').length,
      inlineImagePresent: Boolean(match),
      inlineImageBytes: customImage.length,
      inlineImagePriority: active.style.getPropertyPriority('--us-squarecoil-cine-image'),
      computedImagePresent: /data:image\/(?:jpeg|png|webp);base64,/.test(computed.backgroundImage),
      opacity: computed.opacity,
      backgroundSize: computed.backgroundSize,
      rect: { width: Math.round(rect.width), height: Math.round(rect.height) },
      viewport: { width: innerWidth, height: innerHeight },
      decoded
    };
  }, expectedTheme);
}

function assertVisibleCinematicPhoto(evidence) {
  assert(evidence.host === true && evidence.activeLayer === true && evidence.activeLayerCount === 1,
    'Cinematic photograph must own exactly one active visible layer', evidence);
  assert(evidence.hostTheme === evidence.expectedTheme && evidence.inlineImagePresent === true &&
    evidence.inlineImagePriority === 'important' && evidence.computedImagePresent === true && evidence.opacity === '1',
  'Cinematic photograph is not the computed visible image for the selected Glass theme', evidence);
  assert(evidence.rect.width >= evidence.viewport.width && evidence.rect.height >= evidence.viewport.height &&
    /cover/.test(evidence.backgroundSize), 'Cinematic photograph does not cover the installed page viewport', evidence);
  assert(evidence.decoded?.width > 1 && evidence.decoded?.height > 1 &&
    evidence.decoded.uniqueColorBuckets >= 20 && evidence.decoded.luminanceRange >= 16,
  'The loaded Bing asset did not decode as a visibly varied photograph', evidence);
}

async function beginTrustedTabDragOutside(page, contextId, timeoutMs) {
  const box = await waitFor(async () => page.evaluate(({ rootId, id }) => {
    const tab = document.querySelector(`#${rootId} .sc-tab[data-context="${CSS.escape(id)}"]`);
    if (!tab) return null;
    const rect = tab.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0
      ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      : null;
  }, { rootId: ROOT_ID, id: contextId }), `trusted drag source ${contextId}`, timeoutMs);
  assert(box && box.width > 0 && box.height > 0, `Tab ${contextId} was not available for a trusted drag`, box);
  const viewport = page.viewportSize();
  assert(viewport, 'Installed-browser drag acceptance requires a fixed viewport');
  const source = { x: box.x + (box.width / 2), y: box.y + (box.height / 2) };
  const target = { x: Math.min(48, viewport.width - 1), y: Math.min(120, viewport.height - 1) };
  const targetState = await page.evaluate(({ rootId, point }) => {
    const root = document.getElementById(rootId);
    const targetNode = document.elementFromPoint(point.x, point.y);
    return {
      hasTarget: Boolean(targetNode),
      targetInsideCompanion: Boolean(root && targetNode && root.contains(targetNode))
    };
  }, { rootId: ROOT_ID, point: target });
  assert(targetState.hasTarget && !targetState.targetInsideCompanion,
    'Trusted drag target must resolve to the visible website outside Companion', { target, targetState });
  await page.mouse.move(source.x, source.y);
  await page.mouse.down();
  await page.mouse.move(source.x - 8, source.y - 8, { steps: 4 });
  await page.mouse.move(target.x, target.y, { steps: 24 });
  return { source, target };
}

async function visibleArchiveVeil(page, timeoutMs, expectedTone) {
  return waitFor(async () => page.evaluate(({ rootId, tone }) => {
    const root = document.getElementById(rootId);
    const veil = document.querySelector(`#${rootId} .sc-archive-veil`);
    if (!veil || veil.dataset.visible !== 'true' || veil.dataset.tone !== tone) return null;
    const rect = veil.getBoundingClientRect();
    const style = getComputedStyle(veil);
    const shell = root?.querySelector('.sc-proto-shell');
    const topbar = root?.querySelector('.sc-proto-topbar');
    const content = root?.querySelector('.sc-content');
    const elementState = element => {
      if (!element) return null;
      const elementRect = element.getBoundingClientRect();
      const elementStyle = getComputedStyle(element);
      return {
        connected: element.isConnected,
        childElementCount: element.childElementCount,
        textLength: String(element.innerText || '').trim().length,
        display: elementStyle.display,
        visibility: elementStyle.visibility,
        opacity: elementStyle.opacity,
        color: elementStyle.color,
        backgroundColor: elementStyle.backgroundColor,
        rect: { left: elementRect.left, top: elementRect.top, right: elementRect.right, bottom: elementRect.bottom,
          width: elementRect.width, height: elementRect.height }
      };
    };
    return {
      tone: veil.dataset.tone,
      title: veil.querySelector('[data-sc-archive-veil-title]')?.textContent || '',
      detail: veil.querySelector('[data-sc-archive-veil-detail]')?.textContent || '',
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      viewport: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
      backgroundColor: style.backgroundColor,
      companionDom: {
        rootConnected: Boolean(root?.isConnected),
        rootDragging: root?.dataset.dragging || null,
        shell: elementState(shell),
        topbar: elementState(topbar),
        content: elementState(content)
      }
    };
  }, { rootId: ROOT_ID, tone: expectedTone }).then(value => {
    if (!value) return null;
    const dom = value.companionDom;
    const elementVisible = element => element?.connected === true && element.display !== 'none' && element.visibility === 'visible' &&
      Number(element.opacity) > 0 && element.rect.width > 0 && element.rect.height > 0 && element.childElementCount > 0 && element.textLength > 0;
    return value.rect.left <= 0 && value.rect.top <= 0 && value.rect.right >= value.viewport.width &&
      value.rect.bottom >= value.viewport.height && value.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
      dom?.rootConnected === true && dom.rootDragging === 'true' && elementVisible(dom.shell) &&
      elementVisible(dom.topbar) && elementVisible(dom.content) ? value : null;
  }), `${expectedTone} whole-page archive veil`, timeoutMs);
}

function runB6CandidateBrowserCase(cases, family, fixtureIds, slug, name, task, extraMetadata = {}) {
  for (const fixtureId of fixtureIds) {
    if (!REQUIRED_B6_A4_FIXTURE_IDS.includes(fixtureId)) throw new Error(`Unknown B6 A4 fixture ID: ${fixtureId}`);
  }
  const browserCode = family === 'chrome' ? 'CH' : 'ED';
  const fixtureCode = fixtureIds.map(value => value.replace('B6-', '')).join('-');
  return runCase(cases, `A4-B6-${browserCode}-${fixtureCode}-${slug}`, name, task, {
    b6CandidateFixtureIds: fixtureIds,
    b6Scope: 'EXACT_RELEASE_CANDIDATE_ACCEPTANCE',
    ...extraMetadata
  });
}

async function ensureWorkspaceExpanded(page, timeoutMs) {
  const content = page.locator(`#${ROOT_ID} .sc-content`);
  if (!await content.isVisible().catch(() => false)) {
    await clickWorkspaceControl(page, `[data-action="collapse"]`, timeoutMs);
  }
  await content.waitFor({ state: 'visible', timeout: timeoutMs });
}

async function clickWorkspaceControl(page, selector, timeoutMs) {
  await page.bringToFront();
  const control = page.locator(`#${ROOT_ID} ${selector}`);
  await control.hover({ timeout: timeoutMs });
  await control.click({ timeout: timeoutMs });
}

async function clickMoreTool(page, destination, timeoutMs) {
  const tools = page.locator(`#${ROOT_ID} .sc-quick-links`);
  if (!await tools.evaluate(node => node.open)) {
    await clickWorkspaceControl(page, '.sc-quick-links summary', timeoutMs);
  }
  await clickWorkspaceControl(page, `.sc-quick-links [data-action="view"][data-view="${destination}"]`, timeoutMs);
}

async function revealWorkspaceTab(page, contextId, timeoutMs) {
  const tab = page.locator(`#${ROOT_ID} .sc-tab[data-context="${contextId}"]`);
  await tab.waitFor({ state: 'attached', timeout: timeoutMs });
  await tab.evaluate(node => node.scrollIntoView({ block: 'nearest', inline: 'center' }));
  await waitFor(async () => {
    const tabBox = await tab.boundingBox();
    const stripBox = await page.locator(`#${ROOT_ID} .sc-tabs`).boundingBox();
    return tabBox && stripBox && tabBox.width > 0 && tabBox.height > 0 &&
      tabBox.x >= stripBox.x - 1 && tabBox.x + tabBox.width <= stripBox.x + stripBox.width + 1 ? true : null;
  }, `visible workspace tab ${contextId}`, timeoutMs);
  return tab;
}

async function clickWorkspaceTab(page, contextId, timeoutMs) {
  const tab = await revealWorkspaceTab(page, contextId, timeoutMs);
  // The live elapsed-time refresh intentionally replaces tab DOM nodes. A
  // forced Playwright click remains a trusted browser input while avoiding a
  // false requirement that the rendered node stay motionless between ticks.
  await tab.click({ timeout: timeoutMs, force: true });
}

function timerLedgerBoundaryIdentity(snapshot) {
  const timer = snapshot?.timer || {};
  return {
    ledgerSegmentCount: snapshot?.ledgerSegmentCount,
    currentContextId: timer.currentContextId || null,
    running: timer.running ? {
      sessionId: timer.running.sessionId || null,
      cycleId: timer.running.cycleId || null,
      startedAtMs: timer.running.startedAtMs || null
    } : null,
    history: (timer.historyRows || []).map(row => ({
      logicalSessionId: row.logicalSessionId,
      startAtMs: row.startAtMs,
      endAtMs: row.endAtMs,
      durationMs: row.durationMs,
      segmentIds: row.segmentIds
    }))
  };
}

async function openSettingsHome(page, timeoutMs) {
  await ensureWorkspaceExpanded(page, timeoutMs);
  const heading = page.locator(`#${ROOT_ID} [data-sc-view-heading]`);
  if (await heading.innerText().catch(() => '') === 'Settings') return;
    const close = page.locator(`#${ROOT_ID} [data-action="settings-close"]`);
    if (await close.count()) await clickWorkspaceControl(page, `[data-action="settings-close"]`, timeoutMs);
    else {
      const main = page.locator(`#${ROOT_ID} [data-action="view"][data-view="main"]`);
      if (await main.count()) await clickWorkspaceControl(page, `[data-action="view"][data-view="main"]`, timeoutMs);
    }
  await clickWorkspaceControl(page, `.sc-proto-topbar [data-action="view"][data-view="settings"]`, timeoutMs);
  await waitFor(async () => await heading.innerText().catch(() => '') === 'Settings' ? true : null, 'Settings Home navigation', timeoutMs);
}

async function openSettingsDestination(page, group, view, timeoutMs) {
  await openSettingsHome(page, timeoutMs);
  const toggle = page.locator(`#${ROOT_ID} [data-action="settings-toggle-group"][data-group="${group}"]`);
  if (await toggle.getAttribute('aria-expanded').catch(() => null) !== 'true') {
    await clickWorkspaceControl(page, `[data-action="settings-toggle-group"][data-group="${group}"]`, timeoutMs);
  }
  await page.locator(`#${ROOT_ID} [data-action="settings-route"][data-view="${view}"]`).waitFor({ state: 'visible', timeout: timeoutMs });
  await clickWorkspaceControl(page, `[data-action="settings-route"][data-view="${view}"]`, timeoutMs);
}

function runB2TransitionLifecycleBrowserCase(cases, family, fixtureIds, stableFixtureIds, slug, name, task, extraMetadata = {}) {
  for (const fixtureId of fixtureIds) {
    if (!REQUIRED_B2_2_A4_FIXTURE_IDS.includes(fixtureId)) throw new Error(`Unknown B2.2 A4 fixture ID: ${fixtureId}`);
  }
  for (const fixtureId of stableFixtureIds) {
    if (!REQUIRED_A4_STABLE_FIXTURE_IDS.includes(fixtureId)) throw new Error(`Unknown B1 A4 stable fixture ID: ${fixtureId}`);
  }
  for (const fixtureId of extraMetadata.b2ReadyFixtureIds || []) {
    if (!REQUIRED_B2_READY_A4_FIXTURE_IDS.includes(fixtureId)) throw new Error(`Unknown final B2 READY A4 fixture ID: ${fixtureId}`);
  }
  const browserCode = family === 'chrome' ? 'CH' : 'ED';
  const fixtureCode = fixtureIds.map(value => value.replace('B2-TRANSITION-', '')).join('-');
  return runCase(cases, `A4-B2.2-${browserCode}-${fixtureCode}-${slug}`, name, task, {
    stableFixtureIds,
    b2TransitionFixtureIds: fixtureIds,
    b2Scope: 'TRUSTED_TRANSITION_CORE_PARTIAL',
    ...extraMetadata
  });
}

function runB2ReadyBrowserCase(cases, family, fixtureIds, slug, name, task) {
  for (const fixtureId of fixtureIds) {
    if (!REQUIRED_B2_READY_A4_FIXTURE_IDS.includes(fixtureId)) throw new Error(`Unknown final B2 READY A4 fixture ID: ${fixtureId}`);
  }
  const browserCode = family === 'chrome' ? 'CH' : 'ED';
  const fixtureCode = fixtureIds.map(value => value.replace('B2-READY-', '')).join('-');
  return runCase(cases, `A4-B2-C-${browserCode}-${fixtureCode}-${slug}`, name, task, {
    b2ReadyFixtureIds: fixtureIds,
    b2Scope: 'FINAL_READY_SETTLEMENT'
  });
}

function serviceWorkerTarget(targets, extensionId) {
  return targets.targetInfos.find(target => target.type === 'service_worker' && target.url === `chrome-extension://${extensionId}/dist/background.js`) || null;
}

async function observeRuntimePermissionRequests(worker) {
  if (!worker) throw new Error('Permission observer requires the loaded extension worker');
  await worker.evaluate(() => {
    globalThis.__a4RuntimePermissionRequests = 0;
    const original = chrome.permissions.request.bind(chrome.permissions);
    chrome.permissions.request = (...args) => {
      globalThis.__a4RuntimePermissionRequests += 1;
      return original(...args);
    };
  });
}

async function runtimePermissionEvidence(worker) {
  if (!worker) throw new Error('Permission evidence requires the loaded extension worker');
  return worker.evaluate(async () => ({
    granted: await chrome.permissions.contains({ origins: ['https://www.bing.com/*'] }),
    requests: globalThis.__a4RuntimePermissionRequests ?? null
  }));
}

async function runLiveBingGate({ playwright, family, executablePath, packageDirectory, packageInventory, options }) {
  const suiteStarted = Date.now();
  const candidateIdentity = Object.freeze({
    buildId: packageInventory.buildInfo.buildId,
    packageVersion: packageInventory.manifest.version,
    candidateFingerprint: packageInventory.buildInfo.candidateFingerprint
  });
  const result = {
    family,
    profile: 'LIVE-BING-ONLY',
    status: 'RUNNING',
    executablePath,
    extension: null,
    network: { fulfilled: [], action7: [], bing: [], nativeMutationAttempts: [], blockedUnexpected: [] },
    console: { errors: [], pageErrors: [] },
    cases: [],
    durationMs: null,
    cleanupWarning: null
  };
  const browserCode = family === 'chrome' ? 'CH' : 'ED';
  const profilePrefix = `squarecoil-b5b-live-bing-a4-${family}-`;
  const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), profilePrefix));
  let context = null;
  let browserCdp = null;
  let bridge = null;
  try {
    context = await playwright.chromium.launchPersistentContext(profileDirectory, {
      executablePath,
      headless: !options.headed,
      ignoreDefaultArgs: ['--disable-extensions', '--disable-back-forward-cache'],
      viewport: { width: 760, height: 720 },
      args: [
        '--enable-unsafe-extension-debugging',
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-sync',
        '--metrics-recording-only',
        '--no-default-browser-check',
        '--no-first-run'
      ]
    });
    const browser = context.browser();
    if (!browser || typeof browser.newBrowserCDPSession !== 'function') {
      throw new UnsupportedCase('Browser-level CDP is unavailable for the required-host live Bing gate');
    }
    browserCdp = await browser.newBrowserCDPSession();
    const loadResult = await browserCdp.send('Extensions.loadUnpacked', { path: packageDirectory, enableInIncognito: false });
    const extensionId = loadResult?.id;
    assert(isConcreteIdentity(extensionId), 'Live Bing gate did not load the exact extension', loadResult);
    const extensionInfo = await waitFor(async () => {
      const extensionList = await browserCdp.send('Extensions.getExtensions');
      return extensionList.extensions?.find(extension => extension.id === extensionId) || null;
    }, 'the live-Bing extension registry entry', options.timeoutMs);
    assert(extensionInfo?.enabled === true, 'Interactive permission gate extension is not enabled', extensionInfo);
    assert(fs.realpathSync(extensionInfo.path).toLowerCase() === fs.realpathSync(packageDirectory).toLowerCase(),
      'Interactive permission gate loaded a different extension path', extensionInfo);
    assert(extensionInfo.version === packageInventory.manifest.version,
      'Interactive permission gate loaded a different extension version', extensionInfo);
    result.extension = { ...extensionInfo, id: extensionId, loadResult, registryVerified: true };

    const routingControl = { liveBing: true, networkUnavailable: false };
    await installSyntheticRouting(context, result.network,
      { clockContext: { projectId: '260701', label: '260701 - Design' } }, routingControl);
    const page = context.pages()[0] || await context.newPage();
    page.on('console', message => {
      if (message.type() === 'error' || message.type() === 'warning') result.console.errors.push({ type: message.type(), text: message.text() });
    });
    page.on('pageerror', error => result.console.pageErrors.push(String(error?.message || error)));

    await runCase(result.cases, `A4-B5-B-${browserCode}-LIVE-BING-ONLY`,
      `Trusted ${family} Companion skin click paints both Glass themes with install-granted Bing access and no runtime prompt`, async () => {
        const setupPage = await context.newPage();
        try {
          await setupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
          await setupPage.evaluate(() => chrome.storage.local.set({ timerEnabled: true }));
          const initiallyGranted = await setupPage.evaluate(() => chrome.permissions.contains({ origins: ['https://www.bing.com/*'] }));
          assert(initiallyGranted === true, 'Fresh live-Bing profile lacks the required install host', { initiallyGranted });
        } finally {
          await setupPage.close().catch(() => {});
        }

        await page.goto(`${FIXTURE_ORIGIN}${FIXTURE_PATH}`, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
        await waitFor(async () => (await pageState(page)).documentToken, 'interactive-gate content-controller document identity', options.timeoutMs);
        bridge = new ContentBridge(context, page, extensionId, options.timeoutMs, candidateIdentity);
        await bridge.initialize();
        await bridge.setEnabled(true);
        const ready = await waitFor(async () => {
          const snapshot = await bridge.coreSnapshot().catch(() => null);
          return snapshot?.initialized === true && snapshot.blocked === false &&
            snapshot.preferences?.initialized === true && snapshot?.presentation?.optional?.cinematic ? snapshot : null;
        }, 'interactive-gate Companion runtime', options.timeoutMs);
        await openSettingsDestination(page, 'appearance', 'timer-appearance', options.timeoutMs);
        await clickWorkspaceControl(page, '[data-action="preference"][data-value="DARK"]', options.timeoutMs);
        await waitFor(async () => (await bridge.coreSnapshot()).preferences?.timerAppearance === 'DARK', 'Dark Companion appearance', options.timeoutMs);
        await clickWorkspaceControl(page, '[data-action="preference-finish"][data-value="GLASS"]', options.timeoutMs);
        await waitFor(async () => (await bridge.coreSnapshot()).preferences?.panelFinish === 'GLASS', 'Glass Companion finish', options.timeoutMs);
        const permissionWorker = context.serviceWorkers().find(worker => worker.url().startsWith(`chrome-extension://${extensionId}/`));
        if (!permissionWorker) throw new UnsupportedCase('The isolated extension worker is unavailable');
        await observeRuntimePermissionRequests(permissionWorker);
        await openSettingsDestination(page, 'appearance', 'website-theme', options.timeoutMs);
        await page.evaluate(() => {
          window.__squareCoilPermissionSkinClick = null;
          document.addEventListener('click', event => {
            const skin = event.target.closest?.('#ussign-job-timer [data-action="preference-site"]');
            if (skin) window.__squareCoilPermissionSkinClick = { theme: skin.dataset.value, trusted: event.isTrusted };
          }, true);
        });
        await clickWorkspaceControl(page, '[data-action="preference-site"][data-value="SLEEK_DARK"]', options.timeoutMs);
        const decision = { grantedAtInstall: true, skinClick: await page.evaluate(() => window.__squareCoilPermissionSkinClick) };
        assert(decision.skinClick?.theme === 'SLEEK_DARK' && decision.skinClick.trusted === true,
          'Glass did not follow a real Companion skin click', decision);
        const provider = await bridge.send({ type: MESSAGES.B5B_WALLPAPER, requestId: 'a4-live-wallpaper-0001', websiteTheme: 'SLEEK_DARK' });
        assert(provider?.type === 'SC_COMPANION_B5B_ACK' && provider.ok === true &&
          ['REMOTE', 'CACHE_FRESH'].includes(provider.source) && /^data:image\//.test(String(provider.dataUrl || '')),
        'Granted wallpaper provider did not return an acknowledged image', provider);
        let lastRendered = null;
        const rendered = await waitFor(async () => {
          const snapshot = await bridge.coreSnapshot().catch(() => null);
          const current = snapshot?.presentation?.optional?.cinematic;
          const dom = await inspectVisibleCinematicPhoto(page, 'SLEEK_DARK');
          lastRendered = { cinematic: current, preferences: snapshot?.preferences, dom };
          return current?.state === 'SHOWING' && ['REMOTE', 'CACHE_RETAINED', 'CACHE_FRESH'].includes(current.source) &&
            current.statusCode === (current.source === 'REMOTE' ? 'BING_IMAGE_ACTIVE' : current.statusCode) &&
            dom.hostTheme === 'SLEEK_DARK' && dom.computedImagePresent === true && dom.opacity === '1'
            ? { snapshot, dom } : null;
        }, 'the granted Bing image on the integrated Glass surface', options.timeoutMs).catch(async error => {
          error.details = { provider: { ok: provider.ok, source: provider.source, reason: provider.reason },
            lastRendered, screenshot: await capturePageEvidence(page, options, family, 'live-bing-dark-unsettled'),
            permission: await runtimePermissionEvidence(permissionWorker) };
          throw error;
        });
        assertVisibleCinematicPhoto(rendered.dom);
        const darkScreenshot = await capturePageEvidence(page, options, family, 'live-bing-dark-glass');

        await clickWorkspaceControl(page, '[data-action="preference-site"][data-value="LIGHT_GLASS"]', options.timeoutMs);
        const renderedLight = await waitFor(async () => {
          const snapshot = await bridge.coreSnapshot().catch(() => null);
          const current = snapshot?.presentation?.optional?.cinematic;
          const dom = await inspectVisibleCinematicPhoto(page, 'LIGHT_GLASS');
          return snapshot?.preferences?.websiteTheme === 'LIGHT_GLASS' && current?.state === 'SHOWING' &&
            ['REMOTE', 'CACHE_RETAINED', 'CACHE_FRESH'].includes(current.source) &&
            dom.hostTheme === 'LIGHT_GLASS' && dom.computedImagePresent === true && dom.opacity === '1'
            ? { snapshot, dom } : null;
        }, 'the same real Bing photograph behind integrated Light Glass', options.timeoutMs);
        assertVisibleCinematicPhoto(renderedLight.dom);
        const lightScreenshot = await capturePageEvidence(page, options, family, 'live-bing-light-glass');

        const failurePage = await context.newPage();
        try {
          await failurePage.goto(`chrome-extension://${extensionId}/popup/popup.html`, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
          const aged = await failurePage.evaluate(async cacheKey => {
            const stored = await chrome.storage.local.get(cacheKey);
            const current = stored?.[cacheKey];
            if (!current || current.schemaVersion !== 1) return false;
            await chrome.storage.local.set({ [cacheKey]: { ...current, fetchedAtMs: Date.now() - (31 * 60 * 1000) } });
            return true;
          }, 'squarecoilCompanionB5BWallpaperCacheV1');
          assert(aged === true, 'Live Bing image did not create the bounded extension cache');
          routingControl.networkUnavailable = true;
          // Exercise the supported refresh notification after controlled cache
          // aging. This proves retained-cache recovery, not the real 30-minute cadence.
          await failurePage.evaluate(async fixtureUrl => {
            const [tab] = await chrome.tabs.query({ url: fixtureUrl });
            if (!Number.isInteger(tab?.id)) throw new Error('fixture-tab-unavailable');
            await chrome.tabs.sendMessage(tab.id, { type: 'SC_COMPANION_B5B_PERMISSION_CHANGED' });
          }, `${FIXTURE_ORIGIN}/*`);
        } finally {
          await failurePage.close().catch(() => {});
          await page.bringToFront().catch(() => {});
        }
        const retained = await waitFor(async () => {
          const snapshot = await bridge.coreSnapshot().catch(() => null);
          const current = snapshot?.presentation?.optional?.cinematic;
          const dom = await inspectVisibleCinematicPhoto(page, 'LIGHT_GLASS');
          return current?.state === 'DEGRADED_CACHE' && current.source === 'CACHE_RETAINED' &&
            current.statusCode === 'OLDER_CACHED_BING_IMAGE_RETAINED' && current.failureCode === 'NETWORK_UNAVAILABLE' &&
            dom.hostTheme === 'LIGHT_GLASS' && dom.computedImagePresent === true && dom.opacity === '1'
            ? { snapshot, dom } : null;
        }, 'older cached Bing image retained after a simulated network outage', options.timeoutMs);
        assertVisibleCinematicPhoto(retained.dom);
        await openSettingsDestination(page, 'appearance', 'website-theme', options.timeoutMs);
        const retainedStatusText = await page.locator(`#${ROOT_ID} .sc-content`).innerText();
        assert(/Older cached Bing image retained after a failure; network unavailable/i.test(retainedStatusText) &&
          !/Using saved wallpaper/i.test(retainedStatusText),
        'Installed UI did not report the retained-cache/network state accurately', retainedStatusText);
        const retainedScreenshot = await capturePageEvidence(page, options, family, 'retained-bing-light-glass-network-failure');
        assert(result.network.bing.some(entry => entry.kind === 'metadata') && result.network.bing.some(entry => entry.kind === 'image'),
          'Interactive gate did not exercise both Bing metadata and image routes', result.network.bing);
        for (const entry of result.network.bing) {
          const requestUrl = new URL(entry.url);
          assert(requestUrl.protocol === 'https:' && requestUrl.hostname === 'www.bing.com' && !requestUrl.port &&
            entry.cookieHeaderPresent === false && entry.referrerHeaderPresent === false && entry.authorizationHeaderPresent === false,
          'Live Bing request crossed the exact origin or credential/referrer boundary', entry);
          if (entry.kind === 'metadata') {
            assert([...requestUrl.searchParams.keys()].join(',') === 'format,idx,n,mkt,uhd,uhdwidth,uhdheight' &&
              requestUrl.searchParams.get('format') === 'js' && requestUrl.searchParams.get('idx') === '0' &&
              requestUrl.searchParams.get('n') === '1' && BING_MARKETS.includes(requestUrl.searchParams.get('mkt')) &&
              requestUrl.searchParams.get('uhd') === '1' && requestUrl.searchParams.get('uhdwidth') === '3840' &&
              requestUrl.searchParams.get('uhdheight') === '2160',
            'Live Bing metadata request contained anything outside the fixed public feed parameters', entry);
          } else if (entry.kind === 'image') {
            assert([...requestUrl.searchParams.keys()].join(',') === 'id,w,h,rs,c' &&
              /^OHR\.[A-Za-z0-9][A-Za-z0-9_-]{0,180}_UHD\.jpg$/.test(requestUrl.searchParams.get('id') || '') &&
              requestUrl.searchParams.get('w') === '3840' && requestUrl.searchParams.get('h') === '2160' &&
              requestUrl.searchParams.get('rs') === '1' && requestUrl.searchParams.get('c') === '4',
            'Live Bing image request was not the internally controlled canonical request', entry);
          }
        }
        const permissionProof = await runtimePermissionEvidence(permissionWorker);
        assert(permissionProof.granted === true && permissionProof.requests === 0, 'Skin selection requested runtime permission', permissionProof);
        assert(result.network.nativeMutationAttempts.length === 0,
          'Live Bing gate attempted a native SquareCoil mutation', result.network.nativeMutationAttempts);
        assert(result.network.blockedUnexpected.length === 0,
          'Live Bing gate made an unexpected network request', result.network.blockedUnexpected);
        assert(result.console.errors.length === 0 && result.console.pageErrors.length === 0,
          'Interactive permission gate reported browser errors', result.console);
        return { permission: await runtimePermissionEvidence(permissionWorker), decision,
          provider: { ok: provider.ok, source: provider.source, reason: provider.reason }, rendered: rendered.dom,
          renderedLight: renderedLight.dom, bing: result.network.bing,
          retained: { cinematic: retained.snapshot.presentation.optional.cinematic, dom: retained.dom, statusText: retainedStatusText },
          screenshots: { dark: darkScreenshot, light: lightScreenshot, retained: retainedScreenshot } };
      }, { b5OptionalFixtureIds: ['B5B-CINE-001', 'B5B-SAFETY-001'], supplemental: true });
    result.status = result.cases.some(testCase => testCase.status === 'FAIL') ? 'FAIL' :
      result.cases.some(testCase => testCase.status === 'UNSUPPORTED') ? 'UNSUPPORTED' : 'PASS';
  } catch (error) {
    result.cases.push({ id: `A4-B5-B-${browserCode}-LIVE-BING-SETUP`,
      name: 'Interactive permission gate setup and control',
      status: error instanceof UnsupportedCase ? 'UNSUPPORTED' : 'FAIL', error: error.message, details: error.details || null });
    result.status = error instanceof UnsupportedCase ? 'UNSUPPORTED' : 'FAIL';
  } finally {
    if (bridge) {
      await bridge.setEnabled(false).catch(() => {});
      await bridge.authorityTeardown().catch(() => {});
      await bridge.detach().catch(() => {});
    }
    if (browserCdp) await browserCdp.detach().catch(() => {});
    await context?.close().catch(() => {});
    const tempRoot = path.resolve(os.tmpdir());
    const resolvedProfile = path.resolve(profileDirectory);
    const safeProfile = resolvedProfile.toLowerCase().startsWith(`${tempRoot.toLowerCase()}${path.sep}`) &&
      path.basename(resolvedProfile).startsWith(profilePrefix);
    if (safeProfile) {
      try { fs.rmSync(resolvedProfile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
      catch (error) { result.cleanupWarning = `Temporary permission profile retained at ${resolvedProfile}: ${error.message}`; }
    } else {
      result.cleanupWarning = `Refused to remove unexpected permission profile path: ${resolvedProfile}`;
    }
    result.durationMs = Date.now() - suiteStarted;
  }
  return result;
}

async function runBrowserSuite({ playwright, family, executablePath, packageDirectory, packageInventory, archiveInventory, options }) {
  const suiteStarted = Date.now();
  const candidateIdentity = Object.freeze({
    buildId: packageInventory.buildInfo.buildId,
    packageVersion: packageInventory.manifest.version,
    candidateFingerprint: packageInventory.buildInfo.candidateFingerprint
  });
  const result = {
    family,
    profile: 'PROFILE-CLEAN',
    status: 'RUNNING',
    executablePath,
    browserIdentity: null,
    extension: null,
    candidateIdentity,
    network: { fulfilled: [], action7: [], bing: [], nativeMutationAttempts: [], blockedUnexpected: [] },
    console: { errors: [], pageErrors: [] },
    stableFixtureCoverage: null,
    b2KernelFixtureCoverage: null,
    b3WorkspaceFixtureCoverage: null,
    b5cThemeFixtureCoverage: null,
    b5dThemeFixtureCoverage: null,
    b6CandidateFixtureCoverage: null,
    initialFixtureNavigation: {},
    cases: [],
    durationMs: null,
    cleanupWarning: null
  };
  if (!fs.existsSync(executablePath)) {
    result.status = 'UNSUPPORTED';
    result.cases.push({ id: 'A4-ENV', name: 'Installed branded browser', status: 'UNSUPPORTED', error: `Executable not found: ${executablePath}` });
    result.durationMs = Date.now() - suiteStarted;
    return result;
  }

  const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), `squarecoil-b1-a4-${family}-`));
  let context = null;
  let browserCdp = null;
  let bridge = null;
  let tracker = null;
  try {
    context = await playwright.chromium.launchPersistentContext(profileDirectory, {
      executablePath,
      headless: !options.headed,
      acceptDownloads: true,
      ignoreDefaultArgs: ['--disable-extensions', '--disable-back-forward-cache'],
      viewport: { width: 1280, height: 900 },
      args: [
        '--enable-unsafe-extension-debugging',
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-sync',
        '--host-resolver-rules=MAP * ~NOTFOUND',
        '--metrics-recording-only',
        '--no-default-browser-check',
        '--no-first-run'
      ]
    });
    const browser = context.browser();
    if (!browser || typeof browser.newBrowserCDPSession !== 'function') {
      throw new UnsupportedCase('Browser-level CDP is unavailable for the persistent profile');
    }
    browserCdp = await browser.newBrowserCDPSession();
    const protocolVersion = await browserCdp.send('Browser.getVersion');
    result.browserIdentity = {
      ...protocolVersion,
      playwrightReportedVersion: browser.version(),
      executableRealPath: fs.realpathSync(executablePath),
      executableSha256: sha256(fs.readFileSync(executablePath))
    };

    let loadResult;
    try {
      loadResult = await browserCdp.send('Extensions.loadUnpacked', { path: packageDirectory, enableInIncognito: false });
    } catch (error) {
      throw new UnsupportedCase(`Extensions.loadUnpacked is unavailable: ${error.message}`);
    }
    const extensionId = loadResult?.id;
    assert(isConcreteIdentity(extensionId), 'Extensions.loadUnpacked did not return a concrete extension ID', loadResult);
    result.extension = { loadResult, id: extensionId, registryVerified: false };
    const extensionInfo = await waitFor(async () => {
      const extensionList = await browserCdp.send('Extensions.getExtensions');
      return extensionList.extensions?.find(extension => extension.id === extensionId) || null;
    }, 'the unpacked extension registry entry', options.timeoutMs);
    assert(extensionInfo?.enabled === true, 'Loaded extension is not enabled', extensionInfo);
    assert(fs.realpathSync(extensionInfo.path).toLowerCase() === fs.realpathSync(packageDirectory).toLowerCase(), 'Browser loaded a different extension path', extensionInfo);
    assert(extensionInfo.version === packageInventory.manifest.version, 'Browser loaded a different extension version', extensionInfo);
    result.extension = { ...extensionInfo, id: extensionId, loadResult, registryVerified: true };

    await runBrowserCase(
      result.cases,
      family,
      family === 'chrome' ? ['B1-LC-017'] : ['B1-LC-018'],
      'PACKAGE-IDENTITY',
      'Loaded browser identity matches the exact commit, ZIP, and extracted bytes',
      async () => {
        const expectedProduct = family === 'chrome' ? /^Chrome\// : /^Edg\//;
        assert(expectedProduct.test(result.browserIdentity.product), `Unexpected ${family} CDP product identity`, result.browserIdentity);
        assert(result.extension.registryVerified === true, 'Extension registry identity was not verified', result.extension);
        assert(packageInventory.buildInfo.buildId === CANONICAL_BUILD_ID, 'Loaded package buildId is not canonical', packageInventory.buildInfo);
        assert(packageInventory.buildInfo.stage === CANONICAL_STAGE, 'Loaded package stage is not canonical', packageInventory.buildInfo);
        assert(/^[0-9a-f]{64}$/.test(packageInventory.buildInfo.candidateFingerprint), 'Loaded package candidate fingerprint is not concrete', packageInventory.buildInfo);
        assert(packageInventory.buildInfo.sourceSha === options.expectedSourceSha, 'Loaded package source SHA differs from the commanded SHA', packageInventory.buildInfo);
        assert(CANDIDATE_EMBEDDED_BUNDLES.every(relative => packageInventory.candidateEmbeddingCounts[relative] >= 1), 'A required runtime bundle does not embed the exact candidate fingerprint', packageInventory.candidateEmbeddingCounts);
        assert(archiveInventory.inventoryDigest === packageInventory.inventoryDigest, 'Archive/extracted identity differs', archiveInventory);
        return {
          browser: result.browserIdentity,
          extension: result.extension,
          candidateIdentity,
          candidateEmbeddingCounts: packageInventory.candidateEmbeddingCounts,
          buildInfo: packageInventory.buildInfo,
          archive: {
            filename: archiveInventory.filename,
            sha256: archiveInventory.sha256,
            inventoryDigest: archiveInventory.inventoryDigest
          }
        };
      }
    );

    const setupPage = await context.newPage();
    try {
      await setupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
      await waitFor(async () => setupPage.evaluate(async () => {
        const value = await chrome.storage.local.get('timerEnabled');
        return typeof value.timerEnabled === 'boolean' ? value.timerEnabled : null;
      }), 'the installation default setting', options.timeoutMs);
      await runCase(result.cases, `A4-LOG-${family === 'chrome' ? 'CH' : 'ED'}-NOLOGIN-DOWNLOAD`,
        'Packaged popup downloads a bounded privacy-safe diagnostic log without SquareCoil sign-in', async () => {
          const squarecoilTabs = await setupPage.evaluate(async fixtureOrigin =>
            (await chrome.tabs.query({ url: `${fixtureOrigin}/*` })).length, FIXTURE_ORIGIN);
          const squarecoilCookies = await context.cookies(FIXTURE_ORIGIN);
          assert(squarecoilTabs === 0 && squarecoilCookies.length === 0,
            'No-login diagnostic fixture inherited a SquareCoil tab or sign-in cookie',
            { squarecoilTabs, cookieCount: squarecoilCookies.length });
          const nativeAttempts = [];
          const observeRequest = request => {
            const url = new URL(request.url());
            if (url.origin === FIXTURE_ORIGIN && url.pathname === '/ajax_time_clock.php' &&
                !(request.method() === 'POST' && request.postData() === 'action=7')) {
              nativeAttempts.push({ method: request.method(), path: url.pathname });
            }
          };
          context.on('request', observeRequest);
          try {
            const download = await downloadFromActionPopup(context, browserCdp, extensionId, profileDirectory, options.timeoutMs);
            const { bytes } = download;
            const byteCount = bytes.length;
            assert(byteCount <= 65_536, 'Downloaded diagnostic log exceeded its 64 KiB cap', { byteCount });
            const text = bytes.toString('utf8');
            const log = JSON.parse(text);
            assert(JSON.stringify(Object.keys(log).sort()) === JSON.stringify(['entries', 'exportedAtMs', 'format', 'retention', 'schemaVersion']) &&
              log.format === 'squarecoil-companion-diagnostic-log' && log.schemaVersion === 1 &&
              Number.isSafeInteger(log.exportedAtMs) && log.exportedAtMs >= 0,
            'Downloaded diagnostic JSON did not have the exact safe export schema', Object.keys(log));
            assert(JSON.stringify(Object.keys(log.retention).sort()) === JSON.stringify(['maxAgeDays', 'maxBytes', 'maxEntries']) &&
              log.retention.maxEntries === 200 && log.retention.maxAgeDays === 30 && log.retention.maxBytes === 65_536 &&
              Array.isArray(log.entries) && log.entries.length > 0 && log.entries.length <= 200,
            'Downloaded diagnostic log omitted recent app events or exceeded retention bounds',
            { retention: log.retention, entryCount: log.entries?.length });
            const earliest = log.exportedAtMs - 30 * 24 * 60 * 60 * 1_000;
            for (const [index, entry] of log.entries.entries()) {
              const allowed = DIAGNOSTIC_EVENT_CODES[entry.code];
              assert(JSON.stringify(Object.keys(entry).sort()) === JSON.stringify(['area', 'atMs', 'code', 'severity']) &&
                Object.hasOwn(DIAGNOSTIC_EVENT_CODES, entry.code) && allowed.area === entry.area && allowed.severity === entry.severity &&
                Number.isSafeInteger(entry.atMs) && entry.atMs >= earliest && entry.atMs <= log.exportedAtMs &&
                (index === 0 || entry.atMs >= log.entries[index - 1].atMs),
              'Downloaded diagnostic entry contained arbitrary details, an unknown event, or stale time', { index, entry });
            }
            assert(!/@|https?:\/\/|private-job|260701 - Design|Northstar|Riverline|Cedar Point|project\.php\?id=/i.test(text),
              'Downloaded diagnostic log exposed fixture job, page, or account strings');
            assert(download.filename === `SquareCoil-Companion-diagnostics-${new Date(log.exportedAtMs).toISOString().slice(0, 10)}.json`,
              'Diagnostic download did not use the expected dated JSON filename', download.filename);
            assert(nativeAttempts.length === 0 && result.network.nativeMutationAttempts.length === 0,
              'No-login diagnostic download attempted a native SquareCoil mutation', nativeAttempts);
            return { squarecoilTabs, cookieCount: squarecoilCookies.length, trustedDownloadClick: download.trustedDownloadClick,
              genuinePopupView: download.genuinePopupView, filename: download.filename, bytes: byteCount, sha256: sha256(bytes),
              retention: log.retention, entryCount: log.entries.length,
              eventCodes: [...new Set(log.entries.map(entry => entry.code))],
              exactSafeSchema: true, nativeMutationAttempts: nativeAttempts.length };
          } finally {
            context.off('request', observeRequest);
          }
        });
      await observeRuntimePermissionRequests(context.serviceWorkers().find(worker => worker.url().startsWith(`chrome-extension://${extensionId}/`)));
      await setupPage.evaluate(() => chrome.storage.local.set({ timerEnabled: false }));
      await waitFor(async () => setupPage.evaluate(async () => {
        const value = await chrome.storage.local.get('timerEnabled');
        return value.timerEnabled === false ? true : null;
      }), 'the disabled setup setting', options.timeoutMs);
    } finally {
      await setupPage.close().catch(() => {});
    }
    const transitionFixture = {
      clockContext: { projectId: '260701', label: '260701 - Design' }
    };
    await installSyntheticRouting(context, result.network, transitionFixture);

    const existingPages = context.pages();
    const page = await context.newPage();
    result.initialFixtureNavigation.ignoredStartupPageUrls = [];
    for (const extra of existingPages) {
      // Edge owns this native download surface; closing it as a Playwright page can stall.
      if (family === 'edge' && extra.url() === 'edge://downloads-hub/') {
        result.initialFixtureNavigation.ignoredStartupPageUrls.push(extra.url());
        continue;
      }
      await extra.close().catch(() => {});
    }
    page.on('console', message => {
      if (message.type() === 'error' || message.type() === 'warning') result.console.errors.push({ type: message.type(), text: message.text() });
    });
    page.on('pageerror', error => result.console.pageErrors.push(String(error?.message || error)));
    await navigateInitialCleanFixture(context, page, browserCdp, family, options.timeoutMs, result.initialFixtureNavigation);
    await waitFor(async () => (await pageState(page)).documentToken, 'content-controller document identity', options.timeoutMs);
    bridge = new ContentBridge(context, page, extensionId, options.timeoutMs, candidateIdentity);
    await bridge.initialize();
    tracker = await createScriptTracker(context, page, extensionId);

    await runBrowserCase(result.cases, family, ['B1-LC-013'], 'DISABLED', 'Disabled boot is observation-only', async () => {
      const state = await pageState(page);
      assert(state.runtimeGlobalPresent === false, 'Disabled boot allocated a runtime', state);
      assert(state.rootCount === 0, 'Disabled boot allocated a root', state);
      assert(tracker.companionCount() === 0, 'Disabled boot injected the companion bundle', tracker.snapshot());
      const storage = await bridge.getStorage(['timerEnabled']);
      assert(storage?.timerEnabled === false, 'Disabled setting was not authoritative', storage);
      return { state, companionBundleParses: tracker.companionCount(), storage };
    });

    await runB6CandidateBrowserCase(
      result.cases,
      family,
      ['B6-CANDIDATE-001', 'B6-PROFILE-001'],
      'CLEAN-CANDIDATE',
      'Fresh isolated profile loads the exact B6 candidate without inherited authority or runtime state',
      async () => {
        const state = await pageState(page);
        const storage = await bridge.getStorage(['timerEnabled', AUTHORITY_STORAGE_KEY]);
        assert(packageInventory.buildInfo.buildId === CANONICAL_BUILD_ID && packageInventory.buildInfo.stage === CANONICAL_STAGE,
          'Fresh-profile package identity is not the B6 candidate', packageInventory.buildInfo);
        assert(storage.timerEnabled === false, 'Fresh-profile setup did not remain disabled', storage);
        assert(storage[AUTHORITY_STORAGE_KEY] === undefined, 'Fresh profile inherited an authority document', storage[AUTHORITY_STORAGE_KEY]);
        assert(state.runtimeGlobalPresent === false && state.rootCount === 0, 'Fresh disabled profile allocated runtime state', state);
        assert(result.network.nativeMutationAttempts.length === 0, 'Fresh-profile candidate check attempted a native mutation', result.network.nativeMutationAttempts);
        return {
          profile: 'PROFILE-CLEAN',
          candidateIdentity,
          authorityDocumentPresent: false,
          runtimePresent: false,
          ownedRootCount: state.rootCount
        };
      },
      { profile: 'PROFILE-CLEAN' }
    );

    await tracker.detach();
    tracker = null;
    await bridge.detach();
    bridge = null;
    await page.goto(UNSUPPORTED_URL, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });

    await runB5DThemeBrowserCase(
      result.cases,
      family,
      ['B5D-UI-001'],
      'ZERO-HISTORY-NAVIGATION',
      'Fresh zero-history Companion exposes Settings and Library without requiring a clock-in',
      async () => {
        const emptyPage = await context.newPage();
        let emptyBridge = null;
        emptyPage.on('console', message => {
          if (message.type() === 'error' || message.type() === 'warning') result.console.errors.push({ type: message.type(), text: message.text() });
        });
        emptyPage.on('pageerror', error => result.console.pageErrors.push(String(error?.message || error)));
        try {
          await emptyPage.goto(`${FIXTURE_ORIGIN}${EMPTY_UI_PATH}`, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
          await waitFor(async () => (await pageState(emptyPage)).documentToken, 'B5-D empty-workspace document identity', options.timeoutMs);
          emptyBridge = new ContentBridge(context, emptyPage, extensionId, options.timeoutMs, candidateIdentity);
          await emptyBridge.initialize();
          await emptyBridge.setEnabled(true);
          const empty = await waitFor(async () => {
            const snapshot = await emptyBridge.coreSnapshot().catch(() => null);
            const settingsCount = await emptyPage.locator(`#${ROOT_ID} .sc-proto-topbar [data-action="view"][data-view="settings"]`).count().catch(() => 0);
            return snapshot?.timer?.contextRows?.length === 0 && settingsCount === 1 ? snapshot : null;
          }, 'B5-D zero-history Settings entry point', options.timeoutMs);
          const before = { revision: empty.revision, ledgerSegmentCount: empty.ledgerSegmentCount,
            timerState: empty.timer.timerState, currentContextId: empty.timer.currentContextId };
          const home = await emptyPage.locator(`#${ROOT_ID} .sc-content`).innerText();
          const homeRoutes = await emptyPage.locator(`#${ROOT_ID} .sc-content [data-action="view"]:visible`).evaluateAll(nodes =>
            nodes.map(node => ({ view: node.dataset.view, label: node.querySelector('strong')?.textContent.trim() })));
          assert(home.includes('No recent jobs yet') && home.includes('Settings') && home.includes('History') &&
            JSON.stringify(homeRoutes) === JSON.stringify([
              { view: 'recent', label: 'Jobs' }, { view: 'overview', label: 'Time' },
              { view: 'history', label: 'History' }, { view: 'settings', label: 'Settings' }
            ]), 'B5-D zero-history Home omitted feature navigation', { home, homeRoutes });
          await clickWorkspaceControl(emptyPage, `.sc-proto-topbar [data-action="view"][data-view="settings"]`, options.timeoutMs);
          const settings = await emptyPage.locator(`#${ROOT_ID} .sc-content`).innerText();
          const disclosureState = await emptyPage.evaluate(rootId => {
            const root = document.getElementById(rootId);
            const toggles = Array.from(root?.querySelectorAll('[data-action="settings-toggle-group"]') || []);
            const groups = Array.from(root?.querySelectorAll('.sc-settings-group') || []);
            return {
              labels: toggles.map(node => node.querySelector('strong')?.textContent.trim() || ''),
              expanded: toggles.filter(node => node.getAttribute('aria-expanded') === 'true').map(node => node.dataset.group),
              visibleRoutes: Array.from(root?.querySelectorAll('[data-action="settings-route"]') || [])
                .filter(node => node.getClientRects().length > 0)
                .map(node => node.dataset.view),
              companionTitle: root?.querySelector('.sc-proto-brand strong')?.textContent || '',
              companionLogoCount: root?.querySelectorAll('.sc-proto-shell img, .sc-brand-mark').length || 0,
              groupBorders: groups.map(node => getComputedStyle(node).borderTopWidth),
              toggleBorders: toggles.map(node => getComputedStyle(node).borderTopWidth)
            };
          }, ROOT_ID);
          assert(JSON.stringify(disclosureState.labels) === JSON.stringify([
            'Appearance', 'Features', 'Time tracking', 'Jobs', 'Notifications',
            'Privacy and data', 'Help'
          ]) && disclosureState.expanded.length === 0 && disclosureState.visibleRoutes.length === 0 &&
            disclosureState.companionTitle === 'SquareCoil Companion' && disclosureState.companionLogoCount === 0 &&
            disclosureState.groupBorders.every(value => value === '0px' || value === '1px') &&
            disclosureState.toggleBorders.every(value => value === '0px'),
          'B5-D zero-history Settings did not expose the compact nested feature categories', { settings, disclosureState });
          const settingsHomeScreenshot = await captureUiEvidence(emptyPage, options, family, 'settings-home-zero-history', `#${ROOT_ID}`);

          await clickWorkspaceControl(emptyPage, `[data-action="settings-toggle-group"][data-group="appearance"]`, options.timeoutMs);
          const appearanceDisclosure = await waitFor(async () => emptyPage.evaluate(rootId => {
            const root = document.getElementById(rootId);
            const expanded = Array.from(root?.querySelectorAll('[data-action="settings-toggle-group"][aria-expanded="true"]') || [])
              .map(node => node.dataset.group);
            const visibleRoutes = Array.from(root?.querySelectorAll('[data-action="settings-route"]') || [])
              .filter(node => node.getClientRects().length > 0)
              .map(node => node.dataset.view);
            return expanded.length === 1 && expanded[0] === 'appearance' &&
              JSON.stringify(visibleRoutes) === JSON.stringify(['timer-appearance', 'website-theme'])
              ? { expanded, visibleRoutes } : null;
          }, ROOT_ID), 'B5-D nested Appearance disclosure', options.timeoutMs);

          await clickWorkspaceControl(emptyPage, `[data-action="settings-toggle-group"][data-group="features"]`, options.timeoutMs);
          const featuresDisclosure = await waitFor(async () => emptyPage.evaluate(rootId => {
            const root = document.getElementById(rootId);
            const expanded = Array.from(root?.querySelectorAll('[data-action="settings-toggle-group"][aria-expanded="true"]') || [])
              .map(node => node.dataset.group);
            const visibleRoutes = Array.from(root?.querySelectorAll('[data-action="settings-route"]') || [])
              .filter(node => node.getClientRects().length > 0)
              .map(node => node.dataset.view);
            const unavailable = Array.from(root?.querySelectorAll('.sc-settings-group[data-group="features"] .sc-unavailable[aria-disabled="true"] strong') || [])
              .map(node => node.textContent.trim());
            return expanded.length === 1 && expanded[0] === 'features' &&
              JSON.stringify(visibleRoutes) === JSON.stringify(['dashboard', 'design-dashboard', 'quick-file-paths', 'quick-clock']) &&
              JSON.stringify(unavailable) === JSON.stringify(['Design page layout', 'Sidebar menu toggle'])
              ? { expanded, visibleRoutes, unavailable } : null;
          }, ROOT_ID), 'B5-D nested Features disclosure', options.timeoutMs);
          for (const [view, heading, action] of [
            ['quick-file-paths', 'Quick file paths', 'preference-quick-files'],
            ['quick-clock', 'Quick clock controls', 'preference-quick-clock']
          ]) {
            await clickWorkspaceControl(emptyPage, `[data-action="settings-route"][data-view="${view}"]`, options.timeoutMs);
            const routeHeading = await emptyPage.locator(`#${ROOT_ID} [data-sc-view-heading]`).innerText();
            const off = await emptyPage.locator(`#${ROOT_ID} [data-action="${action}"][data-value="false"][data-active="true"]`).count();
            assert(routeHeading === heading && off === 1,
              'B5-D zero-history quick feature was unreachable or not off by default', { view, routeHeading, off });
            await clickWorkspaceControl(emptyPage, `[data-action="settings-back"][data-view="settings"]`, options.timeoutMs);
          }
          await clickWorkspaceControl(emptyPage, `[data-action="settings-toggle-group"][data-group="appearance"]`, options.timeoutMs);
          await clickWorkspaceControl(emptyPage, `[data-action="settings-route"][data-view="website-theme"]`, options.timeoutMs);
          const nativeThemeScreenshot = await captureUiEvidence(emptyPage, options, family, 'settings-native-zero-history', `#${ROOT_ID}`);
          const darkStart = await emptyBridge.coreSnapshot();
          await emptyBridge.preferenceAction({ timerAppearance: 'DARK', panelFinish: 'GLASS', websiteTheme: 'SLEEK_DARK' },
            darkStart.preferences.preferenceRevision);
          const darkTheme = await waitFor(async () => emptyPage.evaluate(rootId => {
            const root = document.getElementById(rootId);
            return {
              panelTheme: root?.dataset.protoTheme || null,
              panelSurface: root?.dataset.protoSurface || null,
              websiteTheme: document.documentElement.getAttribute('data-squarecoil-companion-site-theme'),
              themeLayers: document.querySelectorAll('#squarecoil-companion-site-theme').length,
              activeChoice: root?.querySelector('[data-action="preference-site"][data-active="true"]')?.dataset.value || null
            };
          }, ROOT_ID).then(value => value.panelTheme === 'dark' && value.panelSurface === 'glass' && value.websiteTheme === 'SLEEK_DARK' &&
            value.themeLayers === 1 && value.activeChoice === 'SLEEK_DARK' ? value : null),
          'B5-E dark zero-history Settings presentation', options.timeoutMs);
          const darkThemeScreenshot = await captureUiEvidence(emptyPage, options, family, 'settings-dark-glass-zero-history', `#${ROOT_ID}`);

          const lightStart = await emptyBridge.coreSnapshot();
          await emptyBridge.preferenceAction({ timerAppearance: 'LIGHT', panelFinish: 'GLASS', websiteTheme: 'LIGHT_GLASS' },
            lightStart.preferences.preferenceRevision);
          const lightTheme = await waitFor(async () => emptyPage.evaluate(rootId => {
            const root = document.getElementById(rootId);
            return {
              panelTheme: root?.dataset.protoTheme || null,
              panelSurface: root?.dataset.protoSurface || null,
              websiteTheme: document.documentElement.getAttribute('data-squarecoil-companion-site-theme'),
              themeLayers: document.querySelectorAll('#squarecoil-companion-site-theme').length,
              activeChoice: root?.querySelector('[data-action="preference-site"][data-active="true"]')?.dataset.value || null
            };
          }, ROOT_ID).then(value => value.panelTheme === 'light' && value.panelSurface === 'glass' && value.websiteTheme === 'LIGHT_GLASS' &&
            value.themeLayers === 1 && value.activeChoice === 'LIGHT_GLASS' ? value : null),
          'B5-E light zero-history Settings presentation', options.timeoutMs);
          const lightThemeScreenshot = await captureUiEvidence(emptyPage, options, family, 'settings-light-glass-zero-history', `#${ROOT_ID}`);

          await clickWorkspaceControl(emptyPage, `[data-action="settings-back"][data-view="settings"]`, options.timeoutMs);
          await clickWorkspaceControl(emptyPage, `[data-action="settings-toggle-group"][data-group="help"]`, options.timeoutMs);
          await clickWorkspaceControl(emptyPage, `[data-action="settings-route"][data-view="advanced-diagnostics"]`, options.timeoutMs);
          await emptyPage.locator(`#${ROOT_ID} details.sc-technical`).evaluate(node => { node.open = true; });
          const diagnosticsScreenshot = await captureUiEvidence(emptyPage, options, family, 'advanced-diagnostics', `#${ROOT_ID}`);
          const copyDiagnostics = emptyPage.locator(`#${ROOT_ID} [data-action="copy-advanced-diagnostics"]`);
          await emptyPage.locator(`#${ROOT_ID} details.sc-technical summary`).focus();
          for (let index = 0; index < 8 && !await copyDiagnostics.evaluate(node => document.activeElement === node); index += 1) {
            await emptyPage.keyboard.press('Tab');
          }
          const focus = await copyDiagnostics.evaluate(node => ({
            active: document.activeElement === node,
            outlineStyle: getComputedStyle(node).outlineStyle,
            outlineWidth: getComputedStyle(node).outlineWidth
          }));
          assert(focus.active && focus.outlineStyle === 'solid' && Number.parseFloat(focus.outlineWidth) >= 2,
            'B5-E keyboard focus was not visibly preserved', focus);
          await emptyPage.setViewportSize({ width: 360, height: 800 });
          const responsive = await emptyPage.evaluate(rootId => {
            const root = document.getElementById(rootId);
            const rect = root?.getBoundingClientRect();
            return {
              left: rect?.left ?? null,
              right: rect?.right ?? null,
              width: rect?.width ?? null,
              viewportWidth: document.documentElement.clientWidth,
              rootScrollWidth: root?.scrollWidth ?? null,
              rootClientWidth: root?.clientWidth ?? null
            };
          }, ROOT_ID);
          assert(responsive.left >= 0 && responsive.right <= responsive.viewportWidth && responsive.width <= 336 &&
            responsive.rootScrollWidth <= responsive.rootClientWidth,
          'B5-E narrow Companion workspace overflowed horizontally', responsive);

          await copyDiagnostics.evaluate(node => node.blur());
          const restoreStart = await emptyBridge.coreSnapshot();
          await emptyBridge.preferenceAction({ timerAppearance: 'LIGHT', panelFinish: 'SOLID', websiteTheme: 'ORIGINAL' },
            restoreStart.preferences.preferenceRevision);
          await waitFor(async () => emptyPage.evaluate(rootId => ({
            panelTheme: document.getElementById(rootId)?.dataset.protoTheme || null,
            panelSurface: document.getElementById(rootId)?.dataset.protoSurface || null,
            websiteTheme: document.documentElement.getAttribute('data-squarecoil-companion-site-theme'),
            themeLayers: document.querySelectorAll('#squarecoil-companion-site-theme').length
          }), ROOT_ID).then(value => value.panelTheme === 'light' && value.panelSurface === 'solid' && value.websiteTheme === null &&
            value.themeLayers === 0 ? value : null), 'B5-E native Settings restoration', options.timeoutMs);
          const after = await emptyBridge.coreSnapshot();
          assert(after.ledgerSegmentCount === before.ledgerSegmentCount && after.timer.timerState === before.timerState &&
            after.timer.currentContextId === before.currentContextId && after.timer.contextRows.length === 0,
          'B5-D zero-history navigation changed Timer or Ledger authority', { before, after });
          assert(result.network.nativeMutationAttempts.length === 0, 'B5-D zero-history navigation attempted a native SquareCoil mutation', result.network.nativeMutationAttempts);
          return { home, homeRoutes, settings, disclosureState, appearanceDisclosure, featuresDisclosure, before, afterRevision: after.revision, darkTheme, lightTheme, focus, responsive,
            screenshots: { settingsHomeScreenshot, nativeThemeScreenshot, darkThemeScreenshot, lightThemeScreenshot, diagnosticsScreenshot } };
        } finally {
          if (emptyBridge) {
            await emptyBridge.setEnabled(false).catch(() => {});
            await emptyBridge.authorityTeardown().catch(() => {});
            await emptyBridge.detach();
          }
          await emptyPage.close().catch(() => {});
        }
      }
    );

    await page.goto(`${FIXTURE_ORIGIN}${FIXTURE_PATH}`, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
    await waitFor(async () => (await pageState(page)).documentToken, 'post-B5-D primary document identity', options.timeoutMs);
    bridge = new ContentBridge(context, page, extensionId, options.timeoutMs, candidateIdentity);
    await bridge.initialize();
    tracker = await createScriptTracker(context, page, extensionId);

    await runBrowserCase(result.cases, family, ['B1-LC-004'], 'ORPHAN', 'Clearly owned rebuild-marker orphan recovers while ambiguous ownership is retained', async () => {
      const parseBaseline = tracker.companionCount();
      const ownedSeed = await page.evaluate(identity => {
        const root = document.createElement('section');
        root.id = 'a4-owned-rebuild-marker-orphan';
        root.dataset.squarecoilCompanionRoot = 'rebuild';
        root.dataset.runtimeInstanceId = 'a4-owned-orphan-runtime-0001';
        root.dataset.buildId = identity.buildId;
        root.dataset.packageVersion = identity.packageVersion;
        root.dataset.candidateFingerprint = identity.candidateFingerprint;
        root.dataset.documentToken = document.documentElement.dataset.squarecoilCompanionDocumentToken;
        root.dataset.a4Seed = 'owned-orphan';
        document.body.appendChild(root);
        return {
          id: root.id,
          runtimeInstanceId: root.dataset.runtimeInstanceId,
          buildId: root.dataset.buildId,
          packageVersion: root.dataset.packageVersion,
          candidateFingerprint: root.dataset.candidateFingerprint,
          documentToken: root.dataset.documentToken
        };
      }, candidateIdentity);
      const ownedBefore = await pageState(page);
      assert(ownedBefore.rootCount === 1 && ownedBefore.canonicalRootCount === 0 && ownedBefore.rebuildMarkerCount === 1, 'Harness did not inventory the noncanonical owned rebuild marker', ownedBefore);
      assert(ownedBefore.roots[0].buildId === candidateIdentity.buildId && ownedBefore.roots[0].packageVersion === candidateIdentity.packageVersion && ownedBefore.roots[0].candidateFingerprint === candidateIdentity.candidateFingerprint, 'Owned orphan seed did not carry the exact candidate identity', ownedBefore);
      const ownedResponse = await bridge.setEnabled(true);
      const recovered = await waitFor(async () => {
        const state = await pageState(page);
        return state.health?.state === 'DEGRADED' ? state : null;
      }, 'clearly owned orphan recovery', options.timeoutMs);
      assertExpectedB1Shell(recovered, 'clearly owned orphan recovery', candidateIdentity);
      assert(recovered.runtimeInstanceId !== ownedSeed.runtimeInstanceId, 'Owned orphan runtime identity was reused', recovered);
      assert(await page.locator('[data-a4-seed="owned-orphan"]').count() === 0, 'Clearly owned orphan root was retained');
      assert(tracker.companionCount() === parseBaseline + 1, 'Owned orphan recovery did not execute exactly one fresh bundle', tracker.snapshot());
      await bridge.setEnabled(false);
      await waitFor(async () => {
        const state = await pageState(page);
        return !state.runtimeGlobalPresent && state.rootCount === 0 ? state : null;
      }, 'owned orphan cleanup', options.timeoutMs);

      const ambiguousSeed = await page.evaluate(identity => {
        const root = document.createElement('section');
        root.id = 'a4-ambiguous-rebuild-marker-orphan';
        root.dataset.squarecoilCompanionRoot = 'rebuild';
        root.dataset.buildId = identity.buildId;
        root.dataset.packageVersion = identity.packageVersion;
        root.dataset.candidateFingerprint = identity.candidateFingerprint;
        root.dataset.documentToken = document.documentElement.dataset.squarecoilCompanionDocumentToken;
        root.dataset.a4Seed = 'ambiguous-orphan';
        document.body.appendChild(root);
        return {
          id: root.id,
          buildId: root.dataset.buildId,
          packageVersion: root.dataset.packageVersion,
          candidateFingerprint: root.dataset.candidateFingerprint,
          documentToken: root.dataset.documentToken
        };
      }, candidateIdentity);
      const ambiguousBefore = await pageState(page);
      assert(ambiguousBefore.rootCount === 1 && ambiguousBefore.canonicalRootCount === 0 && ambiguousBefore.rebuildMarkerCount === 1, 'Harness did not inventory the noncanonical ambiguous rebuild marker', ambiguousBefore);
      assert(ambiguousBefore.roots[0].buildId === candidateIdentity.buildId && ambiguousBefore.roots[0].packageVersion === candidateIdentity.packageVersion && ambiguousBefore.roots[0].candidateFingerprint === candidateIdentity.candidateFingerprint, 'Ambiguous orphan seed did not carry the exact candidate identity', ambiguousBefore);
      const ambiguousResponse = await bridge.setEnabled(true);
      const ambiguous = await pageState(page);
      assert(ambiguousResponse?.classification === 'OWNERSHIP_CONFLICT', 'Ambiguous orphan did not fail closed', ambiguousResponse);
      assert(ambiguousResponse?.reloadRequired === true, 'Ambiguous orphan did not require a reload boundary', ambiguousResponse);
      assert(ambiguous.runtimeGlobalPresent === false, 'Ambiguous orphan allocated a runtime', ambiguous);
      assert(ambiguous.rootCount === 1, 'Ambiguous orphan root was deleted or stacked', ambiguous);
      assert(ambiguous.canonicalRootCount === 0 && ambiguous.rebuildMarkerCount === 1, 'Ambiguous noncanonical rebuild marker was hidden, rewritten, or stacked', ambiguous);
      assert(tracker.companionCount() === parseBaseline + 1, 'Ambiguous orphan triggered bundle execution', tracker.snapshot());
      await bridge.setEnabled(false);
      const removedAmbiguous = await page.evaluate(() => {
        const root = document.querySelector('[data-a4-seed="ambiguous-orphan"]');
        if (!root) return false;
        root.remove();
        return true;
      });
      assert(removedAmbiguous, 'Harness could not remove its exact ambiguous-orphan seed');
      return { ownedSeed, ownedBefore, ownedResponse, recoveredRuntimeInstanceId: recovered.runtimeInstanceId, ambiguousSeed, ambiguousBefore, ambiguousResponse, companionBundleParses: tracker.companionCount() };
    });

    await runBrowserCase(result.cases, family, ['B1-LC-010'], 'LEGACY', 'Legacy v0.7 timer ownership excludes B1 injection', async () => {
      const parseBaseline = tracker.companionCount();
      await page.evaluate(() => { window.__squareCoilJobTimerUiVersion = 'a4-legacy-v0.7'; });
      const response = await bridge.setEnabled(true);
      const state = await pageState(page);
      assert(response?.classification === 'LEGACY_RUNTIME', 'Legacy runtime was not classified explicitly', response);
      assert(response?.reloadRequired === true, 'Legacy runtime did not require a reload boundary', response);
      assert(state.runtimeGlobalPresent === false && state.rootCount === 0, 'B1 stacked over the legacy runtime', state);
      assert(tracker.companionCount() === parseBaseline, 'Legacy exclusion still executed the B1 bundle', tracker.snapshot());
      await bridge.setEnabled(false);
      const cleaned = await page.evaluate(() => {
        if (window.__squareCoilJobTimerUiVersion !== 'a4-legacy-v0.7') return false;
        return delete window.__squareCoilJobTimerUiVersion;
      });
      assert(cleaned, 'Harness could not remove its exact legacy seed');
      return { response, state, companionBundleParses: tracker.companionCount() };
    });

    await runBrowserCase(result.cases, family, ['B1-LC-012'], 'RUNTIME-GLOBAL', 'Malformed and unreadable runtime globals fail closed', async () => {
      const parseBaseline = tracker.companionCount();
      const malformedCreated = await page.evaluate(identity => {
        Object.defineProperty(window, '__squareCoilCompanionRuntime', {
          configurable: true,
          enumerable: false,
          writable: true,
          value: {
            __a4Seed: 'malformed-runtime',
            buildId: identity.buildId,
            packageVersion: identity.packageVersion,
            candidateFingerprint: identity.candidateFingerprint,
            documentToken: document.documentElement.dataset.squarecoilCompanionDocumentToken,
            runtimeInstanceId: 'a4-malformed-runtime-0001',
            getHealth: 'not-callable'
          }
        });
        return true;
      }, candidateIdentity);
      assert(malformedCreated, 'Harness could not seed a malformed runtime global');
      const malformedResponse = await bridge.setEnabled(true);
      const malformedState = await pageState(page);
      assert(malformedResponse?.classification === 'OWNERSHIP_CONFLICT', 'Malformed runtime global did not fail closed', malformedResponse);
      assert(malformedResponse?.reloadRequired === true, 'Malformed runtime global did not require reload', malformedResponse);
      assert(malformedState.rootCount === 0 && tracker.companionCount() === parseBaseline, 'Malformed runtime global allowed stacking', { malformedState, scripts: tracker.snapshot() });
      await bridge.setEnabled(false);
      const malformedRemoved = await page.evaluate(() => {
        const value = window.__squareCoilCompanionRuntime;
        if (value?.__a4Seed !== 'malformed-runtime') return false;
        return delete window.__squareCoilCompanionRuntime;
      });
      assert(malformedRemoved, 'Harness could not remove its exact malformed-runtime seed');

      await page.evaluate(() => {
        Object.defineProperty(window, '__squareCoilCompanionRuntime', {
          configurable: true,
          enumerable: false,
          get() { throw new Error('a4-unreadable-runtime-global'); }
        });
      });
      const unreadableResponse = await bridge.setEnabled(true);
      const unreadableState = await pageState(page);
      assert(unreadableResponse?.classification === 'OWNERSHIP_CONFLICT', 'Unreadable runtime global did not fail closed', unreadableResponse);
      assert(unreadableResponse?.reloadRequired === true, 'Unreadable runtime global did not require reload', unreadableResponse);
      assert(unreadableState.runtimeGlobalPresent && !unreadableState.runtimeGlobalReadable, 'Unreadable global probe evidence was lost', unreadableState);
      assert(unreadableState.rootCount === 0 && tracker.companionCount() === parseBaseline, 'Unreadable runtime global allowed stacking', { unreadableState, scripts: tracker.snapshot() });
      await bridge.setEnabled(false);
      const unreadableRemoved = await page.evaluate(() => delete window.__squareCoilCompanionRuntime);
      assert(unreadableRemoved, 'Harness could not remove its configurable unreadable-runtime seed');
      return { malformedResponse, malformedState, unreadableResponse, unreadableState, companionBundleParses: tracker.companionCount() };
    });

    await runBrowserCase(result.cases, family, ['B1-LC-016'], 'VERSION-MISMATCH', 'Build, package, and candidate mismatches require reload and are never hot-stacked', async () => {
      const parseBaseline = tracker.companionCount();
      const differentCandidate = candidateIdentity.candidateFingerprint === '0'.repeat(64) ? '1'.repeat(64) : '0'.repeat(64);
      const mismatchSeeds = [
        { name: 'build', buildId: 'a4-different-build-identity', packageVersion: candidateIdentity.packageVersion, candidateFingerprint: candidateIdentity.candidateFingerprint },
        { name: 'package', buildId: candidateIdentity.buildId, packageVersion: 'a4-different-package-version', candidateFingerprint: candidateIdentity.candidateFingerprint },
        { name: 'candidate', buildId: candidateIdentity.buildId, packageVersion: candidateIdentity.packageVersion, candidateFingerprint: differentCandidate }
      ];
      const mismatchEvidence = [];
      for (const mismatch of mismatchSeeds) {
        const seed = await page.evaluate(({ rootId, mismatch }) => {
          const root = document.createElement('section');
          root.id = rootId;
          root.dataset.squarecoilCompanionRoot = 'rebuild';
          root.dataset.runtimeInstanceId = `a4-${mismatch.name}-mismatch-runtime-0001`;
          root.dataset.buildId = mismatch.buildId;
          root.dataset.packageVersion = mismatch.packageVersion;
          root.dataset.candidateFingerprint = mismatch.candidateFingerprint;
          root.dataset.documentToken = document.documentElement.dataset.squarecoilCompanionDocumentToken;
          root.dataset.a4Seed = `${mismatch.name}-mismatch`;
          document.body.appendChild(root);
          return {
            name: mismatch.name,
            runtimeInstanceId: root.dataset.runtimeInstanceId,
            buildId: root.dataset.buildId,
            packageVersion: root.dataset.packageVersion,
            candidateFingerprint: root.dataset.candidateFingerprint
          };
        }, { rootId: ROOT_ID, mismatch });
        const response = await bridge.setEnabled(true);
        const state = await pageState(page);
        assert(response?.classification === 'VERSION_MISMATCH', `${mismatch.name} ownership was not classified as version mismatch`, response);
        assert(response?.reloadRequired === true, `${mismatch.name} mismatch did not require a reload boundary`, response);
        assert(state.runtimeGlobalPresent === false && state.rootCount === 1, `${mismatch.name} mismatch was deleted or hot-stacked`, state);
        assert(state.roots[0].buildId === seed.buildId && state.roots[0].packageVersion === seed.packageVersion && state.roots[0].candidateFingerprint === seed.candidateFingerprint, `${mismatch.name} mismatch identity evidence changed`, state);
        assert(tracker.companionCount() === parseBaseline, `${mismatch.name} mismatch executed the B1 bundle`, tracker.snapshot());
        await bridge.setEnabled(false);
        const removed = await page.evaluate(seedName => {
          const root = document.querySelector(`[data-a4-seed="${seedName}-mismatch"]`);
          if (!root) return false;
          root.remove();
          return true;
        }, mismatch.name);
        assert(removed, `Harness could not remove its exact ${mismatch.name}-mismatch seed`);
        mismatchEvidence.push({ seed, response, state });
      }
      return { candidateIdentity, mismatches: mismatchEvidence, companionBundleParses: tracker.companionCount() };
    });

    // The ownership-classification probes above intentionally create and tear
    // down short-lived runtimes. Reset their synthetic authority record and
    // worker before the canonical B1/B2 behavioral sequence so timing in those
    // probes cannot manufacture remembered Timer history.
    await bridge.removeStorage([AUTHORITY_STORAGE_KEY]);
    const setupWorker = serviceWorkerTarget(await browserCdp.send('Target.getTargets'), extensionId);
    if (setupWorker) {
      const closed = await browserCdp.send('Target.closeTarget', { targetId: setupWorker.targetId });
      assert(closed.success === true, 'Harness could not retire the synthetic setup worker', closed);
      await waitFor(
        async () => !serviceWorkerTarget(await browserCdp.send('Target.getTargets'), extensionId),
        'synthetic setup worker retirement',
        options.timeoutMs
      );
    }

    let activeRuntimeId = null;
    const primaryBootParseBaseline = tracker.companionCount();
    await runBrowserCase(result.cases, family, ['B1-LC-001', 'B1-LC-002', 'B1-LC-015'], 'BOOT', 'Concurrent boot creates one runtime and one root without false READY', async () => {
      const enableResponse = await bridge.setEnabled(true);
      const stable = await waitFor(async () => {
        const state = await pageState(page);
        return ['DEGRADED', 'READY', 'FAILED'].includes(state.health?.state) ? state : null;
      }, 'initial B1 lifecycle completion', options.timeoutMs);
      assertExpectedB1Shell(stable, 'initial boot', candidateIdentity);
      activeRuntimeId = stable.runtimeInstanceId;
      const responses = await bridge.sendConcurrent({ type: MESSAGES.BOOT }, 12);
      const repeated = await pageState(page);
      assertExpectedB1Shell(repeated, 'concurrent repeated boot', candidateIdentity);
      assert(repeated.runtimeInstanceId === activeRuntimeId, 'Repeated boot changed runtime identity', { activeRuntimeId, repeated });
      assert(repeated.rootCount === 1, 'Repeated boot stacked roots', repeated);
      assert(tracker.companionCount() === primaryBootParseBaseline + 1, 'Companion bundle was not injected exactly once for the primary boot', tracker.snapshot());
      assert(responses.every(response => response?.ready === false), 'A repeated B1 response falsely reported ready', responses);
      assert(responses.every(response => response?.health?.runtimeInstanceId === activeRuntimeId), 'Repeated responses did not join one runtime', responses);
      assert(responses.every(response => response?.health?.buildId === candidateIdentity.buildId && response?.health?.packageVersion === candidateIdentity.packageVersion && response?.health?.candidateFingerprint === candidateIdentity.candidateFingerprint), 'Repeated responses did not carry the exact candidate identity', responses);
      assert(responses.every(response => response?.classification === 'DEGRADED_SAME_BUILD'), 'Repeated responses were not the expected B1 degraded classification', responses);
      assert(responses.every(response => response?.injectionPerformed !== true), 'Repeated boot reported another injection', responses);
      return {
        enableResponse,
        directContentMessageIdentity: candidateIdentity,
        runtimeInstanceId: activeRuntimeId,
        rootCount: repeated.rootCount,
        companionBundleParses: tracker.companionCount(),
        repeatedResponses: responses.length,
        lifecycle: repeated.health
      };
    });

    await runB2TransitionBrowserCase(
      result.cases,
      family,
      ['B2-TRANSITION-001'],
      'ACTION7-START',
      'Exact action 7 evidence derives authoritative Timer state and settles effective READY',
      async () => {
        let core = await waitFor(async () => {
          const snapshot = await bridge.coreSnapshot();
          return ['ACTIVE', 'PENDING'].includes(snapshot?.timer?.timerState) &&
            snapshot.timer.currentContextId === 'job:260701' &&
            snapshot.bridge?.verificationInFlight === false
            ? snapshot
            : null;
        }, 'initial Bridge to Timer transition', options.timeoutMs);
        const derivedState = core.timer.timerState;
        if (derivedState === 'PENDING') {
          await bridge.timerAction('TIMER_START_FRESH');
          core = await waitFor(async () => {
            const snapshot = await bridge.coreSnapshot();
            return snapshot?.timer?.timerState === 'ACTIVE' && snapshot.timer.currentContextId === 'job:260701'
              ? snapshot
              : null;
          }, 'explicit fresh start from remembered Context', options.timeoutMs);
        }
        const shell = await pageState(page);
        const settledHealth = await bridge.send({ type: MESSAGES.HEALTH });
        assert(core.authorityOwner === true, 'Initial trusted transition core did not hold OWNER authority', core);
        assert(core.readModelError === null, 'Initial Timer read model failed', core);
        assert(Number.isSafeInteger(core.ledgerSegmentCount) && core.ledgerSegmentCount >= 0, 'Timer ledger diagnostics were unavailable', core);
        assert(core.bridge.capability === 'FULL', 'Packaged Bridge reported an unexpected capability', core.bridge);
        assert(core.bridge.requestCount >= 1 && core.bridge.nativeMutationRequestCount === 0, 'Packaged Bridge transport was not read-only action 7', core.bridge);
        assert(shell.health?.state === 'DEGRADED' && shell.health?.reason === EXPECTED_DEGRADED_REASON, 'MAIN shell no longer preserved its isolated-authority boundary', shell);
        assert(settledHealth?.ready === true && settledHealth?.health?.state === 'READY', 'Settled B2 health did not report READY', settledHealth);
        assert(settledHealth?.b2Settlement?.authorityDisposition === 'OWNER', 'Settled B2 health did not preserve positive OWNER evidence', settledHealth);
        assert(['NOT_REQUIRED', 'COMPLETE_MATCH'].includes(settledHealth?.b2Settlement?.migrationDisposition), 'Settled B2 health accepted unresolved migration', settledHealth);
        assert(settledHealth?.b2Settlement?.bridgeCapability === 'FULL', 'Settled B2 health did not report the actual Bridge capability', settledHealth);
        assert(result.network.action7.length >= 1, 'Synthetic action 7 endpoint was not called', result.network);
        assert(result.network.nativeMutationAttempts.length === 0, 'A native SquareCoil mutation was attempted', result.network.nativeMutationAttempts);
        return { derivedState, core, lifecycle: shell.health, settledHealth, action7Requests: result.network.action7.length };
      }
    );

    await runB3WorkspaceBrowserCase(
      result.cases,
      family,
      ['B3-WORKSPACE-001', 'B3-WORKSPACE-002'],
      'READ-MODEL-VIEWS',
      'Canonical B3 tabs and time views render one trusted revision without writing Timer state',
      async () => {
        const before = await bridge.coreSnapshot();
        const main = await waitFor(async () => page.evaluate(rootId => {
          const root = document.getElementById(rootId);
          const selected = root?.querySelector('.sc-tab[data-selected="true"]');
          return root?.dataset.workspaceState === 'loaded' && selected ? {
            workspaceState: root.dataset.workspaceState,
            brand: root.querySelector('.sc-proto-brand strong')?.textContent || '',
            logoCount: root.querySelectorAll('.sc-proto-shell img, .sc-brand-mark').length,
            selectedContextId: selected.dataset.context || null,
            selectedAria: selected.getAttribute('aria-label') || '',
            mainText: root.querySelector('.sc-content')?.textContent || ''
          } : null;
        }, ROOT_ID), 'B3 canonical workspace initial render', options.timeoutMs);
        assert(main.brand === 'SquareCoil Companion' && main.logoCount === 0,
          'Workspace header was not text-only SquareCoil Companion chrome', main);
        assert(main.selectedContextId === 'job:260701', 'Initial B3 selection did not reflect current Context truth', main);
        assert(main.selectedAria.includes('Today') && main.selectedAria.includes('timer limit') && main.selectedAria.includes('Running'), 'Compact tab omitted Today, threshold, or operational semantics', main);

        await clickMoreTool(page, 'overview', options.timeoutMs);
        const overview = await page.locator(`#${ROOT_ID} .sc-content`).innerText();
        const normalizedOverview = overview.toLowerCase();
        const overviewRoutes = await page.locator(`#${ROOT_ID} .sc-nav-grid [data-action="view"]:visible`).evaluateAll(nodes =>
          nodes.map(node => ({ view: node.dataset.view, label: node.querySelector('strong')?.textContent.trim() })));
        assert(normalizedOverview.includes('time overview') && normalizedOverview.includes('today by job') &&
          JSON.stringify(overviewRoutes) === JSON.stringify([{ view: 'by-day', label: 'By Day' }, { view: 'by-context', label: 'By job' }]),
        'B3 Overview destinations were incomplete', { overview, overviewRoutes });
        for (const [view, heading] of [['by-day', 'By Day'], ['by-context', 'By job']]) {
          await clickWorkspaceControl(page, `[data-action="view"][data-view="${view}"]`, options.timeoutMs);
          const routeHeading = await page.locator(`#${ROOT_ID} [data-sc-view-heading]`).innerText();
          assert(routeHeading === heading, 'B3 Overview destination did not open its canonical time view', { view, routeHeading });
          await clickWorkspaceControl(page, `[data-action="view"][data-view="overview"]`, options.timeoutMs);
        }
        await page.locator(`#${ROOT_ID} [data-action="view"][data-view="main"]`).click();
        await clickMoreTool(page, 'history', options.timeoutMs);
        const history = await page.locator(`#${ROOT_ID} .sc-content`).innerText();
        assert(history.includes('History') && history.includes('Current work stays on the timer until the session is complete.'),
          'B3 History did not preserve completed-session semantics', history);
        await page.locator(`#${ROOT_ID} [data-action="view"][data-view="main"]`).click();

        const after = await bridge.coreSnapshot();
        assert(after.revision === before.revision && after.ledgerSegmentCount === before.ledgerSegmentCount, 'B3 view navigation mutated authoritative Timer/Ledger state', { before, after });
        assert(result.network.nativeMutationAttempts.length === 0, 'B3 view navigation attempted a native SquareCoil mutation', result.network.nativeMutationAttempts);
        return { beforeRevision: before.revision, afterRevision: after.revision, main, overview, overviewRoutes, history };
      }
    );

    await runB4DataBrowserCase(
      result.cases,
      family,
      ['B4-DATA-001'],
      'PRODUCTS-SURFACE',
      'B4 data products expose one count-consistent revision without live-state authority',
      async () => {
        const before = await bridge.coreSnapshot();
        await openSettingsDestination(page, 'privacy', 'data-tools', options.timeoutMs);
        const surface = await page.locator(`#${ROOT_ID} .sc-content`).innerText();
        assert(surface.includes('Full Backup JSON') && surface.includes('History CSV') && surface.includes('Time Report CSV'), 'B4 data product surface was incomplete', surface);
        assert(surface.includes('SquareCoil official time is never changed'), 'B4 data surface omitted its native-data boundary', surface);
        const backup = await bridge.dataExport('FULL_BACKUP', {
          backupId: `a4-b4-${family}-backup`,
          exportedAtMs: Date.now(),
          sourcePlatform: `${family}-a4`
        });
        const history = await bridge.dataExport('HISTORY_CSV');
        const report = await bridge.dataExport('TIME_REPORT_CSV');
        await page.locator(`#${ROOT_ID} [data-action="settings-back"][data-view="settings"]`).click();
        await page.locator(`#${ROOT_ID} [data-action="settings-close"]`).click();
        assert(backup.format === 'squarecoil-companion-backup' && backup.schemaVersion === 1, 'Full Backup identity was invalid', backup);
        assert(backup.snapshotRevision === before.revision, 'Full Backup was not captured from the observed authoritative revision', { before, backup });
        assert(backup.recordCounts.contexts === backup.contexts.length && backup.recordCounts.ledgerSegments === backup.ledgerSegments.length && backup.recordCounts.recoveryEvidence === backup.recoveryEvidence.length, 'Full Backup record counts were inconsistent', backup.recordCounts);
        assert(!Object.hasOwn(backup, 'timer') && !Object.hasOwn(backup, 'lease') && !Object.hasOwn(backup, 'bridge'), 'Full Backup exposed live authority state', Object.keys(backup));
        assert(history.filename.includes('squarecoil-companion-history-') && history.text.includes('schema_version,record_type'), 'History CSV was not canonical and importable', history);
        assert(report.filename.includes('squarecoil-companion-time-report-') && report.text.includes('schema,Date,Job Number'), 'Time Report CSV was not identified as reporting output', report);
        const after = await bridge.coreSnapshot();
        assert(after.revision === before.revision && after.ledgerSegmentCount === before.ledgerSegmentCount, 'B4 exports mutated Timer/Ledger authority', { before, after });
        assert(result.network.nativeMutationAttempts.length === 0, 'B4 exports attempted a native SquareCoil mutation', result.network.nativeMutationAttempts);
        return { revision: before.revision, counts: backup.recordCounts, surface, historyFilename: history.filename, reportFilename: report.filename };
      }
    );

    await runB2ReadyBrowserCase(
      result.cases,
      family,
      ['B2-READY-001'],
      'OWNER-POPUP',
      'OWNER effective health and the packaged popup report final B2 READY',
      async () => {
        const settledHealth = await bridge.send({ type: MESSAGES.HEALTH });
        assert(settledHealth?.ready === true && settledHealth?.health?.state === 'READY', 'OWNER effective health was not READY', settledHealth);
        assert(settledHealth?.b2Settlement?.authorityDisposition === 'OWNER', 'OWNER settlement lost its authority disposition', settledHealth);

        const popupPage = await context.newPage();
        try {
          await popupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
          const popupTarget = await popupPage.evaluate(async fixtureOrigin => {
            const candidates = await chrome.tabs.query({ url: `${fixtureOrigin}/*` });
            const target = candidates.find(tab => Number.isInteger(tab.id));
            if (!target) return { activated: false, reason: 'fixture-tab-not-found' };
            await chrome.tabs.update(target.id, { active: true });
            const active = await chrome.tabs.query({ active: true, currentWindow: true });
            return {
              activated: active?.[0]?.id === target.id,
              targetTabId: target.id,
              activeTabId: active?.[0]?.id ?? null,
              activeUrl: active?.[0]?.url || null
            };
          }, FIXTURE_ORIGIN);
          assert(popupTarget.activated === true, 'Harness could not restore the SquareCoil fixture as the popup target tab', popupTarget);
          await popupPage.evaluate(() => document.getElementById('refresh')?.click());
          let lastPopupHealth = null;
          let popupHealth;
          try {
            popupHealth = await waitFor(async () => popupPage.evaluate(() => ({
              stage: document.getElementById('stage')?.textContent || '',
              friendlyStatus: document.getElementById('friendlyStatus')?.textContent || '',
              friendlyMessage: document.getElementById('friendlyMessage')?.textContent || '',
              classification: document.getElementById('classification')?.textContent || '',
              lifecycle: document.getElementById('lifecycle')?.textContent || '',
              reason: document.getElementById('reason')?.textContent || '',
              healthTone: document.body.dataset.health || '',
              statusTone: document.body.dataset.status || '',
              explanation: document.querySelector('.technical-card > p')?.textContent || '',
              technicalCollapsed: document.querySelector('.technical-card')?.open === false
            })).then(value => {
              lastPopupHealth = value;
              return value.lifecycle === 'READY' ? value : null;
            }), 'packaged popup READY rendering', options.timeoutMs);
          } catch (error) {
            error.details = { popupTarget, popupUrl: popupPage.url(), lastPopupHealth };
            throw error;
          }
          assert(popupHealth.stage === 'Your work at a glance', 'Popup did not use the friendly Companion identity', popupHealth);
          assert(popupHealth.friendlyStatus === 'Ready' && popupHealth.friendlyMessage === 'Companion is connected and ready.' && popupHealth.statusTone === 'ready',
            'Popup did not render the friendly READY status', popupHealth);
          assert(popupHealth.classification === 'HEALTHY_SAME_BUILD', 'Popup did not display healthy same-build classification', popupHealth);
          assert(popupHealth.reason === 'ready' && popupHealth.healthTone === 'ok', 'Popup did not render positive READY health', popupHealth);
          assert(popupHealth.explanation.includes('only after every required safety check passes') && popupHealth.technicalCollapsed,
            'Popup did not retain the fail-closed boundary behind collapsed Technical details', popupHealth);
          await popupPage.emulateMedia({ colorScheme: 'dark' });
          const popupDarkScreenshot = await captureUiEvidence(popupPage, options, family, 'popup-dark-ready', 'body');
          await popupPage.emulateMedia({ colorScheme: 'light' });
          const popupLightScreenshot = await captureUiEvidence(popupPage, options, family, 'popup-light-ready', 'body');
          await popupPage.emulateMedia({ colorScheme: null });
          return { settledHealth, popupTarget, popupHealth, screenshots: { popupDarkScreenshot, popupLightScreenshot } };
        } finally {
          await popupPage.close().catch(() => {});
          await page.bringToFront().catch(() => {});
        }
      }
    );

    await runB2KernelBrowserCase(
      result.cases,
      family,
      ['B2-KERNEL-001'],
      [],
      'MULTI-TAB',
      'Two tabs share one authority kernel and settle READY as OWNER and non-writing OBSERVER',
      async () => {
        assert(activeRuntimeId, 'Initial runtime was unavailable because the prerequisite case failed');
        const primaryAuthorityBefore = await waitFor(async () => {
          const snapshot = await bridge.authoritySnapshot();
          return snapshot?.healthy === true ? snapshot : null;
        }, 'primary isolated authority health', options.timeoutMs);
        const primaryBeforeState = await pageState(page);
        assertExpectedB1Shell(primaryBeforeState, 'primary multi-tab shell', candidateIdentity);
        assertHealthyB2KernelAuthority(primaryAuthorityBefore, 'primary multi-tab authority', primaryBeforeState);

        const observerPage = await context.newPage();
        let observerBridge = null;
        let evidence = null;
        observerPage.on('console', message => {
          if (message.type() === 'error' || message.type() === 'warning') result.console.errors.push({ type: message.type(), text: message.text(), page: 'observer' });
        });
        observerPage.on('pageerror', error => result.console.pageErrors.push(`observer: ${String(error?.message || error)}`));
        try {
          await observerPage.goto(`${FIXTURE_ORIGIN}${FIXTURE_PATH}`, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
          await waitFor(async () => (await pageState(observerPage)).documentToken, 'observer content-controller document identity', options.timeoutMs);
          observerBridge = new ContentBridge(context, observerPage, extensionId, options.timeoutMs, candidateIdentity);
          await observerBridge.initialize();

          const observerAuthority = await waitFor(async () => {
            const snapshot = await observerBridge.authoritySnapshot();
            return snapshot?.healthy === true ? snapshot : null;
          }, 'observer isolated authority health', options.timeoutMs);
          const primaryAuthority = await waitFor(async () => {
            const snapshot = await bridge.authoritySnapshot();
            return snapshot?.healthy === true ? snapshot : null;
          }, 'primary authority health with observer connected', options.timeoutMs);
          const primaryState = await pageState(page);
          const observerState = await pageState(observerPage);

          assertExpectedB1Shell(primaryState, 'primary shell with observer', candidateIdentity);
          assertExpectedB1Shell(observerState, 'observer shell', candidateIdentity);
          assertHealthyB2KernelAuthority(primaryAuthority, 'primary authority with observer', primaryState);
          assertHealthyB2KernelAuthority(observerAuthority, 'observer authority', observerState);
          assert(primaryAuthority.disposition === 'OWNER', 'First tab did not retain OWNER authority', { primaryAuthority, observerAuthority });
          assert(observerAuthority.disposition === 'OBSERVER_CONNECTED', 'Second tab did not join as OBSERVER_CONNECTED', { primaryAuthority, observerAuthority });
          assert(primaryAuthority.workerInstanceId === observerAuthority.workerInstanceId, 'Tabs did not connect to one worker authority', { primaryAuthority, observerAuthority });
          assert(primaryAuthority.revision === observerAuthority.revision, 'Tabs did not observe the same authoritative revision', { primaryAuthority, observerAuthority });
          assert(primaryState.health?.state !== 'READY' && observerState.health?.state !== 'READY', 'Isolated MAIN shells bypassed worker-owned settlement', { primaryState, observerState });
          const effectiveHealth = await waitFor(async () => {
            const owner = await bridge.send({ type: MESSAGES.HEALTH });
            const observer = await observerBridge.send({ type: MESSAGES.HEALTH });
            return owner?.ready === true && observer?.ready === true ? { owner, observer } : null;
          }, 'OWNER and OBSERVER effective READY settlement', options.timeoutMs);
          assert(effectiveHealth.owner.b2Settlement?.authorityDisposition === 'OWNER', 'Primary effective health did not settle as OWNER', effectiveHealth);
          assert(effectiveHealth.observer.b2Settlement?.authorityDisposition === 'OBSERVER_CONNECTED', 'Observer effective health did not settle as OBSERVER_CONNECTED', effectiveHealth);
          const observerCore = await observerBridge.coreSnapshot();
          assert(observerCore?.authorityOwner === false, 'Observer trusted core became an authority owner', observerCore);
          assert(observerCore?.bridge?.owner === false && observerCore.bridge.requestCount === 0, 'Observer Bridge became a verification writer', observerCore?.bridge);
          evidence = {
            primaryAuthority,
            observerAuthority,
            effectiveHealth,
            observerCore,
            primaryRuntimeInstanceId: primaryState.runtimeInstanceId,
            observerRuntimeInstanceId: observerState.runtimeInstanceId,
            sharedRevision: primaryAuthority.revision,
            sharedWorkerInstanceId: primaryAuthority.workerInstanceId
          };
        } finally {
          try {
            if (observerBridge) {
              const observerCleanup = await observerBridge.authorityTeardown();
              assert(observerCleanup?.disconnected === true, 'Observer authority teardown did not confirm disconnection', observerCleanup);
              const observerAuthorityAfterCleanup = await observerBridge.authoritySnapshot();
              assert(
                observerAuthorityAfterCleanup?.enabled === false && observerAuthorityAfterCleanup?.healthy === false,
                'Observer isolated authority remained active after teardown',
                observerAuthorityAfterCleanup
              );
              if (evidence) {
                evidence.observerCleanup = observerCleanup;
                evidence.observerAuthorityAfterCleanup = observerAuthorityAfterCleanup;
              }
            }
          } finally {
            if (observerBridge) await observerBridge.detach();
            await observerPage.close().catch(() => {});
          }
        }

        assert(evidence, 'Multi-tab authority evidence was not captured');
        const afterCleanup = await waitFor(async () => {
          const snapshot = await bridge.authoritySnapshot();
          return snapshot?.healthy === true && snapshot.disposition === 'OWNER' ? snapshot : null;
        }, 'primary OWNER authority after observer cleanup', options.timeoutMs);
        const fixturePages = context.pages().filter(candidate => candidate.url() === `${FIXTURE_ORIGIN}${FIXTURE_PATH}`);
        assert(fixturePages.length === 1 && fixturePages[0] === page, 'Observer fixture page was not cleaned up', fixturePages.map(candidate => candidate.url()));
        assertHealthyB2KernelAuthority(afterCleanup, 'primary authority after observer cleanup', await pageState(page));
        return { ...evidence, afterCleanup, remainingFixturePages: fixturePages.length };
      },
      { b2ReadyFixtureIds: ['B2-READY-002'] }
    );

    await runB2TransitionBrowserCase(
      result.cases,
      family,
      ['B2-TRANSITION-002', 'B2-TRANSITION-003'],
      'OWNER-OBSERVER-SWITCH',
      'OWNER and OBSERVER synchronize one atomic Job A to Job B transition',
      async () => {
        const observerPage = await context.newPage();
        let observerBridge = null;
        try {
          await observerPage.goto(`${FIXTURE_ORIGIN}${FIXTURE_PATH}`, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
          await waitFor(async () => (await pageState(observerPage)).documentToken, 'B2.2 observer document identity', options.timeoutMs);
          observerBridge = new ContentBridge(context, observerPage, extensionId, options.timeoutMs, candidateIdentity);
          await observerBridge.initialize();
          await waitFor(async () => {
            const ownerSelected = await page.locator(`#${ROOT_ID} .sc-tab[data-selected="true"]`).getAttribute('data-context').catch(() => null);
            const observerSelected = await observerPage.locator(`#${ROOT_ID} .sc-tab[data-selected="true"]`).getAttribute('data-context').catch(() => null);
            return ownerSelected === 'job:260701' && observerSelected === 'job:260701' ? true : null;
          }, 'B3 OWNER and OBSERVER baseline Context render', options.timeoutMs);

          await page.waitForTimeout(25);

          // A pending same-context Bridge verification can commit its own
          // revision between the baseline and the deliberate Job switch.
          // Start the one-revision assertion from a fully settled baseline.
          const before = await waitFor(async () => {
            const ownerCore = await bridge.coreSnapshot();
            const observerCore = await observerBridge.coreSnapshot();
            return ownerCore?.authorityOwner === true && observerCore?.authorityOwner === false &&
              ownerCore.bridge?.initialized === true && observerCore.bridge?.initialized === true &&
              ownerCore.bridge.pendingEventCount === 0 && ownerCore.bridge.verificationInFlight === false &&
              ownerCore.timer?.lastObservation?.bridgeSeq === ownerCore.bridge.bridgeSeq &&
              ownerCore.revision === observerCore.revision && ownerCore.timer?.currentContextId === 'job:260701' &&
              observerCore.timer?.currentContextId === 'job:260701'
              ? { ownerCore, observerCore }
              : null;
          }, 'settled B2.2 OWNER and OBSERVER switch baseline', options.timeoutMs);
          assert(before.observerCore.bridge.requestCount === 0, 'OBSERVER issued a server verification request', before.observerCore.bridge);

          transitionFixture.clockContext = { projectId: '260702', label: '260702 - Fabrication' };
          await page.evaluate(contextValue => {
            for (const selector of ['#clockin-remaining-time', '#clockin-debug']) {
              const element = document.querySelector(selector);
              if (!element) continue;
              element.innerHTML = selector === '#clockin-remaining-time'
                ? `<a href="/project.php?id=${contextValue.projectId}">${contextValue.label}</a>`
                : '';
            }
          }, transitionFixture.clockContext);
          await bridge.syncBridge();
          let lastPropagation = null;
          let after;
          try {
            after = await waitFor(async () => {
              const ownerCore = await bridge.coreSnapshot();
              const observerCore = await observerBridge.coreSnapshot();
              lastPropagation = { ownerCore, observerCore };
              return ownerCore?.timer?.currentContextId === 'job:260702' &&
                observerCore?.timer?.currentContextId === 'job:260702' &&
                ownerCore.bridge?.initialized === true && observerCore.bridge?.initialized === true &&
                ownerCore.revision === observerCore.revision &&
                ownerCore.ledgerSegmentCount === 1 && observerCore.ledgerSegmentCount === 1
                ? lastPropagation
                : null;
            }, 'atomic Job A to Job B propagation', options.timeoutMs);
          } catch (error) {
            error.details = {
              before,
              lastPropagation,
              action7Requests: result.network.action7.length,
              fixtureContext: transitionFixture.clockContext
            };
            throw error;
          }
          assert(after.ownerCore.revision === before.ownerCore.revision + 1, 'Job switch did not commit as one authoritative revision', { before, after });
          assert(after.ownerCore.timer.lastObservation?.type === 'CONTEXT_CHANGED' &&
            after.ownerCore.timer.focusIntent?.sourceStateRevision === after.ownerCore.revision,
          'Job switch did not own the committed revision', { before, after });
          assert(after.ownerCore.authorityTenure?.coordinationEpoch === before.ownerCore.authorityTenure?.coordinationEpoch,
          'Job switch crossed an authority tenure', { before, after });
          assert(after.ownerCore.timer.todayTotalMs > 0, 'Closed Job A interval was not reflected in today total', after.ownerCore.timer);
          assert(after.ownerCore.timer.currentContextTotalMs >= 0, 'Job B total was unavailable', after.ownerCore.timer);
          assert(after.observerCore.bridge.requestCount === 0, 'OBSERVER became a duplicate Bridge writer during the switch', after.observerCore.bridge);
          assert(result.network.nativeMutationAttempts.length === 0, 'Job switch attempted a native SquareCoil mutation', result.network.nativeMutationAttempts);
          const focusEvidence = await waitFor(async () => {
            const owner = await page.evaluate(rootId => {
              const root = document.getElementById(rootId);
              const selected = root?.querySelector('.sc-tab[data-selected="true"]');
              return selected ? { selectedContextId: selected.dataset.context, collapsed: root.dataset.protoCollapsed } : null;
            }, ROOT_ID);
            const observer = await observerPage.evaluate(rootId => {
              const root = document.getElementById(rootId);
              const selected = root?.querySelector('.sc-tab[data-selected="true"]');
              return selected ? { selectedContextId: selected.dataset.context, collapsed: root.dataset.protoCollapsed } : null;
            }, ROOT_ID);
            return owner?.selectedContextId === 'job:260702' && observer?.selectedContextId === 'job:260702'
              ? { owner, observer } : null;
          }, 'B3 incoming Context focus in OWNER and OBSERVER workspaces', options.timeoutMs);

          await clickWorkspaceTab(page, 'job:260701', options.timeoutMs);
          await clickWorkspaceControl(page, `[data-action="collapse"]`, options.timeoutMs);
          await bridge.syncBridge();
          const heartbeatEvidence = await waitFor(async () => page.evaluate(rootId => {
            const root = document.getElementById(rootId);
            const selected = root?.querySelector('.sc-tab[data-selected="true"]');
            return root?.dataset.protoCollapsed === 'true' && selected?.dataset.context === 'job:260701'
              ? { collapsed: root.dataset.protoCollapsed, selectedContextId: selected.dataset.context } : null;
          }, ROOT_ID), 'same-Context heartbeat focus stability', options.timeoutMs);
          await clickWorkspaceControl(page, `[data-action="collapse"]`, options.timeoutMs);
          await page.locator(`#${ROOT_ID} .sc-content`).waitFor({ state: 'visible', timeout: options.timeoutMs });

          const presentationBefore = await bridge.coreSnapshot();
          await clickWorkspaceTab(page, 'job:260702', options.timeoutMs);
          await revealWorkspaceTab(page, 'job:260701', options.timeoutMs);
          await page.locator(`#${ROOT_ID} [data-action="hide-tab"][data-context="job:260701"]`).click({ force: true });
          await waitFor(async () => {
            const ownerVisible = await page.locator(`#${ROOT_ID} .sc-tab[data-context="job:260701"]`).count();
            const observerVisible = await observerPage.locator(`#${ROOT_ID} .sc-tab[data-context="job:260701"]`).count();
            return ownerVisible === 0 && observerVisible === 0 ? true : null;
          }, 'cross-tab B3 hidden-tab synchronization', options.timeoutMs);
          await clickMoreTool(page, 'recent', options.timeoutMs);
          await page.locator(`#${ROOT_ID} [data-action="show-tab"][data-context="job:260701"]`).click({ force: true });
          await waitFor(async () => {
            const ownerVisible = await page.locator(`#${ROOT_ID} .sc-tab[data-context="job:260701"]`).count();
            const observerVisible = await observerPage.locator(`#${ROOT_ID} .sc-tab[data-context="job:260701"]`).count();
            return ownerVisible === 1 && observerVisible === 1 ? true : null;
          }, 'cross-tab B3 restored-tab synchronization', options.timeoutMs);
          await revealWorkspaceTab(page, 'job:260701', options.timeoutMs);
          await page.locator(`#${ROOT_ID} .sc-tab[data-context="job:260702"]`).dragTo(
            page.locator(`#${ROOT_ID} .sc-tab[data-context="job:260701"]`),
            { force: true }
          );
          const orderEvidence = await waitFor(async () => {
            const owner = await page.evaluate(rootId => Array.from(document.getElementById(rootId)?.querySelectorAll('.sc-tab') || []).map(node => node.dataset.context), ROOT_ID);
            const observer = await observerPage.evaluate(rootId => Array.from(document.getElementById(rootId)?.querySelectorAll('.sc-tab') || []).map(node => node.dataset.context), ROOT_ID);
            return owner[0] === 'job:260702' && JSON.stringify(owner) === JSON.stringify(observer) ? { owner, observer } : null;
          }, 'cross-tab B3 durable tab-order synchronization', options.timeoutMs);
          const presentationAfter = await bridge.coreSnapshot();
          const timerLedgerBefore = timerLedgerBoundaryIdentity(presentationBefore);
          const timerLedgerAfter = timerLedgerBoundaryIdentity(presentationAfter);
          assert(JSON.stringify(timerLedgerAfter) === JSON.stringify(timerLedgerBefore),
            'B3 select/hide/show/reorder changed authoritative Timer/Ledger boundary identity',
            { timerLedgerBefore, timerLedgerAfter, presentationBefore, presentationAfter });
          assert(result.network.nativeMutationAttempts.length === 0, 'B3 workspace interaction attempted a native SquareCoil mutation', result.network.nativeMutationAttempts);
          return { before, after, focusEvidence, heartbeatEvidence, orderEvidence, action7Requests: result.network.action7.length };
        } finally {
          if (observerBridge) {
            await observerBridge.authorityTeardown().catch(() => {});
            await observerBridge.detach();
          }
          await observerPage.close().catch(() => {});
        }
      },
      { b3WorkspaceFixtureIds: ['B3-WORKSPACE-003', 'B3-WORKSPACE-004'] }
    );

    await runB4DataBrowserCase(
      result.cases,
      family,
      ['B4-DATA-002', 'B4-DATA-003', 'B4-DATA-004'],
      'ARCHIVE-RESTORE-FAIL-CLOSED',
      'B4 drag Archive/Undo, protected cancel, duplicate merge, and invalid Replace preserve authoritative time',
      async () => {
        const before = await bridge.coreSnapshot();
        const jobABefore = before.timer.contextRows.find(row => row.contextId === 'job:260701');
        assert(jobABefore && jobABefore.status === 'NOT_RUNNING', 'B4 archive fixture did not have an inactive Context', before.timer.contextRows);

        let malformedError = null;
        try {
          await bridge.stageDataAction('DATA_RESTORE_BACKUP', { input: '{not-json', mode: 'MERGE' });
        } catch (error) { malformedError = String(error?.message || error); }
        const afterMalformed = await bridge.coreSnapshot();
        assert(malformedError && /json|backup/i.test(malformedError), 'Malformed restore did not fail closed', malformedError);
        assert(afterMalformed.ledgerSegmentCount === before.ledgerSegmentCount &&
          afterMalformed.data?.datasetId === before.data?.datasetId &&
          stableJson(afterMalformed.data?.lastMutation) === stableJson(before.data?.lastMutation) &&
          stableJson(afterMalformed.preferences) === stableJson(before.preferences),
        'Malformed restore changed authoritative data; unrelated Bridge verification may still advance the live Timer revision', { before, afterMalformed });

        const originalViewport = page.viewportSize();
        assert(originalViewport, 'B4 short-viewport acceptance requires a fixed viewport');
        await openSettingsHome(page, options.timeoutMs);
        await page.setViewportSize({ width: 900, height: 440 });
        const shortViewport = await page.evaluate(rootId => {
          const root = document.getElementById(rootId);
          const tabs = root?.querySelector('.sc-tabs');
          const content = root?.querySelector('.sc-content');
          const shell = root?.querySelector('.sc-proto-shell');
          if (!root || !tabs || !content || !shell) return null;
          const rootRect = root.getBoundingClientRect();
          const tabsRect = tabs.getBoundingClientRect();
          const shellRect = shell.getBoundingClientRect();
          content.scrollTop = content.scrollHeight;
          return {
            root: { top: rootRect.top, right: rootRect.right, bottom: rootRect.bottom, left: rootRect.left },
            tabs: { top: tabsRect.top, right: tabsRect.right, bottom: tabsRect.bottom, left: tabsRect.left },
            shell: { top: shellRect.top, right: shellRect.right, bottom: shellRect.bottom, left: shellRect.left },
            viewport: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
            content: { clientHeight: content.clientHeight, scrollHeight: content.scrollHeight, scrollTop: content.scrollTop }
          };
        }, ROOT_ID);
        assert(shortViewport && shortViewport.root.top >= 0 && shortViewport.root.left >= 0 &&
          shortViewport.root.right <= shortViewport.viewport.width && shortViewport.root.bottom <= shortViewport.viewport.height,
        'B4 Companion root was not fully reachable in a short viewport', shortViewport);
        assert(shortViewport.tabs.top >= 0 && shortViewport.tabs.bottom <= shortViewport.shell.bottom &&
          shortViewport.content.scrollHeight > shortViewport.content.clientHeight && shortViewport.content.scrollTop > 0,
        'B4 tabs or settings content were not reachable and scrollable in a short viewport', shortViewport);
        const shortViewportScreenshot = await capturePageEvidence(page, options, family, 'b4-short-viewport-scroll');
        await page.setViewportSize(originalViewport);
        await page.locator(`#${ROOT_ID} [data-action="settings-close"]`).click({ force: true });
        const mainWorkspaceButton = page.locator(`#${ROOT_ID} [data-action="view"][data-view="main"]`);
        if (await mainWorkspaceButton.count()) await mainWorkspaceButton.click({ force: true });
        await clickMoreTool(page, 'recent', options.timeoutMs);
        const archiveAuthorityBefore = await bridge.coreSnapshot();
        let mouseHeld = false;
        let eligibleVeil = null;
        try {
          await beginTrustedTabDragOutside(page, 'job:260701', options.timeoutMs);
          mouseHeld = true;
          eligibleVeil = await visibleArchiveVeil(page, options.timeoutMs, 'eligible');
          assert(eligibleVeil.title === 'Release to archive' && /hours and history stay saved/i.test(eligibleVeil.detail),
            'Eligible drag veil did not explain the safe Archive boundary', eligibleVeil);
          await capturePageEvidence(page, options, family, 'b4-drag-archive-eligible');
          await page.mouse.up();
          mouseHeld = false;
        } finally {
          if (mouseHeld) await page.mouse.up().catch(() => {});
        }
        const archived = await waitFor(async () => {
          const snapshot = await bridge.coreSnapshot();
          return snapshot?.data?.archivedRows?.some(row => row.contextId === 'job:260701') ? snapshot : null;
        }, 'B4 trusted drag archived Context commit', options.timeoutMs);
        const archivedRow = archived.data.archivedRows.find(row => row.contextId === 'job:260701');
        assert(archivedRow.totalMs === jobABefore.totalMs, 'Archive changed the Context total', { jobABefore, archivedRow });
        assert(archived.data?.lastMutation?.type === 'DATA_ARCHIVE_CONTEXT',
          'Drag release did not route through authoritative DATA_ARCHIVE_CONTEXT', archived.data?.lastMutation);
        assert(archived.ledgerSegmentCount === archiveAuthorityBefore.ledgerSegmentCount &&
          stableJson(archived.timer?.historyRows || []) === stableJson(archiveAuthorityBefore.timer?.historyRows || []) &&
          archived.timer?.currentContextId === archiveAuthorityBefore.timer?.currentContextId,
        'Drag Archive changed Timer/Ledger/history authority', { archiveAuthorityBefore, archived });
        const undo = page.locator(`#${ROOT_ID} [data-action="undo-archive"][data-context="job:260701"]`);
        await undo.waitFor({ state: 'visible', timeout: options.timeoutMs });
        await undo.click({ force: true });
        const restored = await waitFor(async () => {
          const snapshot = await bridge.coreSnapshot();
          return snapshot?.data?.recentRows?.some(row => row.contextId === 'job:260701') && !snapshot.data.archivedRows.some(row => row.contextId === 'job:260701') ? snapshot : null;
        }, 'B4 Undo restored Context commit', options.timeoutMs);
        const restoredRow = restored.data.recentRows.find(row => row.contextId === 'job:260701');
        assert(restoredRow.totalMs === jobABefore.totalMs, 'Restore changed the Context total', { jobABefore, restoredRow });
        assert(restored.ledgerSegmentCount === archiveAuthorityBefore.ledgerSegmentCount &&
          stableJson(restored.timer?.historyRows || []) === stableJson(archiveAuthorityBefore.timer?.historyRows || []) &&
          restored.timer?.currentContextId === archiveAuthorityBefore.timer?.currentContextId,
        'Archive Undo changed Timer/Ledger/history authority', { archiveAuthorityBefore, restored });
        await waitFor(async () => page.evaluate(rootId => {
          const root = document.getElementById(rootId);
          return root?.dataset.busy === 'false' && !root.querySelector('.sc-archive-notice') ? true : null;
        }, ROOT_ID), 'B4 Undo presentation settlement before protected drag', options.timeoutMs);

        const protectedBefore = await bridge.coreSnapshot();
        let protectedMouseHeld = false;
        let blockedVeil = null;
        try {
          await beginTrustedTabDragOutside(page, 'job:260702', options.timeoutMs);
          protectedMouseHeld = true;
          blockedVeil = await visibleArchiveVeil(page, options.timeoutMs, 'blocked');
          assert(blockedVeil.title === 'This job stays open' && /cannot be archived/i.test(blockedVeil.detail),
            'Protected drag veil did not explain its fail-closed decision', blockedVeil);
          await capturePageEvidence(page, options, family, 'b4-drag-archive-protected');
          await page.mouse.up();
          protectedMouseHeld = false;
        } finally {
          if (protectedMouseHeld) await page.mouse.up().catch(() => {});
        }
        await page.waitForTimeout(200);
        const protectedAfter = await bridge.coreSnapshot();
        assert(!protectedAfter.data?.archivedRows?.some(row => row.contextId === 'job:260702') &&
          protectedAfter.timer?.currentContextId === 'job:260702' &&
          protectedAfter.ledgerSegmentCount === protectedBefore.ledgerSegmentCount &&
          stableJson(protectedAfter.timer?.historyRows || []) === stableJson(protectedBefore.timer?.historyRows || []) &&
          stableJson(protectedAfter.data?.lastMutation) === stableJson(protectedBefore.data?.lastMutation),
        'Current/protected tab drag did not fail closed', { protectedBefore, protectedAfter });

        const cancelBefore = await bridge.coreSnapshot();
        let cancelMouseHeld = false;
        try {
          await beginTrustedTabDragOutside(page, 'job:260701', options.timeoutMs);
          cancelMouseHeld = true;
          await visibleArchiveVeil(page, options.timeoutMs, 'eligible');
          await page.keyboard.press('Escape');
          await page.mouse.up();
          cancelMouseHeld = false;
        } finally {
          if (cancelMouseHeld) await page.mouse.up().catch(() => {});
        }
        await waitFor(async () => page.locator(`#${ROOT_ID} .sc-archive-veil[data-visible="true"]`).count().then(count => count === 0 ? true : null),
          'B4 Escape canceled outside drag veil', options.timeoutMs);
        const cancelAfter = await bridge.coreSnapshot();
        assert(!cancelAfter.data?.archivedRows?.some(row => row.contextId === 'job:260701') &&
          cancelAfter.ledgerSegmentCount === cancelBefore.ledgerSegmentCount &&
          stableJson(cancelAfter.timer?.historyRows || []) === stableJson(cancelBefore.timer?.historyRows || []) &&
          stableJson(cancelAfter.data?.lastMutation) === stableJson(cancelBefore.data?.lastMutation),
        'Escape/off-panel cancel archived or mutated authoritative history', { cancelBefore, cancelAfter });

        await openSettingsDestination(page, 'privacy', 'data-tools', options.timeoutMs);

        const backup = await bridge.dataExport('FULL_BACKUP', {
          backupId: `a4-b4-${family}-dedupe`,
          exportedAtMs: Date.now(),
          sourcePlatform: `${family}-a4`
        });
        const historyCsv = await bridge.dataExport('HISTORY_CSV');
        const duplicatePlan = await bridge.stageDataAction('DATA_IMPORT_HISTORY_CSV', { input: historyCsv.text });
        assert(duplicatePlan.blocked === false && duplicatePlan.summary.segmentsAdded === 0 && duplicatePlan.summary.duplicates >= historyCsv.recordCount, 'Exact History CSV import did not dedupe existing history', duplicatePlan);
        await bridge.commitDataAction(duplicatePlan.planId, { confirmationTokens: [] });
        const afterDedupe = await bridge.coreSnapshot();
        assert(afterDedupe.ledgerSegmentCount === restored.ledgerSegmentCount, 'Duplicate merge double-counted ledger history', { restored, afterDedupe, duplicatePlan });

        let replaceError = null;
        try {
          await bridge.stageDataAction('DATA_RESTORE_BACKUP', { input: backup, mode: 'REPLACE', importWorkspace: true, importPreferences: true });
        } catch (error) { replaceError = String(error?.message || error); }
        const afterReplaceAttempt = await bridge.coreSnapshot();
        assert(replaceError && /quiescence/i.test(replaceError), 'Active-state Replace was not rejected', replaceError);
        assert(afterReplaceAttempt.revision === afterDedupe.revision && afterReplaceAttempt.ledgerSegmentCount === afterDedupe.ledgerSegmentCount, 'Rejected Replace changed authoritative state', { afterDedupe, afterReplaceAttempt });
        assert(result.network.nativeMutationAttempts.length === 0, 'B4 data operations attempted a native SquareCoil mutation', result.network.nativeMutationAttempts);
        await page.locator(`#${ROOT_ID} [data-action="settings-back"][data-view="settings"]`).click({ force: true });
        await page.locator(`#${ROOT_ID} [data-action="settings-close"]`).click({ force: true });
        return {
          malformedError,
          shortViewport,
          shortViewportScreenshot,
          eligibleVeil,
          blockedVeil,
          archivedRevision: archived.revision,
          restoredRevision: restored.revision,
          duplicateSummary: duplicatePlan.summary,
          replaceError,
          ledgerSegmentCount: afterReplaceAttempt.ledgerSegmentCount
        };
      }
    );

    await runB5SettingsBrowserCase(
      result.cases,
      family,
      ['B5-SETTINGS-001', 'B5-SETTINGS-002', 'B5-SETTINGS-003', 'B5-SETTINGS-004', 'B5-SETTINGS-005'],
      'SETTLED-PREFERENCES-PRESENTATION-SUPPORT',
      'B5-A settings settle across tabs while presentation and Support stay bounded and fail closed',
      async () => {
        const before = await bridge.coreSnapshot();
        const observerPage = await context.newPage();
        let observerBridge = null;
        try {
          await observerPage.goto(`${FIXTURE_ORIGIN}${FIXTURE_PATH}`, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
          await waitFor(async () => (await pageState(observerPage)).documentToken, 'B5-A observer document identity', options.timeoutMs);
          observerBridge = new ContentBridge(context, observerPage, extensionId, options.timeoutMs, candidateIdentity);
          await observerBridge.initialize();
          await waitFor(async () => {
            const snapshot = await observerBridge.coreSnapshot();
            return snapshot?.preferences?.preferenceRevision === before.preferences.preferenceRevision ? snapshot : null;
          }, 'B5-A observer preference baseline', options.timeoutMs);

          await openSettingsHome(page, options.timeoutMs);
          const settingsHome = await page.locator(`#${ROOT_ID} .sc-content`).innerText();
          const settingsCategories = await page.locator(`#${ROOT_ID} [data-action="settings-toggle-group"] strong`).allTextContents();
          assert(JSON.stringify(settingsCategories.map(value => value.trim())) === JSON.stringify([
            'Appearance', 'Features', 'Time tracking', 'Jobs', 'Notifications',
            'Privacy and data', 'Help'
          ]), 'B5-A Settings Home was incomplete', { settingsHome, settingsCategories });

          await openSettingsDestination(page, 'appearance', 'timer-appearance', options.timeoutMs);
          await clickWorkspaceControl(page, `[data-action="preference"][data-value="AUTO"]`, options.timeoutMs);
          const autoSnapshot = await waitFor(async () => {
            const snapshot = await bridge.coreSnapshot();
            return snapshot?.preferences?.timerAppearance === 'AUTO' ? snapshot : null;
          }, 'B5-A Auto preference commit', options.timeoutMs);
          await waitFor(async () => await page.locator(`#${ROOT_ID} [data-action="preference"][data-value="AUTO"][data-active="true"]`).count() ? true : null, 'B5-A Auto UI settlement', options.timeoutMs);
          await clickWorkspaceControl(page, `[data-action="preference-finish"][data-value="GLASS"]`, options.timeoutMs);
          const glassSnapshot = await waitFor(async () => {
            const snapshot = await bridge.coreSnapshot();
            return snapshot?.preferences?.panelFinish === 'GLASS' ? snapshot : null;
          }, 'B5-A Glass preference commit', options.timeoutMs);
          await waitFor(async () => await page.locator(`#${ROOT_ID} [data-action="preference-finish"][data-value="GLASS"][data-active="true"]`).count() ? true : null, 'B5-A Glass UI settlement', options.timeoutMs);
          assert(['GLASS', 'SOLID_FALLBACK'].includes(glassSnapshot.presentation.panelFinishEffective), 'B5-A Glass did not report its real effective presentation', glassSnapshot.presentation);

          const clearBoundaryBefore = timerLedgerBoundaryIdentity(await bridge.coreSnapshot());
          await clickWorkspaceControl(page, `[data-action="preference"][data-value="CLEAR"]`, options.timeoutMs);
          await waitFor(async () => page.evaluate(rootId => {
            const root = document.getElementById(rootId);
            return root?.dataset.protoTheme === 'clear' && root.dataset.protoSurface === 'glass' ? true : null;
          }, ROOT_ID), 'B5-A Clear glass appearance', options.timeoutMs);
          const transparencyCdp = await context.newCDPSession(page);
          let clearFallback;
          try {
            await transparencyCdp.send('Emulation.setEmulatedMedia', {
              features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }]
            });
            clearFallback = await waitFor(async () => page.evaluate(rootId => {
              const root = document.getElementById(rootId);
              const shell = root?.querySelector('.sc-proto-shell');
              const css = shell ? getComputedStyle(shell) : null;
              const proof = { reducedTransparency: matchMedia('(prefers-reduced-transparency: reduce)').matches,
                theme: root?.dataset.protoTheme, surface: root?.dataset.protoSurface,
                backdrop: css?.backdropFilter || css?.webkitBackdropFilter,
                background: css?.backgroundColor };
              return proof.reducedTransparency && proof.theme === 'clear' && proof.surface === 'solid' &&
                proof.backdrop === 'none' && proof.background === 'rgb(37, 49, 60)' ? proof : null;
            }, ROOT_ID), 'B5-A Clear readable Solid accessibility fallback', options.timeoutMs);
          } finally {
            await transparencyCdp.send('Emulation.setEmulatedMedia', { features: [] });
            await transparencyCdp.detach();
          }
          await clickWorkspaceControl(page, `[data-action="preference"][data-value="AUTO"]`, options.timeoutMs);
          assert(JSON.stringify(timerLedgerBoundaryIdentity(await bridge.coreSnapshot())) === JSON.stringify(clearBoundaryBefore),
            'B5-A Clear accessibility fallback changed Timer/Ledger state');

          await clickWorkspaceControl(page, `[data-action="settings-back"][data-view="settings"]`, options.timeoutMs);
          await openSettingsDestination(page, 'appearance', 'website-theme', options.timeoutMs);
          const beforeDarkTheme = await bridge.coreSnapshot();
          await bridge.preferenceAction({ websiteTheme: 'SLEEK_DARK' }, beforeDarkTheme.preferences.preferenceRevision);
          const darkPresentation = await waitFor(async () => page.evaluate(() => ({
            layerCount: document.querySelectorAll('#squarecoil-companion-site-theme').length,
            effective: document.documentElement.getAttribute('data-squarecoil-companion-site-theme')
          })).then(value => value.layerCount === 1 && value.effective === 'SLEEK_DARK' ? value : null), 'B5-A Sleek Dark presentation', options.timeoutMs);
          await waitFor(async () => await page.locator(`#${ROOT_ID} [data-action="preference-site"][data-value="SLEEK_DARK"][data-active="true"]`).count() ? true : null, 'B5-A Sleek Dark UI settlement', options.timeoutMs);
          const beforeLightTheme = await bridge.coreSnapshot();
          await bridge.preferenceAction({ websiteTheme: 'LIGHT_GLASS' }, beforeLightTheme.preferences.preferenceRevision);
          const lightGlassPresentation = await waitFor(async () => page.evaluate(() => ({
            layerCount: document.querySelectorAll('#squarecoil-companion-site-theme').length,
            effective: document.documentElement.getAttribute('data-squarecoil-companion-site-theme')
          })).then(value => value.layerCount === 1 && value.effective === 'LIGHT_GLASS' ? value : null), 'B5-E Light Glass presentation', options.timeoutMs);
          await waitFor(async () => await page.locator(`#${ROOT_ID} [data-action="preference-site"][data-value="LIGHT_GLASS"][data-active="true"]`).count() ? true : null, 'B5-E Light Glass UI settlement', options.timeoutMs);
          await clickWorkspaceControl(page, `[data-action="preference-site"][data-value="REFINED_LIGHT"]`, options.timeoutMs);
          const refinedPresentation = await waitFor(async () => page.evaluate(() => ({
            layerCount: document.querySelectorAll('#squarecoil-companion-site-theme').length,
            effective: document.documentElement.getAttribute('data-squarecoil-companion-site-theme')
          })).then(value => value.layerCount === 1 && value.effective === 'REFINED_LIGHT' ? value : null), 'B5-A Refined Light presentation', options.timeoutMs);
          await waitFor(async () => await page.locator(`#${ROOT_ID} [data-action="preference-site"][data-value="REFINED_LIGHT"][data-active="true"]`).count() ? true : null, 'B5-A Refined Light UI settlement', options.timeoutMs);
          await clickWorkspaceControl(page, `[data-action="preference-site"][data-value="ORIGINAL"]`, options.timeoutMs);
          const originalPresentation = await waitFor(async () => page.evaluate(() => ({
            layerCount: document.querySelectorAll('#squarecoil-companion-site-theme').length,
            effective: document.documentElement.getAttribute('data-squarecoil-companion-site-theme')
          })).then(value => value.layerCount === 0 && value.effective === null ? value : null), 'B5-A Original presentation restoration', options.timeoutMs);
          await waitFor(async () => await page.locator(`#${ROOT_ID} [data-action="preference-site"][data-value="ORIGINAL"][data-active="true"]`).count() ? true : null, 'B5-A Original UI settlement', options.timeoutMs);

          await clickWorkspaceControl(page, `[data-action="settings-back"][data-view="settings"]`, options.timeoutMs);
          await openSettingsDestination(page, 'time', 'timer-limits', options.timeoutMs);
          await page.locator(`#${ROOT_ID} [data-sc-limits-form] input[name="yellowMinutes"]`).fill('45', { force: true });
          const observerBefore = await observerBridge.coreSnapshot();
          await observerBridge.preferenceAction({ yellowMinutes: 50, orangeMinutes: 100, redMinutes: 200 }, observerBefore.preferences.preferenceRevision);
          const crossTab = await waitFor(async () => {
            const owner = await bridge.coreSnapshot();
            const observer = await observerBridge.coreSnapshot();
            return owner?.preferences?.yellowMinutes === 50 && owner.preferences.preferenceRevision === observer?.preferences?.preferenceRevision
              ? { owner, observer } : null;
          }, 'B5-A cross-tab preference settlement', options.timeoutMs);
          await page.locator(`#${ROOT_ID} [data-sc-limits-form] input[name="yellowMinutes"]`).evaluate(input => input.blur());
          await waitFor(async () => page.evaluate(rootId => {
            const active = document.activeElement;
            return !active?.matches?.(`#${rootId} [data-sc-limits-form] input[name]`) ? true : null;
          }, ROOT_ID), 'B5-A Limits field focus release', options.timeoutMs);
          await waitFor(async () => {
            const text = await page.locator(`#${ROOT_ID} .sc-content`).innerText();
            const disabled = await page.locator(`#${ROOT_ID} [data-sc-limits-form] button[type="submit"]`).isDisabled().catch(() => false);
            return text.includes('Settings changed in another tab') && disabled ? { text, disabled } : null;
          }, 'B5-A stale Limits rejection', options.timeoutMs);
          page.once('dialog', dialog => dialog.accept());
          await clickWorkspaceControl(page, `[data-action="settings-back"][data-view="settings"]`, options.timeoutMs);
          await openSettingsDestination(page, 'time', 'timer-limits', options.timeoutMs);
          await page.locator(`#${ROOT_ID} [data-sc-limits-form] input[name="yellowMinutes"]`).fill('30', { force: true });
          await page.locator(`#${ROOT_ID} [data-sc-limits-form] input[name="orangeMinutes"]`).fill('60', { force: true });
          await page.locator(`#${ROOT_ID} [data-sc-limits-form] input[name="redMinutes"]`).fill('120', { force: true });
          await clickWorkspaceControl(page, `[data-sc-limits-form] button[type="submit"]`, options.timeoutMs);
          let lastLimits = null;
          let committedLimits;
          try {
            committedLimits = await waitFor(async () => {
              const owner = await bridge.coreSnapshot();
              const observer = await observerBridge.coreSnapshot();
              lastLimits = { owner: owner?.preferences || null, observer: observer?.preferences || null };
              return owner?.preferences?.yellowMinutes === 30 && owner.preferences.orangeMinutes === 60 && owner.preferences.redMinutes === 120 &&
                owner.preferences.preferenceRevision === observer?.preferences?.preferenceRevision ? owner : null;
            }, 'B5-A coherent Timer Limits commit', options.timeoutMs);
          } catch (error) {
            error.details = { lastLimits };
            throw error;
          }

          await clickWorkspaceControl(page, `[data-action="settings-back"][data-view="settings"]`, options.timeoutMs);
          await openSettingsDestination(page, 'help', 'send-feedback', options.timeoutMs);
          await page.locator(`#${ROOT_ID} [data-sc-support-form] textarea[name="description"]`).fill('Installed browser acceptance feedback', { force: true });
          await page.locator(`#${ROOT_ID} [data-sc-support-form] input[name="includeDiagnostics"]`).check({ force: true });
          const supportSurface = await page.locator(`#${ROOT_ID} .sc-content`).innerText();
          assert(supportSurface.includes('Companion never sends it automatically') && supportSurface.includes('Open Email Draft') && supportSurface.includes('Copy Message'), 'B5-A Support did not preserve explicit delivery controls', supportSurface);
          assert(supportSurface.includes('Page type: general-page') && !supportSurface.includes('private-job') && !supportSurface.includes('project.php?id='), 'B5-A diagnostics exposed page identity or omitted the frozen preview', supportSurface);
          page.once('dialog', dialog => dialog.dismiss());
          await clickWorkspaceControl(page, `[data-action="settings-close"]`, options.timeoutMs);
          assert(await page.locator(`#${ROOT_ID} [data-sc-view-heading]`).innerText() === 'Send Feedback', 'B5-A dirty draft was silently discarded');
          page.once('dialog', dialog => dialog.accept());
          await clickWorkspaceControl(page, `[data-action="settings-close"]`, options.timeoutMs);

          await clickWorkspaceControl(page, `.sc-proto-topbar [data-action="view"][data-view="settings"]`, options.timeoutMs);
          await openSettingsDestination(page, 'help', 'developer-support', options.timeoutMs);
          const developerSupport = await page.locator(`#${ROOT_ID} .sc-content`).innerText();
          assert(developerSupport.includes('Tips aren’t available yet'), 'B5-A fabricated a Developer Support destination', developerSupport);
          await clickWorkspaceControl(page, `[data-action="settings-back"][data-view="settings"]`, options.timeoutMs);
          await clickWorkspaceControl(page, `[data-action="settings-close"]`, options.timeoutMs);

          const after = await bridge.coreSnapshot();
          assert(after.ledgerSegmentCount === before.ledgerSegmentCount && after.timer.timerState === before.timer.timerState && after.timer.currentContextId === before.timer.currentContextId, 'B5-A preferences changed Timer/Ledger authority', { before, after });
          assert(result.network.nativeMutationAttempts.length === 0, 'B5-A settings attempted a native SquareCoil mutation', result.network.nativeMutationAttempts);
          return {
            preferenceRevisionBefore: before.preferences.preferenceRevision,
            preferenceRevisionAfter: after.preferences.preferenceRevision,
            autoEffective: autoSnapshot.presentation.timerAppearanceEffective,
            glassEffective: glassSnapshot.presentation.panelFinishEffective,
            clearFallback,
            darkPresentation,
            lightGlassPresentation,
            refinedPresentation,
            originalPresentation,
            staleRevision: crossTab.owner.preferences.preferenceRevision,
            limits: { yellow: committedLimits.preferences.yellowMinutes, orange: committedLimits.preferences.orangeMinutes, red: committedLimits.preferences.redMinutes },
            supportPreviewPresent: supportSurface.includes('Page type: general-page'),
            developerSupportConfigured: false
          };
        } finally {
          if (observerBridge) {
            await observerBridge.authorityTeardown().catch(() => {});
            await observerBridge.detach();
          }
          await observerPage.close().catch(() => {});
          await waitFor(async () => {
            const snapshot = await bridge.authoritySnapshot();
            return snapshot?.healthy === true && snapshot.disposition === 'OWNER' ? snapshot : null;
          }, 'B5-A primary OWNER after observer cleanup', options.timeoutMs);
          await bridge.syncBridge().catch(() => {});
          await waitFor(async () => {
            const health = await bridge.send({ type: MESSAGES.HEALTH });
            return health?.ready === true && health?.health?.state === 'READY' ? health : null;
          }, 'B5-A post-observer READY settlement', options.timeoutMs);
        }
      }
    );

    await runB5OptionalBrowserCase(
      result.cases,
      family,
      ['B5B-CINE-001', 'B5B-CINE-002', 'B5B-DASH-001', 'B5B-DASH-002', 'B5B-SAFETY-001'],
      'OPTIONAL-PRESENTATION-PACKS',
      'B5-B Glass backgrounds use fenced Bing images with safe fallback and preserve the default-off Design profile',
      async () => {
        const before = await bridge.coreSnapshot();
        const permissionWorker = context.serviceWorkers().find(worker => worker.url().startsWith(`chrome-extension://${extensionId}/`));
        await observeRuntimePermissionRequests(permissionWorker);
        const defaultDom = await page.evaluate(() => ({
          cinematicHosts: document.querySelectorAll('#squarecoil-companion-cinematic-host').length,
          dashboardLayers: document.querySelectorAll('#squarecoil-companion-design-dashboard-profile').length,
          dashboardSummaries: document.querySelectorAll('#squarecoil-companion-dashboard-summary').length
        }));
        assert(before.preferences.cinematicBackground === 'NONE', 'B5-B cinematic background was not off by default', before.preferences);
        assert(defaultDom.cinematicHosts === 0 && defaultDom.dashboardLayers === 0 && defaultDom.dashboardSummaries === 0,
          'B5-B default allocated optional presentation artifacts', defaultDom);

        await openSettingsDestination(page, 'appearance', 'website-theme', options.timeoutMs);
        const themeSurface = await page.locator(`#${ROOT_ID} .sc-content`).innerText();
        assert(/Dark Glass/i.test(themeSurface) && /Light Glass/i.test(themeSurface) &&
          /turn Bing photos on or off, open Companion from Chrome’s toolbar/i.test(themeSurface) &&
          /Glass keeps a built-in background when photos are off or unavailable/i.test(themeSurface) &&
          /image requests contain no job, timer, page, or account data/i.test(themeSurface),
        'B5-B theme surface did not disclose the separate privacy-fenced Bing background', themeSurface);
        await bridge.preferenceAction({ websiteTheme: 'SLEEK_DARK' },
        before.preferences.preferenceRevision);
        const cinematic = await waitFor(async () => {
          const snapshot = await bridge.coreSnapshot();
          return snapshot?.preferences?.cinematicBackground === 'CINEMATIC' &&
            snapshot?.presentation?.optional?.cinematic?.state === 'DEGRADED_FALLBACK' &&
            snapshot.presentation.optional.cinematic.source === 'FALLBACK' &&
            snapshot.presentation.optional.cinematic.imageDisplayed === true
            ? snapshot : null;
        }, 'B5-B sealed-offline Glass gradient settlement', options.timeoutMs);
        const cinematicDom = await page.evaluate(() => ({
          hosts: document.querySelectorAll('#squarecoil-companion-cinematic-host').length,
          styles: document.querySelectorAll('#squarecoil-companion-cinematic-style').length,
          state: document.documentElement.dataset.squarecoilCompanionCinematic || null,
          theme: document.getElementById('squarecoil-companion-cinematic-host')?.dataset.theme || null,
          hostBackground: getComputedStyle(document.getElementById('squarecoil-companion-cinematic-host')).backgroundImage,
          hostZIndex: getComputedStyle(document.getElementById('squarecoil-companion-cinematic-host')).zIndex,
          bodyIsolation: getComputedStyle(document.body).isolation,
          sourceLayerBytes: document.getElementById('squarecoil-companion-site-theme')?.textContent.length || 0,
          opaqueContainers: ['body', '#main', '#content_wrapper', '#content'].map(selector => {
            const node = document.querySelector(selector);
            return node ? { selector, backgroundColor: getComputedStyle(node).backgroundColor } : null;
          }).filter(Boolean)
        }));
        assert(cinematicDom.hosts === 1 && cinematicDom.styles === 1 && cinematicDom.theme === 'SLEEK_DARK',
          'B5-B Glass background did not own exactly one correctly themed host and style', cinematicDom);
        assert(/gradient/i.test(cinematicDom.hostBackground) && cinematicDom.bodyIsolation === 'isolate' &&
          Number(cinematicDom.hostZIndex) < 0 && cinematicDom.sourceLayerBytes > 200000,
          'B5-B safe gradient fallback was not visibly applied without Bing permission', cinematicDom);
        assert(cinematicDom.opaqueContainers.every(entry => entry.backgroundColor === 'rgba(0, 0, 0, 0)'),
          'B5-B left an opaque SquareCoil container covering the integrated background', cinematicDom.opaqueContainers);
        assert(result.network.bing.length > 0, 'B5-B did not attempt its configured Bing background', result.network.bing);
        assert(result.network.blockedUnexpected.every(entry => !entry.url.startsWith('https://www.bing.com/')), 'B5-B made a wallpaper request without optional permission', result.network.blockedUnexpected);
        const fallbackScreenshot = await capturePageEvidence(page, options, family, 'dark-glass-fallback-full-page');

        await clickWorkspaceControl(page, `[data-action="settings-back"][data-view="settings"]`, options.timeoutMs);
        await openSettingsDestination(page, 'appearance', 'website-theme', options.timeoutMs);
        await clickWorkspaceControl(page, `[data-action="preference-site"][data-value="SLEEK_DARK"]`, options.timeoutMs);
        await waitFor(async () => await page.locator(`#${ROOT_ID} [data-action="preference-site"][data-value="SLEEK_DARK"][data-active="true"]`).count() ? true : null,
          'B5-B Dark Glass UI settlement before permission grant', options.timeoutMs);
        const permissionGrant = await runtimePermissionEvidence(permissionWorker);
        assert(permissionGrant.granted === true && permissionGrant.requests === 0, 'Skin selection changed runtime permission', permissionGrant);
        const remoteImageExpected = false; // Default suite serves a sealed network outage.
        const grantedCinematic = await waitFor(async () => {
          const snapshot = await bridge.coreSnapshot();
          const current = snapshot?.presentation?.optional?.cinematic;
          return remoteImageExpected
            ? current?.state === 'SHOWING' && current.source === 'REMOTE' ? snapshot : null
            : current?.state === 'DEGRADED_FALLBACK' && current.source === 'FALLBACK' ? snapshot : null;
        }, remoteImageExpected ? 'B5-B trusted-click Bing grant and remote wallpaper settlement' :
          'B5-B sealed Bing outage keeps the safe fallback', options.timeoutMs);
        const remoteDarkDom = await page.evaluate(() => {
          const host = document.getElementById('squarecoil-companion-cinematic-host');
          const active = Array.from(host?.querySelectorAll('.sc-cinematic-layer') || [])
            .find(layer => layer.getAttribute('data-active') === 'true') || null;
          return {
            theme: host?.dataset.theme || null,
            customImage: active?.style.getPropertyValue('--us-squarecoil-cine-image') || '',
            customImagePriority: active?.style.getPropertyPriority('--us-squarecoil-cine-image') || '',
            computedImage: active ? getComputedStyle(active).backgroundImage : '',
            hostBackground: host ? getComputedStyle(host).backgroundImage : null,
            sourceLayerBytes: document.getElementById('squarecoil-companion-site-theme')?.textContent.length || 0
          };
        });
        if (remoteImageExpected) {
          assert(remoteDarkDom.theme === 'SLEEK_DARK' && /^url\(["']?data:image\//.test(remoteDarkDom.customImage) &&
            remoteDarkDom.customImagePriority === 'important' && /data:image\//.test(remoteDarkDom.computedImage) &&
            remoteDarkDom.sourceLayerBytes > 200000 && result.network.bing.some(entry => entry.kind === 'metadata') &&
            result.network.bing.some(entry => entry.kind === 'image'),
          'B5-B granted Bing wallpaper did not paint through the authoritative active-layer property', { remoteDarkDom, bing: result.network.bing });
        } else {
          assert(remoteDarkDom.theme === 'SLEEK_DARK' && /gradient/i.test(remoteDarkDom.hostBackground) &&
            remoteDarkDom.sourceLayerBytes > 200000 && result.network.bing.length > 0,
          'B5-B sealed Bing outage did not preserve the integrated fallback', { remoteDarkDom, bing: result.network.bing });
        }
        const darkRemoteScreenshot = await capturePageEvidence(page, options, family,
          remoteImageExpected ? 'dark-glass-bing-full-page' : 'dark-glass-offline-fallback-full-page');

        await clickWorkspaceControl(page, `[data-action="preference-site"][data-value="LIGHT_GLASS"]`, options.timeoutMs);
        const lightCinematic = await waitFor(async () => {
          const snapshot = await bridge.coreSnapshot();
          const current = snapshot?.presentation?.optional?.cinematic;
          if (snapshot?.preferences?.websiteTheme !== 'LIGHT_GLASS') return null;
          return remoteImageExpected
            ? current?.state === 'SHOWING' && ['REMOTE', 'CACHE_RETAINED', 'CACHE_FRESH'].includes(current.source) ? snapshot : null
            : current?.state === 'DEGRADED_FALLBACK' && current.source === 'FALLBACK' ? snapshot : null;
        }, 'B5-B Light Glass integrated wallpaper settlement', options.timeoutMs);
        const remoteLightDom = await page.evaluate(() => {
          const host = document.getElementById('squarecoil-companion-cinematic-host');
          const active = Array.from(host?.querySelectorAll('.sc-cinematic-layer') || [])
            .find(layer => layer.getAttribute('data-active') === 'true') || null;
          return {
            theme: host?.dataset.theme || null,
            customImage: active?.style.getPropertyValue('--us-squarecoil-cine-image') || '',
            customImagePriority: active?.style.getPropertyPriority('--us-squarecoil-cine-image') || '',
            computedImage: active ? getComputedStyle(active).backgroundImage : '',
            rootTheme: document.documentElement.getAttribute('data-squarecoil-companion-site-theme')
          };
        });
        assert(remoteLightDom.theme === 'LIGHT_GLASS' && remoteLightDom.rootTheme === 'LIGHT_GLASS' &&
          (remoteImageExpected ? /^url\(["']?data:image\//.test(remoteLightDom.customImage) &&
            remoteLightDom.customImagePriority === 'important' && /data:image\//.test(remoteLightDom.computedImage) : remoteLightDom.customImage === ''),
        'B5-B Light Glass did not keep its matching wallpaper and tint integrated', remoteLightDom);
        const lightRemoteScreenshot = await capturePageEvidence(page, options, family,
          remoteImageExpected ? 'light-glass-bing-full-page' : 'light-glass-offline-fallback-full-page');

        const flickerPage = await context.newPage();
        let flickerBridge = null;
        let flickerEvidence = null;
        try {
          await flickerPage.addInitScript(() => {
            window.__squareCoilEarlyFrames = [];
            let remaining = 10;
            const capture = () => {
              const root = document.documentElement;
              const body = document.body;
              window.__squareCoilEarlyFrames.push({
                theme: root?.getAttribute('data-squarecoil-companion-site-theme') || null,
                guard: root?.getAttribute('data-squarecoil-companion-prepaint') || null,
                bodyVisibility: body ? getComputedStyle(body).visibility : null
              });
              remaining -= 1;
              if (remaining > 0) requestAnimationFrame(capture);
            };
            requestAnimationFrame(capture);
          });
          await flickerPage.goto(`${FIXTURE_ORIGIN}${THEME_GENERIC_PATH}`, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
          await flickerPage.goto(`${FIXTURE_ORIGIN}${LEADS_PATH}`, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
          await waitFor(async () => flickerPage.evaluate(() => {
            const frames = window.__squareCoilEarlyFrames || [];
            const root = document.documentElement;
            return frames.length >= 3 && root.getAttribute('data-squarecoil-companion-site-theme') === 'LIGHT_GLASS' &&
              root.getAttribute('data-squarecoil-companion-prepaint') === null ? frames : null;
          }), 'B5-B document-start early-frame settlement', options.timeoutMs);
          const earlyFrames = await flickerPage.evaluate(() => window.__squareCoilEarlyFrames || []);
          assert(earlyFrames.every(frame => frame.theme === 'LIGHT_GLASS' ||
            (frame.guard === 'pending' && (frame.bodyVisibility === 'hidden' || frame.bodyVisibility === null))),
          'B5-B navigation exposed a native SquareCoil frame before the selected theme settled', earlyFrames);
          await waitFor(async () => (await pageState(flickerPage)).documentToken, 'B5-B flicker page document identity', options.timeoutMs);
          flickerBridge = new ContentBridge(context, flickerPage, extensionId, options.timeoutMs, candidateIdentity);
          await flickerBridge.initialize();
          await flickerBridge.authorityTeardown().catch(() => {});
          await flickerBridge.detach();
          flickerBridge = null;
          flickerEvidence = { frameCount: earlyFrames.length, frames: earlyFrames };
        } finally {
          if (flickerBridge) { await flickerBridge.authorityTeardown().catch(() => {}); await flickerBridge.detach(); }
          await flickerPage.close().catch(() => {});
        }
        await clickWorkspaceControl(page, `[data-action="settings-close"]`, options.timeoutMs);

        const dashboardPage = await context.newPage();
        let dashboardBridge = null;
        try {
          await dashboardPage.goto(`${FIXTURE_ORIGIN}${DASHBOARD_PATH}?show=2`, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
          await waitFor(async () => (await pageState(dashboardPage)).documentToken, 'B5-B dashboard document identity', options.timeoutMs);
          dashboardBridge = new ContentBridge(context, dashboardPage, extensionId, options.timeoutMs, candidateIdentity);
          await dashboardBridge.initialize();
          const dashboardAbsence = await dashboardPage.evaluate(() => ({
            attribute: document.documentElement.getAttribute('data-squarecoil-companion-dashboard-profile'),
            layers: document.querySelectorAll('#squarecoil-companion-design-dashboard-profile').length,
            summaries: document.querySelectorAll('#squarecoil-companion-dashboard-summary').length
          }));
          assert(dashboardAbsence.attribute === null && dashboardAbsence.layers === 0 && dashboardAbsence.summaries === 0,
            'B5-B default-off Design dashboard profile unexpectedly mounted a layer', dashboardAbsence);
          const beforeNative = await bridge.coreSnapshot();
          await bridge.preferenceAction({ websiteTheme: 'ORIGINAL' }, beforeNative.preferences.preferenceRevision);
          const restored = await waitFor(async () => {
            const snapshot = await bridge.coreSnapshot();
            return snapshot?.preferences?.websiteTheme === 'ORIGINAL' && snapshot.preferences.cinematicBackground === 'NONE' &&
              snapshot.presentation.optional.cinematic.state === 'DISABLED' ? snapshot : null;
          }, 'B5-B native presentation restoration', options.timeoutMs);
          assert(restored.ledgerSegmentCount === before.ledgerSegmentCount && restored.timer.timerState === before.timer.timerState &&
            restored.timer.currentContextId === before.timer.currentContextId, 'B5-B presentation changed Timer or Ledger authority', { before, restored });
          assert(result.network.nativeMutationAttempts.length === 0, 'B5-B presentation attempted a native SquareCoil mutation', result.network.nativeMutationAttempts);
          return { defaultDom, installedBingHost: 'required-at-install', bingRequests: result.network.bing,
            cinematic: cinematic.presentation.optional.cinematic, cinematicDom, fallbackScreenshot,
            permissionGrant, grantedCinematic: grantedCinematic.presentation.optional.cinematic, remoteDarkDom, darkRemoteScreenshot,
            lightCinematic: lightCinematic.presentation.optional.cinematic, remoteLightDom, lightRemoteScreenshot, flickerEvidence,
            dashboardAbsence, nativeMutationAttempts: result.network.nativeMutationAttempts.length };
        } finally {
          if (dashboardBridge) { await dashboardBridge.authorityTeardown().catch(() => {}); await dashboardBridge.detach(); }
          await dashboardPage.close().catch(() => {});
          await waitFor(async () => {
            const snapshot = await bridge.authoritySnapshot();
            return snapshot?.healthy === true && snapshot.disposition === 'OWNER' ? snapshot : null;
          }, 'B5-B primary OWNER after dashboard absence check', options.timeoutMs);
        }
      }
    );

    await runCase(result.cases, `A4-PI-${family}-DASHBOARD-LIFECYCLE`,
      'Companion enables canonical analytics, preserves native dashboard, and cleans reload/route ownership', async () => {
        const dashboardPage = await context.newPage();
        let dashboardBridge = null;
        const release = async () => {
          if (!dashboardBridge) return;
          await dashboardBridge.authorityTeardown();
          await dashboardBridge.detach();
          dashboardBridge = null;
        };
        const bind = async () => {
          await waitFor(async () => (await pageState(dashboardPage)).documentToken, 'analytics content identity', options.timeoutMs);
          dashboardBridge = new ContentBridge(context, dashboardPage, extensionId, options.timeoutMs, candidateIdentity);
          await dashboardBridge.initialize();
        };
        try {
          await dashboardPage.goto(`${FIXTURE_ORIGIN}${DASHBOARD_PATH}?show=2`, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
          await bind();
          const screenshots = path.join(path.dirname(options.evidencePath), `${path.basename(options.evidencePath, '.json')}-screenshots`);
          fs.mkdirSync(screenshots, { recursive: true });
          const proof = await verifyDashboardJourney({ page: dashboardPage, origin: FIXTURE_ORIGIN, timeout: options.timeoutMs,
            readBoundary: async () => timerLedgerBoundaryIdentity(await bridge.coreSnapshot()),
            readDiagnosticState: async () => {
              const snapshot = await dashboardBridge.coreSnapshot();
              return { revision: snapshot.revision, status: snapshot.status, lastError: snapshot.lastError,
                authorityOwner: snapshot.authorityOwner, authorityTenure: snapshot.authorityTenure,
                preferences: snapshot.preferences, analytics: snapshot.presentation?.optional?.analytics };
            },
            screenshot: path.join(screenshots, `${family}-analytics-canonical.png`),
            narrowScreenshot: path.join(screenshots, `${family}-analytics-narrow.png`),
            sidebarScreenshot: path.join(screenshots, `${family}-analytics-sidebar.png`),
            sidebarRowScreenshot: path.join(screenshots, `${family}-analytics-sidebar-row.png`),
            narrowRowScreenshot: path.join(screenshots, `${family}-analytics-narrow-row.png`),
            beforeNavigate: release, afterNavigate: bind });
          assert(result.network.nativeMutationAttempts.length === 0, 'Analytics journey attempted a native clock mutation', result.network.nativeMutationAttempts);
          return proof;
        } finally {
          await release().catch(() => {});
          await dashboardPage.close().catch(() => {});
        }
      }, { prototypeFixtureIds: ['PI-DASH-001', 'PI-DASH-002'] });

    await runB5CThemeBrowserCase(
      result.cases,
      family,
      ['B5C-THEME-001', 'B5C-THEME-002', 'B5C-THEME-003', 'B5C-THEME-004'],
      'PROBE-THEME-ADAPTERS',
      'B5-C applies only the probe-backed dropdown Leads and Install Calendar adapters and restores native presentation exactly',
      async () => {
        const before = await bridge.coreSnapshot();
        await bridge.preferenceAction({ websiteTheme: 'SLEEK_DARK' }, before.preferences.preferenceRevision);
        await waitFor(async () => {
          const snapshot = await bridge.coreSnapshot();
          return snapshot?.preferences?.websiteTheme === 'SLEEK_DARK' ? snapshot : null;
        }, 'B5-C Sleek Dark preference settlement', options.timeoutMs);

        const pages = [];
        const bridges = [];
        try {
          for (const relative of [THEME_GENERIC_PATH, LEADS_PATH, CALENDAR_PATH]) {
            const themedPage = await context.newPage();
            pages.push(themedPage);
            themedPage.on('console', message => {
              if (message.type() === 'error' || message.type() === 'warning') result.console.errors.push({ type: message.type(), text: message.text() });
            });
            themedPage.on('pageerror', error => result.console.pageErrors.push(String(error?.message || error)));
            await themedPage.goto(`${FIXTURE_ORIGIN}${relative}`, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
            await waitFor(async () => (await pageState(themedPage)).documentToken, `B5-C ${relative} document identity`, options.timeoutMs);
            const themedBridge = new ContentBridge(context, themedPage, extensionId, options.timeoutMs, candidateIdentity);
            await themedBridge.initialize();
            bridges.push(themedBridge);
          }

          const [genericPage, leadsPage, calendarPage] = pages;
          const generic = await waitFor(async () => genericPage.evaluate(() => {
            const user = getComputedStyle(document.getElementById('user-menu'));
            const help = getComputedStyle(document.getElementById('help-menu'));
            const state = {
              theme: document.documentElement.getAttribute('data-squarecoil-companion-site-theme'),
              route: document.documentElement.getAttribute('data-squarecoil-companion-site-route'),
              layers: document.querySelectorAll('#squarecoil-companion-site-theme').length,
              userBackground: user.backgroundColor,
              userColor: user.color,
              helpBackground: help.backgroundColor,
              helpColor: help.color
            };
            return state.theme === 'SLEEK_DARK' && state.route === 'GENERIC' && state.layers === 1 ? state : null;
          }), 'B5-C generic dropdown adapter', options.timeoutMs);
          assert(generic.userBackground === generic.helpBackground && generic.userBackground !== 'rgb(250, 250, 250)' &&
            generic.userColor === generic.helpColor && generic.userColor !== 'rgb(21, 31, 41)',
          'B5-C did not repair both persistent top-right dropdown surfaces', generic);

          const leads = await waitFor(async () => leadsPage.evaluate(() => {
            const input = getComputedStyle(document.getElementById('lead-filter'));
            const select = getComputedStyle(document.getElementById('lead-owner'));
            const state = {
              theme: document.documentElement.getAttribute('data-squarecoil-companion-site-theme'),
              route: document.documentElement.getAttribute('data-squarecoil-companion-site-route'),
              layers: document.querySelectorAll('#squarecoil-companion-site-theme').length,
              input: { color: input.color, background: input.backgroundColor, border: input.borderColor, radius: input.borderRadius },
              select: { color: select.color, background: select.backgroundColor, border: select.borderColor, radius: select.borderRadius }
            };
            return state.theme === 'SLEEK_DARK' && state.route === 'LEADS' && state.layers === 1 ? state : null;
          }), 'B5-C Leads adapter', options.timeoutMs);
          for (const control of [leads.input, leads.select]) {
            assert(control.color === 'rgb(238, 245, 251)' && control.background === 'rgba(5, 13, 20, 0.78)' &&
              control.border === 'rgba(192, 221, 244, 0.22)' && control.radius === '8px',
            'B5-C Leads filter control did not receive the bounded adapter', { leads, control });
          }

          const calendar = await waitFor(async () => calendarPage.evaluate(() => {
            const day = getComputedStyle(document.getElementById('calendar-day'));
            const event = getComputedStyle(document.getElementById('calendar-event'));
            const progress = getComputedStyle(document.querySelector('#calendar-event .cp'));
            const state = {
              theme: document.documentElement.getAttribute('data-squarecoil-companion-site-theme'),
              route: document.documentElement.getAttribute('data-squarecoil-companion-site-route'),
              layers: document.querySelectorAll('#squarecoil-companion-site-theme').length,
              day: { color: day.color, background: day.backgroundColor, border: day.borderColor },
              event: { color: event.color, background: event.backgroundColor, borderColor: event.borderLeftColor, borderWidth: event.borderLeftWidth, radius: event.borderRadius },
              progress: { height: progress.height, background: progress.backgroundColor, radius: progress.borderRadius }
            };
            return state.theme === 'SLEEK_DARK' && state.route === 'INSTALL_CALENDAR' && state.layers === 1 ? state : null;
          }), 'B5-C Install Calendar adapter', options.timeoutMs);
          assert(calendar.day.background === 'rgba(7, 16, 24, 0.6)' && calendar.day.border === 'rgba(192, 221, 244, 0.13)',
            'B5-C Install Calendar day surface was not repaired', calendar);
          assert(calendar.event.background === 'rgba(9, 19, 28, 0.94)' && calendar.event.borderColor === 'rgb(12, 180, 95)' &&
            calendar.event.borderWidth === '2px' && calendar.event.radius === '7px',
          'B5-C Install Calendar event styling replaced native semantic border color or missed its adapter', calendar);
          assert(calendar.progress.height === '6px' && calendar.progress.radius === '999px',
            'B5-C Install Calendar progress strip was not repaired', calendar);

          const current = await bridge.coreSnapshot();
          await bridge.preferenceAction({ websiteTheme: 'ORIGINAL' }, current.preferences.preferenceRevision);
          const restored = [];
          for (const themedPage of pages) {
            restored.push(await waitFor(async () => themedPage.evaluate(() => {
              const state = {
                theme: document.documentElement.getAttribute('data-squarecoil-companion-site-theme'),
                route: document.documentElement.getAttribute('data-squarecoil-companion-site-route'),
                layers: document.querySelectorAll('#squarecoil-companion-site-theme').length,
                menuBackground: getComputedStyle(document.getElementById('user-menu')).backgroundColor
              };
              return state.theme === null && state.route === null && state.layers === 0 ? state : null;
            }), 'B5-C Original restoration', options.timeoutMs));
          }
          assert(restored.every(state => state.menuBackground === 'rgb(250, 250, 250)'),
            'B5-C Original did not restore native dropdown presentation', restored);
          const calendarNativeBorder = await calendarPage.evaluate(() => getComputedStyle(document.getElementById('calendar-event')).borderLeftColor);
          assert(calendarNativeBorder === 'rgb(12, 180, 95)', 'B5-C Original changed the native calendar event border color', calendarNativeBorder);
          const after = await bridge.coreSnapshot();
          assert(after.ledgerSegmentCount === before.ledgerSegmentCount && after.timer.timerState === before.timer.timerState &&
            after.timer.currentContextId === before.timer.currentContextId,
          'B5-C theme adapters changed Timer or Ledger authority', { before, after });
          assert(result.network.nativeMutationAttempts.length === 0, 'B5-C theme adapters attempted a native SquareCoil mutation', result.network.nativeMutationAttempts);
          return { generic, leads, calendar, restored, calendarNativeBorder, nativeMutationAttempts: result.network.nativeMutationAttempts.length };
        } finally {
          for (const themedBridge of bridges.reverse()) {
            await themedBridge.authorityTeardown().catch(() => {});
            await themedBridge.detach();
          }
          for (const themedPage of pages.reverse()) await themedPage.close().catch(() => {});
          await waitFor(async () => {
            const snapshot = await bridge.authoritySnapshot();
            return snapshot?.healthy === true && snapshot.disposition === 'OWNER' ? snapshot : null;
          }, 'B5-C primary OWNER after themed-page cleanup', options.timeoutMs);
          await bridge.syncBridge().catch(() => {});
          await waitFor(async () => {
            const health = await bridge.send({ type: MESSAGES.HEALTH });
            return health?.ready === true && health?.health?.state === 'READY' ? health : null;
          }, 'B5-C post-cleanup READY settlement', options.timeoutMs);
        }
      }
    );

    await runB5DThemeBrowserCase(
      result.cases,
      family,
      ['B5D-VENDOR-001', 'B5D-OVERLAY-001', 'B5D-EDITOR-001', 'B5D-LAYOUT-001'],
      'VENDOR-EDITOR-LAYOUT',
      'B5-D themes bounded vendor surfaces and editor documents with responsive print and forced-color cleanup',
      async () => {
        const before = await bridge.coreSnapshot();
        await bridge.preferenceAction({ websiteTheme: 'SLEEK_DARK' }, before.preferences.preferenceRevision);
        await waitFor(async () => {
          const snapshot = await bridge.coreSnapshot();
          return snapshot?.preferences?.websiteTheme === 'SLEEK_DARK' ? snapshot : null;
        }, 'B5-D Sleek Dark preference settlement', options.timeoutMs);

        const pages = [];
        const bridges = [];
        try {
          for (const relative of [VENDOR_THEME_PATH, GANTT_THEME_PATH, LOOKALIKE_VENDOR_PATH]) {
            const themedPage = await context.newPage();
            pages.push(themedPage);
            themedPage.on('console', message => {
              if (message.type() === 'error' || message.type() === 'warning') result.console.errors.push({ type: message.type(), text: message.text() });
            });
            themedPage.on('pageerror', error => result.console.pageErrors.push(String(error?.message || error)));
            await themedPage.goto(`${FIXTURE_ORIGIN}${relative}`, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
            await waitFor(async () => (await pageState(themedPage)).documentToken, `B5-D ${relative} document identity`, options.timeoutMs);
            const themedBridge = new ContentBridge(context, themedPage, extensionId, options.timeoutMs, candidateIdentity);
            await themedBridge.initialize();
            bridges.push(themedBridge);
          }

          const [vendorPage, ganttPage, lookalikePage] = pages;
          const vendor = await waitFor(async () => vendorPage.evaluate(() => {
            const style = id => getComputedStyle(document.getElementById(id));
            const surface = id => ({ id, color: style(id).color, background: style(id).backgroundColor,
              backgroundImage: style(id).backgroundImage, backdrop: style(id).backdropFilter || style(id).webkitBackdropFilter });
            const frame = document.getElementById('editor-frame');
            const editorDocument = frame?.contentDocument;
            const host = document.getElementById('squarecoil-companion-cinematic-host');
            const state = {
              theme: document.documentElement.getAttribute('data-squarecoil-companion-site-theme'),
              route: document.documentElement.getAttribute('data-squarecoil-companion-site-route'),
              layers: document.querySelectorAll('#squarecoil-companion-site-theme').length,
              production: {
                rail: surface('pmlt'),
                railHeadingColor: style('project-number').color,
                customerHeadingColor: style('customer-heading').color,
                surfaces: ['customer-name','customer-info','showbtns','projectbox','descriptionbox','designbox','filesbox'].map(surface),
                inner: surface('production-panel-body'),
                strongColor: style('description-strong').color,
                host: host ? { theme: host.dataset.theme || null, backgroundImage: getComputedStyle(host).backgroundImage,
                  zIndex: getComputedStyle(host).zIndex } : null
              },
              paginate: { color: style('paginate-current').color, background: style('paginate-current').backgroundColor, radius: style('paginate-current').borderRadius },
              select: { color: style('select2-selection').color, background: style('select2-selection').backgroundColor, radius: style('select2-selection').borderRadius },
              qtip: { color: style('qtip').color, background: style('qtip').backgroundColor, radius: style('qtip').borderRadius },
              magnific: { color: style('magnific').color, background: style('magnific').backgroundColor },
              fancybox: { color: style('fancybox').color, background: style('fancybox').backgroundColor },
              overlays: { magnific: style('magnific-bg').backgroundColor, fancybox: style('fancybox-overlay').backgroundColor },
              dropzone: { color: style('dropzone').color, background: style('dropzone').backgroundColor, radius: style('dropzone').borderRadius },
              editor: {
                chromeBackground: style('ckeditor').backgroundColor,
                iconFilter: style('cke-icon').filter,
                iconOpacity: style('cke-icon').opacity,
                disabledOpacity: style('cke-disabled-icon').opacity,
                frameMarker: frame?.getAttribute('data-squarecoil-companion-editor-frame') || null,
                documentLayers: editorDocument?.querySelectorAll('#squarecoil-companion-ckeditor-document-theme').length || 0,
                bodyBackground: editorDocument?.body ? getComputedStyle(editorDocument.body).backgroundColor : null,
                bodyColor: editorDocument?.body ? getComputedStyle(editorDocument.body).color : null,
                copyColor: editorDocument?.getElementById('editor-copy') ? getComputedStyle(editorDocument.getElementById('editor-copy')).color : null,
                linkColor: editorDocument?.querySelector('a') ? getComputedStyle(editorDocument.querySelector('a')).color : null
              }
            };
            return state.theme === 'SLEEK_DARK' && state.route === 'PROJECT_DESIGNS' && state.layers === 1 &&
              state.editor.frameMarker === 'dark' && state.editor.documentLayers === 1 ? state : null;
          }), 'B5-D vendor and editor adapter settlement', options.timeoutMs);

          assert(vendor.paginate.color === 'rgb(255, 255, 255)' && vendor.paginate.background !== 'rgba(0, 0, 0, 0)' && vendor.paginate.radius === '6px',
            'B5-D DataTables adapter is incomplete', vendor.paginate);
          assert(vendor.select.color === 'rgb(238, 245, 251)' && vendor.select.background === 'rgba(7, 15, 23, 0.74)' && vendor.select.radius === '7px',
            'B5-D Select2 adapter is incomplete', vendor.select);
          for (const overlay of [vendor.qtip, vendor.magnific, vendor.fancybox]) {
            assert(overlay.color === 'rgb(203, 215, 226)' && overlay.background === 'rgba(7, 15, 23, 0.74)',
              'B5-D overlay surface adapter is incomplete', { overlay, vendor });
          }
          assert(vendor.overlays.magnific === 'rgba(2, 7, 11, 0.76)' && vendor.overlays.fancybox === 'rgba(2, 7, 11, 0.76)',
            'B5-D modal overlay adapter is incomplete', vendor.overlays);
          assert(vendor.dropzone.color === 'rgb(203, 215, 226)' && vendor.dropzone.background === 'rgba(97, 174, 247, 0.16)' && vendor.dropzone.radius === '12px',
            'B5-D Dropzone adapter is incomplete', vendor.dropzone);
          assert(vendor.editor.chromeBackground === 'rgba(11, 11, 14, 0.68)' && vendor.editor.iconFilter !== 'none' &&
            vendor.editor.iconOpacity === '0.86' && vendor.editor.disabledOpacity === '0.28',
          'B5-D CKEditor chrome or icon adapter is incomplete', vendor.editor);
          assert(vendor.editor.bodyBackground === 'rgb(10, 17, 24)' && vendor.editor.bodyColor === 'rgb(220, 229, 238)' &&
            vendor.editor.copyColor === 'rgb(230, 237, 244)' && vendor.editor.linkColor === 'rgb(143, 201, 255)',
          'B5-D CKEditor document adapter is incomplete', vendor.editor);
          assert(vendor.production.rail.background === 'rgba(5, 12, 19, 0.68)' &&
            vendor.production.railHeadingColor === 'rgb(238, 245, 251)' &&
            vendor.production.customerHeadingColor === 'rgb(238, 245, 251)' &&
            vendor.production.surfaces.every(surface => surface.background === 'rgba(9, 18, 27, 0.57)' && surface.backgroundImage !== 'none') &&
            vendor.production.host?.theme === 'SLEEK_DARK' && /gradient/i.test(vendor.production.host.backgroundImage) &&
            Number(vendor.production.host.zIndex) < 0,
          'B5-D Dark Glass did not present one coherent translucent production surface stack', vendor.production);

          const gantt = await waitFor(async () => ganttPage.evaluate(() => {
            const container = getComputedStyle(document.getElementById('gantt'));
            const heading = getComputedStyle(document.getElementById('gantt-head'));
            const state = {
              theme: document.documentElement.getAttribute('data-squarecoil-companion-site-theme'),
              route: document.documentElement.getAttribute('data-squarecoil-companion-site-route'),
              container: { color: container.color, background: container.backgroundColor, border: container.borderColor },
              heading: { color: heading.color, background: heading.backgroundColor, border: heading.borderColor }
            };
            return state.theme === 'SLEEK_DARK' && state.route === 'PROJECT_MILESTONES' ? state : null;
          }), 'B5-D Gantt adapter settlement', options.timeoutMs);
          assert(gantt.container.color === 'rgb(203, 215, 226)' && gantt.container.border === 'rgba(192, 221, 244, 0.13)' &&
            gantt.heading.color === 'rgb(203, 215, 226)' && gantt.heading.border === 'rgba(192, 221, 244, 0.13)',
          'B5-D Gantt adapter is incomplete', gantt);

          const lookalike = await waitFor(async () => lookalikePage.evaluate(() => {
            const wrapper = getComputedStyle(document.getElementById('data-table'));
            const frame = document.getElementById('editor-frame');
            const state = {
              theme: document.documentElement.getAttribute('data-squarecoil-companion-site-theme'),
              route: document.documentElement.getAttribute('data-squarecoil-companion-site-route'),
              wrapperBackground: wrapper.backgroundColor,
              editorFrameMarker: frame?.getAttribute('data-squarecoil-companion-editor-frame') || null,
              editorDocumentLayers: frame?.contentDocument?.querySelectorAll('#squarecoil-companion-ckeditor-document-theme').length || 0
            };
            return state.theme === 'SLEEK_DARK' && state.route === 'GENERIC' ? state : null;
          }), 'B5-D exact-route near-miss settlement', options.timeoutMs);
          assert(lookalike.wrapperBackground === 'rgb(255, 255, 255)' && lookalike.editorFrameMarker === null && lookalike.editorDocumentLayers === 0,
            'B5-D applied a vendor or editor adapter to an unlisted route', lookalike);

          const darkCurrent = await bridge.coreSnapshot();
          await bridge.preferenceAction({ websiteTheme: 'LIGHT_GLASS' }, darkCurrent.preferences.preferenceRevision);
          const lightGlass = await waitFor(async () => vendorPage.evaluate(() => {
            const frame = document.getElementById('editor-frame');
            const editorDocument = frame?.contentDocument;
            const style = id => getComputedStyle(document.getElementById(id));
            const surface = id => ({ id, color: style(id).color, background: style(id).backgroundColor,
              backgroundImage: style(id).backgroundImage, backdrop: style(id).backdropFilter || style(id).webkitBackdropFilter });
            const panel = style('standalone-panel-body');
            const host = document.getElementById('squarecoil-companion-cinematic-host');
            return {
              theme: document.documentElement.getAttribute('data-squarecoil-companion-site-theme'),
              layers: document.querySelectorAll('#squarecoil-companion-site-theme').length,
              panelColor: panel.color,
              panelBackground: panel.backgroundColor,
              production: {
                rail: surface('pmlt'),
                railHeadingColor: style('project-number').color,
                customerHeadingColor: style('customer-heading').color,
                surfaces: ['customer-name','customer-info','showbtns','projectbox','descriptionbox','designbox','filesbox'].map(surface),
                inner: surface('production-panel-body'),
                strongColor: style('description-strong').color,
                host: host ? { theme: host.dataset.theme || null, backgroundImage: getComputedStyle(host).backgroundImage,
                  zIndex: getComputedStyle(host).zIndex } : null
              },
              editorFrameMarker: frame?.getAttribute('data-squarecoil-companion-editor-frame') || null,
              editorDocumentLayers: editorDocument?.querySelectorAll('#squarecoil-companion-ckeditor-document-theme').length || 0,
              editorBodyColor: editorDocument?.body ? getComputedStyle(editorDocument.body).color : null,
              editorBodyBackground: editorDocument?.body ? getComputedStyle(editorDocument.body).backgroundColor : null
            };
          }).then(state => state.theme === 'LIGHT_GLASS' && state.layers === 1 && state.editorFrameMarker === 'light-glass' &&
            state.editorDocumentLayers === 1 ? state : null), 'B5-E Light Glass vendor/editor settlement', options.timeoutMs);
          assert(lightGlass.panelColor === 'rgb(23, 37, 50)' && lightGlass.panelBackground === 'rgba(0, 0, 0, 0)' &&
            lightGlass.editorBodyColor === 'rgb(24, 33, 43)' && lightGlass.editorBodyBackground === 'rgb(248, 250, 252)',
          'B5-E Light Glass did not preserve transparent inner glass with readable dark text and a readable editor', lightGlass);
          assert(lightGlass.production.rail.background === 'rgba(242, 249, 253, 0.62)' &&
            lightGlass.production.railHeadingColor === 'rgb(23, 37, 50)' &&
            lightGlass.production.customerHeadingColor === 'rgb(23, 37, 50)' &&
            lightGlass.production.surfaces.every(surface => surface.background === 'rgba(255, 255, 255, 0.54)' && surface.backgroundImage !== 'none') &&
            lightGlass.production.inner.background === 'rgba(0, 0, 0, 0)' &&
            lightGlass.production.strongColor === 'rgb(23, 37, 50)' &&
            lightGlass.production.host?.theme === 'LIGHT_GLASS' && /gradient/i.test(lightGlass.production.host.backgroundImage) &&
            Number(lightGlass.production.host.zIndex) < 0,
          'B5-E Light Glass retained dark foundation paint or unreadable production text', lightGlass.production);

          const lightCurrent = await bridge.coreSnapshot();
          await bridge.preferenceAction({ websiteTheme: 'REFINED_LIGHT' }, lightCurrent.preferences.preferenceRevision);
          const refinedLight = await waitFor(async () => vendorPage.evaluate(() => {
            const frame = document.getElementById('editor-frame');
            return {
              theme: document.documentElement.getAttribute('data-squarecoil-companion-site-theme'),
              layers: document.querySelectorAll('#squarecoil-companion-site-theme').length,
              editorFrameMarker: frame?.getAttribute('data-squarecoil-companion-editor-frame') || null,
              editorDocumentLayers: frame?.contentDocument?.querySelectorAll('#squarecoil-companion-ckeditor-document-theme').length || 0
            };
          }).then(state => state.theme === 'REFINED_LIGHT' && state.layers === 1 && state.editorFrameMarker === 'refined-light' &&
            state.editorDocumentLayers === 1 ? state : null), 'B5-E Refined Light vendor/editor settlement', options.timeoutMs);

          const refinedCurrent = await bridge.coreSnapshot();
          await bridge.preferenceAction({ websiteTheme: 'SLEEK_DARK' }, refinedCurrent.preferences.preferenceRevision);
          await waitFor(async () => vendorPage.evaluate(() => ({
            theme: document.documentElement.getAttribute('data-squarecoil-companion-site-theme'),
            layers: document.querySelectorAll('#squarecoil-companion-site-theme').length,
            editorFrameMarker: document.getElementById('editor-frame')?.getAttribute('data-squarecoil-companion-editor-frame') || null
          })).then(state => state.theme === 'SLEEK_DARK' && state.layers === 1 && state.editorFrameMarker === 'dark' ? state : null),
          'B5-E Dark Glass restoration before layout checks', options.timeoutMs);

          await vendorPage.setViewportSize({ width: 720, height: 900 });
          const responsive = await vendorPage.evaluate(() => {
            const content = getComputedStyle(document.getElementById('content'));
            const panel = getComputedStyle(document.querySelector('.panel-body'));
            return { paddingLeft: content.paddingLeft, paddingBottom: content.paddingBottom, maxWidth: panel.maxWidth, overflowX: panel.overflowX };
          });
          assert(responsive.paddingLeft === '10px' && responsive.paddingBottom === '38px' && responsive.maxWidth === '100%' && responsive.overflowX === 'auto',
            'B5-D narrow-layout adapter is incomplete', responsive);

          await vendorPage.emulateMedia({ media: 'print' });
          const print = await vendorPage.evaluate(() => {
            const content = getComputedStyle(document.getElementById('content'));
            const companion = document.getElementById('ussign-job-timer');
            return { color: content.color, background: content.backgroundColor, companionDisplay: companion ? getComputedStyle(companion).display : null };
          });
          assert(print.color === 'rgb(17, 17, 17)' && print.background === 'rgb(255, 255, 255)' && print.companionDisplay === 'none',
            'B5-D print fallback is incomplete', print);
          await vendorPage.emulateMedia({ media: 'screen' });

          await vendorPage.emulateMedia({ forcedColors: 'active' });
          const forced = await waitFor(async () => vendorPage.evaluate(() => {
            const frame = document.getElementById('editor-frame');
            const state = {
              theme: document.documentElement.getAttribute('data-squarecoil-companion-site-theme'),
              route: document.documentElement.getAttribute('data-squarecoil-companion-site-route'),
              layers: document.querySelectorAll('#squarecoil-companion-site-theme').length,
              editorFrameMarker: frame?.getAttribute('data-squarecoil-companion-editor-frame') || null,
              editorDocumentLayers: frame?.contentDocument?.querySelectorAll('#squarecoil-companion-ckeditor-document-theme').length || 0
            };
            return state.theme === null && state.route === null && state.layers === 0 && state.editorDocumentLayers === 0 ? state : null;
          }), 'B5-D forced-color native fallback', options.timeoutMs);
          const forcedPreference = await bridge.coreSnapshot();
          assert(forcedPreference.preferences.websiteTheme === 'SLEEK_DARK' && forced.editorFrameMarker === null,
            'B5-D forced-color fallback rewrote preference or retained editor ownership', { forcedPreference: forcedPreference.preferences, forced });
          await vendorPage.emulateMedia({ forcedColors: 'none' });
          await waitFor(async () => vendorPage.evaluate(() => ({
            theme: document.documentElement.getAttribute('data-squarecoil-companion-site-theme'),
            editorLayers: document.getElementById('editor-frame')?.contentDocument?.querySelectorAll('#squarecoil-companion-ckeditor-document-theme').length || 0
          })).then(state => state.theme === 'SLEEK_DARK' && state.editorLayers === 1 ? state : null),
          'B5-D theme restoration after forced colors', options.timeoutMs);

          const current = await bridge.coreSnapshot();
          await bridge.preferenceAction({ websiteTheme: 'ORIGINAL' }, current.preferences.preferenceRevision);
          const restored = [];
          for (const themedPage of pages) {
            restored.push(await waitFor(async () => themedPage.evaluate(() => {
              const frame = document.getElementById('editor-frame');
              const state = {
                theme: document.documentElement.getAttribute('data-squarecoil-companion-site-theme'),
                route: document.documentElement.getAttribute('data-squarecoil-companion-site-route'),
                layers: document.querySelectorAll('#squarecoil-companion-site-theme').length,
                editorFrameMarker: frame?.getAttribute('data-squarecoil-companion-editor-frame') || null,
                editorDocumentLayers: frame?.contentDocument?.querySelectorAll('#squarecoil-companion-ckeditor-document-theme').length || 0
              };
              return state.theme === null && state.route === null && state.layers === 0 && state.editorDocumentLayers === 0 ? state : null;
            }), 'B5-D Original restoration', options.timeoutMs));
          }
          const native = await vendorPage.evaluate(() => ({
            wrapperBackground: getComputedStyle(document.getElementById('data-table')).backgroundColor,
            editorBackground: getComputedStyle(document.getElementById('editor-frame').contentDocument.body).backgroundColor
          }));
          assert(native.wrapperBackground === 'rgb(255, 255, 255)' && native.editorBackground === 'rgb(255, 255, 255)',
            'B5-D Original did not restore native vendor/editor presentation', native);
          const after = await bridge.coreSnapshot();
          assert(after.ledgerSegmentCount === before.ledgerSegmentCount && after.timer.timerState === before.timer.timerState &&
            after.timer.currentContextId === before.timer.currentContextId,
          'B5-D theme adapters changed Timer or Ledger authority', { before, after });
          assert(result.network.nativeMutationAttempts.length === 0, 'B5-D theme adapters attempted a native SquareCoil mutation', result.network.nativeMutationAttempts);
          return { vendor, gantt, lookalike, lightGlass, refinedLight, responsive, print, forced, restored, native,
            nativeMutationAttempts: result.network.nativeMutationAttempts.length };
        } finally {
          for (const themedBridge of bridges.reverse()) {
            await themedBridge.authorityTeardown().catch(() => {});
            await themedBridge.detach();
          }
          for (const themedPage of pages.reverse()) await themedPage.close().catch(() => {});
          const snapshot = await bridge.coreSnapshot().catch(() => null);
          if (snapshot?.preferences?.websiteTheme !== 'ORIGINAL') {
            await bridge.preferenceAction({ websiteTheme: 'ORIGINAL' }, snapshot.preferences.preferenceRevision).catch(() => {});
          }
          await waitFor(async () => {
            const authority = await bridge.authoritySnapshot();
            return authority?.healthy === true && authority.disposition === 'OWNER' ? authority : null;
          }, 'B5-D primary OWNER after themed-page cleanup', options.timeoutMs);
          await bridge.syncBridge().catch(() => {});
          await waitFor(async () => {
            const health = await bridge.send({ type: MESSAGES.HEALTH });
            return health?.ready === true && health?.health?.state === 'READY' ? health : null;
          }, 'B5-D post-cleanup READY settlement', options.timeoutMs);
        }
      }
    );

    await runBrowserCase(result.cases, family, ['B1-LC-003', 'B1-LC-014'], 'RECOVERY', 'Dead interaction and removed root recover in place', async () => {
      assert(activeRuntimeId, 'Initial runtime was unavailable because the prerequisite case failed');
      const dead = await page.evaluate(({ rootId, probeEvent }) => {
        const root = document.getElementById(rootId);
        if (!root) return { patched: false };
        root.__a4OriginalDispatchEvent = root.dispatchEvent;
        root.dispatchEvent = function(event) {
          if (event?.type === probeEvent) return true;
          return root.__a4OriginalDispatchEvent.call(this, event);
        };
        return { patched: true, interactionReady: window.__squareCoilCompanionRuntime.getHealth().ui.interactionReady };
      }, { rootId: ROOT_ID, probeEvent: 'squarecoil-companion:interaction-probe' });
      assert(dead.patched && dead.interactionReady === false, 'Could not safely create a dead interaction path', dead);
      await page.evaluate(rootId => {
        const root = document.getElementById(rootId);
        if (root?.__a4OriginalDispatchEvent) {
          root.dispatchEvent = root.__a4OriginalDispatchEvent;
          delete root.__a4OriginalDispatchEvent;
        }
      }, ROOT_ID);
      const revalidated = await bridge.send({ type: MESSAGES.REVALIDATE });
      const repairedInteraction = await waitFor(async () => {
        const state = await pageState(page);
        return state.health?.ui?.interactionReady === true &&
          state.health?.state === 'DEGRADED' &&
          state.health?.reason === EXPECTED_DEGRADED_REASON
          ? state
          : null;
      }, 'dead-interaction recovery', options.timeoutMs);
      assertExpectedB1Shell(repairedInteraction, 'dead-interaction recovery', candidateIdentity);
      assert(repairedInteraction.runtimeInstanceId === activeRuntimeId, 'Interaction recovery replaced the runtime', repairedInteraction);

      const removedMarker = await page.evaluate(rootId => {
        const root = document.getElementById(rootId);
        if (!root) return null;
        root.dataset.a4RemovedMarker = 'removed-root';
        root.remove();
        return 'removed-root';
      }, ROOT_ID);
      assert(removedMarker === 'removed-root', 'Could not remove the owned root');
      const repairedRoot = await waitFor(async () => {
        const state = await pageState(page);
        return state.rootCount === 1 && state.roots[0].lifecycleReason === EXPECTED_DEGRADED_REASON && state.health?.ui?.interactionReady === true ? state : null;
      }, 'removed-root recovery', options.timeoutMs);
      assertExpectedB1Shell(repairedRoot, 'removed-root recovery', candidateIdentity);
      assert(repairedRoot.runtimeInstanceId === activeRuntimeId, 'Root recovery replaced the runtime', repairedRoot);
      assert(tracker.companionCount() === primaryBootParseBaseline + 1, 'Recovery reinjected the companion bundle', tracker.snapshot());
      return { revalidated, runtimeInstanceId: activeRuntimeId, companionBundleParses: tracker.companionCount() };
    });

    await runBrowserCase(result.cases, family, ['B1-LC-013'], 'UNSUPPORTED', 'Iframe and unsupported document allocate nothing', async () => {
      const child = await waitFor(() => page.frames().find(frame => frame !== page.mainFrame() && new URL(frame.url()).pathname === FRAME_PATH), 'synthetic child frame', options.timeoutMs);
      const childState = await child.evaluate(({ rootId, runtimeKey, tokenKey }) => {
        const roots = new Set([
          ...document.querySelectorAll(`#${rootId}`),
          ...document.querySelectorAll('[data-squarecoil-companion-root="rebuild"]')
        ]);
        return {
          runtimePresent: Object.prototype.hasOwnProperty.call(window, runtimeKey),
          rootCount: roots.size,
          documentToken: document.documentElement?.dataset?.[tokenKey] || null
        };
      }, { rootId: ROOT_ID, runtimeKey: RUNTIME_KEY, tokenKey: DOCUMENT_TOKEN_DATASET_KEY });
      assert(childState.runtimePresent === false && childState.rootCount === 0 && childState.documentToken === null, 'Iframe allocated companion state', childState);

      const unsupported = await context.newPage();
      try {
        await unsupported.goto(UNSUPPORTED_URL, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
        await unsupported.waitForTimeout(500);
        const unsupportedState = await pageState(unsupported);
        assert(unsupportedState.runtimeGlobalPresent === false, 'Unsupported origin allocated a runtime', unsupportedState);
        assert(unsupportedState.rootCount === 0, 'Unsupported origin allocated a root', unsupportedState);
        assert(unsupportedState.documentToken === null, 'Unsupported origin received a content-controller identity', unsupportedState);
        return { childState, unsupportedState };
      } finally {
        await unsupported.close().catch(() => {});
      }
    });

    await runB2KernelBrowserCase(result.cases, family, ['B2-KERNEL-002'], ['B1-LC-005'], 'WORKER-RESTART', 'Service-worker restart reconnects isolated authority while reusing the live page runtime', async () => {
      assert(activeRuntimeId, 'Initial runtime was unavailable because the prerequisite case failed');
      const authorityBefore = await waitFor(async () => {
        const snapshot = await bridge.authoritySnapshot();
        return snapshot?.healthy === true ? snapshot : null;
      }, 'isolated authority before service-worker restart', options.timeoutMs);
      assertHealthyB2KernelAuthority(authorityBefore, 'authority before service-worker restart', await pageState(page));
      const persistedBeforeResult = await bridge.getStorage([AUTHORITY_STORAGE_KEY]);
      const persistedBefore = persistedBeforeResult?.[AUTHORITY_STORAGE_KEY];
      assert(persistedBefore && typeof persistedBefore === 'object', 'Persisted authority envelope was unavailable before service-worker restart', { recordPresent: Boolean(persistedBefore) });
      assert(persistedBefore.document && typeof persistedBefore.document === 'object', 'Persisted authoritative document was unavailable before service-worker restart', { documentPresent: Boolean(persistedBefore?.document) });
      assert(persistedBefore.document.revision === authorityBefore.revision, 'Persisted and isolated authority revisions differed before restart', { authorityBefore, persistedBeforeRevision: persistedBefore.document.revision });
      const persistedDocumentBeforeSha256 = jsonSha256(persistedBefore.document);
      let targets = await browserCdp.send('Target.getTargets');
      const before = await waitFor(async () => serviceWorkerTarget(await browserCdp.send('Target.getTargets'), extensionId), 'extension service-worker target', options.timeoutMs);
      const closed = await browserCdp.send('Target.closeTarget', { targetId: before.targetId });
      assert(closed.success === true, 'Browser did not close the service-worker target', closed);
      const response = await bridge.send({ type: MESSAGES.HEALTH });
      const after = await waitFor(async () => serviceWorkerTarget(await browserCdp.send('Target.getTargets'), extensionId),
        'service-worker target after close', options.timeoutMs);
      let authorityAfter = await waitFor(async () => {
        const snapshot = await bridge.authoritySnapshot();
        return snapshot?.healthy === true &&
          ['OWNER', 'OBSERVER_CONNECTED'].includes(snapshot.disposition) &&
          isConcreteIdentity(snapshot.workerInstanceId) &&
          snapshot.workerInstanceId !== authorityBefore.workerInstanceId
          ? snapshot
          : null;
      }, 'autonomous isolated-authority heartbeat reconnection to the restarted worker', options.timeoutMs);
      targets = await browserCdp.send('Target.getTargets');
      const state = await pageState(page);
      assertExpectedB1Shell(state, 'service-worker restart', candidateIdentity);
      assertHealthyB2KernelAuthority(authorityAfter, 'authority after service-worker restart', state);
      assert(state.runtimeInstanceId === activeRuntimeId, 'Worker restart replaced the live page runtime', state);
      assert(response?.health?.runtimeInstanceId === activeRuntimeId, 'Restarted worker did not reuse the live runtime', response);
      assert(response?.classification === 'HEALTHY_SAME_BUILD' && response?.ready === true, 'Fresh settlement did not reconnect through the restarted worker before reporting READY', response);
      assert(response?.b2Settlement?.authorityDisposition === 'OWNER', 'Post-restart settlement did not retain OWNER authority', response);
      assert(authorityAfter.workerInstanceId !== authorityBefore.workerInstanceId, 'Isolated authority retained the terminated worker identity', { authorityBefore, authorityAfter });
      assert(authorityBefore.disposition === 'OWNER' && authorityAfter.disposition === 'OWNER', 'Worker restart did not preserve OWNER disposition', { authorityBefore, authorityAfter });
      assert(authorityAfter.coordinationEpoch === authorityBefore.coordinationEpoch, 'Worker restart changed the live ownership epoch', { authorityBefore, authorityAfter });
      const synchronizedAfter = await waitFor(async () => {
        const authority = await bridge.authoritySnapshot();
        const persisted = (await bridge.getStorage([AUTHORITY_STORAGE_KEY]))?.[AUTHORITY_STORAGE_KEY];
        return authority?.healthy === true && persisted?.document?.revision === authority.revision
          ? { authority, persisted }
          : null;
      }, 'post-restart authority and persistence revision convergence', options.timeoutMs);
      authorityAfter = synchronizedAfter.authority;
      const persistedAfter = synchronizedAfter.persisted;
      assert(persistedAfter && typeof persistedAfter === 'object', 'Persisted authority envelope was unavailable after service-worker restart', { recordPresent: Boolean(persistedAfter) });
      assert(persistedAfter.document && typeof persistedAfter.document === 'object', 'Persisted authoritative document was unavailable after service-worker restart', { documentPresent: Boolean(persistedAfter?.document) });
      assert(persistedAfter.document.revision === authorityAfter.revision, 'Persisted and isolated authority revisions differed after restart', { authorityAfter, persistedAfterRevision: persistedAfter.document.revision });
      const persistedDocumentAfterSha256 = jsonSha256(persistedAfter.document);
      assert(authorityAfter.revision >= authorityBefore.revision, 'Worker restart regressed the authoritative document revision', { authorityBefore, authorityAfter });
      if (authorityAfter.revision === authorityBefore.revision) {
        assert(persistedDocumentAfterSha256 === persistedDocumentBeforeSha256, 'Stable-revision worker restart changed the persisted authoritative document', {
          persistedDocumentBeforeSha256,
          persistedDocumentAfterSha256
        });
      }
      assert(tracker.companionCount() === primaryBootParseBaseline + 1, 'Worker restart reinjected the companion bundle', tracker.snapshot());
      return {
        beforeTargetId: before.targetId,
        afterTargetId: after.targetId,
        browserTargetIdChanged: before.targetId !== after.targetId,
        workerInstanceIdChanged: authorityAfter.workerInstanceId !== authorityBefore.workerInstanceId,
        terminationObserved: closed.success === true && authorityAfter.workerInstanceId !== authorityBefore.workerInstanceId,
        serviceWorkerTargets: targets.targetInfos.filter(target => target.type === 'service_worker' && target.url.startsWith(`chrome-extension://${extensionId}/`)),
        response,
        authorityBefore,
        authorityAfter,
        persistedDocumentBefore: {
          revision: persistedBefore.document.revision,
          sha256: persistedDocumentBeforeSha256
        },
        persistedDocumentAfter: {
          revision: persistedAfter.document.revision,
          sha256: persistedDocumentAfterSha256
        },
        runtimeInstanceId: state.runtimeInstanceId,
        companionBundleParses: tracker.companionCount()
      };
    });

    const bfcacheCase = await runBrowserCase(result.cases, family, ['B1-LC-008'], 'BFCACHE', 'Real BFCache restore revalidates without duplicate resources', async () => {
      assert(activeRuntimeId, 'Initial runtime was unavailable because the prerequisite case failed');
      const parseBaseline = tracker.companionCount();
      await page.evaluate(() => {
        window.__a4BfCacheEvents = [];
        window.addEventListener('pageshow', event => window.__a4BfCacheEvents.push({ persisted: event.persisted, time: performance.now() }));
      });
      await page.goto(UNSUPPORTED_URL, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
      await page.goBack({ waitUntil: 'commit', timeout: options.timeoutMs });
      const restored = await waitFor(async () => {
        const state = await pageState(page);
        return state.health?.ui?.interactionReady === true ? state : null;
      }, 'BFCache-restored runtime health', options.timeoutMs);
      const events = await page.evaluate(() => window.__a4BfCacheEvents || []);
      if (!events.some(event => event.persisted === true)) {
        throw new UnsupportedCase('The branded browser did not place the synthetic page in BFCache; no persisted pageshow event was observed');
      }
      assertExpectedB1Shell(restored, 'BFCache restore', candidateIdentity);
      assert(restored.runtimeInstanceId === activeRuntimeId, 'BFCache restore replaced the runtime generation', restored);
      assert(restored.rootCount === 1, 'BFCache restore duplicated or lost the root', restored);
      assert(tracker.companionCount() === parseBaseline, 'BFCache restore re-executed the companion bundle', tracker.snapshot());
      await page.locator(`#${ROOT_ID} .sc-proto-shell`).waitFor({ state: 'visible', timeout: options.timeoutMs });
      await openSettingsHome(page, options.timeoutMs);
      const categoryCount = await page.locator(`#${ROOT_ID} [data-action="settings-toggle-group"]`).count();
      await clickWorkspaceControl(page, `[data-action="settings-toggle-group"][data-group="appearance"]`, options.timeoutMs);
      const appearanceRoutes = await page.locator(`#${ROOT_ID} [data-action="settings-route"]:visible`).evaluateAll(nodes => nodes.map(node => node.dataset.view));
      assert(categoryCount === 7 && JSON.stringify(appearanceRoutes) === JSON.stringify(['timer-appearance', 'website-theme']),
        'BFCache restored MAIN health but left Companion Settings noninteractive', { categoryCount, appearanceRoutes });
      await clickWorkspaceControl(page, `[data-action="settings-toggle-group"][data-group="features"]`, options.timeoutMs);
      const featureRoutes = await page.locator(`#${ROOT_ID} [data-action="settings-route"]:visible`).evaluateAll(nodes => nodes.map(node => node.dataset.view));
      const expandedGroups = await page.locator(`#${ROOT_ID} [data-action="settings-toggle-group"][aria-expanded="true"]`).evaluateAll(nodes => nodes.map(node => node.dataset.group));
      assert(JSON.stringify(featureRoutes) === JSON.stringify(['dashboard', 'design-dashboard', 'quick-file-paths', 'quick-clock']) &&
        JSON.stringify(expandedGroups) === JSON.stringify(['features']),
      'BFCache restored Settings but lost separate interactive Features navigation', { featureRoutes, expandedGroups });
      for (const [view, heading] of [['quick-file-paths', 'Quick file paths'], ['quick-clock', 'Quick clock controls']]) {
        await clickWorkspaceControl(page, `[data-action="settings-route"][data-view="${view}"]`, options.timeoutMs);
        const routeHeading = await page.locator(`#${ROOT_ID} [data-sc-view-heading]`).innerText();
        assert(routeHeading === heading, 'BFCache restored quick-feature route was not interactive', { view, routeHeading });
        await clickWorkspaceControl(page, `[data-action="settings-back"][data-view="settings"]`, options.timeoutMs);
      }
      await clickWorkspaceControl(page, `[data-action="settings-close"]`, options.timeoutMs);
      return { events, runtimeInstanceId: restored.runtimeInstanceId, companionBundleParses: tracker.companionCount(),
        workspaceVisible: true, settingsInteractive: true, categoryCount, appearanceRoutes, featureRoutes };
    });
    if (bfcacheCase.status === 'UNSUPPORTED') {
      result.status = 'UNSUPPORTED';
      return result;
    }

    await runB2TransitionLifecycleBrowserCase(result.cases, family, ['B2-TRANSITION-004'], ['B1-LC-006'], 'CLEAN-TOGGLE', 'Clean disable finalizes Timer once and re-enable creates a fresh runtime generation', async () => {
      assert(activeRuntimeId, 'Initial runtime was unavailable because the prerequisite case failed');
      const coreBeforeDisable = await bridge.coreSnapshot();
      assert(coreBeforeDisable?.timer && coreBeforeDisable.timer.timerState !== 'IDLE', 'Clean toggle had no Timer state to finalize', coreBeforeDisable);
      const disabledResponse = await bridge.setEnabled(false);
      const disabled = await waitFor(async () => {
        const state = await pageState(page);
        return !state.runtimeGlobalPresent && state.rootCount === 0 ? state : null;
      }, 'clean disable teardown', options.timeoutMs);
      assert(disabled.claimPresent === false && disabled.bootstrapPresent === false, 'Clean disable retained injection markers', disabled);
      const persistedAfterDisable = (await bridge.getStorage([AUTHORITY_STORAGE_KEY]))?.[AUTHORITY_STORAGE_KEY]?.document;
      assert(persistedAfterDisable?.timer && persistedAfterDisable.timer.active === null && persistedAfterDisable.timer.pending === null && persistedAfterDisable.timer.localPause === null, 'Clean disable did not finalize Timer state to IDLE', persistedAfterDisable?.timer);
      const repeatedDisableResponse = await bridge.setEnabled(false);
      const persistedAfterRepeatedDisable = (await bridge.getStorage([AUTHORITY_STORAGE_KEY]))?.[AUTHORITY_STORAGE_KEY]?.document;
      assert(persistedAfterRepeatedDisable?.revision === persistedAfterDisable.revision, 'Repeated disable committed a second Timer transition', {
        firstRevision: persistedAfterDisable?.revision,
        repeatedRevision: persistedAfterRepeatedDisable?.revision
      });
      assert(result.network.nativeMutationAttempts.length === 0, 'Disable attempted a native SquareCoil mutation', result.network.nativeMutationAttempts);
      const enabledResponse = await bridge.setEnabled(true);
      const fresh = await waitFor(async () => {
        const state = await pageState(page);
        return state.health?.state === 'DEGRADED' && state.runtimeInstanceId !== activeRuntimeId ? state : null;
      }, 'fresh re-enabled runtime', options.timeoutMs);
      assertExpectedB1Shell(fresh, 'clean re-enable', candidateIdentity);
      assert(fresh.runtimeInstanceId !== activeRuntimeId, 'Re-enable reused a retired runtime identity', fresh);
      assert(tracker.companionCount() === primaryBootParseBaseline + 2, 'Re-enable did not produce exactly one fresh bundle execution', tracker.snapshot());
      const priorRuntimeId = activeRuntimeId;
      activeRuntimeId = fresh.runtimeInstanceId;
      return {
        disabledResponse,
        repeatedDisableResponse,
        timerBeforeDisable: coreBeforeDisable.timer,
        authoritativeRevisionAfterDisable: persistedAfterDisable.revision,
        enabledResponse,
        priorRuntimeInstanceId: priorRuntimeId,
        freshRuntimeInstanceId: activeRuntimeId,
        companionBundleParses: tracker.companionCount()
      };
    });

    await runBrowserCase(result.cases, family, ['B1-LC-009'], 'STALE-RESPONSE', 'A delayed stale response cannot overwrite the newer disabled state', async () => {
      assert(activeRuntimeId, 'Fresh runtime was unavailable because the prerequisite case failed');
      const parseBaseline = tracker.companionCount();
      const installed = await bridge.installOneShotResponseHold(MESSAGES.REVALIDATE);
      if (!installed?.installed) throw new UnsupportedCase(`Content response fencing could not be instrumented safely: ${installed?.reason || 'unknown reason'}`);
      let release = null;
      try {
        await bridge.dispatchPersistedPageShow();
        await waitFor(async () => (await bridge.heldResponseCount()) === 1, 'one delayed revalidation response', options.timeoutMs);

        const disabledResponse = await bridge.setEnabled(false);
        const disabled = await waitFor(async () => {
          const state = await pageState(page);
          return state.controller === 'disabled' && !state.runtimeGlobalPresent && state.rootCount === 0 ? state : null;
        }, 'newer disabled publication', options.timeoutMs);
        release = await bridge.releaseAndRestoreResponseHold();
        assert(release.restored === true && release.released === 1, 'Held response was not released and restored exactly once', release);
        await page.waitForTimeout(150);
        const afterStale = await pageState(page);
        assert(afterStale.controller === 'disabled', 'Stale revalidation response overwrote the newer disabled controller state', afterStale);
        assert(afterStale.runtimeGlobalPresent === false && afterStale.rootCount === 0, 'Stale revalidation response recreated runtime resources', afterStale);
        assert(tracker.companionCount() === parseBaseline, 'Stale response caused a bundle execution', tracker.snapshot());

        const enabledResponse = await bridge.setEnabled(true);
        const fresh = await waitFor(async () => {
          const state = await pageState(page);
          return state.health?.state === 'DEGRADED' && state.runtimeInstanceId !== activeRuntimeId ? state : null;
        }, 'fresh runtime after stale-response fence', options.timeoutMs);
        assertExpectedB1Shell(fresh, 'stale-response fence restart', candidateIdentity);
        assert(tracker.companionCount() === parseBaseline + 1, 'Restart after stale response did not execute exactly one fresh bundle', tracker.snapshot());
        const priorRuntimeId = activeRuntimeId;
        activeRuntimeId = fresh.runtimeInstanceId;
        return { installed, disabledResponse, disabled, release, afterStale, enabledResponse, priorRuntimeId, freshRuntimeId: activeRuntimeId, companionBundleParses: tracker.companionCount() };
      } finally {
        if (!release) await bridge.releaseAndRestoreResponseHold().catch(() => {});
      }
    });

    await runBrowserCase(result.cases, family, ['B1-LC-007'], '23', 'Failed cleanup remains sticky until explicit cleanup-only retry succeeds', async () => {
      assert(activeRuntimeId, 'Fresh runtime was unavailable because the prerequisite case failed');
      const patch = await page.evaluate(rootId => {
        const root = document.getElementById(rootId);
        if (!root || typeof root.remove !== 'function') return { patched: false };
        root.__a4OriginalRemove = root.remove;
        root.remove = function() { throw new Error('a4-injected-root-removal-failure'); };
        return { patched: root.remove !== root.__a4OriginalRemove };
      }, ROOT_ID);
      if (!patch.patched) throw new UnsupportedCase('The owned root could not be safely instrumented for a cleanup failure');

      const disableResponse = await bridge.setEnabled(false);
      const failed = await waitFor(async () => {
        const state = await pageState(page);
        return state.health?.state === 'FAILED' && state.health?.reason === 'teardown-incomplete' ? state : null;
      }, 'sticky failed cleanup state', options.timeoutMs);
      assert(failed.runtimeInstanceId === activeRuntimeId, 'Failed cleanup lost its owning runtime', failed);
      assert(failed.health.mode === 'DISABLED', 'Failed cleanup did not remain disabled', failed.health);
      assert(failed.health.cleanupRequired === true, 'Failed cleanup did not advertise cleanupRequired', failed.health);
      assert(failed.health.outstandingResources?.includes('ui'), 'Failed cleanup did not retain UI ownership', failed.health);
      assert(failed.health.outstandingResources?.includes('ownership'), 'Failed cleanup did not retain runtime ownership', failed.health);
      const parseCountAtFailure = tracker.companionCount();

      const disabledBoot = await bridge.send({ type: MESSAGES.BOOT });
      const blockedEnable = await bridge.setEnabled(true);
      const failedRetry = await bridge.send({ type: MESSAGES.RETRY });
      const stillFailed = await pageState(page);
      assert(stillFailed.health?.state === 'FAILED' && stillFailed.health?.reason === 'teardown-incomplete', 'A normal command cleared sticky cleanup failure', stillFailed);
      assert(stillFailed.runtimeInstanceId === activeRuntimeId, 'A normal command replaced failed runtime ownership', stillFailed);
      assert(tracker.companionCount() === parseCountAtFailure, 'A normal command reinjected over failed ownership', tracker.snapshot());
      assert(disabledBoot?.health?.reason === 'teardown-incomplete', 'Disabled boot did not observe sticky failure', disabledBoot);
      assert(blockedEnable?.health?.reason === 'teardown-incomplete', 'Enable was not blocked by sticky failure', blockedEnable);
      assert(failedRetry?.health?.reason === 'teardown-incomplete', 'Failed cleanup retry did not remain sticky', failedRetry);

      const restored = await page.evaluate(rootId => {
        const root = document.getElementById(rootId);
        if (!root?.__a4OriginalRemove) return false;
        root.remove = root.__a4OriginalRemove;
        delete root.__a4OriginalRemove;
        return true;
      }, ROOT_ID);
      assert(restored, 'Could not restore the root removal method after injected failure');
      const successfulRetry = await bridge.send({ type: MESSAGES.RETRY });
      const cleaned = await waitFor(async () => {
        const state = await pageState(page);
        return !state.runtimeGlobalPresent && state.rootCount === 0 ? state : null;
      }, 'successful cleanup-only retry', options.timeoutMs);
      assert(successfulRetry?.cleanupComplete === true, 'Explicit cleanup retry did not report completion', successfulRetry);
      assert(successfulRetry?.restartAvailable === true, 'Completed cleanup did not advertise a fresh restart', successfulRetry);
      assert(cleaned.claimPresent === false && cleaned.bootstrapPresent === false, 'Cleanup retry retained ownership markers', cleaned);

      const restartedResponse = await bridge.setEnabled(true);
      const fresh = await waitFor(async () => {
        const state = await pageState(page);
        return state.health?.state === 'DEGRADED' && state.runtimeInstanceId !== activeRuntimeId ? state : null;
      }, 'fresh runtime after cleanup-only retry', options.timeoutMs);
      assertExpectedB1Shell(fresh, 'fresh runtime after cleanup retry', candidateIdentity);
      assert(tracker.companionCount() === parseCountAtFailure + 1, 'Cleanup completion did not allow exactly one fresh bundle execution', tracker.snapshot());
      const failedRuntimeId = activeRuntimeId;
      activeRuntimeId = fresh.runtimeInstanceId;
      return {
        disableResponse,
        failedRuntimeId,
        failedState: failed.health,
        disabledBoot,
        blockedEnable,
        failedRetry,
        successfulRetry,
        restartedResponse,
        freshRuntimeId: activeRuntimeId,
        companionBundleParses: tracker.companionCount()
      };
    });

    await runB2TransitionBrowserCase(
      result.cases,
      family,
      ['B2-TRANSITION-005'],
      'LEGACY-PREFLIGHT',
      'Malformed legacy migration fails closed without exposing stored values',
      async () => {
        await bridge.setEnabled(false);
        await waitFor(async () => {
          const state = await pageState(page);
          return !state.runtimeGlobalPresent && state.rootCount === 0 ? state : null;
        }, 'legacy preflight setup disable', options.timeoutMs);
        const legacyKey = 'ussign-squarecoil-job-timer-v1';
        const sensitiveSentinel = 'A4-SENSITIVE-LEGACY-VALUE-MUST-NOT-LEAK';
        const seeded = await bridge.setLegacyValue(legacyKey, sensitiveSentinel);
        assert(seeded === sensitiveSentinel, 'Synthetic legacy marker was not seeded');
        const beforeEnvelope = (await bridge.getStorage([AUTHORITY_STORAGE_KEY]))?.[AUTHORITY_STORAGE_KEY];
        const action7Before = result.network.action7.length;
        const enabledResponse = await bridge.setEnabled(true);
        const blockedCore = await waitFor(async () => {
          const snapshot = await bridge.coreSnapshot();
          return snapshot?.initialized === true && snapshot.blocked === true &&
            snapshot.preflight?.reason === 'legacy-preflight-failed' &&
            snapshot.preflight?.disposition === 'FAILED' ? snapshot : null;
        }, 'legacy fail-closed trusted core', options.timeoutMs);
        const afterEnvelope = (await bridge.getStorage([AUTHORITY_STORAGE_KEY]))?.[AUTHORITY_STORAGE_KEY];
        assert(blockedCore.preflight?.reason === 'legacy-preflight-failed' && blockedCore.preflight?.disposition === 'FAILED', 'Legacy preflight returned an unexpected block reason', blockedCore);
        assert(blockedCore.preflight?.presentKeys?.length === 1 && blockedCore.preflight.presentKeys[0] === legacyKey, 'Legacy preflight did not report only the key identity', blockedCore.preflight);
        assert(JSON.stringify(blockedCore).includes(sensitiveSentinel) === false, 'Legacy preflight leaked the stored value', blockedCore);
        const blockedHealth = await waitFor(async () => {
          const health = await bridge.send({ type: MESSAGES.HEALTH });
          return health?.ready === false && health?.health?.state === 'DEGRADED' &&
            health.reason === 'legacy-preflight-failed' ? health : null;
        }, 'terminal malformed legacy settlement', options.timeoutMs);
        assert(blockedHealth?.ready === false && blockedHealth?.health?.state === 'DEGRADED', 'Blocked migration falsely reported READY', blockedHealth);
        assert(blockedHealth?.reason === 'legacy-preflight-failed', 'Blocked migration reported an unexpected settlement reason', blockedHealth);
        assert(afterEnvelope?.document?.revision === beforeEnvelope?.document?.revision, 'Legacy-blocked boot committed a Timer write', {
          beforeRevision: beforeEnvelope?.document?.revision,
          afterRevision: afterEnvelope?.document?.revision
        });
        assert(result.network.action7.length === action7Before, 'Legacy-blocked boot issued an action 7 request', { action7Before, action7After: result.network.action7.length });
        assert(result.network.nativeMutationAttempts.length === 0, 'Legacy-blocked boot attempted a native SquareCoil mutation', result.network.nativeMutationAttempts);
        await bridge.setEnabled(false);
        const removed = await bridge.removeLegacyValue(legacyKey);
        assert(removed === null, 'Synthetic legacy marker was not removed');
        return {
          enabledResponse,
          blockedHealth,
          blockedCore,
          authoritativeRevision: afterEnvelope?.document?.revision,
          action7RequestsBeforeAndAfter: [action7Before, result.network.action7.length]
        };
      },
      { b2ReadyFixtureIds: ['B2-READY-003'] }
    );

    const finalState = await pageState(page);
    if (finalState.runtimeGlobalPresent) {
      await bridge.setEnabled(false).catch(() => {});
      await waitFor(async () => {
        const state = await pageState(page);
        return !state.runtimeGlobalPresent && state.rootCount === 0;
      }, 'final clean browser teardown', options.timeoutMs).catch(() => {});
    }
    await runCase(result.cases, `A4-B1-${family === 'chrome' ? 'CH' : 'ED'}-EVIDENCE-HEALTH`, 'Synthetic-only network and browser console remain clean', async () => {
      assert(result.network.blockedUnexpected.length === 0, 'Unexpected network requests were attempted', result.network.blockedUnexpected);
      assert(result.network.nativeMutationAttempts.length === 0, 'Native SquareCoil mutation requests were attempted', result.network.nativeMutationAttempts);
      assert(result.console.errors.length === 0, 'Browser console emitted warnings or errors', result.console.errors);
      assert(result.console.pageErrors.length === 0, 'Fixture page emitted uncaught errors', result.console.pageErrors);
      return { network: result.network, console: result.console };
    });
    const requiredFixtureIds = REQUIRED_A4_STABLE_FIXTURE_IDS.filter(fixtureId =>
      family === 'chrome' ? fixtureId !== 'B1-LC-018' : fixtureId !== 'B1-LC-017'
    );
    const observedFixtureIds = [...new Set(result.cases.flatMap(testCase => testCase.stableFixtureIds || []))].sort();
    result.stableFixtureCoverage = {
      required: requiredFixtureIds,
      observed: observedFixtureIds,
      missing: requiredFixtureIds.filter(fixtureId => !observedFixtureIds.includes(fixtureId))
    };
    if (result.stableFixtureCoverage.missing.length) {
      result.cases.push({
        id: `A4-B1-${family === 'chrome' ? 'CH' : 'ED'}-FIXTURE-COVERAGE`,
        name: 'Mandatory stable A4 fixture register coverage',
        status: 'FAIL',
        error: `Missing stable fixture IDs: ${result.stableFixtureCoverage.missing.join(', ')}`
      });
    }
    const observedB2KernelFixtureIds = [...new Set(result.cases.flatMap(testCase => testCase.b2KernelFixtureIds || []))].sort();
    result.b2KernelFixtureCoverage = {
      scope: 'B2_1_AUTHORITY_KERNEL',
      required: [...REQUIRED_B2_1_A4_FIXTURE_IDS],
      observed: observedB2KernelFixtureIds,
      missing: REQUIRED_B2_1_A4_FIXTURE_IDS.filter(fixtureId => !observedB2KernelFixtureIds.includes(fixtureId))
    };
    if (result.b2KernelFixtureCoverage.missing.length) {
      result.cases.push({
        id: `A4-B2.1-${family === 'chrome' ? 'CH' : 'ED'}-FIXTURE-COVERAGE`,
        name: 'Mandatory B2.1 isolated authority-kernel fixture coverage',
        b2Scope: 'ISOLATED_AUTHORITY_KERNEL_ONLY',
        status: 'FAIL',
        error: `Missing B2.1 fixture IDs: ${result.b2KernelFixtureCoverage.missing.join(', ')}`
      });
    }
    const observedB2TransitionFixtureIds = [...new Set(result.cases.flatMap(testCase => testCase.b2TransitionFixtureIds || []))].sort();
    result.b2TransitionFixtureCoverage = {
      scope: 'B2.2_TRUSTED_TRANSITION_CORE_PARTIAL',
      required: [...REQUIRED_B2_2_A4_FIXTURE_IDS],
      observed: observedB2TransitionFixtureIds,
      missing: REQUIRED_B2_2_A4_FIXTURE_IDS.filter(fixtureId => !observedB2TransitionFixtureIds.includes(fixtureId))
    };
    if (result.b2TransitionFixtureCoverage.missing.length) {
      result.cases.push({
        id: `A4-B2.2-${family === 'chrome' ? 'CH' : 'ED'}-FIXTURE-COVERAGE`,
        name: 'Mandatory B2.2 trusted transition-core fixture coverage',
        b2Scope: 'TRUSTED_TRANSITION_CORE_PARTIAL',
        status: 'FAIL',
        error: `Missing B2.2 fixture IDs: ${result.b2TransitionFixtureCoverage.missing.join(', ')}`
      });
    }
    const observedB2ReadyFixtureIds = [...new Set(result.cases.flatMap(testCase => testCase.b2ReadyFixtureIds || []))].sort();
    result.b2ReadySettlementCoverage = {
      scope: 'B2_FINAL_READY_SETTLEMENT_A4',
      required: [...REQUIRED_B2_READY_A4_FIXTURE_IDS],
      observed: observedB2ReadyFixtureIds,
      missing: REQUIRED_B2_READY_A4_FIXTURE_IDS.filter(fixtureId => !observedB2ReadyFixtureIds.includes(fixtureId))
    };
    if (result.b2ReadySettlementCoverage.missing.length) {
      result.cases.push({
        id: `A4-B2-C-${family === 'chrome' ? 'CH' : 'ED'}-FIXTURE-COVERAGE`,
        name: 'Mandatory final B2 READY settlement fixture coverage',
        b2Scope: 'FINAL_READY_SETTLEMENT',
        status: 'FAIL',
        error: `Missing final B2 READY fixture IDs: ${result.b2ReadySettlementCoverage.missing.join(', ')}`
      });
    }
    const observedB3WorkspaceFixtureIds = [...new Set(result.cases.flatMap(testCase => testCase.b3WorkspaceFixtureIds || []))].sort();
    result.b3WorkspaceFixtureCoverage = {
      scope: 'B3_CANONICAL_TIME_VIEWS_WORKSPACE_A4',
      required: [...REQUIRED_B3_WORKSPACE_A4_FIXTURE_IDS],
      observed: observedB3WorkspaceFixtureIds,
      missing: REQUIRED_B3_WORKSPACE_A4_FIXTURE_IDS.filter(fixtureId => !observedB3WorkspaceFixtureIds.includes(fixtureId))
    };
    if (result.b3WorkspaceFixtureCoverage.missing.length) {
      result.cases.push({
        id: `A4-B3-${family === 'chrome' ? 'CH' : 'ED'}-FIXTURE-COVERAGE`,
        name: 'Mandatory B3 canonical workspace fixture coverage',
        b3Scope: 'CANONICAL_TIME_VIEWS_WORKSPACE',
        status: 'FAIL',
        error: `Missing B3 workspace fixture IDs: ${result.b3WorkspaceFixtureCoverage.missing.join(', ')}`
      });
    }
    const observedB4DataFixtureIds = [...new Set(result.cases.flatMap(testCase => testCase.b4DataFixtureIds || []))].sort();
    result.b4DataFixtureCoverage = {
      scope: 'B4_DATA_SAFETY_BACKUP_RESTORE_CSV_A4',
      required: [...REQUIRED_B4_DATA_A4_FIXTURE_IDS],
      observed: observedB4DataFixtureIds,
      missing: REQUIRED_B4_DATA_A4_FIXTURE_IDS.filter(fixtureId => !observedB4DataFixtureIds.includes(fixtureId))
    };
    if (result.b4DataFixtureCoverage.missing.length) {
      result.cases.push({
        id: `A4-B4-${family === 'chrome' ? 'CH' : 'ED'}-FIXTURE-COVERAGE`,
        name: 'Mandatory B4 data-safety fixture coverage',
        b4Scope: 'DATA_SAFETY_BACKUP_RESTORE_CSV',
        status: 'FAIL',
        error: `Missing B4 data fixture IDs: ${result.b4DataFixtureCoverage.missing.join(', ')}`
      });
    }
    const observedB5SettingsFixtureIds = [...new Set(result.cases.flatMap(testCase => testCase.b5SettingsFixtureIds || []))].sort();
    result.b5SettingsFixtureCoverage = {
      scope: 'B5_A_SETTINGS_PRESENTATION_READINESS_A4',
      required: [...REQUIRED_B5_SETTINGS_A4_FIXTURE_IDS],
      observed: observedB5SettingsFixtureIds,
      missing: REQUIRED_B5_SETTINGS_A4_FIXTURE_IDS.filter(fixtureId => !observedB5SettingsFixtureIds.includes(fixtureId))
    };
    if (result.b5SettingsFixtureCoverage.missing.length) {
      result.cases.push({
        id: `A4-B5-A-${family === 'chrome' ? 'CH' : 'ED'}-FIXTURE-COVERAGE`,
        name: 'Mandatory B5-A settings/presentation fixture coverage',
        b5Scope: 'SETTINGS_PRESENTATION_READINESS',
        status: 'FAIL',
        error: `Missing B5-A settings fixture IDs: ${result.b5SettingsFixtureCoverage.missing.join(', ')}`
      });
    }
    const observedB5OptionalFixtureIds = [...new Set(result.cases.flatMap(testCase => testCase.b5OptionalFixtureIds || []))].sort();
    result.b5OptionalFixtureCoverage = {
      scope: 'B5_B_OPTIONAL_PRESENTATION_PACKS_A4',
      required: [...REQUIRED_B5B_A4_FIXTURE_IDS],
      observed: observedB5OptionalFixtureIds,
      missing: REQUIRED_B5B_A4_FIXTURE_IDS.filter(fixtureId => !observedB5OptionalFixtureIds.includes(fixtureId))
    };
    if (result.b5OptionalFixtureCoverage.missing.length) {
      result.cases.push({
        id: `A4-B5-B-${family === 'chrome' ? 'CH' : 'ED'}-FIXTURE-COVERAGE`,
        name: 'Mandatory B5-B optional-presentation fixture coverage',
        b5OptionalScope: 'OPTIONAL_PRESENTATION_PACKS',
        status: 'FAIL',
        error: `Missing B5-B optional fixture IDs: ${result.b5OptionalFixtureCoverage.missing.join(', ')}`
      });
    }
    const observedB5CThemeFixtureIds = [...new Set(result.cases.flatMap(testCase => testCase.b5cThemeFixtureIds || []))].sort();
    result.b5cThemeFixtureCoverage = {
      scope: 'B5_C_PROBE_BACKED_ROUTE_BOUNDED_THEME_ADAPTERS_A4',
      required: [...REQUIRED_B5C_A4_FIXTURE_IDS],
      observed: observedB5CThemeFixtureIds,
      missing: REQUIRED_B5C_A4_FIXTURE_IDS.filter(fixtureId => !observedB5CThemeFixtureIds.includes(fixtureId))
    };
    if (result.b5cThemeFixtureCoverage.missing.length) {
      result.cases.push({
        id: `A4-B5-C-${family === 'chrome' ? 'CH' : 'ED'}-FIXTURE-COVERAGE`,
        name: 'Mandatory B5-C probe-backed theme fixture coverage',
        b5cThemeScope: 'PROBE_BACKED_ROUTE_BOUNDED_THEME_ADAPTERS',
        status: 'FAIL',
        error: `Missing B5-C theme fixture IDs: ${result.b5cThemeFixtureCoverage.missing.join(', ')}`
      });
    }
    const observedB5DThemeFixtureIds = [...new Set(result.cases.flatMap(testCase => testCase.b5dThemeFixtureIds || []))].sort();
    result.b5dThemeFixtureCoverage = {
      scope: 'B5_D_ROUTE_BOUNDED_VENDOR_THEME_AND_ZERO_HISTORY_UI_A4',
      required: [...REQUIRED_B5D_A4_FIXTURE_IDS],
      observed: observedB5DThemeFixtureIds,
      missing: REQUIRED_B5D_A4_FIXTURE_IDS.filter(fixtureId => !observedB5DThemeFixtureIds.includes(fixtureId))
    };
    if (result.b5dThemeFixtureCoverage.missing.length) {
      result.cases.push({
        id: `A4-B5-D-${family === 'chrome' ? 'CH' : 'ED'}-FIXTURE-COVERAGE`,
        name: 'Mandatory B5-D vendor-theme and zero-history UI fixture coverage',
        b5dThemeScope: 'ROUTE_BOUNDED_VENDOR_THEME_AND_ZERO_HISTORY_UI',
        status: 'FAIL',
        error: `Missing B5-D theme/UI fixture IDs: ${result.b5dThemeFixtureCoverage.missing.join(', ')}`
      });
    }
    const observedB6CandidateFixtureIds = [...new Set(result.cases.flatMap(testCase => testCase.b6CandidateFixtureIds || []))].sort();
    const requiredCleanB6FixtureIds = ['B6-CANDIDATE-001', 'B6-PROFILE-001'];
    result.b6CandidateFixtureCoverage = {
      scope: 'B6_EXACT_RELEASE_CANDIDATE_CLEAN_PROFILE_A4',
      required: requiredCleanB6FixtureIds,
      observed: observedB6CandidateFixtureIds,
      missing: requiredCleanB6FixtureIds.filter(fixtureId => !observedB6CandidateFixtureIds.includes(fixtureId))
    };
    if (result.b6CandidateFixtureCoverage.missing.length) {
      result.cases.push({
        id: `A4-B6-${family === 'chrome' ? 'CH' : 'ED'}-CLEAN-FIXTURE-COVERAGE`,
        name: 'Mandatory B6 clean-profile candidate fixture coverage',
        b6Scope: 'EXACT_RELEASE_CANDIDATE_ACCEPTANCE',
        status: 'FAIL',
        error: `Missing B6 clean-profile fixture IDs: ${result.b6CandidateFixtureCoverage.missing.join(', ')}`
      });
    }
    const failedCases = result.cases.filter(testCase => testCase.status === 'FAIL');
    const unsupportedCases = result.cases.filter(testCase => testCase.status === 'UNSUPPORTED');
    result.status = failedCases.length ? 'FAIL' : unsupportedCases.length ? 'UNSUPPORTED' : 'PASS';
  } catch (error) {
    result.cases.push({
      id: 'A4-HARNESS',
      name: 'Browser harness setup and control',
      status: error instanceof UnsupportedCase ? 'UNSUPPORTED' : 'FAIL',
      error: error.message,
      details: error.details || null
    });
    result.status = error instanceof UnsupportedCase ? 'UNSUPPORTED' : 'FAIL';
  } finally {
    if (tracker) await tracker.detach();
    if (bridge) await bridge.detach();
    const tempRoot = path.resolve(os.tmpdir());
    const resolvedProfile = path.resolve(profileDirectory);
    const safeProfile = resolvedProfile.toLowerCase().startsWith(`${tempRoot.toLowerCase()}${path.sep}`) && path.basename(resolvedProfile).startsWith(`squarecoil-b1-a4-${family}-`);
    let retainProfile = false;
    if (result.initialFixtureNavigation.timedOut && context) {
      if (safeProfile && pathIsWithin(fs.realpathSync(resolvedProfile), fs.realpathSync(tempRoot))) {
        try {
          await withHarnessDeadline(() => context.close(), `A4-SETUP-${family}-TIMEOUT-CONTEXT-CLEANUP`, 5_000);
        } catch (error) {
          retainProfile = true;
          result.cleanupWarning = `Timed-out test context cleanup did not settle; profile retained at ${resolvedProfile}: ${error.message}`;
        }
      } else {
        retainProfile = true;
        result.cleanupWarning = `Refused timed-out context cleanup for unexpected profile path: ${resolvedProfile}`;
      }
      if (browserCdp) await withHarnessDeadline(() => browserCdp.detach(), `A4-SETUP-${family}-TIMEOUT-CDP-CLEANUP`, 1_500).catch(() => {});
    } else {
      if (browserCdp) await browserCdp.detach().catch(() => {});
      if (context) await context.close().catch(() => {});
    }
    if (safeProfile && !retainProfile) {
      try { fs.rmSync(resolvedProfile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
      catch (error) { result.cleanupWarning = `Temporary profile retained at ${resolvedProfile}: ${error.message}`; }
    } else if (!safeProfile) {
      result.cleanupWarning = `Refused to remove unexpected profile path: ${resolvedProfile}`;
    }
    result.durationMs = Date.now() - suiteStarted;
  }
  return result;
}

async function runUpgradeProfileSuite({ playwright, family, executablePath, packageDirectory, packageInventory, archiveInventory, options }) {
  const suiteStarted = Date.now();
  const candidateIdentity = Object.freeze({
    buildId: packageInventory.buildInfo.buildId,
    packageVersion: packageInventory.manifest.version,
    candidateFingerprint: packageInventory.buildInfo.candidateFingerprint
  });
  const result = {
    family,
    profile: 'PROFILE-UPGRADE-V07',
    status: 'RUNNING',
    executablePath,
    browserIdentity: null,
    extension: null,
    candidateIdentity,
    network: { fulfilled: [], action7: [], bing: [], nativeMutationAttempts: [], blockedUnexpected: [] },
    console: { errors: [], pageErrors: [] },
    b6CandidateFixtureCoverage: null,
    cases: [],
    durationMs: null,
    cleanupWarning: null
  };
  if (!fs.existsSync(executablePath)) {
    result.status = 'UNSUPPORTED';
    result.cases.push({ id: 'A4-ENV', name: 'Installed branded browser', status: 'UNSUPPORTED', error: `Executable not found: ${executablePath}` });
    result.durationMs = Date.now() - suiteStarted;
    return result;
  }

  const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), `squarecoil-b6-upgrade-a4-${family}-`));
  let context = null;
  let browserCdp = null;
  let bridge = null;
  try {
    context = await playwright.chromium.launchPersistentContext(profileDirectory, {
      executablePath,
      headless: !options.headed,
      ignoreDefaultArgs: ['--disable-extensions', '--disable-back-forward-cache'],
      viewport: { width: 1280, height: 900 },
      args: [
        '--enable-unsafe-extension-debugging',
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-sync',
        '--host-resolver-rules=MAP * ~NOTFOUND',
        '--metrics-recording-only',
        '--no-default-browser-check',
        '--no-first-run'
      ]
    });
    const browser = context.browser();
    if (!browser || typeof browser.newBrowserCDPSession !== 'function') {
      throw new UnsupportedCase('Browser-level CDP is unavailable for the persistent upgrade profile');
    }
    browserCdp = await browser.newBrowserCDPSession();
    const protocolVersion = await browserCdp.send('Browser.getVersion');
    result.browserIdentity = {
      ...protocolVersion,
      playwrightReportedVersion: browser.version(),
      executableRealPath: fs.realpathSync(executablePath),
      executableSha256: sha256(fs.readFileSync(executablePath))
    };

    let loadResult;
    try {
      loadResult = await browserCdp.send('Extensions.loadUnpacked', { path: packageDirectory, enableInIncognito: false });
    } catch (error) {
      throw new UnsupportedCase(`Extensions.loadUnpacked is unavailable: ${error.message}`);
    }
    const extensionId = loadResult?.id;
    assert(isConcreteIdentity(extensionId), 'Extensions.loadUnpacked did not return a concrete extension ID for the upgrade profile', loadResult);
    const extensionInfo = await waitFor(async () => {
      const extensionList = await browserCdp.send('Extensions.getExtensions');
      return extensionList.extensions?.find(extension => extension.id === extensionId) || null;
    }, 'the upgrade-profile extension registry entry', options.timeoutMs);
    assert(extensionInfo?.enabled === true, 'Upgrade-profile extension is not enabled', extensionInfo);
    assert(fs.realpathSync(extensionInfo.path).toLowerCase() === fs.realpathSync(packageDirectory).toLowerCase(), 'Upgrade profile loaded a different extension path', extensionInfo);
    assert(extensionInfo.version === packageInventory.manifest.version, 'Upgrade profile loaded a different extension version', extensionInfo);
    assert(packageInventory.buildInfo.buildId === CANONICAL_BUILD_ID && packageInventory.buildInfo.stage === CANONICAL_STAGE,
      'Upgrade profile did not load the exact B6 candidate identity', packageInventory.buildInfo);
    assert(archiveInventory.inventoryDigest === packageInventory.inventoryDigest, 'Upgrade-profile archive/extracted identity differs', archiveInventory);
    result.extension = { ...extensionInfo, id: extensionId, loadResult, registryVerified: true };

    const setupPage = await context.newPage();
    try {
      setupPage.on('console', message => {
        if (message.type() === 'error' || message.type() === 'warning') result.console.errors.push({ page: 'setup', type: message.type(), text: message.text() });
      });
      setupPage.on('pageerror', error => result.console.pageErrors.push({ page: 'setup', text: String(error?.message || error) }));
      await setupPage.goto(`chrome-extension://${extensionId}/popup/popup.html`, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
      await waitFor(async () => setupPage.evaluate(async () => {
        const value = await chrome.storage.local.get('timerEnabled');
        return typeof value.timerEnabled === 'boolean' ? value.timerEnabled : null;
      }), 'the upgrade-profile installation default setting', options.timeoutMs);
      await observeRuntimePermissionRequests(context.serviceWorkers().find(worker => worker.url().startsWith(`chrome-extension://${extensionId}/`)));
      await setupPage.evaluate(() => chrome.storage.local.set({ timerEnabled: false }));
      await waitFor(async () => setupPage.evaluate(async () => {
        const value = await chrome.storage.local.get('timerEnabled');
        return value.timerEnabled === false ? true : null;
      }), 'the disabled upgrade-profile setup setting', options.timeoutMs);
    } finally {
      await setupPage.close().catch(() => {});
    }

    const transitionFixture = { clockContext: { projectId: '260701', label: '260701 - Design' } };
    await installSyntheticRouting(context, result.network, transitionFixture);
    const existingPages = context.pages();
    const page = existingPages[0] || await context.newPage();
    for (const extra of existingPages.slice(1)) await extra.close().catch(() => {});
    page.on('console', message => {
      if (message.type() === 'error' || message.type() === 'warning') result.console.errors.push({ page: 'fixture', type: message.type(), text: message.text() });
    });
    page.on('pageerror', error => result.console.pageErrors.push({ page: 'fixture', text: String(error?.message || error) }));
    await page.goto(`${FIXTURE_ORIGIN}${FIXTURE_PATH}`, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
    await waitFor(async () => (await pageState(page)).documentToken, 'upgrade-profile content-controller document identity', options.timeoutMs);
    bridge = new ContentBridge(context, page, extensionId, options.timeoutMs, candidateIdentity);
    await bridge.initialize();

    await runB6CandidateBrowserCase(
      result.cases,
      family,
      ['B6-PROFILE-002'],
      'UPGRADE-V07',
      'Valid v0.7 data migrates once, remains read-only at source, and settles READY without restoring legacy live state',
      async () => {
        const legacyKey = 'ussign-squarecoil-job-timer-v1';
        const hourMs = 60 * 60 * 1000;
        const baseMs = Date.parse('2026-01-12T10:00:00.000Z');
        const legacy = {
          schema: 3,
          version: '0.7.1',
          settings: {
            themePreference: 'auto',
            timerSurface: 'glass',
            squareCoilTheme: 'dark',
            yellow: 15,
            orange: 45,
            red: 90
          },
          contexts: {
            'job:123456': {
              key: 'job:123456',
              type: 'job',
              projectId: '123456',
              label: '123456 - Upgrade Fixture',
              shortLabel: '123456',
              accumulatedMs: 2.5 * hourMs,
              sessions: [
                { id: 'legacy-session-1', cycleId: 'cycle-legacy-upgrade', startAt: baseMs, endAt: baseMs + hourMs, durationMs: hourMs, reason: 'legacy-stop' },
                { id: 'legacy-session-2', cycleId: 'cycle-legacy-upgrade', startAt: baseMs + hourMs, endAt: baseMs + (2 * hourMs), durationMs: hourMs, reason: 'legacy-stop' }
              ],
              cycleId: 'cycle-legacy-upgrade',
              createdAt: baseMs - hourMs,
              lastTouchedAt: baseMs + (2 * hourMs)
            }
          }
        };
        // Old pause -> clock-out -> Clear all leaves a non-live orphan hint;
        // unrelated saved history must still migrate through installed startup.
        legacy.active = null;
        legacy.pending = null;
        legacy.meta = { manualPausedKey: 'job:654321', observedClockKey: null };
        legacy.contexts['job:00123456'] = { ...legacy.contexts['job:123456'],
          key: 'job:00123456', projectId: '00123456' };
        delete legacy.contexts['job:123456'];
        const rawLegacy = JSON.stringify(legacy);
        const stateBefore = await pageState(page);
        const storageBefore = await bridge.getStorage(['timerEnabled', AUTHORITY_STORAGE_KEY]);
        assert(storageBefore.timerEnabled === false, 'Upgrade-profile precondition was not disabled', storageBefore);
        assert(storageBefore[AUTHORITY_STORAGE_KEY] === undefined, 'Upgrade profile inherited an authority document', storageBefore[AUTHORITY_STORAGE_KEY]);
        assert(stateBefore.runtimeGlobalPresent === false && stateBefore.rootCount === 0, 'Upgrade profile inherited an active runtime', stateBefore);
        const seeded = await bridge.setLegacyValue(legacyKey, rawLegacy);
        assert(seeded === rawLegacy, 'Valid v0.7 source was not seeded byte-for-byte');

        const enabledResponse = await bridge.setEnabled(true);
        let lastCore = null;
        let settledCore;
        try {
          settledCore = await waitFor(async () => {
            const snapshot = await bridge.coreSnapshot();
            lastCore = snapshot;
            const preferences = snapshot?.preferences;
            return snapshot?.initialized === true && snapshot.blocked === false &&
              snapshot.preflight?.disposition === 'COMPLETE_MATCH' &&
              preferences?.initialized === true && preferences.timerAppearance === 'AUTO' &&
              preferences.panelFinish === 'GLASS' && preferences.websiteTheme === 'SLEEK_DARK'
              ? snapshot
              : null;
          }, 'valid v0.7 migration, preference adoption, and trusted-core initialization', options.timeoutMs);
        } catch (error) {
          error.details = { enabledResponse, lastCore };
          throw error;
        }
        const settledHealth = await waitFor(async () => {
          const health = await bridge.send({ type: MESSAGES.HEALTH });
          return health?.ready === true && health?.health?.state === 'READY' &&
            health?.b2Settlement?.migrationDisposition === 'COMPLETE_MATCH' ? health : null;
        }, 'valid v0.7 B2 READY settlement', options.timeoutMs);

        const authorityBefore = (await bridge.getStorage([AUTHORITY_STORAGE_KEY]))?.[AUTHORITY_STORAGE_KEY]?.document;
        const legacyContextBefore = authorityBefore?.contexts?.['job:123456'];
        const importedLedgerBefore = (authorityBefore?.ledger || []).filter(row => row.contextId === 'job:123456');
        const importedHistoryBefore = (settledCore.timer?.historyRows || []).filter(row => row.contextId === 'job:123456');
        const importedContextBefore = (settledCore.timer?.byContextRows || []).find(row => row.contextId === 'job:123456');
        const importedDataBefore = (settledCore.data?.recentRows || []).find(row => row.contextId === 'job:123456');
        const sourceAfterMigration = await bridge.run(() => `localStorage.getItem(${JSON.stringify(legacyKey)})`);
        const markerBefore = authorityBefore?.migration?.completedSources?.['squarecoil-v07-localstorage-v1'];

        assert(markerBefore?.completionState === 'COMPLETE', 'Valid v0.7 migration completion marker is missing', markerBefore);
        assert(authorityBefore?.contexts?.['job:00123456'] === undefined,
          'Padded legacy identity was not canonicalized');
        assert(authorityBefore?.contexts?.['job:654321'] === undefined,
          'Orphan metadata fabricated a Context');
        assert(authorityBefore?.migration?.recoveryCandidates?.localPause === undefined,
          'Orphan metadata fabricated pause recovery evidence');
        assert(authorityBefore?.migration?.diagnostics?.some(row => row.code === 'LEGACY_ORPHAN_MANUAL_PAUSE_IGNORED'),
          'Orphan metadata did not record its fixed diagnostic');
        assert(authorityBefore?.timer?.active?.contextId === 'job:260701' &&
          authorityBefore.timer.active.startedAtMs > baseMs + 2 * hourMs,
          'Migration did not reach fresh current clock observation', authorityBefore?.timer?.active);
        assert(sourceAfterMigration === rawLegacy, 'Migration modified or removed the legacy source');
        assert(importedLedgerBefore.length === 2, 'Valid v0.7 sessions did not become exactly two Ledger segments', importedLedgerBefore);
        assert(importedLedgerBefore.reduce((sum, row) => sum + row.durationMs, 0) === 2 * hourMs, 'Imported Ledger duration is not exactly two hours', importedLedgerBefore);
        assert(legacyContextBefore?.legacyUnattributedMs === 0.5 * hourMs, 'Accumulated legacy remainder was not preserved as undated time', legacyContextBefore);
        assert(importedHistoryBefore.length === 2 && importedHistoryBefore.reduce((sum, row) => sum + row.durationMs, 0) === 2 * hourMs,
          'Canonical History did not expose exactly the two dated legacy sessions', importedHistoryBefore);
        assert(importedContextBefore?.totalMs === 2.5 * hourMs && importedContextBefore?.legacyUnattributedMs === 0.5 * hourMs,
          'Canonical By Context totals did not preserve dated plus undated legacy time', importedContextBefore);
        assert(importedDataBefore?.totalMs === 2.5 * hourMs, 'Data-safety read model did not preserve the imported Context total', importedDataBefore);
        assert(settledCore.timer?.running?.contextId !== 'job:123456', 'Legacy running state was restored as live Timer truth', settledCore.timer?.running);
        assert(settledCore.timer?.pending?.contextId !== 'job:123456', 'Legacy pending state was restored as live Timer truth', settledCore.timer?.pending);
        assert(settledCore.timer?.localPause?.contextId !== 'job:123456', 'Legacy local-pause state was restored as live Timer truth', settledCore.timer?.localPause);
        assert(settledCore.preferences.cinematicBackground === 'CINEMATIC',
          'Migrated Glass theme did not retain its integrated background', settledCore.preferences);
        assert(settledCore.preferences.yellowMinutes === 15 && settledCore.preferences.orangeMinutes === 45 && settledCore.preferences.redMinutes === 90,
          'Legacy Timer limits were not migrated exactly', settledCore.preferences);

        const revalidated = await bridge.send({ type: MESSAGES.REVALIDATE });
        const settledAgain = await waitFor(async () => {
          const health = await bridge.send({ type: MESSAGES.HEALTH });
          return health?.ready === true && health?.b2Settlement?.migrationDisposition === 'COMPLETE_MATCH' ? health : null;
        }, 'idempotent v0.7 revalidation', options.timeoutMs);
        const authorityAfter = (await bridge.getStorage([AUTHORITY_STORAGE_KEY]))?.[AUTHORITY_STORAGE_KEY]?.document;
        const importedLedgerAfter = (authorityAfter?.ledger || []).filter(row => row.contextId === 'job:123456');
        const sourceAfterRevalidation = await bridge.run(() => `localStorage.getItem(${JSON.stringify(legacyKey)})`);
        assert(sourceAfterRevalidation === rawLegacy, 'Revalidation modified or removed the legacy source');
        assert(JSON.stringify(importedLedgerAfter) === JSON.stringify(importedLedgerBefore), 'Revalidation duplicated or rewrote imported Ledger evidence', {
          before: importedLedgerBefore,
          after: importedLedgerAfter
        });
        assert(authorityAfter?.contexts?.['job:123456']?.legacyUnattributedMs === 0.5 * hourMs,
          'Revalidation changed the undated legacy balance', authorityAfter?.contexts?.['job:123456']);
        assert(authorityAfter?.migration?.completedSources?.['squarecoil-v07-localstorage-v1']?.sourceDigest === markerBefore.sourceDigest,
          'Revalidation changed the completed-source identity', authorityAfter?.migration?.completedSources?.['squarecoil-v07-localstorage-v1']);
        assert(result.network.nativeMutationAttempts.length === 0, 'Upgrade-profile acceptance attempted a native SquareCoil mutation', result.network.nativeMutationAttempts);

        await bridge.setEnabled(false);
        await waitFor(async () => {
          const state = await pageState(page);
          return !state.runtimeGlobalPresent && state.rootCount === 0 ? state : null;
        }, 'upgrade-profile teardown', options.timeoutMs);
        return {
          profile: 'PROFILE-UPGRADE-V07',
          candidateIdentity,
          enabledResponse,
          settledHealth,
          revalidated,
          settledAgain,
          migrationDisposition: settledCore.preflight.disposition,
          migrationMarker: markerBefore,
          importedLedgerSegmentCount: importedLedgerBefore.length,
          importedDatedMs: importedLedgerBefore.reduce((sum, row) => sum + row.durationMs, 0),
          importedUndatedMs: legacyContextBefore.legacyUnattributedMs,
          importedTotalMs: importedContextBefore.totalMs,
          preferences: settledCore.preferences,
          legacySourceUnchanged: sourceAfterRevalidation === rawLegacy,
          legacyLiveStateRestored: false,
          nativeMutationAttempts: result.network.nativeMutationAttempts.length
        };
      },
      { profile: 'PROFILE-UPGRADE-V07' }
    );

    await runCase(result.cases, `A4-B6-${family === 'chrome' ? 'CH' : 'ED'}-UPGRADE-EVIDENCE-HEALTH`, 'Upgrade-profile synthetic network and browser console remain clean', async () => {
      assert(result.network.blockedUnexpected.length === 0, 'Upgrade profile attempted unexpected network requests', result.network.blockedUnexpected);
      assert(result.network.nativeMutationAttempts.length === 0, 'Upgrade profile attempted native SquareCoil mutations', result.network.nativeMutationAttempts);
      assert(result.network.bing.length > 0 && result.network.bing.every(entry =>
        entry.kind === 'metadata' && entry.cookieHeaderPresent === false &&
        entry.referrerHeaderPresent === false && entry.authorizationHeaderPresent === false),
      'Migrated Glass preference did not use only credential-free, allowlisted Bing metadata requests', result.network.bing);
      assert(result.console.errors.length === 0, 'Upgrade-profile browser console emitted warnings or errors', result.console.errors);
      assert(result.console.pageErrors.length === 0, 'Upgrade-profile page emitted uncaught errors', result.console.pageErrors);
      return { network: result.network, console: result.console };
    });

    const observedB6CandidateFixtureIds = [...new Set(result.cases.flatMap(testCase => testCase.b6CandidateFixtureIds || []))].sort();
    result.b6CandidateFixtureCoverage = {
      scope: 'B6_VALID_V07_UPGRADE_PROFILE_A4',
      required: ['B6-PROFILE-002'],
      observed: observedB6CandidateFixtureIds,
      missing: ['B6-PROFILE-002'].filter(fixtureId => !observedB6CandidateFixtureIds.includes(fixtureId))
    };
    if (result.b6CandidateFixtureCoverage.missing.length) {
      result.cases.push({
        id: `A4-B6-${family === 'chrome' ? 'CH' : 'ED'}-UPGRADE-FIXTURE-COVERAGE`,
        name: 'Mandatory B6 valid v0.7 upgrade-profile fixture coverage',
        b6Scope: 'EXACT_RELEASE_CANDIDATE_ACCEPTANCE',
        status: 'FAIL',
        error: `Missing B6 upgrade-profile fixture IDs: ${result.b6CandidateFixtureCoverage.missing.join(', ')}`
      });
    }
    const failedCases = result.cases.filter(testCase => testCase.status === 'FAIL');
    const unsupportedCases = result.cases.filter(testCase => testCase.status === 'UNSUPPORTED');
    result.status = failedCases.length ? 'FAIL' : unsupportedCases.length ? 'UNSUPPORTED' : 'PASS';
  } catch (error) {
    result.cases.push({
      id: 'A4-B6-UPGRADE-HARNESS',
      name: 'B6 valid v0.7 upgrade-profile harness setup and control',
      status: error instanceof UnsupportedCase ? 'UNSUPPORTED' : 'FAIL',
      error: error.message,
      details: error.details || null
    });
    result.status = error instanceof UnsupportedCase ? 'UNSUPPORTED' : 'FAIL';
  } finally {
    if (bridge) await bridge.detach();
    if (browserCdp) await browserCdp.detach().catch(() => {});
    if (context) await context.close().catch(() => {});
    const tempRoot = path.resolve(os.tmpdir());
    const resolvedProfile = path.resolve(profileDirectory);
    const safeProfile = resolvedProfile.toLowerCase().startsWith(`${tempRoot.toLowerCase()}${path.sep}`) &&
      path.basename(resolvedProfile).startsWith(`squarecoil-b6-upgrade-a4-${family}-`);
    if (safeProfile) {
      try { fs.rmSync(resolvedProfile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); }
      catch (error) { result.cleanupWarning = `Temporary upgrade profile retained at ${resolvedProfile}: ${error.message}`; }
    } else {
      result.cleanupWarning = `Refused to remove unexpected upgrade profile path: ${resolvedProfile}`;
    }
    result.durationMs = Date.now() - suiteStarted;
  }
  return result;
}

async function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${usage()}\n`);
    process.exitCode = 1;
    return;
  }

  const startedAt = new Date().toISOString();
  let packageBefore;
  let archiveBefore;
  let playwright;
  let playwrightResolvedFrom = null;
  try {
    packageBefore = inventoryPackage(options.packageDirectory);
    validatePackageIdentity(packageBefore, options);
    archiveBefore = inventoryArchive(options.archivePath, packageBefore);
    if (options.evidencePath && pathIsWithin(options.evidencePath, options.packageDirectory)) {
      throw new Error('Evidence output must be outside the immutable package directory');
    }
    if (options.evidencePath && path.resolve(options.evidencePath) === path.resolve(options.archivePath)) {
      throw new Error('Evidence output cannot overwrite the tested ZIP archive');
    }
    const resolved = resolvePlaywright();
    playwright = resolved.module;
    playwrightResolvedFrom = resolved.resolvedFrom;
  } catch (error) {
    const status = error instanceof UnsupportedCase ? 'UNSUPPORTED' : 'FAIL';
    const evidence = {
      schemaVersion: 1,
      gate: 'A4',
      status,
      acceptanceEligible: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      packageDirectory: options.packageDirectory,
      archivePath: options.archivePath,
      expectedSourceSha: options.expectedSourceSha,
      error: error.message
    };
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
    const safeEvidencePath = options.evidencePath &&
      !pathIsWithin(options.evidencePath, options.packageDirectory) &&
      path.resolve(options.evidencePath) !== path.resolve(options.archivePath);
    if (safeEvidencePath) {
      fs.mkdirSync(path.dirname(options.evidencePath), { recursive: true });
      fs.writeFileSync(options.evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    }
    process.exitCode = status === 'UNSUPPORTED' ? 2 : 1;
    return;
  }

  const suites = [];
  if (options.liveBingOnly) {
    for (const family of options.browsers) {
      process.stderr.write(`A4 ${family}: running direct skin/live Bing/two-Glass visual gate\n`);
      suites.push(await runLiveBingGate({
        playwright,
        family,
        executablePath: options.executables[family],
        packageDirectory: options.packageDirectory,
        packageInventory: packageBefore,
        options
      }));
    }
  } else {
    for (const family of options.browsers) {
      if (options.profiles.includes('clean')) {
        process.stderr.write(`A4 ${family}: running exact-package clean-profile lifecycle checks\n`);
        suites.push(await runBrowserSuite({
          playwright,
          family,
          executablePath: options.executables[family],
          packageDirectory: options.packageDirectory,
          packageInventory: packageBefore,
          archiveInventory: archiveBefore,
          options
        }));
      }
      if (options.profiles.includes('upgrade')) {
        process.stderr.write(`A4 ${family}: running exact-package valid v0.7 upgrade-profile checks\n`);
        suites.push(await runUpgradeProfileSuite({
          playwright,
          family,
          executablePath: options.executables[family],
          packageDirectory: options.packageDirectory,
          packageInventory: packageBefore,
          archiveInventory: archiveBefore,
          options
        }));
      }
    }
  }

  const packageAfter = inventoryPackage(options.packageDirectory);
  const packageUnchanged = packageAfter.inventoryDigest === packageBefore.inventoryDigest;
  const archiveAfterBytes = fs.readFileSync(options.archivePath);
  const archiveAfterSha256 = sha256(archiveAfterBytes);
  const archiveUnchanged = archiveAfterSha256 === archiveBefore.sha256 && archiveAfterBytes.length === archiveBefore.bytes;
  if (!packageUnchanged || !archiveUnchanged) {
    suites.push({
      family: 'package-integrity',
      status: 'FAIL',
      cases: [{
        id: 'A4-BYTES',
        name: 'Package directory and ZIP bytes remain immutable during A4',
        status: 'FAIL',
        error: !packageUnchanged ? 'Extracted package inventory changed during browser execution' : 'ZIP archive changed during browser execution'
      }]
    });
  }
  const b6CandidateFixtureCoverage = {};
  for (const family of options.liveBingOnly ? [] : options.browsers) {
    const browserSuites = suites.filter(suite => suite.family === family);
    const observed = [...new Set(browserSuites.flatMap(suite =>
      (suite.cases || []).flatMap(testCase => testCase.b6CandidateFixtureIds || [])))].sort();
    const requiredForRun = REQUIRED_B6_A4_FIXTURE_IDS.filter(fixtureId =>
      fixtureId === 'B6-PROFILE-002' ? options.profiles.includes('upgrade') : options.profiles.includes('clean'));
    const missing = requiredForRun.filter(fixtureId => !observed.includes(fixtureId));
    b6CandidateFixtureCoverage[family] = {
      required: requiredForRun,
      observed,
      missing,
      profiles: [...new Set(browserSuites.map(suite => suite.profile).filter(Boolean))].sort()
    };
    if (missing.length) {
      suites.push({
        family,
        profile: 'B6-AGGREGATE-COVERAGE',
        status: 'FAIL',
        cases: [{
          id: `A4-B6-${family === 'chrome' ? 'CH' : 'ED'}-AGGREGATE-FIXTURE-COVERAGE`,
          name: 'Mandatory B6 candidate and profile matrix fixture coverage',
          status: 'FAIL',
          error: `Missing B6 fixture IDs: ${missing.join(', ')}`
        }]
      });
    }
  }
  const hasFailure = suites.some(suite => suite.status === 'FAIL');
  const hasUnsupported = suites.some(suite => suite.status === 'UNSUPPORTED');
  const dirtyDevelopment = packageBefore.buildInfo.sourceDirty === true;
  const profileSubset = !options.liveBingOnly && options.profiles.length !== 2;
  const status = hasFailure ? 'FAIL' : hasUnsupported ? 'UNSUPPORTED' : dirtyDevelopment || profileSubset ? 'NON_ACCEPTANCE' : 'PASS';
  const evidence = {
    schemaVersion: 1,
    gate: 'A4',
    status,
    acceptanceEligible: status === 'PASS' && packageUnchanged && archiveUnchanged && !dirtyDevelopment && !profileSubset && !options.liveBingOnly,
    supplementalGatePassed: options.liveBingOnly && status === 'PASS',
    startedAt,
    finishedAt: new Date().toISOString(),
    host: { platform: process.platform, release: os.release(), arch: process.arch, node: process.version },
    playwright: { version: require(path.join(path.dirname(playwrightResolvedFrom), 'package.json')).version, resolvedFrom: playwrightResolvedFrom },
    mode: options.liveBingOnly ? 'SUPPLEMENTAL_REQUIRED_HOST_LIVE_BING_VISUAL' :
      dirtyDevelopment ? 'NON_ACCEPTANCE_DIRTY_DEVELOPMENT' : profileSubset ? 'NON_ACCEPTANCE_PROFILE_SUBSET' : 'ACCEPTANCE_CANDIDATE',
    requestedProfiles: options.profiles,
    expectedSourceSha: options.expectedSourceSha,
    archive: {
      path: archiveBefore.path,
      filename: archiveBefore.filename,
      bytes: archiveBefore.bytes,
      sha256Before: archiveBefore.sha256,
      sha256After: archiveAfterSha256,
      unchanged: archiveUnchanged,
      rootPrefix: archiveBefore.rootPrefix,
      inventoryDigest: archiveBefore.inventoryDigest,
      extractedInventoryMatch: archiveBefore.inventoryDigest === packageBefore.inventoryDigest
    },
    package: {
      directory: options.packageDirectory,
      packageVersion: packageBefore.manifest.version,
      buildId: packageBefore.buildInfo.buildId,
      stage: packageBefore.buildInfo.stage,
      candidateFingerprint: packageBefore.buildInfo.candidateFingerprint,
      candidateEmbeddingCounts: packageBefore.candidateEmbeddingCounts,
      sourceSha: packageBefore.buildInfo.sourceSha,
      sourceDirty: packageBefore.buildInfo.sourceDirty,
      inventoryDigestBefore: packageBefore.inventoryDigest,
      inventoryDigestAfter: packageAfter.inventoryDigest,
      unchanged: packageUnchanged,
      files: packageBefore.files
    },
    b6CandidateFixtureCoverage,
    browsers: suites
  };
  const serialized = `${JSON.stringify(evidence, null, 2)}\n`;
  process.stdout.write(serialized);
  if (options.evidencePath) {
    fs.mkdirSync(path.dirname(options.evidencePath), { recursive: true });
    fs.writeFileSync(options.evidencePath, serialized, 'utf8');
  }
  process.exitCode = status === 'PASS' || status === 'NON_ACCEPTANCE' ? 0 : status === 'UNSUPPORTED' ? 2 : 1;
}

main().catch(error => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
