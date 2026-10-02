# SquareCoil Companion Rebuild
## Logic Stage L7: Settings, Themes, Support, and Developer Support

**Status:** Settled - ready for L8  
**Logic stage:** L7  
**Depends on:** L0 invariants, L1 lifecycle, L2 state/time/migration, L3 SquareCoil Bridge, L4 core timer behavior, L5 time views/workspace, L6 data safety/backup  
**Framework authority:** `docs/REBUILD-MASTER-PLAN.md`  
**Purpose:** Define Settings navigation, preferences, appearance/theme behavior, Support/Feedback, diagnostics privacy, and optional developer-support behavior without allowing secondary UI features to own Timer State, lifecycle health, authoritative time, or unsafe native SquareCoil behavior.

---

# 1. Scope and Ownership

L7 owns:

- Settings router/navigation;
- open/close/back/recovery route behavior;
- focus/keyboard safety;
- dirty-draft loss protection;
- preference mutation and cross-tab preference concurrency;
- Timer Appearance: Light / Dark / Auto;
- Panel Finish: Solid / Glass;
- SquareCoil Website Theme: Original / Refined Light / Sleek Dark;
- native-UI/accessibility safety for themes;
- theme/logo application and fallback;
- Timer Limits editing/validation;
- routing to L5 Library and L6 Archives & Backup;
- navigation behavior while L6 mutations are staged/committing;
- Support ticket and Feedback forms;
- diagnostics whitelist, frozen preview, copy, and privacy behavior;
- mail-client transport and fallbacks;
- Developer Support page;
- Buy Me a Coffee external navigation;
- Cash App QR/tag display/copy;
- optional/free/no-nag/no-tracking rules;
- failure isolation for all secondary features.

L7 does not:

- clock the user in/out of SquareCoil;
- write Timer State directly;
- calculate Today/Week/Total independently;
- redefine L6 data mutation semantics;
- implement payment processing;
- collect payment credentials or donation status;
- define final CSS polish/spacing.

> Settings owns navigation and preference interaction. Domain services own their behavior. Timer State remains owned by L2/L4.

**Settled**

---

# 2. One Settings Router

Exactly one Settings router is owned by the single Companion renderer.

Feature modules do not patch Settings DOM after render and do not insert normal controls through MutationObserver chains.

Canonical routes include at least:

```text
SETTINGS_HOME
RECENT_JOBS
TIME_OVERVIEW
HISTORY
ACTIVITY_LOG
ARCHIVES_BACKUP
WEBSITE_THEME
TIMER_LIMITS
SUBMIT_TICKET
SEND_FEEDBACK
DEVELOPER_SUPPORT
```

L6 may expose nested Archives & Backup routes through the same router.

**Settled**

---

# 3. Settings Home Information Architecture

```text
TIMER APPEARANCE
Light | Dark | Auto

PANEL FINISH
Solid | Glass / Blur

LIBRARY
Recent Jobs
Time Overview
History
Activity Log
Archives & Backup

SQUARECOIL
Website Theme

TIMER LIMITS
Yellow | Orange | Red

SUPPORT
Submit a Ticket
Send Feedback

ABOUT
Support the Developer
```

Exact cards/icons/layout are visual implementation. Grouping and ownership are settled.

---

# 4. Open / Back / Close / Recovery

## 4.1 Open

Opening Settings:

- does not alter Selected Context or Timer State;
- records the invoking control for focus return;
- opens `SETTINGS_HOME` by default.

## 4.2 Subroutes and Back

Back returns one Settings level. A nested L6 route returns to its immediate parent before Home.

Settings Back is not browser Back and does not alter SquareCoil URL/history.

## 4.3 Close

Close returns to the main Companion surface with Selected Context and Timer State unchanged.

## 4.4 Reopen

After Settings is fully closed, reopening starts at `SETTINGS_HOME`. Do not reopen stale Delete/Restore/Support screens.

## 4.5 Runtime recovery/rebuild

If the renderer/lifecycle recovers or rebuilds Settings after a runtime recovery:

- transient route stacks are discarded;
- recovered Settings starts at Home;
- no destructive confirmation is recreated as already approved;
- no Support draft is restored from durable storage;
- timing state remains governed by L1-L4.

**Settled**

---

# 5. Dirty Draft Loss Protection

Transient drafts may exist for:

- Ticket/Feedback forms;
- Timer Limit edits before Save;
- L6 import/restore conflict review state when exposed through Settings.

