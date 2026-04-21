import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "android-mobile",
      use: {
        ...devices["Pixel 5"],
        // Override to a common mid-range Android viewport (Pixel 7 class)
        viewport: { width: 393, height: 851 },
        userAgent:
          "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        // Simulate Android Chrome's deviceScaleFactor
        deviceScaleFactor: 2.625,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],

  webServer: {
    // cross-env is not available; use env object to pass env vars.
    // Supabase stubs prevent middleware from crashing when no real project
    // is configured locally. Gamification API falls back to fixture data via
    // NEXT_PUBLIC_USE_MOCK_GAMIFICATION=1.
    command: "npm run dev",
    env: {
      NEXT_PUBLIC_USE_MOCK_GAMIFICATION: "1",
      // Stub Supabase credentials so middleware doesn't crash during E2E runs.
      // Replace with real values in .env.local for production-like testing.
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "placeholder-service-key",
    },
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
