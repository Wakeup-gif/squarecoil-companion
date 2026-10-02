# SquareCoil Companion Rebuild
## B5 Settings / Presentation Behavior-Readiness Audit

**Status:** Settled for core B5-A — implementation-ready at the behavior layer  
**Optional B5-B:** structurally preserved but not activated as a core-release requirement  
**Active branch:** `proto/squirel-coil-plugin`  
**Depends on:** L5-L7, L8, feature-mine reconciliation  
**Purpose:** verify that the mined Companion appearance, SquareCoil skins, limits, Settings, and support capabilities are represented by settled behavior without allowing optional historical visual experiments to block the safe core.

---

# 1. Direct Assessment

The core B5 product behavior is complete.

The legacy extension proves separate user-facing appearance systems existed:

```text
Companion Appearance
Light | Dark | Auto

Panel Finish
Solid | Glass

SquareCoil Website Theme
Original | Refined Light | Sleek Dark
```

It also implemented dark-logo swapping and cross-tab preference synchronization.

L7 already formalizes those capabilities with safer preference revisions, accessibility precedence, idempotent theme ownership, dirty-draft handling, Timer Limits, Settings routing, Support/Feedback, diagnostics privacy, and Developer Support.

Result:

```text
core B5-A behavior specification = READY
current prototype parity         = PARTIAL
optional cinematic/dashboard     = NOT CORE-BLOCKING
new core Logic required          = NO
```

**Settled**

---

# 2. Actual Sources Reviewed

This assessment uses:

```text
content/theme-controller.js
logic/L7-SETTINGS-SUPPORT-THEMES.md
docs/FEATURE-MINE-RECONCILIATION.md
src/ui/workspace-ui.js
```

Historical theme/UI code remains feature and visual evidence. L7 is the behavior authority for the rebuild.

**Settled**

---

# 3. Core Companion Appearance Is Complete

Canonical durable Timer Appearance:

```text
LIGHT
DARK
AUTO
```

Canonical Panel Finish:

```text
SOLID
GLASS
```

They are independent axes.

L7 settles:

- first-install Light + Solid;
- Auto follows system/browser color scheme while keeping `AUTO` as the durable preference;
- system theme changes update effective presentation live;
- unsupported Auto signal falls back to effective Light without rewriting the preference;
- Glass may safely fall back to effective Solid under capability/accessibility constraints;
- appearance changes never alter Timer State or Ledger data;
- preference application is revisioned/idempotent rather than direct UI-owned storage truth.

**Implementation-ready**

---

# 4. Current Prototype Appearance Gap

The active prototype currently exposes only:

```text
Light | Dark
Solid | Glass
```

and explicitly states that it does not restyle SquareCoil.

Therefore the prototype is missing core B5-A parity for:

- Auto;
- the canonical Preferences service/revision behavior;
- accessibility/effective-theme fallback behavior;
- full Settings IA;
- SquareCoil Website Themes.

These are implementation gaps, not unresolved behavior.

**No new Logic required**

---

# 5. Core SquareCoil Skin Behavior Is Complete

L7 defines:

```text
ORIGINAL
REFINED_LIGHT
SLEEK_DARK
```

with explicit ownership and restoration behavior.

## Original

- native SquareCoil presentation;
- remove only Companion-owned theme artifacts;
- native logo.

## Refined Light

- restrained cleanup/readability improvement;
- recognizable native structure/proportions;
- semantic colors preserved;
- native logo until an approved light asset exists.

## Sleek Dark

- graphite/charcoal hierarchy;
- native structure/proportions preserved;
- semantic colors preserved;
- approved dark logo when available;
- dark-logo failure falls back to native logo without affecting Timer/lifecycle health.

**Implementation-ready**

---

# 6. Historical Site-Skin Depth Is Accounted For

The legacy site-theme code styled real SquareCoil surfaces such as:

```text
page shell
header/navbar
global sidebar
project navigation
panels/wells
forms/inputs
buttons
tables
tabs
modals/dropdowns/popovers
semantic alerts/statuses
branding/logo
```

The later v0.7 dark audit repaired pale seams, focus visibility, neutral controls, and dark-logo presentation.

