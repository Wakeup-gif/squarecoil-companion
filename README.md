# SquareCoil Companion

Chrome and Edge Manifest V3 companion extension for the SquareCoil workspace.

The active extension source is [browser-extension/squarecoil-companion](browser-extension/squarecoil-companion/). Start with its [current state](browser-extension/squarecoil-companion/CURRENT.md) and [maintainer handoff](browser-extension/squarecoil-companion/HANDOFF.md). See the [repository audit](docs/REPOSITORY-AUDIT.md) for a path-by-path relevance map and porting priorities.

## Repository layout

- `browser-extension/squarecoil-companion/` — active MV3 extension source and release metadata
- `.github/workflows/squarecoil-extension-validate.yml` — active extension validation and packaging
- `tampermonkey/` — legacy Tampermonkey prototypes to study when rebuilding selected features as extension code; these are not a supported companion runtime
- `scripts/` and the other `.github/workflows/` files — historical userscript build and patch tools, now manual-only
- `packages/` — historical Tampermonkey package and checksum, not an extension release
- `restore-points/` — historical rollback notes
- `docs/` — repository audit and planning notes

The recommended GitHub repository name is `squarecoil-companion`; the GitHub repository is still named `test_repo`.
