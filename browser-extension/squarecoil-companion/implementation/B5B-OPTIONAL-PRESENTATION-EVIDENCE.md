# B5-B Optional Presentation Evidence

Status: **accepted**
Branch: `codex/squarecoil-b2c-migration`
Owning contracts: L7, L8, and `logic/B5B-OPTIONAL-PRESENTATION-BEHAVIOR.md`

## Requirements-to-source/tests matrix

| Requirement | Primary source | Stable automated evidence | Installed-browser evidence |
|---|---|---|---|
| Optional packs remain off by default and never gain Timer/Ledger/native-clock authority | preference schema, optional registry, content controller | `UT-B5-PREF-010/011`, `IT-B5-PREF-004`, `UT-B5-CINE-014`, `UT-B5-DASH-014` | `B5B-CINE-001`, `B5B-SAFETY-001` |
| Cinematic is Sleek-Dark-only, image-readiness-gated, generation-fenced, and accessibility aware | `src/presentation/cinematic-background.js` | `UT-B5-CINE-001` through `012`, `014`, `019/020` | `B5B-CINE-001/002` |
| Bing access is optional, fixed-policy, privacy-bounded, single-flight, and safely cached | `manifest.json`, `src/extension/wallpaper-provider.js` | `UT-B5-CINE-013`, `015` through `018`, `UT-B5-UI-009/010` | default-no-access, zero-request, fallback, and Restore Native checks under `B5B-CINE-001/002` |
| Dashboard styling applies only to exact `/dashboard.php?show=2` and owns one CSS layer | `src/presentation/dashboard-profile.js` | `UT-B5-DASH-001` through `005`, `011` through `013` | `B5B-DASH-001/002` |
| KPI text, ordering, links, selects, disabled controls, warnings, modal behavior, and sibling tools remain native | dashboard profile and audited selectors | `UT-B5-DASH-006` through `010`, `014/015` | `B5B-DASH-001/002`, `B5B-SAFETY-001` |
| Cross-tab optional preferences converge through the existing fenced writer | Preferences service and trusted core | `UT-B5-PREF-011`, `IT-B5-PREF-004` | inherited OWNER/OBSERVER and B5 Settings cases |
| Restore Native commits Original/NONE/OFF and removes all optional ownership/cache/access | Settings UI, provider, presentation teardown | `UT-B5-UI-010`, `UT-B5-CINE-012/019`, `UT-B5-DASH-012/013` | `B5B-CINE-002`, `B5B-DASH-002`, `B5B-SAFETY-001` |

## Automated gate

`npm run check:b5-optional` passes 477 aggregate unit/integration tests, the separate 13-test prototype-compatibility suite, and static validation. The aggregate contains 90 B1 unit, 168 B2 unit, 29 B3 unit, 28 B4 unit, 72 B5 unit, 38 B1 integration, 42 B2 integration, 2 B3 integration, 4 B4 integration, and 4 B5 integration tests.

Static validation records 222 B2, 31 B3, 32 B4, and 76 B5 stable unit/integration fixture IDs. B5-B adds 40 of those stable IDs and five installed-browser A4 IDs: `B5B-CINE-001/002`, `B5B-DASH-001/002`, and `B5B-SAFETY-001`.

## Exact candidate result

- source commit: `fff15682dd605c52264176a2a8282d897c6cb98b`;
- build ID/stage: `rebuild-b5b-optional-presentation` / `B5-B`;
- `sourceDirty: false`;
- candidate fingerprint: `530bf386fd030be459960529bcb1485805a53fda4d2560decdff6f08db8a460e`;
- ZIP SHA-256 before/after: `6c8ea71f711b74e505c3918993e94a3525b969c89028af63f18478acecbca710`;
- extracted/ZIP inventory digest: `3866e319190c36e356fa3256e8eb83a944b58adc152203c1c5b659f6b88c9170`;
- exact package inventory: 8/8 allowlisted files;
- installed Chrome `151.0.7922.174`: PASS, 25/25 cases;
- installed Edge `151.0.4129.107`: PASS, 25/25 cases;
- every required B1-B5-B A4 fixture ID observed;
- package and ZIP unchanged across both browsers;
- unexpected network requests: none;
- console/page errors: none;
- native SquareCoil mutation attempts: none;
- browser cleanup warnings: none;
- source commit was pushed before exact candidate acceptance;
- GitHub Actions run `33162812787`: success.

## Exact package inventory

| File | Bytes | SHA-256 |
|---|---:|---|
| `dist/background.js` | 376029 | `cd5094de3d30a03eabf9275b44eef52024e938c7de3cc7f9d8866acdf3ba9add` |
| `dist/build-info.json` | 278 | `051bc293f3e4c36bfb31cd80806803729b7d5c3b89b08aebc05c365281d4e0e4` |
| `dist/companion-app.js` | 56742 | `960e52b6a38ea2be21dba30c8518f764893aa58d23f3e1e4c8289b60ca5c9c4e` |
| `dist/content-controller.js` | 551455 | `4dfef6dffa6259c7d46254a3facee8bb94edddb52cf021d992965d10d813643c` |
| `dist/popup.js` | 7229 | `f3ec79d2f26fe58a20fb5470c2ec671e882219453f42443c1c5592f653f6cded` |
| `manifest.json` | 936 | `0a69f26304a935402ffb9e5451e6dc9663362882e25b45a68e0d9047e632c34a` |
| `popup/popup.css` | 1951 | `9b7faf1815c853bf53df35df49790d0f496701bc3d8a3df77aabf4f2f5731000` |
| `popup/popup.html` | 1680 | `103825db87d3a043da9d05310656dcbebb54062cc05ca465afbe704b65b3a42b` |

## Permission and network proof boundary

The real Settings click reaches Chrome's optional-host permission prompt. Headless installed-browser automation cannot choose browser-chrome permission UI, so the acceptance run does not claim that a real Bing permission grant was accepted. Grant, denial, exact acknowledgment, cache removal, and preference commit behavior are covered at the extension API/UI unit boundary. Installed Chrome and Edge prove the default-no-access path, zero Bing requests without access, embedded fallback readiness, exact route styling, and Restore Native removal/cache/access behavior.

The Bing provider accepts only the fixed public metadata URL and an exact validated `https://www.bing.com/th` image URL. It sends no SquareCoil URL, job, timer, page, identity, or user content.

## Proof boundary

The A4 harness uses synthetic in-memory SquareCoil fixture HTML and intercepted read-only action-7 responses. It proves packaged extension behavior and absence of native mutation attempts for those cases. It does not publish a release, mutate live SquareCoil business data, accept external permission prompts on the user's behalf, or authorize production promotion.
