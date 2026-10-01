'use strict';

const ROOT_MARKER_CLASSES = Object.freeze([
  'us-sign-project-status-page',
  'us-sign-design-page',
  'us-sign-semantic-project-ux',
  'us-sign-search-page',
  'us-sign-task-page',
  'us-sign-main-dashboard',
  'us-sign-job-dashboard'
]);
const PASS_DELAYS_MS = Object.freeze([0, 120, 350, 800, 1600, 2800, 4200]);

function createPresentationMarkers(options = {}) {
  const document = options.document || globalThis.document;
  const window = options.window || globalThis.window;
  const timers = new Set();
  const originals = new Map();
  let active = false;
  let disposed = false;
  let listening = false;

  function ownAttribute(node, name, value) {
    if (!node?.getAttribute || !node?.setAttribute) return;
    const nextValue = value === null || value === undefined || value === '' ? null : String(value);
    if (node.getAttribute(name) === nextValue) return;
    let attributes = originals.get(node);
    if (!attributes) {
      attributes = new Map();
      originals.set(node, attributes);
    }
    if (!attributes.has(name)) attributes.set(name, node.hasAttribute?.(name) ? node.getAttribute(name) : null);
    if (nextValue === null) node.removeAttribute?.(name);
    else node.setAttribute(name, nextValue);
  }

  function setRootMarker(root, name, present) {
    const hasMarker = root.classList?.contains?.(name) === true;
    if (present && !hasMarker) root.classList?.add(name);
    else if (!present && hasMarker) root.classList?.remove(name);
  }

  function semanticState(text) {
    const value = String(text || '').trim().toLowerCase();
    if (!value) return '';
    if (/overdue|failed|rejected|cancel(?:led|ed)|blocked|critical/.test(value)) return 'danger';
    if (/urgent|high priority|rush/.test(value)) return 'urgent';
    if (/approved|complete(?:d)?|ready|released|installed/.test(value)) return 'success';
    if (/submitted|sent/.test(value)) return 'submitted';
    if (/on hold|hold|paused/.test(value)) return 'hold';
    if (/pending|in progress|review|open|awaiting|estimating/.test(value)) return 'pending';
    if (/not set|none|n\/a|tbd/.test(value)) return 'unset';
    return '';
  }

  function dueState(text) {
    const match = String(text || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return '';
    const due = new Date(Number(match[3]), Number(match[1]) - 1, Number(match[2]), 12, 0, 0, 0);
    if (Number.isNaN(due.getTime())) return '';
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
    const days = Math.round((due.getTime() - today.getTime()) / 86400000);
    return days < 0 ? 'overdue' : days === 0 ? 'due-today' : days <= 3 ? 'due-soon' : '';
  }

  function markSemanticProjectUx() {
    const summary = document.querySelector?.('#us-sign-design-summary');
    const actionbar = document.querySelector?.('#us-sign-design-actionbar');
    if (!summary || !actionbar) return false;
    for (const cell of summary.querySelectorAll?.('.us-sign-djt-summary-cell') || []) {
      const label = String(cell.querySelector?.('.us-sign-djt-summary-label')?.textContent || '').trim().toLowerCase();
      const valueElement = cell.querySelector?.('.us-sign-djt-summary-value');
      if (!valueElement) continue;
      const value = String(valueElement.textContent || '').trim();
      const state = label === 'due date' ? dueState(value) :
        ['priority', 'status'].includes(label) ? semanticState(value) : '';
      if (label === 'hours') ownAttribute(cell, 'data-us-field', 'hours');
      ownAttribute(cell, 'data-us-state', state || null);
      ownAttribute(valueElement, 'data-us-state', state || null);
    }
    for (const alert of document.querySelectorAll?.('.alert') || []) {
      const text = String(alert.textContent || '').replace(/\s+/g, ' ').trim();
      ownAttribute(alert, 'data-us-state', /^pending\b/i.test(text) ? 'pending' : semanticState(text) || null);
    }
    const tagAction = (node, action) => { if (node) ownAttribute(node, 'data-us-action', action); };
    for (const element of actionbar.querySelectorAll?.('a, button, .btn') || []) {
      const text = String(element.textContent || element.value || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (!text) continue;
      tagAction(element, /delete|remove/.test(text) ? 'danger' :
        /^(new|\+)$|create|add/.test(text) ? 'primary' : 'utility');
    }
    for (const element of document.querySelectorAll?.('#us-sign-job-copy-tools button, #us-sign-job-copy-tools a') || []) {
      tagAction(element, 'utility');
    }
    for (const element of document.querySelectorAll?.('#us-sign-native-action-group a, #us-sign-native-action-group button') || []) {
      tagAction(element, /delete|remove/.test(String(element.textContent || '').toLowerCase()) ? 'danger' : 'utility');
    }
    tagAction(document.querySelector?.('#delete-design'), 'danger');
    tagAction(document.querySelector?.('#time-clock-clock-in-to-project-from-project'), 'clock-in');
    tagAction(document.querySelector?.('#clockout'), 'warning');
    tagAction(document.querySelector?.('#duplicate'), 'utility');
    for (const badge of document.querySelectorAll?.('#badge-task-count, #badge-design-count, #badge-estimate-count') || []) {
      const count = Number.parseInt(String(badge.textContent || '').trim(), 10);
      ownAttribute(badge, 'data-us-zero', Number.isFinite(count) && count === 0 ? 'true' : 'false');
    }
    return true;
  }

  function pass() {
    if (disposed || !active) return;
    const root = document.documentElement;
    if (!root) return;
    const pathname = String(window.location?.pathname || '').toLowerCase();
    setRootMarker(root, 'us-sign-project-status-page', pathname === '/project_milestones.php');
    setRootMarker(root, 'us-sign-design-page', pathname === '/project_designs.php' || pathname === '/edit_design.php');
    setRootMarker(root, 'us-sign-search-page', pathname === '/search.php');
    const headings = Array.from(document.querySelectorAll?.('.panel-heading, .panel-title, h1, h2, h3, h4') || []);
    setRootMarker(root, 'us-sign-task-page', Boolean(document.querySelector?.('input[placeholder*="Search Tasks" i]') &&
      headings.some(element => /Selected\s+Task|^\s*Tasks\s*$/i.test(element.textContent || ''))));
    const projectContext = document.querySelector?.(
      '#customer-info, #customer-name, #us-sign-design-actionbar, #us-sign-design-bottom-grid, #ps-select, .us-sign-scope-enhanced, .important-notes'
    );
    const hasDashboardWidgets = document.querySelector?.('#widget-tasks') &&
      document.querySelector?.('#widget-designs') && document.querySelector?.('#widget-estimates');
    const dashboardBreadcrumb = /^\s*Dashboard\s*$/i.test(document.querySelector?.('#bread-crumb')?.textContent || '');
    setRootMarker(root, 'us-sign-main-dashboard', Boolean(!projectContext && pathname === '/dashboard.php' &&
      (document.querySelector?.('#page-content') || hasDashboardWidgets || dashboardBreadcrumb)));
    const isJobDashboard = pathname === '/project.php' && document.querySelector?.('#customer-info') && document.querySelector?.('.important-notes') &&
      !document.querySelector?.('#ps-select, .us-sign-scope-enhanced, #us-sign-design-actionbar, #us-sign-design-bottom-grid') &&
      !root.classList?.contains('us-sign-project-status-page');
    setRootMarker(root, 'us-sign-job-dashboard', Boolean(isJobDashboard));
    setRootMarker(root, 'us-sign-semantic-project-ux', markSemanticProjectUx());
  }

  function clearTimers() {
    for (const timer of timers) window.clearTimeout?.(timer);
    timers.clear();
  }

  function schedule() {
    if (disposed || !active) return;
    clearTimers();
    for (const delay of PASS_DELAYS_MS) {
      let timer = null;
      timer = window.setTimeout?.(() => {
        timers.delete(timer);
        pass();
      }, delay);
      if (timer !== null && timer !== undefined) timers.add(timer);
    }
  }

  function restoreOwnedAttributes() {
    for (const [node, attributes] of originals) {
      for (const [name, value] of attributes) {
        if (value === null) node.removeAttribute?.(name);
        else node.setAttribute?.(name, value);
      }
    }
    originals.clear();
  }

  function remove() {
    active = false;
    clearTimers();
    for (const className of ROOT_MARKER_CLASSES) document.documentElement?.classList?.remove(className);
    restoreOwnedAttributes();
  }

  function apply() {
    if (disposed) return;
    active = true;
    if (!listening) {
      listening = true;
      document.addEventListener?.('DOMContentLoaded', schedule);
      window.addEventListener?.('pageshow', schedule);
      window.addEventListener?.('popstate', schedule);
      window.addEventListener?.('hashchange', schedule);
      window.addEventListener?.('us-sign-location-change', schedule);
    }
    schedule();
  }

  function teardown() {
    if (disposed) return;
    remove();
    disposed = true;
    document.removeEventListener?.('DOMContentLoaded', schedule);
    window.removeEventListener?.('pageshow', schedule);
    window.removeEventListener?.('popstate', schedule);
    window.removeEventListener?.('hashchange', schedule);
    window.removeEventListener?.('us-sign-location-change', schedule);
    listening = false;
  }

  return Object.freeze({ apply, remove, schedule, teardown });
}

module.exports = { ROOT_MARKER_CLASSES, PASS_DELAYS_MS, createPresentationMarkers };
