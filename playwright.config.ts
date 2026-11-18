import { defineConfig, devices } from "@playwright/test";

// The demo app (demo/) served twice: with the Vite plugin, and with the Vue
// plugin alone. Run `npm run demo:install` first.
const servers = [
  { name: "vite-plugin", script: "dev", port: 5300 },
  { name: "runtime-only", script: "dev:runtime-only", port: 5301 },
];

export default defineConfig({
  testDir: "./e2e",
  // Garbage collection takes a few rounds; give each spec room to poll.
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: { trace: "retain-on-failure" },
  // No --expose-gc: collections are triggered the way DevTools' "Collect
  // garbage" button does it, over the DevTools protocol.
  projects: servers.map(({ name, port }) => ({
    name,
    use: {
      ...devices["Desktop Chrome"],
      baseURL: `http://localhost:${port}`,
      launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined },
    },
  })),
  webServer: servers.map(({ script, port }) => ({
    command: `npm --prefix demo run ${script} -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  })),
});
