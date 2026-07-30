// Client-side helper for the candidate-facing public pages (/render-assessment,
// /render-form). Calls go to our own Next.js proxy, which forwards them to
// sp1-api's `/outside-public/*` endpoints unchanged.
//
// These pages are reached from an emailed link with no session, so nothing here
// touches auth — identity is proven by the OTP step inside each flow.
//
// This app is multi-tenant, so every call must say which tenant it is for. The
// tenant's `dbName` is the leading segment of the page URL and rides along as a
// header; the proxy validates it against the tenant registry. The API is a
// factory rather than a bare function so a caller cannot forget to pass it.

const BASE = '/api/outside-public';
const TENANT_HEADER = 'x-tenant-db';

export class OutsidePublicError extends Error {
  status: number;
  body: Record<string, unknown>;

  constructor(message: string, status: number, body: Record<string, unknown>) {
    super(message);
    this.name = 'OutsidePublicError';
    this.status = status;
    this.body = body;
  }
}

export type OutsidePublicFetch = <T = unknown>(
  path: string,
  init?: RequestInit
) => Promise<T>;

/**
 * Build a fetch bound to one tenant.
 *
 * @param tenantDb - the tenant's `dbName`, from the page's `[tenant]` route param.
 */
export function createOutsidePublicClient(tenantDb: string): OutsidePublicFetch {
  return async function outsidePublicFetch<T = unknown>(
    path: string,
    init?: RequestInit
  ): Promise<T> {
    const isFormData = init?.body instanceof FormData;
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        [TENANT_HEADER]: tenantDb,
        ...(init?.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
        ...(init?.headers ?? {}),
      },
    });

    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      const message =
        (body.error as string) || (body.message as string) || res.statusText;
      throw new OutsidePublicError(message, res.status, body);
    }

    return body as T;
  };
}
