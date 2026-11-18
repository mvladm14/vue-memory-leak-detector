import { describe, expect, it } from "vitest";
import { compileScript, parse } from "vue/compiler-sfc";
import vueLeakDetector, { INJECTED, instrumentSfc } from "../src/vite";

const SFC = `<template><p>{{ n }}</p></template>

<script setup lang="ts">
import { ref } from "vue";
const props = defineProps<{ step: number }>();
const n = ref(0);
setInterval(() => (n.value += props.step), 1000);
</script>
`;

type Hook = (...args: unknown[]) => unknown;
const plugin = vueLeakDetector();
const transform = (code: string, id: string, ssr = false) =>
  (plugin.transform as Hook).call({}, code, id, { ssr });

describe("instrumentSfc", () => {
  it("adds the marker on the line of <script setup>", () => {
    const out = instrumentSfc(SFC, "/app/src/Counter.vue")!;
    const lines = out.code.split("\n");
    expect(lines).toHaveLength(SFC.split("\n").length);
    expect(lines[2]).toBe(`<script setup lang="ts">${INJECTED}`);
    expect(out.map.mappings).not.toBe("");
  });

  it("keeps the marker inside setup(), where the component's closures share it", () => {
    const out = instrumentSfc(SFC, "/app/src/Counter.vue")!;
    const { descriptor } = parse(out.code, { filename: "/app/src/Counter.vue" });
    const { content } = compileScript(descriptor, { id: "counter", inlineTemplate: false });
    const setupStart = content.indexOf("setup(__props");
    const marker = content.indexOf("const __leakMarker = globalThis.__vueLeakDetector?.track(");
    const userCode = content.indexOf("const n = ref(0)");
    expect(setupStart).toBeGreaterThan(-1);
    expect(marker).toBeGreaterThan(setupStart);
    expect(marker).toBeLessThan(userCode);
  });

  it("works with a plain <script> next to <script setup>", () => {
    const sfc = `<script>export default { inheritAttrs: false };</script>\n<script setup>\nconst a = 1;\n</script>`;
    const out = instrumentSfc(sfc, "/app/src/Both.vue")!;
    expect(out.code).toContain(`<script setup>${INJECTED}\nconst a = 1;`);
    expect(out.code).toContain("<script>export default { inheritAttrs: false };</script>");
  });

  it("leaves SFCs without <script setup> alone", () => {
    expect(instrumentSfc(`<script>export default { setup() {} };</script>`, "/a.vue")).toBeNull();
    expect(instrumentSfc(`<template><p>setup</p></template>`, "/a.vue")).toBeNull();
    expect(instrumentSfc(`<script setup src="./a.ts"></script>`, "/a.vue")).toBeNull();
  });

  it("does not instrument twice", () => {
    const once = instrumentSfc(SFC, "/a.vue")!.code;
    expect(instrumentSfc(once, "/a.vue")).toBeNull();
  });
});

describe("vite plugin", () => {
  it("runs before @vitejs/plugin-vue, on the dev server only", () => {
    expect(plugin.enforce).toBe("pre");
    expect(plugin.apply).toBe("serve");
  });

  it("transforms the SFC's main module only", () => {
    expect(transform(SFC, "/app/src/Counter.vue")).not.toBeNull();
    expect(transform(SFC, "/app/src/Counter.vue?vue&type=style&index=0&lang.css")).toBeNull();
    expect(transform(SFC, "/app/node_modules/lib/Counter.vue")).toBeNull();
    expect(transform(SFC, "/app/src/Counter.vue", true)).toBeNull();
    expect(transform("const setup = 1", "/app/src/main.ts")).toBeNull();
  });

  it("honours include and exclude", () => {
    const custom = vueLeakDetector({ include: /\.vue$/, exclude: /Legacy/ });
    const run = (id: string) => (custom.transform as Hook).call({}, SFC, id, {});
    expect(run("/app/src/LegacyCard.vue")).toBeNull();
    expect(run("/app/src/Card.vue")).not.toBeNull();
  });

  it("hands plugin-vue the instrumented source on hot updates", async () => {
    const ctx = { file: "/app/src/Counter.vue", read: async () => SFC };
    (plugin.handleHotUpdate as Hook).call({}, ctx);
    expect(await ctx.read()).toBe(instrumentSfc(SFC, ctx.file)!.code);

    const other = { file: "/app/src/main.ts", read: async () => "x" };
    const original = other.read;
    (plugin.handleHotUpdate as Hook).call({}, other);
    expect(other.read).toBe(original);
  });
});
