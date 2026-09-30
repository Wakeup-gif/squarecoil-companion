# Legacy Tampermonkey prototypes

These userscripts were prototypes for SquareCoil and related site experiments. They are formatted for Tampermonkey and are **not** the supported SquareCoil Companion extension or a compatibility runtime. Do not install them alongside the extension, especially the timer scripts.

Use this directory as migration source for systems, code, styles, selectors, assets, and interaction behavior. Assess each feature for reuse, adaptation, rebuild, or retirement in `browser-extension/squarecoil-companion/`. Porting to Manifest V3 requires deliberate content/page/background ownership, permissions, storage, and testing. Preserve useful implementation work while removing Tampermonkey-specific APIs, metadata, and runtime assumptions.

The numbered scripts and `archive/` preserve experiments and history. `design-v4.1/` and `modules/` are prototype fragments. `assets/` contains historical cursor assets. The ChatGPT and Adobe Acrobat scripts target other sites and are outside the current SquareCoil extension scope.

See `docs/REPOSITORY-AUDIT.md` for the relevance map. Keep historical files until their references and port decisions are recorded.
