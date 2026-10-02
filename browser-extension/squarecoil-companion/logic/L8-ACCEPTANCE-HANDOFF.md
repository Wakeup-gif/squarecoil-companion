# SquareCoil Companion Rebuild
## Logic Stage L8: Failure Behavior, Acceptance Criteria, and Implementation Handoff

**Status:** Settled - ready for staged implementation  
**Logic stage:** L8  
**Depends on:** settled L0-L7 behavior contracts  
**Framework authority:** `docs/REBUILD-MASTER-PLAN.md`  
**Production baseline:** `main` at `9378da24f393b40066816133e7fa0f48063115f0`  
**Planning branch:** `planning/squarecoil-companion-rebuild`  
**Purpose:** Tie all settled behavior into one failure-priority model, deterministic acceptance system, release gate, fixture contract, and staged implementation handoff.

---

# 1. Scope

L8 owns:

- cross-module failure priority;
- user-visible failure semantics;
- safe degradation;
- release-blocking defect classification;
- static/unit/integration/browser acceptance;
- deterministic test-environment requirements;
- migration/backup/CSV/Bridge fixtures;
- v0.7 regression coverage;
- Chrome-first acceptance;
- Edge parity;
- privacy/security/accessibility/resource acceptance;
- implementation-stage dependencies;
- contradiction escalation;
- Git recovery/source-of-truth completeness.

L8 does **not** redesign settled L0-L7 behavior, choose the final build/test framework or persistence engine, start implementation code, or freeze browser-store submission rules that should be checked against current store requirements at release time.

---

# 2. Safety Priority

When requirements compete during failure handling, use this order:

```text
1. Prevent authoritative data corruption/loss
2. Prevent duplicate/fabricated Companion time
3. Preserve SquareCoil authoritative clock truth
4. Preserve one-owner lifecycle and safe recoverability
5. Preserve core timer operation when evidence allows it
6. Preserve access to known historical data
7. Preserve normal UI convenience
8. Preserve themes/support/developer-support polish
```

Therefore:

- cap/hold rather than knowingly double-record;
- show stale known values rather than false zeroes;
- require reload rather than stack an ambiguous runtime;
- reject unsafe import rather than truncate/guess;
- fall back visually rather than disturb timer state.

---

# 3. Failure Classes

```text
F0_DATA_INTEGRITY_RISK
F1_ACCRUAL_TRUTH_RISK
F2_CORE_RUNTIME_FAILURE
F3_FEATURE_OPERATION_FAILURE
F4_PRESENTATION_FAILURE
F5_EXTERNAL_TRANSPORT_FAILURE
```

## F0 Data integrity risk

Examples:

- authoritative transaction cannot commit safely;
- restore/import contains unresolved overlap/identity conflict;
- duplicate-writer/fencing failure could commit competing history;
- destructive target/protection state is ambiguous;
- persisted data cannot be safely interpreted.

Behavior:

- block unsafe mutation;
- preserve last committed data;
- never claim success;
- DEGRADED/FAILED when the core store itself is unsafe;
- reload/manual recovery when ownership/teardown cannot be proven.

## F1 Accrual truth risk

Examples:

- Bridge unavailable;
- unknown/conflict beyond grace;
- strong unconfirmed clock-out;
- one-writer coordination cannot be proven;
- fresh SquareCoil Context contradicts committed Active identity.

Behavior:

- never invent Context/clock-out;
- use provisional/Safety Hold rules;
- cap at trustworthy boundary when continuity fails;
- do not backfill long unknown gaps;
- surface verification-degraded state.

## F2 Core runtime failure

Examples:

- visible root with dead interaction controller;
- missing/duplicate lifecycle owner;
- required renderer/state service unavailable;
- teardown incomplete;
- version/legacy runtime conflict.

Behavior follows L1: bounded safe recovery, no blind reinjection, reload for ownership/version ambiguity, no history deletion as recovery.

## F3 Feature operation failure

Examples:

- backup serialization fails;
- restore validation rejects file;
- CSV malformed;
- one Settings route fails;
- Open Job navigation fails.

Fail locally, preserve authoritative data, retain prior known read values where safe, and preserve Back/Home/Retry paths.

## F4 Presentation failure

Examples: Glass, theme selector, custom logo, optional QR/decorative styling.

Use readable/native/Solid fallback. No Timer State/history mutation or duplicate runtime.

## F5 External transport failure

