// Tenant resolution for the unauthenticated candidate pages (/render-assessment,
// /render-form).
//
// stadium-people and gignology-v4 are single-tenant-per-domain, so sp1-api can
// infer the tenant from the browser's origin. The employee app is multi-tenant
// and these pages are public — there is no session to read a tenant from — so
// the tenant travels in the link as its `dbName` (the leading path segment).
//
// A value arriving from the browser is never trusted: sp1-api keys tenancy off
// the `origin` header, so an unvalidated value would let a caller point requests
// at any origin they like. Every lookup is resolved against the tenant registry
// and anything unknown is rejected.
import type { TenantDocument } from '@/domains/tenant/types/tenant.types';

/** dbNames are Mongo database names — reject anything that isn't one. */
const DB_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { origin: string; expiresAt: number }>();

export function isValidDbName(dbName: string | undefined | null): dbName is string {
  return !!dbName && DB_NAME_PATTERN.test(dbName);
}

/**
 * Map a tenant `dbName` to the canonical domain sp1-api identifies it by.
 *
 * @returns the tenant's clientDomain, or null when the dbName is malformed,
 *   unknown to the registry, or the tenant has no domain configured.
 */
export async function resolvePublicTenantOrigin(
  dbName: string | undefined | null
): Promise<string | null> {
  if (!isValidDbName(dbName)) return null;

  const cached = cache.get(dbName);
  if (cached && cached.expiresAt > Date.now()) return cached.origin;

  const { mongoConn } = await import('@/lib/db/mongodb');
  const { dbTenant } = await mongoConn();
  const tenant = await dbTenant
    .collection<TenantDocument>('tenants')
    .findOne({ dbName });

  const origin = tenant?.clientDomain;
  if (!origin) return null;

  // Only positive results are cached: an unknown dbName should stay cheap to
  // re-check once the tenant is actually created.
  cache.set(dbName, { origin, expiresAt: Date.now() + CACHE_TTL_MS });
  return origin;
}
