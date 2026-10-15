import { defineConfig } from "@playwright/test";

const PORT = 8099;

// End-to-end tests run the real app in the browser through Expo web, with a fresh browser profile per test.
export default defineConfig({
  testDir: "e2e/web",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  outputDir: "test-results",
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Uses the Chrome that is already installed, so no browser download is needed.
    channel: "chrome",
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npx expo start --web --port ${PORT}`,
    env: { CI: "1" },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
