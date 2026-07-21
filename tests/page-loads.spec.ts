import { test, expect } from '@playwright/test';
import { AUTH_FILE, HAS_CREDENTIALS } from './constants';

/**
 * Page Load & Navigation smoke tests for the Employee Portal.
 *
 * Public tests run unauthenticated. Authenticated tests reuse the session
 * captured by auth.setup.ts and skip when no test credentials are configured.
 */

test.describe('Public pages', () => {
  test('homepage loads successfully', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBeLessThan(400);
    await expect(page).toHaveTitle(/Employee Portal/i);
  });

  test('unknown route renders the 404 page', async ({ page }) => {
    const response = await page.goto('/this-page-should-not-exist-abc123');
    expect(response?.status()).toBe(404);
    await expect(
      page.locator('text=/not found|could not be found|404/i').first()
    ).toBeVisible();
  });
});

test.describe('Authenticated pages', () => {
  test.use({ storageState: AUTH_FILE });
  test.skip(!HAS_CREDENTIALS, 'No TEST_USER credentials configured.');

  test('dashboard loads for a signed-in user', async ({ page }) => {
    await page.goto('/dashboard');
    // Should NOT be bounced to sign-in.
    await expect(page).not.toHaveURL(/sign-in/);
    await expect(page).toHaveURL(/dashboard/);
  });

  test('profile loads for a signed-in user', async ({ page }) => {
    await page.goto('/profile');
    await expect(page).not.toHaveURL(/sign-in/);
    await expect(page).toHaveURL(/profile/);
  });

  test('home loads for a signed-in user', async ({ page }) => {
    const response = await page.goto('/home');
    expect(response?.status()).toBeLessThan(400);
    await expect(page).not.toHaveURL(/sign-in/);
  });
});