If Back/Close/route navigation would discard a materially modified uncommitted draft, Settings must not silently lose it.

Allowed behavior:

```text
Keep Editing
Discard Draft / Leave
```

or an equivalent explicit loss decision.

Exceptions:

- an unchanged/empty draft may close without confirmation;
- unexpected full page/lifecycle loss may discard transient Support drafts because L7 intentionally does not persist private message bodies.

The app must not solve draft loss by secretly storing Support content in preferences, backup, Activity Log, or diagnostics.

**Settled**

---

# 6. Focus, Keyboard, and Destructive-Control Safety

Requirements:

- opening Settings moves focus into Settings;
- route changes move focus to the new heading/meaningful control;
- close returns focus to the opener when it still exists;
- hidden controls are not focusable;
- Enter/Space use native focused-control semantics;
- Escape may cancel/close the topmost safe Settings layer but never Pause/Resume/Delete underneath;
- underlying timer shortcuts are suppressed while focus is inside Settings input/form/dialog controls;
- destructive confirmation does not default-focus the destructive action when a safer Cancel/Back target is appropriate;
- an Enter key that opened a destructive dialog cannot leak through and confirm it;
- canceling a destructive confirmation creates no mutation.

Exact focus-trap implementation is not logic.

**Settled**

---

# 7. L6 Operation Navigation Safety

Settings must respect the L6 Data Mutation Lock.

## Before authoritative commit

A staged import/restore/delete plan is still cancelable. Back/Close may cancel that uncommitted staged plan after any dirty-review guard required by the route.

## While authoritative commit is in progress

Once an L6 atomic commit has begun:

- Settings must not claim the operation was canceled;
- the destructive/import control is disabled from duplicate activation;
- route/close behavior must preserve access to a terminal result, or clearly indicate the operation continues if the UI is allowed to close;
- no second mutation is started by navigation.

## After terminal result

Success/failure is shown from L6's actual result. Settings does not infer success from button activation.

**Settled**

---

# 8. Preference Mutation Contract

Durable preferences use the Preferences service.

A committed change:

1. validates value(s);
2. verifies expected preference revision where a stale draft could overwrite newer changes;
3. commits one coherent preference revision;
4. publishes one preference-change snapshot/event;
5. renderer/theme service reacts idempotently;
6. Timer State/Ledger remain untouched.

If persistence fails:

- UI returns to or displays the last committed preference value;
- it does not pretend the new value is durable;
- feature-level error is shown;
- timer health is unaffected unless the failure reveals an independent core persistence problem under L1.

**Settled**

---

# 9. Cross-Tab Preference Concurrency

Durable preferences synchronize across tabs.

For immediate single-value controls such as Timer Appearance, the latest successfully committed preference revision becomes authoritative.

For multi-field drafts such as Timer Limits:

- the form records the preference revision it began from;
- if another tab commits new limits before this draft saves, the stale draft must not silently overwrite them;
- Save rechecks the base revision;
- stale draft is rejected/refreshed or requires explicit rebase/re-entry.

Per-tab transient route/focus/Support drafts never synchronize.

**Settled**

---

# 10. First-Install Defaults

```text
Timer Appearance = Light
Panel Finish      = Solid
Website Theme     = Original
Yellow            = 60 minutes
Orange            = 120 minutes
Red               = 240 minutes
```

Valid migrated preferences survive the rebuild. First-install defaults are not reapplied over existing valid user choices.

**Settled**

---

# 11. Timer Appearance

Canonical durable preference:

```text
LIGHT
DARK
AUTO
```

Timer Appearance changes Companion UI only.

## AUTO

- durable preference remains `AUTO`;
- effective Light/Dark follows the current system/browser color-scheme signal;
- system changes update effective presentation live;
- if signal is unavailable, effective presentation falls back to Light while preference remains Auto and a noncritical diagnostic may record the fallback.

Auto listener ownership is lifecycle/theme-service managed:

- at most one current color-scheme listener exists per runtime;
- leaving Auto removes/deactivates Auto-only listener behavior;
- teardown invalidates old listeners;
- repeated theme application cannot stack listeners.

**Settled**

---

# 12. Panel Finish

Canonical preference:

```text
SOLID
GLASS
```

Finish is independent from Timer Appearance.

Glass requirements:

- blur is limited to useful outer surfaces/tabs rather than every nested panel;
- text/controls remain readable and interaction-safe;
- first-install default is Solid;
- finish never changes timing.