Examples: mailto, clipboard, external developer-support navigation.

Use local/manual fallback. Never claim delivery/payment completion. No timer impact.

---

# 4. Failure Condition vs Release-Blocking Defect

A **safely handled failure condition is not itself a defect**.

Examples:

- a malformed backup being rejected safely is a passing F3/F0 safety scenario;
- a Bridge outage that correctly enters grace/Safety Hold is a passing F1 scenario;
- Glass being unavailable and falling back to Solid is a passing F4 scenario.

A release is blocked when implementation **fails the settled handling contract**, for example:

- malformed restore mutates data;
- Bridge outage keeps unbounded accrual;
- persistence failure is reported as saved;
- theme failure makes core controls inaccessible;
- duplicate owner writes succeed.

This distinction applies to every F0-F5 test.

---

# 5. Multiple Simultaneous Failures

When failures coexist:

1. highest safety severity governs authoritative mutation/accrual;
2. lower-severity UI messages cannot hide higher-severity state;
3. secondary retries cannot restart core lifecycle;
4. lower-severity recovery cannot clear unresolved higher-severity state;
5. presentation/support warnings never replace persistence/ownership/Bridge warnings as the primary core signal.

---

# 6. User-Visible Error Contract

Core errors are:

- plain-language;
- specific about what Companion can/cannot safely do;
- actionable where an action exists;
- clear that SquareCoil native clock is separate;
- free of raw stack traces by default;
- free of unsupported claims such as `your time is lost` unless confirmed.

Canonical actions include:

```text
Retry
Reload Page
Back / Home
Copy Diagnostics
Export / Download Backup when safely available
Cancel staged operation
```

Examples:

```text
Companion cannot verify SquareCoil right now. Recorded time is temporarily held at the last verified point.

Companion could not save this change safely. The previous committed data is still in use.

This SquareCoil page has an older Companion runtime. Reload the page to use the current extension.

This backup could not be restored. Your current Companion data was not changed.
```

---

# 7. Safe Degradation Matrix

| Fault | Timer behavior | Historical reads | Mutations | User signal |
|---|---|---|---|---|
| DOM Bridge path fails, server works | server fallback | available | normal if safe | optional Bridge status |
| Server Bridge path fails, audited DOM works | DOM fallback | available | normal if safe | optional Bridge status |
| Bridge fully unavailable | grace then Safety Hold | available | block evidence-dependent start/resume | verification warning |
| coordination unsafe | stop authoritative accrual writes | available | block timer mutation | ownership warning |
| persistence unavailable | no fake durable success; safety handling | last committed where possible | block unsafe writes | persistence warning |
| owned core UI missing, owner healthy | recover UI only | state remains owned | core service only | recovering status |
| visible root interaction dead | not READY | depends on core state | no blind reinjection | core warning |
| theme/Glass/logo failure | unchanged | unchanged | unchanged | local fallback |
| backup/CSV parse failure | unchanged | unchanged | no commit | local operation error |
| mailto/clipboard failure | unchanged | unchanged | unchanged | manual/copy fallback |

---

# 8. Authoritative Success Rule

A state/history/workspace operation is successful only after its logical commit is known.

```text
button click != success
request started != success
validation passed != restore success
mailto opened != ticket sent
serialization started != complete backup
```

L6 staged operations report success only after committed result.

Native SquareCoil actions remain SquareCoil-owned; Companion reports observation/interpretation, not control.

---

# 9. Acceptance Layers

```text
A1 Static / Package
A2 Unit
A3 Integration
A4 Browser Smoke / Behavioral Acceptance
```

Passing an earlier layer never substitutes for a later one.

A valid ZIP and parsing JavaScript do not prove Settings interaction, timer transitions, reload recovery, or browser behavior.

---

# 10. Deterministic Test Environment Contract

Required deterministic tests must control or explicitly set, as applicable:

- current clock/time;
- Workday Time Zone;
- DST transition fixture dates;
- storage contents/revision;
- Runtime Instance IDs and synthetic Context IDs;
- ownership/fencing epoch;
- Bridge fixture responses/events;
- browser profile/install state.

Unit/integration tests must not depend on the machine's real current time or current locale when asserting time boundaries.

Each test starts from a known isolated storage/profile state or performs a verified reset. State leaked from a previous test cannot be accepted as fixture setup.

Synthetic fixtures must not contain real customer/private SquareCoil data.

