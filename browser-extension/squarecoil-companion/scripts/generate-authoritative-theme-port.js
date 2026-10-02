'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { FALLBACK_BACKGROUNDS } = require('../src/presentation/wallpaper-cache');

const root = path.resolve(__dirname, '..');
const outputDirectory = path.join(root, 'src', 'presentation', 'ports');
const PINNED_THEME_SHA = '10af15634a10026c536f5dc570ec781af700c908';
const SOURCES = Object.freeze({
  base: Object.freeze({
    ref: '0e6e6ef36534b33383358b4223ae1ae9054848aa',
    path: 'tampermonkey/US-Sign-Full-UI-Theme-v2.2.6-static-base.js'
  }),
  cinematic: Object.freeze({
    ref: 'b0a89382eabdbcb873b3f8d20bcacb05ada7b63c',
    path: 'tampermonkey/US-Sign-Full-UI-Theme-v2.2.7.user.js'
  }),
  dark: Object.freeze({
    ref: PINNED_THEME_SHA,
    path: 'tampermonkey/US-Sign-Full-UI-Theme-v2.3.4.user.js'
  }),
  light: Object.freeze({
    ref: PINNED_THEME_SHA,
    path: 'tampermonkey/US-Sign-Full-UI-Light-Glass-Theme-v1.0.0.user.js'
  })
});
const CURSORS = Object.freeze({
  default: 'tampermonkey/assets/us-sign-cursor-cutout-v2123.svg',
  hover: 'tampermonkey/assets/us-sign-cursor-cutout-hover-v2123.svg'
});
const DARK_EXTENSION_COMPATIBILITY_DELTA = `
/* Companion compatibility delta for Dark Glass. The shared cinematic layer's
 * broad :is() registry has greater specificity than the pinned v2.3.4 surface
 * registry. Reassert the final v2.3.4 production surfaces so they use one cool
 * glass recipe instead of falling back to the older graphite cards. */
html.us-sign-v230.us-sign-theme-dark-glass body #content :is(.panel,.panel-default,.well):not(.alert):not([data-us-state]) {
  color: var(--v230-text-soft) !important;
  background-color: var(--v230-surface) !important;
  background-image: linear-gradient(180deg,rgba(255,255,255,.024),rgba(255,255,255,.003)) !important;
  border-color: var(--v230-line) !important;
  box-shadow: var(--v230-shadow-sm),inset 0 1px 0 rgba(255,255,255,.024) !important;
}

html.us-sign-v230.us-sign-theme-dark-glass body :is(
  #customer-name,#customer-info,#showbtns,#mapcontainer,#filesbox,
  #descriptionbox,#projectbox,#designbox,#us-sign-design-project-header,
  #us-sign-design-actionbar,#us-sign-job-overview,#us-sign-design-summary,
  .us-sign-description-panel,.us-sign-designs-panel,.us-sign-files-panel
) {
  color: var(--v230-text-soft) !important;
  background-color: var(--v230-surface) !important;
  background-image: linear-gradient(180deg,rgba(255,255,255,.024),rgba(255,255,255,.003)) !important;
  border-color: var(--v230-line) !important;
  box-shadow: var(--v230-shadow-sm),inset 0 1px 0 rgba(255,255,255,.024) !important;
}

html.us-sign-v230.us-sign-theme-dark-glass body #content :is(
  #customer-name,#customer-info,#showbtns,#mapcontainer,#filesbox,
  #descriptionbox,#projectbox,#designbox,#us-sign-design-project-header,
  #us-sign-design-actionbar,#us-sign-job-overview,#us-sign-design-summary,
  .us-sign-description-panel,.us-sign-designs-panel,.us-sign-files-panel
) :is(.panel,.well,.panel-body,.panel-footer,.table-responsive) {
  color: var(--v230-text-soft) !important;
  background-color: transparent !important;
  background-image: none !important;
  box-shadow: none !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}
`;
const LIGHT_EXTENSION_COMPATIBILITY_DELTA = `
/* Companion compatibility delta for Light Glass. The pinned shared foundation
 * contains late dark ID rules. Reassert the Light v1 outer-surface registry at
 * a higher, theme-scoped specificity while keeping nested panes transparent so
 * the wallpaper is visible through one coherent layer instead of mixed cards. */
html.us-sign-v240.us-sign-theme-light-glass {
  --us-text: var(--usl-text) !important;
  --us-text-soft: var(--usl-text-soft) !important;
  --us-text-muted: var(--usl-muted) !important;
}

html.us-sign-v240.us-sign-theme-light-glass body :is(
  input:not([type="checkbox"]):not([type="radio"]),textarea,.form-control
)::placeholder {
  color: var(--usl-muted) !important;
  opacity: .82 !important;
}

html.us-sign-v240.us-sign-theme-light-glass body #content :is(.panel,.panel-default):not(.alert):not([data-us-state]) {
  color: var(--usl-text-soft) !important;
  background-color: var(--usl-surface) !important;
  background-image: linear-gradient(180deg,rgba(255,255,255,.50),rgba(246,251,253,.26)) !important;
  border-color: transparent !important;
  box-shadow: 0 7px 20px rgba(28,55,74,.065) !important;
  -webkit-backdrop-filter: var(--us-squarecoil-live-frost) !important;
  backdrop-filter: var(--us-squarecoil-live-frost) !important;
}

html.us-sign-v240.us-sign-theme-light-glass body #content :is(.panel,.panel-default):not(.alert):not([data-us-state]) :is(
  h1,h2,h3,h4,h5,h6,.panel-title,strong,b,small,a:not(.btn)
):not(.text-success):not(.text-warning):not(.text-danger):not(.text-info):not([data-us-state]) {
  color: var(--usl-text) !important;
  text-shadow: none !important;
}

html.us-sign-v240.us-sign-theme-light-glass body :is(
  #customer-name,#customer-info,#showbtns,#mapcontainer,#filesbox,
  #descriptionbox,#projectbox,#designbox,#us-sign-design-project-header,
  #us-sign-design-actionbar,#us-sign-job-overview,#us-sign-design-summary,
  .us-sign-description-panel,.us-sign-designs-panel,.us-sign-files-panel
) {
  color: var(--usl-text-soft) !important;
  background-color: var(--usl-surface) !important;
  background-image: linear-gradient(180deg,rgba(255,255,255,.50),rgba(246,251,253,.26)) !important;
  border-color: transparent !important;
  box-shadow: 0 7px 20px rgba(28,55,74,.065) !important;
  -webkit-backdrop-filter: var(--us-squarecoil-live-frost) !important;
  backdrop-filter: var(--us-squarecoil-live-frost) !important;
}

html.us-sign-v240.us-sign-theme-light-glass body #pmlt {
  color: var(--usl-text-soft) !important;
  background-color: var(--us-squarecoil-glass) !important;
  background-image: linear-gradient(180deg,rgba(255,255,255,.62),rgba(244,250,252,.36)) !important;
  border-color: transparent !important;
  box-shadow: none !important;
  -webkit-backdrop-filter: var(--us-squarecoil-live-frost) !important;
  backdrop-filter: var(--us-squarecoil-live-frost) !important;
}

html.us-sign-v240.us-sign-theme-light-glass body #pmlt :is(
  h1,h2,h3,strong,small,address,li,a,.project-number,[class*="project-number" i],
  .project-name,[class*="project-name" i],div:not(.label):not(.badge):not([class*="status" i])
),
html.us-sign-v240.us-sign-theme-light-glass body #customer-name :is(h1,h2,h3,.panel-title,.project-number,.project-name) {
  color: var(--usl-text) !important;
  text-shadow: none !important;
}

html.us-sign-v240.us-sign-theme-light-glass body #pmlt a:is(:hover,:focus-visible) {
  color: #1d5b8e !important;
}

html.us-sign-v240.us-sign-theme-light-glass body #content :is(
  #customer-name,#customer-info,#showbtns,#mapcontainer,#filesbox,
  #descriptionbox,#projectbox,#designbox,#us-sign-design-project-header,
  #us-sign-design-actionbar,#us-sign-job-overview,#us-sign-design-summary,
  .us-sign-description-panel,.us-sign-designs-panel,.us-sign-files-panel
) :is(.panel,.well,.panel-body,.panel-footer,.table-responsive) {
  color: var(--usl-text-soft) !important;
  background-color: transparent !important;
  background-image: none !important;
  border-color: transparent !important;
  box-shadow: none !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}

html.us-sign-v240.us-sign-theme-light-glass body #content :is(.panel-body,.panel-footer,.table-responsive) {
  color: var(--usl-text) !important;
}

html.us-sign-v240.us-sign-theme-light-glass body #content :is(
  #customer-name,#customer-info,#showbtns,#mapcontainer,#filesbox,
  #descriptionbox,#projectbox,#designbox,#us-sign-design-project-header,
  #us-sign-design-actionbar,#us-sign-job-overview,#us-sign-design-summary,
  .us-sign-description-panel,.us-sign-designs-panel,.us-sign-files-panel
) :is(h1,h2,h3,h4,h5,h6,.panel-title,strong,b,small,a:not(.btn)):not(.text-success):not(.text-warning):not(.text-danger):not(.text-info):not([data-us-state]) {
  color: var(--usl-text) !important;
  text-shadow: none !important;
}

/* Keep the glass hierarchy readable without outlining every nested box. */
html.us-sign-v240.us-sign-theme-light-glass body :is(.panel .panel,.well .well,.tab-content .panel,.panel .well,.well .panel) {
  border-color: transparent !important;
  box-shadow: none !important;
}

html.us-sign-v240.us-sign-theme-light-glass body :is(.panel-heading,.panel-footer,.modal-header,.modal-footer) {
  background: transparent !important;
  border-color: rgba(59,96,122,.10) !important;
}

html.us-sign-v240.us-sign-theme-light-glass body #topbar {
  background: rgba(250,253,254,.76) !important;
  border-color: rgba(59,96,122,.10) !important;
  box-shadow: none !important;
}

html.us-sign-v240.us-sign-theme-light-glass body :is(.btn,button):not(.btn-primary):not(.btn-info):not(.btn-success):not(.btn-warning):not(.btn-danger) {
  border-color: transparent !important;
  box-shadow: none !important;
}

/* The pinned theme draws an outline, border change and halo at once. One
 * keyboard-only ring is sufficient, with a system-color ring in contrast mode. */
html.us-sign-v240.us-sign-theme-light-glass body :is(a,button,input,select,textarea,[tabindex]):focus-visible {
  outline: 2px solid #36758a !important;
  outline-offset: 2px !important;
  box-shadow: none !important;
}

@media (forced-colors: active) {
  html.us-sign-v240.us-sign-theme-light-glass body :is(a,button,input,select,textarea,[tabindex]):focus-visible {
    outline-color: Highlight !important;
  }
}
`;
const COMPANION_EXTENSION_INTEGRATION_DELTA = `
/* Companion integration delta: the pinned userscripts do not own the extension
 * workspace, website-hosted logo recovery, collapsed-navigation recovery, or
 * cinematic host. This final layer resolves historical sidebar patches in one place. */
html:is(.us-sign-v230,.us-sign-v240) body :is(header.navbar,.navbar) .navbar-branding .navbar-brand>img[data-squarecoil-companion-logo="brand"],
html:is(.us-sign-v230,.us-sign-v240) body :is(header.navbar,.navbar) .navbar-brand>img[data-squarecoil-companion-logo="brand"] {
  display: block !important;
  visibility: visible !important;
  position: relative !important;
  margin: 0 !important;
  clip: auto !important;
  clip-path: none !important;
  opacity: 1 !important;
  overflow: visible !important;
  width: 100px !important;
  min-width: 100px !important;
  height: 38px !important;
  min-height: 0 !important;
  max-height: 38px !important;
  max-width: 100px !important;
  flex: 0 0 100px !important;
  padding: 3px 6px !important;
  object-fit: contain !important;
  border-radius: 7px !important;
  background: #fff !important;
}

html.us-sign-v230 body :is(header.navbar,.navbar) .navbar-branding .navbar-brand>img[data-squarecoil-companion-logo-asset="dark"],
html.us-sign-v230 body :is(header.navbar,.navbar) .navbar-brand>img[data-squarecoil-companion-logo-asset="dark"] {
  background: transparent !important;
}

html:is(.us-sign-v230,.us-sign-v240) body :is(header.navbar,.navbar) .navbar-branding .navbar-brand::before,
html:is(.us-sign-v230,.us-sign-v240) body :is(header.navbar,.navbar) .navbar-branding .navbar-brand::after,
html:is(.us-sign-v230,.us-sign-v240) body :is(header.navbar,.navbar) .navbar-brand::before,
html:is(.us-sign-v230,.us-sign-v240) body :is(header.navbar,.navbar) .navbar-brand::after {
  content: none !important;
  display: none !important;
}

/* In the minified rail, the working native toggle owns the old logo lane.
 * The logo is deliberately absent until expansion so it cannot cover or
 * intercept the only control that restores the left navigation. */
html:is(.us-sign-v230,.us-sign-v240) body.sb-l-m :is(header.navbar,.navbar) .navbar-brand {
  display: none !important;
  visibility: hidden !important;
  pointer-events: none !important;
}

html:is(.us-sign-v230,.us-sign-v240) body.sb-l-m :is(header.navbar,.navbar) #toggle_sidemenu_l {
  display: flex !important;
  visibility: visible !important;
  pointer-events: auto !important;
  position: fixed !important;
  top: 11px !important;
  left: 11px !important;
  right: auto !important;
  z-index: 1042 !important;
  width: 38px !important;
  min-width: 38px !important;
  max-width: 38px !important;
  height: 36px !important;
  min-height: 36px !important;
  max-height: 36px !important;
  margin: 0 !important;
  padding: 0 !important;
  align-items: center !important;
  justify-content: center !important;
  line-height: 1 !important;
  border-radius: 8px !important;
  transform: none !important;
  cursor: pointer !important;
}

html.us-sign-v230 body.sb-l-m :is(header.navbar,.navbar) #toggle_sidemenu_l {
  color: rgba(232,240,247,.92) !important;
  background: rgba(7,18,29,.88) !important;
  border: 1px solid rgba(190,220,243,.18) !important;
  box-shadow: 0 5px 16px rgba(0,0,0,.24) !important;
}

html.us-sign-v240 body.sb-l-m :is(header.navbar,.navbar) #toggle_sidemenu_l {
  color: #24445c !important;
  background: rgba(252,254,255,.94) !important;
  border: 1px solid rgba(63,88,111,.24) !important;
  box-shadow: 0 5px 16px rgba(20,42,59,.12) !important;
}

html:is(.us-sign-v230,.us-sign-v240) body.sb-l-m #sidebar_left :is(.sidebar-menu,.nav.sidebar-menu) {
  padding-top: 0 !important;
}

html:is(.us-sign-v230,.us-sign-v240) body.sb-l-m #sidebar_left .sidebar-toggle-mini {
  display: none !important;
}

@media print {
  html:is(.us-sign-v230,.us-sign-v240) :is(#ussign-job-timer,#squarecoil-companion-cinematic-host,#squarecoil-companion-cinematic-style) {
    display: none !important;
  }
}
`;
const QUIET_GLASS_PERFORMANCE_DELTA = `
/* Companion navigation/performance delta. The pinned prototypes decorated most
 * nested containers with a border and a live backdrop blur. Those repeated
 * full-page blur surfaces are expensive over a large photograph and create the
 * unwanted blue box outlines. Keep the theme fills and typography, but let a
 * single static wallpaper sit behind flat, borderless page surfaces. */
/* A root gradient must remain when the separate Bing photo preference is off.
 * The shared cache owns the same fallbacks used by document-start prepaint. */
html.us-sign-v230.us-sign-theme-dark-glass {
  background-color: #090d12 !important;
  background-image: ${FALLBACK_BACKGROUNDS.SLEEK_DARK} !important;
  background-position: center center !important;
  background-size: cover !important;
  background-repeat: no-repeat !important;
  background-attachment: scroll !important;
}
html.us-sign-v240.us-sign-theme-light-glass {
  background-color: #d9e9f2 !important;
  background-image: ${FALLBACK_BACKGROUNDS.LIGHT_GLASS} !important;
  background-position: center center !important;
  background-size: cover !important;
  background-repeat: no-repeat !important;
  background-attachment: scroll !important;
}

/* Match the terminal theme class pair; those earlier compatibility rules are
 * important and otherwise outrank a later one-class quiet override. */
html:is(.us-sign-v230.us-sign-theme-dark-glass,.us-sign-v240.us-sign-theme-light-glass) body :is(header.navbar,.navbar,#topbar,.topbar,#sidebar_left,#pmlt),
html:is(.us-sign-v230.us-sign-theme-dark-glass,.us-sign-v240.us-sign-theme-light-glass) body :is(#customer-name,#customer-info,#showbtns,#mapcontainer,#filesbox,#descriptionbox,#projectbox,#designbox,#us-sign-design-project-header,#us-sign-design-actionbar,#us-sign-job-overview,#us-sign-design-summary,.us-sign-description-panel,.us-sign-designs-panel,.us-sign-files-panel),
html:is(.us-sign-v230.us-sign-theme-dark-glass,.us-sign-v240.us-sign-theme-light-glass) body #content :is(.panel,.panel-default,.well):not(.alert):not([data-us-state]),
html:is(.us-sign-v230.us-sign-theme-dark-glass,.us-sign-v240.us-sign-theme-light-glass) body #content :is(.tab-content,.table-responsive,.panel-heading,.panel-footer,.nav-tabs,.dropdown-menu,.popover,.modal-content,.modal-header,.modal-footer),
html:is(.us-sign-v230.us-sign-theme-dark-glass,.us-sign-v240.us-sign-theme-light-glass) body :is(#pmlt,#sidebar_left,#content) :is(.panel,.panel-default,.well,.tab-content,.table-responsive,.panel-heading,.panel-footer,.nav-tabs,.sidebar-menu,.sidebar-left-content) {
  border: 0 !important;
  box-shadow: none !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}

html:is(.us-sign-v230.us-sign-theme-dark-glass,.us-sign-v240.us-sign-theme-light-glass) body #content :is(#projectbox,#designbox,#descriptionbox,#filesbox,#customer-info,#us-sign-design-right-stack) :is(table,thead,tbody,tr,th,td),
html:is(.us-sign-v230.us-sign-theme-dark-glass,.us-sign-v240.us-sign-theme-light-glass) body :is(#pmlt,#sidebar_left,#content) :is(.btn,button,.nav>li>a,.sidebar-menu a,.list-group-item):not(:focus-visible) {
  border: 0 !important;
  box-shadow: none !important;
}

/* The prototype's Design page has more specific nested border rules than its
 * general card registry. Target those exact presentation wrappers so their
 * colored outlines cannot win the cascade on project navigation. */
html:is(.us-sign-v230.us-sign-theme-dark-glass,.us-sign-v240.us-sign-theme-light-glass).us-sign-design-page body #content :is(
  #us-sign-design-project-header,#us-sign-design-summary,#us-sign-job-overview,
  #us-sign-design-actionbar,#us-sign-design-bottom-grid,#us-sign-design-right-stack,
  .us-sign-designs-panel,.us-sign-files-panel,.us-sign-description-panel
),
html:is(.us-sign-v230.us-sign-theme-dark-glass,.us-sign-v240.us-sign-theme-light-glass).us-sign-design-page body #content :is(
  #us-sign-design-project-header,#us-sign-design-summary,#us-sign-job-overview,
  #us-sign-design-actionbar,#us-sign-design-bottom-grid,#us-sign-design-right-stack
) :is(.panel,.panel-heading,.panel-body,.us-sign-djt-summary-cell,.us-sign-design-project-name,.us-sign-design-project-info,.us-sign-design-project-status),
html:is(.us-sign-v230.us-sign-theme-dark-glass,.us-sign-v240.us-sign-theme-light-glass).us-sign-design-page body #content #us-sign-design-right-stack table :is(th,td),
html:is(.us-sign-v230.us-sign-theme-dark-glass,.us-sign-v240.us-sign-theme-light-glass).us-sign-design-page body #content .panel.panel-primary.panel-border.top,
html:is(.us-sign-v230.us-sign-theme-dark-glass,.us-sign-v240.us-sign-theme-light-glass).us-sign-design-page body #content .panel.panel-primary.panel-border.top :is(.panel,.panel-heading,.panel-body),
html:is(.us-sign-v230.us-sign-theme-dark-glass,.us-sign-v240.us-sign-theme-light-glass).us-sign-design-page body #customer-info.panel.col-xs-12.no-gutter,
html:is(.us-sign-v230.us-sign-theme-dark-glass,.us-sign-v240.us-sign-theme-light-glass).us-sign-design-page body #pmlt {
  border: 0 !important;
  box-shadow: none !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}

/* Pending is a semantic state, not another decorative card outline. The old
 * dark shared rule can leave Light Glass with pale text on a clear alert. */
html.us-sign-v240.us-sign-theme-light-glass.us-sign-semantic-project-ux body .alert[data-us-state="pending"] {
  color: #18405b !important;
  background: rgba(221,241,251,.88) !important;
  border: 0 !important;
  border-left: 3px solid var(--usl-info) !important;
  box-shadow: none !important;
  -webkit-backdrop-filter: none !important;
  backdrop-filter: none !important;
}

/* Inputs still have a filled field. A visible ring appears only when keyboard
 * focus needs it; native forced-colors mode does not run this Glass port. */
html:is(.us-sign-v230,.us-sign-v240) body :is(input:not([type="checkbox"]):not([type="radio"]),textarea,select,.form-control,.btn,button,a):focus-visible {
  outline: 2px solid currentColor !important;
  outline-offset: 2px !important;
}

html:is(.us-sign-v230,.us-sign-v240) body #squarecoil-companion-cinematic-host .sc-cinematic-layer {
  inset: 0 !important;
  animation: none !important;
  transition: none !important;
  transform: none !important;
  filter: none !important;
  will-change: auto !important;
}
`;

