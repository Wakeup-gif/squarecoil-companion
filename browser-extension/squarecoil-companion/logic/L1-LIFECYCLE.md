# SquareCoil Companion Rebuild
## Logic Stage L1: Application Lifecycle and Browser Boot

**Status:** Settled  
**Logic stage:** L1  
**Depends on:** `logic/L0-INVARIANTS.md`  
**Framework authority:** `docs/REBUILD-MASTER-PLAN.md`  
**Purpose:** Define exactly when the Companion runtime exists, when it is healthy, how boot/recovery/teardown work, and how duplicate or stale runtimes are prevented.

---

# 1. Scope

L1 owns:

- application boot and eligibility;
- lifecycle state;
- runtime identity/ownership;
- readiness and health;
- duplicate prevention;
- stale/orphan root handling;
- recovery and retry limits;
- teardown;
- extension/service-worker restart;
- page reload/navigation/BFCache;
- version mismatch and legacy-runtime coexistence;
- disable/re-enable lifecycle;
- Chrome/Edge lifecycle parity.

L1 does not define Timer State schema, Ledger calculations, raw SquareCoil interpretation, Pause/Resume transitions, archive/CSV behavior, or final visual design.

---

# 2. Ownership Model

One supported top-level SquareCoil document has one Lifecycle Coordinator.

Conceptually:

```text
Extension Shell / Controller
          ↓
Lifecycle Coordinator
          ↓
Companion Runtime Instance
          ├── Core UI owner
          ├── Persistence adapter
          ├── SquareCoil Bridge
          └── Feature registry
```

The extension service worker may restart at any time. Service-worker memory is not authoritative proof that a page is booted.

The page Lifecycle Coordinator owns:

- lifecycle state;
- runtime identity;
- boot idempotency;
- readiness evaluation;
- root ownership;
- component health;
- recovery;
- teardown;
- diagnostics.

No feature creates a competing lifecycle.

---

# 3. Runtime Identity and Teardown Lock

Each boot generation has a unique Runtime Instance ID.

DOM element IDs do not prove runtime ownership.

The Lifecycle Coordinator owns a Teardown Lock.

While teardown is in progress:

- no replacement runtime starts;
- new boot requests wait for teardown outcome;
- features cannot reattach listeners/observers/roots;
- lifecycle cannot report READY.

Successful teardown returns to `UNINITIALIZED`.

Incomplete safety-critical teardown results in `FAILED` and may require reload. A new runtime is never stacked on known incomplete teardown.

---

# 4. Canonical Lifecycle States

```text
UNINITIALIZED
BOOTING
READY
DEGRADED
RECOVERING
FAILED
```

## UNINITIALIZED

No owned runtime currently operates in the document.

Valid reasons include not-started, user-disabled, unsupported-document, teardown-complete.

## BOOTING

One boot generation is establishing ownership/resources.

A repeated boot request joins that generation.

No READY result is published until the full readiness contract passes.

## READY

Runtime ownership, interaction, persistence, Bridge initialization, core features, teardown ownership, and duplicate-accrual safety are healthy enough for normal operation.

READY does **not** mean a job is currently running.

## DEGRADED

A core capability is impaired but the runtime still exists.

Examples: Bridge unavailable, persistence unavailable, core UI unavailable, duplicate-accrual coordination unsafe.

Theme/logo/Glass/Support failure alone is not DEGRADED.

## RECOVERING

One bounded recovery episode is actively trying to return to READY.

Recovery cannot create a competing runtime or fabricate SquareCoil state.

## FAILED

The current boot/recovery episode cannot safely establish normal operation.

FAILED does not erase historical data.

A new attempt requires explicit safe Retry, reload/new document, or another allowed fresh boot after safe teardown.

---

# 5. Application Mode vs Lifecycle

Application enablement is separate from lifecycle health.

```text
Mode = ENABLED | DISABLED
Lifecycle = UNINITIALIZED | BOOTING | READY | DEGRADED | RECOVERING | FAILED
```

When disabled:

```text
Mode = DISABLED
Lifecycle = UNINITIALIZED
Reason = user-disabled
```

No runtime is injected just to represent disabled state.

---

# 6. READY Contract

READY requires **all** of the following.

## R1 One lifecycle owner

