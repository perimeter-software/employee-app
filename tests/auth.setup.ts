import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { AUTH_FILE, TEST_EMAIL, TEST_PASSWORD, HAS_CREDENTIALS } from './constants';

/**
 * Authenticates ONCE before the rest of the suite and saves the Clerk session
 * to AUTH_FILE. Authenticated specs load that state via test.use({ storageState })
 * instead of logging in repeatedly.
 *
 * This drives the real custom sign-in form (src/components/auth/CustomSignInForm.tsx),
 * which signs in with a password when the account has one set. The E2E test
 * account MUST have a Clerk password — otherwise the form falls back to an
 * emailed one-time code, which can't be automated here. See tests/README.md.
 *
 * When credentials are absent (e.g. a local run with no secrets) we write an
 * empty storage state so the file exists and authenticated specs skip cleanly
 * while the public smoke tests still run.
 */
setup('authenticate', async ({ page }) => {
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  if (!HAS_CREDENTIALS) {
    setup.info().annotations.push({
      type: 'skip-reason',
      description: 'TEST_USER_EMAIL / TEST_USER_PASSWORD not set — writing empty session.',
    });
    fs.writeFileSync(AUTH_FILE, JSON.stringify({ cookies: [], origins: [] }));
    return;
  }

  await page.goto('/sign-in');

  // The custom form renders email + password inputs (see CustomSignInForm.tsx).
  await page.fill('#email', TEST_EMAIL);
  await page.fill('#password', TEST_PASSWORD);
  await page.getByRole('button', { name: /^sign in$/i }).click();

  // On success the form sets window.location.href to the redirect target,
  // navigating away from /sign-in. If the account has no password, the form
  // would instead show a verification-code step and never leave — that surfaces
  // here as a timeout, which is the correct, loud failure.
  await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), {
    timeout: 20_000,
  });

  // Sanity check: a Clerk session cookie should now be present.
  const cookies = await page.context().cookies();
  const hasClerkSession = cookies.some((c) => /^__session|__clerk/.test(c.name));
  expect(
    hasClerkSession,
    'Expected a Clerk session cookie after sign-in. ' +
      'Confirm the test account has a PASSWORD set and Clerk bot protection ' +
      'allows this login (see tests/README.md).'
  ).toBe(true);

  await page.context().storageState({ path: AUTH_FILE });
});
