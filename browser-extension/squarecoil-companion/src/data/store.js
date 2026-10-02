'use strict';

const {
  deepClone,
  validateDocument,
  createEmptyDocument
} = require('./model');
const {
  DISPOSITIONS,
  isSafeCounter,
  normalizePrincipal,
  samePrincipal,
  createCoordinationState,
  readCoordinationState,
  ownerPrincipal,
  isLeaseActive,
  connectRuntime,
  renewLease,
  releaseOwnership
} = require('../coordination/coordinator');

const AUTHORITY_SCHEMA_VERSION = 1;
const DEFAULT_LEASE_MS = 15000;
const DEFAULT_RECEIPT_LIMIT = 256;
const MAX_RECEIPT_LIMIT = 4096;
const INTERNAL_RESULT_KEYS = new Set([
  'commitFence',
  'fencingToken',
  'ownerRuntimeId',
  'ownerDocumentToken',
  'ownerTabId',
  'owner',
  'writer',
  'accrualOwnerToken',
  'commandReceipts',
  'commandReceiptOrder'
]);

function randomId(prefix) {
  try {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  } catch (_) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function requireText(value, name) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`${name}-required`);
  return normalized;
}

function requireTimestamp(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name}-invalid`);
  return value;
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => (
    `${JSON.stringify(key)}:${stableStringify(value[key])}`
  )).join(',')}}`;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function redactAuthorityMetadata(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) throw new Error('authority-command-result-cyclic');
  seen.set(value, true);
  if (Array.isArray(value)) {
    const result = value.map(item => redactAuthorityMetadata(item, seen));
    seen.delete(value);
    return result;
  }
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (!INTERNAL_RESULT_KEYS.has(key)) {
      result[key] = redactAuthorityMetadata(child, seen);
    }
  }
  seen.delete(value);
  return result;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function validateAuthorityRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('authority-record-invalid');
  }
  if (record.kernelSchemaVersion !== AUTHORITY_SCHEMA_VERSION) {
    throw new Error('authority-schema-unsupported');
  }
  if (!isSafeCounter(record.kernelRevision)) throw new Error('kernel-revision-invalid');
  requireText(record.kernelCommitId, 'kernel-commit-id');
  requireTimestamp(record.updatedAtMs, 'kernel-updated-at');
  readCoordinationState(record.coordination);
  validateDocument(record.document);
  const receiptOrder = record.document.commandReceiptOrder;
  const receipts = record.document.commandReceipts;
  if (!Array.isArray(receiptOrder) || receiptOrder.length > MAX_RECEIPT_LIMIT) {
    throw new Error('authority-command-receipt-order-invalid');
  }
  if (Object.keys(receipts).length !== receiptOrder.length) {
    throw new Error('authority-command-receipt-index-mismatch');
  }
  for (const commandId of receiptOrder) {
    const receipt = receipts[commandId];
    if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
      throw new Error(`authority-command-receipt-invalid:${commandId}`);
    }
    if (receipt.commandId !== commandId) {
      throw new Error(`authority-command-receipt-id-mismatch:${commandId}`);
    }
    requireText(receipt.requestFingerprint, 'authority-command-receipt-fingerprint');
    if (!isSafeCounter(receipt.revision) || receipt.revision < 1 || receipt.revision > record.document.revision) {
      throw new Error(`authority-command-receipt-revision-invalid:${commandId}`);
    }
    requireText(receipt.commitId, 'authority-command-receipt-commit-id');
    requireTimestamp(receipt.committedAtMs, 'authority-command-receipt-committed-at');
  }
  if (record.document.revision > 0) {
    const lastReceipt = receipts[receiptOrder.at(-1)];
    if (
      !lastReceipt ||
      lastReceipt.revision !== record.document.revision ||
      lastReceipt.commitId !== record.document.commitId
    ) {
      throw new Error('authority-document-commit-receipt-mismatch');
    }
    const fence = record.document.commitFence;
    if (
      !isSafeCounter(fence?.fencingToken) ||
      fence.fencingToken < 1 ||
      fence.coordinationEpoch > record.coordination.coordinationEpoch ||
      fence.fencingToken > record.coordination.fencingToken
    ) {
      throw new Error('authority-document-commit-fence-invalid');
    }
  }
  return true;
}

