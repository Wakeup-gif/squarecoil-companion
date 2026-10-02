# SquareCoil Companion Rebuild Master Plan

Status: **structural authority; live implementation status is maintained in `REBUILD-START-HERE.md`**
Planning branch: `planning/squarecoil-companion-rebuild`  
Production baseline: `main` at `9378da24f393b40066816133e7fa0f48063115f0` (`v0.7.1 Chrome Interaction Recovery`)  
Purpose: rebuild the Companion into a stable, modular, easy-to-update Chrome/Edge extension without losing established behavior, saved job history, or the UX improvements already developed.

---

## 1. Product Goal

SquareCoil Companion should feel like a useful, lightweight companion to SquareCoil rather than a second complicated system layered on top of it.

The rebuild must:

- preserve known-good timer behavior and saved user data;
- make Chrome and Edge reliable from one shared codebase;
- use a modular source architecture without recreating the current multi-script patch stack;
- make updates and releases easy through GitHub;
- make job time easy to understand by day and by job;
- provide safe backup, restore, archive, CSV, and housekeeping workflows;
- include simple ticket/feedback and optional developer-support features;
- prioritize clarity, low friction, recoverability, accessibility, and maintainability;
- keep SquareCoil authoritative for the actual company clock.

### UX north star

A user should be able to glance at the Companion and answer:

1. What job am I looking at?
2. How much time have I recorded on it today?
3. How much time have I recorded on it overall?
4. Am I currently running, paused, or waiting to resume?
5. Where can I see my recent jobs, daily time, history, backups, or support options?

The interface should expose those answers without requiring users to understand timer internals.

---

## 2. Why the Rebuild Is Necessary

The v0.7.x feature set is useful, but its architecture became fragile.

Current behavior is split across multiple scripts that all touch the same widget:

1. `timer-runtime.js` creates the timer and owns core behavior.
2. `timer-controls.js` patches the runtime settings UI.
3. `timer-workspace.js` patches that settings UI again and directly changes timer state.
4. `timer-surface.js` patches settings again for Solid/Glass.

This creates overlapping ownership of DOM, state, listeners, observers, and lifecycle behavior. Chrome and Edge have both shown visible-but-unresponsive states.

The rebuild does **not** discard the work. It preserves the behavior and reorganizes ownership.

### Core correction

> One state owner. One UI owner. One application lifecycle. Feature modules communicate through defined services/events instead of modifying each other's internals.

---

## 3. Non-Negotiable Architectural Rules

### 3.1 One timer-state writer

Only the Timer State / Time services may mutate authoritative timer data.

Features must not independently read JSON, alter fields, and write it back.

### 3.2 One timer UI owner

One renderer/router owns `#ussign-job-timer` and all views inside it.

No feature may depend on MutationObserver-driven DOM patch chains to insert its normal controls.

### 3.3 Modular source, consolidated runtime ownership

The source should be modular for development, testing, and future expansion.

That does **not** mean injecting many independent page scripts that each alter the application.

Preferred structural shape:

```text
many source modules
        ↓
build/package
        ↓
one Companion application runtime
```

A small browser/extension bridge may remain separate where Chromium isolation requires it.

### 3.4 SquareCoil remains authoritative

The Companion observes SquareCoil clock/context state. It must not invent company clock state.

### 3.5 Historical time is authoritative data

Authoritative job time must never be silently deleted merely to make storage smaller.

UI/activity/diagnostic history may have reasonable retention limits. Time ledger data may not be silently pruned.

### 3.6 Existing history must survive the rebuild

The first rebuilt version must read the current timer/archive/history formats and preserve useful saved data.

### 3.7 Themes are presentation, not timer behavior

Website themes and timer appearance must not control application lifecycle or timer-state logic.

### 3.8 GitHub is the development/release source of truth

The extension should be easy to find, restore, test, package, and release from GitHub even if chat history is lost.

---

# 4. Target System Architecture