If Glass is unsupported, unsafe, or incompatible with an accessibility/high-contrast environment:

```text
preference = GLASS
effectiveFinish = SOLID_FALLBACK
```

Retain the user's preference, show a nonblocking availability note when useful, avoid repeated expensive retries, and allow effective Glass to return if capability later becomes safe.

**Settled**

---

# 13. Presentation Accessibility Precedence

Timer/Website presentation must not fight browser accessibility modes.

When forced-colors/high-contrast/reduced-transparency capabilities make custom presentation unsafe or unreadable:

- preserve durable user preference;
- reduce/suspend custom visual treatment as needed;
- prefer readable native/system focus, text, control, border, and status treatment;
- Glass may resolve Solid;
- custom website colors may resolve to a safer effective theme treatment without rewriting the selected Website Theme preference.

Presentation preferences never outrank usable controls or semantic state clarity.

**Settled**

---

# 14. Theme Semantic Safety

Timer and Website themes are presentation only.

A theme must not:

- alter native form values;
- change native action targets/URLs;
- hide required native controls;
- remove disabled/read-only/error meaning;
- make focused controls indistinguishable;
- replace native content text with fabricated business data;
- recolor danger/warning/success/hold states so their semantic distinction is lost;
- intercept SquareCoil clock actions as part of styling.

If a selector cannot be styled safely, leave that native element unmodified rather than broad-guessing.

**Settled**

---

# 15. Website Theme Preference

```text
ORIGINAL
REFINED_LIGHT
SLEEK_DARK
```

Website Theme affects native SquareCoil presentation only and is independent from Timer Appearance/Finish.

## ORIGINAL

Remove only Companion-owned website-theme artifacts and restore native presentation as closely as possible. Use native logo.

## REFINED_LIGHT

Preserve recognizable SquareCoil structure/proportions; apply restrained readability/contrast cleanup; preserve native semantic colors; use native logo until an approved light custom asset exists.

## SLEEK_DARK

Preserve structure/proportions; use graphite/charcoal hierarchy; avoid glaring white outlines/wallpaper by default; preserve semantic colors; use the approved configured dark logo when available.

No light logo is fabricated.

**Settled**

---

# 16. Logo Policy and Failure

```text
Original       -> native logo
Refined Light  -> native logo until approved light asset
Sleek Dark     -> approved configured dark logo when available
```

If dark logo fails:

- Sleek Dark may remain active;
- native logo is used/restored;
- failure is feature-level only;
- no timer/lifecycle restart occurs.

Switching away from Sleek Dark restores native logo unless another approved theme asset is explicitly configured.

**Settled**

---

# 17. Website Theme Application / Reapplication

Theme application is idempotent.

It:

1. reads one committed preference snapshot;
2. removes/replaces only Companion-owned presentation artifacts;
3. applies the current effective treatment;
4. verifies it did not create duplicate owned layers;
5. reports feature-level status.

Repeated application cannot stack style tags/classes/listeners.

Known page/lifecycle changes may request targeted reapplication. The theme service must not use a broad document-wide mutation patch loop as normal UI construction.

Original/native restoration removes only what the theme service owns.

**Settled**

---

# 18. Timer Limits

Fields:

```text
Yellow minutes
Orange minutes
Red minutes
```

Validation:

```text
integer minutes
1 <= Yellow <= Orange <= Red
```

Rules:

- edits are transient until Save;
- invalid draft does not replace committed thresholds;
- Save uses the preference-revision rules above;
- successful Save emits one coherent threshold snapshot;
- threshold presentation recalculates from canonical Today values;
- threshold changes never create/end time;
- Reset to Defaults requires explicit activation and restores 60/120/240 through the same preference commit path.

Unsaved changed limits are protected by the dirty-draft rule.

**Settled**

---

# 19. Restored Preference Batch

L6 may restore multiple compatible preferences in one atomic restore.

L7 consumes the committed preference snapshot as one coherent revision:

- do not render intermediate half-restored combinations;
- resolve Timer Appearance/Finish/Website Theme after the restore preference commit;
- capability/accessibility fallbacks still apply;
- Support drafts/routes are not restored;
- no restored preference creates live Timer State.

**Settled**

---

# 20. Library / Archives Routing Boundary

```text
Recent Jobs       -> L5
Time Overview     -> L5
History           -> L5
Activity Log      -> Activity/L5 view
Archives & Backup -> L6
```