function createAuthorityRecord(options) {
  const nowMs = requireTimestamp(options.nowMs, 'kernel-now');
  const document = createEmptyDocument({
    nowMs,
    datasetId: requireText(options.makeId('dataset'), 'data-safety-dataset-id'),
    workdayZone: options.workdayZone,
    workdayZoneSource: options.workdayZoneDisposition?.source,
    workdayZoneFallback: options.workdayZoneDisposition?.fallback,
    workdayZoneDiagnostic: options.workdayZoneDisposition?.diagnostic
  });
  const record = {
    kernelSchemaVersion: AUTHORITY_SCHEMA_VERSION,
    kernelRevision: 0,
    kernelCommitId: `kernel:0:${requireText(options.makeId('kernel-init'), 'kernel-commit-id')}`,
    updatedAtMs: nowMs,
    coordination: createCoordinationState(),
    document
  };
  validateAuthorityRecord(record);
  return record;
}

function nextKernelRecord(current, changes, options) {
  validateAuthorityRecord(current);
  if (current.kernelRevision === Number.MAX_SAFE_INTEGER) {
    throw new Error('kernel-revision-exhausted');
  }
  const next = deepClone(current);
  if (changes.coordination) next.coordination = deepClone(changes.coordination);
  if (changes.document) next.document = deepClone(changes.document);
  next.kernelRevision = current.kernelRevision + 1;
  next.kernelCommitId = `kernel:${next.kernelRevision}:${requireText(options.makeId('kernel-commit'), 'kernel-commit-id')}`;
  next.updatedAtMs = requireTimestamp(options.nowMs, 'kernel-now');
  validateAuthorityRecord(next);
  return next;
}

function publicCoordination(state, principal, nowMs) {
  const coordination = readCoordinationState(state);
  const active = isLeaseActive(coordination, nowMs);
  let disposition = 'UNAVAILABLE';
  if (active) {
    disposition = samePrincipal(ownerPrincipal(coordination), principal)
      ? DISPOSITIONS.OWNER
      : DISPOSITIONS.OBSERVER_CONNECTED;
  }
  return Object.freeze({
    disposition,
    coordinationRevision: coordination.coordinationRevision,
    coordinationEpoch: coordination.coordinationEpoch,
    leaseExpiry: active ? coordination.leaseExpiry : null
  });
}

function publicDocument(document) {
  const copy = deepClone(document);
  delete copy.commandReceipts;
  delete copy.commandReceiptOrder;
  delete copy.commitFence;
  copy.authorityView = { schemaVersion: 1, redacted: true };
  if (copy.timer?.active?.accrualOwnerToken) {
    delete copy.timer.active.accrualOwnerToken;
    copy.timer.active.accrualOwnershipBound = true;
  }
  if (copy.checkpoint?.ownershipEvidence) {
    const disposition = copy.checkpoint.ownershipEvidence.disposition;
    const ownershipBound = ['OWNER', 'OBSERVER_CONNECTED'].includes(disposition);
    copy.checkpoint.ownershipEvidence = { disposition, ownershipBound };
  }
  return deepFreeze(copy);
}

