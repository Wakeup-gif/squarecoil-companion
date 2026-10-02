# SquareCoil Companion Rebuild
## B5-B Optional Presentation Behavior

**Status:** Settled when activated — implementation-ready at the behavior layer; release activation remains outside Logic ownership  
**Scope:** optional Cinematic Background and Design Dashboard presentation profile  
**Active branch:** `proto/squirel-coil-plugin`  
**Depends on:** settled L7 presentation safety, B5 core readiness, and the feature-mine reconciliation  
**Purpose:** preserve the useful historical visual behavior without allowing optional presentation to own Timer State, SquareCoil business behavior, lifecycle health, or core release readiness.

---

# 1. Direct Assessment

The historical sources confirm two separate optional presentation capabilities:

```text
v2.2.7
Cinematic fresh-Bing wallpaper + live glass presentation

v2.2.9
page-gated Design Dashboard presentation refresh
for /dashboard.php?show=2
```

The v2.2.9 layer depends on the earlier visual system; it is not a separate Design business application. The repository also contains separate Design-layout/runtime modules, but those remain sibling tools and are not absorbed into Companion by this behavior contract.

If either optional capability is activated for implementation, downstream work does not need to invent its core behavior after this file.

This file does **not** decide that either capability must ship.

**Settled**

---

# 2. Authority Boundary

B5-B is presentation only.

It may read:

```text
committed presentation preferences
accessibility/media capabilities
current supported SquareCoil page identity
presentation-owned cache/status
```

It may not:

```text
write Timer State
write Time Ledger
call SquareCoil clock actions
interpret native clock authority
change project/job values
change Design workflow data
change native form values
change business record ordering
claim lifecycle READY/NOT_READY
```

B5-B failure cannot make healthy Timer authority unhealthy.

**Settled**

---

# 3. Optional Capability Activation

There are two different layers of activation:

```text
PRODUCT/UPSTREAM ACTIVATION
Is the optional capability included in the implementation scope at all?

USER/EFFECTIVE PRESENTATION
If included, is it currently allowed to render?
```

Logic owns only the second question once upstream includes the capability.

Do not silently turn historical code existence into a core-release requirement.

**Settled**

---

# 4. Cinematic Background Preference

If Cinematic Background is activated as a product capability, expose a durable presentation preference equivalent to:

```text
NONE
CINEMATIC
```

Default:

```text
NONE
```

The preference is independent from Companion Timer Appearance and Timer Panel Finish.

It is subordinate to the Website Theme and accessibility rules below.

Changing this preference creates no Timer/Ledger mutation.

**Settled**

---

# 5. Cinematic Effective-State Model

Presentation states:

```text
DISABLED
SUSPENDED_THEME
SUSPENDED_ACCESSIBILITY
LOADING_INITIAL
SHOWING
REFRESHING
DEGRADED_CACHE
DEGRADED_FALLBACK
DEGRADED_NONE
```

These are presentation dispositions, not lifecycle or Timer states.

## DISABLED

Preference is `NONE` or capability is not activated.

No remote wallpaper request is required and no cinematic host/motion remains active.

## SUSPENDED_THEME

Preference is `CINEMATIC`, but the current Website Theme does not permit a background.

Preference remains Cinematic; effective background is none.

## SUSPENDED_ACCESSIBILITY

Preference is Cinematic but current accessibility/capability conditions require a safer static/native presentation.

Preference is retained.

## LOADING_INITIAL

Eligible, but no safe currently displayable wallpaper is available yet.

The existing base Website Theme remains visible. Do not blank the page while waiting.

## SHOWING

A fully loaded accepted image is displayed.

## REFRESHING

A current valid image stays displayed while the next candidate is retrieved/preloaded.

## DEGRADED_CACHE

Remote refresh failed, but a previously validated cached image remains usable.

## DEGRADED_FALLBACK

Remote/cache path failed and an approved packaged/configured fallback image is used.

## DEGRADED_NONE