```text
Browser Extension Shell
│
├── Manifest / permissions
├── Background service worker
├── Popup
├── Browser preferences
└── Update/release integration
          │
          ▼
Companion Application
│
├── Core
│   ├── App controller
│   ├── Lifecycle
│   ├── Feature registry
│   └── Event channel/bus
│
├── SquareCoil Bridge
│   ├── Clock observer
│   ├── Server verifier
│   └── Context parser
│
├── State/Data
│   ├── Timer State
│   ├── Time Ledger
│   ├── Job Index
│   ├── Archive Store
│   ├── Preferences
│   └── Migrations
│
├── Feature Services
│   ├── Timer
│   ├── Job Navigation
│   ├── Recent Jobs
│   ├── Time Overview
│   ├── History
│   ├── Activity
│   ├── Archive
│   ├── Backup/Restore
│   ├── CSV History
│   ├── Time Reporting
│   ├── Themes
│   ├── Support/Feedback
│   └── Developer Support
│
└── UI
    ├── Single renderer
    ├── Settings router
    ├── Components
    └── Presentation styles
```

Exact filenames are intentionally provisional until implementation planning. Ownership boundaries are settled.

---

# 5. Lifecycle Framework

The rebuild needs an explicit application lifecycle instead of using DOM presence as a health signal.

Structural states:

```text
UNINITIALIZED
      ↓
BOOTING
      ↓
READY
```

Recovery path:

```text
BOOTING → FAILED
READY → DEGRADED → RECOVERING → READY
```

Lifecycle owns the resources that must be safely initialized/removed:

- application root;
- event listeners;
- SquareCoil observers/hooks;
- heartbeat/timers;
- cross-tab channel;
- feature initialization;
- UI controller;
- teardown;
- recovery.

A visible timer root is not sufficient proof of readiness.

Detailed transition and retry rules are deferred to Logic Systems Architect.

---

# 6. SquareCoil Bridge

The SquareCoil Bridge is the only module responsible for interpreting native SquareCoil clock context.

It may use the proven current source material:

- DOM clock indicators;
- native clock AJAX actions;
- action 7/header verification;
- jQuery/native event observation where still necessary;
- project/context parsing.

It reports normalized application events such as:

```text
CONTEXT_DETECTED
CONTEXT_CHANGED
CONTEXT_VERIFIED
CLOCKED_OUT
CLOCK_STATE_UNKNOWN
```

It does not:

- render timer UI;
- manage Settings navigation;
- archive jobs;
- write CSV;
- control themes.

---

# 7. Timer Behavior to Preserve

The rebuild must preserve these established product behaviors unless Logic later identifies a contradiction that requires explicit review.

- One actual active Companion timing context.
- SquareCoil is authoritative for actual company clock context.
- Timer tabs represent saved/recent contexts, not multiple concurrent clocks.
- Selecting a tab does not clock the user into that job.
- Switching native SquareCoil context pauses the prior Companion timing context and handles the incoming context.
- Full clock-out pauses Companion tracking.
- Same-project department changes should not unnecessarily reset job-level elapsed tracking.
- Missed/unknown start times are not invented.
- Previously tracked jobs may prompt Resume / Start Fresh.
- Active/pending contexts are protected from ordinary destructive housekeeping.
- Production General remains a supported first-class context.
- Up to the configured maximum visible recent job tabs.
- Tab order persists.
- Single click focuses.
- Double click can expand/open the selected context.
- Normal verification should not reopen a manually collapsed widget.
- Timer thresholds remain configurable.

### Local Pause/Resume

Local Pause remains Companion-only. It does not modify the SquareCoil company clock.

Resume must remain constrained by the actual current SquareCoil context.

Detailed state transition rules are deferred to Logic.

---

# 8. Main Expanded Timer UX

The main expanded view should prioritize useful time information.

Recommended information hierarchy:

```text
260417
Boathouse 31 - US Sign and Mill        RUNNING

TODAY
02:47:18

Job total
18h 32m

[ Pause ] [ Open Job ] [ Delete ]
```

For a General context:

```text
TODAY
01:14:22

Context total
43h 17m
```

### Required concepts

- **Today** = time attributed to this job/context for the current day.
- **Job total** = all authoritative retained time for this job plus current running contribution when applicable.
- Current session may be displayed as secondary information later, but should not visually compete with Today and Job Total.

All features must query the same Time Ledger calculations so Main, Recent Jobs, Archives, Time Overview, and reports never disagree about totals.

---

# 9. Time Ledger

Time becomes a first-class historical system rather than a side effect of timer-state JSON.

### Timer State

Working/runtime information only, such as:

- active context;
- pending context;
- selected context;
- current session;
- hidden tabs;
- tab order.

### Time Ledger

Authoritative historical timing records.

Each historical segment must retain enough data to derive:

- job/context;
- start/end;
- duration;
- date attribution;
- pause/switch/clock-out reason;
- source;
- certainty/confidence where useful.

### Job Index

Owns job/context identity and workspace membership, not historical elapsed truth.

It supports:

- Recent;
- Archived;
- hidden/visible workspace state;
- labels/project IDs;
- last-used metadata.

### Activity Log

Tracks Companion events and diagnostics, not authoritative hours.

Activity may have a bounded retention policy. Time Ledger may not be silently pruned.

---

# 10. Time Overview UX

Settings gains a dedicated **Time Overview** destination.

Recommended Library navigation:

```text
Recent Jobs
Time Overview
History
Activity Log
Archives & Backup
```

## 10.1 Time Overview home

Show high-value summaries first:

```text
TODAY
6h 47m

THIS WEEK
31h 12m

Today by job
260417  Boathouse 31        2h 47m
260481  Retail Home Store   1h 22m
General Production          1h 14m
```

## 10.2 By Day

```text
Aug 25    6h 47m
Aug 24    7h 31m
Aug 23    4h 18m
```

Opening a date reveals the jobs/contexts contributing to that day.

## 10.3 By Job

```text
260417    18h 32m
260481     9h 14m
General   43h 17m
```

Opening a job shows its total and time by day.

### UX objective

Users should be able to answer:

- How much have I recorded today?
- What jobs consumed today?
- How much have I recorded on this job overall?
- What did I work on yesterday/this week?

without exporting a file.

---

# 11. Job Navigation

Create a dedicated Job Navigation feature rather than hiding navigation/search behavior inside timer rendering.

Responsibilities include:

- Open selected six-digit SquareCoil project.
- Support an automatic/search-assisted job lookup flow from the selected Companion job where useful.

Exact search trigger, target field behavior, fallback, and navigation conditions are deferred to Logic.

---

# 12. Recent Jobs

Recent Jobs is a workspace, not the historical database.

Required functionality:

- job number and name;
- current status;
- useful elapsed summary;
- View/Show;
- Open Job;
- Archive;
- Delete where appropriate;
- Archive All;
- Clear Recent.

### Housekeeping correction

**Clear Recent should mean clearing inactive jobs from the working Recent list, not silently deleting authoritative recorded hours.**

If historical time is to be destroyed, that must use an explicitly destructive action.

---

# 13. Archives and Housekeeping

Structural lifecycle:

```text
ACTIVE/WORKING
      ↓
RECENT
      ↓
ARCHIVED
      ↓
EXPLICITLY DELETED
```

Archive is primarily workspace housekeeping.

An archived job retains:

- identity;
- job total;
- daily history;
- authoritative sessions/ledger records.

### Housekeeping rule

The Companion may automatically prune:

- old Activity Log events;
- temporary diagnostics;
- non-authoritative UI events.

The Companion may **not** silently prune:

- job sessions required for authoritative history;
- daily time;
- job totals;
- archived historical time;
- restorable backup data.

