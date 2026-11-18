# vue-memory-leak-detector

Spot Vue 3 memory leaks while you develop. When an unmounted component is
still held in memory (by a timer, an event listener, a store subscription, a
detached DOM element or a closure), you get a **console warning** with the
component's name and file.

```
[vue-leak] Suspected leak: UserCard (src/components/UserCard.vue) — 1 instance(s) unmounted >10s ago still retained after garbage collection (live 1 total). Take a heap snapshot and filter for "UserCard$Heap" to see what holds it.
```

**Development only.** The Vite plugin runs on the dev server only, and in a
production build the Vue plugin's `install()` is empty, so the bundler drops the
detector.

**Components only.** Every stateful component is tracked, whatever API it is
written with. Composables, stores and directives are not tracked yet.

## Setup

```bash
npm install --save-dev vue-memory-leak-detector
```

Install the Vue plugin before mounting (`main.ts`):

```ts
import { createApp } from "vue";
import { MemoryLeakDetector } from "vue-memory-leak-detector";
import App from "./App.vue";

createApp(App).use(MemoryLeakDetector).mount("#app");
```

Then add the Vite plugin (`vite.config.ts`). It's optional, but without it
leaks that hold only a `<script setup>` closure go unnoticed (see below):

```ts
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import vueLeakDetector from "vue-memory-leak-detector/vite";

export default defineConfig({
  plugins: [vue(), vueLeakDetector()],
});
```

Run `vite`, then use the app. The console shows
`[vue-leak] Memory leak detector running` once the app has started.

### What each plugin sees

| Leak | Vue plugin alone | With the Vite plugin |
| --- | --- | --- |
| Options API: `window.addEventListener("resize", this.onResize)` never removed | ✔ | ✔ |
| Detached DOM: a component's element kept in an array | ✔ | ✔ |
| Anything that keeps `this`, `emit`, `getCurrentInstance()` or a template ref | ✔ | ✔ |
| `<script setup>`: `setInterval(() => count.value++)` never cleared | — | ✔ |
| `<script setup>`: `bus.on((m) => (last.value = m))` never undone | — | ✔ |

The Vue plugin watches each component *instance*. A `<script setup>` closure
that captures only refs never points at the instance, so the Vite plugin adds
one line at the start of each `<script setup>` that ties the component's marker
to the setup scope every closure there shares.

## When leaks are reported

An unmounted component that is still in memory is not necessarily leaked: the
browser may not have collected garbage since. So the detector waits until the
component has been unmounted for `leakAgeMs` (10 s), and then for the browser's
next *major* garbage collection. It reports the component only if that
collection didn't free it. Minor collections don't count, because in Chrome a
removed listener or cleared timer can keep a correctly cleaned-up component
alive until the next major collection.

Browsers run major collections on their own schedule, so warnings can come
later than `leakAgeMs`. To get a verdict right away, click **Collect garbage**
(the trash-can icon) in Chrome DevTools → **Memory**. One click judges every
component unmounted before it.

Components waiting for that collection show up as **awaitingGc** in
`window.__vueLeakDetector.report()`.

Components kept alive by `<KeepAlive>` are deactivated, not unmounted, so they
are never reported while they are cached.

## Finding the cause

The warning tells you *what* leaked. A heap snapshot tells you *why*. In
Chrome DevTools → **Memory**, take a heap snapshot, type the marker name from
the warning (`UserCard$Heap`) in the **Class filter**, select the object, and
read its **Retainers** from the bottom up:

- `__leakMarker in Object` → the component instance is retained. Follow it to
  a bound method, a listener, a detached element (`__vueParentComponent`).
- `context` of a function → a closure from the component's `<script setup>`
  is retained. The next retainers show what holds that closure: a timer, a
  listener, a module-level array or Set.

## Options

Pass options to the Vue plugin, or change them later with
`window.__vueLeakDetector.configure()`:

```ts
app.use(MemoryLeakDetector, { leakAgeMs: 5_000, exclude: ["CachedPanel", /^Kept/] });
```

