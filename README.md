# SquareCoil Companion

Chrome and Edge Manifest V3 companion extension for the SquareCoil workspace.

The maintained extension source is [browser-extension/squarecoil-companion](browser-extension/squarecoil-companion/). It contains the canonical manifest, background worker, content controller, page runtime, popup, website themes, tests, and release metadata.

Start with:

- [Current state](browser-extension/squarecoil-companion/CURRENT.md)
- [Maintainer handoff](browser-extension/squarecoil-companion/HANDOFF.md)
- [Chrome interaction diagnosis](browser-extension/squarecoil-companion/CHROME-INTERACTION-DIAGNOSIS.md)
- [Repository organization audit](docs/REPOSITORY-AUDIT.md)

## Repository layout

- `browser-extension/squarecoil-companion/` — active Chrome/Edge extension
- `.github/workflows/` — validation and packaging workflows
- `docs/` — project and repository documentation
- `packages/` — historical release artifacts and checksums
- `restore-points/` — rollback notes
- `tampermonkey/` — legacy userscripts and migration history
- `scripts/` — build, validation, and migration tooling

The repository is currently named `test_repo`; `squarecoil-companion` is the recommended GitHub name.