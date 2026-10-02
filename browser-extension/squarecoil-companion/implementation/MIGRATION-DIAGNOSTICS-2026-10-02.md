# v0.7.5 migration diagnostics — test only

The actual installed v0.7.4 profile remains Limited with legacy-migration-required. Its supplied diagnostic export contains only lifecycle events and does not establish the current underlying migration error. Do not claim this build repairs the remaining profile failure.

The MAIN shell's migration-blocked classification previously skipped B2 settlement entirely. Popup diagnostics therefore omitted the isolated core's actual failure, despite Console being able to inspect it. The blocked-shell health path now obtains an exact document/runtime/worker acknowledgment using CONFIRM only. It cannot refresh authority, run migration, start the Bridge, or promote the blocked shell to READY. Existing settlement gating remains unchanged. Controller projects only the finite migration reason whitelist, omitting raw exceptions, sources, labels, histories and Timer state. Popup displays/copies authority, migration disposition, sanitized error and Bridge capability; subsequent health replaces stale diagnostics.

Historical page/timer-runtime.js reads clock DOM and verification responses directly and saves to page localStorage. It has no extension authoritative import preflight, explaining why it could track with retained source shapes rejected during migration. The pasted v1.1.4 userscript is a presentation patch; its @require scripts supply timing behavior. This observation does not establish another specific migration defect.

## Verification

Node 22.22.0. Targeted background/popup: 55 passed. Full npm run check:b6-candidate: 735 passed, zero failures/skips/todos, theme freshness and B6 validator passed. Tests cover real failed core -> finite settlement projection, popup render/copy and stale error clearing, and background migration-blocked -> exact CONFIRM-only acknowledgment -> diagnostics while preserving DEGRADED/non-READY. Prior migration atomicity, saved-hours preservation, padded identity, parser and custom logo regressions remain green.

Clean source: 18adc9615758419f3c71ccb4298bd6636fec41a4.
Version: 0.7.5; version_name: 0.7.5 Migration Diagnostics TEST; test channel.
Fingerprint: 1cc311635fb1b28a68af2a8d7647d0715538bcd5cefbd0eef6eb47fd9a3401d9.
Canonical inventory: 16 files; sourceDirty false.
Chrome/Edge ZIP SHA-256: 02669370eeb60d769311e425f588d195be364c0f1cda9a195f3cb89b5249485e.

Exact clean-source validation, both extracted packages and byte-for-byte ZIP roundtrips passed. Test artifacts are tracked in packages/test-builds/v0.7.5; detailed evidence is in /workspace/artifacts/squarecoil-v0.7.5.

## Still unverified

Branded Chrome/Edge are unavailable. Supplemental Chromium previously could not load unpacked extensions under administrator policy; that unchanged blocked operation was not repeated. Installed browser execution, actual popup diagnostics on the user profile, the remaining migration error, live job detection and hour accrual remain unverified. No main merge, stable release, Store submission, retained-source edits or native clock writes.

Update the existing unpacked extension folder, Reload the same extension, refresh SquareCoil, and Copy diagnostics from the popup. Do not uninstall or clear saved data. Use the new Migration error to reproduce and repair the actual remaining record failure rather than bypass import.
