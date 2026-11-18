// Shared types for the leak detector.

export type LiveEntry = {
  /**
   * The component's marker (lifecycle.ts). Held weakly: the detector must
   * never keep it alive. The component instance holds it strongly, and so
   * does every `<script setup>` closure when the Vite plugin is used.
   */
  ref: WeakRef<object>;
  componentName: string;
  /** Source file of the component, e.g. `src/components/UserCard.vue`, or `""`. */
  file: string;
  createdAt: number;
  /** When Vue unmounted the component, or `null` while it is mounted. */
  unmountedAt: number | null;
  /**
   * Set while the instance is stale (see witness.ts). Its object being gone
   * means a major collection has run since the instance went stale.
   */
  witness: Witness | null;
};

/** A released old-generation object, shared by the instances that went stale in one job. */
export type Witness = { ref: WeakRef<object> };

export type ComponentStats = {
  file: string;
  lastCreatedAt: number;
  lastWarnedAt: number;
};

export type LeakEvent = {
  /**
   * Component name, e.g. `UserCard`. Its marker is named `UserCard$Heap`:
   * the name to filter by in a heap snapshot.
   */
  component: string;
  /** Source file of the component, e.g. `src/components/UserCard.vue`, or `""`. */
  file: string;
  /**
   * Number of instances unmounted ≥ leakAgeMs ago that are still reachable
   * after a garbage collection that ran once they had been unmounted that long.
   */
  stale: number;
  /** Total reachable instances: mounted + recently unmounted + leaked. */
  live: number;
  /** Threshold (ms) used to classify an unmounted instance as stale. */
  leakAgeMs: number;
  /** Timestamp (ms since epoch) at which the event was fired. */
  at: number;
};

export type LeakListener = (event: LeakEvent) => void;

export type ReportRow = {
  component: string;
  file: string;
  /** Reachable instances, mounted or unmounted. */
  live: number;
  /** Unmounted ≥ leakAgeMs ago and still in memory after a garbage collection: leaked. */
  stale: number;
  /**
   * Unmounted ≥ leakAgeMs ago but no major garbage collection has run since:
   * they may just not have been collected yet, so they aren't reported.
   */
  awaitingGc: number;
  lastCreatedSecsAgo: number;
};

export type LeakDetectorOptions = {
  /** Console output (warnings, the install banner, `report()`'s table). Default `true`. */
  logging: boolean;
  /** How long an unmounted component may stay in memory before it is suspect. Default 10 000 ms. */
  leakAgeMs: number;
  /** Stale instances of one component needed before it is reported. Default 1. */
  suspectThreshold: number;
  /** How often leaks are checked. Default 2 000 ms. */
  sweepIntervalMs: number;
  /** Minimum time between two reports of the same component. Default 30 000 ms. */
  warnCooldownMs: number;
  /**
   * Components never reported, by name (`"UserCard"`) or pattern. Use it for
   * components something keeps on purpose, e.g. a cache.
   */
  exclude: ReadonlyArray<string | RegExp>;
};
