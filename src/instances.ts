// The Vue side of tracking: which instances to track and when they unmount.

import {
  getCurrentInstance,
  onUnmounted,
  type ComponentInternalInstance,
  type ComponentOptions,
} from "vue";
import { markUnmounted, trackInstance } from "./lifecycle.js";

/** Track `instance` (once) and watch for its unmount. Returns its marker. */
export function attach(instance: ComponentInternalInstance): object {
  const { marker, isNew } = trackInstance(instance);
  if (isNew) onUnmounted(() => markUnmounted(instance), instance);
  return marker;
}

/**
 * Track the component whose `setup()` is running. Called by the code the Vite
 * plugin adds to each `<script setup>`:
 *
 *     const __leakMarker = globalThis.__vueLeakDetector?.track(() => __leakMarker);
 *
 * The arrow is never called or kept. It only makes `__leakMarker` a variable
 * that a closure uses, which puts it in the scope every other closure of the
 * setup shares: any of them still alive keeps the marker alive.
 */
export function trackCurrentInstance(_pin?: () => unknown): object | undefined {
  const instance = getCurrentInstance();
  return instance ? attach(instance) : undefined;
}

/**
 * Added to the app with `app.mixin`, so every stateful component is tracked,
 * whatever API it is written with. `beforeCreate` runs right after `setup()`.
 */
export const trackingMixin: ComponentOptions = {
  beforeCreate() {
    attach(this.$);
  },
};
