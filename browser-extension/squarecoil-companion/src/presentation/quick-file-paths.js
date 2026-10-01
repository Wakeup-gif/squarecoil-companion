'use strict';

// This surface reads job fields only. Local paths can be copied, but opening a
// local file requires a separate, explicitly installed desktop integration.
const QUICK_FILE_PATHS_HOST_ID = 'squarecoil-companion-quick-file-paths';
const MAX_SOURCE_CHARACTERS = 32_000;
const MAX_ITEMS = 16;
const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;
const PATH_START_PATTERN = /(?:file:(?:\/{2,3}|\\\\))?(?:[A-Za-z]:[\\/]|\\\\[^\\/\s]+[\\/][^\\/\s]+)/gi;

const TOOLBAR_CSS = `
:host{display:block;min-width:0;margin:0 0 12px;color:#e9eff5;font:12px/1.4 Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
*,*::before,*::after{box-sizing:border-box}
.card{padding:11px 12px;background:rgba(13,24,35,.86);border:1px solid rgba(175,207,227,.14);border-radius:12px;box-shadow:0 10px 26px rgba(0,0,0,.12)}
.heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 9px;font-size:12px;font-weight:700;letter-spacing:0}
.count{color:#aebfcb;font-size:11px;font-weight:500}
.list{display:grid;gap:6px;max-height:220px;overflow:auto;scrollbar-width:thin}
.row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;min-height:34px;padding:5px 6px 5px 9px;background:rgba(255,255,255,.04);border-radius:8px}
.value{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#e9eff5;font-size:11px}
.path{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
.value.copy-failed{white-space:normal;overflow-wrap:anywhere;user-select:text}
.action{display:inline-flex;align-items:center;justify-content:center;min-height:30px;min-width:54px;padding:5px 9px;color:#dcecf7;background:rgba(117,177,220,.15);border:0;border-radius:7px;text-decoration:none;font:600 11px/1.2 inherit;cursor:pointer}
.action:hover{background:rgba(117,177,220,.26);color:#fff;text-decoration:none}
.action:focus-visible{outline:2px solid #9fd7ff;outline-offset:2px}
.status{min-height:0;color:#b8d8ed;font-size:11px}
.status:not(:empty){margin-top:7px}
@media(max-width:520px){.card{padding:10px}.row{gap:5px}.value{font-size:10.5px}}
@media(forced-colors:active){.card,.row{border:1px solid CanvasText;background:Canvas;color:CanvasText}.value,.action{color:CanvasText}.action{border:1px solid LinkText;background:Canvas}}
`;

function exactQuickFileRoute(location) {
  const path = String(location?.pathname || '').toLowerCase();
  if (path === '/project_designs.php') return 'design';
  if (path === '/project.php') return 'notes';
  return null;
}