The current v0.7.x `MAX_SESSIONS` and archive count limits must not become silent authoritative-data-loss policies in the rebuild.

---

# 14. Backup and Restore Framework

Backup and human reporting have different jobs and should not be forced into one format.

## 14.1 Full Companion Backup

Primary disaster-recovery format.

Recommended file:

`SquareCoil-Companion-Backup-YYYY-MM-DD.json`

A full backup should preserve at minimum:

- schema version;
- extension/build version;
- export timestamp;
- job/context identities;
- authoritative time ledger/history;
- job totals or sufficient records to derive them;
- Recent/Archive membership where useful;
- relevant user preferences;
- migration metadata.

### Restore safety

Restore flow structurally passes through:

```text
File
 ↓
Parser
 ↓
Schema Validator
 ↓
Migration
 ↓
Conflict Resolver
 ↓
Time Ledger / Job Index
```

Never dump uploaded data directly into runtime storage.

A restore must not restore volatile runtime conditions such as:

- active company clock claim;
- pending runtime action;
- open modal;
- temporary boot state.

Restored jobs should return safely as historical/paused contexts until SquareCoil confirms current state.

## 14.2 Portable History CSV

Keep CSV import/export as a portable time-history format that can round-trip compatible job/session data.

## 14.3 Time Report CSV

Add a human-oriented report export.

Recommended report concepts:

- Date;
- Job #;
- Job Name;
- Context Type;
- Daily Hours;
- Overall Job Hours.

A detailed mode may later include session start/end/duration and reason/source.

### Separation

```text
Full Backup JSON
→ disaster recovery

History CSV
→ portable compatible timer history

Time Report CSV
→ readable time reporting
```

---

# 15. Time Calculation Questions Reserved for Logic

The framework supports correct timekeeping, but Logic must explicitly define:

- timezone/day boundary;
- sessions crossing midnight;
- current-running-session contribution;
- rounding/display vs stored precision;
- legacy/imported records;
- duplicate sessions;
- conflict resolution;
- malformed/incomplete session treatment;
- weekly boundaries;
- current-day correction behavior.

These must be settled before implementation of the ledger/reporting layer.

---

# 16. Settings Information Architecture

Recommended Settings Home:

```text
TIMER APPEARANCE
Light | Dark | Auto

PANEL FINISH
Solid | Glass / Blur

LIBRARY
Recent Jobs
Time Overview
History
Activity Log
Archives & Backup

SQUARECOIL
Website Theme

TIMER LIMITS
Yellow | Orange | Red

SUPPORT
Submit a Ticket
Send Feedback

ABOUT
Support the Developer
```

One Settings router owns navigation. Feature modules provide data/actions through defined interfaces, not by inserting controls into another feature's generated DOM.

---

# 17. Timer Appearance

Two independent axes remain.

### Appearance

- Light
- Dark
- Auto

First-install default: **Light**.

### Finish

- Solid
- Glass / Blur

First-install default: **Solid**.

Glass must remain an optional presentation treatment and should keep expensive blur concentrated at outer surfaces rather than stacking blur on every nested panel.

---

# 18. SquareCoil Website Themes

Independent from timer appearance.

### Original

Native SquareCoil website untouched.

### Refined Light

Preserve SquareCoil proportions and recognizable structure with restrained readability/contrast cleanup.

### Sleek Dark

Graphite/charcoal hierarchy with semantic status colors, readable text, restrained borders, and no glaring white outlines.

### Logo policy

- Original: native logo.
- Refined Light: native logo until approved light custom asset exists.
- Sleek Dark: approved custom dark logo.

Do not fabricate a new light-theme logo without an approved asset.

---

# 19. Support / Feedback

Settings includes a lightweight Support module.

Destination email:

`cristian@ussignandmill.com`

Initial implementation should avoid a backend unless one becomes genuinely necessary.

Recommended structure:

```text
Support
├── Submit a Ticket
└── Send Feedback
```

### Ticket categories