function gitShow(ref, sourcePath) {
  return execFileSync('git', ['show', `${ref}:${sourcePath}`], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
}

function extractCss(source, label) {
  const marker = 'GM_addStyle(String.raw`';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`${label}: GM_addStyle String.raw block was not found`);
  const bodyStart = start + marker.length;
  const end = source.indexOf('`);', bodyStart);
  if (end < 0) throw new Error(`${label}: GM_addStyle block terminator was not found`);
  return source.slice(bodyStart, end);
}

function svgDataUrl(svg) {
  return `data:image/svg+xml,${encodeURIComponent(svg)
    .replace(/%20/g, ' ')
    .replace(/%3D/g, '=')
    .replace(/%3A/g, ':')
    .replace(/%2F/g, '/')}`;
}

function translateCss(css, cursorDataUrls) {
  return css
    .replace(/^\s*@import\s+url\([^)]+\);\s*$/gim, '')
    .replace(/--us-wallpaper:\s*url\("https:\/\/www\.bing\.com\/[^;]+;/g, '--us-wallpaper: none;')
    .replaceAll('${FADE_MS}', '7200')
    .replaceAll('#us-squarecoil-cinematic-wallpaper', '#squarecoil-companion-cinematic-host')
    .replaceAll('.us-squarecoil-cine-layer', '.sc-cinematic-layer')
    .replaceAll('var(--us-squarecoil-cine-image)', 'var(--us-squarecoil-cine-image, none)')
    .replace(
      /https:\/\/raw\.githubusercontent\.com\/Wakeup-gif\/test_repo\/main\/tampermonkey\/assets\/us-sign-cursor-cutout-v2123\.svg/g,
      cursorDataUrls.default
    )
    .replace(
      /https:\/\/raw\.githubusercontent\.com\/Wakeup-gif\/test_repo\/main\/tampermonkey\/assets\/us-sign-cursor-cutout-hover-v2123\.svg/g,
      cursorDataUrls.hover
    );
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function portContents(layers, metadata) {
  const banner = [
    '/* Generated by scripts/generate-authoritative-theme-port.js.',
    ' * Presentation-only port of the pinned SquareCoil Tampermonkey source chain.',
    ' * Userscript remote font imports are intentionally removed; the declared font stacks remain.',
    ` * Source layers: ${metadata.join(' | ')}`,
    ' */',
    ''
  ].join('\n');
  return `${banner}${layers.join('\n\n')}`
    .replace(/[ \t]+$/gm, '')
    .trimEnd() + '\n';
}

function writePort(filename, layers, metadata, checkOnly) {
  const result = portContents(layers, metadata);
  const outputPath = path.join(outputDirectory, filename);
  if (checkOnly) {
    const current = fs.existsSync(outputPath)
      ? fs.readFileSync(outputPath, 'utf8').replace(/\r\n?/g, '\n')
      : null;
    if (current !== result) {
      throw new Error(`${filename} is stale; run node scripts/generate-authoritative-theme-port.js`);
    }
  } else fs.writeFileSync(outputPath, result, 'utf8');
  process.stdout.write(`${filename} ${sha256(result)} ${Buffer.byteLength(result)} bytes\n`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.some(argument => argument !== '--check')) throw new Error(`Unsupported argument: ${args.find(argument => argument !== '--check')}`);
  const checkOnly = args.includes('--check');
  fs.mkdirSync(outputDirectory, { recursive: true });
  const cursorRef = SOURCES.dark.ref;
  const cursorDataUrls = {
    default: svgDataUrl(gitShow(cursorRef, CURSORS.default)),
    hover: svgDataUrl(gitShow(cursorRef, CURSORS.hover))
  };
  const layers = {};
  for (const [name, source] of Object.entries(SOURCES)) {
    const raw = gitShow(source.ref, source.path);
    layers[name] = translateCss(extractCss(raw, name), cursorDataUrls);
  }
  const sourceLabel = name => `${SOURCES[name].ref}:${SOURCES[name].path}`;
  writePort('dark-glass.css', [layers.base, layers.cinematic, layers.dark, DARK_EXTENSION_COMPATIBILITY_DELTA, COMPANION_EXTENSION_INTEGRATION_DELTA, QUIET_GLASS_PERFORMANCE_DELTA],
    ['base', 'cinematic', 'dark'].map(sourceLabel), checkOnly);
  writePort('light-glass.css', [layers.base, layers.cinematic, layers.light, LIGHT_EXTENSION_COMPATIBILITY_DELTA, COMPANION_EXTENSION_INTEGRATION_DELTA, QUIET_GLASS_PERFORMANCE_DELTA],
    ['base', 'cinematic', 'light'].map(sourceLabel), checkOnly);
}

main();
