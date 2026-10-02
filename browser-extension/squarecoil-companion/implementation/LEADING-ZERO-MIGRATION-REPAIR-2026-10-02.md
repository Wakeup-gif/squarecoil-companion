# v0.7.4 leading-zero migration repair — test only

Branch: `fix/clock-detection-custom-dark-logo`. No main merge, stable release, Store submission or native clock mutation.

## Demonstrated live blocker

Installed v0.7.3 reports healthy OWNER authority, FAILED migration, `legacy-context-identity-invalid`, and no Bridge. The user's privacy-safe structural summary identifies five General records, 25 ordinary numeric job records, and one leading-zero job record, all in CURRENT. No raw job/customer labels, IDs, histories or legacy source values were collected.

The historical `page/timer-runtime.js` producer keeps numeric IDs exactly as returned from the project link, including leading zeros. Rebuilt migration rejected them. The current Bridge already canonicalizes digit-only link IDs by removing leading zeros. Migration now uses the same string rule, preserving long IDs without Number conversion. Original keys bind as legacy references, so padded Pending/Active/pause references still resolve for non-live recovery. Original source bytes remain unchanged. Canonical duplicate histories merge by the existing strict deduplication/baseline rules; they are not added twice. Numeric alias conflicts, all-zero IDs, malformed explicit IDs and conflicting session IDs remain rejected atomically. The v0.7.3 orphan pause repair and earlier clock/logo repairs remain intact.

## Verification

Node 22.22.0. The three new regressions failed before the repair and passed afterward:

- `UT-B2-MIG-PAD-001`: padded current + canonical archive share one Context, exact dated/undated totals, duplicate suppression, idle imported Timer, idempotent replay, key-only fallback and long-ID precision.
- `UT-B2-MIG-PAD-002`: zero, malformed and contradictory padded identities and conflicting sessions reject without changing the authoritative document.
- `IT-B2-MIG-PAD-001`: real default kernel/router/client/core/Bridge path preserves source equality, both saved contexts' history and exact balance, resolves padded Pending/pause aliases without live restoration, settles COMPLETE_MATCH, imports once and starts from fresh current observation with zero native mutation requests.

Targeted suite: **111 passed**, zero failures/skips/todos. Final `npm run check:b6-candidate`: **717 unit/integration + 16 prototype = 733 passed**, zero failures/skips/todos; theme freshness and B6 validator passed. `git diff --check` and browser harness syntax passed. The installed upgrade fixture now combines a padded numeric identity with the orphan pause hint and exact dated/undated hour assertions; its actual installed execution remains unverified.

## Exact package

Clean source: `21a637bb6e1fe7260314f57e894b1d92bd8f3a9d`.
Version: `0.7.4`; version_name: `0.7.4 Legacy Job Identity Repair TEST`; channel: `test`.
Internal build: `rebuild-b6-release-candidate` / B6; this is not stable acceptance.
Fingerprint: `d6a77ed1052af40417efe772954c806a5351f9d482781d149769c2c807b34f82`.
Canonical inventory: 16 files; sourceDirty: false.
Both Chrome/Edge ZIP SHA-256: `7aef041e437c162f23e65aa2d9d32d361115222429ff57425000be92e7c13bd1`.

Canonical copy, clean exact-source validation, extracted Chrome and Edge validation and byte comparisons passed. The unchanged ZIPs are tracked as test artifacts under `packages/test-builds/v0.7.4/` for direct GitHub download. Detailed JSON and test logs are retained at `/workspace/artifacts/squarecoil-v0.7.4/`. Artifact/evidence commits after the source commit do not alter the packaged source identity.

## Still unverified

Branded Chrome/Edge clean/upgrade gates remain unrun because their executables are unavailable. The prior supplemental Chromium attempt established that administrator policy disables Extensions.loadUnpacked; no policy/runtime change occurred, so that identical blocked operation was not repeated. None of these limits is claimed as a passing installed-browser gate.

The actual user profile after installing v0.7.4, current live clock response, actual job detection and hour accrual remain unverified. The structural summary does not establish the contents of every saved record or exclude a later migration blocker. After updating the existing unpacked extension folder and reloading the extension/page, check migration and Bridge status. Do not uninstall, clear saved hours, rewrite retained data or bypass migration to force startup.