---

# 11. Required Test Result Policy

A required gate result is one of:

```text
PASS
FAIL
NOT_APPLICABLE (only when the contract explicitly permits it)
```

Required release tests cannot be silently skipped.

A flaky required test is not converted to PASS by repeated reruns. It must be stabilized, the defect fixed, or the required scope deliberately amended in the owning logic/test contract.

Expected safe failure conditions are PASS when the settled fallback/rejection behavior occurs correctly.

---

# 12. A1 Static / Package Gate

Required checks include:

- valid manifest;
- required packaged files/assets present;
- build/JavaScript parses;
- no unexpected remote runtime JS loading;
- one canonical package version propagated consistently;
- Chrome artifact builds;
- shared source remains buildable for Edge/adapters;
- candidate-channel mandatory configuration exists or safe disabled fallback is present;
- no private customer/test data, credentials, or tokens are packaged.

A1 does not certify runtime interaction.

---

# 13. A2 Unit Acceptance

Minimum deterministic domains:

## Lifecycle/state

- lifecycle guards;
- READY assertions;
- teardown idempotency;
- Timer State exclusivity;
- stale fencing/commands;
- Safety Hold calculation.

## Time Ledger

- Today/Week/Context Total;
- midnight split;
- DST real elapsed duration;
- current/provisional contribution;
- legacy-unattributed balance;
- dedupe/fingerprint;
- no double-count after finalization.

## Migration

- v0.7 accumulated/session reconciliation;
- timestamp/duration precedence;
- Active/Pending/Local-Pause migration safety;
- idempotency.

## Bridge parser

- Job Context;
- Production General;
- audited General rules;
- empty `data-time`;
- stale request generation;
- candidate expiry/correlation;
- certainty mapping.

## Timer behavior

- new vs remembered;
- Pending continuity;
- Resume/Start Fresh;
- Local Pause/Resume;
- switch/leave/clock-out boundaries;
- unknown grace/hold;
- controlled reload vs crash recovery.

## Views

- Selected vs Operational read model;
- provisional propagation;
- tab soft-cap/overflow;
- logical History reconstruction;
- deterministic ordering.

## Data safety

- backup validation;
- Merge/Replace plans;
- temporal overlap;
- hard identity conflict;
- legacy balance lineage;
- CSV dedupe/formula escaping.

## Settings/support

- preference revision/stale draft handling;
- Auto/effective resolution;
- threshold validation;
- diagnostic whitelist/frozen preview;
- mail composition;
- external-link configuration validation.

---

# 14. A3 Integration Acceptance

Required boundary flows include:

```text
L3 Bridge event -> L4 transition -> L2 transaction -> L5 read model
```

```text
user Pause/Resume -> cross-tab writer -> Ledger -> synchronized views
```

```text
v0.7 source -> migration -> Ledger/Index -> Today/Total/History
```

```text
backup/CSV -> staging -> conflict analysis -> atomic store -> read-model refresh
```

```text
preference change -> durable revision -> renderer/theme -> second live tab
```

```text
lifecycle teardown/recovery -> exactly one runtime/Bridge/listener set
```

```text
Support draft -> frozen diagnostics -> mailto/copy output
```

Both positive and rejected/stale/failure paths are required.

---

# 15. A4 Browser Smoke / Behavioral Acceptance

A4 loads the actual packaged extension in Chromium.

## Lifecycle/runtime

- one runtime/root;
- Settings gear actually opens/responds;
- collapse/expand;
- repeated boot no duplicate resources;
- orphan-root recovery;
- visible-but-dead root not READY;
- service-worker restart no duplicate runtime;
- reload/recovery;
- version/legacy mismatch reload-required.

## Timer

- zero-history auto-start fixture;
- remembered Pending;
- Resume/Start Fresh;
- Local Pause/Resume;
- A->B switch;
- same-project department change no reset;
- full clock-out;
- project-leave distinction;
- unknown/conflict hold;
- selected inactive Context cannot impersonate Active.

## Views

- Recent;
- Time Overview;
- History;
- Context Detail;
- Archives & Backup;
- tab soft-cap/overflow;
- Current Context indication;
- provisional/Hold presentation.

## Data safety

- Archive/restore preserves time;
- Clear Recent preserves history;
- protected destructive actions unavailable;
- complete Full Backup;
- malformed restore causes no mutation;
- duplicate import does not double time;
- Replace requires idle + destructive confirmation.