Archives & Backup may route to Browse Archives, Full Backup, Restore, Time Report, History CSV, Import History, Clear Recent, Manage Archived, Delete All Archived Data, Wipe All Time History, and nested L6 review/conflict screens.

Settings owns routing. L5/L6 own data semantics.

**Settled**

---

# 21. Support Boundary

Initial support transport is the user's default mail client via `mailto:`.

Configured destination:

```text
cristian@ussignandmill.com
```

The extension:

- never silently sends support mail;
- requires no SMTP/API credentials;
- runs no hidden support backend in first release;
- does not automatically attach private SquareCoil data;
- clearly exposes the recipient before the user opens the mail draft.

The user remains responsible for reviewing/sending in their mail client.

**Settled**

---

# 22. Ticket Form

Types:

```text
Bug
Feature Request
Question
Other
```

Required:

```text
Type
Subject
Description
```

Optional:

```text
Include Diagnostics
```

Validation:

- supported Type;
- non-whitespace Subject and Description;
- reasonable explicit field-length limits may be enforced;
- disallowed control characters in mail subject/header-like fields are normalized/rejected safely;
- validation never clears the draft.

**Settled**

---

# 23. Feedback Form

Categories:

```text
Suggestion
UI / UX
Feature Idea
General Feedback
```

Required:

```text
Category
Description
```

Optional Subject/short title and Include Diagnostics.

If Subject is empty, email may use a generic category-derived subject. User Description is not rewritten.

Validation preserves draft.

**Settled**

---

# 24. Support Draft Lifecycle

Ticket/Feedback message bodies are transient private Settings state.

- immediate preview/back retains the draft;
- navigating away/closing with a non-empty modified draft invokes the dirty-draft loss guard;
- after explicit discard/full close, draft is removed;
- first release does not persist message bodies into Preferences, Activity Log, Full Backup, History CSV, or diagnostics.

Unexpected page/runtime loss may discard the draft rather than secretly persisting private content.

**Settled**

---

# 25. Deterministic Email Composition

Ticket subject concept:

```text
[SquareCoil Companion][Bug] User subject
```

Feedback subject concept:

```text
[SquareCoil Companion Feedback][UI / UX] Optional subject
```

Body contains only:

- user-entered fields;
- minimal Companion version/report header;
- the exact frozen diagnostic block when diagnostics are enabled.

Mailto recipient/subject/body are safely URI-encoded. User-entered newlines remain body content, not executable headers.

The UI action must communicate that it opens an email draft/mail application rather than proving delivery. It may be labeled `Open Email Draft`, `Submit by Email`, or equivalent only if accompanying semantics do not falsely imply automatic sending.

**Settled**

---

# 26. Diagnostics Opt-In and Frozen Snapshot

Diagnostics are off by default for every Ticket/Feedback draft.

When the user enables Include Diagnostics:

1. generate one whitelist-only diagnostic snapshot;
2. show the exact text to the user;
3. associate that snapshot with the current Support draft;
4. compose/copy using that exact displayed snapshot.

Diagnostics are **not silently regenerated after preview** in a way that could add unseen fields or changed values.

The user may explicitly `Refresh Diagnostics`, which replaces the visible snapshot before composition.

Disabling diagnostics removes the diagnostic block without altering the Support draft.

The diagnostic snapshot is transient and is not saved in backup/preferences/activity.

**Settled**

---

# 27. Diagnostics Whitelist

Allowed output categories:

```text
Companion package/version
browser family + browser version
coarse SquareCoil page type
lifecycle state
Bridge capability/status
core module readiness summary
Timer Appearance preference/effective mode
Panel Finish preference/effective mode
Website Theme preference/effective mode
runtime/root count health summary
current timestamp
```

`coarse SquareCoil page type` must be a bounded category such as project-page/general-page/unknown. It must not embed job IDs, URL paths with identifiers, query strings, labels, customer names, or page text.

Optional safe booleans/counts require privacy review before joining the whitelist.

Automatically excluded:

```text
customer names
project/job names/descriptions
project/job numbers or Context IDs
project notes
full URL/query/path containing identifiers
native page body/form text
Time Ledger/session/history data
Today/Job Total values
CSV/backup contents
Support draft contents beyond the actual user-written email message
SquareCoil response payloads
cookies/tokens/credentials
email/account identifiers
raw full user-agent when coarse browser/version is sufficient
clipboard contents
```

