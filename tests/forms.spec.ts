import { test, expect } from '@playwright/test';

/**
 * Form-behavior tests for the real public form in this app: the custom Clerk
 * sign-in form (src/components/auth/CustomSignInForm.tsx). The portal has no
 * public contact/search form, so these cover client-side validation on the
 * form every user actually interacts with.
 */

test.describe('Sign-in form validation', () => {
  test('submit is disabled until email and password are filled', async ({
    page,
  }) => {
    await page.goto('/sign-in');
    const submit = page.getByRole('button', { name: /^sign in$/i });

    await expect(submit).toBeDisabled();

    await page.fill('#email', 'someone@example.com');
    await expect(submit).toBeDisabled(); // password still empty

    await page.fill('#password', 'a-password');
    await expect(submit).toBeEnabled();
  });

  test('email field rejects malformed input (HTML5 validation)', async ({
    page,
  }) => {
    await page.goto('/sign-in');
    const email = page.locator('#email');

    await expect(email).toHaveAttribute('type', 'email');
    await email.fill('not-an-email');

    const isInvalid = await email.evaluate(
      (el: HTMLInputElement) => !el.validity.valid
    );
    expect(isInvalid).toBe(true);
  });

  test('one-time-code link requires an email first', async ({ page }) => {
    await page.goto('/sign-in');
    await page
      .getByRole('button', { name: /one-time email code/i })
      .click();

    await expect(page.getByRole('alert')).toContainText(/enter your email/i);
  });
});