No safe image is available. Remove/suppress the background and keep the underlying Website Theme usable.

**Settled**

---

# 6. Website Theme Compatibility

L7 `ORIGINAL` means native SquareCoil presentation. Therefore:

```text
Website Theme = ORIGINAL
-> effective Cinematic Background = suspended / none
```

Cinematic preference is not erased.

The historical cinematic implementation is specifically a dark-glass system. For the first optional implementation baseline:

```text
SLEEK_DARK    -> eligible for Cinematic
REFINED_LIGHT -> background remains suspended unless a separately audited light-compatible treatment is approved
ORIGINAL      -> suspended
```

This prevents a builder from forcing a dark wallpaper system underneath a native/light presentation that was never designed for it.

A future audited Refined-Light background treatment may extend compatibility without changing the preference semantics.

**Settled first optional baseline**

---

# 7. Accessibility Precedence

Presentation safety outranks cinematic polish.

When forced-colors, high-contrast, reduced-transparency, or equivalent conditions make the wallpaper/glass treatment unsafe or unreadable:

```text
preference = CINEMATIC
effective background = SUSPENDED_ACCESSIBILITY
```

The Website Theme resolves through normal L7 accessibility rules.

For `prefers-reduced-motion: reduce`:

- no continuous pan/zoom motion;
- do not animate a long crossfade;
- a replacement image may be swapped only after it is ready using a static or minimal reduced-motion transition;
- image retrieval/caching may continue because reduced motion is not the same as disabling imagery.

Turning the accessibility constraint off may restore the effective cinematic treatment without rewriting the saved preference.

**Settled**

---

# 8. Remote Wallpaper Privacy Boundary

A remote wallpaper provider is an external presentation dependency.

When Cinematic is disabled/suspended, no wallpaper refresh request should be made merely for future convenience.

When enabled and eligible:

- requests may contain only provider-required generic wallpaper parameters;
- do not send SquareCoil job/project IDs, customer names, departments, timer values, user-entered text, support drafts, history, or diagnostics;
- remote responses are untrusted presentation input;
- provider failure remains presentation-only;
- the user-facing setting/help text should make clear that enabling fresh wallpaper uses an external image source.

The historical source used Bing. The exact provider/API remains implementation/product policy, but an implementation may not silently broaden to arbitrary page-provided remote URLs.

**Settled behavior; provider selection is outside Logic**

---

# 9. Remote Image Acceptance

Before a new wallpaper replaces the currently displayed image:

1. remote metadata/URL passes the configured source policy;
2. image candidate is structurally valid for the image loader;
3. image successfully loads/decodes enough to be safely displayed;
4. the request/result still belongs to the current preference/theme/runtime generation;
5. a newer preference/theme/teardown decision has not superseded it.

Never inject provider HTML/script as wallpaper content.

A failed candidate cannot replace a currently good image with a blank/broken layer.

A late result after Cinematic is disabled, theme is changed, or runtime is torn down is discarded.

**Settled**

---

# 10. Initial Load and Cache Behavior

On eligible activation:

```text
valid cached image available
-> display/cache path may become current immediately
-> refresh in background

no valid cache
-> keep base Website Theme visible
-> request candidate
-> show only after candidate is ready
```

Cache is presentation data only.

Rules:

- cache corruption is ignored, not fatal;
- stale cache may be used as a degraded visual fallback when it remains structurally safe;
- cache failure never resets Timer/persistent business data;
- wallpaper cache is not authoritative Companion backup/history data;
- Full Backup may preserve the user preference, but need not embed downloaded wallpaper bytes.

Exact cache representation/size/age policy is implementation policy.

**Settled**

---

# 11. Rotation and Refresh Behavior

Historical v2.2.7 had independent rotation/refresh timers. The rebuilt behavior preserves the intent, not those literal constants.

Required behavior:

- refresh cadence is bounded and independent of Timer/UI tick cadence;
- do not issue rapid retry loops on provider failure;
- one refresh episode is enough at a time per effective presentation owner;
- keep the current valid wallpaper while refresh is pending;
- repeated provider failure settles into cache/fallback/none rather than continuously flashing errors;
- hidden/background documents may suspend motion and defer nonessential refresh until visible;
- becoming visible may revalidate freshness without creating a request storm across tabs.

Exact intervals, backoff and cross-tab fetch deduplication are implementation policy.

**Settled**

---

# 12. Image Handoff

Normal-motion handoff:

```text
current image remains visible
+
next image fully ready
-> next layer starts from safe initial presentation
-> controlled crossfade/handoff
-> old layer becomes inactive
```

Rules:

- no black/white flash between valid images;
- do not show partial-image loading as the active wallpaper;
- only one image is semantically active after handoff completes;
- duplicate/same-image refresh may be a no-op;
- overlapping late swaps are generation/token ordered so older work cannot overwrite a newer accepted image.

Exact animation duration/easing is visual implementation policy.

**Settled**

---

# 13. Motion Lifecycle

When normal motion is allowed, cinematic motion may provide slow pan/zoom presentation.

Behavior requirements:

- motion is decorative and pointer-inert;
- it cannot move native controls or change page geometry;
- hidden/inactive page may pause/suspend expensive motion;
- resume uses current presentation state rather than spawning stacked animations;
- image change cancels/supersedes old-layer motion safely;
- disable/theme suspension/teardown cancels owned timers/animations/listeners;
- repeated apply/recovery cannot create duplicate wallpaper hosts or animation loops.

Exact path, zoom range and duration are implementation/design decisions.

**Settled**

---

# 14. Cinematic Failure Matrix

| Condition | Required behavior |
|---|---|
| provider metadata request fails | retain current valid image; otherwise cache -> fallback -> none |
| image load/decode fails | reject candidate; do not replace current image |
| cache unreadable | ignore cache and continue safe load/fallback path |
| fallback unavailable | base Website Theme remains usable |
| Cinematic disabled during request | late result discarded; owned presentation removed |
| Website Theme becomes Original | suspend/remove cinematic artifacts; restore native presentation through L7 |
| Website Theme becomes unsupported custom theme | retain preference, suspend effective background |
| reduced motion becomes active | stop continuous motion; keep static accepted image if otherwise allowed |
| accessibility forces native/safer presentation | suspend effect without changing preference |
| page hidden | motion may stop; essential core behavior unaffected |
| extension/runtime recovery | re-evaluate preference/theme/capabilities; no duplicate host/timers |
| presentation code throws | isolate failure; Timer/Bridge/Ledger remain healthy |

**Settled**

---

# 15. Design Dashboard Profile Identity

Historical v2.2.9 activates only when:

```text
pathname = /dashboard.php
query show = 2
```

Canonical optional profile eligibility follows that page identity.

A different dashboard query/page is not automatically treated as the Design Dashboard merely because it contains visually similar classes.

If the page contract changes later, broaden matching only after the new page identity is audited.

**Settled**

---

# 16. Dashboard Profile Effective State

Presentation dispositions:

```text
INACTIVE_PAGE
INACTIVE_THEME
APPLIED
PARTIAL_SAFE
SUSPENDED_ACCESSIBILITY
```

## INACTIVE_PAGE

Current page is not the audited Design Dashboard.

No dashboard-profile artifacts remain active.

## INACTIVE_THEME

Website Theme is `ORIGINAL`, or current custom theme/profile combination is not approved.

Base/native presentation remains.

## APPLIED

Audited page + compatible effective Website Theme + accessibility safety allows the profile.

## PARTIAL_SAFE

Some audited selectors/surfaces are missing or have changed. Apply only still-recognized safe styling and leave unknown areas untouched.

Missing selectors do not justify a broader guessed selector.

## SUSPENDED_ACCESSIBILITY

Profile-specific treatment is reduced/disabled when required for usability; durable Website Theme preference remains unchanged.

**Settled**

---

# 17. Dashboard Theme Compatibility

