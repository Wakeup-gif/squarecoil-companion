# v0.7.6 authority reconciliation repair — test only

User v0.7.5 reports client OWNER, migration REQUIRED, no migration error, Bridge unavailable and DEGRADED legacy-migration-required. Exported diagnostic log contains worker start/install, COMPANION_FAILED and COMPANION_LIMITED; it does not reveal a retained-record validation error. A stale authority callback reproduces the exact client/core disagreement without changing the live client.

## Cause and repair

Controller queues authority health callbacks behind initialization and core reconciliation. handleAuthoritySnapshot previously used the callback's captured disposition and tenure when that queued work finally ran. An older OBSERVER/UNAVAILABLE snapshot could overwrite the client's newer OWNER in the core. The subsequent read succeeds through the current client, but preflight uses stale core authorityOwner=false, leaves migration REQUIRED and clears a previous failure. No Bridge starts. Ordinary unchanged healthy client status need not produce a corrective callback.

The core now reads authorityClient.snapshot inside its serialized reconciliation and rechecks after an authoritative read, because that read can reconnect or transfer ownership. Captured callback state cannot revive or demote a newer tenure. Migration still goes through the OWNER-only directOwner router fence and atomic kernel validation. Saved hours, legacy source bytes, recovery rules, parser and custom dark logo fixes remain protected. Popup now also copies finite Core authority (OWNER/OBSERVER/uninitialized) to distinguish the two sides if another issue occurs.

This fixes a demonstrated cause consistent with the user's state. It does not prove every live retained record passes strict validation. Genuine failures remain FAILED with their sanitized error rather than being hidden as REQUIRED.

## Verification

Node22.22.0. IT-B2-MIG-SYNC-001 failed before the repair with current client OWNER but core authorityOwner false. After repair, delayed observer callbacks trigger one real atomic import, preserve the existing 3,600,000ms session/source bytes, attach the real Bridge, detect a fresh job and finalize exactly2,000ms additional time with zero native clock mutation requests. Replayed stale callbacks do not import twice.

IT-B2-MIG-SYNC-002 preserves a real strict local-pause validation failure/underlying error under stale UNAVAILABLE, leaves authority unchanged, and rejects stale OWNER after client disconnect without another import. IT-B2-MIG-SYNC-003 checks acquisition during an authoritative read uses the final current OWNER/tenure and imports preserved history once. Independent read-only review found no blocking safety issue.

Final targeted core/client/integration:27 passed. Background/popup/full built controller boundary cluster:77 cases, with its only interim failure caused by the changed document title assertion; the corrected3 document cases then passed. Final npm run check:b6-candidate:738 executions passed, zero failures/skips/todos, including all affected clusters, theme freshness and B6 validation. git diff --check passed.

## Exact package

Source:7e1cc611b9fbe65a1e3dfa5a5042da2da135c423.
Version:0.7.6; version_name:0.7.6 Authority Reconciliation Repair TEST; channel:test.
Fingerprint:d56eed0c684b004b94c7d306b39e6d1bb1e8f17bb033adbfc7948545420ba6a5.
Canonical inventory:16 files; sourceDirty:false.
Chrome/Edge ZIP SHA256:2159a5cebd523a14336bd667efae05a5123fbe77bf55086ab22e8e7e9fbfdf55.

Clean-source validation, both extracted-package validations and byte-for-byte ZIP roundtrips pass. Tracked test artifacts:packages/test-builds/v0.7.6. Detailed logs/JSON:/workspace/artifacts/squarecoil-v0.7.6.

## Limits and next live check

Branded Chrome/Edge are unavailable; supplemental Chromium loadUnpacked remains blocked by administrator policy. Installed-browser acceptance, actual user-profile migration, live job detection and hour accrual remain unverified. No main merge, stable release, Store submission, retained source writes or native clock mutation.

Replace files in the existing unpacked extension folder, Reload that extension, refresh SquareCoil, check active job detection and Copy diagnostics if still Limited. Do not uninstall or clear data. A remaining migrationError needs a record-shape reproduction; do not bypass validation or discard hours to force readiness.