- Bug
- Feature Request
- Question
- Other

Suggested fields:

- type;
- subject;
- description;
- optional diagnostics.

### Feedback categories

- Suggestion
- UI / UX
- Feature Idea
- General Feedback

### Diagnostics

Use an explicit privacy-safe whitelist.

Potential safe categories:

- extension version;
- browser;
- current SquareCoil page type;
- lifecycle status;
- module readiness;
- timer appearance;
- timer surface;
- website theme;
- root/runtime health count.

Do not automatically include customer details, project notes, full timer history, CSV content, or private SquareCoil data.

Include a **Copy Diagnostics** action for easy troubleshooting.

Exact validation, transport behavior, and diagnostic fields are deferred to Logic.

---

# 20. Support the Developer

Separate from technical support.

Settings path:

```text
ABOUT
└── ☕ Support the Developer
```

Required content:

- Buy Me a Coffee button/link;
- Cash App QR image;
- Cash App cashtag/name;
- Copy Cash App name;
- playful/quirky copy;
- clear statement that the Companion is free;
- clear statement that updates are free;
- tips are optional;
- no donation tracking;
- no feature locking;
- no startup nags;
- no donation reminders.

Copy direction: friendly, self-aware, caffeine/bug-fix humor, e.g. "fuel the tiny development gremlin," while remaining workplace-appropriate.

Configuration still needed later:

- Buy Me a Coffee URL;
- Cash App cashtag;
- Cash App QR asset.

These do not block logic architecture.

---

# 21. Browser Architecture

One shared Chromium application source.

```text
Shared Companion Core
        ↓
Chromium Platform Adapter
    ↙              ↘
Chrome package    Edge package
```

Do not create separate Chrome/Edge implementations unless a proven browser difference requires an adapter.

### Browser parity requirement

Each browser receives explicit acceptance testing. Passing Chrome does not automatically certify Edge, and vice versa.

### First implementation/release target

The first rebuilt package should be **Chrome-first for acceptance/upload**, while preserving the shared architecture necessary to produce the Edge package without a fork.

Store-specific submission requirements should be verified from current official browser documentation at release time rather than hard-coded into this framework.

---

# 22. GitHub / Update Architecture

GitHub is the recoverable source of truth for source, planning, CI, builds, versions, and releases.

Recommended development flow:

```text
planning / feature branch
        ↓
review
        ↓
main
        ↓
CI validation
        ↓
release/tag
        ↓
build artifacts
    ↙          ↘
Chrome       Edge
```

### Versioning

Use one canonical package version source.

Manifest, popup, diagnostics, release metadata, artifact names, and GitHub release metadata should derive from that version instead of individual modules independently advertising stale package versions.

### Release channels

Architectural support for:

- Stable
- Beta

The rebuild should go through Beta/acceptance before replacing the production release.

### Runtime code policy

Application code should remain packaged with the extension. GitHub is the build/update source of truth, not a mechanism for downloading arbitrary replacement runtime JavaScript into the browser.

---

# 23. Testing and Release Gates

The existing package-validation workflow is not sufficient as a runtime acceptance gate.

Implementation flow, risk-based test selection, cross-stage impact reopening, failure/recovery pairing, and exact candidate advancement are governed by `docs/EXECUTION-ENFORCEMENT-PLAN.md`. The critical requirement-to-evidence ledger is `docs/EXECUTION-GATE-MATRIX.md`.

The rebuilt pipeline should have four levels.

## Level 1: Static/package validation

- JavaScript/build parses;
- manifest valid;
- version consistent;
- required files exist;
- Chrome artifact builds;
- Edge artifact builds.

## Level 2: Unit tests

Examples:

- state normalization;
- migrations;
- ledger queries;
- archive actions;
- backup validation;
- CSV parsing/merge;
- reporting calculations;
- preferences;
- feature registry;
- router;
- diagnostic formatting.

## Level 3: Integration tests