The historical v2.2.9 profile was built on the v2.2.7 dark visual system.

First optional activation baseline:

```text
SLEEK_DARK    -> dashboard profile eligible
ORIGINAL      -> profile inactive
REFINED_LIGHT -> base Refined Light only unless a dedicated light dashboard audit is completed
```

This avoids mechanically recoloring the dark-only historical dashboard rules into a light theme without evidence.

**Settled first optional baseline**

---

# 18. Dashboard Profile Allowed Changes

The profile may adjust presentation of audited Design Dashboard surfaces such as:

```text
page spacing/width
KPI/task/design/estimate widgets
panel/card surfaces
design-list containers and rows
headings/typography
sort/info/expander visual treatment
native select appearance
buttons
modals/dialog surfaces
scrollbar presentation
```

Presentation/layout adjustment is allowed only while the underlying business interaction remains equivalent.

**Settled**

---

# 19. Dashboard Business-Safety Invariants

The dashboard profile must not:

- change KPI/task/design/estimate values;
- reorder jobs/design rows for cosmetic reasons;
- hide rows, warnings, errors, disabled states, required controls, or permissions;
- change select values/options;
- mutate native form values;
- change URLs/navigation targets;
- synthesize clicks or intercept existing business actions;
- convert a disabled control into an apparently enabled one;
- fabricate status labels;
- change Design Request/business workflow logic;
- own sibling Design Job Tools/Design Layout behavior.

Visual changes must preserve focus, readable semantic states, and interaction reachability.

**Settled**

---

# 20. Dashboard Dynamic Content

Because SquareCoil may render/update dashboard rows or modals dynamically:

- CSS/token-based styling naturally applies to matching new nodes without mutation logic;
- if a small owned decoration requires reapplication, use a targeted idempotent page-profile reapply;
- do not create a broad document-wide MutationObserver patch loop to reconstruct the dashboard;
- dynamic content from SquareCoil remains source-of-truth business DOM;
- missing/changed DOM yields `PARTIAL_SAFE`, not aggressive selector guessing.

**Settled**

---

# 21. Navigation Away / Back

When leaving `/dashboard.php?show=2`:

- profile-specific classes/style layers/listeners owned by the optional profile are removed/deactivated as applicable;
- base Website Theme may remain active on the destination page;
- native/business state is untouched.

Returning to the audited page:

- re-evaluate current committed Website Theme + accessibility state;
- apply one idempotent profile instance;
- do not stack historical style layers.

**Settled**

---

# 22. Optional Layer Precedence

When multiple presentation concerns compete, effective behavior follows:

```text
1. native/business interaction safety
2. accessibility safety
3. Website Theme = ORIGINAL/native restoration
4. compatible base custom Website Theme
5. compatible page presentation profile
6. optional cinematic background and motion polish
```

This is a behavior precedence, not implementation layering.

A lower item can be suspended without disabling a higher one.

Examples:

```text
Cinematic fails
-> Sleek Dark + Dashboard profile may remain

Dashboard profile fails
-> Sleek Dark + Cinematic may remain

Website Theme = Original
-> both Dashboard profile and Cinematic are inactive

forced colors unsafe
-> custom profile/background suspend while core/native usability remains
```

**Settled**

---

# 23. Cross-Tab Preference / Runtime Behavior

If Cinematic preference is durable, it follows the L7 cross-tab preference revision contract.

Each page/runtime independently resolves whether the effect is currently eligible based on page/theme/accessibility state.

Rules:

- one tab disabling Cinematic through the committed preference causes other tabs to stop on the new preference revision;
- per-document motion state is not authoritative/shared application state;
- wallpaper cache may be shared as presentation cache when safe, but one tab's animation progress is not synchronized to another;
- Dashboard profile eligibility is page-local and automatic from current page identity once the optional profile is product-enabled.

**Settled**

---

# 24. Acceptance — Cinematic Background

If activated, acceptance must cover at least:

