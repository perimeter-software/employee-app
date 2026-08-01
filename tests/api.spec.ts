import { test, expect } from '@playwright/test';

/**
 * API smoke tests using Playwright's request context. These hit the deployed
 * BASE_URL directly (no browser) and check real endpoints on the Employee Portal.
 */

test.describe('API health & responses', () => {
  test('health endpoint reports status and service details', async ({
    request,
  }) => {
    const res = await request.get('/api/health');
    // /api/health returns 200 when healthy or degraded, 503 when unhealthy.
    expect([200, 503]).toContain(res.status());

    const body = await res.json();
    expect(body.status).toMatch(/healthy|degraded|unhealthy/);
    expect(body.services).toHaveProperty('database');
    expect(body.services).toHaveProperty('redis');
    expect(body.services).toHaveProperty('auth');
  });

  test('health HEAD ping returns 200', async ({ request }) => {
    const res = await request.head('/api/health');
    expect(res.status()).toBe(200);
  });

  test('health endpoint responds within an acceptable time', async ({
    request,
  }) => {
    const start = Date.now();
    const res = await request.get('/api/health');
    const duration = Date.now() - start;

    expect([200, 503]).toContain(res.status());
    expect(duration).toBeLessThan(5_000);
  });

  test('protected API returns 401 without authentication', async ({
    request,
  }) => {
    const res = await request.get('/api/current-user');
    expect([401, 403]).toContain(res.status());
  });

  test('unknown API route returns 404', async ({ request }) => {
    const res = await request.get('/api/nonexistent-endpoint-xyz');
    expect(res.status()).toBe(404);
  });
});
