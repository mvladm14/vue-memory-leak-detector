// Module-level state.
//
// - `live`    : every tracked entry whose marker is still reachable.
// - `stats`   : per-component-name info (file, last-created time, last-warn time).
// - `registry`: when a marker is collected, drop its entry from `live`.

import type { ComponentStats, LiveEntry } from "./types.js";

export const live = new Set<LiveEntry>();
export const stats = new Map<string, ComponentStats>();

/** Created on first use: nothing here runs at module load. */
let registry: FinalizationRegistry<LiveEntry> | null = null;

export function registerMarker(marker: object, entry: LiveEntry): void {
  registry ??= new FinalizationRegistry<LiveEntry>((collected) => {
    live.delete(collected);
  });
  registry.register(marker, entry);
}

export function getStats(name: string): ComponentStats {
  let s = stats.get(name);
  if (!s) {
    s = { file: "", lastCreatedAt: 0, lastWarnedAt: 0 };
    stats.set(name, s);
  }
  return s;
}