Exactly one current Lifecycle Coordinator owns the document.

## R2 Valid runtime identity

Current runtime has a valid Runtime Instance ID and build/version identity.

## R3 Exactly one owned timer root

Exactly one active timer root is owned by the current Runtime Instance ID.

A matching DOM ID without ownership evidence does not satisfy readiness.

## R4 Core interaction readiness

The root's interaction controller is bound and passes a non-destructive readiness check.

This explicitly prevents the historical visible-but-dead widget from being considered healthy.

## R5 Persistence available

The authoritative state/history persistence layer is available for safe normal reads/writes.

## R6 SquareCoil Bridge initialized

Bridge observation mechanisms are initialized and at least one initial observation attempt has completed.

A truthful `state-unknown` result can still be healthy Bridge operation. Bridge failure is different from unknown current state.

## R7 Core feature registry initialized

All features marked core-required for the current build are registered. Timer/state/persistence/UI routing/Bridge integration are core-required.

## R8 Teardown ownership registered

An idempotent teardown path is registered before READY.

## R9 Positive accrual-ownership result

The coordination layer positively confirms one-writer safety:

```text
OWNER
or
OBSERVER_CONNECTED
```

READY cannot rely only on absence of detected conflict.

---

# 7. READY Does Not Require Running Work

These are all valid READY combinations:

```text
READY + no SquareCoil Context
READY + clocked out
READY + known Context
READY + General Context
READY + Pending
READY + Local Pause
READY + selected inactive historical Context
```

Lifecycle health and timer status are separate dimensions.

---

# 8. Boot Eligibility and Sequence

Normal boot requires:

1. supported top-level SquareCoil document;
2. Companion enabled;
3. extension controller available;
4. minimum usable DOM phase.

Do not boot in unsupported iframes.

Canonical behavior sequence:

```text
1. eligibility check
2. probe lifecycle owner
3. resolve existing-runtime condition
4. establish one boot generation
5. establish Runtime Instance ID
6. initialize persistence
7. establish owned root + interaction controller
8. initialize core feature registry
9. initialize SquareCoil Bridge
10. complete initial SquareCoil observation attempt
11. run READY assertions
12. READY or bounded recovery/failure
```

Implementation may reorder independent internals only if dependencies and readiness semantics remain unchanged.

---

# 9. Existing Runtime Probe

Probe lifecycle ownership, not DOM presence.

Canonical outcomes:

```text
NONE
HEALTHY_SAME_BUILD
BOOTING_SAME_BUILD
DEGRADED_SAME_BUILD
RECOVERING_SAME_BUILD
FAILED_SAME_BUILD
VERSION_MISMATCH
LEGACY_RUNTIME
OWNERSHIP_CONFLICT
ORPHAN_ROOT_ONLY
```

Behavior:

- `NONE` -> normal boot;
- `HEALTHY_SAME_BUILD` -> reuse current runtime;
- `BOOTING/RECOVERING` -> join current episode;
- `DEGRADED` -> request/join recovery;
- `FAILED` -> do not stack a runtime;
- `ORPHAN_ROOT_ONLY` -> remove only when clearly orphaned, then boot;
- `OWNERSHIP_CONFLICT` -> do not guess/delete a plausible owner; fail safely and require reload.

Root presence never proves health.

---

# 10. Build / Version / Legacy Runtime Rules

A live document must not run mixed Companion builds.

If an existing rebuilt runtime version differs from the installed extension:

- do not partially hot-replace modules;
- mark reload-required;
- full page refresh/new document is the first-release version transition boundary.

A legacy v0.7.x runtime cannot coexist with the rebuilt runtime because legacy teardown ownership is not provable.

Detection result:

```text
Lifecycle = FAILED
Diagnostic = legacy-runtime-reload-required
Action = Reload SquareCoil page
```

Do not assume deleting the old visible root removes legacy listeners/timers.

---

# 11. Root Rules

The current Runtime Instance owns at most one timer root.

## Clearly orphan extra root

Remove the orphan, preserve current owned root, record diagnostic, and return/recover to READY if the contract passes.

## Ambiguous ownership

Do not blindly remove roots. Fail with ownership conflict and require reload.

## Owned root removed unexpectedly

