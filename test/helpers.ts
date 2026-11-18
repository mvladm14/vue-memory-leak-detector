// Re-loads the runtime modules with fresh state for each test. The modules
// hold module-level singletons (the live set, listeners, config), so every
// test gets its own copies while the cross-module references stay shared.

import { vi } from "vitest";

export type Runtime = {
  config: typeof import("../src/config");
  store: typeof import("../src/store");
  subscribers: typeof import("../src/subscribers");
  lifecycle: typeof import("../src/lifecycle");
  sweep: typeof import("../src/sweep");
  witness: typeof import("../src/witness");
  detector: typeof import("../src/detector");
  plugin: typeof import("../src/plugin");
};

export async function loadRuntime({ seasoned = true } = {}): Promise<Runtime> {
  vi.resetModules();
  delete window.__vueLeakDetector;
  const mods: Runtime = {
    config: await import("../src/config"),
    store: await import("../src/store"),
    subscribers: await import("../src/subscribers"),
    lifecycle: await import("../src/lifecycle"),
    sweep: await import("../src/sweep"),
    witness: await import("../src/witness"),
    detector: await import("../src/detector"),
    plugin: await import("../src/plugin"),
  };
  // A page that has been running for a while: the whole witness stock has
  // been held through enough collections (src/witness.ts).
  mods.witness.startWitnesses();
  if (seasoned) for (let i = 0; i < 3; i++) mods.witness.noteGc();
  return mods;
}

/** A WeakRef whose target has been collected. */
export const collected = { deref: () => undefined } as unknown as WeakRef<object>;

/**
 * Stand-in for one major garbage collection: every released witness is
 * collected, then the collection is counted. Tracked markers are left alone,
 * as if each one were still referenced — the leak a real collection would
 * expose.
 */
export function simulateGc(mods: Runtime): void {
  mods.store.live.forEach((entry) => {
    if (entry.witness) entry.witness.ref = collected;
  });
  mods.witness.noteGc();
}
