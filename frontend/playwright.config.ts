import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end checks for the public site. They run against a live stack
 * (frontend on E2E_BASE_URL, backend API on E2E_API_URL) and seed their own
 * data through the admin API, so they need the seeded admin's credentials in
 * E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD. Sequential: every spec shares one seed.
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  outputDir: 'test-results/e2e',
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