L7 intentionally converts that broad CSS history into a safer rule:

> Theme service owns only presentation artifacts, applies them idempotently, preserves semantic/native interaction meaning, and leaves uncertain selectors unmodified rather than broad-guessing.

No additional core behavior contract is required for the skin system.

**Implementation-ready**

---

# 7. Preference Concurrency Is Complete

Legacy storage synchronization demonstrated the need for multi-tab preference updates.

L7 strengthens this with a canonical Preferences service and revision behavior:

- immediate single-value preference changes synchronize by committed revision;
- multi-field Timer Limits drafts record their base revision;
- stale drafts cannot silently overwrite a newer tab's committed limits;
- transient routes/focus/Support drafts do not synchronize;
- persistence failure reverts/exposes the last committed preference rather than pretending success.

**Implementation-ready**

---

# 8. Timer Limits Are Complete

Canonical limits:

```text
Yellow = 60 minutes
Orange = 120 minutes
Red    = 240 minutes
```

Validation:

```text
integer minutes
1 <= Yellow <= Orange <= Red
```

L7 plus L5A already settle how committed limits affect tab threshold presentation without changing time.

Unsaved limit drafts are protected from silent loss and from stale cross-tab overwrite.

**Implementation-ready**

---

# 9. Settings Router Is Complete

L7 requires one Settings router with canonical routes including:

```text
Settings Home
Recent Jobs
Time Overview
History
Activity Log
Archives & Backup
Website Theme
Timer Limits
Submit Ticket
Send Feedback
Developer Support
```

Back/Close/focus/recovery behavior, dirty drafts, and L6 mutation navigation safety are already defined.

The current prototype's one-level `recent / overview / history / settings` router is a useful foundation but not final B5 Settings parity.

**Implementation gap — no new Logic required**

---

# 10. Dirty Draft and Native Focus Interaction Is Complete

L7 protects modified Settings/Support/Timer-Limit drafts from silent loss.

L5A already integrates this with real native Context focus intent:

```text
read-only nested route -> incoming Context may route Main
protected dirty route  -> defer newest eligible focus intent
newer user selection   -> defeats older deferred intent
```

This closes the cross-layer ambiguity between Settings and Workspace focus behavior.

**Implementation-ready**

---

# 11. Accessibility Precedence Is Complete

L7 explicitly prevents appearance preferences from overriding usable controls.

High contrast / forced colors / reduced transparency may change the **effective** presentation while preserving the durable preference.

Themes may not hide required native controls, destroy focus visibility, alter form values/URLs, or collapse semantic warning/danger/success distinctions.

This also means legacy visual effects are references, not permission to force glass/animation where accessibility says otherwise.

**Implementation-ready**

---

# 12. Support / Feedback Is Complete

L7 defines first-release support behavior without inventing a backend:

```text
transport = user's default mail client via mailto
recipient = cristian@ussignandmill.com
```

Ticket and Feedback forms have explicit categories, required fields, validation, draft privacy, optional diagnostics, deterministic email composition, and no silent sending.

Support drafts are transient and are not written into Preferences, Activity, Backup, CSV, or diagnostics.

**Implementation-ready**

---

# 13. Diagnostics Privacy Is Complete

Diagnostics are opt-in and whitelist-based.

The support flow must preview a frozen privacy-safe diagnostic snapshot rather than automatically attaching arbitrary SquareCoil/customer data.

Diagnostics/support failure is feature-level and must not change Timer health.

**Implementation-ready**

---

# 14. Developer Support Is Complete

The Developer Support page is optional/free/non-blocking.

It may expose approved external support links and Cash App QR/tag information, but:

- Companion does not process payment;
- no payment credentials are collected;
- donation state is not tracked as product entitlement;
- no nags or tracking are introduced;
- failure has no Timer consequence.

**Implementation-ready**

---

# 15. Optional Historical Cinematic Background

The feature mine confirmed a real historical cinematic wallpaper system with:

- fresh Bing UHD background retrieval;
- fallback/cached background;
- dedicated wallpaper layers;
- pan/zoom;
- crossfade;
- reduced-motion handling;
- live glass treatment.

Framework disposition remains:

