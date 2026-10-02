'use strict';

function createFeatureRegistry() {
  const features = new Map();
  const initialized = new Set();
  const teardownOutstanding = new Set();

  function register(name, feature) {
    const key = String(name || '').trim();
    if (!key) throw new Error('feature name is required');
    if (features.has(key)) throw new Error(`feature already registered: ${key}`);
    features.set(key, feature || {});
    return key;
  }

  async function ensure(context = {}) {
    const teardownRegistered = [...features.values()].every(feature => typeof feature.teardown === 'function');
    if (!teardownRegistered) {
      return { initialized: false, teardownRegistered: false };
    }

    for (const [name, feature] of features) {
      if (initialized.has(name)) continue;
      if (teardownOutstanding.has(name)) {
        throw new Error(`${name}:initialization-incomplete-cleanup-required`);
      }
      if (typeof context.isCancelled === 'function' && context.isCancelled()) {
        return { initialized: false, teardownRegistered: true, cancelled: true };
      }

      // Initialization can acquire resources before it rejects. Register the
      // cleanup duty first and retain it until that exact teardown succeeds.
      teardownOutstanding.add(name);
      if (typeof feature.initialize === 'function') await feature.initialize(context);
      initialized.add(name);

      if (typeof context.isCancelled === 'function' && context.isCancelled()) {
        return { initialized: false, teardownRegistered: true, cancelled: true };
      }
    }
    return {
      initialized: initialized.size === features.size,
      teardownRegistered: true
    };
  }

  async function teardown(context = {}) {
    const names = [...teardownOutstanding].reverse();
    const errors = [];
    for (const name of names) {
      const feature = features.get(name);
      try {
        if (!feature || typeof feature.teardown !== 'function') {
          throw new Error('teardown-unregistered');
        }
        await feature.teardown(context);
        initialized.delete(name);
        teardownOutstanding.delete(name);
      } catch (error) {
        errors.push(`${name}:${String(error && (error.message || error) || 'error')}`);
      }
    }
    if (errors.length) throw new Error(errors.join('; '));
  }

  function snapshot() {
    return [...features.keys()].map(name => ({
      name,
      initialized: initialized.has(name),
      teardownOutstanding: teardownOutstanding.has(name)
    }));
  }

  return { register, ensure, teardown, snapshot };
}

module.exports = { createFeatureRegistry };
