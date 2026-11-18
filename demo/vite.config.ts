import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import vueLeakDetector from "vue-memory-leak-detector/vite";

// `npm run dev:runtime-only` leaves the Vite plugin out, to show what the Vue
// plugin alone sees: leaks that hold the component instance, not closures
// that capture only refs.
export default defineConfig({
  plugins: [vue(), process.env.LEAK_PLUGIN === "off" ? null : vueLeakDetector()],
});
