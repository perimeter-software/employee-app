import { test, expect } from '@playwright/test';
import { TEST_EMAIL, TEST_PASSWORD, HAS_CREDENTIALS } from './constants';

/**
 * Authentication flow tests against the custom Clerk sign-in form
 * (src/components/auth/CustomSignInForm.tsx).
 *
 * These tests do NOT reuse the saved session — they exercise the real login
 * UI directly, so they run in a fresh (signed-out) context.
 *
 * The "valid credentials" test requires a dedicated test account that has a
 * Clerk PASSWORD set (see tests/README.md) and skips when none is configured.
 */

test.describe('Authentication', () => {
  test('sign-in page renders the login form', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByRole('button', { name: /^sign in$/i })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /continue with google/i })
    ).toBeVisible();
  });

  test('protected route redirects to sign-in when unauthenticated', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/sign-in/);
  });

  test('login with invalid credentials shows an error', async ({ page }) => {
    await page.goto('/sign-in');
    await page.fill('#email', 'definitely-not-a-real-user@example.invalid');
    await page.fill('#password', 'wrong-password-123');
    await page.getByRole('button', { name: /^sign in$/i }).click();

    // The form surfaces Clerk errors in a destructive Alert (role="alert").
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 10_000 });
    // And keeps the user on the sign-in page.
    await expect(page).toHaveURL(/sign-in/);
  });

  test('login with valid credentials succeeds', async ({ page }) => {
    test.skip(!HAS_CREDENTIALS, 'No TEST_USER credentials configured.');

    await page.goto('/sign-in');
    await page.fill('#email', TEST_EMAIL);
    await page.fill('#password', TEST_PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();

    // On success the form navigates away from /sign-in (redirect target is '/').
    await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), {
      timeout: 20_000,
    });
    await expect(page).not.toHaveURL(/sign-in/);
  });

  test('logout ends the session', async ({ page }) => {
    test.skip(!HAS_CREDENTIALS, 'No TEST_USER credentials configured.');

    // Log in first.
    await page.goto('/sign-in');
    await page.fill('#email', TEST_EMAIL);
    await page.fill('#password', TEST_PASSWORD);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/sign-in'), {
      timeout: 20_000,
    });

    // Hitting the logout route should clear the session; afterwards a
    // protected route must bounce back to sign-in.
    await page.goto('/logout');
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/sign-in/);
  });
});
