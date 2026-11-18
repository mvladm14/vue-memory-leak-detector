import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LeakEvent } from "../src/types";
import { collected, loadRuntime, simulateGc, type Runtime } from "./helpers";

function fakeInstance(name: string, file = "") {
  return { type: { __name: name, __file: file } };
}

function unmountedLongAgo(mods: Runtime, name: string, file = "/app/src/X.vue") {
  const instance = fakeInstance(name, file);
  const { marker } = mods.lifecycle.trackInstance(instance);
  mods.lifecycle.markUnmounted(instance);
  const entry = [...mods.store.live].find((e) => e.ref.deref() === marker)!;
  entry.unmountedAt = Date.now() - 1_000_000;
  return { instance, marker, entry };
}

describe("sweep", () => {
  let mods: Runtime;

  beforeEach(async () => {
    mods = await loadRuntime();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "table").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not report a component that is still mounted", () => {
    const listener = vi.fn();
    mods.subscribers.subscribe(listener);
    const instance = fakeInstance("Card", "/app/src/Card.vue");
    mods.lifecycle.trackInstance(instance);
    simulateGc(mods);
    mods.sweep.sweep();
    expect(listener).not.toHaveBeenCalled();
    expect(mods.sweep.report()[0]).toMatchObject({
      component: "Card",
      file: "src/Card.vue",
      live: 1,
      stale: 0,
    });
  });

  it("does not report an unmounted component before a garbage collection ran", () => {
    const listener = vi.fn();
    mods.subscribers.subscribe(listener);
    const { instance, entry } = unmountedLongAgo(mods, "Card");
    mods.witness.syncWitness(entry, Date.now());
    mods.sweep.sweep();
    expect(listener).not.toHaveBeenCalled();
    expect(mods.sweep.report()[0]).toMatchObject({ stale: 0, awaitingGc: 1 });
    expect(instance).toBeTruthy();
  });

  it("reports an unmounted component still in memory after a garbage collection", () => {
    const events: LeakEvent[] = [];
    mods.subscribers.subscribe((e) => events.push(e));
    const { instance, entry } = unmountedLongAgo(mods, "Card", "/app/src/components/Card.vue");
    mods.witness.syncWitness(entry, Date.now());
    simulateGc(mods);
    mods.sweep.sweep();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      component: "Card",
      file: "src/components/Card.vue",
      stale: 1,
      live: 1,
    });
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("Suspected leak: Card (src/components/Card.vue)"),
    );
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('filter for "Card$Heap"'));
    expect(instance).toBeTruthy();
  });

  it("does not count a collection that ran before the component went stale", () => {
    const listener = vi.fn();
    mods.subscribers.subscribe(listener);
    const instance = fakeInstance("Card");
    const { marker } = mods.lifecycle.trackInstance(instance);
    const entry = [...mods.store.live].find((e) => e.ref.deref() === marker)!;
    mods.lifecycle.markUnmounted(instance); // unmounted now: not over age yet
    mods.sweep.sweep(); // no witness while young
    simulateGc(mods); // a collection while it was young
    entry.unmountedAt = Date.now() - 1_000_000; // now it is old
    mods.sweep.sweep();
    expect(listener).not.toHaveBeenCalled();
    simulateGc(mods);
    mods.sweep.sweep();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("re-reports a leak once the cooldown has passed", () => {
    const listener = vi.fn();
    mods.subscribers.subscribe(listener);
    const { entry } = unmountedLongAgo(mods, "Card");
    mods.witness.syncWitness(entry, Date.now());
    simulateGc(mods);
    mods.sweep.sweep();
    mods.sweep.sweep();
    expect(listener).toHaveBeenCalledTimes(1);
    mods.store.getStats("Card").lastWarnedAt -= mods.config._config.warnCooldownMs + 1;
    mods.sweep.sweep();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("waits for suspectThreshold stale instances", () => {
    const listener = vi.fn();
    mods.subscribers.subscribe(listener);
    mods.config.configure({ suspectThreshold: 2 });
    const first = unmountedLongAgo(mods, "Card");
    mods.witness.syncWitness(first.entry, Date.now());
    simulateGc(mods);
    mods.sweep.sweep();
    expect(listener).not.toHaveBeenCalled();
    const second = unmountedLongAgo(mods, "Card");
    mods.witness.syncWitness(second.entry, Date.now());
    simulateGc(mods);
    mods.sweep.sweep();
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ stale: 2 }));
  });

  it("never reports excluded components", () => {
    const listener = vi.fn();
    mods.subscribers.subscribe(listener);
    mods.config.configure({ exclude: ["CachedPanel", /^Kept/] });
    for (const name of ["CachedPanel", "KeptList"]) {
      const { entry } = unmountedLongAgo(mods, name);
      mods.witness.syncWitness(entry, Date.now());
    }
    simulateGc(mods);
    mods.sweep.sweep();
    expect(listener).not.toHaveBeenCalled();
    expect(mods.sweep.report()).toEqual([]);
  });

  it("drops entries whose marker was collected", () => {
    const { entry } = unmountedLongAgo(mods, "Card");
    entry.ref = collected;
    expect(mods.sweep.report()).toEqual([]);
    expect(mods.store.live.size).toBe(0);
  });

  it("keeps a listener that throws from stopping the others", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const second = vi.fn();
    mods.subscribers.subscribe(() => {
      throw new Error("boom");
    });
    mods.subscribers.subscribe(second);
    const { entry } = unmountedLongAgo(mods, "Card");
    mods.witness.syncWitness(entry, Date.now());
    simulateGc(mods);
    mods.sweep.sweep();
    expect(second).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalled();
  });

  it("waits for a seasoned witness right after load", async () => {
    mods = await loadRuntime({ seasoned: false });
    const listener = vi.fn();
    mods.subscribers.subscribe(listener);
    const { entry } = unmountedLongAgo(mods, "Card");
    mods.witness.syncWitness(entry, Date.now());
    expect(entry.witness).toBeNull();
    // Collections season the stock; the first ones prove nothing.
    simulateGc(mods);
    mods.sweep.sweep();
    expect(listener).not.toHaveBeenCalled();
    simulateGc(mods);
    expect(entry.witness).not.toBeNull();
    simulateGc(mods);
    mods.sweep.sweep();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("lifecycle", () => {
  it("names components by name option, then __name, then file", async () => {
    const { lifecycle } = await loadRuntime();
    expect(lifecycle.componentNameOf({ name: "Explicit", __name: "Inferred" })).toBe("Explicit");
    expect(lifecycle.componentNameOf({ __name: "Inferred", __file: "/a/Other.vue" })).toBe(
      "Inferred",
    );
    expect(lifecycle.componentNameOf({ __file: "/a/src/OptionsCard.vue" })).toBe("OptionsCard");
    expect(lifecycle.componentNameOf({})).toBe("Anonymous");
    expect(lifecycle.componentNameOf(undefined)).toBe("Anonymous");
  });

  it("shortens the file to its path from src/", async () => {
    const { lifecycle } = await loadRuntime();
    expect(lifecycle.componentFileOf({ __file: "/home/me/app/src/components/Card.vue" })).toBe(
      "src/components/Card.vue",
    );
    expect(lifecycle.componentFileOf({ __file: "/elsewhere/Card.vue" })).toBe("/elsewhere/Card.vue");
    expect(lifecycle.componentFileOf({})).toBe("");
  });

  it("gives each instance one marker, named after its component, held by the instance", async () => {
    const { lifecycle, store } = await loadRuntime();
    const instance = fakeInstance("UserCard");
    const first = lifecycle.trackInstance(instance);
    const again = lifecycle.trackInstance(instance);
    expect(first.isNew).toBe(true);
    expect(again).toEqual({ marker: first.marker, isNew: false });
    expect(first.marker.constructor.name).toBe("UserCard$Heap");
    expect((instance as Record<string, unknown>)[lifecycle.MARKER_KEY]).toBe(first.marker);
    expect(Object.keys(instance)).toEqual(["type"]); // non-enumerable
    expect(store.live.size).toBe(1);
  });

  it("records the first unmount only", async () => {
    const { lifecycle, store } = await loadRuntime();
    const instance = fakeInstance("Card");
    lifecycle.trackInstance(instance);
    const [entry] = [...store.live];
    lifecycle.markUnmounted(instance);
    const at = entry!.unmountedAt;
    expect(at).not.toBeNull();
    entry!.unmountedAt = 1;
    lifecycle.markUnmounted(instance);
    expect(entry!.unmountedAt).toBe(1);
    lifecycle.markUnmounted(fakeInstance("Untracked")); // no-op
  });
});
