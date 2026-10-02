'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DIST_ROOT = path.join(PROJECT_ROOT, 'dist');
const REQUIRED_BUNDLES = Object.freeze([
  'background.js',
  'content-controller.js',
  'companion-app.js'
]);
const ROOT_ID = 'ussign-job-timer';
const INTERACTION_PROBE_EVENT = 'squarecoil-companion:interaction-probe';
const SUPPORTED_URL = 'https://ussignandmill.squarecoil.net/jobs/123';
const AUTHORITY_PROTOCOL_VERSION = 1;
const AUTHORITY_PREPARE_DISABLE = 'SC_COMPANION_AUTHORITY_PREPARE_DISABLE';

function cloneSerializable(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function toDataAttribute(property) {
  return `data-${String(property).replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
}

class ListenerTarget {
  constructor() {
    this._listeners = new Map();
  }

  addEventListener(type, listener, options = {}) {
    if (typeof listener !== 'function') return;
    const listeners = this._listeners.get(type) || [];
    if (listeners.some(entry => entry.listener === listener)) return;
    listeners.push({ listener, once: options === true || options?.once === true });
    this._listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    const listeners = this._listeners.get(type) || [];
    this._listeners.set(type, listeners.filter(entry => entry.listener !== listener));
  }

  dispatchEvent(event) {
    if (!event || !event.type) throw new TypeError('Event type is required');
    try {
      if (!Object.prototype.hasOwnProperty.call(event, 'target')) event.target = this;
      event.currentTarget = this;
    } catch (_) {}
    const listeners = [...(this._listeners.get(event.type) || [])];
    for (const entry of listeners) {
      entry.listener.call(this, event);
      if (entry.once) this.removeEventListener(event.type, entry.listener);
    }
    return true;
  }

  listenerCount(type) {
    return (this._listeners.get(type) || []).length;
  }

  clearEventListeners(type) {
    if (type) this._listeners.delete(type);
    else this._listeners.clear();
  }
}

class FakeCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
    this.persisted = options.persisted === true;
  }
}

class FakeElement extends ListenerTarget {
  constructor(page, tagName) {
    super();
    this._page = page;
    this.ownerDocument = null;
    this.tagName = String(tagName || 'div').toUpperCase();
    this.parentNode = null;
    this.children = [];
    this.style = { cssText: '' };
    this.textContent = '';
    this._id = '';
    this._innerHTML = '';
    this._attributes = new Map();
    const classes = new Set();
    this.classList = {
      add: (...values) => values.forEach(value => classes.add(String(value))),
      remove: (...values) => values.forEach(value => classes.delete(String(value))),
      contains: value => classes.has(String(value))
    };
    const rawDataset = Object.create(null);
    this.dataset = new Proxy(rawDataset, {
      set: (target, property, value) => {
        target[property] = String(value);
        this._page?._notifyMutation(this, 'attributes', toDataAttribute(property));
        return true;
      },
      deleteProperty: (target, property) => {
        delete target[property];
        this._page?._notifyMutation(this, 'attributes', toDataAttribute(property));
        return true;
      }
    });
  }

  get id() {
    return this._id;
  }

  set id(value) {
    this._id = String(value || '');
    this._page?._notifyMutation(this, 'attributes', 'id');
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(value) {
    this._innerHTML = String(value || '');
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    if (this._innerHTML.includes('data-sc-status')) {
      const status = new FakeElement(this._page, 'div');
      status.ownerDocument = this.ownerDocument;
      status.setAttribute('data-sc-status', '');
      this.appendChild(status);
    }
    if (this._innerHTML.includes('data-sc-lifecycle-fallback-status')) {
      const fallback = new FakeElement(this._page, 'div');
      fallback.ownerDocument = this.ownerDocument;
      fallback.setAttribute('data-sc-lifecycle-fallback-status', '');
      this.appendChild(fallback);
    }
  }

  get isConnected() {
    let current = this;
    while (current) {
      if (current === this.ownerDocument) return true;
      current = current.parentNode;
    }
    return false;
  }

  contains(candidate) {
    let current = candidate;
    while (current) {
      if (current === this) return true;
      current = current.parentNode;
    }
    return false;
  }

  appendChild(child) {
    if (!(child instanceof FakeElement)) throw new TypeError('Fake DOM accepts FakeElement children only');
    if (child.parentNode && child.parentNode !== this) child.parentNode.removeChild(child);
    if (!this.children.includes(child)) this.children.push(child);
    child.parentNode = this;
    child.ownerDocument = this.ownerDocument;
    this._page?._notifyMutation(this, 'childList', null);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index < 0) throw new Error('Child is not attached');
    this.children.splice(index, 1);
    child.parentNode = null;
    this._page?._notifyMutation(this, 'childList', null);
    return child;
  }

  remove() {
    if (this.id === ROOT_ID) {
      this._page.metrics.rootRemovalAttempts += 1;
      if (this._page.rootRemovalFailures > 0) {
        this._page.rootRemovalFailures -= 1;
        throw new Error('a3-injected-root-removal-failure');
      }
    }
    if (this.parentNode && typeof this.parentNode.removeChild === 'function') {
      this.parentNode.removeChild(this);
    }
  }

  setAttribute(name, value) {
    const normalized = String(name);
    this._attributes.set(normalized, String(value));
    if (normalized === 'id') this._id = String(value);
    if (normalized.startsWith('data-')) {
      const property = normalized.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[property] = String(value);
    } else {
      this._page?._notifyMutation(this, 'attributes', normalized);
    }
  }

  getAttribute(name) {
    if (name === 'id') return this.id || null;
    return this._attributes.has(name) ? this._attributes.get(name) : null;
  }

  _matches(selector) {
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector === '[data-squarecoil-companion-root="rebuild"]') {
      return this.dataset.squarecoilCompanionRoot === 'rebuild';
    }
    if (selector === '[data-sc-status]') {
      return this._attributes.has('data-sc-status') || Object.prototype.hasOwnProperty.call(this.dataset, 'scStatus');
    }
    if (selector === '[data-sc-lifecycle-fallback-status]') {
      return this._attributes.has('data-sc-lifecycle-fallback-status');
    }
    return false;
  }

  querySelectorAll(selector) {
    const results = [];
    const visit = element => {
      for (const child of element.children) {
        if (child._matches(selector)) results.push(child);
        visit(child);
      }
    };
    visit(this);
    return results;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

}

class FakeDocument extends ListenerTarget {
  constructor(page) {
    super();
    this._page = page;
    this.readyState = 'complete';
    this.documentElement = new FakeElement(page, 'html');
    this.documentElement.ownerDocument = this;
    this.documentElement.parentNode = this;
    this.body = new FakeElement(page, 'body');
    this.body.ownerDocument = this;
    this.documentElement.appendChild(this.body);
    this.defaultView = null;
  }

  createElement(tagName) {
    const element = new FakeElement(this._page, tagName);
    element.ownerDocument = this;
    return element;
  }

  querySelectorAll(selector) {
    const results = [];
    if (this.documentElement._matches(selector)) results.push(this.documentElement);
    return results.concat(this.documentElement.querySelectorAll(selector));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  getElementById(id) {
    return this.querySelector(`#${String(id)}`);
  }
}

