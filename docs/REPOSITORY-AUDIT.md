# Repository organization audit

This repository is a mixed SquareCoil customization workspace. The recommended repository name is **squarecoil-companion**. The current name, **test_repo**, does not describe the product or its Chrome/Edge extension role.

## Canonical project

The maintained browser extension lives at:

- `browser-extension/squarecoil-companion/`

Treat this directory as the source of truth for the Manifest V3 Chrome and Edge extension. Its manifest, release metadata, background worker, content controller, page runtime, popup, styles, and tests belong to the active extension.

Read these before changing behavior:

1. `browser-extension/squarecoil-companion/HANDOFF.md`
2. `browser-extension/squarecoil-companion/CURRENT.md`
3. `browser-extension/squarecoil-companion/CHROME-INTERACTION-DIAGNOSIS.md`

## Inventory

| Path | Classification | Guidance |
| --- | --- | --- |
| `browser-extension/squarecoil-companion/` | Canonical | Keep as the maintained Chrome/Edge MV3 project. |
| `.github/workflows/squarecoil-extension-validate.yml` | Canonical CI | Keep; it validates and packages the extension. |
| `packages/` | Release artifacts | Keep only reproducible, named packages and checksums. Prefer GitHub Releases for future binaries. |
| `restore-points/` | Recovery documentation | Keep short rollback notes; do not add active implementation here. |
| `tampermonkey/` | Legacy/compatibility | Keep as migration material. Put versioned and duplicate copies under `tampermonkey/archive/`. |
| `scripts/` | Mixed tooling | Keep build/validation/migration scripts; archive or remove unreferenced one-off patches and `.tmp` files after reference checks. |
| `kindle-jailbreak-prep/` | Unrelated | Separate from this repository or move to its own repository. |

## Recommended cleanup order

1. Rename the GitHub repository to `squarecoil-companion`.
2. Keep `browser-extension/squarecoil-companion/` as the only active implementation root.
3. Add a short README to `tampermonkey/` identifying it as legacy compatibility material.
4. Archive or remove unreferenced patch inputs after checking workflow references.
5. Move `kindle-jailbreak-prep/` to a separate repository.
6. Store release ZIPs in GitHub Releases when possible; keep checksums or small manifests in the repository.
7. Keep restore points and migration notes labeled with dates and release targets.

## Scope decisions

- Do not merge Tampermonkey history into the extension source.
- Do not treat package ZIPs as source.
- Do not delete historical scripts or restore points until references are checked.
- Do not change timer authority, permissions, or website behavior as part of repository organization.

Last audited: 2026-09-30.