## Settings

- Home/Back/Close;
- Light/Dark/Auto;
- Solid/Glass fallback;
- Original/Refined Light/Sleek Dark;
- logo fallback;
- threshold validation;
- Ticket/Feedback;
- frozen diagnostics preview/copy;
- Developer Support missing-config fallback.

A4 is mandatory before Stable.

---

# 16. Browser Profile Matrix

Browser acceptance must cover at least two install histories:

```text
PROFILE-CLEAN
  fresh rebuilt install, empty Companion data

PROFILE-UPGRADE-V07
  representative v0.7 data/preferences/history requiring migration
```

Where relevant also cover:

```text
PROFILE-RESTORED
  rebuilt data produced through validated Full Backup restore
```

A clean-install pass cannot substitute for upgrade/migration acceptance.

---

# 17. Live SquareCoil Test Safety

Automated acceptance must not mutate a real production user's company clock merely to prove Companion behavior.

Preferred order:

```text
1. deterministic synthetic SquareCoil fixture page
2. controlled test account/environment if available
3. authenticated live-site observational smoke
4. user-initiated real native transitions only when intentionally testing workflow
```

Automation must never blindly call native mutation actions 2/3/4 on a production account.

---

# 18. Required Bridge Fixtures

At minimum:

- numbered Job action-7/header;
- Production General with `id=0`;
- Production General with empty-looking `data-time`;
- clocked-out controls;
- no-trackable-context controls;
- same-project department/label change;
- action-3 A->B;
- action-4 leave then action-3 enter;
- action-2 + confirming post-state;
- action-2 + temporarily unavailable post-state;
- stale action-7 response after newer transition;
- server/DOM conflict;
- malformed action-7;
- server unavailable / DOM valid;
- DOM unavailable / server valid;
- unaudited General label;
- Bridge teardown/reinit.

Fixtures are synthetic/redacted.

---

# 19. Required Migration Fixtures

```text
MIG-01 clean v0.7 complete Sessions
MIG-02 accumulated > surviving Sessions
MIG-03 Sessions > accumulated
MIG-04 duplicate legacy Sessions
MIG-05 same Context in Recent + Archive
MIG-06 legacy Active
MIG-07 legacy Pending
MIG-08 legacy Local Pause
MIG-09 duration-only row
MIG-10 timestamp/duration mismatch
MIG-11 cross-midnight Session
MIG-12 malformed/partially unreadable source
MIG-13 successful migration run twice
```

Assertions include no duplicate hours, no fabricated dates, correct legacy-unattributed balance, no live state from source, and idempotency.

---

# 20. Required Backup / Restore Fixtures

```text
BKP-01 valid current backup
BKP-02 older supported backup
BKP-03 unsupported future schema
BKP-04 truncated/count mismatch
BKP-05 malformed types/IDs/timestamps
BKP-06 duplicate stable Segments
BKP-07 Segment ID conflict
BKP-08 cross-Context temporal overlap
BKP-09 same-Context material overlap
BKP-10 hard Context identity conflict
BKP-11 duplicate legacy balance lineage
BKP-12 ambiguous legacy balance lineage
BKP-13 non-live Recovery Evidence
BKP-14 Recovery Evidence duplicates finalized Session
BKP-15 workspace import tries to hide/archive protected current Context
BKP-16 Replace with alternate valid Workday Zone
BKP-17 spreadsheet-dangerous labels/provenance
BKP-18 oversized input path
```

Validation/conflict failure must leave current data unchanged.

---

# 21. Required History CSV Fixtures

```text
CSV-01 canonical SEGMENT
CSV-02 canonical LEGACY_BALANCE
CSV-03 v0.7 squarecoil-job-timer-csv-v1
CSV-04 same file twice
CSV-05 duplicate IDs same fields
CSV-06 conflicting same ID
CSV-07 temporal overlap
CSV-08 ambiguous zone-less current timestamp
CSV-09 canonical duration/timestamp mismatch
CSV-10 malformed row
CSV-11 explicitly reviewed partial subset
CSV-12 formula-triggering = + - @ text
CSV-13 large-file processing limit
```

Canonical round-trip never relies on rounded decimal hours when precise timestamp/duration fields exist.

---

# 22. Required v0.7 Regression Suite