class FakeMutationObserver {
  constructor(page, callback) {
    this._page = page;
    this._callback = callback;
    this._observations = [];
    this._records = [];
    this._queued = false;
    page._observers.add(this);
  }

  observe(target, options = {}) {
    this._observations.push({ target, options: { ...options } });
  }

  disconnect() {
    this._observations = [];
    this._records = [];
    this._page._observers.delete(this);
  }

  _contains(root, target) {
    let current = target;
    while (current) {
      if (current === root) return true;
      current = current.parentNode;
    }
    return false;
  }

  _accepts(target, type, attributeName) {
    return this._observations.some(({ target: root, options }) => {
      if (target !== root && (!options.subtree || !this._contains(root, target))) return false;
      if (type === 'childList') return options.childList === true;
      if (type !== 'attributes' || options.attributes !== true) return false;
      return !Array.isArray(options.attributeFilter) || options.attributeFilter.includes(attributeName);
    });
  }

  _enqueue(record) {
    if (!this._accepts(record.target, record.type, record.attributeName)) return;
    this._records.push(record);
    if (this._queued) return;
    this._queued = true;
    queueMicrotask(() => {
      this._queued = false;
      if (!this._records.length || !this._observations.length) return;
      const records = this._records.splice(0);
      this._callback(records, this);
    });
  }
}

