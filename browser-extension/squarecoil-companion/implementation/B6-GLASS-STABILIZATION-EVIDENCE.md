# B6 Glass and Workspace Stabilization Evidence

**Status:** exact candidate accepted by the aggregate gate and installed Chrome/Edge clean-plus-upgrade gates; optional live Bing permission grant remains a manual supplemental check

**Implementation source:** `aabdebc87224211b8897a7e1ded7b94ddacdd19a`

**Package:** `SquareCoil-Companion-v0.7.1-aabdebc87224.zip`

**ZIP SHA-256:** `0e351476811f5838f6456fb444d8c80ad92b4aabe047caab50e5767bf3eecf1b`

**Candidate fingerprint:** `d3d0e68b3d816daa8ae308a2e7886ee1a596e54656db3c887e64f5871a3aa9de`

**Inventory digest:** `b926898a72d175e82164a05bcf5e17c3e1e4fb88941a9e438cf27b23759fe773`

## Accepted scope

- Dark Glass and Light Glass each own their bundled authoritative theme port, integrated cinematic background, and translucent SquareCoil surface treatment as one choice.
- No generated or packaged wallpaper image is used. The fixed public Bing provider remains optional and permission-gated; the CSS gradient fallback is always available.
- Settings, Recent, Overview, and History remain available before clock-in and with zero history.
- Startup failure is bounded and visible; safe Settings and diagnostics remain available while operational actions fail closed.
- Exact route classification prevents lookalike or nested paths from inheriting route-specific presentation.
- Build, validator, ZIP creation, browser acceptance, and CI packaging use one canonical 11-file inventory.
- Timer, Ledger, Bridge, migration settlement, native clock ownership, and SquareCoil business state remain outside this stabilization delta.

## Automated gates

- `npm run check:b6-candidate`: PASS.
- B6 validator: PASS with 226 B2, 31 B3, 32 B4, and 102 B5 stable fixture IDs; no skipped, todo, or focused fixtures.
- Canonical package validation: PASS; `sourceDirty` is false and the embedded source SHA equals the implementation commit.
- Extracted ZIP inventory equals the validated package inventory.

## Installed browser acceptance

The same immutable ZIP and extracted package ran sequentially in installed branded browsers using isolated clean and valid v0.7-upgrade profiles.

| Browser | Version | Clean profile | Upgrade profile | Archive unchanged | Native mutations | Unexpected requests | Console/page errors |
|---|---|---:|---:|---:|---:|---:|---:|
| Chrome | 151.0.7922.174 | 29/29 PASS | 2/2 PASS | yes | 0 | 0 | 0/0 |
| Edge | 152.0.4191.53 | 29/29 PASS | 2/2 PASS | yes | 0 | 0 | 0/0 |

The browser runs used only synthetic, read-only SquareCoil fixtures. No user credentials were used and no real clock-in or clock mutation occurred.

## Supplemental Bing permission boundary

The short headed Chrome check loaded the exact candidate and issued a trusted popup click, but no browser-owned permission grant was observed before the two-minute timeout. The run closed cleanly with the archive unchanged, zero native mutations, zero unexpected requests, and zero console/page errors.

Therefore the installed core/theme/UI candidate is accepted, but a real optional Bing permission grant and rotating-image render are not claimed for this exact ZIP. Before Chrome Web Store submission, manually load this ZIP, choose a Glass theme, use **Allow access** from the toolbar popup, and confirm a Bing image renders and rotates. The bundled gradient fallback does not depend on that permission.

## Proof boundary

This evidence authorizes the exact install package and existing branch update only. It does not authorize Chrome Web Store submission, production rollout, merge to `main`, or any live SquareCoil mutation.
