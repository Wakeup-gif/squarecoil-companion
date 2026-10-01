'use strict';

// Presentation only. All values and actions remain owned by the workspace
// renderer's canonical read model and trusted command paths.
function prototypeDockStyle(rootId) {
  return `
#${rootId}.sc-proto-root{width:min(680px,calc(100vw - 32px))!important;padding-top:48px!important;--sc-shadow:0 26px 42px rgba(0,0,0,.32);--sc-dock-accent:#82b7ef;--sc-dock-control:color-mix(in srgb,var(--sc-panel-2) 76%,transparent)}
#${rootId}.sc-proto-root[data-panel-hidden="true"]{display:none!important}
#${rootId}.sc-proto-root[data-has-tabs="false"]{padding-top:0!important}
#${rootId}.sc-proto-root[data-proto-theme="dark"]{--sc-bg:#111b2b;--sc-panel:#1b2a3c;--sc-panel-2:#243549;--sc-text:#f4f7fb;--sc-muted:#c1cddd;--sc-border:rgba(231,239,250,.14);--sc-accent:#80bbfa;--sc-accent-soft:#244b6c;--sc-dock-accent:#c1d8f4}
#${rootId}.sc-proto-root[data-proto-surface="glass"]{--sc-shadow:0 26px 48px rgba(0,0,0,.42)}
#${rootId}.sc-proto-root[data-proto-surface="glass"][data-proto-theme="dark"]{--sc-bg:rgba(7,14,25,.54);--sc-panel:rgba(22,35,52,.40);--sc-panel-2:rgba(41,58,78,.46);--sc-border:rgba(255,255,255,.13)}
#${rootId}.sc-proto-root[data-proto-surface="glass"][data-proto-theme="light"]{--sc-bg:rgba(241,247,252,.72);--sc-panel:rgba(255,255,255,.56);--sc-panel-2:rgba(224,236,246,.65);--sc-border:rgba(49,77,101,.18)}
#${rootId} .sc-proto-shell{border:1px solid var(--sc-border)!important;border-radius:18px!important;background:var(--sc-bg)!important;box-shadow:var(--sc-shadow)!important;isolation:isolate}
#${rootId}[data-has-tabs="true"] .sc-proto-shell{border-top-left-radius:18px!important}
#${rootId}[data-proto-surface="glass"] .sc-proto-shell{background:var(--sc-bg)!important;backdrop-filter:blur(36px) saturate(145%)!important;-webkit-backdrop-filter:blur(36px) saturate(145%)!important}
#${rootId} .sc-proto-topbar{min-height:64px;gap:12px;padding:8px 13px!important;background:color-mix(in srgb,var(--sc-panel) 52%,transparent)!important;border-bottom:1px solid color-mix(in srgb,var(--sc-border) 70%,transparent)!important}
#${rootId} .sc-proto-timer-icon{display:grid;place-items:center;width:32px;height:32px;flex:0 0 32px;border-radius:11px;background:color-mix(in srgb,var(--sc-accent) 15%,transparent);color:var(--sc-dock-accent);font-size:22px;line-height:1}
#${rootId} .sc-proto-brand{display:flex;flex-direction:column;justify-content:center;min-width:0}
#${rootId} .sc-proto-brand strong{font-size:10px!important;font-weight:700!important;line-height:1.1;opacity:.72;letter-spacing:.035em!important}
#${rootId} .sc-summary-title{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:17px;font-weight:760;line-height:1.3}
#${rootId} .sc-summary-title small{font-size:12px;font-weight:650;opacity:.75}
#${rootId} .sc-summary-time{flex:0 0 auto;font-size:19px;font-weight:760;font-variant-numeric:tabular-nums;letter-spacing:-.035em;white-space:nowrap}
#${rootId} .sc-proto-status{font-size:10px}
#${rootId} .sc-proto-topbar .sc-icon-btn{width:34px;height:34px;flex:0 0 34px;border:1px solid var(--sc-border)!important;border-radius:10px!important;background:var(--sc-dock-control)!important;font-size:17px}
#${rootId} .sc-proto-topbar .sc-icon-btn:hover{background:color-mix(in srgb,var(--sc-dock-control) 65%,var(--sc-accent) 35%)!important}
#${rootId} .sc-tabs{height:48px;left:44px;right:44px;gap:3px;padding-top:6px}
#${rootId} .sc-tab-slot{flex:0 0 168px;max-width:168px;height:42px}
#${rootId} button.sc-tab,#${rootId} button.sc-tab[data-selected="true"]{height:42px;grid-template-columns:7px minmax(0,1fr);grid-template-rows:1fr 1fr;align-items:center;gap:0 7px;padding:5px 51px 5px 10px;border:1px solid var(--sc-border)!important;border-bottom-color:transparent!important;border-radius:14px 14px 0 0!important;background:color-mix(in srgb,var(--sc-panel) 46%,transparent)!important;color:var(--sc-text)!important;box-shadow:inset 0 1px rgba(255,255,255,.10),inset 0 3px var(--sc-tab-threshold)!important;backdrop-filter:blur(16px) saturate(145%);-webkit-backdrop-filter:blur(16px) saturate(145%)}
#${rootId} button.sc-tab[data-selected="true"]{background:color-mix(in srgb,var(--sc-panel) 85%,transparent)!important;transform:translateY(-2px);box-shadow:inset 0 2px rgba(255,255,255,.16),inset 0 3px var(--sc-tab-threshold),0 -6px 18px rgba(0,0,0,.14)!important}
#${rootId} .sc-tab[data-operational="true"] .sc-dot{background:var(--sc-positive);box-shadow:0 0 0 3px color-mix(in srgb,var(--sc-positive) 20%,transparent)}
#${rootId} .sc-tab-label{font-size:12px;font-weight:760;align-self:end}
#${rootId} .sc-tab-time{font-size:11px;font-weight:740;font-variant-numeric:tabular-nums;align-self:start;opacity:.85}
#${rootId} .sc-tab-slot[data-selected="true"]::after{background:var(--sc-panel)}
#${rootId} button.sc-tab-open,#${rootId} button.sc-tab-x{position:absolute;z-index:6;top:9px;width:22px;height:22px;padding:0;border-radius:50%!important;font-size:13px;line-height:1;background:color-mix(in srgb,var(--sc-bg) 74%,transparent)!important;color:var(--sc-text)!important}
#${rootId} button.sc-tab-open{right:28px;opacity:0;transition:opacity .16s ease}
#${rootId} button.sc-tab-x{right:4px;top:9px}
#${rootId} .sc-tab-slot:hover .sc-tab-open,#${rootId} .sc-tab-slot:focus-within .sc-tab-open,#${rootId} .sc-tab-slot[data-selected="true"] .sc-tab-open{opacity:1}
#${rootId} .sc-content{max-height:min(610px,calc(100vh - 190px))}
#${rootId} .sc-view{padding:18px 20px 20px}
#${rootId} .sc-current-strip{padding:10px 13px;margin-bottom:12px;border:1px solid var(--sc-border);border-radius:12px;background:color-mix(in srgb,var(--sc-panel) 38%,transparent)}
#${rootId} .sc-current-strip .sc-eyebrow{color:var(--sc-dock-accent)!important}
#${rootId} .sc-current-strip .sc-row-title{font-size:13px}
#${rootId} .sc-timer-card{position:relative;min-height:160px;padding:18px 20px;border:1px solid var(--sc-border);border-radius:15px;background:color-mix(in srgb,var(--sc-panel) 58%,transparent)}
#${rootId} .sc-timer-card .sc-eyebrow{letter-spacing:.1em}
#${rootId} .sc-timer-card .sc-title{max-width:calc(100% - 120px);font-size:21px;font-weight:760;letter-spacing:-.02em;line-height:1.2}
#${rootId} .sc-timer-card .sc-status{position:absolute;right:18px;top:17px;margin:0;padding:4px 9px;font-size:10px;text-transform:uppercase;letter-spacing:.05em}
#${rootId} .sc-metrics{grid-template-columns:minmax(0,1.4fr) minmax(110px,.65fr);margin-top:14px;gap:14px}
#${rootId} .sc-metric{padding:0;background:transparent}
#${rootId} .sc-metric:first-child strong{font-size:31px;letter-spacing:-.055em;font-variant-numeric:tabular-nums;line-height:1.05}
#${rootId} .sc-metric:not(:first-child) strong{font-size:18px;font-variant-numeric:tabular-nums}
#${rootId} .sc-session{justify-content:flex-start;gap:8px;margin-top:8px}
#${rootId} .sc-actions{align-items:center;margin-top:13px}
#${rootId} .sc-actions button{min-height:34px;padding:7px 11px;border-radius:9px}
#${rootId} .sc-quick-links{margin-top:12px;color:var(--sc-muted);font-size:11px}
#${rootId} .sc-quick-links summary{cursor:pointer;padding:5px 0;list-style:none}
#${rootId} .sc-quick-links summary::before{content:'⌄';display:inline-block;width:18px;color:var(--sc-accent)}
#${rootId} .sc-quick-links[open] summary::before{transform:rotate(180deg)}
#${rootId} .sc-home-intro{margin:0 0 14px;color:var(--sc-muted);font-size:12px}
#${rootId} .sc-home-section{margin:12px 2px 7px;color:var(--sc-muted);font-size:10px;text-transform:uppercase;letter-spacing:.09em;font-weight:760}
#${rootId} .sc-home-current{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:13px 15px;border:1px solid var(--sc-border);border-radius:13px;background:color-mix(in srgb,var(--sc-panel) 52%,transparent)}
#${rootId} .sc-home-current-copy{min-width:0}
#${rootId} .sc-home-current-copy strong{display:block;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#${rootId} .sc-home-current-copy small{display:block;margin-top:2px;font-size:10px}
#${rootId} .sc-home-current-time{font-size:18px;font-weight:750;font-variant-numeric:tabular-nums;white-space:nowrap}
#${rootId} .sc-nav-grid{gap:7px}
#${rootId} .sc-nav-grid button{min-height:58px;padding:10px 12px;border:1px solid var(--sc-border)!important;border-radius:12px;background:color-mix(in srgb,var(--sc-panel) 44%,transparent)!important}
#${rootId} .sc-nav-grid button:hover{background:color-mix(in srgb,var(--sc-panel) 65%,var(--sc-accent) 12%)!important}
#${rootId} .sc-nav-grid strong{font-size:12px}
#${rootId} .sc-view-head{margin-bottom:13px}
#${rootId} .sc-view-head strong{font-size:16px}
#${rootId} .sc-settings-intro{font-size:11px;margin-bottom:14px}
#${rootId} .sc-settings-list{grid-template-columns:1fr 1fr;gap:8px}
#${rootId} .sc-settings-group{background:color-mix(in srgb,var(--sc-panel) 45%,transparent);border:1px solid var(--sc-border);border-radius:12px}
#${rootId} .sc-settings-group-toggle{min-height:62px;padding:10px 12px!important}
#${rootId} .sc-settings-group-toggle strong{font-size:12px}
#${rootId} .sc-settings-group-panel{padding:0 10px 10px}
#${rootId} .sc-settings-group-panel .sc-nav-grid{grid-template-columns:1fr}
#${rootId} .sc-settings-group-panel .sc-nav-grid button{min-height:47px}
#${rootId} .sc-foot{padding:6px 15px!important;background:color-mix(in srgb,var(--sc-panel) 34%,transparent)!important}
#${rootId} .sc-archive-veil{padding-right:calc(min(680px,100vw - 32px) + 40px)}
#${rootId}[data-proto-collapsed="true"]{width:min(420px,calc(100vw - 32px))!important}
#${rootId}[data-proto-collapsed="true"] .sc-proto-topbar{min-height:55px}
#${rootId}[data-proto-collapsed="true"] .sc-proto-status,#${rootId}[data-proto-collapsed="true"] .sc-summary-title small{display:none}
@media(max-width:760px){#${rootId} .sc-archive-veil{padding:20px}}
@media(max-width:700px){#${rootId}.sc-proto-root{right:8px!important;bottom:8px!important;width:calc(100vw - 16px)!important}#${rootId} .sc-tabs{left:8px;right:8px}#${rootId} .sc-tab-slot{flex-basis:136px;max-width:136px}#${rootId} .sc-summary-time{font-size:16px}#${rootId} .sc-proto-topbar{gap:6px}#${rootId} .sc-view{padding:14px}#${rootId} .sc-settings-list{grid-template-columns:1fr}}
@media(max-width:440px){#${rootId} .sc-proto-status{display:none}#${rootId} .sc-proto-timer-icon{display:none}#${rootId} .sc-summary-title{font-size:14px}#${rootId} .sc-summary-time{font-size:14px}#${rootId} .sc-proto-topbar .sc-icon-btn{width:29px;height:29px;flex-basis:29px}#${rootId} .sc-timer-card .sc-title{max-width:none;font-size:17px;padding-right:0}#${rootId} .sc-timer-card .sc-status{position:static;margin-top:7px}#${rootId} .sc-metric:first-child strong{font-size:26px}#${rootId} .sc-nav-grid{grid-template-columns:1fr}}
@media(prefers-reduced-motion:reduce){#${rootId} *,#${rootId} *::before,#${rootId} *::after{scroll-behavior:auto!important;animation-duration:.01ms!important;transition-duration:.01ms!important}}
@media(forced-colors:active){#${rootId} .sc-proto-shell,#${rootId} .sc-timer-card,#${rootId} .sc-current-strip,#${rootId} .sc-home-current,#${rootId} .sc-settings-group{background:Canvas!important;color:CanvasText!important;border:1px solid CanvasText!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}}
`;
}

module.exports = { prototypeDockStyle };
