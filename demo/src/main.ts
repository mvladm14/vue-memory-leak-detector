import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import { MemoryLeakDetector, type LeakEvent } from "vue-memory-leak-detector";
import App from "./App.vue";
import HomePage from "./pages/HomePage.vue";
import OtherPage from "./pages/OtherPage.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", component: HomePage },
    { path: "/other", component: OtherPage },
  ],
});

createApp(App).use(MemoryLeakDetector).use(router).mount("#app");

// For the e2e tests (e2e/leak.spec.ts).
const events: LeakEvent[] = [];
window.__vueLeakDetector?.subscribe((event) => events.push(event));
(window as unknown as { __leakTest: object }).__leakTest = { events };
