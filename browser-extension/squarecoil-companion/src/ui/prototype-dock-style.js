'use strict';

// Presentation only. All values and actions remain owned by the workspace
// renderer's canonical read model and trusted command paths.
function prototypeDockStyle(rootId) {
  return `
#${rootId}.sc-proto-root{interpolate-size:allow-keywords}
#${rootId}.sc-proto-root{transition:width 420ms cubic-bezier(.22,1,.36,1)}
#${rootId} .sc-ui-icon{display:block!important;width:20px!important;height:20px!important;min-width:20px!important;max-width:none!important;flex:0 0 20px!important;aspect-ratio:1!important;fill:none!important;stroke:currentColor!important;overflow:visible}
#${rootId} .sc-proto-topbar .sc-ui-icon{width:18px!important;height:18px!important;min-width:18px!important;flex-basis:18px!important}
#${rootId} .sc-view{animation:sc-view-reveal 220ms cubic-bezier(.2,.8,.2,1) both}
#${rootId} .sc-settings-group-panel:not([hidden]){animation:sc-panel-slide 280ms cubic-bezier(.22,1,.36,1) both}
#${rootId} .sc-content{display:block!important;height:auto;transition:height 420ms cubic-bezier(.22,1,.36,1),opacity 180ms ease,visibility 0s;opacity:1;visibility:visible}
#${rootId}[data-proto-collapsed="true"] .sc-content{height:0!important;opacity:0;overflow:hidden;visibility:hidden;transition-delay:0s,0s,240ms}
#${rootId} .sc-settings-list .sc-settings-group{animation:sc-view-reveal 200ms ease-out both}
#${rootId} .sc-settings-list .sc-settings-group:nth-child(2){animation-delay:20ms}
#${rootId} .sc-settings-list .sc-settings-group:nth-child(3){animation-delay:40ms}
#${rootId} .sc-settings-list .sc-settings-group:nth-child(n+4){animation-delay:60ms}
#${rootId} .sc-loading-heading{display:flex;align-items:center;gap:12px;margin:2px 0 18px}
#${rootId} .sc-loading-heading strong{display:block;font-size:14px;font-weight:650}
#${rootId} .sc-loading-heading small{display:block;margin-top:4px;font-size:11px;color:var(--sc-muted)}
#${rootId} .sc-loading-spinner{width:20px;height:20px;flex:0 0 20px;border:2px solid var(--sc-border);border-top-color:var(--sc-accent);border-radius:50%;animation:sc-loading-spin 900ms linear infinite}
#${rootId} .sc-loading-card{padding:20px;border:1px solid var(--sc-border);border-radius:15px;background:color-mix(in srgb,var(--sc-panel) 58%,transparent)}
#${rootId} .sc-skeleton{position:relative;display:block;height:16px;border-radius:6px;background:var(--sc-panel-2);overflow:hidden}
#${rootId} .sc-skeleton::after{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 20%,color-mix(in srgb,var(--sc-text) 12%,transparent) 50%,transparent 80%);transform:translateX(-100%);animation:sc-loading-wave 1400ms ease-in-out infinite}
#${rootId} .sc-skeleton-label{width:38%;height:12px}
#${rootId} .sc-skeleton-time{width:58%;height:35px;margin-top:15px}
#${rootId} .sc-loading-columns{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:20px}
@keyframes sc-view-reveal{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
@keyframes sc-panel-slide{from{opacity:0;transform:translateY(-9px);filter:blur(2px)}to{opacity:1;transform:translateY(0);filter:blur(0)}}
@keyframes sc-loading-spin{to{transform:rotate(360deg)}}
@keyframes sc-loading-wave{to{transform:translateX(100%)}}
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
#${rootId} .sc-proto-topbar{box-sizing:border-box;align-items:center}
#${rootId} .sc-proto-topbar button{box-sizing:border-box;line-height:1!important}
#${rootId} .sc-summary-title small{margin-left:4px}
#${rootId} .sc-proto-timer-icon{display:grid;place-items:center;width:32px;height:32px;flex:0 0 32px;border-radius:11px;background:color-mix(in srgb,var(--sc-accent) 15%,transparent);color:var(--sc-dock-accent);font-size:22px;line-height:1}
#${rootId} .sc-proto-brand{display:flex;flex-direction:column;justify-content:center;min-width:0}
#${rootId} .sc-proto-brand strong{font-size:10px!important;font-weight:700!important;line-height:1.1;opacity:.72;letter-spacing:.035em!important}
#${rootId} .sc-summary-title{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:17px;font-weight:760;line-height:1.3}
#${rootId} .sc-summary-title small{font-size:12px;font-weight:650;opacity:.75}
#${rootId} .sc-summary-time{flex:0 0 auto;font-size:19px;font-weight:760;font-variant-numeric:tabular-nums;letter-spacing:-.035em;white-space:nowrap}
#${rootId} .sc-proto-status{font-size:10px}
#${rootId} .sc-proto-topbar .sc-icon-btn{width:34px;height:34px;flex:0 0 34px;border:1px solid var(--sc-border)!important;border-radius:10px!important;background:var(--sc-dock-control)!important;font-size:17px}
#${rootId} .sc-proto-topbar .sc-icon-btn:hover{background:color-mix(in srgb,var(--sc-dock-control) 65%,var(--sc-accent) 35%)!important}
#${rootId} .sc-tabs{height:48px;left:44px;right:44px;gap:3px;padding-top:6px;scroll-snap-type:none}
#${rootId} .sc-tabs{scroll-behavior:smooth;mask-image:linear-gradient(to right,#000 0,#000 100%);-webkit-mask-image:linear-gradient(to right,#000 0,#000 100%)}
#${rootId} .sc-tabs.has-right-overflow:not(.has-left-overflow){mask-image:linear-gradient(to right,#000 0,#000 calc(100% - 28px),transparent 100%);-webkit-mask-image:linear-gradient(to right,#000 0,#000 calc(100% - 28px),transparent 100%)}
#${rootId} .sc-tabs.has-left-overflow:not(.has-right-overflow){mask-image:linear-gradient(to right,transparent 0,#000 28px,#000 100%);-webkit-mask-image:linear-gradient(to right,transparent 0,#000 28px,#000 100%)}
#${rootId} .sc-tabs.has-left-overflow.has-right-overflow{mask-image:linear-gradient(to right,transparent 0,#000 28px,#000 calc(100% - 28px),transparent 100%);-webkit-mask-image:linear-gradient(to right,transparent 0,#000 28px,#000 calc(100% - 28px),transparent 100%)}
#${rootId} .sc-tabs.is-hover-scrolling{scroll-behavior:auto;scroll-snap-type:none}
#${rootId} .sc-tab-cycle{position:absolute;z-index:6;top:3px;display:grid;place-items:center;width:40px;height:42px;padding:0;border:1px solid var(--sc-border)!important;border-radius:11px!important;background:color-mix(in srgb,var(--sc-panel) 84%,transparent)!important;color:var(--sc-text)!important;box-shadow:0 5px 14px rgba(0,0,0,.12)!important;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);opacity:.88;cursor:pointer;transition:opacity 170ms ease,transform 170ms ease,background-color 170ms ease}
#${rootId} .sc-tab-cycle[hidden],#${rootId}[data-proto-menu="true"] .sc-tab-cycle{display:none!important}
#${rootId} .sc-tab-cycle-prev{left:1px}
#${rootId} .sc-tab-cycle-next{right:1px}
#${rootId} .sc-tab-cycle[data-at-end="true"]{opacity:.46}
#${rootId} .sc-tab-cycle:hover,#${rootId} .sc-tab-cycle:focus-visible{opacity:1;transform:translateY(-1px)}
#${rootId} .sc-tab-cycle:focus-visible{outline:2px solid var(--sc-accent);outline-offset:2px}
#${rootId} .sc-tab-cycle .sc-ui-icon{width:17px!important;height:17px!important;min-width:17px!important;flex-basis:17px!important}
@media(hover:none){#${rootId} .sc-tab-cycle:not([hidden]){opacity:1}}
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
#${rootId} button.sc-tab-open,#${rootId} button.sc-tab-x{display:grid;place-items:center}
#${rootId} .sc-tab-open .sc-ui-icon,#${rootId} .sc-tab-x .sc-ui-icon{width:13px!important;height:13px!important;min-width:13px!important;flex-basis:13px!important}
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
#${rootId} .sc-metric:first-child>strong{font-size:31px;letter-spacing:-.055em;font-variant-numeric:tabular-nums;line-height:1.05}
#${rootId} .sc-metric:not(:first-child) strong{font-size:18px;font-variant-numeric:tabular-nums}
#${rootId} .sc-session{justify-content:flex-start;gap:8px;margin-top:8px}
#${rootId} .sc-actions{align-items:center;margin-top:13px}
#${rootId} .sc-actions button{min-height:34px;padding:7px 11px;border-radius:9px}
#${rootId} .sc-quick-links{margin-top:12px;color:var(--sc-muted);font-size:11px}
#${rootId} .sc-quick-links summary{cursor:pointer;padding:5px 0;list-style:none}
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
#${rootId} .sc-settings-chevron{display:block!important;flex-shrink:0!important;width:18px!important;height:18px!important;max-width:none!important;aspect-ratio:1}
#${rootId} .sc-settings-group-panel .sc-nav-grid{grid-template-columns:1fr}
#${rootId} .sc-settings-group-panel .sc-nav-grid button{min-height:47px}
#${rootId} .sc-foot{padding:6px 15px!important;background:color-mix(in srgb,var(--sc-panel) 34%,transparent)!important}
#${rootId} .sc-archive-veil{padding-right:calc(min(680px,100vw - 32px) + 40px)}
#${rootId}[data-proto-collapsed="true"]{width:min(420px,calc(100vw - 32px))!important}
#${rootId}[data-proto-collapsed="true"] .sc-proto-topbar{min-height:55px}
#${rootId}[data-proto-collapsed="true"] .sc-proto-status,#${rootId}[data-proto-collapsed="true"] .sc-summary-title small{display:none}
@media(max-width:760px){#${rootId} .sc-archive-veil{padding:20px}}
@media(max-width:700px){#${rootId}.sc-proto-root{right:8px!important;bottom:8px!important;width:calc(100vw - 16px)!important}#${rootId} .sc-tabs{left:44px;right:44px}#${rootId} .sc-tab-slot{flex-basis:136px;max-width:136px}#${rootId} .sc-summary-time{font-size:16px}#${rootId} .sc-proto-topbar{gap:6px}#${rootId} .sc-view{padding:14px}#${rootId} .sc-settings-list{grid-template-columns:1fr}}
@media(max-width:440px){#${rootId} .sc-proto-status{display:none}#${rootId} .sc-proto-timer-icon{display:none}#${rootId} .sc-summary-title{font-size:14px}#${rootId} .sc-summary-time{font-size:14px}#${rootId} .sc-proto-topbar .sc-icon-btn{width:29px;height:29px;flex-basis:29px}#${rootId} .sc-timer-card .sc-title{max-width:none;font-size:17px;padding-right:0}#${rootId} .sc-timer-card .sc-status{position:static;margin-top:7px}#${rootId} .sc-metric:first-child>strong{font-size:26px}#${rootId} .sc-nav-grid{grid-template-columns:1fr}}
@media(prefers-reduced-motion:reduce){#${rootId} *,#${rootId} *::before,#${rootId} *::after{scroll-behavior:auto!important;animation-duration:.01ms!important;transition-duration:.01ms!important}}
@media(prefers-reduced-motion:reduce){#${rootId} .sc-view,#${rootId} .sc-settings-group,#${rootId} .sc-settings-group-panel,#${rootId} .sc-loading-spinner,#${rootId} .sc-skeleton::after{animation:none!important}#${rootId} .sc-content{transition:none!important}}
@media(prefers-reduced-motion:reduce){#${rootId}.sc-proto-root{transition:none!important}}
#${rootId} .sc-dock-morph{position:absolute;inset:0;z-index:20;pointer-events:none;overflow:hidden;border-radius:18px}
#${rootId} .sc-morph-line{position:absolute;display:block;overflow:hidden;border-radius:5px;background:color-mix(in srgb,var(--sc-text) 4%,transparent)}
#${rootId} .sc-morph-line::after{content:"";position:absolute;inset:0;background:linear-gradient(108deg,transparent 18%,rgba(246,250,255,.045) 33%,rgba(246,250,255,.17) 47%,rgba(246,250,255,.05) 62%,transparent 80%);background-size:240% 100%;animation:sc-glass-wave 1.15s linear infinite;animation-delay:var(--wave-delay,0ms)}
@keyframes sc-glass-wave{from{background-position:145% 0}to{background-position:-80% 0}}
#${rootId} .sc-view{animation:sc-copy-resolve 260ms cubic-bezier(.22,1,.36,1) both}
@keyframes sc-copy-resolve{from{opacity:0;transform:translateY(3px);filter:blur(2px)}to{opacity:1;transform:translateY(0);filter:blur(0)}}
@media(prefers-reduced-motion:reduce){#${rootId} .sc-view{animation:none!important}#${rootId} .sc-dock-morph{display:none!important}}
#${rootId} .sc-quick-links{margin-top:10px}
#${rootId} .sc-quick-links summary{display:flex;align-items:center;gap:8px;width:100%;min-height:44px;padding:10px 12px;border-radius:10px;font-size:13px;font-weight:600;color:var(--sc-text);background:color-mix(in srgb,var(--sc-panel) 38%,transparent)}
#${rootId} .sc-quick-links summary:hover{background:var(--sc-panel-2)}
#${rootId} .sc-quick-links summary:focus-visible{outline:2px solid var(--sc-accent);outline-offset:2px}
/* Match the reference: the wide timer becomes a vertical docked menu. */
#${rootId}[data-proto-menu="true"]{width:min(370px,calc(100vw - 24px))!important;padding-top:0!important}
#${rootId}[data-proto-menu="true"] .sc-tabs,#${rootId}[data-proto-menu="true"] .sc-proto-topbar{display:none!important}
#${rootId}[data-proto-menu="true"] .sc-content{max-height:calc(100dvh - 100px)!important;min-height:min(300px,calc(100dvh - 120px))}
#${rootId}[data-proto-menu="true"] .sc-view{padding:12px}
#${rootId}[data-proto-menu="true"] .sc-view-head{gap:10px;margin:-12px -12px 14px;padding:12px;background:color-mix(in srgb,var(--sc-panel) 55%,transparent)}
#${rootId}[data-proto-menu="true"] .sc-view-head .sc-icon-btn{width:42px;height:42px;border-radius:12px}
#${rootId}[data-proto-menu="true"] .sc-settings-list,#${rootId}[data-proto-menu="true"] .sc-nav-grid{grid-template-columns:1fr!important;gap:9px}
#${rootId} .sc-settings-group{border-color:color-mix(in srgb,var(--sc-border) 52%,transparent)!important;background:color-mix(in srgb,var(--sc-panel) 24%,transparent)}
#${rootId} .sc-settings-group-toggle{min-height:64px;padding:12px!important;gap:12px}
#${rootId} .sc-settings-group-toggle strong{font-size:13px}
#${rootId} .sc-settings-group-toggle small{font-size:11px;line-height:1.35}
#${rootId} .sc-settings-chevron{transform:rotate(-90deg)}
#${rootId} .sc-settings-group[data-expanded="true"] .sc-settings-chevron{transform:rotate(0deg)}
#${rootId} .sc-nav-grid button{border-color:color-mix(in srgb,var(--sc-border) 40%,transparent)!important}
#${rootId} .sc-timer-card{border:0!important;background:color-mix(in srgb,var(--sc-panel) 34%,transparent);padding:16px}
#${rootId} .sc-current-strip{margin:18px 0 8px;padding:0 2px;border:0;background:none;display:flex;align-items:center;gap:10px;font-size:11px}
#${rootId} .sc-current-strip span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#${rootId} .sc-proto-brand>strong,#${rootId} .sc-summary-title small,#${rootId} .sc-proto-status{display:none!important}
#${rootId} .sc-timer-card>.sc-eyebrow{font-size:15px;font-weight:750;color:var(--sc-job-color,var(--sc-text))!important}
#${rootId} .sc-timer-card .sc-title{font-size:14px;font-weight:600;line-height:1.45;margin-top:4px}
#${rootId} .sc-timer-card .sc-status{color:var(--sc-job-color,var(--sc-positive))!important;background:color-mix(in srgb,var(--sc-job-color,var(--sc-positive)) 12%,transparent)}
#${rootId} .sc-tab[data-threshold="YELLOW"],#${rootId} .sc-timer-card[data-threshold="YELLOW"]{--sc-job-color:#e7bf5a}
#${rootId} .sc-tab[data-threshold="ORANGE"],#${rootId} .sc-timer-card[data-threshold="ORANGE"]{--sc-job-color:#f1a15c}
#${rootId} .sc-tab[data-threshold="RED"],#${rootId} .sc-timer-card[data-threshold="RED"]{--sc-job-color:#f08080}
#${rootId} .sc-tab .sc-dot{background:var(--sc-job-color,var(--sc-positive))!important}
#${rootId} .sc-tab[data-selected="true"]{border-color:var(--sc-job-color,var(--sc-border))!important}
#${rootId} .sc-tab .sc-tab-time{color:var(--sc-job-color,var(--sc-text))}
#${rootId} .sc-actions{gap:8px}
#${rootId} .sc-actions button{min-height:38px}
@media(max-width:440px){#${rootId}[data-proto-menu="true"]{width:calc(100vw - 16px)!important}}
/* Simple timer hierarchy and labeled icon controls. */
#${rootId}.sc-proto-root[data-proto-menu="false"]{width:min(540px,calc(100vw - 32px))!important}
#${rootId}[data-proto-menu="false"][data-proto-collapsed="false"] .sc-summary-time{display:none}
#${rootId}[data-proto-menu="false"] .sc-foot{display:none}
#${rootId} .sc-proto-topbar{min-height:56px;gap:10px}
#${rootId} .sc-proto-brand{flex:1}
#${rootId} .sc-view{padding:16px}
#${rootId} .sc-timer-card{padding:4px 2px 10px!important;background:transparent!important;min-height:0}
#${rootId} .sc-timer-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:28px}
#${rootId} .sc-job-identity{display:flex;align-items:baseline;gap:8px;flex:1;min-width:0;color:var(--sc-job-color,var(--sc-text))}
#${rootId} .sc-job-id{flex:0 0 auto;font-size:13px;font-weight:760;white-space:nowrap}
#${rootId} .sc-timer-card .sc-title{font-size:14px!important;font-weight:680!important;max-width:none;line-height:1.3;margin-top:0;color:var(--sc-job-color,var(--sc-text))!important}
#${rootId} .sc-timer-heading .sc-status{position:static;flex:0 0 auto;top:auto;right:auto;margin:0;padding:4px 8px}
#${rootId} .sc-metrics{margin-top:20px;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:24px}
#${rootId} .sc-current-strip + .sc-timer-card .sc-metrics{margin-top:10px}
#${rootId} .sc-metric:first-child>strong{font-size:38px!important;font-weight:650;letter-spacing:-.04em}
#${rootId} .sc-total-area{display:flex;align-items:flex-end;justify-content:flex-end;gap:24px;min-width:0}
#${rootId} .sc-metric-total{text-align:right;align-self:end}
#${rootId} .sc-metric-total strong{font-size:20px}
#${rootId} .sc-view-current{align-self:flex-end;min-height:36px;padding:7px 10px!important;border-radius:9px;white-space:nowrap;font-size:11px}
#${rootId} .sc-visually-hidden{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip-path:inset(50%)!important;white-space:nowrap!important}
#${rootId} .sc-actions{margin-top:18px;gap:8px;display:flex}
#${rootId} .sc-actions button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:44px;flex:1;padding:10px 12px;font-size:12px}
#${rootId} .sc-actions .sc-ui-icon{width:16px!important;height:16px!important;min-width:16px!important;flex-basis:16px!important}
#${rootId} .sc-tool-buttons{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding-top:0}
#${rootId} .sc-tool-buttons button{display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px;font-size:12px;border-radius:10px}
#${rootId} .sc-tool-buttons .sc-ui-icon{width:18px!important;height:18px!important;min-width:18px!important;flex-basis:18px!important}
#${rootId} .sc-quick-links{position:relative;height:46px;margin-top:6px;transition:height 330ms cubic-bezier(.22,1,.36,1)}
#${rootId} .sc-quick-links[open]{height:158px}
#${rootId} .sc-quick-links summary{position:absolute;z-index:2;top:0;right:0;left:0;justify-content:center;min-height:46px;padding:10px 16px;text-align:center;border:1px solid color-mix(in srgb,var(--sc-border) 55%,transparent);background:color-mix(in srgb,var(--sc-panel) 46%,transparent);transition:background-color 180ms ease}
#${rootId} .sc-quick-links summary::-webkit-details-marker{display:none}
#${rootId} .sc-quick-links .sc-tool-panel{position:absolute;top:46px;right:0;left:0;display:grid;gap:8px;padding-top:8px;opacity:0;transform:translateY(-12px);pointer-events:none}
#${rootId} .sc-quick-links[open] .sc-tool-panel{opacity:1;transform:translateY(0);pointer-events:auto;animation:sc-tool-row-reveal 320ms cubic-bezier(.22,1,.36,1) both}
#${rootId} .sc-quick-links .sc-search{margin:0;min-height:44px}
#${rootId} .sc-quick-links .sc-search input,#${rootId} .sc-quick-links .sc-search button{min-height:44px}
@keyframes sc-tool-row-reveal{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:translateY(0)}}
#${rootId} .sc-title-clip{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#${rootId} .sc-job-identity .sc-title-clip{flex:1;min-width:0;max-width:none}
#${rootId} .sc-title-clip .sc-title{width:max-content;max-width:none!important;white-space:nowrap;overflow-wrap:normal}
#${rootId} .sc-title-clip[data-overflow="true"]{cursor:default;mask-image:linear-gradient(to right,#000 calc(100% - 17px),transparent);-webkit-mask-image:linear-gradient(to right,#000 calc(100% - 17px),transparent)}
#${rootId} .sc-title-clip:focus-visible{outline:2px solid var(--sc-accent);outline-offset:2px;border-radius:3px}
#${rootId} .sc-title-clip[data-overflow="true"]:is(:hover,:focus-visible) .sc-title{animation:sc-title-pan var(--sc-title-pan-duration,3500ms) ease-in-out 300ms 1 both}
@keyframes sc-title-pan{0%,8%{transform:translateX(0)}78%,100%{transform:translateX(calc(-1 * var(--sc-title-travel,0px)))}}
#${rootId} .sc-tab-closing{position:absolute!important;z-index:9;pointer-events:none;transform-origin:center bottom;animation:sc-tab-close 220ms cubic-bezier(.2,.8,.2,1) both}
#${rootId}[data-drag-away="true"] .sc-tab-slot[data-drag-source="true"]>*{visibility:hidden!important}
#${rootId}[data-drag-away="true"] .sc-tab-slot[data-drag-source="true"]::after{visibility:hidden!important}
@keyframes sc-tab-close{to{opacity:0;transform:translateY(8px) scale(.82);filter:blur(2px)}}
#${rootId} .sc-settings-group{border:0!important;box-shadow:none!important;background:color-mix(in srgb,var(--sc-panel) 36%,transparent)!important}
#${rootId} .sc-settings-group[data-expanded="true"]{background:color-mix(in srgb,var(--sc-panel-2) 38%,transparent)!important}
#${rootId} .sc-settings-group-panel{border-top:0!important}
#${rootId} .sc-settings-group-panel .sc-nav-grid button{min-height:52px;padding:10px 12px;border:0!important;background:color-mix(in srgb,var(--sc-panel-2) 55%,transparent)!important}
#${rootId} .sc-settings-group-panel .sc-nav-grid strong{font-size:12px}
#${rootId} .sc-settings-group-panel .sc-nav-grid small{font-size:10.5px}
#${rootId} .sc-settings-group-panel .sc-nav-grid button:hover{background:color-mix(in srgb,var(--sc-panel-2) 78%,var(--sc-accent) 10%)!important}
#${rootId} .sc-content{scrollbar-color:color-mix(in srgb,var(--sc-muted) 35%,transparent) transparent}
#${rootId} .sc-list-scroll{max-height:min(48dvh,430px);min-height:0;overflow-y:auto;scrollbar-gutter:stable;scrollbar-width:thin;padding-right:4px;scrollbar-color:color-mix(in srgb,var(--sc-muted) 35%,transparent) transparent}
#${rootId} .sc-choice:has([data-value="CLEAR"]){grid-template-columns:repeat(4,minmax(0,1fr))}
#${rootId}[data-proto-theme="clear"]{--sc-text:#f8fafc;--sc-muted:#d5dce4;--sc-border:rgba(255,255,255,.14);--sc-accent:#c1d8ef;--sc-accent-soft:rgba(170,210,240,.16);--sc-dock-accent:#dbe8f2;--sc-panel:rgba(255,255,255,.05);--sc-panel-2:rgba(255,255,255,.09);--sc-bg:#25313c}
#${rootId}[data-proto-theme="clear"][data-proto-surface="glass"]{--sc-bg:rgba(25,31,38,.14);--sc-shadow:0 14px 40px rgba(0,0,0,.16)}
#${rootId}[data-proto-theme="clear"] .sc-actions .sc-primary{color:#162534!important;background:#c1d8ef!important}
#${rootId}[data-proto-theme="clear"] .sc-proto-topbar{background:rgba(255,255,255,.045)!important}
#${rootId}[data-proto-theme="clear"][data-proto-surface="glass"] .sc-proto-shell{backdrop-filter:blur(24px) saturate(115%)!important;-webkit-backdrop-filter:blur(24px) saturate(115%)!important}
@media(max-width:440px){#${rootId} .sc-tool-buttons button{gap:5px;font-size:11px}#${rootId} .sc-actions button{padding:9px 7px;font-size:11px}#${rootId} .sc-metrics{gap:12px}#${rootId} .sc-total-area{gap:18px}#${rootId} .sc-metric:first-child>strong{font-size:32px!important}}
@media(max-width:380px){#${rootId} .sc-timer-heading{flex-wrap:wrap;gap:4px 8px}#${rootId} .sc-job-identity{flex-basis:100%}#${rootId} .sc-timer-heading .sc-status{margin-left:auto}#${rootId} .sc-total-area{flex-direction:column;align-items:flex-end;gap:4px}#${rootId} .sc-view-current{align-self:flex-end}}
@media(prefers-reduced-motion:reduce){#${rootId} .sc-tabs{scroll-behavior:auto}#${rootId} .sc-quick-links,#${rootId} .sc-quick-links[open] .sc-tool-panel{transition:none!important;animation:none!important}}
@media(forced-colors:active){#${rootId} .sc-proto-shell,#${rootId} .sc-timer-card,#${rootId} .sc-current-strip,#${rootId} .sc-home-current,#${rootId} .sc-settings-group{background:Canvas!important;color:CanvasText!important;border:1px solid CanvasText!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}}
`;
}

module.exports = { prototypeDockStyle };