Examples:

- SquareCoil event → state;
- state → ledger;
- ledger → UI totals;
- UI action → service;
- archive/restore → Job Index + Ledger;
- preference → renderer;
- backup/import → migration/store.

## Level 4: Browser smoke tests

Actually load the extension and verify at minimum:

- timer appears;
- Settings gear opens/closes;
- collapse/expand;
- Recent Jobs;
- Time Overview;
- History;
- Activity;
- Archives & Backup;
- Back navigation;
- Pause/Resume controls route correctly;
- job link/open behavior;
- Light/Dark/Auto;
- Solid/Glass;
- website theme selector;
- ticket screen;
- feedback screen;
- developer-support screen;
- extension reload recovery;
- stale-root recovery;
- exactly one runtime/root;
- no duplicate event stack.

Stable release is blocked until required Chrome acceptance passes. Edge receives the same parity gate before its Stable artifact advances.

---

# 24. Performance / Stability Principles

- No document-wide observer for Companion UI patching.
- SquareCoil observation must be targeted to the native elements actually needed.
- Do not create duplicate runtime intervals/listeners after reload/recovery.
- Expensive visual effects remain optional and bounded.
- Time totals should be queryable without repeatedly reparsing the entire application DOM.
- Large historical stores should be abstracted behind a Time Ledger Store so persistence technology can change without changing feature APIs.
- Exact persistence technology is an implementation decision after logic/data-volume review.

---

# 25. Privacy / Safety Principles

- SquareCoil remains authoritative; the Companion should not silently clock users in/out.
- Destructive actions must be clearly distinguished from workspace housekeeping.
- Support diagnostics are opt-in and privacy-whitelisted.
- Donation features do not collect payment information.
- The extension does not track who donated.
- External support/payment destinations should be visible and intentional.
- Restored backups cannot claim a live SquareCoil clock state without current verification.

---

# 26. Proposed Source Organization

Provisional implementation scaffold:

```text
browser-extension/squarecoil-companion/
│
├── src/
│   ├── core/
│   │   ├── app
│   │   ├── lifecycle
│   │   ├── feature-registry
│   │   └── events
│   │
│   ├── state/
│   │   ├── timer-state
│   │   ├── time-ledger
│   │   ├── job-index
│   │   ├── archive-store
│   │   ├── preferences
│   │   └── migrations
│   │
│   ├── squarecoil/
│   │   ├── bridge
│   │   ├── clock-observer
│   │   ├── server-verifier
│   │   └── context-parser
│   │
│   ├── features/
│   │   ├── timer/
│   │   ├── job-navigation/
│   │   ├── recent-jobs/
│   │   ├── time-overview/
│   │   ├── history/
│   │   ├── activity/
│   │   ├── archive/
│   │   ├── backup/
│   │   ├── csv-history/
│   │   ├── time-report/
│   │   ├── themes/
│   │   ├── support/
│   │   └── developer-support/
│   │
│   ├── ui/
│   │   ├── renderer
│   │   ├── router
│   │   ├── components/
│   │   └── styles/
│   │
│   └── platform/
│       └── chromium-adapter
│
├── popup/
├── assets/
├── tests/
├── docs/
└── dist/
```

Do not treat this filename tree as implementation law. The ownership map is the actual requirement.

---

# 27. Hardened Master Work List

This is the original structural planning inventory, not the live completion ledger. Current stage status belongs in `REBUILD-START-HERE.md`; executable requirement/evidence status belongs in `docs/EXECUTION-GATE-MATRIX.md`.

## A. Product and UX

- [ ] Lock UX north star.
- [ ] Define user-facing terminology: Today, Job Total, Recent, Archive, History, Backup.
- [ ] Keep primary timer view low-noise.
- [ ] Define Settings information architecture.
- [ ] Define accessibility/keyboard/focus expectations.
- [ ] Define clear destructive vs non-destructive wording.

## B. Existing feature parity

