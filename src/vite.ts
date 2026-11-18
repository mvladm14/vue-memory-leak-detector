// Vite plugin: pins each `<script setup>` component's marker into its setup
// scope, so a closure that outlives the component keeps the marker alive and
// the leak is reported. Development server only.
//
// Without it the detector still sees every component through the Vue plugin,
// but only leaks that hold the instance itself: a `<script setup>` timer or
// listener that captures nothing but refs would go unnoticed.
//
// The plugin runs before `@vitejs/plugin-vue` and adds one statement at the
// very start of the `<script setup>` block, on the line of the opening tag so
// line numbers don't move:
//
//     <script setup>const __leakMarker = globalThis.__vueLeakDetector?.track(() => __leakMarker);
//
// It imports nothing: when the Vue plugin isn't installed it does nothing.

import MagicString from "magic-string";
import type { Plugin } from "vite";
import { parse } from "vue/compiler-sfc";

export type VueLeakDetectorPluginOptions = {
  /** Files to instrument. Default: `.vue` files. */
  include?: RegExp;
  /** Files to leave alone. Default: anything in `node_modules`. */
  exclude?: RegExp;
};

export const INJECTED =
  "const __leakMarker = globalThis.__vueLeakDetector?.track(() => __leakMarker);";

/**
 * Add the marker statement to the `<script setup>` block of an SFC. Returns
 * `null` when there is nothing to instrument.
 */
export function instrumentSfc(
  code: string,
  filename: string,
): { code: string; map: ReturnType<MagicString["generateMap"]> } | null {
  if (!code.includes("setup") || code.includes(INJECTED)) return null;
  const { descriptor, errors } = parse(code, { filename, sourceMap: false });
  const block = descriptor.scriptSetup;
  if (errors.length > 0 || !block || block.src) return null;

  const s = new MagicString(code);
  s.appendLeft(block.loc.start.offset, INJECTED);
  return {
    code: s.toString(),
    map: s.generateMap({ source: filename, includeContent: true, hires: "boundary" }),
  };
}

export default function vueLeakDetector(options: VueLeakDetectorPluginOptions = {}): Plugin {
  const include = options.include ?? /\.vue$/;
  const exclude = options.exclude ?? /[\\/]node_modules[\\/]/;
  const matches = (file: string) => include.test(file) && !exclude.test(file);

  return {
    name: "vue-memory-leak-detector",
    enforce: "pre",
    apply: "serve",

    transform(code, id, transformOptions) {
      // Only the SFC's main module: its blocks are requested with a `?vue&type=` query.
      if (transformOptions?.ssr || id.includes("?") || !matches(id)) return null;
      return instrumentSfc(code, id);
    },

    // On a hot update @vitejs/plugin-vue reads the file again and compares it
    // with what it compiled before. Hand it the instrumented source too, or it
    // would see a changed script on every edit and remount the component
    // where a template edit only needs a re-render.
    handleHotUpdate(ctx) {
      if (!matches(ctx.file)) return;
      const read = ctx.read;
      ctx.read = async () => {
        const code = await read();
        return instrumentSfc(code, ctx.file)?.code ?? code;
      };
    },
  };
}
