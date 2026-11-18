import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref, type ComponentPublicInstance } from "vue";
import { loadRuntime, type Runtime } from "./helpers";

const OptionsCard = defineComponent({
  name: "OptionsCard",
  render: () => h("p", "options"),
});

const markersFromTrack: object[] = [];

/** What a `<script setup>` component looks like once the Vite plugin ran. */
const SetupCard = defineComponent({
  __name: "SetupCard",
  __file: "/home/me/app/src/components/SetupCard.vue",
  setup() {
    const __leakMarker: object | undefined = globalThis.__vueLeakDetector?.track(
      () => __leakMarker,
    );
    if (__leakMarker) markersFromTrack.push(__leakMarker);
    return () => h("p", "setup");
  },
} as Parameters<typeof defineComponent>[0]);

function mountParent(mods: Runtime, options = {}) {
  const show = ref(true);
  const options1 = ref<ComponentPublicInstance | null>(null);
  const setup1 = ref<ComponentPublicInstance | null>(null);
  const Parent = defineComponent({
    name: "Parent",
    setup: () => () =>
      show.value
        ? [h(OptionsCard, { ref: options1 }), h(SetupCard, { ref: setup1 })]
        : [h("p", "empty")],
  });
  const app = createApp(Parent).use(mods.plugin.MemoryLeakDetector, options);
  app.mount(document.createElement("div"));
  return { app, show, options1, setup1 };
}

function liveByName(mods: Runtime) {
  return Object.fromEntries(mods.sweep.report().map((r) => [r.component, r.live]));
}

describe("MemoryLeakDetector plugin", () => {
  let mods: Runtime;

  beforeEach(async () => {
    mods = await loadRuntime();
    markersFromTrack.length = 0;
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "table").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("installs the global API and applies options", () => {
    mountParent(mods, { leakAgeMs: 1234 });
    expect(window.__vueLeakDetector).toBeDefined();
    expect(mods.config._config.leakAgeMs).toBe(1234);
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining("[vue-leak]"));
  });

  it("tracks every component, Options API and setup alike", () => {
    mountParent(mods);
    expect(liveByName(mods)).toEqual({ Parent: 1, OptionsCard: 1, SetupCard: 1 });
    const setupRow = mods.sweep.report().find((r) => r.component === "SetupCard");
    expect(setupRow?.file).toBe("src/components/SetupCard.vue");
  });

  it("hands <script setup> the same marker the instance holds", () => {
    const { setup1, options1 } = mountParent(mods);
    const marker = (setup1.value!.$ as unknown as Record<string, unknown>).__leakMarker;
    expect(markersFromTrack).toEqual([marker]);
    expect((marker as object).constructor.name).toBe("SetupCard$Heap");
    const optionsMarker = (options1.value!.$ as unknown as Record<string, unknown>).__leakMarker;
    expect((optionsMarker as object).constructor.name).toBe("OptionsCard$Heap");
  });

  it("marks components unmounted when Vue unmounts them", async () => {
    const { show } = mountParent(mods);
    const unmounted = () =>
      [...mods.store.live]
        .filter((e) => e.unmountedAt !== null)
        .map((e) => e.componentName)
        .sort();
    expect(unmounted()).toEqual([]);
    show.value = false;
    await nextTick();
    expect(unmounted()).toEqual(["OptionsCard", "SetupCard"]);
  });

  it("marks the whole tree unmounted with the app", () => {
    const { app } = mountParent(mods);
    app.unmount();
    expect([...mods.store.live].every((e) => e.unmountedAt !== null)).toBe(true);
  });

  it("adds the mixin once per app, and shares one detector between apps", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { app } = mountParent(mods);
    // Vue warns about a second use() and skips it; a direct install() reaches
    // the plugin, which must not add its mixin again.
    mods.plugin.MemoryLeakDetector.install!(app);
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("Mixin has already been applied"));
    const api = window.__vueLeakDetector;
    mountParent(mods);
    expect(window.__vueLeakDetector).toBe(api);
    expect(liveByName(mods)).toEqual({ Parent: 2, OptionsCard: 2, SetupCard: 2 });
  });

  it("does nothing in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    mountParent(mods);
    expect(window.__vueLeakDetector).toBeUndefined();
    expect(mods.store.live.size).toBe(0);
    expect(markersFromTrack).toEqual([]);
  });
});
