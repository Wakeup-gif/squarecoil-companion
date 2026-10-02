# Cloud Codex handoff: SquareCoil startup and hour tracking

## Start here

Repository: `Wakeup-gif/squarecoil-companion`.
Working branch: `fix/clock-detection-custom-dark-logo`.
Project directory: `browser-extension/squarecoil-companion/`.

Continue this existing repair. The user reports that Companion never recognizes being clocked in and records no hours. They also requested the custom US Sign & Mill dark logo. The first code repair is complete, but their actual installation remains blocked earlier in startup by legacy migration. Do not describe the user's problem as fixed until the blocking migration and subsequent clock observation are verified.

Read `AGENTS.md`, `docs/EXECUTION-ENFORCEMENT-PLAN.md`, the active migration rows in `docs/EXECUTION-GATE-MATRIX.md`, `logic/L2-STATE-TIME-MIGRATION.md`, relevant L1/L3/L4/L6/L7 contracts, and this handoff before changing dependent behavior. Old checkpoint/release evidence is historical. The user authorized diagnosis and fixes, a review branch, and test packages; main/release/store promotion and live native clock writes remain outside this task.

## Actual installed diagnostic

Reported October 2, 2026, at 09:24 EDT, captured `2026-10-02T13:24:15.903Z`:

```text
Package: SquareCoil Companion 0.7.2
Build: rebuild-b6-release-candidate / B6
Candidate: a1456165ee4881dfff37c14d4270f552d5104d0c89c045b58119753bd36ba999
Browser: Chrome 154.0.0.0
Page type: general-page
Lifecycle: legacy-preflight-failed
Coordination generation: 2
Settlement: blocked
Migration: FAILED / legacy-preflight-failed
Bridge: UNAVAILABLE / unavailable
Bridge generation: unknown
Bridge reason: none
Last internal error: authority-command-failed
Core readiness: blocked
Timer appearance: LIGHT / LIGHT
Panel finish: SOLID / SOLID
Website theme: ORIGINAL / ORIGINAL
Runtime roots: 1
```

This confirms the user loaded the intended v0.7.2 package. Migration failed before Bridge creation, so this report supplies no evidence about the repaired clock parser's live behavior. It does not identify the exact underlying migration exception. Do not infer a server response format, corrupt dataset, or successful clock-in detection from it.

## Completed first repair

Source commit: `93b5bf16ad9fbb7ddab89f5dfdea76316dace4e5`.
Source tree: `4de8a2555bf4b8e6b88f4dc2b92cccc3815c9d21`.
Original base main: `1cc27cc55dee3f62b1f04f30f462232c94fed7ef`.

- Safe action-7 inner HTML fragments now recognize validated tenant project anchors. Plain error strings and bare six-digit numbers remain UNKNOWN; audited-wrapper fallback is preserved.
- Explicit project-zero department links and exact Department (General) labels normalize consistently, including `production-general`. Conflicting identities remain rejected. Native action3 project-zero correlation recognizes General contexts.
- Computed CSS visibility is used for audited native clock controls. Missing/malformed evidence affects capability truthfully.
- Initial UNKNOWN/CONFLICT observations now reach canonical Timer state without inventing a context or time. Workspace and popup show Clock not detected; stronger lifecycle/reload instructions retain precedence.
- Dark modes use the packaged original custom transparent logo, `assets/us-sign-dark-logo.png`; clipping and 1px limits are reset. Native image changes survive failures, theme switching and teardown. Light handling is preserved.

The installed build's package ZIP SHA-256 is `4c67b096ff518a3eb48d76c67d4d5c5173e7f4abb11d94b2bb8b314399b21456` for both browser filenames. Canonical inventory is 16 files. All 725 automated test executions and exact-source package/ZIP round-trip validation passed for that first repair. Installed Chrome/Edge and this user's retained data were not validated. See `implementation/CLOCK-LOGO-REPAIR-2026-10-02.md`.

## Where the current failure occurs

`src/content/trusted-transition-core.js`, `resolveMigrationAndBridge()`:

1. `inspectLegacyMigration()` captures retained localStorage.
2. On REQUIRED + OWNER, the core sends `MIGRATE_V07` with captured `legacySources` and the expected revision.
3. `src/extension/authority-router.js`, `command()`, wraps an adapter exception as `authority-command-failed`, retaining the underlying exception in `response.detail`.
4. `src/extension/authority-client.js`, `requirePositive()`, attaches that response to `error.response` while keeping a generic message.
5. If rereading the document does not yield COMPLETE_MATCH, the core reports FAILED/legacy-preflight-failed and returns before creating the Bridge.

Malformed top-level JSON normally fails preflight before a migration command. This reported generic authority error is consistent with a nested conversion, validation, persistence or revision failure after dispatch, but does not distinguish them.

The branch also includes a source-only diagnostic correction after the installed build: a finite allowlist extracts specific migration failure codes into existing `core.lastError`, strips private validator suffixes, and leaves unknown details generic. Inspect the current diff/commit before reimplementing it. That correction has not been installed by this user. Keep it separate from claims that their migration is repaired.

Diagnostic correction evidence: `UT-B2-MIG-033/034` cover fixed reasons, private suffix removal, unknown/raw error exclusion, retained bytes and one-time import on repaired-cause retry. The focused migration/recovery/composed tests pass 29/29. The final `npm run check:b6-candidate` for this source correction passes 711 unit/integration cases plus 16 prototype cases (727 total), with zero failures/skips/todos. Diff checks pass. The migration compatibility adaptation described below is still for Cloud Codex to implement, and no new browser ZIP was delivered for this diagnostic patch.