function createAuthoritativeKernel(options = {}) {
  const adapter = options.adapter;
  if (!adapter || typeof adapter.load !== 'function' || typeof adapter.runExclusive !== 'function') {
    throw new Error('authority-adapter-required');
  }
  const now = options.now || (() => Date.now());
  const makeId = options.makeId || randomId;
  const applyCommand = options.applyCommand;
  const leaseDurationMs = options.leaseDurationMs || DEFAULT_LEASE_MS;
  const receiptLimit = options.receiptLimit || DEFAULT_RECEIPT_LIMIT;
  if (!Number.isSafeInteger(leaseDurationMs) || leaseDurationMs <= 0) {
    throw new Error('lease-duration-invalid');
  }
  if (!Number.isSafeInteger(receiptLimit) || receiptLimit <= 0 || receiptLimit > MAX_RECEIPT_LIMIT) {
    throw new Error('receipt-limit-invalid');
  }
  if (!options.workdayZone) throw new Error('workday-zone-required');
  if (!options.workdayZoneDisposition || typeof options.workdayZoneDisposition !== 'object') {
    throw new Error('workday-zone-disposition-required');
  }

  let queue = Promise.resolve();
  let latest = null;
  const sessions = new Map();
  const sessionByPrincipal = new Map();
  const subscribers = new Set();

  function serialize(task) {
    const run = queue.then(task, task);
    queue = run.then(() => undefined, () => undefined);
    return run;
  }

  function currentTime() {
    return requireTimestamp(now(), 'kernel-now');
  }

  function principalKey(principal) {
    return `${principal.tabId}\u0000${principal.documentToken}\u0000${principal.runtimeId}`;
  }

  function newRecord(atMs = currentTime()) {
    return createAuthorityRecord({
      nowMs: atMs,
      makeId,
      workdayZone: options.workdayZone,
      workdayZoneDisposition: options.workdayZoneDisposition
    });
  }

  function validateLoaded(record) {
    validateAuthorityRecord(record);
    return deepClone(record);
  }

  function adopt(record) {
    latest = validateLoaded(record);
    return latest;
  }

  function notification(record, reason) {
    return deepFreeze({
      reason,
      kernelRevision: record.kernelRevision,
      revision: record.document.revision,
      updatedAtMs: record.document.updatedAtMs,
      coordinationEpoch: record.coordination.coordinationEpoch,
      hasActiveOwner: isLeaseActive(record.coordination, currentTime()),
      document: publicDocument(record.document)
    });
  }

  function notify(record, reason) {
    if (!subscribers.size) return;
    const event = notification(record, reason);
    for (const listener of [...subscribers]) {
      try { listener(event); } catch (_) {}
    }
  }

  function publicSession(session) {
    return Object.freeze({
      sessionId: session.sessionId,
      runtimeId: session.runtimeId,
      documentToken: session.documentToken,
      tabId: session.tabId
    });
  }

  function createSession(principal, coordination) {
    const key = principalKey(principal);
    const existingId = sessionByPrincipal.get(key);
    const existing = existingId && sessions.get(existingId);
    const nextSessionId = existing
      ? existing.sessionId
      : requireText(makeId('requester-session'), 'requester-session-id');
    if (!existing && sessions.has(nextSessionId)) throw new Error('requester-session-id-collision');
    const value = Object.freeze({
      sessionId: nextSessionId,
      runtimeId: principal.runtimeId,
      documentToken: principal.documentToken,
      tabId: principal.tabId,
      coordinationEpoch: coordination.coordinationEpoch,
      disposition: coordination.disposition
    });
    sessions.set(value.sessionId, value);
    sessionByPrincipal.set(key, value.sessionId);
    return value;
  }

  function sessionReference(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('requester-session-required');
    }
    const sessionId = requireText(value.sessionId, 'requester-session-id');
    const principal = normalizePrincipal(value);
    const session = sessions.get(sessionId);
    if (!session || !samePrincipal(session, principal)) {
      throw new Error('requester-session-reconnect-required');
    }
    return session;
  }

  function forgetSession(session) {
    sessions.delete(session.sessionId);
    const key = principalKey(session);
    if (sessionByPrincipal.get(key) === session.sessionId) sessionByPrincipal.delete(key);
  }

  async function initialize() {
    return serialize(async () => {
      const outcome = await adapter.runExclusive(async current => {
        if (current) {
          const record = validateLoaded(current);
          return { next: null, result: { created: false, record } };
        }
        const record = newRecord();
        return { next: record, result: { created: true, record } };
      });
      const record = adopt(outcome.record || outcome.result.record);
      if (outcome.written) notify(record, 'authority-initialized');
      return Object.freeze({
        created: outcome.result.created,
        kernelRevision: record.kernelRevision,
        revision: record.document.revision
      });
    });
  }

  async function connect(request = {}) {
    return serialize(async () => {
      const principal = normalizePrincipal(request);
      const outcome = await adapter.runExclusive(async current => {
        const atMs = currentTime();
        const base = current ? validateLoaded(current) : newRecord(atMs);
        const connected = connectRuntime(base.coordination, {
          principal,
          nowMs: atMs,
          leaseDurationMs
        });
        const changed = connected.changed || !current;
        const record = connected.changed
          ? nextKernelRecord(base, { coordination: connected.coordination }, {
              nowMs: atMs,
              makeId
            })
          : base;
        return {
          next: changed ? record : null,
          result: {
            reason: connected.reason,
            record,
            atMs
          }
        };
      });
      const record = adopt(outcome.record || outcome.result.record);
      const coordination = publicCoordination(record.coordination, principal, outcome.result.atMs);
      const session = createSession(principal, coordination);
      if (outcome.written) notify(record, 'coordination-connect');
      return Object.freeze({
        session: publicSession(session),
        ...coordination,
        revision: record.document.revision,
        reason: outcome.result.reason
      });
    });
  }

  async function heartbeat(sessionInput) {
    return serialize(async () => {
      const session = sessionReference(sessionInput);
      const outcome = await adapter.runExclusive(async current => {
        const atMs = currentTime();
        if (!current) throw new Error('authority-record-missing');
        const base = validateLoaded(current);
        const currentOwner = ownerPrincipal(base.coordination);
        let coordinated;
        if (
          currentOwner &&
          samePrincipal(currentOwner, session) &&
          isLeaseActive(base.coordination, atMs)
        ) {
          coordinated = renewLease(base.coordination, {
            principal: session,
            nowMs: atMs,
            leaseDurationMs
          });
        } else {
          coordinated = connectRuntime(base.coordination, {
            principal: session,
            nowMs: atMs,
            leaseDurationMs
          });
        }
        const record = coordinated.changed
          ? nextKernelRecord(base, { coordination: coordinated.coordination }, {
              nowMs: atMs,
              makeId
            })
          : base;
        return {
          next: coordinated.changed ? record : null,
          result: { reason: coordinated.reason, record, atMs }
        };
      });
      const record = adopt(outcome.record || outcome.result.record);
      const coordination = publicCoordination(record.coordination, session, outcome.result.atMs);
      createSession(session, coordination);
      if (outcome.written) notify(record, 'coordination-heartbeat');
      return Object.freeze({
        ...coordination,
        revision: record.document.revision,
        reason: outcome.result.reason
      });
    });
  }

  async function disconnect(sessionInput) {
    return serialize(async () => {
      const session = sessionReference(sessionInput);
      const outcome = await adapter.runExclusive(async current => {
        const atMs = currentTime();
        if (!current) throw new Error('authority-record-missing');
        const base = validateLoaded(current);
        const ownsRecord = samePrincipal(ownerPrincipal(base.coordination), session);
        if (!ownsRecord || !isLeaseActive(base.coordination, atMs)) {
          return { next: null, result: { reason: ownsRecord ? 'LEASE_EXPIRED' : 'OBSERVER_DISCONNECTED', record: base, atMs } };
        }
        const released = releaseOwnership(base.coordination, {
          principal: session,
          nowMs: atMs
        });
        if (!released.changed) {
          throw new Error(`coordination-release-failed:${released.reason}`);
        }
        const record = nextKernelRecord(base, { coordination: released.coordination }, {
          nowMs: atMs,
          makeId
        });
        return { next: record, result: { reason: released.reason, record, atMs } };
      });
      const record = adopt(outcome.record || outcome.result.record);
      forgetSession(session);
      if (outcome.written) notify(record, 'coordination-disconnect');
      return Object.freeze({
        disconnected: true,
        reason: outcome.result.reason,
        revision: record.document.revision
      });
    });
  }

  async function read(sessionInput) {
    return serialize(async () => {
      const session = sessionReference(sessionInput);
      const outcome = await adapter.runExclusive(async current => {
        const atMs = currentTime();
        if (!current) throw new Error('authority-record-missing');
        const record = validateLoaded(current);
        return { next: null, result: { record, atMs } };
      });
      const record = adopt(outcome.record || outcome.result.record);
      const coordination = publicCoordination(record.coordination, session, outcome.result.atMs);
      createSession(session, coordination);
      return deepFreeze({
        ...coordination,
        revision: record.document.revision,
        document: publicDocument(record.document)
      });
    });
  }

  function normalizeReceiptState(document) {
    if (!document.commandReceipts || typeof document.commandReceipts !== 'object' || Array.isArray(document.commandReceipts)) {
      document.commandReceipts = {};
    }
    if (!Array.isArray(document.commandReceiptOrder)) document.commandReceiptOrder = [];
    document.commandReceiptOrder = document.commandReceiptOrder.filter((commandId, index, values) => (
      typeof commandId === 'string' &&
      values.indexOf(commandId) === index &&
      Object.prototype.hasOwnProperty.call(document.commandReceipts, commandId)
    ));
  }

  function appendReceipt(document, receipt) {
    normalizeReceiptState(document);
    if (hasOwn(document.commandReceipts, receipt.commandId)) {
      throw new Error('command-receipt-already-exists');
    }
    document.commandReceipts[receipt.commandId] = receipt;
    document.commandReceiptOrder.push(receipt.commandId);
    while (document.commandReceiptOrder.length > receiptLimit) {
      const expiredId = document.commandReceiptOrder.shift();
      delete document.commandReceipts[expiredId];
    }
  }

  async function command(sessionInput, commandEnvelope) {
    if (typeof applyCommand !== 'function') throw new Error('authority-command-handler-required');
    return serialize(async () => {
      const session = sessionReference(sessionInput);
      if (!commandEnvelope || typeof commandEnvelope !== 'object' || Array.isArray(commandEnvelope)) {
        throw new Error('authority-command-required');
      }
      const command = deepClone(commandEnvelope);
      const commandId = requireText(command.commandId, 'command-id');
      if (!isSafeCounter(command.expectedRevision)) throw new Error('command-expected-revision-invalid');
      const fingerprint = stableStringify(command);

      const outcome = await adapter.runExclusive(async current => {
        const atMs = currentTime();
        if (!current) throw new Error('authority-record-missing');
        const base = validateLoaded(current);
        const coordination = readCoordinationState(base.coordination);
        if (!isLeaseActive(coordination, atMs)) {
          throw new Error('coordination-owner-unavailable');
        }
        if (session.coordinationEpoch !== coordination.coordinationEpoch) {
          throw new Error('stale-requester-coordination-epoch');
        }
        const expectedDisposition = samePrincipal(ownerPrincipal(coordination), session)
          ? DISPOSITIONS.OWNER
          : DISPOSITIONS.OBSERVER_CONNECTED;
        if (session.disposition !== expectedDisposition) {
          throw new Error('stale-requester-disposition');
        }

        const prior = hasOwn(base.document.commandReceipts, commandId)
          ? base.document.commandReceipts[commandId]
          : null;
        if (prior) {
          if (prior.requestFingerprint !== fingerprint) throw new Error('command-id-conflict');
          return {
            next: null,
            result: {
              duplicate: true,
              revision: base.document.revision,
              commitId: prior.commitId,
              result: deepClone(prior.result),
              record: base
            }
          };
        }
        if (command.expectedRevision !== base.document.revision) throw new Error('stale-revision');

        const document = deepClone(base.document);
        const protectedMetadata = stableStringify({
          revision: document.revision,
          commitId: document.commitId,
          updatedAtMs: document.updatedAtMs,
          commitFence: document.commitFence,
          commandReceipts: document.commandReceipts,
          commandReceiptOrder: document.commandReceiptOrder
        });
        const writerPrincipal = ownerPrincipal(coordination);
        if (!writerPrincipal) throw new Error('coordination-owner-unavailable');
        const requester = Object.freeze({
          runtimeId: session.runtimeId,
          documentToken: session.documentToken,
          tabId: session.tabId
        });
        const owner = Object.freeze({
          runtimeId: writerPrincipal.runtimeId,
          documentToken: writerPrincipal.documentToken,
          tabId: writerPrincipal.tabId
        });
        const writer = Object.freeze({
          ...owner,
          coordinationEpoch: coordination.coordinationEpoch,
          fencingToken: coordination.fencingToken
        });
        const commandResult = await applyCommand(document, command, Object.freeze({
          requester,
          requesterDisposition: expectedDisposition,
          owner,
          writer,
          coordinationEpoch: coordination.coordinationEpoch,
          fencingToken: coordination.fencingToken
        }));
        if (protectedMetadata !== stableStringify({
          revision: document.revision,
          commitId: document.commitId,
          updatedAtMs: document.updatedAtMs,
          commitFence: document.commitFence,
          commandReceipts: document.commandReceipts,
          commandReceiptOrder: document.commandReceiptOrder
        })) {
          throw new Error('authority-command-mutated-protected-metadata');
        }
        if (document.revision === Number.MAX_SAFE_INTEGER) throw new Error('data-revision-exhausted');
        const nextRevision = document.revision + 1;
        const commitId = `data:${nextRevision}:${requireText(makeId('data-commit'), 'data-commit-id')}`;
        const publicResult = redactAuthorityMetadata(
          commandResult === undefined ? null : deepClone(commandResult)
        );
        document.revision = nextRevision;
        document.commitId = commitId;
        document.updatedAtMs = atMs;
        document.commitFence = {
          ownerRuntimeId: coordination.ownerRuntimeId,
          coordinationEpoch: coordination.coordinationEpoch,
          fencingToken: coordination.fencingToken
        };
        appendReceipt(document, {
          commandId,
          requestFingerprint: fingerprint,
          revision: nextRevision,
          commitId,
          committedAtMs: atMs,
          result: deepClone(publicResult)
        });
        validateDocument(document);
        const record = nextKernelRecord(base, { document }, { nowMs: atMs, makeId });
        return {
          next: record,
          result: {
            duplicate: false,
            revision: nextRevision,
            commitId,
            result: deepClone(publicResult),
            record
          }
        };
      });
      const record = adopt(outcome.record || outcome.result.record);
      if (outcome.written) notify(record, 'authoritative-command');
      return deepFreeze({
        duplicate: outcome.result.duplicate,
        revision: outcome.result.revision,
        commitId: outcome.result.commitId,
        coordinationEpoch: record.coordination.coordinationEpoch,
        result: deepClone(outcome.result.result)
      });
    });
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new Error('authority-subscriber-required');
    subscribers.add(listener);
    return () => subscribers.delete(listener);
  }

  return Object.freeze({
    initialize,
    connect,
    heartbeat,
    disconnect,
    read,
    command,
    subscribe
  });
}

module.exports = {
  AUTHORITY_SCHEMA_VERSION,
  DEFAULT_LEASE_MS,
  DEFAULT_RECEIPT_LIMIT,
  MAX_RECEIPT_LIMIT,
  stableStringify,
  redactAuthorityMetadata,
  validateAuthorityRecord,
  createAuthoritativeKernel
};
