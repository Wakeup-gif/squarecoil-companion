# B6 Glass Navigation and Page-Surface Performance Evidence

**Status:** October 1 performance batch passed exact clean-source aggregate, sealed Chrome/Edge lab, package, and installed clean/v0.7 upgrade gates. Real SquareCoil account-page inspection and optional live Bing image verification remain open.

**Implementation source:** `90cb31f3ef97e26f2e5953062289ec248600a56c` on `codex/squarecoil-prototype-integration`

**Candidate fingerprint:** `acbfcf471c80d412ec11b162a34c3861325649ed47145b7db0351772c82d9438`

**QA ZIP:** `SquareCoil-Companion-QA-90cb31f.zip` (357,572 bytes)

**ZIP SHA-256:** `614fab12be63c8a222170db5db1e06806f1215dc88804053ed6ec44e132012ed`

**Canonical inventory digest:** `6cee70673abd26e50bc28f104efefb476629f3d9794a23ee1d53fca0cef23001` (15 allowlisted files)

## Implemented behavior

- The document-start bootstrap paints a validated cached wallpaper or matching gradient while Glass loads. The cinematic owner adopts it and removes the temporary background once the host can paint.
- A stable theme stylesheet is fetched and parsed once per document. Unrelated Timer/Ledger storage writes do not replace it. The large image is static and the prior image remains visible during refresh.
- Generated Dark and Light Glass ports remove decorative project/Design borders and nested backdrop blur while retaining keyboard focus, form boundaries, and calendar status meaning. The pinned Tampermonkey sources were not edited.
- Timer, Ledger, Bridge, migration, and native SquareCoil clock ownership are unchanged.

## Checks on the exact implementation

- `npm run check:b6-candidate`: PASS, including aggregate tests, prototype UI tests, theme-port freshness, and source validation.
- Canonical package validation: PASS; embedded `sourceSha` matches the implementation commit, `sourceDirty: false`, `acceptanceEligible: true`.
- Sealed fictional-site Chrome and Edge journeys: PASS; eight synthetic clock actions, six finalized History rows, one Companion root, nine Design/project surfaces with computed zero borders, no visible outlines or nested blur, and a static wallpaper layer. Browser screenshots and manifests are in the local evidence folders named `chrome-handoff-final-2026-10-01` and `edge-handoff-final-2026-10-01`.
- The same immutable ZIP and extracted package passed the installed browser matrix: Chrome clean 30/30, Chrome v0.7 upgrade 2/2, Edge clean 30/30, Edge v0.7 upgrade 2/2. Matrix status is `PASS`, mode is `ACCEPTANCE_CANDIDATE`, and `acceptanceEligible` is true. ZIP hash and extracted inventory stayed unchanged. No native mutation was attempted.

Local evidence root: `C:\Users\iamva\Documents\SquareCoil Companion Performance Evidence`. Exact matrix: `installed-matrix-90cb31f.json`. Package validator: `qa-package-90cb31f-validation.json`. QA ZIP and extracted package are in that same root.

## Proof boundary and handoff

The sealed site reproduces project/Design structure and navigation without a real SquareCoil login. The actual account page in the user screenshot has not been inspected after this change, so `VIS-001` remains mapped pending that visual check. The optional live Bing image grant/fetch path was not exercised; the tested route used the built-in offline gradients. This candidate is for the separate branding, merge, and rollout preparation the user plans, not a release or Store submission.
