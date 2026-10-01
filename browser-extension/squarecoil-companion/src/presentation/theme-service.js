'use strict';

const { normalizePreferenceSnapshot } = require('../preferences/preferences');

const STYLE_ID = 'squarecoil-companion-site-theme';
const ROOT_THEME_ATTRIBUTE = 'data-squarecoil-companion-site-theme';
const ROOT_ROUTE_ATTRIBUTE = 'data-squarecoil-companion-site-route';
const EDITOR_STYLE_ID = 'squarecoil-companion-ckeditor-document-theme';
const EDITOR_FRAME_ATTRIBUTE = 'data-squarecoil-companion-editor-frame';
const PRESENTATION_BOOTSTRAP_KEY = '__squareCoilCompanionPresentationBootstrap';
const WEBSITE_LOGO_SOURCE = 'images/US-Sign&-Mill-Logo - sized for SC site.png';
const ROUTE_BY_PATH = Object.freeze({
  '/dashboard.php': 'DASHBOARD',
  '/project_milestones.php': 'PROJECT_MILESTONES',
  '/project_designs.php': 'PROJECT_DESIGNS',
  '/project_tasks.php': 'PROJECT_TASKS',
  '/project_documents.php': 'PROJECT_DOCUMENTS',
  '/project_site_photos.php': 'PROJECT_PHOTOS',
  '/project.php': 'PROJECT_OVERVIEW',
  '/projects.php': 'PROJECTS',
  '/leads.php': 'LEADS',
  '/shopping_list.php': 'SHOPPING_LIST',
  '/purchase_orders.php': 'PURCHASE_ORDERS',
  '/tracking.php': 'TRACKING',
  '/receiving.php': 'RECEIVING',
  '/schedule.php': 'SCHEDULE',
  '/calendar.php': 'INSTALL_CALENDAR',
  '/vacation_calendar.php': 'VACATION_CALENDAR',
  '/active_inventory.php': 'ACTIVE_INVENTORY',
  '/sign_criteria.php': 'SIGN_CRITERIA',
  '/branding.php': 'BRANDING',
  '/report.php': 'REPORT',
  '/reports.php': 'REPORT'
});
const DARK_EDITOR_DOCUMENT_CSS = `
html,body,body.cke_editable,body.cke_editable_themed{color:#dce5ee!important;background:#0a1118!important;background-color:#0a1118!important;background-image:none!important;caret-color:#fff!important;color-scheme:dark!important;line-height:1.58!important}
body{padding:14px 18px!important}
a{color:#8fc9ff!important}
strong,b,h1,h2,h3,h4,h5,h6{color:#f5f8fb!important}
font[color="black"],font[color="#000000"],[style*="color:black" i],[style*="color: black" i],[style*="#000000" i],[style*="rgb(0, 0, 0)" i],[style*="rgb(0,0,0)" i]{color:#e6edf4!important}
font[color="blue"],[style*="color:blue" i],[style*="color: blue" i],[style*="#0000ff" i]{color:#8fc9ff!important}
font[color="red"],[style*="color:red" i],[style*="color: red" i],[style*="#ff0000" i]{color:#ffaaa7!important}
font[color="green"],[style*="color:green" i],[style*="color: green" i],[style*="#008000" i]{color:#9ed7aa!important}
@media(forced-colors:active){html,body,body.cke_editable,body.cke_editable_themed{color:CanvasText!important;background:Canvas!important;caret-color:CanvasText!important}}
@media print{html,body,body.cke_editable,body.cke_editable_themed{color:#111!important;background:#fff!important;background-image:none!important}}
`;
const LIGHT_EDITOR_DOCUMENT_CSS = `
html,body,body.cke_editable,body.cke_editable_themed{color:#18212b!important;background:#f8fafc!important;background-color:#f8fafc!important;background-image:none!important;caret-color:#111827!important;color-scheme:light!important;line-height:1.58!important}
body{padding:14px 18px!important}
a{color:#245f94!important}
strong,b,h1,h2,h3,h4,h5,h6{color:#111827!important}
font[color="black"],font[color="#000000"],[style*="color:black" i],[style*="color: black" i],[style*="#000000" i],[style*="rgb(0, 0, 0)" i],[style*="rgb(0,0,0)" i]{color:#111827!important}
font[color="blue"],[style*="color:blue" i],[style*="color: blue" i],[style*="#0000ff" i]{color:#245f94!important}
font[color="red"],[style*="color:red" i],[style*="color: red" i],[style*="#ff0000" i]{color:#9f2929!important}
font[color="green"],[style*="color:green" i],[style*="color: green" i],[style*="#008000" i]{color:#216a45!important}
@media(forced-colors:active){html,body,body.cke_editable,body.cke_editable_themed{color:CanvasText!important;background:Canvas!important;caret-color:CanvasText!important}}
@media print{html,body,body.cke_editable,body.cke_editable_themed{color:#111!important;background:#fff!important;background-image:none!important}}
`;
const REFINED_LIGHT_CSS = `
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"]{color-scheme:light;--sc-site-accent:#276a9f;--sc-site-text:#1b2b34;--sc-site-muted:#61717a;--sc-site-border:rgba(51,82,98,.12);--sc-site-panel:#fff;--sc-site-panel-2:#f3f7f8;--sc-site-canvas:#f2f5f6}
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] body,
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] :is(#main,#content_wrapper,#content){color:var(--sc-site-text)!important;background-color:var(--sc-site-canvas)!important;background-image:none!important;text-shadow:none!important}
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] :is(header.navbar,.navbar,#topbar,#sidebar_left,.sidebar-left,#pmlt){color:var(--sc-site-text)!important;background:#fbfcfc!important;border-color:var(--sc-site-border)!important;box-shadow:none!important}
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] #sidebar_left :is(.sidebar-menu,.nano-content){background:transparent!important}
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] #sidebar_left :is(a,span,i),
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] #pmlt :is(a,p,div,span,strong,small,h1,h2,h3){color:var(--sc-site-text)!important;text-shadow:none!important}
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] #sidebar_left a:is(:hover,:focus-visible,.active),
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] #sidebar_left a[data-active="true"],
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] #sidebar_left li.active>a{color:#174c75!important;background:#e6f1f4!important;border-color:transparent!important}
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] :is(header.navbar,.navbar) :is(a,span,strong,small,label):not(.btn):not(.label):not(.badge){color:#2b4254!important;text-shadow:none!important}
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] :is(.card,.panel,.panel-default,.well,.modal-content,.dropdown-menu,.tab-content){color:var(--sc-site-text)!important;background:var(--sc-site-panel)!important;background-image:none!important;border-color:transparent!important;box-shadow:0 5px 18px rgba(26,43,59,.045)!important;text-shadow:none!important}
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] :is(.panel-heading,.panel-footer,.modal-header,.modal-footer,.nav-tabs){color:var(--sc-site-text)!important;background:transparent!important;border-color:var(--sc-site-border)!important;text-shadow:none!important}
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] :is(.panel-body,.tab-pane,.table-responsive){color:var(--sc-site-text)!important;background:transparent!important;background-image:none!important}
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] :is(.panel .panel,.well .well,.modal-content .panel,.tab-content .panel){background:var(--sc-site-panel-2)!important;border-color:transparent!important;box-shadow:none!important;backdrop-filter:none!important}
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] :is(h1,h2,h3,h4,h5,h6,.panel-title,strong,b,label,p,li,td,th){color:var(--sc-site-text)!important;text-shadow:none!important}
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] :is(table,.table){color:var(--sc-site-text)!important;background:var(--sc-site-panel)!important}
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] :is(th,.table>thead>tr>th){color:#263746!important;background:var(--sc-site-panel-2)!important;border-color:var(--sc-site-border)!important}
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] :is(td,.table>tbody>tr>td){color:var(--sc-site-text)!important;background:transparent!important;border-color:var(--sc-site-border)!important}
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] :is(input,select,textarea,.form-control,.gui-input,.gui-textarea){color:var(--sc-site-text)!important;background:#fff!important;border-color:#c5d0d5!important;box-shadow:none!important}
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] :is(input,textarea,.form-control)::placeholder{color:#6d7b87!important;opacity:1!important}
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] :is(.btn,.button,button):not(.btn-primary):not(.btn-success):not(.btn-danger):not(.btn-warning){color:#20313f!important;background:#eaf1f3!important;border-color:transparent!important;text-shadow:none!important;box-shadow:none!important}
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] :is(.dropdown-menu,.select2-dropdown,.qtip,.fancybox-skin,.mfp-content,.cke,.cke_inner,.cke_top,.cke_bottom,.cke_contents){color:var(--sc-site-text)!important;background:#fff!important;border-color:var(--sc-site-border)!important;box-shadow:0 12px 34px rgba(26,43,59,.14)!important}
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] :is(.alert-danger,.text-danger){color:#9f2929!important}
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] :is(.alert-warning,.text-warning){color:#845413!important}
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] :is(.alert-success,.text-success){color:#216a45!important}
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] .navbar-brand{display:inline-flex!important;align-items:center!important;gap:8px!important;color:#17212b!important;text-decoration:none!important}
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] .navbar-brand>img[data-squarecoil-companion-logo="brand"]{display:block!important;width:100px!important;min-width:100px!important;max-width:100px!important;height:38px!important;flex:0 0 100px!important;object-fit:contain!important;padding:3px 6px!important;border-radius:7px!important;background:#fff!important}
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] .navbar-brand::before,html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] .navbar-brand::after{content:none!important;display:none!important}
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] .navbar :is(.navbar-right,.navbar-nav)>li>a:is(:hover,:focus-visible){color:#17334a!important;background:rgba(61,131,193,.12)!important}
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] #pmlt>div:has(>#duplicate){display:flex!important;align-items:center!important;flex-wrap:nowrap!important;gap:6px!important}
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] body.sb-l-m :is(header.navbar,.navbar) .navbar-brand{display:none!important;visibility:hidden!important;pointer-events:none!important}
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] body.sb-l-m :is(header.navbar,.navbar) #toggle_sidemenu_l{display:flex!important;visibility:visible!important;pointer-events:auto!important;position:fixed!important;top:11px!important;left:11px!important;z-index:1042!important;width:38px!important;height:36px!important;margin:0!important;padding:0!important;align-items:center!important;justify-content:center!important;border:1px solid var(--sc-site-border)!important;border-radius:8px!important;background:#fff!important;color:#24445c!important;box-shadow:0 5px 16px rgba(20,42,59,.12)!important;transform:none!important}
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] body.sb-l-m #sidebar_left .sidebar-toggle-mini{display:none!important}
html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] :is(a,button,input,select,textarea,[tabindex]):focus-visible{outline:2px solid #33738a!important;outline-offset:2px!important;box-shadow:none!important}
@media(forced-colors:active){html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] :is(a,button,input,select,textarea,[tabindex]):focus-visible{outline-color:Highlight!important}}
@media(prefers-reduced-motion:reduce){html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] *{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important}}
@media print{html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"],html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] body,html[${ROOT_THEME_ATTRIBUTE}="REFINED_LIGHT"] :is(#main,#content_wrapper,#content,.panel,.well,table,.table,th,td){color:#111!important;background:#fff!important;border-color:#bbb!important;box-shadow:none!important;backdrop-filter:none!important}}
`;
const LIGHT_GLASS_CSS = `
html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"]{color-scheme:light;--sc-site-accent:#347fbd;--sc-site-text:#1b2b34;--sc-site-muted:#60717b;--sc-site-border:rgba(63,88,111,.12);--sc-site-shell:rgba(250,253,254,.84);--sc-site-panel:rgba(255,255,255,.62);--sc-site-panel-2:rgba(245,249,251,.72)}
html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] body{color:var(--sc-site-text);background-color:transparent!important;background-image:none!important}
html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] :is(#main,#content_wrapper,#content){background-color:transparent!important;background-image:none!important}
html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] #topbar{color:var(--sc-site-text)!important;background:rgba(248,251,254,.68)!important;border-color:var(--sc-site-border)!important;-webkit-backdrop-filter:blur(16px) saturate(118%);backdrop-filter:blur(16px) saturate(118%)}
html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] :is(header.navbar,.navbar,#sidebar_left,.sidebar-left){color:var(--sc-site-text)!important;background:var(--sc-site-shell)!important;border-color:var(--sc-site-border)!important;-webkit-backdrop-filter:blur(16px) saturate(118%);backdrop-filter:blur(16px) saturate(118%)}
html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] #sidebar_left :is(.sidebar-menu,.nano-content){background:transparent!important}
html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] :is(.card,.panel,.well,.modal-content,.dropdown-menu,.tab-content){color:var(--sc-site-text);background:var(--sc-site-panel)!important;border-color:transparent!important;box-shadow:0 8px 24px rgba(26,49,70,.065)}
html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] :is(.card,.panel,.well,.modal-content){-webkit-backdrop-filter:blur(14px) saturate(112%);backdrop-filter:blur(14px) saturate(112%)}
html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] :is(.panel .panel,.well .well,.modal-content .panel,.tab-content .panel){background:rgba(255,255,255,.42)!important;border-color:transparent!important;box-shadow:none!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important}
html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] table{color:var(--sc-site-text);background:rgba(255,255,255,.58)!important}
html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] :is(th,.table>thead>tr>th){color:#283949!important;background:rgba(229,238,246,.84)!important;border-color:var(--sc-site-border)!important}
html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] :is(td,.table>tbody>tr>td){border-color:var(--sc-site-border)!important}
html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] :is(input,select,textarea,.form-control,.gui-input,.gui-textarea){color:var(--sc-site-text)!important;background:rgba(255,255,255,.82)!important;border-color:rgba(63,88,111,.30)!important;box-shadow:inset 0 1px 1px rgba(25,47,68,.04)!important}
html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] :is(.dropdown-menu,.select2-dropdown,.qtip,.fancybox-skin,.mfp-content,.cke,.cke_inner,.cke_top,.cke_bottom,.cke_contents){color:var(--sc-site-text)!important;background:rgba(250,252,254,.94)!important;border-color:var(--sc-site-border)!important;box-shadow:0 16px 40px rgba(26,49,70,.16)!important}
html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] :is(.dataTables_wrapper,.dataTables_info,.dataTables_length,.dataTables_filter,.select2-selection__rendered,.select2-results__option,.cke_combo_text){color:var(--sc-site-text)!important}
html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] :is(.gantt,.gantt-container,.gantt_grid,.gantt_task,.gantt_grid_scale,.gantt_task_scale,#gantt){color:var(--sc-site-text)!important;background:rgba(250,252,254,.78)!important;border-color:var(--sc-site-border)!important}
html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"][${ROOT_ROUTE_ATTRIBUTE}="INSTALL_CALENDAR"] .fc :is(.fc-day,.fc-widget-content,.fc-widget-header){color:var(--sc-site-text)!important;background-color:rgba(250,252,254,.72)!important;border-color:var(--sc-site-border)!important}
html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"][${ROOT_ROUTE_ATTRIBUTE}="INSTALL_CALENDAR"] .fc .fc-today{background-color:rgba(70,142,199,.16)!important;box-shadow:inset 0 0 0 1px rgba(52,127,189,.18)!important}
html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"][${ROOT_ROUTE_ATTRIBUTE}="INSTALL_CALENDAR"] .fc .fc-event{color:#17212c!important;background:rgba(255,255,255,.74)!important;border-width:2px!important;border-style:solid!important;border-radius:7px!important;box-shadow:0 4px 12px rgba(26,49,70,.10)!important}
html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] :is(.alert-danger,.text-danger){color:#9f2929!important}
html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] :is(.alert-warning,.text-warning){color:#845413!important}
html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] :is(.alert-success,.text-success){color:#216a45!important}
html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] .navbar-brand{display:inline-flex!important;align-items:center!important;gap:8px!important;color:#17212c!important;text-decoration:none!important}
html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] .navbar-brand>img[data-squarecoil-companion-logo="brand"]{display:block!important;width:100px!important;min-width:100px!important;max-width:100px!important;height:38px!important;flex:0 0 100px!important;object-fit:contain!important;padding:3px 6px!important;border-radius:7px!important;background:#fff!important}
html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] .navbar-brand::before,html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] .navbar-brand::after{content:none!important;display:none!important}
html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] .navbar :is(.navbar-right,.navbar-nav)>li>a:is(:hover,:focus-visible){color:#17334a!important;background:rgba(61,131,193,.13)!important}
html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] #pmlt>div:has(>#duplicate){display:flex!important;align-items:center!important;flex-wrap:nowrap!important;gap:6px!important}
html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] :is(a,button,input,select,textarea,[tabindex]):focus-visible{outline:2px solid #36758a!important;outline-offset:2px!important;box-shadow:none!important}
@media(forced-colors:active){html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] :is(a,button,input,select,textarea,[tabindex]):focus-visible{outline-color:Highlight!important}}
@media(max-width:767px){html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] #content{padding:14px 10px 38px!important}html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] :is(.panel,.well,.modal-content,.qtip,.mfp-content,.fancybox-skin){border-radius:10px!important}}
@media(prefers-reduced-motion:reduce){html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] *{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important}}
@media print{html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"],html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] body,html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] :is(#main,#content_wrapper,#content,.panel,.well,table,.table,th,td){color:#111!important;background:#fff!important;border-color:#bbb!important;box-shadow:none!important;backdrop-filter:none!important}html[${ROOT_THEME_ATTRIBUTE}="LIGHT_GLASS"] :is(#ussign-job-timer,#squarecoil-companion-cinematic-host,#squarecoil-companion-cinematic-style){display:none!important}}
`;
const SLEEK_DARK_CSS = `
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"]{color-scheme:dark;--sc-site-accent:#61aef7;--sc-site-text:#eef5fb;--sc-site-muted:#a9b8c5;--sc-site-border:rgba(192,221,244,.13);--sc-site-shell:rgba(7,15,23,.62);--sc-site-panel:rgba(9,18,27,.57);--sc-site-panel-2:rgba(13,25,36,.74)}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] body{background-color:transparent!important;background-image:none!important;color:var(--sc-site-text)}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] :is(#main,#content_wrapper,#content){background-color:transparent!important;background-image:none!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] #topbar{color:var(--sc-site-text)!important;background:rgba(7,15,23,.55)!important;border-color:var(--sc-site-border)!important;-webkit-backdrop-filter:blur(16px) saturate(118%);backdrop-filter:blur(16px) saturate(118%)}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] header.navbar,
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] .navbar{background:var(--sc-site-shell)!important;color:var(--sc-site-text);border-color:var(--sc-site-border);-webkit-backdrop-filter:blur(16px) saturate(118%);backdrop-filter:blur(16px) saturate(118%)}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] :is(#sidebar_left,.sidebar-left){color:var(--sc-site-text)!important;background:rgba(5,13,20,.82)!important;border-color:var(--sc-site-border)!important;-webkit-backdrop-filter:blur(18px) saturate(116%);backdrop-filter:blur(18px) saturate(116%)}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] #sidebar_left :is(.sidebar-menu,.nano-content){background:transparent!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] .card,
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] .panel,
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] .well,
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] .modal-content{background:var(--sc-site-panel)!important;color:var(--sc-site-text);border-color:var(--sc-site-border);box-shadow:0 18px 46px rgba(0,0,0,.34)}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] :is(.card,.panel,.well,.modal-content){-webkit-backdrop-filter:blur(14px) saturate(112%);backdrop-filter:blur(14px) saturate(112%)}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] :is(.panel .panel,.well .well,.modal-content .panel,.tab-content .panel){background:rgba(8,17,25,.46)!important;box-shadow:none!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] table{background-color:rgba(9,18,27,.66);color:var(--sc-site-text)}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] th{background-color:var(--sc-site-panel-2);color:#f1f5f8}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] td{border-color:var(--sc-site-border)}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] input,
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] select,
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] textarea{background-color:#11161c;color:#f1f5f8;border-color:#56616c}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] a{color:#8fc4e5}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] .alert-danger,
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] .text-danger{color:#ffb1b1}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] .alert-warning,
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] .text-warning{color:#ffd48b}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] .alert-success,
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] .text-success{color:#8ed8af}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] .navbar-brand{display:inline-flex!important;align-items:center!important;gap:8px!important;color:#eef5fb!important;text-decoration:none!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] .navbar-brand>img[data-squarecoil-companion-logo="brand"]{display:block!important;width:100px!important;min-width:100px!important;max-width:100px!important;height:38px!important;flex:0 0 100px!important;object-fit:contain!important;padding:3px 6px!important;border-radius:7px!important;background:#fff!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] .navbar-brand::before,html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] .navbar-brand::after{content:none!important;display:none!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] .navbar :is(.navbar-right,.navbar-nav)>li>a:is(:hover,:focus-visible){color:#fff!important;background:rgba(97,174,247,.14)!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] #pmlt>div:has(>#duplicate){display:flex!important;align-items:center!important;flex-wrap:nowrap!important;gap:6px!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] :focus-visible{outline:3px solid #8fc4e5;outline-offset:2px}

/* Read-only live-probe adapters. Keep these CSS-only and narrowly scoped. */
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] .navbar .dropdown-menu.list-group.dropdown-persist,
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] .navbar .dropdown-menu.list-group.dropdown-persist>li,
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] .navbar .dropdown-menu.list-group.dropdown-persist>.list-group-item,
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] .navbar .dropdown-menu.list-group.dropdown-persist>.dropdown-footer{color:#cbd7e2!important;background:#07101a!important;border-color:#39434d!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] .navbar .dropdown-menu.list-group.dropdown-persist :is(a,button){color:#cbd7e2!important;background:transparent!important;border-color:transparent!important;text-shadow:none!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] .navbar .dropdown-menu.list-group.dropdown-persist :is(a,button):is(:hover,:focus-visible){color:#fff!important;background:rgba(143,196,229,.16)!important}

html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"][${ROOT_ROUTE_ATTRIBUTE}="LEADS"] .admin-form :is(.gui-input,.gui-textarea,select.input-sm),
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"][${ROOT_ROUTE_ATTRIBUTE}="LEADS"] .admin-form .panel :is(input,select,textarea){color:#f1f5f8!important;background:#0b141d!important;border:1px solid #56616c!important;border-radius:8px!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.025)!important;color-scheme:dark!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"][${ROOT_ROUTE_ATTRIBUTE}="LEADS"] .admin-form select option{color:#f1f5f8!important;background:#0b141d!important}

html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"][${ROOT_ROUTE_ATTRIBUTE}="INSTALL_CALENDAR"] .fc .fc-day,
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"][${ROOT_ROUTE_ATTRIBUTE}="INSTALL_CALENDAR"] .fc .fc-widget-content,
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"][${ROOT_ROUTE_ATTRIBUTE}="INSTALL_CALENDAR"] .fc .fc-widget-header{color:#cbd7e2!important;background-color:rgba(7,16,24,.92)!important;border-color:#39434d!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"][${ROOT_ROUTE_ATTRIBUTE}="INSTALL_CALENDAR"] .fc .fc-other-month{color:rgba(203,215,226,.48)!important;background-color:#081018!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"][${ROOT_ROUTE_ATTRIBUTE}="INSTALL_CALENDAR"] .fc .fc-today{background-color:rgba(48,118,177,.28)!important;box-shadow:inset 0 0 0 1px rgba(143,196,229,.24)!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"][${ROOT_ROUTE_ATTRIBUTE}="INSTALL_CALENDAR"] .fc .fc-event{color:#f1f5f8!important;background:#111c26!important;border-width:2px!important;border-style:solid!important;border-radius:7px!important;box-shadow:0 4px 12px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.035)!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"][${ROOT_ROUTE_ATTRIBUTE}="INSTALL_CALENDAR"] .fc .fc-event :is(.fc-content,.fc-title,.event-title){background:transparent!important;text-shadow:none!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"][${ROOT_ROUTE_ATTRIBUTE}="INSTALL_CALENDAR"] .fc .fc-event .cp{height:6px!important;background:rgba(255,255,255,.075)!important;border:1px solid rgba(192,221,244,.20)!important;border-radius:999px!important;box-shadow:inset 0 1px 2px rgba(0,0,0,.32)!important}

/* B5-D vendor adapters remain presentation-only and selector-bounded. */
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"]:not([${ROOT_ROUTE_ATTRIBUTE}="GENERIC"]) :is(.dataTables_wrapper,.dataTables_info,.dataTables_length,.dataTables_filter){color:#cbd7e2!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"]:not([${ROOT_ROUTE_ATTRIBUTE}="GENERIC"]) .dataTables_wrapper .dataTables_paginate .paginate_button{color:#cbd7e2!important;background:#111c26!important;border:1px solid #39434d!important;border-radius:6px!important;box-shadow:none!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"]:not([${ROOT_ROUTE_ATTRIBUTE}="GENERIC"]) .dataTables_wrapper .dataTables_paginate .paginate_button:is(:hover,.current){color:#fff!important;background:rgba(143,196,229,.16)!important;border-color:#6687a1!important}

html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"]:not([${ROOT_ROUTE_ATTRIBUTE}="GENERIC"]) :is(.select2-container--default .select2-selection--single,.select2-container--default .select2-selection--multiple,.select2-dropdown,.select2-search--dropdown){color:#f1f5f8!important;background:#0b141d!important;border-color:#56616c!important;border-radius:8px!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"]:not([${ROOT_ROUTE_ATTRIBUTE}="GENERIC"]) :is(.select2-selection__rendered,.select2-results__option,.select2-search__field){color:#cbd7e2!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"]:not([${ROOT_ROUTE_ATTRIBUTE}="GENERIC"]) .select2-results__option:is(.select2-results__option--highlighted,[aria-selected="true"]){color:#fff!important;background:rgba(143,196,229,.16)!important}

html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"]:not([${ROOT_ROUTE_ATTRIBUTE}="GENERIC"]) :is(.qtip,.qtip-titlebar,.qtip-content,.mfp-content,.fancybox-skin,.fancybox-inner){color:#cbd7e2!important;background:#111c26!important;border-color:#39434d!important;border-radius:10px!important;box-shadow:0 18px 46px rgba(0,0,0,.42)!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"]:not([${ROOT_ROUTE_ATTRIBUTE}="GENERIC"]) :is(.mfp-bg,.fancybox-overlay){background:rgba(2,7,11,.78)!important;backdrop-filter:blur(7px) saturate(108%)!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"]:not([${ROOT_ROUTE_ATTRIBUTE}="GENERIC"]) :is(.mfp-close,.fancybox-close,.fancybox-nav){color:#f1f5f8!important;filter:none!important;opacity:.9!important}

html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"]:not([${ROOT_ROUTE_ATTRIBUTE}="GENERIC"]) .dropzone{color:#cbd7e2!important;background:rgba(5,13,20,.82)!important;border:1px dashed rgba(143,196,229,.46)!important;border-radius:10px!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"]:not([${ROOT_ROUTE_ATTRIBUTE}="GENERIC"]) .dropzone.dz-drag-hover{background:rgba(143,196,229,.16)!important;border-color:#8fc4e5!important}

html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"]:not([${ROOT_ROUTE_ATTRIBUTE}="GENERIC"]) :is(.cke,.cke_inner,.cke_top,.cke_bottom,.cke_contents,.cke_toolbox,.cke_toolgroup,.cke_combo_button){color:#cbd7e2!important;background:#0d1822!important;border-color:#39434d!important;box-shadow:none!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"]:not([${ROOT_ROUTE_ATTRIBUTE}="GENERIC"]) .cke_contents,
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"]:not([${ROOT_ROUTE_ATTRIBUTE}="GENERIC"]) iframe.cke_wysiwyg_frame{color:#f1f5f8!important;background:#0a1118!important;border-color:#39434d!important;color-scheme:dark!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"]:not([${ROOT_ROUTE_ATTRIBUTE}="GENERIC"]) .cke_button_icon{filter:brightness(0) invert(1)!important;opacity:.86!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"]:not([${ROOT_ROUTE_ATTRIBUTE}="GENERIC"]) .cke_button:is(:hover,:focus-visible) .cke_button_icon,
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"]:not([${ROOT_ROUTE_ATTRIBUTE}="GENERIC"]) .cke_button_on .cke_button_icon{opacity:1!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"]:not([${ROOT_ROUTE_ATTRIBUTE}="GENERIC"]) .cke_button_disabled .cke_button_icon{opacity:.28!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"]:not([${ROOT_ROUTE_ATTRIBUTE}="GENERIC"]) :is(.cke_combo_text,.cke_combo_arrow){color:#cbd7e2!important;text-shadow:none!important}

html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"]:is([${ROOT_ROUTE_ATTRIBUTE}="PROJECT_MILESTONES"],[${ROOT_ROUTE_ATTRIBUTE}="SCHEDULE"]) :is(.gantt,.gantt-container,.gantt_grid,.gantt_task,.gantt_grid_scale,.gantt_task_scale,#gantt){color:#cbd7e2!important;background-color:#111c26!important;border-color:#39434d!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"]:is([${ROOT_ROUTE_ATTRIBUTE}="PROJECT_MILESTONES"],[${ROOT_ROUTE_ATTRIBUTE}="SCHEDULE"]) :is(.gantt_grid_head_cell,.gantt_scale_cell,.gantt_row,.gantt_task_row){color:#cbd7e2!important;background-color:#0b141d!important;border-color:#39434d!important}

html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"]:is([${ROOT_ROUTE_ATTRIBUTE}="SHOPPING_LIST"],[${ROOT_ROUTE_ATTRIBUTE}="PROJECT_MILESTONES"],[${ROOT_ROUTE_ATTRIBUTE}="INSTALL_CALENDAR"]) #content{overflow-x:auto!important;scrollbar-color:rgba(143,196,229,.45) rgba(255,255,255,.04)}

@media(max-width:1100px){
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] body.mobile-view.sb-l-m #content_wrapper{left:0!important;margin-left:0!important;width:100%!important;max-width:100%!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] body.mobile-view.sb-l-m :is(#topbar,#content){left:0!important;width:100%!important;max-width:100%!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] #content :is(.panel-body,.tab-content,.table-responsive){max-width:100%!important;overflow-x:auto!important}
}
@media(max-width:767px){
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] #content{padding:14px 10px 38px!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] #topbar{padding:9px 12px!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] :is(.panel,.well,.modal-content,.qtip,.mfp-content,.fancybox-skin){border-radius:10px!important}
}
@media(prefers-reduced-motion:reduce){
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] :is(.qtip,.mfp-content,.mfp-bg,.fancybox-skin,.fancybox-overlay,.dropzone,.cke,.select2-dropdown){animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important}
}
@media print{
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"],html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] body,html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] :is(#main,#content_wrapper,#content,.panel,.well,table,.table,th,td,.dataTables_wrapper,.gantt,.gantt-container){color:#111!important;background:#fff!important;border-color:#bbb!important;box-shadow:none!important;backdrop-filter:none!important;text-shadow:none!important}
html[${ROOT_THEME_ATTRIBUTE}="SLEEK_DARK"] :is(#ussign-job-timer,#squarecoil-companion-cinematic-host,#squarecoil-companion-cinematic-style,.mfp-bg,.fancybox-overlay){display:none!important}
}
`;

