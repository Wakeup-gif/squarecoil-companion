'use strict';

const {
  DOCUMENT_TOKEN_DATASET_KEY,
  isSupportedTopLevelContext,
  isConcreteDocumentToken
} = require('../core/document-eligibility');
const { BUILD_ID, CANDIDATE_FINGERPRINT } = require('../core/build-identity');
const {
  AUTHORITY_PROTOCOL_VERSION,
  AUTHORITY_CONTROL_MESSAGES,
  B2_SETTLEMENT_MODES,
  KERNEL_ONLY_DISPOSITION,
  createB2SettlementAcknowledgment
} = require('../extension/authority-protocol');
const { createAuthorityClient } = require('../extension/authority-client');
const { createTrustedTransitionCore } = require('./trusted-transition-core');
const { createThemeService } = require('../presentation/theme-service');
const { createCinematicBackground } = require('../presentation/cinematic-background');
const { createDashboardProfile } = require('../presentation/dashboard-profile');
const { createAnalyticsDashboard } = require('../presentation/analytics-dashboard');
const { createQuickFilePathsService } = require('../presentation/quick-file-paths');

const DEFAULTS = Object.freeze({ timerEnabled: true });
const BOOT_MESSAGE = 'SC_COMPANION_BOOT';
const ENABLE_MESSAGE = 'SC_COMPANION_SET_ENABLED';
const REVALIDATE_MESSAGE = 'SC_COMPANION_REVALIDATE';
const B5B_CLEAR_WALLPAPER_MESSAGE = 'SC_COMPANION_B5B_CLEAR_WALLPAPER';
const B5B_PERMISSION_CHANGED_MESSAGE = 'SC_COMPANION_B5B_PERMISSION_CHANGED';
const B5B_WALLPAPER_MESSAGE = 'SC_COMPANION_B5B_GET_WALLPAPER';
const B5B_ACK_MESSAGE = 'SC_COMPANION_B5B_ACK';
const POPUP_SUMMARY_MESSAGE = 'SC_COMPANION_GET_POPUP_SUMMARY';
const POPUP_GET_APPEARANCE_MESSAGE = 'SC_COMPANION_GET_APPEARANCE';
const POPUP_SET_APPEARANCE_MESSAGE = 'SC_COMPANION_SET_APPEARANCE';
const TRANSPORT_RETRY_DELAYS_MS = Object.freeze([250, 1000, 3000]);
const B2_SETTLEMENT_REFRESH_RESPONSE_BUDGET_MS = 15_000;
const PACKAGE_VERSION = String(chrome.runtime.getManifest().version || '0.0.0');
const AUTHORITY_HEALTH_KEY = '__squareCoilCompanionAuthorityHealth';