class ChromeEvent {
  constructor() {
    this.listeners = new Set();
  }

  addListener(listener) {
    this.listeners.add(listener);
  }

  removeListener(listener) {
    this.listeners.delete(listener);
  }

  clear() {
    this.listeners.clear();
  }

  emit(...args) {
    return [...this.listeners].map(listener => listener(...args));
  }
}

class FakeStorageArea {
  constructor(changedEvent, initial = {}) {
    this._changedEvent = changedEvent;
    this._data = { ...initial };
    this.setHistory = [];
    this.removeHistory = [];
    this._nextGetGate = null;
  }

  async get(keys) {
    let result;
    if (keys === null || keys === undefined) result = cloneSerializable(this._data);
    if (typeof keys === 'string') {
      result = Object.prototype.hasOwnProperty.call(this._data, keys) ? { [keys]: cloneSerializable(this._data[keys]) } : {};
    }
    if (Array.isArray(keys)) {
      result = Object.fromEntries(keys.filter(key => Object.prototype.hasOwnProperty.call(this._data, key)).map(key => [key, cloneSerializable(this._data[key])]));
    }
    if (result === undefined) {
      result = {};
      for (const [key, fallback] of Object.entries(keys || {})) {
        result[key] = Object.prototype.hasOwnProperty.call(this._data, key) ? cloneSerializable(this._data[key]) : cloneSerializable(fallback);
      }
    }
    if (this._nextGetGate) {
      const gate = this._nextGetGate;
      this._nextGetGate = null;
      gate.markStarted();
      await gate.waitForRelease;
    }
    return result;
  }

  holdNextGet() {
    let markStarted;
    let release;
    const started = new Promise(resolve => { markStarted = resolve; });
    const waitForRelease = new Promise(resolve => { release = resolve; });
    this._nextGetGate = { markStarted, waitForRelease };
    return { started, release };
  }

  async set(values) {
    const changes = {};
    const keys = [];
    for (const [key, value] of Object.entries(values || {})) {
      const oldValue = this._data[key];
      const nextValue = cloneSerializable(value);
      this._data[key] = nextValue;
      keys.push(key);
      if (oldValue !== nextValue) changes[key] = { oldValue: cloneSerializable(oldValue), newValue: cloneSerializable(nextValue) };
    }
    this.setHistory.push(keys);
    if (Object.keys(changes).length) this._changedEvent.emit(changes, 'local');
  }

  setSilently(values) {
    for (const [key, value] of Object.entries(values || {})) {
      this._data[key] = cloneSerializable(value);
    }
  }

  async remove(keys) {
    const list = Array.isArray(keys) ? keys : [keys];
    const changes = {};
    for (const key of list) {
      if (!Object.prototype.hasOwnProperty.call(this._data, key)) continue;
      changes[key] = { oldValue: cloneSerializable(this._data[key]), newValue: undefined };
      delete this._data[key];
    }
    this.removeHistory.push([...list]);
    if (Object.keys(changes).length) this._changedEvent.emit(changes, 'local');
  }

  snapshot() {
    return cloneSerializable(this._data);
  }
}

class ResponseGate {
  constructor() {
    this._gates = new Map();
  }

  hold(type) {
    this._gates.set(type, { active: true, seen: 0, releases: [] });
  }

  async wait(type, response) {
    const gate = this._gates.get(type);
    if (!gate?.active) return response;
    gate.seen += 1;
    await new Promise(resolve => gate.releases.push(resolve));
    if (gate.rejection) throw new Error(gate.rejection);
    return response;
  }

  seen(type) {
    return this._gates.get(type)?.seen || 0;
  }

  release(type, rejection = null) {
    const gate = this._gates.get(type);
    if (!gate) return;
    gate.rejection = rejection ? String(rejection) : null;
    gate.active = false;
    for (const resolve of gate.releases.splice(0)) resolve();
  }
}

