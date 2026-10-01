# Combined worktree review candidate

Date: October 1, 2026. Branch: `codex/squarecoil-combined-2026-10-01`.

Main Development input: `608ddab4206810788570632518809d22bd345de1`.
UI Edits input: `9f79a2094da6f2baa04120933ef635126ae2c05b`.
Common base: `99879446352364035904af640845ba6c5a43a570`.

## Preserved behavior

- Main: local bounded diagnostic history and popup JSON download; toolbar theme/photo/panel controls; full-size portable exports and restore choices; fenced settings retry; quiet/idempotent theme updates and wallpaper recovery; Chrome Web Store release preflight.
- UI: compact polished timer, inspected-job/current-job navigation, smooth menus/loading, horizontal tabs, Clear appearance, separate dashboard features, Quick file paths, read-only native-clock shortcut, and fictional local preview.
- Both original branches and worktrees remain intact. The older dirty primary checkout is outside this integration.

## Overlap resolutions

- Preferences retain schema v3 and explicit photo Off alongside Clear and quick tools. A combined persistence/backup regression verifies MERGE and REPLACE without importing live timing state.
- Backup UI retains polished labels and all restore options, full-history serialization, 32 MiB bounds and privacy-safe error handling.
- Theme generation retains both light refinements and final quiet/performance overrides. Clear blur applies only to effective Glass, respecting reduced transparency.
- Lab and installed Settings journeys retain both branches' checks and the seven-category Features navigation.
- Worker diagnostic tests cover exact popup authorization, retention/privacy, unrelated state preservation and storage failure recovery. Installed no-login download and Clear accessibility journeys are part of the combined matrix.

## Development verification

- Focused source tests: 264/264 passed; combined preference/backup tests: 3/3 passed; diagnostic worker suite: 33/33 passed.
- Sealed Chrome and Edge lab smoke passed against pre-final development bytes. These are diagnostic results, not exact-package certification.
- One stale documentation oracle failed the initial aggregate before any B2-B5 suite ran. Checkpoint documents and that oracle now agree on the combined branch; the focused document suite passes.
- Aggregate unit/integration suites passed 685/685; prototype suite passed 16/16. Static validation initially rejected the new fixture names; three literal `IT-B5-MERGE-PREF-*` IDs now pass their focused suite and the full static validator. Theme ports are fresh and whitespace checks pass.
- Repository main `30bacd6f4262623ff9fff363e6d2ea516d02c2d1` is included; its README conflict retained modern candidate behavior and the legacy-runtime warning. Main's changed historical script is not an input to the authoritative theme generator or compiled extension.
- Clean source/package identity and installed Chrome/Edge clean/upgrade results are recorded below.

The first installed attempt was stopped after exposing stale Overview labels and an invalid diagnostic fixture. An extension tab correctly fails the popup-only sender boundary; the corrected harness opens the genuine toolbar action popup and uses trusted input. Disposable Chrome 154 and Edge 154 probes each downloaded the actual 603-byte privacy-safe JSON successfully. Exact route/navigation assertions replace obsolete labels. These are harness corrections, with no relaxation of source authorization. GitHub aggregate validation run `36909254828` passed at source `3354497682d031532eeaf1d1437a22af790dd513` before the harness correction.

GitHub aggregate validation run `36910175238` passed at frozen implementation source `8426b242e26cc418228f66268b6e69040737b532`. Clean sealed visual lab runs on the same fingerprint passed in Chrome `154.0.8037.58` and Edge `154.0.4258.48`, with 17 hashed screenshots each, no browser errors or unexpected requests, preserved canonical state, and zero native clock clicks. The `chrome-lab-v2/visual-evidence.json` and `edge-lab-v2/visual-evidence.json` manifests are supplemental visual evidence for the exact candidate.

