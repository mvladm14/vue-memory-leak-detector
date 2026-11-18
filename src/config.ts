// Runtime configuration. Mutable so that `configure()` can hot-update behavior
// (logging, thresholds, sweep cadence) while the app runs.

import type { LeakDetectorOptions } from "./types.js";

export const _config: LeakDetectorOptions = {
  logging: true,
  leakAgeMs: 10_000,
  suspectThreshold: 1,
  sweepIntervalMs: 2_000,
  warnCooldownMs: 30_000,
  exclude: [],
};

const intervalChangeListeners = new Set<() => void>();

/**
 * Register a callback that fires when `configure()` changes `sweepIntervalMs`.
 * Used by the sweep loop to restart itself with the new cadence.
 */
export function onSweepIntervalChange(cb: () => void): void {
  intervalChangeListeners.add(cb);
}

export function configure(options: Partial<LeakDetectorOptions> = {}): void {
  const oldInterval = _config.sweepIntervalMs;
  Object.assign(_config, options);
  if (options.sweepIntervalMs && options.sweepIntervalMs !== oldInterval) {
    intervalChangeListeners.forEach((cb) => cb());
  }
}

export function isExcluded(name: string): boolean {
  return _config.exclude.some((rule) =>
    typeof rule === "string" ? rule === name : rule.test(name),
  );
}
