# Companion UI preview

Run `npm run preview:ui` from the extension directory, then open `http://127.0.0.1:4173` in Codex's browser panel. The server binds only the local computer and bundles the actual `src/ui/workspace-ui.js` renderer on every refresh.

The jobs and time values are explicitly fictional presentation fixtures. No Chrome extension API, SquareCoil login, official clock, or production authority is connected. Timer operations are unavailable here; use `npm run lab:chrome` for the full sealed extension simulator. Theme and layout choices in this preview stay in memory.

Use Replay loading to inspect startup, the topbar controls for Home/Settings/collapse, and the theme/finish buttons for light/dark and solid/glass. Reload after source edits. The release package allowlist excludes this entire preview.