The first exact v2 installed matrix completed Chrome clean 31/31 and upgrade 2/2. Edge downloaded the genuine popup diagnostic JSON and later passed upgrade 2/2, but clean-profile setup stalled. Only the verified disposable Edge browser was closed, producing the diagnostic failure report `installed-browser-evidence-v2.json`; that attempt does not certify the complete matrix. A focused probe reproduced Edge's native `edge://downloads-hub/` page: closing it as an ordinary Playwright tab never settled. The corrected harness skips only that exact browser-owned panel during startup cleanup, records its URL, uses a fresh focused fixture page, and bounds and labels navigation. The real diagnostic assertions and all case IDs remain intact. Exact setup-helper probes passed in both browsers, including final context cleanup; a never-settling operation correctly failed at its hard deadline. This tooling correction changes no candidate fingerprint inputs or packaged bytes; final clean/upgrade results must supersede the interrupted Edge attempt. A leftover temporary test profile was retained after automatic cleanup approval was rejected.

Evidence directory: `C:/Users/iamva/Documents/SquareCoil Companion Evidence/combined-2026-10-01/`.

## Exact combined package acceptance

Accepted implementation source: `8426b242e26cc418228f66268b6e69040737b532` (`sourceDirty: false`). Browser tooling correction: `5efed692311a259029acc0937e249c13be877670`. Later acceptance documentation does not change runtime fingerprint inputs or the certified package.

- Candidate fingerprint: `97cb370241775147531fc4f8411d632239fc97c80a73382bd8e3a6699eaa3ede`.
- Canonical inventory: 15 files; before/after digest `893797d3dd69889820702d1a0b0f2276dfc42959585ae45c3d2577089914df60`.
- ZIP: `SquareCoil-Companion-Combined-8426b24.zip`; before/after SHA-256 `e1bb736d734e1a51e3238726a8b2a7f9de0d6103ef7e2631d512b94e83ec1731`.
- Package validation and ZIP round trip are acceptance-eligible with the exact source SHA, clean build identity, and matching inventory.

| Browser | Clean profile | Valid v0.7 upgrade | Raw report |
|---|---|---|---|
| Chrome `154.0.8037.58` | 31/31 PASS | 2/2 PASS | Chrome profiles in `installed-browser-evidence-v2.json` |
| Edge `154.0.4258.48` | 31/31 PASS | 2/2 PASS | `installed-edge-final.json` |

The derived `combined-acceptance-summary.json` verifies the four mandatory profiles and their declared fixture coverage against the same artifact hashes. It preserves the original interrupted report as FAIL and selects only its fully passed Chrome profiles; the final Edge report is independently PASS and acceptance-eligible. There are 66 passed cases, zero failures or unsupported cases in the selected profiles, zero native mutation attempts, no unexpected requests or browser errors, and no final-profile cleanup warnings. Real toolbar downloads passed in both browsers with trusted clicks, zero SquareCoil tabs/cookies, the exact privacy-safe JSON schema, and 603 bytes each. Clear reduced-transparency fallback and seven-group Settings navigation passed in the installed matrix.

Raw report SHA-256 identities: `installed-browser-evidence-v2.json` = `2ba29bd244cf7a8d813a786743501bbf7620b0957476beb09a8f78ed4f2d1067`; `installed-edge-final.json` = `2e5adc32bdcaf6d3467dbcfc59469bc479c77e17363efe14717d1ce4e0ad3670`. Derived summary SHA-256: `ed5da7c79a917959e4af5ec763a962dc4d1a746624dc9386e7434be25030264e`.

Both original feature worktrees were rechecked clean at their input commits. Repository main remains `30bacd6f4262623ff9fff363e6d2ea516d02c2d1`. Review PR: [#5](https://github.com/Wakeup-gif/squarecoil-companion/pull/5). GitHub aggregate validation passed at accepted source `8426b24` (run `36910175238`) and corrected tooling `5efed69` (run `36913607810`).

## Scope boundaries

Real signed-in SquareCoil visual/clock observation and active Store delivery remain unverified external follow-ups. This candidate does not claim publication, production rollout or main merge. Historical acceptance files certify their own named commits only.