function classifyWebsiteRoute(location) {
  const pathname = String(location?.pathname || '').toLowerCase();
  return ROUTE_BY_PATH[pathname] || 'GENERIC';
}

function mediaListener(media, listener, enabled) {
  if (!media) return;
  const method = enabled ? 'addEventListener' : 'removeEventListener';
  if (typeof media[method] === 'function') media[method]('change', listener);
  else {
    const legacy = enabled ? 'addListener' : 'removeListener';
    if (typeof media[legacy] === 'function') media[legacy](listener);
  }
}

function createThemeService(options = {}) {
  const document = options.document;
  const window = options.window;
  if (!document || !window) throw new Error('theme-service-environment-required');
  const onChange = typeof options.onChange === 'function' ? options.onChange : () => {};
  const darkMedia = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const forcedMedia = typeof window.matchMedia === 'function' ? window.matchMedia('(forced-colors: active)') : null;
  const reducedTransparencyMedia = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-transparency: reduce)') : null;
  const nativeLogoState = new WeakMap();
  let disposed = false;
  let preferenceSnapshot = normalizePreferenceSnapshot({});
  let effective = null;
  let autoListening = false;
  let forcedListening = false;
  let reducedTransparencyListening = false;
  const editorFrameListeners = new Map();
  const editorScanTimers = new Set();

  function editorFrames() {
    return Array.from(document.querySelectorAll?.('iframe.cke_wysiwyg_frame') || []);
  }

  function editorThemeActive() {
    return ['SLEEK_DARK', 'LIGHT_GLASS', 'REFINED_LIGHT'].includes(
      document.documentElement?.getAttribute?.(ROOT_THEME_ATTRIBUTE)
    ) && document.documentElement?.getAttribute?.(ROOT_ROUTE_ATTRIBUTE) !== 'GENERIC';
  }

  function removeEditorDocumentStyle(frame) {
    try { frame?.contentDocument?.getElementById?.(EDITOR_STYLE_ID)?.remove?.(); } catch (_) {}
    frame?.removeAttribute?.(EDITOR_FRAME_ATTRIBUTE);
  }

  function applyEditorDocumentTheme(frame) {
    if (!frame || disposed || !editorThemeActive()) return false;
    if (!editorFrameListeners.has(frame) && typeof frame.addEventListener === 'function') {
      const onLoad = () => applyEditorDocumentTheme(frame);
      frame.addEventListener('load', onLoad);
      editorFrameListeners.set(frame, onLoad);
    }
    try {
      const editorDocument = frame.contentDocument;
      if (!editorDocument?.documentElement || !editorDocument?.body) return false;
      let style = editorDocument.getElementById?.(EDITOR_STYLE_ID) || null;
      if (!style) {
        style = editorDocument.createElement?.('style');
        if (!style) return false;
        style.id = EDITOR_STYLE_ID;
        style.setAttribute?.('data-squarecoil-companion-owned', 'ckeditor-document-theme');
        (editorDocument.head || editorDocument.documentElement).appendChild?.(style);
      }
      const activeTheme = document.documentElement?.getAttribute?.(ROOT_THEME_ATTRIBUTE);
      style.textContent = activeTheme === 'SLEEK_DARK' ? DARK_EDITOR_DOCUMENT_CSS : LIGHT_EDITOR_DOCUMENT_CSS;
      style.setAttribute?.('data-squarecoil-companion-editor-theme', activeTheme);
      frame.setAttribute?.(EDITOR_FRAME_ATTRIBUTE, activeTheme === 'SLEEK_DARK' ? 'dark' :
        activeTheme === 'LIGHT_GLASS' ? 'light-glass' : 'refined-light');
      return true;
    } catch (_) {
      return false;
    }
  }

  function scanEditorFrames() {
    if (disposed || !editorThemeActive()) return 0;
    let themed = 0;
    for (const frame of editorFrames()) if (applyEditorDocumentTheme(frame)) themed += 1;
    return themed;
  }

  function clearEditorScans() {
    if (typeof window.clearTimeout === 'function') {
      for (const timer of editorScanTimers) window.clearTimeout(timer);
    }
    editorScanTimers.clear();
  }

  function scheduleEditorScans() {
    clearEditorScans();
    if (typeof window.setTimeout !== 'function') {
      scanEditorFrames();
      return;
    }
    for (const delay of [0, 350, 1000, 2400]) {
      let timer = null;
      timer = window.setTimeout(() => {
        editorScanTimers.delete(timer);
        scanEditorFrames();
      }, delay);
      editorScanTimers.add(timer);
    }
  }

  function removeOwnedEditorTheme() {
    clearEditorScans();
    const frames = new Set([...editorFrameListeners.keys(), ...editorFrames()]);
    for (const frame of frames) {
      removeEditorDocumentStyle(frame);
      const listener = editorFrameListeners.get(frame);
      if (listener) frame.removeEventListener?.('load', listener);
    }
    editorFrameListeners.clear();
  }

  function findLogo() {
    return document.querySelector?.('header.navbar .navbar-brand img, .navbar-branding .navbar-brand img, img[src*="US-Sign" i], img[src*="USSIGN" i]') || null;
  }

  function restoreLogo() {
    const logo = findLogo();
    if (!logo) return 'native-logo-not-found';
    const original = nativeLogoState.get(logo);
    if (original) {
      if (original.src === null) logo.removeAttribute?.('src'); else logo.setAttribute?.('src', original.src);
      if (original.srcset === null) logo.removeAttribute?.('srcset'); else logo.setAttribute?.('srcset', original.srcset);
      nativeLogoState.delete(logo);
    }
    logo.removeAttribute?.('data-squarecoil-companion-logo');
    return 'native-logo';
  }

  function applyLogo(websiteTheme) {
    if (websiteTheme === 'ORIGINAL') return restoreLogo();
    const logo = findLogo();
    if (!logo) return 'website-logo-not-found';
    if (!nativeLogoState.has(logo)) nativeLogoState.set(logo, {
      src: logo.getAttribute?.('src') ?? null,
      srcset: logo.getAttribute?.('srcset') ?? null
    });
    logo.setAttribute?.('src', WEBSITE_LOGO_SOURCE);
    logo.removeAttribute?.('srcset');
    logo.setAttribute?.('data-squarecoil-companion-logo', 'brand');
    return 'configured-website-logo';
  }

  function presentationBootstrap() {
    return options.presentationBootstrap || globalThis[PRESENTATION_BOOTSTRAP_KEY] || null;
  }

  function removeOwnedTheme(options = {}) {
    removeOwnedEditorTheme();
    const bootstrap = presentationBootstrap();
    const bootstrapState = bootstrap?.snapshot?.() || null;
    if (options.includeBootstrap === false && ['SLEEK_DARK', 'LIGHT_GLASS'].includes(bootstrapState?.activeTheme)) {
      return;
    }
    if (options.includeBootstrap !== false) {
      try { bootstrap?.removeTheme?.(options.reason || 'theme-service-remove'); } catch (_) {}
    }
    const styles = Array.from(document.querySelectorAll?.(`#${STYLE_ID}`) || []);
    for (const style of styles) style.remove?.();
    document.documentElement?.removeAttribute?.(ROOT_THEME_ATTRIBUTE);
    document.documentElement?.removeAttribute?.(ROOT_ROUTE_ATTRIBUTE);
  }

  function applyOwnedTheme(websiteTheme) {
    const bootstrap = presentationBootstrap();
    if (websiteTheme === 'ORIGINAL') {
      removeOwnedTheme({ reason: 'theme-original' });
      return { layerCount: 0, status: 'native' };
    }
    if (['SLEEK_DARK', 'LIGHT_GLASS'].includes(websiteTheme) && bootstrap?.reconcile) {
      const current = bootstrap.snapshot?.() || {};
      if (current.activeTheme !== websiteTheme || current.stylePresent !== true) {
        void Promise.resolve(bootstrap.reconcile(websiteTheme, 'theme-service')).then(() => scheduleEditorScans(), () => {});
      } else {
        bootstrap.syncRoute?.();
      }
      scheduleEditorScans();
      return {
        layerCount: current.activeTheme === websiteTheme && current.stylePresent === true ? 1 : 0,
        status: current.activeTheme === websiteTheme && current.stylePresent === true ? 'applied-authoritative' : 'loading-authoritative'
      };
    }
    removeOwnedTheme({ reason: 'theme-local-fallback' });
    const style = document.createElement?.('style');
    if (!style) return { layerCount: 0, status: 'style-element-unavailable' };
    style.id = STYLE_ID;
    style.setAttribute('data-squarecoil-companion-owned', 'website-theme');
    style.textContent = websiteTheme === 'SLEEK_DARK' ? SLEEK_DARK_CSS :
      websiteTheme === 'LIGHT_GLASS' ? LIGHT_GLASS_CSS : REFINED_LIGHT_CSS;
    (document.head || document.documentElement)?.appendChild?.(style);
    document.documentElement?.setAttribute?.(ROOT_THEME_ATTRIBUTE, websiteTheme);
    document.documentElement?.setAttribute?.(ROOT_ROUTE_ATTRIBUTE, classifyWebsiteRoute(window.location));
    scheduleEditorScans();
    const duplicateLayers = Array.from(document.querySelectorAll?.(`#${STYLE_ID}`) || []);
    for (const duplicate of duplicateLayers.slice(1)) duplicate.remove?.();
    return { layerCount: Math.min(1, duplicateLayers.length || 1), status: 'applied-local-fallback' };
  }

  function glassSupported() {
    if (forcedMedia?.matches || reducedTransparencyMedia?.matches) return false;
    const css = window.CSS || globalThis.CSS;
    return Boolean(css && typeof css.supports === 'function' &&
      (css.supports('backdrop-filter', 'blur(2px)') || css.supports('-webkit-backdrop-filter', 'blur(2px)')));
  }

  function resolve() {
    const forced = forcedMedia?.matches === true;
    const timerAppearanceEffective = preferenceSnapshot.timerAppearance === 'AUTO'
      ? darkMedia?.matches === true ? 'DARK' : 'LIGHT'
      : preferenceSnapshot.timerAppearance;
    const panelFinishEffective = (preferenceSnapshot.panelFinish === 'GLASS' || preferenceSnapshot.timerAppearance === 'CLEAR') && !glassSupported()
      ? 'SOLID_FALLBACK' : preferenceSnapshot.timerAppearance === 'CLEAR' ? 'GLASS' : preferenceSnapshot.panelFinish;
    const websiteThemeEffective = forced ? 'ORIGINAL' : preferenceSnapshot.websiteTheme;
    const themeResult = applyOwnedTheme(websiteThemeEffective);
    const logoStatus = applyLogo(websiteThemeEffective);
    return Object.freeze({
      preferenceRevision: preferenceSnapshot.preferenceRevision,
      timerAppearancePreference: preferenceSnapshot.timerAppearance,
      timerAppearanceEffective,
      panelFinishPreference: preferenceSnapshot.panelFinish,
      panelFinishEffective,
      websiteThemePreference: preferenceSnapshot.websiteTheme,
      websiteThemeEffective,
      autoSignalAvailable: Boolean(darkMedia),
      forcedColors: forced,
      reducedTransparency: reducedTransparencyMedia?.matches === true,
      ownedThemeLayerCount: themeResult.layerCount,
      websiteThemeStatus: themeResult.status,
      logoStatus
    });
  }

  function publishIfChanged(next) {
    const changed = JSON.stringify(next) !== JSON.stringify(effective);
    effective = next;
    if (changed) {
      try { onChange(next); } catch (_) {}
    }
    return effective;
  }

  function onMediaChange() {
    if (disposed) return;
    publishIfChanged(resolve());
  }

  function onDocumentReady() {
    if (disposed) return;
    publishIfChanged(resolve());
  }

  function syncListeners() {
    const shouldAutoListen = preferenceSnapshot.timerAppearance === 'AUTO' && Boolean(darkMedia);
    if (shouldAutoListen !== autoListening) {
      mediaListener(darkMedia, onMediaChange, shouldAutoListen);
      autoListening = shouldAutoListen;
    }
    if (!forcedListening && forcedMedia) {
      mediaListener(forcedMedia, onMediaChange, true);
      forcedListening = true;
    }
    const shouldReducedTransparencyListen = (preferenceSnapshot.panelFinish === 'GLASS' || preferenceSnapshot.timerAppearance === 'CLEAR') && Boolean(reducedTransparencyMedia);
    if (shouldReducedTransparencyListen !== reducedTransparencyListening) {
      mediaListener(reducedTransparencyMedia, onMediaChange, shouldReducedTransparencyListen);
      reducedTransparencyListening = shouldReducedTransparencyListen;
    }
  }

  function apply(preferences) {
    if (disposed) throw new Error('theme-service-disposed');
    const nextPreferences = normalizePreferenceSnapshot(preferences);
    if (effective && JSON.stringify(nextPreferences) === JSON.stringify(preferenceSnapshot)) return effective;
    preferenceSnapshot = nextPreferences;
    syncListeners();
    return publishIfChanged(resolve());
  }

  function snapshot() {
    return effective || apply(preferenceSnapshot);
  }

  function teardown() {
    if (disposed) return;
    disposed = true;
    if (autoListening) mediaListener(darkMedia, onMediaChange, false);
    if (forcedListening) mediaListener(forcedMedia, onMediaChange, false);
    if (reducedTransparencyListening) mediaListener(reducedTransparencyMedia, onMediaChange, false);
    autoListening = false;
    forcedListening = false;
    reducedTransparencyListening = false;
    document.removeEventListener?.('DOMContentLoaded', onDocumentReady);
    window.removeEventListener?.('pageshow', onDocumentReady);
    removeOwnedTheme({ includeBootstrap: false, reason: 'theme-service-teardown' });
    restoreLogo();
  }

  document.addEventListener?.('DOMContentLoaded', onDocumentReady);
  window.addEventListener?.('pageshow', onDocumentReady);

  return Object.freeze({ apply, snapshot, teardown });
}

module.exports = { STYLE_ID, ROOT_THEME_ATTRIBUTE, ROOT_ROUTE_ATTRIBUTE, EDITOR_STYLE_ID, EDITOR_FRAME_ATTRIBUTE,
  ROUTE_BY_PATH, classifyWebsiteRoute, createThemeService };
