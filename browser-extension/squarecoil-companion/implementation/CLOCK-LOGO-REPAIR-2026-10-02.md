# Clock detection and custom dark logo repair

Version: **0.7.2 test build**. Base: `main` at `1cc27cc55dee3f62b1f04f30f462232c94fed7ef` in `Wakeup-gif/squarecoil-companion`.

The attached B6 packages and the corresponding parser on main required the action-7 response to contain the entire `#clockin-remaining-time` wrapper. Native inner HTML was rejected. General department detection also accepted only Production (General), and startup UNKNOWN/CONFLICT events were dropped while idle. Together these could leave a clocked-in user seeing Ready with no work context. The approved dark logo had been replaced with the native website image; legacy CSS also imposed a 1px maximum height and clipping that the later logo recovery rule did not reset.

## Correction

- Recognize complete, bounded inline action-7 header fragments. Numeric jobs require a validated tenant project link in bare fragments; error text and bare numbers stay UNKNOWN. Existing audited-wrapper fallback remains supported. Full documents, scripts, controls, malformed/duplicate scopes and conflicting identities remain rejected.
- Recognize explicit project-zero department labels and exact Department (General) labels. Normalize equivalent forms to one department identity, preserve `production-general`, reject multiple distinct General identities, and correlate native action3 project-zero completion with General contexts.
- Use computed visibility for audited clock controls. Treat malformed/missing evidence as unavailable rather than equating HTTP success with clock usability. Carry safe reason codes through existing diagnostics, and forward startup uncertainty into the canonical timer without inventing a context or time.
- Show Clock not detected in workspace and popup on an unreadable clock. Popup lifecycle/reload recovery retains precedence. A later valid snapshot starts the detected context at its fresh observation boundary without backfilling unknown time.
- Package the original custom transparent US Sign & Mill dark logo as `assets/us-sign-dark-logo.png`, use the extension URL only for dark modes, clear inherited clipping/size constraints, and retain current light handling. Recover late/replaced images; preserve native src/srcset updates through errors, theme changes and teardown.

Approved asset: original PNG, 150 by 52 pixels, 3,716 bytes; SHA-256 `7638c1bb2dd28dcdf3c0fb553f723ea1911cce8e710fd866fea4d2d3674bb2bb`. The asset is included in the candidate fingerprint and canonical 16-file package inventory. Its web-accessible declaration is restricted to the existing SquareCoil tenant. No extra image-host permission is added.

The user's requested custom dark logo supersedes the October 1 native-logo replacement decision. Authority fencing, native read-only observation, existing conservative verification-gap policy, Pending/Resume policy, stored ledger data, migration and native clock-action boundaries remain unchanged.

## Automated evidence

`npm run check:b6-candidate` passes after the final runtime corrections:

| Gate | Passing cases |
|---|---:|
| B1 unit | 119 |
| B2 unit | 192 |
| B3 unit | 47 |
| B4 unit | 52 |
| B5 unit | 207 |
| B1 integration | 38 |
| B2 integration | 43 |
| B3 integration | 2 |
| B4 integration | 4 |
| B5 integration | 5 |
| Prototype UI | 16 |
| Total | 725 |

Generated theme-port freshness, build validation and diff checks pass. Zero failures, skipped cases or todos. New regression coverage includes parser UT100–109, native General completion matching, bridge UT037–039, composed timer IT011, workspace/popup clock status, and theme UT101–108. Tests use fictional contexts and no live SquareCoil writes.

Independent review found and then verified corrections for four additional cases: bare error text carrying a six-digit number, General identity differences between server and DOM, native image refresh after custom-logo failure, and popup warnings overriding stronger reload instructions. Exact reproductions pass on final source.

## Acceptance boundary

This is an installable test build, not a promoted stable release. Installed Chrome/Edge validation and read-only verification of the user's live clock remain pending. No working local Chrome/Edge executable was available in this execution environment. Automated mocks do not certify the actual response shape of the user's session or rendered logo appearance. Build metadata and package evidence record the exact committed source and fingerprint. Earlier B6 browser evidence belongs to earlier bytes.

To update an unpacked installation while retaining its local data, extract the matching browser ZIP into the existing extension folder and reload that existing extension on the browser's extensions page, then reload SquareCoil. Removing an extension can remove its local data. This build does not reconstruct previously unrecorded hours.