function normalizeWindowsPath(value) {
  let path = String(value || '').trim();
  if (!path || path.length > 1024 || /[\u0000-\u001f<>|*?]/.test(path)) return null;
  path = path.replace(/^["'`(\[]+/, '').replace(/["'`)\],;.]+$/, '').trim();
  if (/^file:/i.test(path)) {
    try {
      const parsed = new URL(path);
      if (parsed.protocol !== 'file:') return null;
      const decoded = decodeURIComponent(parsed.pathname || '');
      path = parsed.hostname && parsed.hostname !== 'localhost'
        ? `\\\\${parsed.hostname}${decoded.replace(/\//g, '\\')}`
        : decoded.replace(/^\/(?=[A-Za-z]:)/, '');
    } catch (_) { return null; }
  }
  path = path.replace(/\//g, '\\');
  if (/^[A-Za-z]:\\[^:"<>|*?\r\n]+$/.test(path)) return path;
  if (/^\\\\[^\\\s]+\\[^\\\s]+(?:\\[^:"<>|*?\r\n]*)?$/.test(path)) return path;
  return null;
}

function validateHttpLink(value) {
  const raw = String(value || '').trim().replace(/[),.;]+$/, '');
  if (!/^https?:\/\//i.test(raw) || raw.length > 2048 || /[\u0000-\u001f]/.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch (_) { return null; }
}

function extractQuickFileReferences(text, anchors = []) {
  const paths = [];
  const links = [];
  const seenPaths = new Set();
  const seenLinks = new Set();
  const addPath = value => {
    const path = normalizeWindowsPath(value);
    if (!path || seenPaths.has(path.toLowerCase()) || paths.length >= MAX_ITEMS) return;
    seenPaths.add(path.toLowerCase());
    paths.push(path);
  };
  const addLink = (value, label = '') => {
    const href = validateHttpLink(value);
    if (!href || seenLinks.has(href) || links.length >= MAX_ITEMS) return;
    seenLinks.add(href);
    const hostname = new URL(href).hostname;
    links.push({ href, label: String(label || '').trim().slice(0, 48) || hostname });
  };

  for (const anchor of anchors) {
    addPath(anchor.href);
    addPath(anchor.text);
    addLink(anchor.href, anchor.text);
  }
  const lines = String(text || '').slice(0, MAX_SOURCE_CHARACTERS).replace(/\r/g, '').split('\n');
  for (const line of lines) {
    for (const match of line.matchAll(URL_PATTERN)) {
      const prefix = line.slice(0, match.index).trim().replace(/[:\s]+$/, '');
      addLink(match[0], prefix.length <= 48 ? prefix : '');
    }
    const withoutLinks = line.replace(URL_PATTERN, ' ');
    const starts = [...withoutLinks.matchAll(PATH_START_PATTERN)];
    for (let index = 0; index < starts.length; index += 1) {
      const start = starts[index].index;
      const end = starts[index + 1]?.index ?? withoutLinks.length;
      const candidate = withoutLinks.slice(start, end)
        .split(/\s+(?:\||[-–—]>?|(?:CHECK SET|SURVEY|DROPBOX|IMPORTANT|SCOPE OF WORK)\s*:)/i)[0]
        .trim();
      addPath(candidate);
    }
  }
  return { paths, links: links.slice(0, Math.max(0, MAX_ITEMS - paths.length)) };
}

function mergeQuickFileReferences(primary, secondary) {
  const paths = [];
  const links = [];
  const seenPaths = new Set();
  const seenLinks = new Set();
  for (const references of [primary, secondary]) {
    if (!references) continue;
    for (const path of references.paths) {
      const key = path.toLowerCase();
      if (seenPaths.has(key)) continue;
      seenPaths.add(key);
      paths.push(path);
    }
    for (const link of references.links) {
      if (seenLinks.has(link.href)) continue;
      seenLinks.add(link.href);
      links.push(link);
    }
  }
  // Keep room for links even if a long Description contains many file paths.
  const limitedPaths = paths.slice(0, MAX_ITEMS - Math.min(links.length, Math.floor(MAX_ITEMS / 2)));
  return { paths: limitedPaths, links: links.slice(0, MAX_ITEMS - limitedPaths.length) };
}

function createQuickFilePathsService(options = {}) {
  const document = options.document;
  const window = options.window;
  if (!document || !window) throw new Error('quick-file-paths-environment-required');
  const copyText = options.copyText || (value => {
    if (typeof window.navigator?.clipboard?.writeText !== 'function') throw new Error('clipboard-unavailable');
    return window.navigator.clipboard.writeText(value);
  });
  let enabled = false;
  let disposed = false;
  let host = null;
  let source = null;
  let renderedSource = null;
  let observer = null;
  let observedScope = null;
  let refreshTimer = null;
  let textInput = null;
  let routeListeners = false;
  let signature = '';
  let current = Object.freeze({ state: 'OFF', reason: 'preference-off', pathCount: 0, linkCount: 0, ownedRootCount: 0 });

  const publish = (state, reason, pathCount = 0, linkCount = 0) => {
    current = Object.freeze({ state, reason, pathCount, linkCount, ownedRootCount: host?.isConnected ? 1 : 0 });
    return current;
  };
  const visible = element => {
    if (!element) return false;
    for (let node = element; node && node !== document.documentElement; node = node.parentElement) {
      if (node.hidden || node.getAttribute?.('aria-hidden') === 'true') return false;
      const style = window.getComputedStyle?.(node);
      if (style?.display === 'none' || ['hidden', 'collapse'].includes(style?.visibility)) return false;
    }
    return typeof element.getClientRects !== 'function' || element.getClientRects().length > 0;
  };
  const headingText = element => {
    if (!element) return '';
    let text = '';
    if (element.childNodes) {
      for (const node of element.childNodes) {
        if (node.nodeType === 3) text += ` ${node.nodeValue || ''}`;
        else if (node.nodeType === 1 && !node.matches?.('a,button,input,select,textarea,script,style,.widget-menu,.panel-menu')) {
          text += ` ${node.textContent || ''}`;
        }
      }
    } else text = element.textContent || '';
    return String(text).replace(/\s+/g, ' ').trim().replace(/:\s*$/, '').toUpperCase();
  };

  function findSource(route) {
    const visibleNotes = () => [...document.querySelectorAll('textarea.important-notes')].filter(visible);
    if (route === 'notes') {
      const matches = visibleNotes();
      return matches.length === 1 ? { kind: 'notes', element: matches[0], mount: matches[0].parentElement } : null;
    }
    const candidates = [...new Set(document.querySelectorAll('#descriptionbox, #description-box, .us-sign-description-panel, .panel, .box'))];
    const matches = candidates.filter(panel => visible(panel) && headingText(panel.querySelector(':scope > .panel-heading, :scope > .box-heading, :scope > header')) === 'DESCRIPTION')
      .map(panel => ({ kind: 'design', element: panel.querySelector(':scope > .panel-body, :scope > .box-body'), mount: panel }))
      .filter(item => visible(item.element));
    if (matches.length !== 1) return null;
    const notes = visibleNotes();
    return { ...matches[0], notesElement: notes.length === 1 ? notes[0] : null };
  }

  function readReferences(found) {
    if (found.kind === 'notes') return extractQuickFileReferences(found.element.value || '');
    const text = typeof found.element.innerText === 'string' ? found.element.innerText : found.element.textContent;
    const anchors = [...found.element.querySelectorAll('a[href]')].filter(visible)
      .map(anchor => ({ href: anchor.getAttribute('href'), text: anchor.innerText || anchor.textContent || '' }));
    return mergeQuickFileReferences(
      extractQuickFileReferences(text, anchors),
      found.notesElement ? extractQuickFileReferences(found.notesElement.value || '') : null
    );
  }

  function removeHost() {
    host?.remove?.();
    host = null;
    renderedSource = null;
    signature = '';
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function render(found, references) {
    const nextSignature = JSON.stringify(references);
    if (host?.isConnected && host.parentElement === found.mount && renderedSource === found.element && signature === nextSignature) return;
    removeHost();
    const nextHost = document.createElement('section');
    nextHost.id = QUICK_FILE_PATHS_HOST_ID;
    nextHost.setAttribute('data-squarecoil-companion-owned', 'quick-file-paths');
    nextHost.setAttribute('aria-label', 'Quick file paths and links');
    const root = nextHost.attachShadow?.({ mode: 'open' }) || nextHost;
    const style = createElement('style', '', TOOLBAR_CSS);
    const card = createElement('div', 'card');
    const heading = createElement('div', 'heading');
    heading.append(createElement('span', '', 'Quick files'), createElement('span', 'count', `${references.paths.length + references.links.length} found`));
    const list = createElement('div', 'list');
    const status = createElement('div', 'status');
    status.setAttribute('role', 'status');
    for (const path of references.paths) {
      const row = createElement('div', 'row');
      const label = createElement('span', 'value path', path);
      label.title = path;
      const button = createElement('button', 'action', 'Copy');
      button.type = 'button';
      button.setAttribute('aria-label', 'Copy file path');
      button.addEventListener('click', async event => {
        event.preventDefault();
        try {
          if (typeof copyText !== 'function') throw new Error('clipboard-unavailable');
          await copyText(path);
          status.textContent = 'Copied';
        } catch (_) { label.classList.add('copy-failed'); status.textContent = 'Select the path to copy'; }
      });
      row.append(label, button);
      list.append(row);
    }
    for (const link of references.links) {
      const row = createElement('div', 'row');
      const label = createElement('span', 'value', link.label);
      label.title = link.href;
      const action = createElement('a', 'action', 'Open');
      action.href = link.href;
      action.target = '_blank';
      action.rel = 'noopener noreferrer';
      action.setAttribute('aria-label', `Open ${link.label}`);
      row.append(label, action);
      list.append(row);
    }
    card.append(heading, list, status);
    root.append(style, card);
    if (found.kind === 'notes') found.mount.insertBefore(nextHost, found.element);
    else found.mount.insertBefore(nextHost, found.element);
    host = nextHost;
    renderedSource = found.element;
    signature = nextSignature;
  }

  function detachSourceInput() {
    textInput?.removeEventListener?.('input', scheduleRefresh);
    textInput?.removeEventListener?.('change', scheduleRefresh);
    textInput = null;
  }

  function refresh() {
    if (disposed || !enabled) return publish('OFF', 'preference-off');
    const route = exactQuickFileRoute(window.location);
    if (!route) { removeHost(); source = null; detachSourceInput(); disconnectObserver(); return publish('INACTIVE_PAGE', 'route-not-eligible'); }
    connectObserver();
    const found = findSource(route);
    if (!found?.mount) { removeHost(); source = null; detachSourceInput(); return publish('SOURCE_MISSING', 'job-field-unavailable'); }
    const nextTextInput = found.kind === 'notes' ? found.element : found.notesElement || null;
    if (source !== found.element || textInput !== nextTextInput) {
      detachSourceInput();
      source = found.element;
      if (nextTextInput) {
        textInput = nextTextInput;
        textInput.addEventListener?.('input', scheduleRefresh);
        textInput.addEventListener?.('change', scheduleRefresh);
      }
    }
    const references = readReferences(found);
    if (!references.paths.length && !references.links.length) { removeHost(); return publish('EMPTY', 'no-file-references'); }
    render(found, references);
    return publish('APPLIED', 'references-found', references.paths.length, references.links.length);
  }

  function scheduleRefresh() {
    if (!enabled || disposed || refreshTimer !== null) return;
    refreshTimer = window.setTimeout(() => { refreshTimer = null; refresh(); }, 90);
  }
  function disconnectObserver() { observer?.disconnect(); observer = null; observedScope = null; }
  function connectObserver() {
    if (typeof window.MutationObserver !== 'function') return;
    const scope = document.querySelector('#content') || document.body || document.documentElement;
    if (!scope) return;
    if (observer && observedScope === scope) return;
    disconnectObserver();
    observer = new window.MutationObserver(mutations => {
      if (mutations.every(mutation => mutation.target === host || host?.contains?.(mutation.target))) return;
      scheduleRefresh();
    });
    observer.observe(scope, { childList: true, subtree: true, characterData: true });
    observedScope = scope;
  }
  function clearRefresh() {
    if (refreshTimer !== null) window.clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  function disable() {
    enabled = false;
    clearRefresh();
    disconnectObserver();
    detachSourceInput();
    removeHost();
    source = null;
    if (routeListeners) {
      window.removeEventListener?.('popstate', onRouteChange);
      window.removeEventListener?.('pageshow', onRouteChange);
      routeListeners = false;
    }
  }
  function onRouteChange() { if (enabled) refresh(); }

  function apply(preference = false) {
    if (disposed) throw new Error('quick-file-paths-disposed');
    const nextEnabled = preference === true || preference?.enabled === true;
    if (!nextEnabled) { disable(); return publish('OFF', 'preference-off'); }
    enabled = true;
    if (!routeListeners) {
      window.addEventListener?.('popstate', onRouteChange);
      window.addEventListener?.('pageshow', onRouteChange);
      routeListeners = true;
    }
    return refresh();
  }
  function snapshot() { return current; }
  function teardown() {
    if (disposed) return;
    disable();
    disposed = true;
    publish('OFF', 'teardown');
  }
  return Object.freeze({ apply, snapshot, teardown });
}

module.exports = { QUICK_FILE_PATHS_HOST_ID, exactQuickFileRoute, normalizeWindowsPath,
  validateHttpLink, extractQuickFileReferences, createQuickFilePathsService };
