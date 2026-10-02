# SquareCoil Companion component and state matrix

This matrix is the component contract for Figma. The implementation source is `src/ui/workspace-ui.js`; Figma must represent these states without inventing Timer or archive behavior.

## Components

| Component | Required variants | Notes |
| --- | --- | --- |
| `Companion / Root` | color: Light, Dark; finish: Solid, Glass; tabs: Present, Empty; panel: Expanded, Collapsed | Normal width 460 px; collapsed with no tabs is 292 px; at 500 px and below it uses the viewport minus two 8 px edges. Color and finish are independent axes. Tabs are siblings above the framed shell, not a row inside it. |
| `Workspace / Tab Strip` | overflow: Fit, Scroll; drag: Idle, Reordering, Page Archive | Horizontal touch/trackpad swipe. No enclosing filled rail. |
| `Workspace / Job Tab` | selected: True, False; threshold: None, Yellow, Orange, Red; status: Running, Running Provisional, Verification Hold, Awaiting Choice, Locally Paused, Not Running, Syncing; protection: Eligible, Protected | Chrome-like top corners and open bottom seam. Hide is a separate sibling button, never nested interactive content. |
| `Workspace / Drop Marker` | Before, After | Three-pixel accent marker at the target midpoint. |
| `Workspace / Archive Veil` | Hidden, Eligible, Blocked; viewport: Desktop, Narrow | Covers and slightly grays the full page. On desktop its message stays in the exposed website area below the readable Companion; at 760 px and below it rises above and grays the Companion too, so the message can never be hidden under the shell. Eligible says “Release to archive”; blocked explains why the job stays open. |
| `Workspace / Archive Notice` | Visible, Hidden | Confirms that time/history remain saved, includes Undo, and automatically clears after 8 seconds. |
| `Companion / Status` | Ready, Working, Needs attention, Setup required | Recovery uses Working with reconnecting helper copy. Detailed lifecycle remains under Technical details. |
| `Navigation / Tile` | Default, Hover, Focus, Disabled | Used for Recent Jobs, Time Overview, History, and Settings before or during a job. |
| `Settings / Theme Choice` | Native, Dark Glass, Light Glass, Refined Light; selected: True, False | Dark/Light Glass integrate surface treatment and runtime Bing background. |
| `Settings / Background Status` | Loading, Remote, Cache Fresh, Cache Degraded, Gradient Fallback, Accessibility, Theme Suspended, Inactive Page, Off | Never label the built-in gradient as a saved Bing wallpaper. Forced colors and reduced transparency report Accessibility even when the effective website theme is Native. |

## Prototype interactions

1. Click a tab to inspect its Context. Double-click also expands a collapsed Companion.
2. Swipe or trackpad-scroll the tab strip horizontally when it overflows.
3. Arrow, Home, and End move selection and reveal the focused tab inside the horizontal strip. “Show in Tabs” promotes and selects a hidden or automatically overflowed job.
4. Drag across the strip to reorder. Crossing a tab midpoint changes the before/after drop marker.
5. Drag an eligible inactive tab onto the visible SquareCoil page to arm Archive. The full page becomes slightly gray and explains that hours and history remain saved.
6. A current, paused, pending, provisional, stale-revision, or recovery-protected Context uses the Blocked veil and snaps back unchanged.
7. Releasing outside the browser, losing focus, hiding the document, or pressing Escape cancels the gesture. It must not archive.
8. Archive is committed only through Companion data authority. The selected tab falls back only after the committed snapshot no longer marks the Context Recent.
9. Undo restores the archived Context to Recent without creating live Timer state.

## Figma variable collections

- `Companion color`: Light, Dark.
- `Companion finish`: Solid, Glass. This axis is independent of Companion color.
- `Website theme`: Native, Dark Glass, Light Glass, Refined Light. Dark Glass and Light Glass include their runtime Bing-or-gradient background.
- `Interaction`: Default, Hover, Focus, Disabled, Drag Eligible, Drag Blocked.
- `Threshold`: None, Yellow, Orange, Red.

## Required screen frames

- `01 / Ready / Light Glass / Inactive tabs`
- `02 / Working / Dark Glass / Current job protected`
- `03 / Drag / Archive eligible / Page veil`
- `04 / Drag / Archive blocked / Page veil`
- `05 / Settings / Themes / Bing remote`
- `06 / Settings / Themes / Gradient fallback`
- `07 / Zero history / Settings available`
- `08 / Collapsed / Tabs remain visible`
- `09 / Companion Dark + Solid / Website Native`
- `10 / Companion Light + Glass / Website Dark Glass`
- `11 / Narrow drag / Archive prompt above grayed Companion`

Use the product font stack from the tokens file. Do not substitute Inter by default. Runtime wallpaper should be a clearly named placeholder or a captured public Bing image state; do not generate or package replacement background art.
