# SquareCoil Companion UI audit and Figma handoff

## Audit outcome

The repaired UI has one visual hierarchy: website theme, integrated Bing-or-gradient background, website glass surfaces, Companion panel, and protruding job tabs. The job tabs are no longer rendered as a framed row inside the panel.

### Root causes addressed

- The current Bing endpoint includes a fixed `w=3840&h=2160&rs=1&c=4` tuple that the former validator rejected, forcing the plain fallback despite a valid public response.
- Light Glass compatibility selectors did not outrank several inherited dark `!important` selectors on production-shaped project containers, creating mixed dark panels inside a pale page.
- The authoritative theme generator depended on mutable remote branch content. It is pinned to the accepted upstream commit and now has a freshness gate.
- Workspace membership previously admitted any value except `ARCHIVED`; cleared `INACTIVE_NON_RECENT` jobs could leak back into tabs.
- Hide and drag paths did not share the archive protection read model. They now require an exact, same-revision Timer/data snapshot and refuse current or recovery-protected Contexts.
- The previous tab DOM nested an interactive close control inside a button and rendered the strip inside the shell. Tabs now have valid sibling controls and sit above the shell with horizontal overflow.
- Native drag state lacked complete cancellation. Escape, window blur, page hide, document hide, drag end, and stale protection changes now fail closed.
- A removed or replaced Companion root could leave document-level drag listeners holding an invisible gesture. Drag-over/drop now require the connected current root, and root loss cancels without staging Archive.
- Exact Archive previously rechecked protection but not current Recent/unarchived membership inside Data authority. Stage and commit now reject cleared, already archived, or concurrently changed Contexts.
- Fresh or partial saved tab order could not move a newly observed target in every direction. Reorder now normalizes the full current Recent order before placement.
- A concurrent hidden-tab update could be overwritten after an Archive commit, and a late commit could schedule UI work after teardown. Archive now preserves the latest presentation state and suppresses disposed callbacks without canceling an authorized data commit.
- Generic Glass cards inherited older high-specificity text and surface recipes. Terminal Light and Dark compatibility rules now keep generic and exact production panels in one coherent palette.
- Late shared Dark text variables also leaked pale paragraph, navigation, metadata, and placeholder text into Light Glass. The terminal Light port remaps those legacy variables, and the browser proof samples both strong and muted text.
- Initial loading and forced-colors states could report the wrong background explanation. Loading and accessibility suspension now take precedence in user-facing status.
- Theme-port freshness read exact source commits from a sibling accepted branch, while CI used a shallow checkout. CI now fetches full history so the pinned source chain is provable before generation.

## Visual contract

- Companion width: 460 px desktop; 292 px when collapsed with no tabs; 8 px viewport edge at 500 px and below.
- Job tabs: 40 px high in a 43 px transparent strip; 116 px preferred width; 82–132 px bounds.
- Selected tab visually joins the shell with an open bottom seam.
- The panel supports Light/Dark and Solid/Glass independently. Website Dark Glass and Light Glass remain integrated theme presets with their runtime background.
- Light Glass production surfaces must remain coherently light and translucent; Dark Glass surfaces coherently dark. Nested panel bodies do not receive a second conflicting glass layer.
- Background statuses disclose Loading, Remote Bing, fresh cache, degraded cache, built-in gradient, accessibility/theme suspension, inactive page, or Off accurately.
- Archive guidance sits in the exposed website area on desktop. At 760 px and below the veil rises above the Companion so the full-viewport signal and message remain visible.

## Figma source package

- Tokens: `docs/figma/squarecoil-companion.tokens.json`
- Components and interactions: `docs/figma/COMPONENT-STATE-MATRIX.md`
- Render source: `src/ui/workspace-ui.js`
- Website theme sources: `src/presentation/ports/dark-glass.css` and `src/presentation/ports/light-glass.css`
- Runtime background source: `src/presentation/cinematic-background.js`

The token file follows the stable DTCG 2025.10 interchange shape, including structured color, dimension, duration, and shadow values. When a target Figma file is supplied, import those variables and styles, build the required frames from the component matrix, then compare each frame with installed-browser screenshots. Screens containing a Bing image require a browser capture to transfer the captured image hash; a generated replacement image is out of scope.

## Acceptance boundary

This handoff is ready only when unit/integration gates, theme-port freshness, branded Chrome and Edge clean/upgrade runs, drag-Archive safety cases, and visual screenshots all pass for the same candidate bytes. Figma preparation does not replace browser acceptance.
