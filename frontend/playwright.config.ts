import { defineConfig, devices } from "@playwright/test";

// Never reuse a running app with unknown signaling configuration.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://localhost:3001", locale: "en-US", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "cd ../signaling && bun run dev -- --port 8788 --var ORIGINS:http://localhost:3001",
      url: "http://localhost:8788/health",
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "bun run dev -- --port 3001",
      url: "http://localhost:3001",
      env: { NEXT_PUBLIC_SIGNALING_URL: process.env.HOLO_E2E_SIGNALING_URL ?? "ws://localhost:8788/ws" },
      reuseExistingServer: false,
      timeout: 90_000,
    },
  ],
});
