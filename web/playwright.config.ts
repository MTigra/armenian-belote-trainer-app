import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  timeout: 60000,
  expect: { timeout: 12000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL:
      process.env.E2E_BASE_URL ||
      `http://127.0.0.1:4173${process.env.VITE_BASE_PATH || "/"}`,
    viewport: { width: 390, height: 844 },
    serviceWorkers: "allow",
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
        ? {
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
            args: ["--no-sandbox"],
          }
        : {}),
      ...(process.env.E2E_PROXY_URL
        ? { proxy: { server: process.env.E2E_PROXY_URL } }
        : {}),
    },
    trace: "retain-on-failure",
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm preview",
        url: "http://127.0.0.1:4173",
        reuseExistingServer: !process.env.CI,
        timeout: 30000,
      },
});