- [ ] Freeze timer behavior contract.
- [ ] Freeze tab behavior.
- [ ] Freeze Pause/Resume intent.
- [ ] Freeze Recent/History/Activity intent.
- [ ] Freeze archive and CSV compatibility goals.
- [ ] Freeze appearance/theme options.
- [ ] Freeze dark-logo policy.
- [ ] Record all current known defects that must not be considered desired behavior.

## C. Core architecture

- [ ] One application lifecycle.
- [ ] One timer-state writer.
- [ ] One UI renderer/router.
- [ ] Feature registry.
- [ ] Event/service boundaries.
- [ ] Teardown/recovery ownership.
- [ ] No patch-chain architecture.

## D. SquareCoil integration

- [ ] Normalize native context events.
- [ ] Preserve action/header verification knowledge.
- [ ] Define bridge ownership.
- [ ] Define unknown/degraded SquareCoil state reporting.

## E. Time/data

- [ ] Timer State model.
- [ ] Time Ledger model.
- [ ] Job Index model.
- [ ] Activity model.
- [ ] Today calculation contract.
- [ ] Job Total contract.
- [ ] By Day queries.
- [ ] By Job queries.
- [ ] week summary support.
- [ ] midnight/timezone rules.
- [ ] migration from legacy session/history format.

## F. Backup/restore/reporting

- [ ] Full JSON backup schema.
- [ ] Backup version metadata.
- [ ] Restore validation pipeline.
- [ ] Migration pipeline.
- [ ] Conflict-resolution contract.
- [ ] History CSV round-trip contract.
- [ ] Time Report CSV contract.
- [ ] No live-clock restoration from backup.

## G. Housekeeping

- [ ] Clear Recent is non-destructive to authoritative time.
- [ ] Archive retains history.
- [ ] Explicit Delete Job Data behavior.
- [ ] Explicit Wipe History behavior.
- [ ] Define Activity/diagnostic retention.
- [ ] Prohibit silent authoritative-time pruning.
- [ ] Define future ledger compaction rules if necessary.

## H. User time UX

- [ ] Main view Today.
- [ ] Main view Job Total.
- [ ] Time Overview home.
- [ ] Today by job.
- [ ] By Day.
- [ ] By Job.
- [ ] Job detail by day.
- [ ] consistent totals across all screens/reports.

## I. Job navigation

- [ ] Open Job.
- [ ] Define automatic/search-assisted lookup flow.
- [ ] Define missing/invalid project-ID fallback.

## J. Themes/presentation

- [ ] Light/Dark/Auto.
- [ ] Solid/Glass.
- [ ] Original/Refined Light/Sleek Dark.
- [ ] Dark outline cleanup parity.
- [ ] Dark custom logo.
- [ ] Light logo remains native until asset supplied.
- [ ] Keep theme logic independent from timer behavior.

## K. Support

- [ ] Ticket UI.
- [ ] Feedback UI.
- [ ] Email destination `cristian@ussignandmill.com`.
- [ ] Safe diagnostic whitelist.
- [ ] Copy Diagnostics.
- [ ] Initial email transport.
- [ ] Future transport abstraction.

## L. Developer support

- [ ] Support Developer Settings item.
- [ ] Buy Me a Coffee config.
- [ ] Cash App tag config.
- [ ] QR asset.
- [ ] Copy tag.
- [ ] quirky workplace-safe copy.
- [ ] free app/free updates statement.
- [ ] no nags/tracking/paywalls.

## M. Browser/platform

- [ ] Shared Chromium adapter.
- [ ] Chrome acceptance target first.
- [ ] Edge parity after shared core passes.
- [ ] Browser-specific differences isolated to adapters only when proven.

## N. GitHub/update/release

- [ ] GitHub planning/recovery branch.
- [ ] Canonical version source.
- [ ] Stable/Beta concept.
- [ ] automated validation.
- [ ] automated Chrome artifact.
- [ ] automated Edge artifact.
- [ ] release metadata/checksums.
- [ ] preserve historical release checkpoints.
- [ ] verify current official Chrome submission requirements at upload stage.

