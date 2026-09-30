# Repository organization audit

The product is **SquareCoil Companion**, a Chrome/Edge Manifest V3 extension. The recommended GitHub repository name is `squarecoil-companion`; the GitHub repository is still named `test_repo`.

Inventory on 2026-09-30: 166 tracked files: 18 extension files, 8 workflow files, 118 Tampermonkey files, 14 script files, 3 package files, 3 restore-point files, this audit, and the root README. These counts describe the current tree, not progress toward a finished extension.

## Active source

| Path | Status | Action |
| --- | --- | --- |
| `browser-extension/squarecoil-companion/` | Canonical MV3 extension | Develop and release from here. Its manifest, background worker, content controller, page runtime, popup, CSS, and release metadata are the active implementation. |
| `.github/workflows/squarecoil-extension-validate.yml` | Active CI | Keep. It checks JavaScript and manifest references, then packages the extension for Chrome and Edge. |
| `browser-extension/squarecoil-companion/HANDOFF.md`, `CURRENT.md`, `CHROME-INTERACTION-DIAGNOSIS.md` | Active maintainer context | Read before changing timer authority, injection, or theme behavior. `CURRENT.md` and the extension README identify v0.7.1 as the current release. |

The extension currently has no tracked test directory; CI performs syntax, manifest, and package checks. `page/timer-runtime.js` still begins with Tampermonkey update/download metadata from its prototype origin; remove that metadata as part of a deliberate runtime cleanup, after checking the release flow. A file named `tampermonkey/SquareCoil-Job-Timer-v1.1.2.user.js` has the same blob as `browser-extension/squarecoil-companion/page/timer-runtime.js`. That historical copy does not make the userscript tree an active extension source.

## Prototype reference material

Everything under `tampermonkey/` is **legacy prototype work formatted for Tampermonkey**. It is migration source material: systems, behavior, JavaScript logic, CSS, selectors, and assets may be reused or adapted where they fit the extension. Tampermonkey itself is a retired execution and distribution mechanism; these files are not installable compatibility products or code ready to ship unchanged in MV3. Do not run a prototype timer alongside the extension.

| Prototype family | Relevance to a future extension | Disposition |
| --- | --- | --- |
| `SquareCoil-Job-Timer-*.user.js` | Timer behavior reference; much of the timer concept already exists in the extension. | Compare requirements against current extension, then reimplement only missing behavior within its timer architecture. |
| `US-Sign-Project-Scope-Workspace*`, `US-Sign-Scope-*`, `US-Sign-Description-File-Path-Tools*` | Candidate SquareCoil workflow features. | Inventory user-visible actions and permissions before choosing what to port. |
| `US-Sign-Design-Job-Tools*`, `US-Sign-Optimized-Design-Tools*`, `tampermonkey/design-v4.1/`, `tampermonkey/modules/` | Candidate design workflow reference and intermediate prototype source. | Consolidate behavior requirements; do not treat assembled userscripts or fragments as production modules. |
| `US-Sign-Full-UI-Theme*`, `US-Sign-UI-Runtime-Fixes*`, `US-Sign-Menu-Cleanup*`, `US-Sign-Sticky-Project-Rail*`, `US-Sign-Optimized-Theme*`, `tampermonkey/assets/` | Visual and navigation experiments. | Compare against the extension's existing themes, keep useful design assets, and rebuild scoped behavior as extension CSS/content code. |
| `ChatGPT-US-Sign-*`, `Adobe-Acrobat-US-Sign-Colors.user.js` | Separate-site experiments, outside the current SquareCoil extension scope. | Park unless the product scope explicitly expands to those sites. |
| `US-Sign-Install-Test-2.user.js`, old numbered copies, and `tampermonkey/archive/` | Historical or experimental snapshots. | Preserve for traceability; not a port target by default. |

There are exact duplicate blobs among versioned and unversioned userscripts, including Design Job Tools v4.1.11, Scope of Work File Tools v2.6.2, Project Scope Workspace v1.2.8, and UI Runtime Fixes v3.1.6. Resolve which snapshot best represents each feature before porting. Keep historical versions in Git; physical moves can follow a reference check.

## Legacy automation and artifacts

| Path | Status | Action |
| --- | --- | --- |
| Seven workflows in `.github/workflows/` other than `squarecoil-extension-validate.yml` | Prototype builders/patchers | Their push triggers have been removed; they are manual-only so ordinary extension/docs pushes cannot rebuild and commit userscripts. Retain for reproducibility until prototype extraction is complete. |
| `scripts/` | Historical Tampermonkey packaging, optimization, and patch scripts | No current extension build depends on them. Keep with the prototype archive, then retire after checking remaining workflow references. The `.tmp` patch inputs are historical. |
| `packages/US-Sign-Tampermonkey-Package-2026-08-14.*` | Historical userscript ZIP/checksum | Preserve for provenance; do not present as a Companion extension package. |
| `restore-points/` | Historical rollback notes | Retain as documentation, not active source. |

## Porting rule

For each prototype feature, inventory its user-visible behavior, underlying logic, styles, assets, and whether the extension already covers it. Decide which pieces to reuse, adapt, rebuild, or retire. Then fit the chosen pieces into MV3 background/content/page responsibilities, host permissions, content security policy, storage, and tests. Preserve SquareCoil as the authority for the real company clock. Rebuild useful features in `browser-extension/squarecoil-companion/` rather than copying Tampermonkey wrappers or installing parallel userscripts.

Next organizational steps: rename the GitHub repository and update the hard-coded `test_repo` references in `background.js` and `manifest.json` as one release change; document feature-by-feature port decisions; and only then archive or remove unreferenced prototype build files. No historical source has been deleted.