A new diagnostic field cannot silently expand the whitelist.

**Settled**

---

# 28. Copy Diagnostics / Message

`Copy Diagnostics` inside a Support draft copies the currently visible frozen diagnostic snapshot.

A standalone diagnostics action outside a Support draft may generate a fresh current whitelist snapshot, but the text is shown before/with copy.

Copy Message uses the same composed content visible to the user.

Clipboard failure:

- provides selectable/manual-copy text;
- does not transmit anything;
- does not affect timer health.

Hidden metadata is never appended to copied text.

**Settled**

---

# 29. Mailto Launch and Fallback

On a valid Support action:

1. build deterministic recipient/subject/body from current draft and frozen diagnostics;
2. open the configured `mailto:` target;
3. keep the user responsible for actual mail-client send.

Because the browser cannot reliably prove a mail handler opened/sent, Support keeps fallbacks such as:

```text
Copy Message
Copy Diagnostics
Copy Support Email
```

The UI must not say `Ticket sent` or `Feedback sent` merely because mailto was opened.

If mailto content is too large:

- keep draft intact;
- do not silently truncate Description/diagnostics and call it complete;
- offer Copy Message;
- diagnostics may be omitted only after explicit user choice.

**Settled**

---

# 30. Support Activity Privacy

Activity Log may record minimal non-content events such as:

```text
support-ticket-mailto-opened
support-feedback-mailto-opened
diagnostics-copied
```

It never stores Subject, Description, diagnostic block, copied body, recipient-entered private content, or job/customer information from the Support draft.

Activity failure does not affect Support draft contents or timing.

**Settled**

---

# 31. Future Support Transport Boundary

Conceptual interface:

```text
SupportTransport.compose(message)
SupportTransport.submitOrOpen(message)
```

First release:

```text
EmailTransport -> mailto/default mail client
```

Any future API transport requires a separate privacy/security contract. L7 does not authorize hidden network submission, analytics payloads, or embedded support credentials.

**Settled**

---

# 32. Developer Support Boundary

Developer Support lives under:

```text
ABOUT
-> Support the Developer
```

It is separate from Ticket/Feedback and receives no diagnostics.

It must clearly state:

- Companion is free;
- updates are free;
- tips are optional;
- no feature is payment-gated.

It never auto-opens on install/update/startup.

**Settled**

---

# 33. Developer Support Content

Supports:

```text
short playful/workplace-appropriate copy
Buy Me a Coffee button
Cash App QR
Cash App cashtag/name
Copy Cash App name
free/free-updates/optional-tip statement
```

Tone may use restrained caffeine, bug-fix, weird-div, and tiny-development-gremlin humor.

No persistent donation badge/reminder appears on the timer.

**Settled**

---

# 34. Developer Support Configuration

Configuration still required outside logic:

```text
Buy Me a Coffee URL
Cash App cashtag/name
Cash App QR packaged/approved asset
```

Missing config:

- does not block timer/Settings/L7;
- does not fabricate a placeholder destination;
- hides or clearly disables only the unavailable method;
- leaves remaining configured methods functional.

A missing approved light Website Theme logo is similarly nonblocking and Refined Light keeps native logo.

**Settled**

---

# 35. External Developer-Support Link Safety

A configured Buy Me a Coffee destination must:

- use HTTPS;
- match the approved configured destination/host policy;
- reject `javascript:`, `data:`, or other executable/non-web schemes;
- open through intentional external navigation, normally a new tab/window;
- use opener isolation where applicable;
- receive no Companion-added job ID, Context, diagnostics, history, user identifier, donation-tracking token, or other private query parameter.

Companion does not read a donation result back from the destination.

A destination site may have its own independent privacy behavior, but Companion does not add tracking to infer completion.

**Settled**

---

# 36. Cash App QR / Cashtag

If configured:

- QR is a packaged/approved asset;
- cashtag/name is displayed from validated configuration;
- Copy copies only that configured text;
- clipboard failure provides manual copy;
- no dynamic payment request is generated from user/job data;
- no payment status is tracked;
- no card/bank/Cash App login credentials pass through Companion.

If QR is missing, the QR control degrades locally without breaking the cashtag or timer.

**Settled**

---

# 37. No Nag / No Donation Tracking

Developer Support must never:

- auto-open on install/update/startup;
- place persistent donation nags/badges on timer;
- reduce features for non-donors;
- change thresholds/access based on donation;
- store donation status;
- infer donation completion through analytics;
- include developer-support status in timer decisions.

