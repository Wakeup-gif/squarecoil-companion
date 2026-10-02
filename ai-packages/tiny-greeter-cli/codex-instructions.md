# Codex Implementation Instructions

## Project: Minimal Greeting CLI

### Overview
Implement a minimal Node.js CLI tool that prints a greeting with the current time. The project consists of four files: `package.json`, `index.js`, `lib/time.js`, and `README.md`, plus one test file `test/time.test.js`. No external npm packages may be used.

### Implementation Order
1. `package.json` — project metadata and bin entry
2. `lib/time.js` — time formatting utility
3. `index.js` — CLI entry point
4. `test/time.test.js` — unit tests for lib/time.js
5. `README.md` — usage documentation

### Key Constraints
- Node.js 18+ only; use only built-in modules (`process`, `Date`, `node:test`, `node:assert`).
- No `require` or `import` of any npm package.
- Time format is strictly 24-hour `HH:MM:SS` (zero-padded).
- Greeting format is exactly: `Hello, <name>! The current time is <HH:MM:SS>.`
- `index.js` must have Unix line endings (LF) and begin with `#!/usr/bin/env node`.
- Do not add a build step, transpiler, or bundler.
- All output goes to `process.stdout`; no `console.error` calls unless an unexpected exception occurs.

### Verification
After implementation, run:
```
node index.js
node index.js Alice
node test/time.test.js
```
All three commands must complete with exit code 0 and produce expected output.