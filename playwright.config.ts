import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration — Employee Portal E2E smoke suite
 *
 * Tests run against a DEPLOYED environment (production by default). Set the
 * target with the BASE_URL environment variable — in CI this comes from the
 * `BASE_URL` repository secret; locally, export it or drop it in a .env.
 *
 *   BASE_URL            Full origin to test, e.g. https://portal.example.com
 *   TEST_USER_EMAIL     Dedicated test account email (must have a Clerk PASSWORD set)
 *   TEST_USER_PASSWORD  Password for that account
 *
 * Authenticated tests reuse a session captured once by `auth.setup.ts` and
 * stored in playwright/.auth/user.json. If TEST_USER_EMAIL is unset, the
 * setup writes an empty state and the authenticated tests skip themselves,
 * so the public smoke tests still run anywhere.
 */

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 30_000,

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],

  use: {
    // No real default — a missing BASE_URL should fail loudly rather than
    // silently testing the wrong site.
    baseURL: process.env.BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    // 1. Logs in once and saves the session. Other projects depend on it.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },

    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      dependencies: ['setup'],
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
      dependencies: ['setup'],
    },
  ],
});
