# v0.7.3 migration startup repair — test candidate

Branch: `fix/clock-detection-custom-dark-logo`. No main merge, stable release, Store submission, or live SquareCoil mutation.

## Repair and safety

The historical workspace Pause -> runtime clock-out -> Clear all sequence leaves `meta.manualPausedKey` pointing to a missing Context. Migration now ignores only that non-live metadata hint and records `LEGACY_ORPHAN_MANUAL_PAUSE_IGNORED` without labels or IDs. Original localStorage bytes are never rewritten or removed. Trustworthy dated history and undated balances still migrate atomically. No Context, hours, Active/Pending or pause evidence is fabricated from the hint.

Explicit `localPause` remains strict, including a malformed non-record value (`legacy-local-pause-invalid`). Unresolved Active/Pending references, session conflicts, malformed authoritative sources and persistence failures still block startup and roll back. The finite diagnostic allowlist reports only fixed reasons; unknown exception text remains generic. The previous clock-parser and packaged custom dark-logo fixes are retained.

This is a demonstrated producer compatibility repair, not proof of this user's exact live failure cause.

## Automated evidence

Node 22.22.0 (CI baseline). Targeted migration/authority/Bridge/clock parser/logo/support suite: **158 passed, zero failures/skips/todos**. New composed tests use the real default kernel -> router -> client -> trusted core; the successful journey also uses the real Bridge:

- `IT-B2-MIG-COMPAT-001`: authentic producer-shape orphan hint, three unchanged retained sources, unrelated one-hour completed history, exact totals, no ghost Context or imported live pause, COMPLETE_MATCH before Bridge startup, idempotent settlement, fresh clock observation and exactly two seconds of newly finalized time; zero native mutation requests.
- `IT-B2-MIG-COMPAT-002`: explicit pause, malformed pause, orphan Active/Pending and conflicting session failures leave authority unchanged; real router exception reaches a fixed privacy-safe reason; fictional repaired cause -> explicit same-core retry -> one import.
- `IT-B2-MIG-COMPAT-003`: failed actual persistence commit leaves revision/history/marker unchanged; same-core retry imports once with source equality.

Final `npm run check:b6-candidate`: **714 unit/integration + 16 prototype executions = 730 passed**, zero failures/skips/todos, theme-port freshness and B6 validator passed. `git diff --check` passed. Initial aggregate attempts exposed missing historical theme Git objects, stale checkpoint test expectations, and the new fixture naming mismatch; all were corrected and the complete final gate passed. No theme output changed.

The installed upgrade fixture now includes the orphan hint plus 2 dated hours and a 0.5-hour undated balance, asserting preserved totals, the fixed diagnostic, no ghost pause/Context, and fresh current clock state. Its installed execution remains blocked below.

## Exact packaged identity

Clean implementation source: `725f7d8046c0e5d89d890c18a8d0c3a50f44824f`.

Package version: `0.7.3`; `version_name`: `0.7.3 Migration Startup Repair TEST`; release channel: `test`.
Build: `rebuild-b6-release-candidate` / B6. This historical internal build ID does not mean stable acceptance.
Candidate fingerprint: `30aafc7e5d6c969a33e115bbdf92851e2de7d7034de20d3458fa1f71c02b1b3a`.
Canonical package: **16 files**, `sourceDirty: false`.
Inventory digest: `7451a36d8baaf497828dd4b4feb69a5eb92a3c60412beca69f73a2fdb5dac59f`.

Root-level Chrome/Edge archives have identical bytes and SHA-256:
`644408a63baf456aef72ebd8728fc5a2989f481762df79bf93f5d7e43e0b688b`.

- `SquareCoil-Companion-v0.7.3-TEST-CHROME.zip`
- `SquareCoil-Companion-v0.7.3-TEST-EDGE.zip`

Canonical copy, clean exact-source validator, both extracted ZIP validators, all file byte comparisons and before/after archive hash checks passed. Artifacts and detailed JSON/log evidence are in `/workspace/artifacts/squarecoil-v0.7.3/`. Later documentation commits do not change these SHA-bound packaged bytes.

## Unverified / external blockers

Installed Chrome and Edge clean/upgrade acceptance: **UNRUN / unavailable binaries**. The harness returns overall FAIL due to missing fixture coverage, while each actual browser/profile result is UNSUPPORTED (executable absent). This is an environment blocker, not an application assertion failure.

Supplemental Chromium 151 upgrade: **UNRUN / administrator restriction**. `Extensions.loadUnpacked` returns “Loading of unpacked extensions is disabled by the administrator.” No migration assertions ran. The supplemental result cannot certify Chrome or Edge acceptance.

Actual retained user profile, live clock response, installed logo rendering, and live hour tracking remain **unverified**. Prior PASS rows certify prior bytes only. The package is a test candidate, not accepted for stable promotion.

After installing v0.7.3 into the existing extension/profile without clearing retained data, retry/reload as appropriate and share the new privacy-safe diagnostics (especially Migration, Bridge, Core readiness and Last internal error). Do not share a raw hours dump or customer/job content. Do not uninstall, clear saved hours/legacy keys, or bypass migration as a workaround.