```text
REG-01 visible root without interaction handler is not READY
REG-02 root existence alone never suppresses needed boot/recovery
REG-03 repeated boot never creates second runtime
REG-04 legacy v0.7 runtime never coexists with rebuilt runtime after detection
REG-05 feature scripts do not independently patch Settings
REG-06 only one Timer State writer
REG-07 UI recovery does not recreate healthy Bridge/state resources
REG-08 Settings observers do not become page-wide patch chains
REG-09 package CI success cannot stand in for browser interaction
REG-10 service-worker restart does not duplicate runtime/listeners
REG-11 same-context heartbeat does not reopen manual collapse
REG-12 protected Context cannot disappear through ordinary housekeeping
REG-13 array/count limits do not silently prune authoritative time
```

All are mandatory.

---

# 23. Cross-Tab / Concurrency Acceptance

Required:

- OWNER + OBSERVER both reach READY;
- only fenced owner commits authoritative changes;
- stale owner wake write rejected;
- owner disappearance yields exactly one safe takeover;
- observer Pause timestamp accepted only when expected state still matches;
- stale Resume/Start Fresh rejected;
- per-tab selection remains independent;
- durable preference/tab-order propagates without transient route/Support-draft propagation;
- shared Safety Hold caps all tabs at one boundary;
- L6 Data Mutation Lock prevents concurrent restore/delete/import commits.

Two successful competing writers are an immediate release blocker.

---

# 24. Privacy / Security Acceptance

Required:

- diagnostics default off;
- previewed diagnostics exactly equal copied/composed diagnostic snapshot;
- automatic diagnostics contain no job/customer/history/private URL identifiers;
- Support draft not stored in backup/preferences/activity;
- no hidden Support network submission;
- developer-support links add no Companion tracking/job data;
- no donation completion tracking;
- CSV formula-trigger text exported safely;
- imports/backups parsed only as data, never executable content;
- package contains no credentials/tokens/private fixtures;
- restored external data cannot assert live clock state.

Automatic private SquareCoil/customer leakage is release-blocking.

---

# 25. Accessibility / Interaction Acceptance

Required:

- Settings controls keyboard reachable;
- focus safely returns on close;
- hidden controls not focusable;
- Settings keys cannot leak into underlying Pause/Delete;
- destructive Cancel is reachable and opening keystroke cannot auto-confirm;
- status is not color-only;
- Provisional/Hold/Pending/Local Pause are semantically distinct;
- high-contrast/forced-colors remains readable and may override decorative effects;
- Website Theme never hides/disables a native business control for styling.

A theme that makes core/native controls unreadable or inoperable fails acceptance even if the underlying bug began as F4 presentation.

---

# 26. Performance / Resource Acceptance

Behavioral requirements:

- one runtime root;
- one lifecycle owner;
- one active Bridge observer/listener set per runtime;
- one heartbeat after reinit/recovery;
- no Settings MutationObserver patch chain;
- SquareCoil observer targeted/coalesced;
- same-context verification does not create unbounded durable writes;
- large-history views use incremental retrieval without changing aggregate totals;
- Glass does not require blur on every nested component;
- teardown invalidates late callbacks/responses.

Observable duplicate resources are release-blocking.

---

# 27. Recovery Post-Condition Acceptance

After any successful recovery/reinitialization:

- exactly one current runtime owner remains;
- old generation listeners/observers/heartbeats cannot emit current events;
- stale fencing tokens cannot write;
- no orphan Safety Hold/Pending/live claim from the old generation survives unless authoritative shared state says it should;
- read-model revision matches the committed authoritative revision;
- historical totals remain unchanged except for a separately valid committed timer transition.

Recovery is not accepted merely because the UI becomes visible again.

---

# 28. Tested Artifact Identity

The browser package that passes release acceptance must be the same artifact bytes promoted as that candidate/release.

Required evidence records:

```text
package version
source commit SHA
artifact name
artifact digest/checksum
browser/version used for smoke
acceptance result
```

If an artifact is rebuilt or modified after required browser smoke, the old A4 evidence does not certify the new bytes. Required gates must be rerun as appropriate.

This prevents `tested source` and `released package` from silently diverging.

---

# 29. Chrome-First Candidate Gate

Chrome is the first rebuilt acceptance/upload target.

A Chrome candidate requires:

```text
A1 package = PASS
A2 required unit suites = PASS
A3 required integration suites = PASS
A4 Chrome browser smoke = PASS
all critical F0/F1/F2 handling tests = PASS
migration fixtures = PASS
backup/CSV fixtures = PASS
privacy/security = PASS
accessibility required cases = PASS
stale-root/duplicate-runtime regressions = PASS
PROFILE-CLEAN = PASS
PROFILE-UPGRADE-V07 = PASS
artifact identity recorded
```

Known noncritical polish issues may remain in Beta only when documented and when they do not violate usability/accessibility/privacy/core behavior.

No undefined `P0` gate exists; release severity uses the F0-F5 model plus the explicit release-blocking policy below.

---

# 30. Edge Parity Gate

Edge uses the same shared application source and behavior contracts.

Chrome PASS does not certify Edge Stable.

Required parity includes lifecycle/reload/service-worker behavior, one runtime/root, Settings interaction, core Timer transitions, storage/migration/backup, appearance/Glass fallback, Website Theme behavior, mailto/clipboard/external navigation fallback, and package/adapter differences.

A browser-specific workaround requires a parity regression before Edge Stable.

Platform adapters may normalize mechanics/errors but cannot change timer/time/history semantics.

---

# 31. Release-Blocking Defect Policy

Stable is blocked by any known defect that can:

- lose/delete authoritative time without explicit intent;
- double-record time;
- fabricate missed/unverified time;
- claim SquareCoil state without evidence;
- allow two authoritative writers/runtimes;
- restore/import unsafe duplicate/overlapping history;
- bypass destructive protection/confirmation;
- restore fake live state from file;
- leave core timer/Settings visibly present but noninteractive without safe recovery;
- automatically leak private job/customer/SquareCoil data;
- make required core/native controls unusable under supported presentation/accessibility conditions;
- falsely report save/delete/import/restore/backup success;
- release package bytes different from the artifact that passed required acceptance without rerunning appropriate gates.

A cosmetic mismatch preserving safety/usability may be a documented Beta/nonblocking issue.

---

# 32. Acceptance Evidence

Useful sanitized evidence includes:

- fixture/test ID;
- build/version;
- source commit;
- artifact digest;
- browser/version;
- PASS/FAIL/NOT_APPLICABLE;
- normalized lifecycle/timer state;
- expected vs actual synthetic Context IDs;
- revision/fencing metadata in synthetic test environment;
- normalized error code;
- synthetic screenshots/video where useful;
- sanitized console output.

Do not use real customer/job history just because it is convenient.

---

# 33. Implementation Stages

## B1 Shell / Lifecycle

Depends on L0-L1.

May implement scaffold/build tooling, extension shell, Lifecycle Coordinator, one runtime/root, teardown/recovery skeleton, static checks, lifecycle fixtures.

Must not invent later Timer behavior.

## B2 State / Ledger / Bridge / Core Timer

Depends on L2-L4.

May implement persistence abstraction, Shared Timer State, Ledger/query service, coordination/fencing, migration, Recovery Checkpoint, Bridge, Timer service, core timer read model/actions.

B2 contracts must be green before higher features rely on time semantics.

## B3 Time Views / Workspace

Depends on L5 + green B2 contracts.

May implement main hierarchy, Recent, Time Overview, History, Context Detail, Job Navigation, tabs/overflow/order.

## B4 Data Safety / Files

Depends on L6 + green authoritative storage contracts.

May implement Archive/Clear/Delete, Full Backup, Restore, History CSV, Time Report, conflict staging, Data Mutation Lock.

No file import bypasses L2 transactions.

## B5 Settings / Themes / Support

Depends on L7 + stable B2-B4 feature interfaces.

May implement Settings router, appearance/finish, Website Themes, Timer Limits, Support/Feedback, diagnostics, Developer Support.

## B6 Full Acceptance / Candidate Packaging

Depends on L8 + green B1-B5 required gates.

Runs full regressions, packaged Chrome browser acceptance, fixture matrices, privacy/accessibility, artifact evidence, first Chrome candidate, then Edge parity candidate.

---

# 34. Build Stage Completion Rule

A build stage completes only when:

```text
implementation matches applicable settled logic
required stage tests PASS
no unresolved release-blocking defect remains in scope
diagnostics/docs are sufficient for the next stage
```

If implementation finds a real contradiction:

1. stop local invention/workaround;
2. document the contradiction;
3. return to the owning Logic/Framework contract;
4. deliberately amend canonical logic;
5. add regression coverage;
6. resume implementation from the amended contract.