## Reproduced authentic compatibility failure

An independent audit reproduced this old producer sequence using fictional data:

Historical release commit: `7e6efbce1bdeaa4918e5693eb2f72ba43c747b97`. Its root `page/timer-runtime.js` and `page/timer-workspace.js` blobs are byte-identical to the copies in this project's `page/` directory. The failure was also reproduced through the actual default kernel -> router -> client -> trusted core, with zero committed contexts, intervals or migration markers and document revision unchanged.

1. `page/timer-workspace.js`, `pauseSelected()`, writes `meta.manualPausedKey` and Pending.
2. `page/timer-runtime.js`, `observe()` with clock-out, clears Pending/observedClockKey but leaves manualPausedKey.
3. Its `onClick()` Clear all handler removes non-active/non-pending contexts while still leaving manualPausedKey.
4. The saved schema-3 CURRENT object can therefore contain an orphan manual pause reference.

Minimal fictional retained source:

```json
{
  "schema": 3,
  "contexts": {},
  "active": null,
  "pending": null,
  "meta": { "manualPausedKey": "job:123", "observedClockKey": null }
}
```

Use the source as the JSON string value of `ussign-squarecoil-job-timer-v1`, with other keys absent. Preflight returns REQUIRED. `migrateV07()` throws `legacy-local-pause-context-missing` in `migrateLegacyLocalPause()` because the referenced group is missing. Through the full authority path, this produces the same generic error and blocks Bridge startup. This is a demonstrated producer/migration compatibility defect and a plausible live cause, **not confirmation of this user's exact cause**.

A second fictional case, conflicting completed intervals with the same session ID, also produces the same generic error (`legacy-session-id-conflict`) and correctly rolls back. Preserve that conflict rejection. The two cases show why blindly unblocking every migration error would risk saved hours.

Normal authentic producer shapes for completed history, verified Active recovery, and manual-paused Pending successfully migrate through the real kernel/router/client in memory. No universal authority commit or protected metadata failure was found.

## Instructions for the next implementation

1. Verify the source-only diagnostic correction and add/retain a composed test proving the real router/client exception reaches a fixed privacy-safe reason. No raw retained data, labels, project/session IDs or exception text may enter automatic diagnostics.
2. Add the authentic orphan-manual-pause producer journey as a failing composed regression, including unrelated valid completed hours. Determine the narrow safe adaptation under L2's non-live recovery rules: when deriving a pause solely from `meta.manualPausedKey`, treat an absent context as a stale, non-live hint and record a fixed diagnostic. Preserve the original bytes and trustworthy history, creating no context, time, Active/Pending or pause state. Keep rejection strict for explicit `localPause`, unresolved Active/Pending references, invalid sessions, conflicting IDs, malformed authority-sensitive sources and persistence failures.
3. Exercise successful atomic/idempotent migration, retained source equality, exact saved totals, no duplicate intervals, no live state restored from legacy, Bridge startup after COMPLETE_MATCH, and fresh current clock observation. Test failure -> repaired cause -> explicit retry in the same core.
4. If the actual user's specific safe reason is available, resolve that demonstrated cause. If it remains unknown, finish the authentic compatibility repair and diagnostic visibility, then explicitly request the new privacy-safe diagnostic after installation. Do not claim their exact profile is fixed or ask for screenshots or a raw dump of their hours.
5. Keep the existing clock/logo fixes intact. Native action1 is only a modal opener; exclusion from completed native actions is not a demonstrated defect. Header `data-time` is labor remaining, not elapsed time or a proven job identity. Existing 90-second verification-gap and Pending/Resume policies are unchanged by this task.
6. After targeted gates pass, run `npm run check:b6-candidate` once. Build from clean committed source with `npm run build`. Use `scripts/package-inventory.js --copy-to <empty-directory>` and `scripts/validate-package.js <directory> --expected-source-sha <actual-commit>`; create root-level Chrome/Edge ZIPs and validate extracted bytes. Use a new version, such as 0.7.3, for the next installed test build. Update release metadata as test-only and record the new source SHA, fingerprint and ZIP hashes.
7. Run available installed Chrome/Edge clean and upgrade gates, especially migration recovery. If browsers or the live profile are unavailable, say precisely what remains unverified. Prior PASS rows certify prior bytes only. No main merge, store submission or stable rollout.

Useful targeted files/tests:

- `src/data/{legacy-preflight,migration,migration-command,model,store}.js`
- `src/content/trusted-transition-core.js`
- `src/extension/{authority-router,authority-client,authority-kernel}.js`
- `tests/b2/{migration,legacy-preflight,migration-command,trusted-transition-core-recovery}.test.js`
- `tests/b2-integration/{timer-authority,authority-router,bridge-timer}.integration.test.js`
- `tests/b5/support.test.js`
- Historical producers: `page/timer-runtime.js`, `page/timer-workspace.js`; these are evidence, not the rebuilt runtime entrypoints.

## Non-negotiable data safety

Never delete, rewrite or clear the user's three retained localStorage sources to make migration pass. Do not advise removing the extension or using Clear all as a fix. Never bypass migration to start a fallback writer. Keep one fenced authority, atomic validation, exact acknowledgments, no guessed hours, no imported live state, and no native SquareCoil mutations. Synthetic tests may change fictional inputs to model recovery; real source bytes remain forensic evidence.