Enter DEGRADED. Recovery may recreate the UI/root and interaction controller only, without duplicating healthy state/Bridge resources.

---

# 12. Boot Idempotency

| Current | Repeated boot request |
|---|---|
| UNINITIALIZED | start one BOOTING generation |
| BOOTING | join existing boot |
| READY | return current health/instance |
| DEGRADED | request/join recovery |
| RECOVERING | join recovery |
| FAILED | no stacking; explicit safe Retry/reload required |

No state permits `inject another runtime and see what happens`.

---

# 13. Recovery Classification

```text
RECOVERABLE_IN_DOCUMENT
RELOAD_REQUIRED
NONCRITICAL_FEATURE_FAILURE
```

Recoverable examples:

- owned root removed;
- known interaction controller failure;
- recoverable Bridge/persistence adapter initialization failure;
- core feature initialization failure with unambiguous ownership.

Reload-required examples:

- legacy runtime;
- build mismatch;
- ambiguous multiple owners;
- incomplete safety-critical teardown.

Noncritical examples:

- custom logo;
- Glass;
- Website Theme presentation;
- Support/Developer Support content.

---

# 14. Bounded Recovery

One recovery episode allows at most **3 automatic attempts**.

Default retry schedule is approximately:

```text
250 ms
1 second
3 seconds
```

Exact delays are configurable implementation policy; the three-attempt bounded rule is behavioral.

Attempts join one episode and never run in parallel.

After exhaustion:

```text
RECOVERING -> FAILED
reason = recovery-exhausted
```

Explicit user Retry may start a new bounded episode only when the cause is safe for in-document retry.

---

# 15. Recovery Safety Rules

During recovery:

1. never fabricate SquareCoil state;
2. never create a second Timer State owner;
3. never clear history to recover;
4. never silently reset preferences;
5. never replace a live owned root just because it looks stale;
6. never remove ambiguous resources without ownership proof;
7. reinitialize only failed/invalid resources when safe;
8. full runtime recreation requires successful teardown first;
9. if teardown safety cannot be proven, require reload.

---

# 16. Failure-Type Lifecycle Behavior

## UI-only core failure

DEGRADED and recover UI. State/Bridge ownership is not discarded merely because presentation disappeared.

## Persistence failure

DEGRADED immediately. Do not claim normal durable success. L2/L4 control safe accrual disposition.

## Bridge failure

DEGRADED, no inferred clock changes, bounded Bridge recovery. A healthy Bridge reporting unknown is not the same as Bridge failure.

## Duplicate-accrual safety failure

If one-writer safety cannot be proven, timing cannot continue under known duplicate ownership. DEGRADED or FAILED depending on recoverability.

---

# 17. Recovery Checkpoint Lifecycle

Unexpected prior termination:

- checkpoint may expose prior evidence to L2/L3/L4;
- lifecycle never directly reactivates old Context;
- current SquareCoil must be observed;
- uncertain gaps are not invented.

Clean teardown records a clean disposition.

Checkpoint failure is handled according to persistence safety. Checkpoint metadata is recovery evidence, not live truth.

---

# 18. Teardown Contract

Teardown is idempotent.

It releases, where owned:

- timer root/styles;
- app/document/window listeners;
- MutationObservers;
- intervals/timeouts;
- BroadcastChannel/cross-tab handles;
- SquareCoil observation hooks;
- UI controller;
- feature subscriptions;
- lifecycle owner handle.

Before teardown may be called clean, the state layer must establish a safe persistence/checkpoint disposition for accepted durable changes.

Teardown never erases history/preferences.

Successful result:

```text
Lifecycle = UNINITIALIZED
reason = teardown-complete
```

Incomplete safety-critical teardown:

```text
Lifecycle = FAILED
reason = teardown-incomplete
recommendedAction = reload-page
```

---

# 19. Page / Browser Lifecycle

## Full reload / new document

Creates a fresh lifecycle and Runtime Instance ID. Durable state/checkpoint may inform later reconciliation.

## Same-document/AJAX updates

Do not restart lifecycle merely because SquareCoil changes native page content.

## BFCache restore

Revalidate existing ownership/resources; do not double-bind. Fresh SquareCoil observation is required before prior clock assumptions are current.

## Service-worker restart