## O. Tests

- [ ] Unit.
- [ ] Integration.
- [ ] Chrome browser smoke.
- [ ] Edge browser smoke.
- [ ] migration fixture from v0.7.x.
- [ ] backup/restore fixture.
- [ ] legacy CSV fixture.
- [ ] stale-root/reload fixture.
- [ ] no-duplicate-runtime test.

## P. Documentation/recovery

- [ ] Start-here recovery index.
- [ ] Master rebuild plan.
- [ ] Logic stage plan.
- [ ] Architecture/module contracts.
- [ ] Behavior contract.
- [ ] State/time schema.
- [ ] Backup/restore contract.
- [ ] UX structure.
- [ ] Browser parity.
- [ ] Testing/acceptance.
- [ ] Current checkpoint updated at every major stage.

---

# 28. Implementation Sequence After Logic

Do not implement the whole rebuild in one noisy pass.

Recommended implementation order after the staged logic package is approved:

1. Rebuild scaffold + lifecycle skeleton.
2. Browser boot/teardown health.
3. State + migration foundation.
4. SquareCoil bridge.
5. Core timer rendering and basic context behavior.
6. Time Ledger + Today/Job Total.
7. Recent + Time Overview + History.
8. Archive + housekeeping.
9. Backup/restore + CSV/reporting.
10. Themes/presentation migration.
11. Support + diagnostics.
12. Developer support.
13. Chrome browser acceptance.
14. Chrome package/upload candidate.
15. Edge parity and package.

Each stage must be testable before moving to the next.

---

# 29. What Is Explicitly Deferred to Logic Systems Architect

Logic owns the detailed behavior contracts for:

- lifecycle transition conditions;
- retry/recovery/failure behavior;
- Timer State transitions;
- SquareCoil event interpretation ordering;
- Pause/Resume action conditions;
- context switch handling;
- Today/Job Total calculation;
- midnight/timezone handling;
- session completion/splitting;
- archive/delete/wipe conditions;
- backup conflict handling;
- duplicate detection;
- legacy migration rules;
- CSV malformed-data behavior;
- job search/navigation behavior;
- support validation/diagnostics behavior;
- feature failure messaging;
- runtime acceptance conditions.

Framework Architect should not invent these during implementation.

---

# 30. Open Configuration Inputs

Not blockers for Logic:

- Buy Me a Coffee URL;
- Cash App cashtag;
- Cash App QR asset;
- future custom light-theme logo;
- final Chrome distribution destination if different from current development/package workflow.

---

# 31. Readiness Gate

## Framework ready for logic

Reason:

- scope boundaries are clear;
- module/layer ownership is clear;
- one UI/state/lifecycle model is established;
- major feature placement is clear;
- historical time ownership is clear;
- backup/reporting/housekeeping boundaries are clear;
- browser and GitHub direction is clear;
- UX priorities are clear;
- remaining uncertainty is primarily behavior-level logic or configuration.

### Settled structural items

- Shared Chrome/Edge source.
- Chrome-first rebuild acceptance target.
- Single Companion application runtime ownership.
- Single state writer.
- SquareCoil bridge.
- Time Ledger + Job Index split.
- Today + Job Total in main view.
- Time Overview.
- Full Backup + History CSV + Time Report CSV separation.
- Non-destructive Recent housekeeping.
- Archive retains authoritative time.
- Support + feedback module.
- Optional developer-support module.
- Theme separation.
- GitHub recovery/release architecture.
- Staged Logic then staged implementation.

### Provisional implementation items

- exact filenames;
- bundler/build tooling;
- persistence technology for large ledger data;
- final micro-layout;
- external donation configuration;
- custom light logo;
- store-specific upload details.

### Blockers

None upstream for beginning staged Logic specification.
