// Pub/sub for leak events. Listeners fire from the sweep loop with the same
// gating as the console warning: `suspectThreshold` and `warnCooldownMs`.

import { _config } from "./config.js";
import type { LeakEvent, LeakListener } from "./types.js";

const listeners = new Set<LeakListener>();

export function subscribe(listener: LeakListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function hasListeners(): boolean {
  return listeners.size > 0;
}

export function emitLeak(event: LeakEvent): void {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch (err) {
      if (_config.logging) {
        // eslint-disable-next-line no-console
        console.error("[vue-leak] listener threw:", err);
      }
    }
  });
}