class FakePage {
  constructor(harness, options) {
    this.harness = harness;
    this.tabId = options.tabId;
    this.frameId = options.frameId;
    this.documentId = options.documentId;
    this.url = options.url;
    this.rootRemovalFailures = 0;
    this.metrics = {
      rootRemovalAttempts: 0,
      functionExecutions: 0,
      companionInjections: 0,
      contentExecutions: 0
    };
    this._observers = new Set();
    this._intervals = new Map();
    this._nextIntervalId = 1;
    this._mainQueue = Promise.resolve();
    this._nextFunctionGate = null;
    this._nextCompanionGate = null;

    this.document = new FakeDocument(this);
    this.window = new ListenerTarget();
    this.window.window = this.window;
    this.window.self = this.window;
    this.window.top = options.topLevel ? this.window : Object.freeze({ frame: 'top' });
    this.window.location = new URL(this.url);
    this.window.CustomEvent = FakeCustomEvent;
    this.window.setInterval = callback => {
      const id = this._nextIntervalId++;
      this._intervals.set(id, callback);
      return id;
    };
    this.window.clearInterval = id => this._intervals.delete(id);
    this.document.defaultView = this.window;

    this.mainSandbox = this._createSandbox('MAIN', null);
    this.mainContext = vm.createContext(this.mainSandbox, { name: `a3-main-tab-${this.tabId}` });
    this.isolatedSandbox = null;
    this.isolatedContext = null;
  }

  _createSandbox(world, chrome) {
    const page = this;
    return {
      window: this.window,
      self: this.window,
      document: this.document,
      location: this.window.location,
      chrome,
      console,
      URL,
      CustomEvent: FakeCustomEvent,
      MutationObserver: class extends FakeMutationObserver {
        constructor(callback) {
          super(page, callback);
        }
      },
      crypto: this.harness.deterministicCrypto,
      queueMicrotask,
      setTimeout,
      clearTimeout,
      setInterval: callback => page.window.setInterval(callback),
      clearInterval: id => page.window.clearInterval(id)
    };
  }

  _notifyMutation(target, type, attributeName) {
    if (!this._observers.size) return;
    const record = { target, type, attributeName };
    for (const observer of [...this._observers]) observer._enqueue(record);
  }