The page is reached only through intentional navigation.

**Settled**

---

# 38. Secondary Feature Failure Isolation

These failures are secondary unless they reveal an independent core failure:

```text
Timer theme styling
Glass finish
Website theme
custom logo
Support form
mailto launch
clipboard
Developer Support
external link
QR asset
```

A secondary failure:

- shows local fallback/error;
- may produce privacy-safe feature status;
- creates no second runtime/root;
- clears no Timer State/history;
- does not stop accrual;
- does not mark lifecycle DEGRADED solely because a decorative/support feature failed.

**Settled**

---

# 39. Settings Loading / Error Safety

Routes distinguish:

```text
loading
loaded
loaded-empty
feature-unavailable
error
```

Rules:

- one failed route does not blank unrelated Settings Home sections;
- prior known values are not silently replaced with zero on read failure;
- Retry appears only when safe/idempotent;
- destructive actions remain disabled while required L6 protection/state is unknown;
- Back/Home/Close remain reachable unless an authoritative L6 commit is in the protected in-progress phase from Section 7;
- error UI never guesses mutation success.

**Settled**

---

# 40. Settings / Timer Isolation

Settings navigation itself never:

- pauses/resumes a Context;
- clocks into SquareCoil;
- finalizes a session;
- changes Today/Total;
- changes Recent/Archive except through explicit L5/L6 actions.

An L5 route may explicitly select a Context as an ordinary view action; that selection remains timing-neutral.

Opening Settings while ACTIVE leaves tracking running normally.

**Settled**

---

# 41. L7 Invariants

- **SETTINGS-01:** One router/renderer owns Settings.
- **SETTINGS-02:** Settings routes are not Timer State writers.
- **SETTINGS-03:** Reopen/recovery returns to Home, never a stale destructive route.
- **SETTINGS-04:** Modified transient drafts are not silently discarded by ordinary navigation.
- **SETTINGS-05:** Keyboard/focus events cannot leak timer/destructive commands through Settings.
- **SETTINGS-06:** In-progress L6 commit cannot be falsely canceled or duplicated by Settings navigation.
- **PREF-01:** First install defaults Light/Solid/Original and 60/120/240.
- **PREF-02:** Auto retains Auto while resolving system appearance.
- **PREF-03:** Auto/theme listeners are idempotent and teardown-safe.
- **PREF-04:** Stale multi-field preference drafts cannot silently overwrite a newer cross-tab revision.
- **PREF-05:** Restored preference batches apply as one coherent committed snapshot.
- **THEME-01:** Website Theme is independent from Timer Appearance/Finish.
- **THEME-02:** Themes are presentation only and cannot alter native SquareCoil business/action semantics.
- **THEME-03:** Accessibility/native usability outranks decorative theme treatment.
- **THEME-04:** Original removes only Companion-owned site-theme artifacts.
- **THEME-05:** Refined Light uses native logo until approved light asset exists.
- **THEME-06:** Sleek Dark logo failure falls back native without timer failure.
- **THEME-07:** Theme application cannot stack duplicate presentation/listener layers.
- **LIMIT-01:** `1 <= Yellow <= Orange <= Red` and invalid/stale drafts cannot overwrite valid committed limits.
- **SUPPORT-01:** Support messages are user-triggered and never silently sent.
- **SUPPORT-02:** Diagnostics are off by default, whitelist-only, previewed, and frozen to the visible snapshot used for composition.
- **SUPPORT-03:** Diagnostics exclude job/customer/history/private SquareCoil content.
- **SUPPORT-04:** Mailto launch is not ticket-delivery confirmation.
- **SUPPORT-05:** Support message/diagnostic snapshots are not durably stored by default.
- **SUPPORT-06:** Support recipient is visible and composed fields are safely encoded.
- **DEV-01:** Developer Support is optional, free-feature preserving, and non-nagging.
- **DEV-02:** Missing payment configuration never fabricates a destination or breaks Settings.
- **DEV-03:** Companion never handles payment credentials or tracks donation completion.
- **FAIL-01:** Secondary presentation/support failure cannot become timer failure.

**All Settled**

---

# 42. Acceptance Scenarios

## S1 Settings while ACTIVE
ACTIVE A continues; Settings opens Home; no timer mutation.

## S2 Close/Reopen
Close preserves timer/selection. Reopen begins Home, not prior destructive/support route.