| Option | Default | |
| --- | --- | --- |
| `leakAgeMs` | `10000` | How long an unmounted component may stay in memory before it is suspect. Keep it above 3 s: see below. |
| `suspectThreshold` | `1` | Stale instances of one component needed before it is reported. |
| `sweepIntervalMs` | `2000` | How often leaks are checked. |
| `warnCooldownMs` | `30000` | Minimum time between two reports of the same component. |
| `exclude` | `[]` | Components never reported, by name or pattern. Use it for components something keeps on purpose. |
| `logging` | `true` | Console output. Events still fire when it's off. |

When the Vue Devtools extension is not installed, Vue keeps a buffer of
devtools events, each holding a component instance, for the first 3 seconds
after the page loads. Components unmounted in that window stay in memory until
it closes, so a `leakAgeMs` below 3 s can report them.

The Vite plugin takes `include` (default `/\.vue$/`) and `exclude` (default
`node_modules`) patterns for the files it instruments.

## API

In the browser console, or from your code in development:

```ts
window.__vueLeakDetector.report();     // print and return a table of tracked components
window.__vueLeakDetector.sweep();      // check for leaks now
window.__vueLeakDetector.forceGc();    // window.gc() (needs --js-flags="--expose-gc"), then sweep
window.__vueLeakDetector.configure({ leakAgeMs: 5_000 });

const unsubscribe = window.__vueLeakDetector.subscribe((event) => {
  // { component, file, stale, live, leakAgeMs, at }
});
```

`window.__vueLeakDetector` is `undefined` in production builds, so use
`window.__vueLeakDetector?.` in code that ships.

## How it works

1. **Tracking components.** The Vue plugin adds a global mixin whose
   `beforeCreate` hook runs for every stateful component, Options API or
   Composition API. It gives the instance a *marker*: a small object whose
   class is named after the component (`UserCard$Heap`), held by the instance
   in a non-enumerable `__leakMarker` property. An `onUnmounted` hook records
   when the component is unmounted.
2. **Pinning the marker to `<script setup>`.** Before `@vitejs/plugin-vue`
   compiles a `.vue` file, the Vite plugin adds this to the start of its
   `<script setup>`, on the line of the opening tag so line numbers don't move:

   ```js
   const __leakMarker = globalThis.__vueLeakDetector?.track(() => __leakMarker);
   ```

   `track()` returns the instance's marker. Because a closure uses
   `__leakMarker`, JavaScript keeps it in the scope that every closure created
   in that setup shares, so any of those closures outliving the component keeps
   the marker alive. The arrow itself is never called or kept.
3. **Never holding what it watches.** The detector holds each marker in a
   `WeakRef` and a `FinalizationRegistry` only. The marker going away means the
   instance and every closure of its setup are gone.
4. **The verdict.** When components have been unmounted for `leakAgeMs`, the
   detector releases a *witness*: an object it has held long enough to be in
   the old generation, which only a major garbage collection frees. Witness
   gone but marker still reachable means a major collection ran and something
   kept the component, so the detector warns and emits an event.

## Compatibility

- Vue 3.3 or later. The end-to-end suite runs on Vue 3.5 with Vite 8 and
  vue-router 4.
- The Vue plugin needs the Options API, which Vue enables by default. With
  `__VUE_OPTIONS_API__: false` only `<script setup>` components instrumented by
  the Vite plugin are tracked.
- The Vite plugin works with Vite 5 or later and `@vitejs/plugin-vue`. Other
  setups (Nuxt, vue-loader) get the Vue plugin's tracking only.
- A browser with `WeakRef` and `FinalizationRegistry` (all current browsers).
  The suite runs in Chromium.
- Does nothing during server-side rendering.

## Development

Needs Node 22.12+ (see `.nvmrc`).

```bash
npm install
npm test             # unit tests (Vitest)
npm run typecheck
npm run build
```

End-to-end tests run the app in [`demo/`](demo/) in headless Chromium, twice:
with the Vite plugin, and with the Vue plugin alone. They cover each leak
pattern next to its fixed version, router navigation, and heap-snapshot names:

```bash
npm run demo:install # build, pack and install the detector into demo/
npx playwright install chromium
npm run e2e
npm run bundle:check # the production build of the demo has no detector code
```

To try it by hand, run `npm run demo`, open http://localhost:5173, toggle the
leaky components on and off, then click **Collect garbage** in DevTools →
Memory.

## License

MIT