  _enqueueMain(task) {
    const run = this._mainQueue.then(task, task);
    this._mainQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  async executeFunction(func, args = []) {
    return this._enqueueMain(async () => {
      if (this._nextFunctionGate && (!this._nextFunctionGate.predicate || this._nextFunctionGate.predicate(func, args))) {
        const gate = this._nextFunctionGate;
        this._nextFunctionGate = null;
        gate.markStarted();
        await gate.waitForRelease;
      }
      this.metrics.functionExecutions += 1;
      this.mainSandbox.__a3InvocationArgs = cloneSerializable(args);
      try {
        const source = `(${func.toString()})(...globalThis.__a3InvocationArgs)`;
        const result = await vm.runInContext(source, this.mainContext, { filename: 'a3-injected-function.js' });
        return cloneSerializable(result);
      } finally {
        delete this.mainSandbox.__a3InvocationArgs;
      }
    });
  }

  async executeCompanionBundle(source) {
    return this._enqueueMain(async () => {
      if (this._nextCompanionGate) {
        const gate = this._nextCompanionGate;
        this._nextCompanionGate = null;
        gate.markStarted();
        await gate.waitForRelease;
      }
      this.metrics.companionInjections += 1;
      vm.runInContext(source, this.mainContext, { filename: 'dist/companion-app.js' });
    });
  }

  executeContentBundle(source, chrome) {
    this.metrics.contentExecutions += 1;
    this.isolatedSandbox = this._createSandbox('ISOLATED', chrome);
    this.isolatedContext = vm.createContext(this.isolatedSandbox, { name: `a3-isolated-tab-${this.tabId}` });
    vm.runInContext(source, this.isolatedContext, { filename: 'dist/content-controller.js' });
  }

  setDocumentToken(token) {
    this.document.documentElement.dataset.squarecoilCompanionDocumentToken = token;
  }

  get documentToken() {
    return this.document.documentElement.dataset.squarecoilCompanionDocumentToken || null;
  }

  get roots() {
    return this.document.querySelectorAll(`#${ROOT_ID}`);
  }

  get root() {
    return this.roots[0] || null;
  }

  get runtime() {
    try {
      return this.window.__squareCoilCompanionRuntime || null;
    } catch (_) {
      return null;
    }
  }

  get health() {
    const runtime = this.runtime;
    if (!runtime || typeof runtime.getHealth !== 'function') return null;
    return cloneSerializable(runtime.getHealth());
  }

  failNextRootRemovals(count) {
    this.rootRemovalFailures = Math.max(0, Number(count) || 0);
  }

  holdNextFunctionExecution() {
    let markStarted;
    let release;
    const started = new Promise(resolve => { markStarted = resolve; });
    const waitForRelease = new Promise(resolve => { release = resolve; });
    this._nextFunctionGate = { markStarted, waitForRelease, predicate: () => true };
    return { started, release };
  }

  holdFunctionExecutionWhen(predicate) {
    if (typeof predicate !== 'function') throw new TypeError('A function gate predicate is required');
    let markStarted;
    let release;
    const started = new Promise(resolve => { markStarted = resolve; });
    const waitForRelease = new Promise(resolve => { release = resolve; });
    this._nextFunctionGate = { markStarted, waitForRelease, predicate };
    return { started, release };
  }

  holdNextCompanionExecution() {
    let markStarted;
    let release;
    const started = new Promise(resolve => { markStarted = resolve; });
    const waitForRelease = new Promise(resolve => { release = resolve; });
    this._nextCompanionGate = { markStarted, waitForRelease };
    return { started, release };
  }

  removeRoot() {
    const root = this.root;
    if (root) root.remove();
    return root;
  }

  breakRootInteraction() {
    const root = this.root;
    if (root) root.clearEventListeners(INTERACTION_PROBE_EVENT);
  }

  dispatchPageShow(persisted = true) {
    this.window.dispatchEvent({ type: 'pageshow', persisted: Boolean(persisted) });
  }

  dispatchPageHide(persisted = true) {
    this.window.dispatchEvent({ type: 'pagehide', persisted: Boolean(persisted) });
  }

  async runIntervals() {
    for (const callback of [...this._intervals.values()]) callback();
    await this.harness.tick();
  }

  get activeIntervalCount() {
    return this._intervals.size;
  }

  get activeObserverCount() {
    return this._observers.size;
  }
}

class A3Harness {
  constructor(options = {}) {
    this.distRoot = options.distRoot || DIST_ROOT;
    this.sources = Object.fromEntries(REQUIRED_BUNDLES.map(file => {
      const filePath = path.join(this.distRoot, file);
      if (!fs.existsSync(filePath)) throw new Error(`A3 requires built artifact: ${filePath}`);
      return [file, fs.readFileSync(filePath, 'utf8')];
    }));
    const buildInfoPath = path.join(this.distRoot, 'build-info.json');
    if (!fs.existsSync(buildInfoPath)) throw new Error(`A3 requires built artifact: ${buildInfoPath}`);
    this.buildInfo = JSON.parse(fs.readFileSync(buildInfoPath, 'utf8'));
    this.bundleEvidence = Object.fromEntries(REQUIRED_BUNDLES.map(file => [file, {
      bytes: Buffer.byteLength(this.sources[file]),
      sha256: createHash('sha256').update(this.sources[file]).digest('hex')
    }]));

    let uuidCounter = 0;
    this.deterministicCrypto = Object.freeze({
      randomUUID: () => {
        uuidCounter += 1;
        return `00000000-0000-4000-8000-${String(uuidCounter).padStart(12, '0')}`;
      }
    });
    this.pages = new Map();
    this.workerStarts = 0;
    this.workerContext = null;
    this.workerSandbox = null;
    this.runtimeOnMessage = new ChromeEvent();
    this.runtimeOnInstalled = new ChromeEvent();
    this.storageOnChanged = new ChromeEvent();
    this.contentRuntimeOnMessage = new Map();
    this.storage = new FakeStorageArea(this.storageOnChanged, options.storage || {});
    this.responseGate = new ResponseGate();
    this._nextTabId = 1;
    this.authorityKernelEnabled = options.authorityKernel === true;
    let authorityLockQueue = Promise.resolve();
    this.authorityLockManager = Object.freeze({
      request: (_name, _options, callback) => {
        const run = authorityLockQueue.then(callback, callback);
        authorityLockQueue = run.then(() => undefined, () => undefined);
        return run;
      }
    });
  }

