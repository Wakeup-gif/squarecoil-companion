'use strict';

function height(node) { return node ? node.height : 0; }

function refresh(node) {
  node.height = Math.max(height(node.left), height(node.right)) + 1;
  node.maxEnd = Math.max(node.entry.segment.endAtMs,
    node.left ? node.left.maxEnd : -Infinity, node.right ? node.right.maxEnd : -Infinity);
  return node;
}

function rotateLeft(node) {
  const next = node.right;
  node.right = next.left;
  next.left = refresh(node);
  return refresh(next);
}

function rotateRight(node) {
  const next = node.left;
  node.left = next.right;
  next.right = refresh(node);
  return refresh(next);
}

function balance(node) {
  refresh(node);
  const difference = height(node.left) - height(node.right);
  if (difference > 1) {
    if (height(node.left.left) < height(node.left.right)) node.left = rotateLeft(node.left);
    return rotateRight(node);
  }
  if (difference < -1) {
    if (height(node.right.right) < height(node.right.left)) node.right = rotateRight(node.right);
    return rotateLeft(node);
  }
  return node;
}

function compare(left, right) {
  return left.segment.startAtMs - right.segment.startAtMs || left.serial - right.serial;
}

function insert(node, entry) {
  if (!node) return { entry, left: null, right: null, height: 1, maxEnd: entry.segment.endAtMs };
  if (compare(entry, node.entry) < 0) node.left = insert(node.left, entry);
  else node.right = insert(node.right, entry);
  return balance(node);
}

function remove(node, entry) {
  if (!node) return null;
  const direction = compare(entry, node.entry);
  if (direction < 0) node.left = remove(node.left, entry);
  else if (direction > 0) node.right = remove(node.right, entry);
  else {
    if (!node.left) return node.right;
    if (!node.right) return node.left;
    let successor = node.right;
    while (successor.left) successor = successor.left;
    node.entry = successor.entry;
    node.right = remove(node.right, successor.entry);
  }
  return balance(node);
}

// This index belongs to one staged candidate. Rows are already validated by
// the importer; it does not replace validation, dedupe or commit fencing.
function createIntervalIndex(ledger = [], activeIntervals = []) {
  let root = null;
  let serial = 0;
  let ledgerOrder = 0;
  const ledgerEntries = new Map();

  function add(segment) {
    const order = ledgerOrder++;
    if (!(segment.durationMs > 0)) return;
    if (ledgerEntries.has(segment.segmentId)) throw new Error('interval-index-duplicate-id');
    const entry = { segment, order, serial: serial++, active: false };
    ledgerEntries.set(segment.segmentId, entry);
    root = insert(root, entry);
  }

  for (const segment of ledger) add(segment);
  for (let order = 0; order < activeIntervals.length; order += 1) {
    const segment = activeIntervals[order];
    if (segment.durationMs > 0) root = insert(root, { segment, order, serial: serial++, active: true });
  }

  function removeLedger(segmentId) {
    const entry = ledgerEntries.get(segmentId);
    if (!entry) return;
    root = remove(root, entry);
    ledgerEntries.delete(segmentId);
  }

  function overlaps(segment) {
    if (!(segment.durationMs > 0)) return [];
    const matches = [];
    function visit(node) {
      if (!node || node.maxEnd <= segment.startAtMs) return;
      visit(node.left);
      if (node.entry.segment.startAtMs >= segment.endAtMs) return;
      if (segment.startAtMs < node.entry.segment.endAtMs) matches.push(node.entry);
      visit(node.right);
    }
    visit(root);
    // Match the prior ledger-then-active scan, including newly accepted rows
    // before active/recovery sentinels. Tree traversal order is not plan order.
    matches.sort((left, right) => Number(left.active) - Number(right.active) || left.order - right.order);
    return matches.map(entry => entry.segment);
  }

  return { add, remove: removeLedger, overlaps };
}

module.exports = { createIntervalIndex };