## S3 Runtime recovery while Settings open
Recovered Settings begins Home; no old destructive approval or Support draft is resurrected.

## S4 Back isolation
Time Overview Back returns Settings Home; browser/SquareCoil page does not navigate.

## S5 Nested Archives Back
Nested L6 route -> Archives & Backup parent -> Home.

## S6 Dirty Support close
Modified Ticket draft + Close -> explicit Keep Editing/Discard choice; draft not silently lost.

## S7 Dirty limits route leave
Modified unsaved limits + route leave -> loss guard; committed limits unchanged until Save.

## S8 Keyboard leak safety
Enter/Escape used in Settings cannot Pause/Resume/Delete underlying timer.

## S9 Destructive dialog key safety
Key used to open a Delete dialog does not auto-confirm it; Cancel is safely reachable.

## S10 L6 staged restore Back
Before commit, Back may cancel staged plan after applicable review guard; no data mutation occurred.

## S11 L6 commit already started
Close/Back cannot claim cancellation or launch a duplicate commit; terminal L6 result remains authoritative.

## S12 First-install defaults
Light + Solid + Original + 60/120/240.

## S13 Migrated preferences
Valid existing choices survive instead of being reset to defaults.

## S14 Timer Dark independence
Timer becomes Dark; Website Theme remains unchanged.

## S15 Auto system switch
Auto + OS Light->Dark changes effective timer while preference remains Auto.

## S16 Auto unavailable
Effective Light fallback; preference Auto; timer healthy.

## S17 Auto listener idempotency
Repeated Auto application/recovery leaves exactly one current color-scheme listener.

## S18 Glass unsupported/accessibility fallback
Preference remains Glass; effective Solid fallback; no timer degradation.

## S19 High contrast / forced colors
Custom appearance yields to readable system/native treatment without rewriting user preference.

## S20 Original Website Theme
Only Companion site-theme artifacts are removed; native controls/data remain intact and logo restored.

## S21 Refined Light
Restrained native-like treatment with native logo; no fabricated light logo.

## S22 Sleek Dark
Dark site treatment applies independently and preserves native control semantics/status meaning.

## S23 Dark-logo failure
Native logo fallback; no runtime/timer restart.

## S24 Same theme reapplied
No duplicate styles/classes/listeners.

## S25 Native selector no longer matches
Theme leaves unknown element alone rather than broad-guessing/hiding native UI.

## S26 Invalid limit ordering
120/60/240 Save rejected; committed thresholds unchanged.

## S27 Valid limit save
Ordered limits save once and threshold presentation updates without timing change.

## S28 Stale cross-tab limits draft
Tab 2 saves new limits after Tab 1 opened editor; Tab 1 stale Save cannot silently overwrite Tab 2.

## S29 Restored preference batch
Dark + Glass + Sleek Dark restore commit renders as one coherent post-restore preference snapshot, not intermediate combinations.

## S30 Ticket validation
Missing Subject/Description blocks mailto and preserves draft.

## S31 Valid Bug ticket
Configured support recipient is visible; encoded mailto contains typed fields; mail client decides actual send.

## S32 Feedback without Subject
Generic category subject is derived; Description preserved.

## S33 Diagnostics default off
No diagnostics until explicitly enabled.

## S34 Diagnostics preview freeze
Preview shows snapshot A. System state changes. Email still uses visible snapshot A unless user explicitly Refreshes Diagnostics.

## S35 Diagnostics refresh
User refreshes -> preview becomes snapshot B; composition uses B.

## S36 Diagnostics privacy
Jobs/customers/history exist but diagnostic block contains no job number/label/URL identifier/history/CSV/backup/token/private payload.

## S37 Coarse page type
Project page diagnostic says a bounded type such as `project-page`, not `/project.php?id=260702` or job 260702.

## S38 Copy Diagnostics
Copies exactly visible diagnostic snapshot; sends nothing.

## S39 Clipboard unavailable
Manual selectable text remains; timer unaffected.

## S40 Mail handler unavailable
No false Sent status; Copy Message/Email fallback remains.

## S41 Mailto too large
Draft intact; no silent truncation; copy fallback and explicit diagnostics omission choice available.

## S42 Support Activity privacy
Activity may record mailto-opened event but not Subject/Description/diagnostic text.

## S43 Support full close after explicit discard
Draft is removed and is not in backup/preferences/activity.

