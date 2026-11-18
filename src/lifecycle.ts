// Tracking of component instances: `trackInstance` when Vue sets one up,
// `markUnmounted` when Vue unmounts it.
//
// The detector doesn't watch the instance itself but a *marker*: a small
// object, one per instance, whose class is named after the component
// (`UserCard$Heap`) so a heap snapshot can be filtered by it. Two things hold
// the marker strongly:
//
// - the component instance (a non-enumerable `__leakMarker` property), so a
//   retained instance (a bound method or `this` captured by a listener, a
//   detached DOM element, a template ref kept somewhere) retains the marker;
// - with the Vite plugin, the scope of the component's `<script setup>`: every
//   closure created there keeps the marker alive, even one that captures only
//   refs and never the instance (a timer, a listener).
//
// The marker going away therefore means the instance and every closure of its
// setup are gone. Still here after a major collection, long after the unmount,
// means something holds one of them.

import { getStats, live, registerMarker } from "./store.js";
import type { LiveEntry } from "./types.js";
import { syncWitness } from "./witness.js";

/** Property of the component instance that holds its marker. */
export const MARKER_KEY = "__leakMarker";
const MARKER_SUFFIX = "$Heap";

/** What the detector reads from a Vue component instance. */
export type InstanceLike = { type: unknown };

type ComponentOptionsLike = {
  name?: unknown;
  __name?: unknown;
  __file?: unknown;
};

function optionsOf(type: unknown): ComponentOptionsLike {
  return type !== null && (typeof type === "object" || typeof type === "function")
    ? (type as ComponentOptionsLike)
    : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * The component's name: its `name` option (or `defineOptions({ name })`),
 * then the name `<script setup>` infers from the file (`__name`), then the
 * file name itself.
 */
export function componentNameOf(type: unknown): string {
  const options = optionsOf(type);
  const name = str(options.name) || str(options.__name);
  if (name) return name;
  const file = str(options.__file);
  const base = file.slice(file.lastIndexOf("/") + 1).replace(/\.\w+$/, "");
  return base || "Anonymous";
}

/**
 * The component's source file, from `src/` on when the path has one:
 * `/home/me/app/src/components/Card.vue` → `src/components/Card.vue`.
 * Set by `@vitejs/plugin-vue` (and vue-loader) in development.
 */
export function componentFileOf(type: unknown): string {
  const file = str(optionsOf(type).__file);
  const src = file.lastIndexOf("/src/");
  return src >= 0 ? file.slice(src + 1) : file;
}

export function markerName(componentName: string): string {
  return componentName + MARKER_SUFFIX;
}

const markerClasses = new Map<string, new () => object>();

function markerClassFor(componentName: string): new () => object {
  let ctor = markerClasses.get(componentName);
  if (!ctor) {
    const name = markerName(componentName);
    // A class created under a computed key takes the key as its name.
    ctor = { [name]: class {} }[name]!;
    markerClasses.set(componentName, ctor);
  }
  return ctor;
}

const entries = new WeakMap<InstanceLike, LiveEntry>();

/**
 * Start tracking `instance`, or return its marker if it is tracked already.
 * `isNew` tells the caller to hook the unmount.
 */
export function trackInstance(instance: InstanceLike): { marker: object; isNew: boolean } {
  const existing = (instance as Record<string, unknown>)[MARKER_KEY];
  if (typeof existing === "object" && existing !== null) return { marker: existing, isNew: false };

  const componentName = componentNameOf(instance.type);
  const file = componentFileOf(instance.type);
  const marker = new (markerClassFor(componentName))();
  Object.defineProperty(instance, MARKER_KEY, { value: marker });

  const now = Date.now();
  const entry: LiveEntry = {
    ref: new WeakRef(marker),
    componentName,
    file,
    createdAt: now,
    unmountedAt: null,
    witness: null,
  };
  entries.set(instance, entry);
  live.add(entry);
  registerMarker(marker, entry);

  const s = getStats(componentName);
  s.lastCreatedAt = now;
  if (!s.file) s.file = file;
  return { marker, isNew: true };
}

export function markUnmounted(instance: InstanceLike): void {
  const entry = entries.get(instance);
  if (!entry || entry.unmountedAt !== null) return;
  const now = Date.now();
  entry.unmountedAt = now;
  // With `leakAgeMs: 0` the instance is stale at once: give it its witness
  // now, so a collection before the next sweep counts.
  syncWitness(entry, now);
}