  createPage(options = {}) {
    const tabId = options.tabId || this._nextTabId++;
    if (this.pages.has(tabId)) throw new Error(`Only one modeled document per tab is supported: ${tabId}`);
    const page = new FakePage(this, {
      tabId,
      frameId: Number.isInteger(options.frameId) ? options.frameId : 0,
      documentId: options.documentId || `document-id-${tabId}`,
      url: options.url || SUPPORTED_URL,
      topLevel: options.topLevel !== false
    });
    this.pages.set(tabId, page);
    return page;
  }

  _backgroundChrome() {
    return {
      runtime: {
        onInstalled: this.runtimeOnInstalled,
        onMessage: this.runtimeOnMessage,
        getManifest: () => ({ version: this.buildInfo.packageVersion })
      },
      storage: {
        local: this.storage,
        onChanged: this.storageOnChanged
      },
      scripting: {
        executeScript: details => this._executeScript(details)
      },
      tabs: {
        sendMessage: (tabId, message, options) => this._dispatchContentMessage(tabId, message, options)
      }
    };
  }

  _contentChrome(page) {
    if (!this.contentRuntimeOnMessage.has(page.tabId)) {
      this.contentRuntimeOnMessage.set(page.tabId, new ChromeEvent());
    }
    return {
      runtime: {
        getManifest: () => ({ version: this.buildInfo.packageVersion }),
        onMessage: this.contentRuntimeOnMessage.get(page.tabId),
        sendMessage: async message => {
          const response = await this._dispatchRuntimeMessage(message, this._senderFor(page));
          return this.responseGate.wait(message?.type, response);
        }
      },
      storage: {
        local: this.storage,
        onChanged: this.storageOnChanged
      }
    };
  }

  startWorker() {
    this.runtimeOnInstalled.clear();
    this.runtimeOnMessage.clear();
    this.workerStarts += 1;
    this.workerSandbox = {
      chrome: this._backgroundChrome(),
      console,
      URL,
      crypto: this.deterministicCrypto,
      navigator: this.authorityKernelEnabled
        ? { locks: this.authorityLockManager }
        : {},
      queueMicrotask,
      setTimeout,
      clearTimeout
    };
    this.workerContext = vm.createContext(this.workerSandbox, { name: `a3-worker-${this.workerStarts}` });
    vm.runInContext(this.sources['background.js'], this.workerContext, { filename: 'dist/background.js' });
  }

  restartWorker() {
    this.startWorker();
  }

  async startContentController(page) {
    page.executeContentBundle(this.sources['content-controller.js'], this._contentChrome(page));
    await this.tick();
  }

  _senderFor(page) {
    return {
      tab: { id: page.tabId, url: page.url },
      frameId: page.frameId,
      documentId: page.documentId,
      url: page.url
    };
  }

  async _dispatchRuntimeMessage(message, sender) {
    const listeners = [...this.runtimeOnMessage.listeners];
    if (!listeners.length) throw new Error('A3 worker has no runtime message listener');
    return new Promise((resolve, reject) => {
      let settled = false;
      let asyncResponseExpected = false;
      const sendResponse = value => {
        if (settled) return;
        settled = true;
        resolve(cloneSerializable(value));
      };
      try {
        for (const listener of listeners) {
          const result = listener(cloneSerializable(message), cloneSerializable(sender), sendResponse);
          if (result === true) asyncResponseExpected = true;
          if (settled) break;
        }
        if (!settled && !asyncResponseExpected) {
          settled = true;
          resolve(undefined);
        }
      } catch (error) {
        settled = true;
        reject(error);
      }
    });
  }