(function startContentController() {
  if (!isSupportedTopLevelContext(window)) return;

  let bootRequested = false;
  let responseEpoch = 0;
  let transportRetryAttempt = 0;
  let transportRetryTimer = null;
  let authorityClient = null;
  let authorityRuntimeInstanceId = null;
  let trustedCore = null;
  let themeService = null;
  let cinematicService = null;
  let designDashboardProfile = null;
  let analyticsService = null;
  let quickFilePathsService = null;
  let authorityCoreSync = Promise.resolve();
  let b2SettlementRefresh = null;
  let settingChangeQueue = Promise.resolve();

  function createDocumentToken() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
    return `document-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  }

  function ensureDocumentToken() {
    const root = document.documentElement;
    if (!root) return null;
    const existing = root.dataset[DOCUMENT_TOKEN_DATASET_KEY];
    if (isConcreteDocumentToken(existing)) return existing;
    const token = createDocumentToken();
    root.dataset[DOCUMENT_TOKEN_DATASET_KEY] = token;
    return token;
  }

  function setDataset(key, value) {
    const root = document.documentElement;
    if (!root) return;
    if (value === null || value === undefined || value === '') delete root.dataset[key];
    else root.dataset[key] = String(value);
  }

  function unavailableAuthoritySnapshot() {
    return {
      enabled: false,
      healthy: false,
      disposition: 'UNAVAILABLE',
      workerInstanceId: null,
      coordinationEpoch: null,
      coordinationRevision: null,
      leaseExpiry: null,
      revision: null,
      subscribed: false,
      lastSequence: 0,
      lastError: null,
      runtimeInstanceId: authorityRuntimeInstanceId,
      documentToken: document.documentElement?.dataset?.[DOCUMENT_TOKEN_DATASET_KEY] || null
    };
  }

  function authoritySnapshot() {
    return authorityClient ? authorityClient.snapshot() : unavailableAuthoritySnapshot();
  }

  function ensureThemeService() {
    if (themeService) return themeService;
    themeService = createThemeService({
      document,
      window,
      onChange: value => {
        setDataset('squarecoilCompanionTimerAppearance', value.timerAppearanceEffective);
        setDataset('squarecoilCompanionPanelFinish', value.panelFinishEffective);
        setDataset('squarecoilCompanionWebsiteTheme', value.websiteThemeEffective);
      }
    });
    return themeService;
  }

  function b5bRequestId(prefix) {
    const suffix = globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
      ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `${prefix}-${suffix}`;
  }

  async function sendB5B(type, details = {}) {
    const requestId = b5bRequestId('b5b');
    const response = await send({ type, requestId, ...details });
    if (response?.type !== B5B_ACK_MESSAGE || response?.requestId !== requestId ||
        response?.buildId !== BUILD_ID || response?.packageVersion !== PACKAGE_VERSION ||
        response?.candidateFingerprint !== CANDIDATE_FINGERPRINT) {
      return { ok: false, reason: 'b5b-acknowledgment-invalid' };
    }
    return response;
  }

  function ensureOptionalPresentation() {
    if (!cinematicService) cinematicService = createCinematicBackground({
      document,
      window,
      initialWallpaper: globalThis.__squareCoilCompanionPresentationBootstrap?.warmWallpaper?.(),
      onWarmSettled: () => globalThis.__squareCoilCompanionPresentationBootstrap?.releaseWarmWallpaper?.(),
      fetchWallpaper: request => sendB5B(B5B_WALLPAPER_MESSAGE, { websiteTheme: request?.websiteTheme }),
      onChange: value => setDataset('squarecoilCompanionCinematic', value.state)
    });
    if (!designDashboardProfile) designDashboardProfile = createDashboardProfile({ document, window });
    if (!quickFilePathsService) quickFilePathsService = createQuickFilePathsService({ document, window });
    if (!analyticsService) analyticsService = createAnalyticsDashboard({
      document,
      window,
      getSnapshot: view => {
        if (!trustedCore) throw new Error('analytics-source-unavailable');
        return trustedCore.analyticsSnapshot(view);
      },
      onDisable: () => {
        if (!trustedCore) throw new Error('analytics-source-unavailable');
        const preferences = trustedCore.snapshot().preferences;
        return trustedCore.preferenceCommand({ dashboardEnabled: false }, preferences.preferenceRevision);
      },
      onDataAction: async (action, contextId) => {
        const core = trustedCore;
        if (!core) throw new Error('analytics-source-unavailable');
        const type = action === 'archive' ? 'DATA_ARCHIVE_CONTEXT' : action === 'restore' ? 'DATA_RESTORE_ARCHIVED' : null;
        if (!type) throw new Error('analytics-action-unsupported');
        const plan = await core.stageDataAction(type, { contextId, ...(action === 'archive' ? { atMs: Date.now() } : {}) });
        // Any future destructive or otherwise confirmed command stays with the
        // existing Companion data-review flow. The dashboard never invents a token.
        if (trustedCore !== core || plan.blocked || plan.requiredConfirmations?.length) throw new Error('analytics-action-review-required');
        return core.commitDataAction(plan.planId, { confirmationTokens: [] });
      }
    });
    return Object.freeze({
      apply(preferences, basePresentation, timerHint) {
        let analytics;
        let dashboard;
        let quickFilePaths;
        try { dashboard = designDashboardProfile.apply(preferences, basePresentation, designDashboardSummary(timerHint)); }
        catch (_) { dashboard = { state: 'PARTIAL_SAFE', reason: 'presentation-unavailable', ownedLayerCount: 0 }; }
        try { analytics = analyticsService.apply(preferences, basePresentation, timerHint); }
        catch (_) { analytics = { state: 'UNAVAILABLE', reason: 'presentation-unavailable', ownedRootCount: 0 }; }
        try { quickFilePaths = quickFilePathsService.apply(preferences.quickFilePathsEnabled === true); }
        catch (_) { quickFilePaths = { state: 'UNAVAILABLE', reason: 'job-fields-unavailable', ownedRootCount: 0 }; }
        return Object.freeze({ cinematic: cinematicService.apply(preferences, basePresentation), dashboard, analytics, quickFilePaths });
      }
    });
  }

  function designDashboardSummary(timer) {
    if (!timer) return Object.freeze({ currentLabel: null, todayMs: 0, weekMs: 0, sessionMs: 0, recent: [] });
    const rows = Array.isArray(timer.contextRows) ? timer.contextRows : [];
    const current = rows.find(row => row.contextId === timer.currentContextId) || null;
    return Object.freeze({
      currentLabel: current?.label ? String(current.label).slice(0, 160) : null,
      todayMs: Number(timer.todayTotalMs) || 0,
      weekMs: Number(timer.weekTotalMs) || 0,
      sessionMs: Number(timer.running?.elapsedMs) || 0,
      recent: Object.freeze(rows.slice().sort((a, b) => Number(b.lastSeenAtMs || 0) - Number(a.lastSeenAtMs || 0))
        .slice(0, 3).map(row => Object.freeze({ label: String(row.label || '').slice(0, 160) })))
    });
  }

  function withPresentation(current) {
    if (!trustedCore || !current?.preferences) return { ...current, presentation: null };
    let presentation = null;
    try {
      const base = ensureThemeService().apply(current.preferences);
      presentation = { ...base, optional: ensureOptionalPresentation().apply(current.preferences, base, current.timer) };
    }
    catch (_) { presentation = null; }
    return { ...current, presentation };
  }

  function coreSnapshot(view = {}) {
    const current = trustedCore ? trustedCore.snapshot(view) : {
      initialized: false,
      disposed: false,
      blocked: false,
      status: 'unavailable',
      authorityOwner: false,
      revision: null,
      recoveryMode: null,
      preflight: null,
      bridge: null,
      timer: null,
      readModelError: null,
      preferences: null
    };
    return withPresentation(current);
  }

  function settlementAuthoritySnapshot(current = authoritySnapshot(), capturedAtMs = Date.now()) {
    return {
      enabled: current.enabled === true,
      healthy: current.healthy === true,
      subscribed: current.subscribed === true,
      errorFree: current.lastError == null,
      capturedAtMs,
      leaseExpiry: current.leaseExpiry,
      disposition: current.disposition || 'UNAVAILABLE',
      coordinationEpoch: current.coordinationEpoch,
      workerInstanceId: current.workerInstanceId,
      revision: current.revision
    };
  }

  function settlementCoreSnapshot(current = coreSnapshot()) {
    return {
      initialized: current.initialized === true,
      disposed: current.disposed === true,
      blocked: current.blocked === true,
      authorityOwner: current.authorityOwner === true,
      authorityTenure: current.authorityTenure ? {
        coordinationEpoch: current.authorityTenure.coordinationEpoch,
        workerInstanceId: current.authorityTenure.workerInstanceId
      } : null,
      status: current.status || 'unavailable',
      revision: current.revision,
      preflight: current.preflight ? {
        checked: current.preflight.checked === true,
        blocked: current.preflight.blocked === true,
        reason: current.preflight.reason || null,
        disposition: current.preflight.disposition || 'UNAVAILABLE',
        activityChanged: current.preflight.activityChanged === true,
        presentKeys: Array.isArray(current.preflight.presentKeys) ? [...current.preflight.presentKeys] : []
      } : null,
      bridge: current.bridge ? {
        initialized: current.bridge.initialized === true,
        active: current.bridge.active === true,
        owner: current.bridge.owner === true,
        disposed: current.bridge.disposed === true,
        capability: current.bridge.capability || 'UNAVAILABLE',
        listenersAttached: current.bridge.listenersAttached === true,
        verificationInFlight: current.bridge.verificationInFlight === true,
        requestCount: current.bridge.requestCount,
        ownerInitialObservationCompleted: current.bridge.ownerInitialObservationCompleted === true,
        authorityTenure: current.bridge.authorityTenure ? {
          coordinationEpoch: current.bridge.authorityTenure.coordinationEpoch,
          workerInstanceId: current.bridge.authorityTenure.workerInstanceId
        } : null,
        nativeMutationRequestCount: current.bridge.nativeMutationRequestCount,
        lastReason: current.bridge.lastReason || null,
        lastError: current.bridge.lastError || null
      } : null,
      readModelError: current.readModelError || null
    };
  }

  // This handle exists only in Chrome's isolated content world. The website's
  // MAIN world cannot read or invoke it. It exposes health and a reconnect
  // probe and bounded Timer actions, never a session or fencing identifier.
  Object.defineProperty(globalThis, AUTHORITY_HEALTH_KEY, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Object.freeze({
      snapshot: authoritySnapshot,
      revalidate: async () => {
        if (!authorityClient) throw new Error('authority-client-unavailable');
        await authorityClient.heartbeat();
        if (trustedCore) {
          await trustedCore.handleAuthoritySnapshot(authorityClient.snapshot());
          await trustedCore.verifyNow('isolated-health-revalidate');
        }
        return authorityClient.snapshot();
      },
      coreSnapshot,
      syncBridge: async () => {
        if (!trustedCore) throw new Error('trusted-transition-core-unavailable');
        return trustedCore.verifyNow('isolated-health-sync');
      },
      timerAction: async type => {
        if (!trustedCore) throw new Error('trusted-transition-core-unavailable');
        return trustedCore.userCommand(type);
      },
      preferenceAction: async (patch, expectedPreferenceRevision) => {
        if (!trustedCore) throw new Error('trusted-transition-core-unavailable');
        return trustedCore.preferenceCommand(patch, expectedPreferenceRevision);
      },
      clearCinematicBackground: async () => {
        const response = await sendB5B(B5B_CLEAR_WALLPAPER_MESSAGE);
        if (cinematicService) void cinematicService.refresh('background-cleared');
        return response;
      },
      initializePreferences: async legacyPreferences => {
        if (!trustedCore) throw new Error('trusted-transition-core-unavailable');
        return trustedCore.initializePreferences(legacyPreferences);
      },
      dataExport: (kind, values) => {
        if (!trustedCore) throw new Error('trusted-transition-core-unavailable');
        return trustedCore.dataExport(kind, values);
      },
      stageDataAction: async (type, values) => {
        if (!trustedCore) throw new Error('trusted-transition-core-unavailable');
        return trustedCore.stageDataAction(type, values);
      },
      commitDataAction: async (planId, values) => {
        if (!trustedCore) throw new Error('trusted-transition-core-unavailable');
        return trustedCore.commitDataAction(planId, values);
      },
      teardown: () => teardownAuthority({ controlled: true })
    })
  });

  function renderResult(result, enabled = true) {
    const classification = result?.classification || 'UNKNOWN';
    const healthState = result?.health?.state || null;
    const attention = Boolean(
      !result ||
      result?.ok === false ||
      result?.transportError ||
      result?.reloadRequired ||
      classification === 'DEGRADED_SAME_BUILD' ||
      classification === 'FAILED_SAME_BUILD' ||
      classification === 'VERSION_MISMATCH' ||
      classification === 'LEGACY_RUNTIME' ||
      classification === 'OWNERSHIP_CONFLICT' ||
      (healthState && !['READY', 'BOOTING', 'RECOVERING'].includes(healthState))
    );

    setDataset('squarecoilCompanionController', enabled ? (attention ? 'attention' : 'booted') : 'disabled');
    setDataset('squarecoilCompanionProbe', classification);
    setDataset('squarecoilCompanionReason', result?.health?.reason || result?.reason || null);
    setDataset('squarecoilCompanionReloadRequired', result?.reloadRequired ? 'true' : null);
  }

  function renderAuthority(snapshot, error = null) {
    const current = snapshot || authoritySnapshot();
    setDataset('squarecoilCompanionAuthority', current.healthy ? 'connected' : 'unavailable');
    // Detailed authority identity and failures remain inside the isolated-world
    // health handle; the website receives no worker, lease, or error details.
    void error;
  }

  function renderCore(snapshot, error = null) {
    const current = snapshot ? withPresentation(snapshot) : coreSnapshot();
    setDataset('squarecoilCompanionTrustedCore', current.blocked
      ? 'blocked'
      : current.initialized && !current.disposed
        ? 'partial'
        : 'unavailable');
    setDataset('squarecoilCompanionTrustedCoreReason', error
      ? String(error?.message || error)
      : current.status || null);
  }

  function synchronizeTrustedCore(authority) {
    const core = trustedCore;
    if (!core) return Promise.reject(new Error('settlement-trusted-core-unavailable'));
    const task = authorityCoreSync.then(() => {
      if (trustedCore !== core) throw new Error('settlement-trusted-core-replaced');
      return core.handleAuthoritySnapshot(authority);
    });
    authorityCoreSync = task.then(() => undefined, () => undefined);
    return task;
  }

  function requireCurrentSettlementRuntime(message, client, core) {
    if (authorityClient !== client || trustedCore !== core) {
      throw new Error('settlement-runtime-replaced');
    }
    if (authorityRuntimeInstanceId !== message.runtimeInstanceId) {
      throw new Error('settlement-runtime-generation-changed');
    }
    const documentToken = document.documentElement?.dataset?.[DOCUMENT_TOKEN_DATASET_KEY] || null;
    if (documentToken !== message.documentToken) {
      throw new Error('settlement-document-changed');
    }
    const authority = client.snapshot();
    if (
      authority.runtimeInstanceId !== message.runtimeInstanceId ||
      authority.documentToken !== message.documentToken
    ) {
      throw new Error('settlement-client-identity-changed');
    }
    if (authority.workerInstanceId !== message.workerInstanceId) {
      throw new Error('settlement-worker-generation-changed');
    }
    return { authority, core: core.snapshot() };
  }

  function sharedB2SettlementRefresh(message, client, core) {
    if (
      b2SettlementRefresh &&
      b2SettlementRefresh.client === client &&
      b2SettlementRefresh.core === core &&
      b2SettlementRefresh.runtimeInstanceId === message.runtimeInstanceId &&
      b2SettlementRefresh.workerInstanceId === message.workerInstanceId &&
      b2SettlementRefresh.documentToken === message.documentToken
    ) return b2SettlementRefresh.promise;

    const refresh = {
      client,
      core,
      runtimeInstanceId: message.runtimeInstanceId,
      workerInstanceId: message.workerInstanceId,
      documentToken: message.documentToken,
      promise: null
    };
    const work = (async () => {
      const connected = await client.ensure();
      requireCurrentSettlementRuntime(message, client, core);
      await core.settle(connected);
      requireCurrentSettlementRuntime(message, client, core);
    })();
    refresh.promise = work.finally(() => {
      if (b2SettlementRefresh === refresh) b2SettlementRefresh = null;
    });
    b2SettlementRefresh = refresh;
    return refresh.promise;
  }

  function respondToB2Settlement(message, sendResponse) {
    const client = authorityClient;
    const core = trustedCore;
    if (!client || !core) {
      sendResponse({ ok: false, reason: 'settlement-runtime-unavailable' });
      return false;
    }

    if (message.settlementMode === B2_SETTLEMENT_MODES.CONFIRM) {
      if (b2SettlementRefresh) {
        sendResponse({ ok: false, reason: 'settlement-refresh-in-progress' });
        return false;
      }
      try {
        const current = requireCurrentSettlementRuntime(message, client, core);
        const capturedAtMs = Date.now();
        sendResponse(createB2SettlementAcknowledgment(
          message,
          settlementAuthoritySnapshot(current.authority, capturedAtMs),
          settlementCoreSnapshot(current.core)
        ));
      } catch (error) {
        sendResponse({
          ok: false,
          reason: String(error?.message || error || 'settlement-confirmation-failed')
        });
      }
      return false;
    }

    let responded = false;
    let timeoutId = null;
    const respondOnce = value => {
      if (responded) return false;
      responded = true;
      if (timeoutId !== null) clearTimeout(timeoutId);
      sendResponse(value);
      return true;
    };
    const refresh = sharedB2SettlementRefresh(message, client, core);
    timeoutId = setTimeout(() => {
      respondOnce({ ok: false, reason: 'settlement-refresh-in-progress' });
    }, B2_SETTLEMENT_REFRESH_RESPONSE_BUDGET_MS);
    refresh.then(() => {
      if (responded) return;
      const current = requireCurrentSettlementRuntime(message, client, core);
      const capturedAtMs = Date.now();
      respondOnce(createB2SettlementAcknowledgment(
        message,
        settlementAuthoritySnapshot(current.authority, capturedAtMs),
        settlementCoreSnapshot(current.core)
      ));
    }, error => {
      respondOnce({
        ok: false,
        reason: String(error?.message || error || 'settlement-authority-refresh-failed')
      });
    });
    return true;
  }

  function effectiveEnabled(result, fallback) {
    if (typeof result?.enabled === 'boolean') return result.enabled;
    if (result?.health?.mode === 'ENABLED') return true;
    if (result?.health?.mode === 'DISABLED') return false;
    return Boolean(fallback);
  }

  function clearTransportRetry(resetAttempt = true) {
    if (transportRetryTimer !== null) clearTimeout(transportRetryTimer);
    transportRetryTimer = null;
    if (resetAttempt) transportRetryAttempt = 0;
  }

  function scheduleTransportRetry(message, enabled, expectedEpoch) {
    if (transportRetryTimer !== null || transportRetryAttempt >= TRANSPORT_RETRY_DELAYS_MS.length) return;
    const delay = TRANSPORT_RETRY_DELAYS_MS[transportRetryAttempt];
    transportRetryAttempt += 1;
    transportRetryTimer = setTimeout(() => {
      transportRetryTimer = null;
      if (expectedEpoch !== responseEpoch) return;
      const epoch = ++responseEpoch;
      send(message).then(result => {
        handleResult(epoch, result, enabled, message);
      }).catch(() => {});
    }, delay);
  }

  function handleResult(epoch, result, fallbackEnabled, retryMessage) {
    if (epoch !== responseEpoch) return false;
    const enabled = effectiveEnabled(result, fallbackEnabled);
    setDataset('squarecoilCompanionEnabled', enabled ? 'true' : 'false');
    renderResult(result, enabled);
    if (!result || result.transportError === true || result.classification === 'TRANSPORT_ERROR') {
      bootRequested = false;
      scheduleTransportRetry(retryMessage, enabled, epoch);
      return true;
    }
    clearTransportRetry();
    bootRequested = enabled && Boolean(result.ok || result.reloadRequired);
    return true;
  }

  async function send(message) {
    const documentToken = ensureDocumentToken();
    if (!documentToken) return null;
    try {
      return await chrome.runtime.sendMessage({
        ...message,
        documentToken,
        buildId: BUILD_ID,
        packageVersion: PACKAGE_VERSION,
        candidateFingerprint: CANDIDATE_FINGERPRINT
      });
    } catch (error) {
      return {
        ok: false,
        classification: 'TRANSPORT_ERROR',
        reason: String(error?.message || error),
        transportError: true
      };
    }
  }

  function runtimeIdentityFromResult(result) {
    const value = String(result?.health?.runtimeInstanceId || '');
    return value.length >= 8 && value.length <= 200 ? value : null;
  }

  function kernelAdvertisedBy(result) {
    return result?.health?.readiness?.coordinationDisposition === KERNEL_ONLY_DISPOSITION ||
      result?.health?.authority?.kernelTransportAvailable === true;
  }

  async function ensureAuthority(result) {
    if (!kernelAdvertisedBy(result)) throw new Error('authority-kernel-not-advertised');
    const runtimeInstanceId = runtimeIdentityFromResult(result);
    const documentToken = ensureDocumentToken();
    if (!runtimeInstanceId || !documentToken) throw new Error('authority-runtime-identity-unavailable');

    const authorityHealth = authorityClient ? authorityClient.snapshot() : null;
    if (
      authorityClient &&
      (authorityRuntimeInstanceId !== runtimeInstanceId || authorityHealth?.enabled !== true)
    ) {
      // A new generation, or a same-generation client already fenced for
      // teardown, must finish exact cleanup before authority is reacquired.
      if (trustedCore) await trustedCore.teardown();
      trustedCore = null;
      await authorityClient.teardown();
      authorityClient = null;
      authorityRuntimeInstanceId = null;
    }
    if (!authorityClient) {
      authorityRuntimeInstanceId = runtimeInstanceId;
      authorityClient = createAuthorityClient({
        runtimeInstanceId,
        documentToken,
        send,
        runtimeOnMessage: chrome.runtime.onMessage,
        onHealthChange: snapshot => {
          renderAuthority(snapshot);
          if (trustedCore) {
            synchronizeTrustedCore(snapshot)
              .then(renderCore, error => renderCore(coreSnapshot(), error));
          }
        }
      });
    }
    const connected = await authorityClient.ensure();
    ensureThemeService();
    if (!trustedCore) {
      trustedCore = createTrustedTransitionCore({
        authorityClient,
        legacyStorage: {
          getItem(key) { return window.localStorage.getItem(key); }
        },
        bridgeEnvironment: {
          document,
          window,
          fetch: (...args) => fetch(...args),
          timers: globalThis
        },
        appVersion: PACKAGE_VERSION,
        onStatusChange: renderCore
      });
    }
    await trustedCore.ensure(connected);
    renderAuthority(authorityClient.snapshot());
    renderCore(trustedCore.snapshot());
    return connected;
  }

  async function teardownAuthority(options = {}) {
    let controlledError = null;
    if (trustedCore) {
      const core = trustedCore;
      if (options.controlled === true) {
        try { await core.prepareControlledTeardown(); }
        catch (error) { controlledError = error; }
      }
      await core.teardown();
      if (trustedCore === core) trustedCore = null;
      renderCore(coreSnapshot());
    }
    if (themeService) themeService.teardown();
    themeService = null;
    if (cinematicService) cinematicService.teardown();
    cinematicService = null;
    if (designDashboardProfile) designDashboardProfile.teardown();
    designDashboardProfile = null;
    if (analyticsService) analyticsService.teardown();
    analyticsService = null;
    if (quickFilePathsService) quickFilePathsService.teardown();
    quickFilePathsService = null;
    setDataset('squarecoilCompanionTimerAppearance', null);
    setDataset('squarecoilCompanionPanelFinish', null);
    setDataset('squarecoilCompanionWebsiteTheme', null);
    setDataset('squarecoilCompanionCinematic', null);
    if (!authorityClient) {
      setDataset('squarecoilCompanionAuthorityCleanup', null);
      return { disconnected: true, absent: true };
    }
    const client = authorityClient;
    try {
      const response = await client.teardown();
      if (authorityClient === client) {
        authorityClient = null;
        authorityRuntimeInstanceId = null;
      }
      setDataset('squarecoilCompanionAuthorityCleanup', null);
      renderAuthority(unavailableAuthoritySnapshot());
      if (controlledError) {
        setDataset('squarecoilCompanionTrustedCoreReason', 'controlled-checkpoint-failed');
      }
      return {
        ...response,
        controlledCheckpointed: options.controlled === true ? !controlledError : undefined
      };
    } catch (error) {
      setDataset('squarecoilCompanionAuthorityCleanup', 'incomplete');
      throw error;
    }
  }

  async function prepareDisableAndTeardownAuthority() {
    if (trustedCore) {
      await trustedCore.prepareDisable();
    }
    return teardownAuthority();
  }

  function boundedDuration(value) {
    const duration = Number(value);
    return Number.isSafeInteger(duration) && duration >= 0 ? duration : 0;
  }

  function popupSummary() {
    const current = trustedCore ? trustedCore.snapshot({ historyLimit: 3 }) : null;
    const timer = current?.timer || null;
    if (!timer) return Object.freeze({ ok: false, status: 'SETUP_REQUIRED', current: null, recent: [] });
    const rows = Array.isArray(timer.contextRows) ? timer.contextRows : [];
    const active = rows.find(row => row.contextId === timer.currentContextId) || null;
    const recent = rows.filter(row => row && typeof row.label === 'string').slice().sort((left, right) =>
      Number(right.lastSeenAtMs || 0) - Number(left.lastSeenAtMs || 0)).slice(0, 3).map(row => Object.freeze({
        label: String(row.label).slice(0, 160),
        status: String(row.status || 'NOT_RUNNING').slice(0, 48),
        todayMs: boundedDuration(row.todayMs),
        totalMs: boundedDuration(row.totalMs)
      }));
    return Object.freeze({
      ok: true,
      status: current.blocked ? 'NEEDS_ATTENTION'
        : timer.nativeDisposition === 'SQUARECOIL_STATE_UNKNOWN' ? 'CLOCK_UNDETECTED'
          : active && timer.running ? 'WORKING' : 'READY',
      current: active ? Object.freeze({
        label: String(active.label || 'Current work').slice(0, 160),
        status: String(active.status || 'NOT_RUNNING').slice(0, 48),
        todayMs: boundedDuration(active.todayMs),
        totalMs: boundedDuration(active.totalMs),
        sessionMs: boundedDuration(timer.running?.elapsedMs)
      }) : null,
      todayMs: boundedDuration(timer.todayTotalMs),
      weekMs: boundedDuration(timer.weekTotalMs),
      recent: Object.freeze(recent)
    });
  }

  function onAuthorityControl(message, sender, sendResponse) {
    if ([POPUP_GET_APPEARANCE_MESSAGE, POPUP_SET_APPEARANCE_MESSAGE].includes(message?.type)) {
      if (sender?.id !== chrome.runtime.id) {
        sendResponse({ ok: false, reason: 'extension-sender-required' });
        return false;
      }
      const appearance = async () => {
        if (!trustedCore) return { ok: false, reason: 'companion-not-ready' };
        if (message.type === POPUP_SET_APPEARANCE_MESSAGE) {
          const patch = message.patch;
          const keys = patch && typeof patch === 'object' && !Array.isArray(patch) ? Object.keys(patch) : [];
          if (keys.length !== 1 || !['websiteTheme', 'cinematicBackground'].includes(keys[0]) ||
              !Number.isSafeInteger(message.expectedPreferenceRevision)) {
            return { ok: false, reason: 'appearance-command-invalid' };
          }
          await trustedCore.preferenceCommand(patch, message.expectedPreferenceRevision);
        }
        const current = trustedCore.snapshot();
        const stored = await chrome.storage.local.get({ companionPanelVisible: true });
        return { ok: true, preferences: {
          websiteTheme: current.preferences?.websiteTheme || 'ORIGINAL',
          cinematicBackground: current.preferences?.cinematicBackground || 'NONE',
          preferenceRevision: current.preferences?.preferenceRevision ?? 0
        }, panelVisible: stored.companionPanelVisible !== false };
      };
      appearance().then(sendResponse, error => sendResponse({ ok: false, reason: String(error?.message || error) }));
      return true;
    }
    if (message?.type === B5B_PERMISSION_CHANGED_MESSAGE) {
      if (sender?.id && sender.id !== chrome.runtime.id) {
        sendResponse({ ok: false, reason: 'extension-sender-required' });
        return false;
      }
      if (cinematicService) void cinematicService.refresh('permission-granted-popup');
      sendResponse({ ok: true });
      return false;
    }
    if (message?.type === POPUP_SUMMARY_MESSAGE) {
      if (sender?.id && sender.id !== chrome.runtime.id) {
        sendResponse({ ok: false, status: 'UNAVAILABLE', reason: 'extension-sender-required' });
        return false;
      }
      sendResponse(popupSummary());
      return false;
    }
    if (![AUTHORITY_CONTROL_MESSAGES.PREPARE_DISABLE, AUTHORITY_CONTROL_MESSAGES.GET_B2_SETTLEMENT].includes(message?.type)) return undefined;
    const documentToken = ensureDocumentToken();
    if (
      message.protocolVersion !== AUTHORITY_PROTOCOL_VERSION ||
      message.documentToken !== documentToken ||
      (message.runtimeInstanceId && authorityRuntimeInstanceId && message.runtimeInstanceId !== authorityRuntimeInstanceId)
    ) {
      sendResponse({
        ok: false,
        disconnected: false,
        reason: 'authority-control-identity-mismatch',
        protocolVersion: AUTHORITY_PROTOCOL_VERSION,
        documentToken,
        runtimeInstanceId: authorityRuntimeInstanceId
      });
      return false;
    }
    if (message.type === AUTHORITY_CONTROL_MESSAGES.GET_B2_SETTLEMENT) {
      if (
        message.runtimeInstanceId !== authorityRuntimeInstanceId ||
        typeof message.workerInstanceId !== 'string' ||
        message.workerInstanceId.length < 8 ||
        typeof message.settlementId !== 'string' ||
        message.settlementId.length < 8 ||
        !Object.values(B2_SETTLEMENT_MODES).includes(message.settlementMode)
      ) {
        sendResponse({ ok: false, reason: 'settlement-control-identity-invalid' });
        return false;
      }
      return respondToB2Settlement(message, sendResponse);
    }
    prepareDisableAndTeardownAuthority().then(response => sendResponse({
      ok: true,
      disconnected: response?.disconnected === true,
      protocolVersion: AUTHORITY_PROTOCOL_VERSION,
      documentToken,
      runtimeInstanceId: message.runtimeInstanceId || authorityRuntimeInstanceId
    }), error => sendResponse({
      ok: false,
      disconnected: false,
      reason: String(error?.message || error),
      protocolVersion: AUTHORITY_PROTOCOL_VERSION,
      documentToken,
      runtimeInstanceId: authorityRuntimeInstanceId || message.runtimeInstanceId
    }));
    return true;
  }

  if (chrome.runtime.onMessage && typeof chrome.runtime.onMessage.addListener === 'function') {
    chrome.runtime.onMessage.addListener(onAuthorityControl);
  }

  const retirementObserver = new MutationObserver(() => {
    const reason = document.documentElement?.dataset?.squarecoilCompanionReloadRequired;
    if (!['runtime-ownership-lost', 'ownership-conflict'].includes(reason)) return;
    teardownAuthority().catch(error => renderAuthority(authoritySnapshot(), error));
  });
  retirementObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-squarecoil-companion-reload-required']
  });

  async function syncEnabled() {
    clearTransportRetry();
    const epoch = ++responseEpoch;
    try {
      const settings = await chrome.storage.local.get(DEFAULTS);
      if (epoch !== responseEpoch) return;
      const enabled = settings.timerEnabled !== false;
      setDataset('squarecoilCompanionEnabled', enabled ? 'true' : 'false');
      if (!enabled) {
        bootRequested = false;
        const result = await send({ type: BOOT_MESSAGE });
        handleResult(epoch, result, false, { type: BOOT_MESSAGE });
        return;
      }

      if (bootRequested) return;
      bootRequested = true;
      const result = await send({ type: BOOT_MESSAGE });
      handleResult(epoch, result, true, { type: BOOT_MESSAGE });
      if (epoch === responseEpoch && result?.ok === true) {
        try { await ensureAuthority(result); }
        catch (error) { renderAuthority(authoritySnapshot(), error); }
      }
    } catch (error) {
      if (epoch !== responseEpoch) return;
      bootRequested = false;
      setDataset('squarecoilCompanionController', 'error');
      setDataset('squarecoilCompanionControllerReason', String(error?.message || error));
    }
  }

  function scheduleBoot() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { syncEnabled().catch(() => {}); }, { once: true });
    } else {
      queueMicrotask(() => { syncEnabled().catch(() => {}); });
    }
  }

  function queueSettingChange(task) {
    const run = settingChangeQueue.then(task, task);
    settingChangeQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.timerEnabled) return;
    clearTransportRetry();
    const enabled = changes.timerEnabled.newValue !== false;
    setDataset('squarecoilCompanionEnabled', enabled ? 'true' : 'false');
    bootRequested = enabled;
    const epoch = ++responseEpoch;
    const message = { type: ENABLE_MESSAGE, enabled };
    queueSettingChange(async () => {
      if (epoch !== responseEpoch) return;
      if (!enabled) {
        try { await prepareDisableAndTeardownAuthority(); }
        catch (error) {
          renderAuthority(authoritySnapshot(), error);
          bootRequested = true;
          return;
        }
      }
      if (epoch !== responseEpoch) return;
      const result = await send(message);
      handleResult(epoch, result, enabled, message);
      if (enabled && epoch === responseEpoch && result?.ok === true) {
        try { await ensureAuthority(result); }
        catch (error) { renderAuthority(authoritySnapshot(), error); }
      }
    }).catch(() => {
      if (enabled) bootRequested = false;
    });
  });

  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    clearTransportRetry();
    const epoch = ++responseEpoch;
    const message = { type: REVALIDATE_MESSAGE };
    send(message).then(result => {
      handleResult(epoch, result, document.documentElement?.dataset?.squarecoilCompanionEnabled !== 'false', message);
      if (result?.ok === true) ensureAuthority(result).catch(error => renderAuthority(authoritySnapshot(), error));
    }).catch(() => {});
  });

  window.addEventListener('pagehide', event => {
    if (event.persisted === true) return;
    retirementObserver.disconnect();
    teardownAuthority({ controlled: true }).catch(error => renderAuthority(authoritySnapshot(), error));
  });

  scheduleBoot();
})();
