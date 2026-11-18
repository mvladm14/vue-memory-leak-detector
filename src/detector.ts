// Starts the detector: `window.__vueLeakDetector` and the sweep loop. Called
// by the Vue plugin (plugin.ts), which also adds the tracking mixin.

import { _config, configure, onSweepIntervalChange } from "./config.js";
import { trackCurrentInstance } from "./instances.js";
import { subscribe } from "./subscribers.js";
import { forceGc, report, sweep } from "./sweep.js";
import type { LeakDetectorOptions, LeakListener, ReportRow } from "./types.js";
import { startWitnesses } from "./witness.js";

export type LeakDetectorApi = {
  /** Print (and return) a table of tracked components. */
  report(): ReportRow[];
  /** Check for leaks now instead of waiting for the next sweep. */
  sweep(): void;
  /** `window.gc()` (needs `--js-flags="--expose-gc"`), then sweep. */
  forceGc(): void;
  /** Change options while the app runs. */
  configure(options: Partial<LeakDetectorOptions>): void;
  /** Listen for leaks. Returns an unsubscribe function. */
  subscribe(listener: LeakListener): () => void;
  /**
   * Track the component whose `setup()` is running and return its marker.
   * Called by the code the Vite plugin adds to `<script setup>`; not meant to
   * be called by hand.
   */
  track(pin?: () => unknown): object | undefined;
};

declare global {
  interface Window {
    __vueLeakDetector?: LeakDetectorApi;
  }
  // The Vite plugin's code reads it through `globalThis`.
  // eslint-disable-next-line no-var
  var __vueLeakDetector: LeakDetectorApi | undefined;
}

const api: LeakDetectorApi = {
  report,
  sweep,
  forceGc,
  configure,
  subscribe,
  track: trackCurrentInstance,
};

let intervalId: ReturnType<typeof setInterval> | null = null;

function startSweepLoop(): void {
  if (intervalId !== null) return;
  intervalId = setInterval(() => {
    if (document.visibilityState === "visible") sweep();
  }, _config.sweepIntervalMs);
}

function restartSweepLoop(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  startSweepLoop();
}

/**
 * Start the detector. Safe to call more than once: later calls only apply
 * `options`. Returns `null` (and does nothing) on the server and in browsers
 * without WeakRef / FinalizationRegistry.
 */
export function startMemoryLeakDetector(
  options: Partial<LeakDetectorOptions> = {},
): LeakDetectorApi | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  if (typeof WeakRef !== "function" || typeof FinalizationRegistry !== "function") return null;

  const existing = window.__vueLeakDetector;
  if (existing) {
    existing.configure(options);
    return existing;
  }

  window.__vueLeakDetector = api;
  configure(options);
  // `configure({ sweepIntervalMs })` restarts the loop with the new cadence.
  onSweepIntervalChange(restartSweepLoop);
  startSweepLoop();
  startWitnesses();

  if (_config.logging) {
    // eslint-disable-next-line no-console
    console.info(
      "[vue-leak] Memory leak detector running. Run window.__vueLeakDetector.report() for a live table.",
    );
  }
  return api;
}