  async _dispatchContentMessage(tabId, message, options = {}) {
    const page = this.pages.get(tabId);
    if (!page) throw new Error(`A3 content target tab is unavailable: ${tabId}`);
    if (options.documentId && options.documentId !== page.documentId) throw new Error('A3 content target document changed');
    if (Number.isInteger(options.frameId) && options.frameId !== page.frameId) throw new Error('A3 content target frame changed');
    const event = this.contentRuntimeOnMessage.get(tabId);
    const listeners = [...(event?.listeners || [])];
    if (!listeners.length) {
      // Most B1 orchestration fixtures intentionally exercise only the real
      // background and MAIN bundles. With no isolated content bundle there can
      // be no authority client or transport session to release, so acknowledge
      // that exact absent case instead of inventing an authority allocation.
      if (message?.type === AUTHORITY_PREPARE_DISABLE) {
        return {
          ok: true,
          disconnected: true,
          absent: true,
          protocolVersion: AUTHORITY_PROTOCOL_VERSION,
          documentToken: page.documentToken,
          runtimeInstanceId: message.runtimeInstanceId || null
        };
      }
      throw new Error('A3 content world has no runtime message listener');
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      let asyncResponseExpected = false;
      const sendResponse = value => {
        if (settled) return;
        settled = true;
        resolve(cloneSerializable(value));
      };
      try {
        for (const listener of listeners) {
          const result = listener(cloneSerializable(message), {}, sendResponse);
          if (result === true) asyncResponseExpected = true;
          if (settled) break;
        }
        if (!settled && !asyncResponseExpected) {
          settled = true;
          resolve(undefined);
        }
      } catch (error) {
        settled = true;
        reject(error);
      }
    });
  }

  async sendFromPage(page, message) {
    const payload = {
      buildId: this.buildInfo.buildId,
      packageVersion: this.buildInfo.packageVersion,
      candidateFingerprint: this.buildInfo.candidateFingerprint,
      ...message
    };
    if (!Object.prototype.hasOwnProperty.call(payload, 'documentToken')) payload.documentToken = page.documentToken;
    const response = await this._dispatchRuntimeMessage(payload, this._senderFor(page));
    return this.responseGate.wait(payload.type, response);
  }

  async sendFromExtension(message) {
    return this._dispatchRuntimeMessage(message, {});
  }

  async _executeScript(details) {
    const tabId = details?.target?.tabId;
    const page = this.pages.get(tabId);
    if (!page) throw new Error(`A3 target tab is unavailable: ${tabId}`);
    if (Array.isArray(details.target.documentIds) && !details.target.documentIds.includes(page.documentId)) return [];
    if (Array.isArray(details.target.frameIds) && !details.target.frameIds.includes(page.frameId)) return [];

    let result;
    if (typeof details.func === 'function') {
      result = await page.executeFunction(details.func, details.args || []);
    } else if (Array.isArray(details.files)) {
      if (details.files.length !== 1 || details.files[0] !== 'dist/companion-app.js') {
        throw new Error(`Unexpected A3 MAIN bundle request: ${details.files.join(',')}`);
      }
      await page.executeCompanionBundle(this.sources['companion-app.js']);
      result = undefined;
    } else {
      throw new Error('A3 executeScript requires func or files');
    }
    return [{ result, frameId: page.frameId, documentId: page.documentId }];
  }

  async tick(turns = 4) {
    for (let index = 0; index < turns; index += 1) {
      await Promise.resolve();
      await new Promise(resolve => setImmediate(resolve));
    }
  }

  async waitFor(predicate, description = 'condition', turns = 100) {
    for (let index = 0; index < turns; index += 1) {
      if (predicate()) return;
      await this.tick(1);
    }
    throw new Error(`Timed out waiting for A3 ${description}`);
  }

  async waitForStableRuntime(page) {
    await this.waitFor(() => {
      const health = page.health;
      return health && !['BOOTING', 'RECOVERING'].includes(health.state) && health.teardownInProgress !== true;
    }, `stable runtime in tab ${page.tabId}`);
    return page.health;
  }

  holdResponses(type) {
    this.responseGate.hold(type);
  }

  releaseResponses(type) {
    this.responseGate.release(type);
  }

  rejectResponses(type, message = 'a3-injected-transport-error') {
    this.responseGate.release(type, message);
  }

  async waitForHeldResponse(type, count = 1) {
    await this.waitFor(() => this.responseGate.seen(type) >= count, `${type} held response`);
  }
}

function createA3Harness(options = {}) {
  const harness = new A3Harness(options);
  harness.startWorker();
  return harness;
}

module.exports = {
  PROJECT_ROOT,
  DIST_ROOT,
  ROOT_ID,
  INTERACTION_PROBE_EVENT,
  SUPPORTED_URL,
  createA3Harness
};