```text
CINE-01 default NONE makes no wallpaper request
CINE-02 enable under Sleek Dark loads only after valid image readiness
CINE-03 current good image remains during refresh
CINE-04 remote metadata failure -> cache/fallback/none safely
CINE-05 candidate image failure never replaces good image
CINE-06 stale/late candidate cannot overwrite newer preference/theme generation
CINE-07 switch to Original removes/suspends cinematic presentation
CINE-08 switch away from Original restores effect only when still preferred + eligible
CINE-09 reduced motion has no continuous pan/zoom or long animated handoff
CINE-10 high-contrast/forced-colors safety suspension preserves preference
CINE-11 hidden/visible lifecycle creates no stacked animation/refresh loops
CINE-12 teardown/recovery creates at most one owned host/runtime presentation instance
CINE-13 remote requests contain no SquareCoil/job/timer/user-content payload
CINE-14 presentation failure produces zero Timer/Ledger/native-clock mutation
```

**Settled acceptance requirements**

---

# 25. Acceptance — Design Dashboard Profile

If activated, acceptance must cover at least:

```text
DASH-01 exact /dashboard.php?show=2 page is eligible
DASH-02 other dashboard modes/pages do not inherit profile by selector accident
DASH-03 Original keeps dashboard profile inactive/native
DASH-04 Sleek Dark applies profile idempotently
DASH-05 missing audited selector -> partial-safe, no broad guessed fallback
DASH-06 KPI/business values remain byte/text-equivalent before/after styling
DASH-07 list ordering/visibility remains native
DASH-08 forms/selects/buttons retain values/targets/disabled behavior
DASH-09 warnings/errors/focus remain perceivable
DASH-10 modal business behavior remains native
DASH-11 dynamic rows remain usable without patch-loop duplication
DASH-12 navigate away removes/deactivates profile ownership without harming base theme
DASH-13 return/recovery applies one profile instance
DASH-14 profile failure has zero Timer/Ledger/Bridge impact
DASH-15 sibling Design tools remain behaviorally independent
```

**Settled acceptance requirements**

---

# 26. Implementation Readiness

## Behavior-ready if activated

A downstream builder can implement either optional feature without inventing:

- whether it affects Timer authority (it never does);
- preference/effective-state distinction;
- Original/native precedence;
- first safe theme compatibility;
- loading/cache/fallback behavior;
- reduced-motion/accessibility behavior;
- stale remote-result handling;
- provider privacy boundary;
- exact Design Dashboard page match;
- business-safety boundary;
- dynamic-content fallback behavior;
- failure isolation;
- acceptance outcomes.

## Still outside Logic

The following remain upstream/product/design/implementation decisions:

- whether either optional feature is included in a release;
- remote wallpaper provider selection/change;
- exact refresh/cache/backoff constants;
- exact animation curves/timings/path geometry;
- exact CSS/token values and final typography;
- whether a future Refined-Light-compatible Cinematic/Dashboard treatment is designed and audited;
- implementation/module/repo packaging.

---

# 27. Continuity State

### Settled

- optional capabilities are non-core and non-authoritative;
- Cinematic preference/effective behavior;
- Original/native suppression;
- first optional baseline supports Sleek Dark rather than guessing light compatibility;
- remote privacy + stale-result + cache/fallback behavior;
- motion/reduced-motion/accessibility behavior;
- exact Design Dashboard page identity;
- dashboard business-safety boundary;
- dynamic content and selector-drift failure behavior;
- presentation precedence;
- acceptance requirements.

### Provisional

- whether optional capabilities are activated for implementation;
- provider/source policy choice;
- concrete refresh/cache/motion constants;
- final visual design values;
- any future Refined-Light optional presentation treatment.

### Open

None at the behavior layer **if the capability is activated under the first optional baseline above**.

### Blocked

No Logic blocker.

Activation itself is not a Logic Systems Architect decision.

---

# 28. Readiness Judgment

**B5-B optional presentation behavior is implementation-ready if activated.**

It remains non-blocking for the already implementation-ready core SquareCoil Companion.