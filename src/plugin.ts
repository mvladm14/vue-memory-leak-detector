import type { App, Plugin } from "vue";
import { startMemoryLeakDetector } from "./detector.js";
import { trackingMixin } from "./instances.js";
import type { LeakDetectorOptions } from "./types.js";

const instrumented = new WeakSet<App>();

function install(app: App, options: Partial<LeakDetectorOptions>): void {
  if (!startMemoryLeakDetector(options)) return;
  if (instrumented.has(app)) return;
  instrumented.add(app);
  app.mixin(trackingMixin);
}

/**
 * The memory leak detector, as a Vue plugin. Install it before mounting:
 *
 * ```ts
 * createApp(App).use(MemoryLeakDetector).mount("#app");
 * ```
 *
 * Development only. In a production build `process.env.NODE_ENV` is
 * `"production"`, `install` does nothing, and the bundler drops the detector.
 */
export const MemoryLeakDetector: Plugin<[options?: Partial<LeakDetectorOptions>]> = {
  install(app, options = {}) {
    if (process.env.NODE_ENV !== "production") install(app, options);
  },
};
