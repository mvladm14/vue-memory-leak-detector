import { expect, test, type CDPSession, type Page } from "@playwright/test";
import type { LeakDetectorApi, LeakEvent } from "../src/index";

declare global {
  interface Window {
    __vueLeakDetector?: LeakDetectorApi;
    __leakTest?: { events: LeakEvent[] };
    __VUE_DEVTOOLS_HOOK_REPLAY__?: unknown[] | null;
  }
}

// `closureOnly`: the leak holds nothing but the setup scope (refs), so only
// the Vite plugin's marker can see it.
const PAIRS = [
  { id: "timer", leaky: "LeakyTimer", fixed: "FixedTimer", closureOnly: true },
  { id: "listener", leaky: "LeakyListener", fixed: "FixedListener", closureOnly: false },
  { id: "bus", leaky: "LeakyBus", fixed: "FixedBus", closureOnly: true },
  { id: "dom", leaky: "LeakyDom", fixed: "FixedDom", closureOnly: false },
];

async function open(page: Page): Promise<CDPSession> {
  await page.goto("/");
  await page.waitForFunction(() => !!window.__vueLeakDetector && !!window.__leakTest);
  // Without the Vue Devtools extension, Vue buffers devtools events — each
  // holding a component instance — for the first 3 s, then drops them. Leaks
  // only show once that buffer is gone (the default leakAgeMs is 10 s).
  await page.waitForFunction(() => window.__VUE_DEVTOOLS_HOOK_REPLAY__ === null, null, {
    timeout: 10_000,
  });
  // Unmounted components go stale after 0.5 s; report every leak, every sweep.
  await page.evaluate(() =>
    window.__vueLeakDetector!.configure({ leakAgeMs: 500, warnCooldownMs: 0 }),
  );
  return page.context().newCDPSession(page);
}

/**
 * What a user does by clicking "Collect garbage" in DevTools → Memory, a few
 * times, sweeping after each. Returns the events so far and a fresh report.
 */
async function collect(page: Page, cdp: CDPSession, rounds = 6) {
  for (let i = 0; i < rounds; i++) {
    await page.waitForTimeout(250);
    await cdp.send("HeapProfiler.collectGarbage");
    await page.evaluate(() => window.__vueLeakDetector!.sweep());
  }
  return page.evaluate(() => ({
    events: [...window.__leakTest!.events],
    report: window.__vueLeakDetector!.report(),
  }));
}

async function mountAndUnmount(page: Page, id: string) {
  const toggle = page.getByTestId(`toggle-${id}`);
  await toggle.click();
  await expect(page.getByTestId(id)).toBeVisible();
  await toggle.click();
  await expect(page.getByTestId(id)).toHaveCount(0);
}

test("tracks the running components with their names and files", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await open(page);
  const report = await page.evaluate(() => window.__vueLeakDetector!.report());
  const live = Object.fromEntries(report.map((r) => [r.component, r.live]));
  expect(live).toMatchObject({ App: 1, HomePage: 1, Card: 3, RouterView: 1, RouterLink: 2 });
  expect(report.find((r) => r.component === "Card")?.file).toBe("src/components/Card.vue");
  expect(errors).toEqual([]);
});

for (const pair of PAIRS) {
  test(`reports the leaky ${pair.id} and not the fixed one`, async ({ page }, testInfo) => {
    const seen = !pair.closureOnly || testInfo.project.name === "vite-plugin";
    const warnings: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "warning") warnings.push(msg.text());
    });
    const cdp = await open(page);

    await mountAndUnmount(page, `leaky-${pair.id}`);
    await mountAndUnmount(page, `fixed-${pair.id}`);

    let result = await collect(page, cdp);
    for (let i = 0; i < 3 && seen && !result.events.some((e) => e.component === pair.leaky); i++)
      result = await collect(page, cdp);

    const leak = result.events.find((e) => e.component === pair.leaky);
    if (seen) {
      expect(leak, `${pair.leaky} should be reported`).toMatchObject({
        stale: 1,
        file: `src/leaks/${pair.leaky}.vue`,
      });
      expect(
        warnings.some((w) => w.includes(`Suspected leak: ${pair.leaky} (src/leaks/${pair.leaky}.vue)`)),
      ).toBe(true);
    } else {
      // Without the Vite plugin nothing ties the leaked closure to the component.
      expect(leak, `${pair.leaky} needs the Vite plugin to be seen`).toBeUndefined();
    }
    expect(result.events.some((e) => e.component === pair.fixed), `${pair.fixed} must not be reported`).toBe(false);
    expect(result.report.some((r) => r.component === pair.fixed), `${pair.fixed} must be collected`).toBe(false);
  });
}

test("does not report pages the router unmounted", async ({ page }) => {
  const cdp = await open(page);
  for (let i = 0; i < 3; i++) {
    await page.getByTestId("nav-other").click();
    await expect(page.getByTestId("other-page")).toBeVisible();
    await page.getByTestId("nav-home").click();
    await expect(page.getByTestId("home-page")).toBeVisible();
  }
  const { events, report } = await collect(page, cdp, 10);
  expect(events).toEqual([]);
  const live = Object.fromEntries(report.map((r) => [r.component, r.live]));
  // Only what is on screen is left: the home page and its three cards.
  expect(live.OtherPage).toBeUndefined();
  expect(live.HomePage).toBe(1);
  expect(live.Card).toBe(3);
});

test("a leaked component's marker is in the heap snapshot under its name", async ({ page }) => {
  const cdp = await open(page);
  await mountAndUnmount(page, "leaky-listener");
  await mountAndUnmount(page, "fixed-listener");
  await collect(page, cdp, 3);

  const counts = await objectsByName(cdp, ["LeakyListener$Heap", "FixedListener$Heap"]);
  expect(counts).toEqual({ "LeakyListener$Heap": 1, "FixedListener$Heap": 0 });
});

/** How many objects of each class name a heap snapshot holds. */
async function objectsByName(cdp: CDPSession, names: string[]): Promise<Record<string, number>> {
  const chunks: string[] = [];
  const onChunk = ({ chunk }: { chunk: string }) => chunks.push(chunk);
  cdp.on("HeapProfiler.addHeapSnapshotChunk", onChunk);
  await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
  cdp.off("HeapProfiler.addHeapSnapshotChunk", onChunk);
  const { snapshot, nodes, strings } = JSON.parse(chunks.join("")) as {
    snapshot: { meta: { node_fields: string[]; node_types: [string[]] } };
    nodes: number[];
    strings: string[];
  };
  const fields = snapshot.meta.node_fields;
  const typeAt = fields.indexOf("type");
  const nameAt = fields.indexOf("name");
  const objectType = snapshot.meta.node_types[0].indexOf("object");
  const counts = Object.fromEntries(names.map((n) => [n, 0]));
  for (let i = 0; i < nodes.length; i += fields.length) {
    if (nodes[i + typeAt] !== objectType) continue;
    const name = strings[nodes[i + nameAt]!]!;
    if (name in counts) counts[name]! += 1;
  }
  return counts;
}
