'use strict';

// Temporary, aria-hidden text geometry. Never copies timer state or commands.
const SELECTOR = '.sc-summary-title,.sc-summary-time,.sc-timer-card>.sc-eyebrow,.sc-title,.sc-metric strong,.sc-view-head strong,.sc-settings-group-toggle strong,.sc-settings-group-toggle small,.sc-nav-grid strong,.sc-nav-grid small';
function captureDockText(root, scopeSelector = null) {
  const bounds = root.getBoundingClientRect?.();
  if (!bounds || !root.ownerDocument?.createRange) return null;
  const lines = [];
  const scope = scopeSelector ? root.querySelector(scopeSelector) : root;
  if (!scope) return { lines };
  const content = root.querySelector?.('.sc-content');
  const contentBounds = content?.getBoundingClientRect?.();
  for (const element of scope.querySelectorAll(SELECTOR)) {
    if (element.closest('[hidden]')) continue;
    const range = root.ownerDocument.createRange();
    range.selectNodeContents(element);
    for (const rect of range.getClientRects()) {
      const clip = element.closest('.sc-content') && contentBounds ? contentBounds : bounds;
      const left = Math.max(rect.left, bounds.left, clip.left);
      const right = Math.min(rect.right, bounds.right, clip.right);
      const top = Math.max(rect.top, bounds.top, clip.top);
      const bottom = Math.min(rect.bottom, bounds.bottom, clip.bottom);
      if (right - left < 3 || bottom - top < 3) continue;
      lines.push({ x: left - bounds.left, y: top - bounds.top,
        width: right - left, height: Math.min(bottom - top, 18) });
      if (lines.length >= 32) return { lines };
    }
  }
  return { lines };
}

function revealDockMorph(root, before, window, scopeSelector = null) {
  if (!before || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return () => {};
  const after = captureDockText(root, scopeSelector);
  if (!after || !root.animate) return () => {};
  const overlay = root.ownerDocument.createElement('div');
  overlay.className = 'sc-dock-morph';
  overlay.setAttribute('aria-hidden', 'true');
  const animations = [];
  const count = Math.max(before.lines.length, after.lines.length);
  for (let index = 0; index < count; index++) {
    const start = before.lines[index] || after.lines[index];
    const end = after.lines[index] || start;
    if (!start || !end) continue;
    const line = root.ownerDocument.createElement('span');
    line.className = 'sc-morph-line';
    line.style.setProperty('--wave-delay', `${index * -27}ms`);
    overlay.append(line);
    animations.push(line.animate([
      { left: `${start.x}px`, top: `${start.y}px`, width: `${start.width}px`, height: `${start.height}px`, opacity: 0 },
      { offset: .2, opacity: .85 },
      { left: `${end.x}px`, top: `${end.y}px`, width: `${end.width}px`, height: `${end.height}px`, opacity: 0 }
    ], { duration: 440, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' }));
  }
  root.append(overlay);
  let cleanupTimer;
  const cancel = () => { window.clearTimeout(cleanupTimer); animations.forEach(animation => animation.cancel()); overlay.remove(); };
  cleanupTimer = window.setTimeout(cancel, 500);
  return cancel;
}

module.exports = { captureDockText, revealDockMorph };
