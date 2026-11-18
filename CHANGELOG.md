# Changelog

## 0.1.0

First release. Development only, components only.

- Vue plugin (`app.use(MemoryLeakDetector)`) that tracks every stateful
  component through a global mixin and reports unmounted components still in
  memory after a major garbage collection.
- Vite plugin (`vue-memory-leak-detector/vite`) that pins each component's
  marker into its `<script setup>` scope, so closures that capture only refs
  are caught too. Dev server only; keeps template-only hot updates as
  re-renders.
- `window.__vueLeakDetector`: `report()`, `sweep()`, `forceGc()`,
  `configure()`, `subscribe()`.
