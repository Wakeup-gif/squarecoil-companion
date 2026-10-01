'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(root, ...relative.split('/')), 'utf8');

test('UT-B5-THEME-020 authoritative Glass ports preserve the pinned source layers without remote executable or style dependencies', () => {
  const dark = read('src/presentation/ports/dark-glass.css');
  const light = read('src/presentation/ports/light-glass.css');
  for (const css of [dark, light]) {
    assert.match(css, /Presentation-only port of the pinned SquareCoil Tampermonkey source chain/);
    assert.match(css, /0e6e6ef36534b33383358b4223ae1ae9054848aa/);
    assert.match(css, /b0a89382eabdbcb873b3f8d20bcacb05ada7b63c/);
    assert.doesNotMatch(css, /@import|raw\.githubusercontent\.com|fonts\.googleapis\.com|www\.bing\.com/);
    assert.match(css, /#squarecoil-companion-cinematic-host/);
    assert.match(css, /data:image\/svg\+xml/);
  }
  assert.match(dark, /html\.us-sign-v230/);
  assert.match(dark, /Theme-v2\.3\.4\.user\.js/);
  assert.match(light, /html\.us-sign-v240\.us-sign-theme-light-glass/);
  assert.match(light, /Light-Glass-Theme-v1\.0\.0\.user\.js/);
  assert.match(light, /Companion compatibility delta for Light Glass/);
  assert.match(light, /html\.us-sign-v240\.us-sign-theme-light-glass body/);
});

test('UT-B5-THEME-027 terminal Glass compatibility owns production outer surfaces and Light rail text', () => {
  const generator = read('scripts/generate-authoritative-theme-port.js');
  const dark = read('src/presentation/ports/dark-glass.css');
  const light = read('src/presentation/ports/light-glass.css');
  assert.match(generator, /10af15634a10026c536f5dc570ec781af700c908/);
  assert.doesNotMatch(generator, /origin\/codex\/squarecoil-theme-v2\.3\.3/);
  assert.match(generator, /readFileSync\(outputPath, 'utf8'\)\.replace\(\/\\r\\n\?\/g, '\\n'\)/);
  assert.match(dark, /Companion compatibility delta for Dark Glass/);
  assert.match(dark, /html\.us-sign-v230\.us-sign-theme-dark-glass body/);
  assert.match(dark, /background-color:\s*var\(--v230-surface\)\s*!important/);
  assert.match(light, /#customer-name,#customer-info,#showbtns,#mapcontainer,#filesbox/);
  assert.match(light, /#descriptionbox,#projectbox,#designbox,#us-sign-design-project-header/);
  assert.match(light, /background-color:\s*var\(--usl-surface\)\s*!important/);
  assert.match(light, /body #pmlt[\s\S]*background-color:\s*var\(--us-squarecoil-glass\)\s*!important/);
  assert.match(light, /html\.us-sign-v240\.us-sign-theme-light-glass \{[\s\S]*--us-text:\s*var\(--usl-text\)\s*!important[\s\S]*--us-text-soft:\s*var\(--usl-text-soft\)\s*!important[\s\S]*--us-text-muted:\s*var\(--usl-muted\)\s*!important/);
  assert.match(light, /html\.us-sign-v240\.us-sign-theme-light-glass body :is\([\s\S]*\)::placeholder \{[\s\S]*color:\s*var\(--usl-muted\)\s*!important[\s\S]*opacity:\s*\.82\s*!important/);
  assert.match(light, /body #customer-name :is\(h1,h2,h3,\.panel-title,\.project-number,\.project-name\)/);
  assert.match(light, /body #content :is\(\.panel-body,\.panel-footer,\.table-responsive\)/);
  assert.match(light, /background-color:\s*transparent\s*!important[\s\S]*backdrop-filter:\s*none\s*!important/);
});

test('UT-B5-THEME-028 terminal Light compatibility owns generic content panels without selecting native controls', () => {
  const light = read('src/presentation/ports/light-glass.css');
  const rule = /html\.us-sign-v240\.us-sign-theme-light-glass body #content :is\(\.panel,\.panel-default\):not\(\.alert\):not\(\[data-us-state\]\) \{[\s\S]*?\}/.exec(light)?.[0];
  const textRule = /body #content :is\(\.panel,\.panel-default\):not\(\.alert\):not\(\[data-us-state\]\) :is\([\s\S]*?strong,b,small,a:not\(\.btn\)[\s\S]*?\) \{[\s\S]*?\}/.exec(light)?.[0];
  assert.ok(rule);
  assert.ok(textRule);
  assert.match(rule, /background-color:\s*var\(--usl-surface\)\s*!important/);
  assert.match(rule, /border-color:\s*transparent\s*!important/);
  assert.match(rule, /box-shadow:\s*0 7px 20px rgba\(28,55,74,\.065\)\s*!important/);
  assert.match(rule, /backdrop-filter:\s*var\(--us-squarecoil-live-frost\)\s*!important/);
  assert.doesNotMatch(rule, /button|input|select|textarea|\.btn/);
  assert.match(textRule, /color:\s*var\(--usl-text\)\s*!important/);
  assert.match(textRule, /text-shadow:\s*none\s*!important/);
  assert.match(light, /keyboard-only ring is sufficient[\s\S]*:focus-visible \{[\s\S]*outline: 2px solid #36758a !important;[\s\S]*box-shadow: none !important;/);
  assert.match(light, /@media \(forced-colors: active\) \{[\s\S]*outline-color: Highlight !important;/);
});

test('UT-B5-THEME-029 terminal Dark compatibility replaces old graphite generic panels and clears nested exact layers', () => {
  const dark = read('src/presentation/ports/dark-glass.css');
  const generic = /html\.us-sign-v230\.us-sign-theme-dark-glass body #content :is\(\.panel,\.panel-default,\.well\):not\(\.alert\):not\(\[data-us-state\]\) \{[\s\S]*?\}/.exec(dark)?.[0];
  assert.ok(generic);
  assert.match(generic, /background-color:\s*var\(--v230-surface\)\s*!important/);
  assert.doesNotMatch(generic, /rgba\(11,\s*11,\s*14/);
  assert.match(dark, /body #content :is\([\s\S]*?#customer-name,#customer-info[\s\S]*?\) :is\(\.panel,\.well,\.panel-body,\.panel-footer,\.table-responsive\) \{[\s\S]*?background-color:\s*transparent\s*!important[\s\S]*?backdrop-filter:\s*none\s*!important/);
});

test('UT-B5-THEME-031 final Glass integration gives the collapsed restore control the hidden logo lane', () => {
  for (const relative of ['src/presentation/ports/dark-glass.css', 'src/presentation/ports/light-glass.css']) {
    const css = read(relative);
    assert.match(css, /img\[data-squarecoil-companion-logo="brand"\][\s\S]*display:\s*block\s*!important/);
    assert.match(css, /body\.sb-l-m[\s\S]*\.navbar-brand\s*\{[\s\S]*display:\s*none\s*!important[\s\S]*pointer-events:\s*none\s*!important/);
    const toggle = /body\.sb-l-m :is\(header\.navbar,\.navbar\) #toggle_sidemenu_l \{[\s\S]*?\}/.exec(css)?.[0];
    assert.ok(toggle);
    assert.match(toggle, /top:\s*11px\s*!important/);
    assert.match(toggle, /left:\s*11px\s*!important/);
    assert.match(toggle, /visibility:\s*visible\s*!important/);
    assert.match(toggle, /pointer-events:\s*auto\s*!important/);
    assert.match(css, /body\.sb-l-m #sidebar_left \.sidebar-toggle-mini \{[\s\S]*display:\s*none\s*!important/);
  }
});

test('UT-B5-THEME-021 document start orders the bounded fail-open presentation bootstrap before authority startup', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.deepEqual(manifest.content_scripts[0].js, ['dist/presentation-bootstrap.js', 'dist/content-controller.js']);
  assert.equal(manifest.content_scripts[0].run_at, 'document_start');
  const source = read('src/content/presentation-bootstrap.js');
  assert.match(source, /GUARD_BUDGET_MS = 1400/);
  assert.match(source, /visibility:hidden!important/);
  assert.match(source, /releaseGuard\('budget-expired'\)/);
  assert.doesNotMatch(source, /MutationObserver/);
});

test('UT-B5-THEME-022 wallpaper paint uses the authoritative custom property above a transparent isolated page canvas', () => {
  const dark = read('src/presentation/ports/dark-glass.css');
  const cinematic = read('src/presentation/cinematic-background.js');
  assert.match(dark, /body\s*\{[\s\S]*?isolation:\s*isolate\s*!important/);
  assert.match(dark, /html body #main,[\s\S]*?background:\s*transparent\s*!important/);
  assert.match(dark, /var\(--us-squarecoil-cine-image,\s*none\)\s*!important/);
  assert.match(cinematic, /setProperty\?\.\('--us-squarecoil-cine-image',\s*cssUrl\(dataUrl\),\s*'important'\)/);
  assert.match(cinematic, /background-image:var\(--us-squarecoil-cine-image,none\)/);
  assert.match(cinematic, /z-index:-1/);
});

test('UT-B5-THEME-023 Native teardown owns every imported theme marker and removes the generated style atomically', () => {
  const source = read('src/content/presentation-bootstrap.js');
  for (const marker of ['us-sign-v230', 'us-sign-v240', 'us-sign-theme-dark-glass', 'us-sign-theme-light-glass']) {
    assert.match(source, new RegExp(marker));
  }
  assert.match(source, /data-squarecoil-companion-theme-port/);
  assert.match(source, /=== 'authoritative'\) style\.remove/);
  assert.match(source, /markers\.remove\(\)/);
  assert.match(source, /clearSourceMarkers\(\)/);
});

test('UT-B5-THEME-024 presentation bootstrap keeps exact routes and cannot erase a later Refined Light owner', () => {
  const source = read('src/content/presentation-bootstrap.js');
  assert.match(source, /ROUTES\.find\(\(\[suffix\]\) => path === suffix\)/);
  assert.doesNotMatch(source, /path\.endsWith\(suffix\)/);
  assert.doesNotMatch(source, /path\.includes\('report'\)/);
  const markers = read('src/presentation/presentation-markers.js');
  assert.doesNotMatch(markers, /pathname\.endsWith\(/);
  assert.match(source, /rootTheme === activeTheme \|\| GLASS_THEMES\.has\(rootTheme\)/);
  assert.match(source, /clearSourceMarkers\(\{ forceRoot: true \}\)/);
});

test('UT-B5-THEME-025 authoritative Glass ports hide Companion-owned presentation from print output', () => {
  for (const file of ['src/presentation/ports/dark-glass.css', 'src/presentation/ports/light-glass.css']) {
    const css = read(file);
    assert.match(css, /Companion integration delta/);
    assert.match(css, /@media print[\s\S]*#ussign-job-timer[\s\S]*display:\s*none\s*!important/);
    assert.match(css, /@media print[\s\S]*#squarecoil-companion-cinematic-host[\s\S]*display:\s*none\s*!important/);
  }
});
