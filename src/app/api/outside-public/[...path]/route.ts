// Public (unauthenticated) proxy to sp1-api's `/outside-public/*` endpoints.
//
// Used by the candidate-facing /render-assessment and /render-form pages, which
// are reached from an emailed link and therefore have no session. The upstream
// paths, methods and payloads are forwarded verbatim so the flows stay
// byte-identical to the stadium-people / gignology-v4 implementations.
//
// Because these endpoints need no credentials, the proxy is restricted to an
// explicit allowlist — it must never become a general-purpose open relay to
// sp1-api.
import { NextRequest, NextResponse } from 'next/server';
import { getSp1PublicClient } from '@/lib/sp1Client';
import { resolvePublicTenantOrigin } from '@/lib/tenant/public-tenant';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';

export const dynamic = 'force-dynamic';

/**
 * Tenant `dbName`, taken from the leading segment of the public page URL.
 *
 * Sent as a header rather than a query param on purpose: this proxy forwards
 * `nextUrl.search` to sp1-api verbatim, so a query param would leak into the
 * upstream request.
 */
const TENANT_HEADER = 'x-tenant-db';

type Method = 'GET' | 'POST' | 'PUT';

const ID = '[^/]+';

/** Allowlisted upstream paths (relative to `/outside-public`) and their methods. */
const ALLOWED: { pattern: RegExp; methods: Method[] }[] = [
  // Branding for the public page shell
  { pattern: new RegExp(`^companies/primary$`), methods: ['GET'] },

  // Assessment taking
  {
    pattern: new RegExp(`^assessments/${ID}/applicants/${ID}$`),
    methods: ['GET'],
  },
  {
    pattern: new RegExp(`^assessments/${ID}/applicants/${ID}/(send-otp|verify-otp|start|submit-excel)$`),
    methods: ['POST'],
  },
  {
    pattern: new RegExp(`^assessments/${ID}/applicants/${ID}/(answer-time|evaluate)$`),
    methods: ['PUT'],
  },
  { pattern: new RegExp(`^assessments/${ID}/template-link$`), methods: ['GET'] },

  // Dynamic form filling
  { pattern: new RegExp(`^forms/${ID}/applicants/${ID}$`), methods: ['GET'] },
  {
    pattern: new RegExp(`^forms/${ID}/applicants/${ID}/(send-otp|verify-otp|save-responses)$`),
    methods: ['POST'],
  },
  { pattern: new RegExp(`^llm/dynamicForms/applicant/generate-pdf$`), methods: ['POST'] },
];

function isAllowed(path: string, method: Method): boolean {
  return ALLOWED.some((r) => r.methods.includes(method) && r.pattern.test(path));
}

type Ctx = { params: { path?: string[] } | Promise<{ path?: string[] }> };

async function resolvePath(ctx: Ctx): Promise<string> {
  const { path } = await ctx.params;
  return (path ?? []).join('/');
}

async function proxy(request: NextRequest, ctx: Ctx, method: Method) {
  const path = await resolvePath(ctx);

  if (!isAllowed(path, method)) {
    return NextResponse.json(
      { success: false, error: 'not-found', message: 'Unknown endpoint' },
      { status: 404 }
    );
  }

  // Resolve the tenant before anything else — without it we cannot tell sp1-api
  // which tenant owns this assessment/form, and guessing would be worse than
  // failing.
  const tenantDb = request.headers.get(TENANT_HEADER);
  const tenantOrigin = await resolvePublicTenantOrigin(tenantDb);
  if (!tenantOrigin) {
    console.error(
      `[outside-public proxy] unresolved tenant "${tenantDb ?? '(missing)'}" for ${method} ${path}`
    );
    return NextResponse.json(
      {
        success: false,
        error: 'unknown-tenant',
        message: 'This link is not valid for any known tenant.',
      },
      { status: 400 }
    );
  }

  const upstream = `/outside-public/${path}`;
  const search = request.nextUrl.search;

  try {
    // Multipart bodies (the Excel assessment upload) are forwarded as-is; axios
    // needs to own the Content-Type so it can set the boundary.
    const isMultipart = (request.headers.get('content-type') ?? '').includes(
      'multipart/form-data'
    );

    let body: unknown;
    if (method !== 'GET') {
      if (isMultipart) {
        body = await request.formData();
      } else {
        body = await request.json().catch(() => ({}));
      }
    }

    const sp1 = getSp1PublicClient(
      tenantOrigin,
      isMultipart ? false : 'application/json'
    );
    const config: AxiosRequestConfig = {};
    let res: AxiosResponse;
    switch (method) {
      case 'GET':
        res = await sp1.get(`${upstream}${search}`, config);
        break;
      case 'POST':
        res = await sp1.post(`${upstream}${search}`, body ?? {}, config);
        break;
      case 'PUT':
        res = await sp1.put(`${upstream}${search}`, body ?? {}, config);
        break;
    }
    return NextResponse.json(res.data, { status: res.status });
  } catch (error: unknown) {
    const e = error as {
      response?: { status?: number; data?: unknown };
      message?: string;
    };
    console.error(`[outside-public proxy] ${method} ${upstream}:`, e.message);
    return NextResponse.json(
      e.response?.data ?? { success: false, message: 'Proxy request failed' },
      { status: e.response?.status ?? 500 }
    );
  }
}

export const GET = (request: NextRequest, ctx: Ctx) => proxy(request, ctx, 'GET');
export const POST = (request: NextRequest, ctx: Ctx) => proxy(request, ctx, 'POST');
export const PUT = (request: NextRequest, ctx: Ctx) => proxy(request, ctx, 'PUT');