Worker memory loss cannot cause duplicate injection. Page Lifecycle Coordinator remains authoritative for current runtime existence.

## Extension reload/update

Existing live tabs may still contain old runtime code. First rebuilt release requires full refresh/new document to transition builds safely.

Developer-mode reload follows the same rule.

---

# 20. Disable / Re-enable

## Disable while READY

1. Mode -> DISABLED;
2. controlled teardown under Teardown Lock;
3. no new boot during teardown;
4. preserve durable history/preferences;
5. SquareCoil company clock unchanged;
6. successful result -> `UNINITIALIZED / user-disabled`.

If teardown is incomplete, lifecycle becomes FAILED and safe re-enable may require reload.

## Disable while BOOTING/RECOVERING

Cancel further boot/recovery as soon as safely possible and teardown resources already acquired. No READY may publish after disable request.

## Re-enable

If safely UNINITIALIZED, start one fresh BOOTING generation. If previous teardown is incomplete/reload-required, do not stack runtime; request reload.

---

# 21. User-Visible Lifecycle Feedback

Normal fast boot should not flash errors.

Delayed boot may show `Starting Companion...`.

User-noticeable recovery may show `Companion is reconnecting...`.

DEGRADED/FAILED messages must be concise and actionable, preserve native SquareCoil usability, and distinguish Companion failure from SquareCoil failure.

Retry is shown only when in-document Retry is safe; reload is shown for reload-required conditions.

Recommended normalized diagnostic reasons include:

```text
user-disabled
unsupported-document
boot-in-progress
ready
orphan-root-recovered
interaction-init-failed
persistence-unavailable
bridge-init-failed
bridge-unavailable
duplicate-runtime
ownership-conflict
legacy-runtime-reload-required
version-mismatch-reload-required
teardown-incomplete
recovery-exhausted
extension-controller-unavailable
root-removed
root-recovery-failed
bfcache-revalidation-failed
```

---

# 22. Chrome / Edge Parity

Chrome and Edge implement the same lifecycle semantics.

Platform adapters may normalize scripting APIs, update/install behavior, browser identity, and raw error strings.

They may not change:

- READY requirements;
- duplicate prevention;
- recovery budget;
- teardown;
- version mismatch;
- persistence safety;
- legacy coexistence.

---

# 23. Core Acceptance Scenarios

Implementation must cover at least:

1. fresh boot -> one interactive READY runtime;
2. repeated boot -> same runtime, no duplicate resources;
3. orphan visible root -> safely removed/recovered;
4. ambiguous duplicate ownership -> fail/reload, no guess;
5. owned root removed -> UI-only recovery, no duplicate state/Bridge;
6. visible root + missing interaction controller -> not READY;
7. healthy Bridge + honest unknown state -> READY without fabricated Context;
8. Bridge initialization failure -> bounded recovery/failure;
9. persistence unavailable -> READY denied/lost;
10. legacy v0.7 runtime -> reload-required, no coexistence;
11. rebuilt version mismatch -> reload-required;
12. background worker restart -> runtime reused, not duplicated;
13. full refresh -> fresh Runtime Instance, durable state preserved;
14. BFCache restore -> revalidate, no duplicate resources;
15. teardown called twice -> safe/idempotent;
16. incomplete teardown -> FAILED/reload, no replacement stack;
17. noncritical theme/support failure -> timer lifecycle unaffected;
18. disable while READY -> controlled teardown, SquareCoil unchanged;
19. re-enable after clean disable -> fresh boot;
20. boot request during teardown -> waits/no duplicate runtime;
21. explicit Retry after retry-safe FAILED -> one new bounded episode;
22. Chrome/Edge parity for applicable scenarios.

---

# 24. Later-Stage Resolution References

L1 intentionally leaves Timer State/time/Bridge transition details to L2-L4 and presentation/error polish to L5-L8.

The final handoff must read this file together with later stages rather than treating L1 provisional implementation choices as reopened product semantics.

---

# 25. L1 Readiness Judgment

**Status: Settled**

Boot, readiness, runtime/root ownership, disable/re-enable, recovery, teardown, page restoration, service-worker restart behavior, and Chrome/Edge lifecycle parity are explicit enough for staged implementation without inventing lifecycle behavior.