---

# 35. Git Source-of-Truth / Recovery Gate

GitHub is the implementation handoff source of truth.

The planning branch now contains:

```text
REBUILD-START-HERE.md

docs/REBUILD-MASTER-PLAN.md
docs/LOGIC-STAGE-PLAN.md

logic/L0-INVARIANTS.md
logic/L1-LIFECYCLE.md
logic/L2-STATE-TIME-MIGRATION.md
logic/L3-SQUARECOIL-BRIDGE.md
logic/L4-TIMER-BEHAVIOR.md
logic/L5-TIME-VIEWS-WORKSPACE.md
logic/L6-DATA-SAFETY-BACKUP.md
logic/L7-SETTINGS-SUPPORT-THEMES.md
logic/L8-ACCEPTANCE-HANDOFF.md
```

L0-L2 were deliberately backfilled as clean canonical settled contracts rather than blindly copying an older conversation artifact with a document-numbering defect.

`main` has been rechecked and remains the untouched production baseline at:

```text
9378da24f393b40066816133e7fa0f48063115f0
v0.7.1 Chrome Interaction Recovery
```

No planning/logic work has been written to production `main`.

The Start Here file must identify this final logic state and B1 as the staged implementation next action.

**Repository logic-file completeness: GREEN**

---

# 36. Implementation Handoff Package

The handoff consists of:

1. Master Plan;
2. Logic Stage Plan;
3. L0-L8 settled logic files;
4. Start Here recovery/index;
5. L8 fixture/test inventory;
6. B1-B6 dependency map;
7. production baseline reference;
8. known nonblocking configuration inputs;
9. explicit rule that `main` remains production until staged rebuild acceptance permits promotion.

An implementation session should not need the original chat transcript to recover core behavior.

---

# 37. Nonblocking Configuration Inputs

Safe fallbacks allow these to remain unresolved during scaffold/core implementation:

```text
Buy Me a Coffee URL
Cash App cashtag/name
Cash App QR packaged asset
approved future light custom logo
exact final visual microcopy/polish
exact optional Activity retention count/age
exact processing-size limits after profiling
exact test/build framework
exact persistence technology behind settled storage contract
```

They become release blockers only if a candidate claims the corresponding feature without valid configuration or the settled disabled/fallback behavior.

---

# 38. End-to-End Handoff Scenarios

At minimum:

1. Bridge outage while Active -> grace then shared Hold; history available;
2. persistence failure during A->B -> no fake success/alternate store;
3. theme/logo failure -> readable fallback, timer unchanged;
4. mailto failure -> copy fallback, no sent claim;
5. malformed backup -> no mutation;
6. temporal overlap -> conflict, no guessed trim/sum;
7. visible dead root -> not READY;
8. service-worker restart -> existing runtime reused;
9. stale writer wakes -> fenced out;
10. provisional correction -> live totals reconcile, finalized History unchanged;
11. active-session backup -> non-live Recovery Evidence only;
12. same CSV twice -> zero duplicate hours second time;
13. diagnostic privacy -> no project/customer identifiers;
14. unknown native control under theme -> remains usable/visible;
15. Chrome packaged candidate must pass full core A4 before Stable;
16. Edge quirk -> adapter + parity regression, same semantics;
17. A1 package pass + Settings click fail -> candidate rejected;
18. implementation contradiction -> canonical logic amendment + regression;
19. new implementation session recovers from Git Start Here + Master Plan + L0-L8 without chat;
20. missing optional developer-support config -> safe unavailable state, core work continues;
21. test clock/timezone controlled -> deterministic midnight/DST result;
22. required flaky test -> cannot be rerun into a false PASS;
23. clean profile passes but v0.7 upgrade profile fails -> candidate blocked;
24. tested artifact rebuilt after smoke -> old A4 evidence invalid for new bytes;
25. recovery makes root visible but leaves duplicate listener -> recovery acceptance fails.

---

# 39. Final Readiness Judgment

**Framework + Logic = Settled - ready for staged implementation**

The behavior contracts L0-L8 are now recoverable from Git, production `main` remains untouched, failure behavior and test evidence are explicit, and staged implementation can begin without a builder inventing time/state/data-safety semantics.

The next action is **Build Stage B1: Shell / Lifecycle**, not a one-pass full rewrite.

Chrome remains the first rebuilt acceptance/package target. Edge follows from the same shared source with its own parity gate.
