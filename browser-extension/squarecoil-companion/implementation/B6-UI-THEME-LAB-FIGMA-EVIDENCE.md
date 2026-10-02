# B6 UI, Theme, Lab, and Figma Stabilization Evidence

Date: 2026-08-30
Branch: `codex/squarecoil-b2c-migration`
Artifact implementation source: `4a9368bf4edde8cb10a7a53fcf16512e86b1b623`

## Exact artifact

- Package version: `0.7.1`
- Build/stage: `rebuild-b6-release-candidate` / `B6`
- Candidate fingerprint: `c0b45ba73df1b87020c5cf5b9cdfa05b05624ed25a8897230776d488204016a6`
- Inventory digest: `a36075275fe3f88964abd5da1c1d67d3be181781abed1d424beb916b0a2fba2d`
- ZIP: `SquareCoil-Companion-v0.7.1-UI-READY-4a9368b.zip`
- ZIP bytes: `319415`
- ZIP SHA-256: `717fe7651d6c7caabb086a08f4657c64c2a4f46a4c749f774a918ab67e439ee8`
- Source dirty: `false`

The validated package and ZIP remained byte-identical before and after installed-browser acceptance, and the extracted ZIP inventory exactly matched the validated package. The tested ZIP was then copied byte-for-byte to Downloads; it was not rebuilt.

## Automated and visual gates

- `npm run check:b6-candidate`: PASS from a detached clean worktree at the exact implementation source; no skipped, todo, or focused fixtures.
- Chrome sealed lab: PASS with four deterministic screenshots, eight fictional clock events, six finalized History rows, one runtime root, protruding/overflowing/reorderable tabs, keyboard reveal, archive veil, Dark Glass, and Light Glass.
- Edge sealed lab: PASS with the same fictional data and visual contract.
- The sealed lab intercepted SquareCoil routes in memory, blocked unexpected traffic, used fresh temporary profiles, and never used a real account or native clock mutation.

The lab manifests are retained outside the repository as `NON_ACCEPTANCE_SEALED_LAB_VISUAL_EVIDENCE`; they supplement rather than replace installed acceptance.

## Installed Chrome and Edge acceptance

The exact package directory and exact ZIP passed the full matrix:

| Browser | Profile | Cases | Result |
|---|---:|---:|---:|
| Chrome `151.0.7922.174` | clean | 29 | PASS |
| Chrome `151.0.7922.174` | v0.7 upgrade | 2 | PASS |
| Edge `152.0.4191.53` | clean | 29 | PASS |
| Edge `152.0.4191.53` | v0.7 upgrade | 2 | PASS |

Acceptance record status was `PASS`, `acceptanceEligible: true`, and `mode: ACCEPTANCE_CANDIDATE`. There were zero failed or unsupported cases, native mutation attempts, blocked unexpected requests, console errors, page errors, or cleanup warnings. Package and archive identities remained unchanged.

## Proof boundaries

- READY remained settlement-gated; labels were not used to bypass lifecycle, authority, migration, trusted-core, or Bridge prerequisites.
- Drag Archive remained fenced, protection-aware, inactive-Context-only, and history-preserving.
- Bing imagery was not generated or bundled. Glass uses the built-in gradient fallback until the user grants optional exact Bing access through the browser-owned permission prompt.
- The optional live Bing permission gate was not requested and remains supplemental, so `PRES-001` remains `MAPPED`.
- Figma-ready DTCG tokens and the component/state matrix are prepared, but no target Figma file was provided; `FIGMA-001` remains `MAPPED` until frame comparison.
- This evidence does not authorize Chrome Web Store publication, merge to `main`, rollout, or any live SquareCoil mutation.