```text
OPTIONAL POST-CORE PRESENTATION
```

It is **not required for core B5-A acceptance**.

The framework already fixes the ownership boundary:

- no Timer/Bridge/lifecycle authority;
- default Background Mode = None;
- Sleek Dark remains usable without wallpaper;
- presentation/network failure falls back safely;
- accessibility/reduced-motion precedence wins.

The remaining details intentionally deferred by the framework include refresh cadence, cache/source policy, and exact failure/retry treatment.

Those details require a small dedicated Logic delta **only if an upstream scope decision activates Cinematic Background for an implementation/release slice**.

Until then it is not an open core-Logic blocker.

**Provisional / upstream activation dependent**

---

# 16. Optional Design Dashboard Presentation Profile

The mine also confirmed historical Design Dashboard-specific presentation work.

Framework disposition:

```text
OPTIONAL PAGE PRESENTATION PROFILE
```

It may style Dashboard KPI widgets, lists, panels, controls, and modal presentation, but must never absorb Design Request business logic.

Its inclusion in a core release is an upstream scope choice, not a B5 core behavior gap.

If activated later, page eligibility and failure-isolation behavior may be specified in a bounded presentation delta without reopening Timer logic.

**Provisional / upstream activation dependent**

---

# 17. Explicit Non-Parity

The following historical implementation mechanisms are not product requirements:

- direct DOM-dataset events as the new preference authority;
- broad document-wide patch loops for normal theme construction;
- remote logo/background availability as a Timer dependency;
- one module patching another feature's rendered Settings DOM;
- Timer boot being owned by a theme controller;
- appearance storage changes implicitly proving runtime health.

The rebuild preserves user-facing intent and replaces those ownership patterns.

**Settled**

---

# 18. Acceptance Boundary

Core B5-A implementation must prove at minimum:

```text
Light/Dark/Auto durable preference behavior
Auto effective-theme changes without preference mutation
Solid/Glass independence
safe Glass fallback
Original site restoration
Refined Light application
Sleek Dark application
dark-logo success/failure restoration
idempotent theme reapplication
no duplicate owned theme layers
semantic/native-control safety
cross-tab preference synchronization
stale Timer-Limits draft protection
valid/invalid limits behavior
Settings Back/Close/focus rules
dirty draft protection
L6 commit-navigation safety
Support/Feedback validation and draft privacy
diagnostics opt-in whitelist behavior
mailto failure fallback
Developer Support has no Timer/payment authority
presentation failures do not degrade Timer health by themselves
```

Optional B5-B presentation packs are excluded from this core acceptance gate unless separately activated upstream.

**Settled**

---

# 19. Contradiction Check

No material contradiction was found between:

```text
legacy Companion appearance system
legacy SquareCoil skin system
post-mine framework reconciliation
L5A threshold behavior
L7 Settings/Themes/Support behavior
```

Current prototype omissions are implementation incompleteness, not conflicting product behavior.

**Settled**

---

# 20. Continuity State

### Settled

- core Companion Light/Dark/Auto;
- Solid/Glass;
- Original/Refined Light/Sleek Dark;
- logo fallback/restoration;
- Preferences service behavior;
- cross-tab concurrency;
- Timer Limits;
- Settings IA/navigation;
- dirty-draft/focus safety;
- Support/Feedback/diagnostics privacy;
- Developer Support boundaries;
- presentation failure isolation.

### Provisional

- Cinematic Background detailed behavior until upstream activation;
- Design Dashboard presentation-profile detailed behavior until upstream activation;
- final typography, spacing, animation, visual tokens.

### Open

None for core B5-A.

### Blocked

Optional B5-B behavior detail is blocked only by an upstream inclusion/scope decision. Core B5-A is not blocked.

---

# 21. Logic Readiness Judgment

**Core B5-A is implementation-ready at the behavior layer.**

No core Settings, appearance, skin, limits, Support, or diagnostics behavior still has to be guessed.

With B2-C, B3, B4, and core B5-A now audited, there is no remaining core behavior-layer blocker in the planned rebuild. The next core work is downstream implementation/acceptance. Logic should reopen only for a genuine contradiction, a newly activated optional presentation pack, or a new product behavior request.