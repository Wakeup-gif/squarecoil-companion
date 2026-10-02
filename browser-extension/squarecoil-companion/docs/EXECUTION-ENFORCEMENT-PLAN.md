# SquareCoil Companion Execution Enforcement Plan

**Status:** additive execution authority; does not redesign settled product behavior
**Behavior authority:** `docs/REBUILD-MASTER-PLAN.md` plus accepted `logic/L0-L8` and explicit deltas
**Current checkpoint authority:** `REBUILD-START-HERE.md`
**Purpose:** turn architectural rules and acceptance requirements into a traceable, risk-based delivery system that preserves momentum without weakening safety.

---

## 1. Problem This Layer Solves

The existing plans correctly define product behavior, ownership, safety, staged logic, and browser acceptance. They do not yet fully control how implementation changes select tests, reopen earlier boundaries, expose failures, or advance toward one exact candidate.

This layer prevents two opposite failure modes:

1. **under-review:** isolated tests pass while the composed product is broken;
2. **over-review:** the entire release gate is repeatedly used to debug one unfinished change.

The governing rule is:

> Review breadth follows behavioral blast radius, not diff size. Targeted gates debug a change; the full candidate gate certifies the completed artifact once.

---

## 2. Authority and Precedence

Use these sources in order:

1. `REBUILD-START-HERE.md` identifies the current branch/checkpoint and authorized next action.
2. `docs/REBUILD-MASTER-PLAN.md` owns product structure and architectural ownership.
3. Accepted `logic/L0-L8` and explicit deltas own behavior.
4. `docs/EXECUTION-ENFORCEMENT-PLAN.md` owns implementation flow, change-impact selection, stop/continue rules, and candidate advancement.
5. `docs/EXECUTION-GATE-MATRIX.md` maps critical requirements to implementation owners and evidence.
6. `AGENTS.md` gives local working instructions consistent with those authorities.
7. Implementation evidence certifies only its named source SHA and artifact bytes; it is historical evidence, not live behavior authority.

If two sources disagree:

- do not silently choose the most convenient wording;
- determine whether the disagreement is checkpoint drift, evidence history, or a real behavior contradiction;
- checkpoint/evidence drift is repaired without redesigning behavior;
- a real product/safety contradiction returns to the owning Logic contract for an explicit decision.

---

## 3. Required Traceability

Every release-significant requirement must have a stable identifier and map to:

```text
requirement
-> owning contract
-> implementation owner
-> targeted automated test
-> composed integration/browser journey when applicable
-> exact candidate evidence
```

Required evidence states are:

```text
OPEN       requirement or evidence is incomplete
MAPPED     implementation and tests are identified but not yet proven for the candidate
PASS       required evidence passed for the exact candidate
BLOCKED    a true external/contract/safety blocker prevents completion
N/A        permitted only when the owning contract explicitly allows it
```

Rules:

- `PASS` from an older source SHA does not certify modified bytes.
- A unit test cannot substitute for a required composed browser journey.
- A browser launch cannot substitute for an asserted user interaction.
- No candidate advances with an `OPEN`, `MAPPED`, or `BLOCKED` release requirement.
- The gate matrix must be updated when a change exposes a missing requirement or invalid test oracle.

---

## 4. Change-Impact Declaration

Every implementation batch declares its impact before editing:

```text
Intent:
Behavior changed or restored:
Files expected:
Impact tags:
Contracts touched:
Targeted gates:
Composed journeys:
Full candidate gate required at completion: yes/no
Explicit exclusions:
```

Canonical impact tags:

```text
LIFECYCLE
SHARED_UI_ROOT
AUTHORITY_FENCING
BRIDGE_OBSERVATION
MIGRATION_STORAGE
TIMER_LEDGER
WORKSPACE_SETTINGS
PRESENTATION
SUPPORT_PRIVACY
PACKAGE_ARTIFACT
DOCS_ONLY
```

Minimum gate mapping:

| Impact tag | Required targeted evidence |
|---|---|
| `LIFECYCLE` | B1 unit/integration plus the affected recovery journey |
| `SHARED_UI_ROOT` | renderer ownership/static check plus real Settings interaction before and after recovery |
| `AUTHORITY_FENCING` | B2 authority/settlement gates and stale-owner rejection |
| `BRIDGE_OBSERVATION` | B2 Bridge gates and zero native mutation proof |
| `MIGRATION_STORAGE` | migration safety plus repaired-cause/same-runtime recovery and upgrade profile |
| `TIMER_LEDGER` | B2 timer/ledger gates plus affected B3/B4 read models |
| `WORKSPACE_SETTINGS` | B3/B5 targeted gates, zero-history access, keyboard/focus where affected |
| `PRESENTATION` | B5 targeted gates, cleanup/accessibility, representative SquareCoil DOM/CSS fixture |
| `SUPPORT_PRIVACY` | diagnostics whitelist and explicit-delivery tests |
| `PACKAGE_ARTIFACT` | canonical inventory, package validation, exact ZIP identity |
| `DOCS_ONLY` | link/status/contradiction validation; implementation gates only if semantics changed |

Touching a previously accepted boundary automatically reopens its affected tests. This is regression verification, not permission to redesign that boundary.

---

## 5. Three Execution Lanes

### 5.1 Feature lane

Use when adding or deliberately changing product behavior.

```text
authorize scope
-> amend/confirm owning contract
-> declare impacts
-> implement one vertical slice
-> targeted gates
-> affected composed journeys
-> candidate lane when requested
```

### 5.2 Stabilization lane

Use when restoring already-settled behavior or resolving release blockers.

One authorization covers the bounded defect set. Normal test failures do not require repeated user approval.

```text
freeze defect scope
-> reproduce each defect
-> classify failure
-> add/repair the test oracle
-> minimal fix
-> targeted gate
-> next defect cluster
-> one aggregate gate
-> candidate lane
```

Stabilization does not authorize new features, production mutation, publication, or contract invention.

### 5.3 Candidate lane

Use only when all selected targeted gates are green.

```text
clean source identity
-> build exact package
-> validate canonical inventory
-> create immutable ZIP
-> Chrome clean + upgrade
-> Edge clean + upgrade
-> verify unchanged bytes
-> record evidence
-> commit/push/package action only as authorized
```

The full candidate gate is certification, not the primary debugger.

---

## 6. Failure Classification and Momentum Rules

Every failure is classified once:

```text
PRODUCT_DEFECT
TEST_ORACLE_OR_HARNESS_DEFECT
PACKAGE_OR_CI_DRIFT
DOCUMENTATION_DRIFT
CONTRACT_CONTRADICTION
EXTERNAL_ENVIRONMENT_BLOCKER
```

Continue autonomously for the first four categories when they remain inside the authorized scope.

Stop and request direction only for:

- a real behavior contradiction affecting product intent, authoritative time, native SquareCoil behavior, privacy, or destructive safety;
- unrelated pre-existing work that cannot be preserved safely;
- a destructive or external action outside the authorization;
- a required unavailable environment/account/user choice that cannot be inferred safely.

Do not stop merely because:

- a targeted test fails;
- the fake browser lacks required behavior;
- documentation is stale;
- CI/package file lists disagree;
- a safe local refactor or regression test is needed inside scope.

---

## 7. No-Loop Debugging Policy

- Do not rerun an unchanged failing full gate hoping for a pass.
- Reduce the first failure to the narrowest deterministic reproduction.
- Fix or replace an invalid test oracle before trusting its result.
- Run the affected targeted gate after each coherent defect cluster.
- Run the aggregate gate only after every selected targeted gate passes.
- If the aggregate gate finds a new failure, return only that failure to the targeted lane.
- Record the root cause and regression ID before moving on.
- A flaky required test is a failure until its cause is understood and stabilized.

---

## 8. Safety and Liveness Pairing

Fail-closed behavior is incomplete without a safe recovery contract.

Every recoverable failure scenario requires a paired transition:

```text
cause introduced
-> unsafe operation blocked
-> authoritative state preserved
-> cause repaired
-> explicit/bounded retry
-> healthy state restored
-> no duplicate mutation/resource
```

Examples:

- malformed legacy migration source blocks, then repaired source re-inspects safely;
- post-migration preference failure retries without duplicate migration;
- worker restart rebinds without duplicate runtime/listeners;
- BFCache restore preserves one interactive workspace;
- removed UI root is restored without recreating healthy authority/Bridge services;
- presentation provider failure falls back and later recovers without affecting Timer authority.

Permanent safety conflicts may remain reload/manual-recovery only when the owning Logic contract says so.

---

## 9. Startup and Error Observability

Startup/lifecycle code must not silently consume a failure.

A caught release-significant failure must provide, as appropriate:

- a stable internal phase/reason code;
- a privacy-safe diagnostic projection;
- a friendly user-visible fallback when the product surface is affected;
- bounded retry when safe;
- a truthful terminal action such as Reload when in-document recovery is unsafe.

Raw stack traces, customer/job content, tokens, and retained legacy values never appear in automatic diagnostics.

Presentation isolation means a presentation failure cannot damage Timer authority. It does not mean the failure may disappear without evidence.

---

## 10. Mandatory Composed User Journeys

The candidate gate must exercise complete outcomes rather than proxy signals.

At minimum:

1. clean zero-history install exposes Settings, Recent, Overview, and History before clock-in;
2. BFCache `pagehide.persisted/pageshow.persisted` preserves one runtime and an interactive Settings route;
3. service-worker restart preserves one runtime and interactive workspace;
4. UI startup failure produces bounded recovery or actionable fallback without Timer mutation;
5. malformed legacy data blocks migration/Bridge/READY without leaking values;
6. repaired recoverable migration state reaches healthy settlement in the same runtime without duplicate import;
7. a post-migration preference fault does not relabel committed migration or duplicate Ledger evidence;
8. Dark Glass and Light Glass include their intended background and translucent surfaces as one user choice;
9. Original, forced colors, reduced transparency, disable, and teardown remove/suspend owned presentation exactly;
10. representative SquareCoil containers do not conceal the selected background;
11. popup and workspace friendly status cannot be overwritten by internal lifecycle text;
12. the exact downloaded ZIP remains byte-identical through Chrome and Edge clean/upgrade acceptance.

Synthetic fixtures must model the production DOM/CSS properties relevant to the assertion. A simplified fixture that omits an opaque production container cannot certify background visibility.

---

## 11. Product Intent vs Technical Isolation

Do not infer a user-facing control split merely because two services must fail independently.

For every new preference or separate control, record:

```text
User intent:
Why a separate choice is needed:
Technical failure boundary:
Default/migration behavior:
Accessibility fallback:
User acceptance evidence:
```

Technical independence controls failure propagation. Product intent controls what the user selects and experiences.

---

## 12. Canonical Package Inventory

The package file inventory must have one machine-readable source consumed by:

- build/package creation;
- static validation;
- ZIP validation;
- installed-browser harness;
- CI artifact assembly;
- evidence generation.

Documentation may render the inventory but must not maintain an independent authoritative copy.

Any inventory change carries `PACKAGE_ARTIFACT`, invalidates older artifact evidence, and requires rebuilding/retesting the exact bytes.

---

## 13. Documentation Consistency

The following must agree before candidate labeling:

- active branch and current checkpoint;
- accepted versus active stage;
- exact source SHA;
- package version/build stage;
- canonical inventory count;
- required gate/test IDs;
- artifact/evidence identity.

Historical evidence remains immutable and clearly labeled by source SHA. Live status belongs in `REBUILD-START-HERE.md`; structural plans should link to it rather than duplicate a changing checkpoint.

CI should eventually validate these relationships automatically.

---

## 14. Definition of Done

A stabilization or feature batch is complete only when:

```text
scope remained bounded
AND every impacted requirement is mapped
AND targeted tests pass
AND required failure/recovery pairs pass
AND required composed journeys pass
AND aggregate regression passes once
AND exact package validation passes
AND required browser/profile matrix passes on unchanged bytes
AND documentation/evidence identifies those bytes truthfully
AND git diff/status are reviewed
```

Passing an earlier layer cannot substitute for a later required layer.

---

## 15. Adoption Work List

These items implement this execution layer; they do not change settled product behavior:

- [ ] `ENF-01` maintain the critical requirement mapping in `docs/EXECUTION-GATE-MATRIX.md`;
- [ ] `ENF-02` add a machine-readable change-impact declaration and gate selector;
- [ ] `ENF-03` add composed BFCache, worker-restart, zero-history, migration-recovery, and integrated-theme journeys;
- [ ] `ENF-04` prohibit silent release-significant startup failures and verify bounded recovery/fallback;
- [ ] `ENF-05` create one canonical package inventory consumed by build, validation, browser harness, CI, and evidence;
- [ ] `ENF-06` add live-document checkpoint/identity consistency validation;
- [ ] `ENF-07` require exact candidate traceability before commit/push/download or promotion claims;
- [ ] `ENF-08` update the gate matrix whenever a defect exposes an invalid proxy or missing requirement.

Until these are automated, the same rules apply manually and must be recorded in the active handoff/evidence.
