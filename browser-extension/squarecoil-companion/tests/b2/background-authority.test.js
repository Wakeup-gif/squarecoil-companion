'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { AUTHORITY_STORAGE_KEY } = require('../../src/extension/authority-kernel');

const originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

function areaFixture() {
  const values = {};
  return {
    async get(key) {
      return {
        [key]: values[key] === undefined ? undefined : structuredClone(values[key])
      };
    },
    async set(patch) {
      Object.assign(values, structuredClone(patch));
    },
    async remove(key) {
      delete values[key];
    },
    read(key) {
      return values[key] === undefined ? null : structuredClone(values[key]);
    }
  };
}

function locksFixture() {
  let queue = Promise.resolve();
  return {
    request(_name, options, callback) {
      assert.equal(options.mode, 'exclusive');
      const run = queue.then(callback, callback);
      queue = run.then(() => undefined, () => undefined);
      return run;
    }
  };
}

function installChrome(area) {
  globalThis.chrome = {
    tabs: { sendMessage: async () => undefined },
    scripting: { executeScript: async () => [] },
    storage: { local: area },
    runtime: {
      getManifest: () => ({ version: '0.7.1' }),
      onInstalled: { addListener: () => undefined },
      onMessage: { addListener: () => undefined }
    }
  };
}

function setNavigator(value) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    enumerable: true,
    value
  });
}

function loadBackground() {
  const modulePath = require.resolve('../../src/extension/background-entry');
  delete require.cache[modulePath];
  return require(modulePath);
}

test.afterEach(() => {
  delete globalThis.chrome;
  if (originalNavigatorDescriptor) {
    Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
  } else {
    delete globalThis.navigator;
  }
});

test('UT-B2-AUTH-005 worker startup installs the real fenced authority kernel lazily', async () => {
  const area = areaFixture();
  installChrome(area);
  setNavigator({ locks: locksFixture() });

  const background = loadBackground();

  assert.equal(background.defaultAuthorityInstallation.installed, true);
  assert.equal(background.authorityRouter.isAvailable(), true);
  assert.equal(area.read(AUTHORITY_STORAGE_KEY), null);

  const initialized = await background.defaultAuthorityInstallation.adapter.initialize();
  const persisted = area.read(AUTHORITY_STORAGE_KEY);
  assert.equal(initialized.created, true);
  assert.equal(persisted.kernelSchemaVersion, 1);
  assert.equal(persisted.document.revision, 0);
});

test('UT-B2-AUTH-006 worker startup fails closed when cross-context locking is unavailable', () => {
  installChrome(areaFixture());
  setNavigator({});

  const background = loadBackground();

  assert.equal(background.defaultAuthorityInstallation.installed, false);
  assert.equal(background.defaultAuthorityInstallation.adapter, null);
  assert.match(background.defaultAuthorityInstallation.reason, /authority-web-locks-required/);
  assert.equal(background.authorityRouter.isAvailable(), false);
});

test('UT-B2-AUTH-008 lazy background CONNECT preserves corrupt authority storage and fails closed', async () => {
  const area = areaFixture();
  const corrupt = {
    kernelSchemaVersion: 1,
    kernelRevision: 14,
    kernelCommitId: 'corrupt-background-authority-envelope',
    updatedAtMs: 14_000,
    coordination: { schemaVersion: 999 },
    document: { schemaVersion: 999 }
  };
  await area.set({ [AUTHORITY_STORAGE_KEY]: corrupt });
  installChrome(area);
  setNavigator({ locks: locksFixture() });

  const background = loadBackground();
  const connected = await background.authorityRouter.route({
    tabId: 88,
    expectedDocumentId: 'browser-document-corrupt-001',
    documentToken: 'document-corrupt-background-001',
    buildId: background.BUILD_ID,
    packageVersion: '0.7.1',
    candidateFingerprint: 'b'.repeat(64)
  }, {
    type: background.AUTHORITY_MESSAGES.CONNECT,
    protocolVersion: background.AUTHORITY_PROTOCOL_VERSION,
    requestId: 'request-corrupt-background-001',
    runtimeInstanceId: 'runtime-corrupt-background-001'
  });

  assert.equal(connected.ok, false);
  assert.equal(connected.reason, 'authority-connect-failed');
  assert.match(connected.detail, /coordination-schema-unsupported|authoritative-schema-unsupported/);
  assert.equal(background.authorityRouter.snapshot().sessionCount, 0);
  assert.deepEqual(area.read(AUTHORITY_STORAGE_KEY), corrupt);
});