## S44 Developer Support free statement
Companion/updates free, tips optional, no feature gate.

## S45 Missing developer config
No fabricated URL/cashtag/QR; only unavailable method degrades.

## S46 Buy Me a Coffee safe link
Only approved HTTPS destination opens; Companion adds no job/diagnostic/donation-tracking identifier.

## S47 Invalid external scheme
`javascript:`/`data:`/unapproved destination is rejected and not opened.

## S48 Cash App configured
Approved QR + exact configured cashtag/name; copy only that value; no payment status tracking.

## S49 QR missing
QR degrades locally while other Settings/timer features remain healthy.

## S50 No donation nag
Install/update/startup never auto-opens Developer Support or shows persistent timer donation badge.

## S51 Cross-tab appearance
Tab 1 changes Dark; Tab 2 adopts durable preference while keeping independent route/Selected Context.

## S52 Cross-tab Support isolation
Tab 1 Support draft never appears in Tab 2.

## S53 Preference persistence failure
Requested theme change fails to persist -> last committed preference remains authoritative; UI does not pretend durable success.

## S54 Feature route failure
Support/Theme/Activity route fails -> unrelated Settings Home and timer remain usable.

## S55 Destructive-state unknown
Delete/Wipe controls remain unavailable until L6 protection facts are known.

## S56 Theme change during provisional timer
L4 provisional/hold truth remains unchanged while presentation changes.

## S57 Production General while Settings open
Theme/Support/Settings interactions do not modify General Context timing.

## S58 Degraded Bridge diagnostics
Diagnostic block may report coarse Bridge state but never the last/current job identity.

## S59 Website/Timer theme axes
Original site + Dark timer and Sleek Dark site + Light timer both work without cross-writing preferences.

## S60 Support diagnostics not restored
Backup/restore does not restore a Support draft, diagnostic snapshot, or previous Support route.

---

# 43. Continuity States After L7

## Settled

- one Settings router/renderer;
- Home IA and transient route/reset behavior;
- dirty-draft loss protection;
- focus/keyboard/destructive-dialog safety;
- L6 in-progress mutation navigation behavior;
- preference validation, persistence failure, and revision concurrency;
- coherent restore preference batches;
- first-install defaults;
- Timer Light/Dark/Auto and listener lifecycle;
- Solid/Glass and accessibility fallback;
- Website Original/Refined Light/Sleek Dark independence;
- theme semantic/accessibility safety;
- native/light/dark logo policy and fallback;
- idempotent targeted theme reapplication;
- Timer Limit validation/reset/stale-draft behavior;
- L5/L6 routing ownership;
- mailto-based Support transport;
- Ticket/Feedback validation and draft privacy;
- opt-in frozen diagnostics preview with explicit whitelist/exclusions;
- Copy Diagnostics/Message fallbacks;
- safe mailto composition and no false delivery claim;
- minimal non-content Support Activity;
- future Support transport privacy boundary;
- Developer Support free/optional/no-nag/no-tracking behavior;
- missing developer config fallback;
- safe approved external-link behavior;
- Cash App QR/copy behavior;
- secondary feature failure isolation;
- cross-tab durable preference sync with per-tab transient isolation.

## Provisional

- exact Settings visual layout/icons/spacing;
- exact final microcopy/status labels;
- exact theme CSS tokens/selectors;
- exact Glass/accessibility capability detection mechanics;
- exact approved dark-logo packaging/reference implementation;
- future approved light-logo asset;
- exact Support field-length/mailto-size thresholds;
- exact Buy Me a Coffee approved URL/host;
- Cash App cashtag/name;
- Cash App QR packaged asset;
- exact playful Developer Support copy.

## Open for L8 / implementation

- cross-module failure-priority matrix;
- final core-vs-secondary user-visible error hierarchy;
- Settings/theme/Support browser smoke fixtures;
- SquareCoil theme-selector regression fixtures;
- mailto/clipboard/external-link harness behavior;
- Chrome/Edge acceptance parity.

## Blocked

None.

---

# 44. L7 Readiness Judgment

**Status: Settled - ready for L8**

L7 now defines Settings navigation, draft safety, preference concurrency, presentation/accessibility boundaries, Support privacy/transport, diagnostics preview guarantees, and Developer Support behavior strongly enough that L8 can integrate failures/acceptance without implementation inventing secondary-feature semantics.

Next stage:

**L8: Failure Behavior, Acceptance Criteria, and Implementation Handoff**
