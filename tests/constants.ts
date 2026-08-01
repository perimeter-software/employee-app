/** Where the authenticated Clerk session captured by auth.setup.ts is stored. */
export const AUTH_FILE = 'playwright/.auth/user.json';

/** Credentials for the dedicated E2E test account (see tests/README.md). */
export const TEST_EMAIL = process.env.TEST_USER_EMAIL ?? '';
export const TEST_PASSWORD = process.env.TEST_USER_PASSWORD ?? '';

/** True when both credentials are present, so authenticated tests can run. */
export const HAS_CREDENTIALS = Boolean(TEST_EMAIL && TEST_PASSWORD);
