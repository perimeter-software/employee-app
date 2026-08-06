// app/api/auth/handoff/consume/route.ts
//
// External login handoff — browser landing endpoint.
//
// Flow (see docs/backend/applicant-login-handoff.md for the full contract):
//   1. Admin BACKEND calls the sp1 backend (server-to-server, shared secret) to
//      mint a single-use, short-TTL handoff token for an applicant email +
//      destination deep-link.
//   2. Admin app redirects the applicant's browser to:
//        /api/auth/handoff/consume?token=<token>
//   3. THIS route exchanges the token with the sp1 backend (which validates +
//      burns it and returns the verified { email, destination }), mints the same
//      applicant OTP session the emailed-code flow produces, sets the session
//      cookie, and 302-redirects to the destination
//      (e.g. /applicant/jobs?run=aiscreening).
//
// The applicant email is never trusted from the browser — only the opaque,
// single-use token is, and it is verified server-side before any session exists.
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import {
  buildApplicantSessionData,
  createOtpSession,
  setOtpSessionCookies,
  isApplicantPortalPath,
} from '@/lib/auth/applicant-session';

export const dynamic = 'force-dynamic';

const SP1_API_BASE_URL = process.env.SP1_API_BASE_URL;
const HANDOFF_SHARED_SECRET = process.env.HANDOFF_SHARED_SECRET;
// Path of the token-exchange endpoint on the sp1 backend. Overridable so the
// backend team can align the final route without a code change here.
const HANDOFF_CONSUME_PATH =
  process.env.HANDOFF_CONSUME_PATH || '/applicant-handoff/consume';

const DEFAULT_DESTINATION = '/applicant';

// Behind nginx, request.url / request.nextUrl.origin is the internal upstream
// address (e.g. http://localhost:8080), not the public host — so redirects built
// from it send the browser to localhost. Reconstruct the public origin from the
// forwarded headers, mirroring the logout route.
function getPublicOrigin(request: NextRequest): string {
  const forwardedHost =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https';
  return forwardedHost
    ? `${forwardedProto}://${forwardedHost}`
    : request.nextUrl.origin;
}

function redirectToLogin(request: NextRequest, error: string): NextResponse {
  const url = new URL('/', getPublicOrigin(request));
  url.searchParams.set('error', error);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return redirectToLogin(request, 'handoff-missing-token');
  }

  if (!SP1_API_BASE_URL || !HANDOFF_SHARED_SECRET) {
    console.error(
      'Handoff consume misconfigured: SP1_API_BASE_URL and/or HANDOFF_SHARED_SECRET missing'
    );
    return redirectToLogin(request, 'handoff-unavailable');
  }

  // 1. Exchange (and burn) the token with the sp1 backend.
  let email: string;
  let destination: string | undefined;
  let tenantDomain: string | undefined;
  try {
    const res = await axios.post(
      `${SP1_API_BASE_URL}${HANDOFF_CONSUME_PATH}`,
      { token },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-handoff-secret': HANDOFF_SHARED_SECRET,
        },
        // Short timeout: this is a synchronous, user-facing redirect.
        timeout: 8000,
      }
    );
    const data = (res.data ?? {}) as {
      email?: string;
      destination?: string;
      tenantDomain?: string;
    };
    if (!data.email) {
      console.error('Handoff consume: backend returned no email');
      return redirectToLogin(request, 'handoff-invalid');
    }
    email = data.email;
    destination = data.destination;
    // Canonical clientDomain of the tenant the applicant was handed off from.
    // Pins the landing tenant for multi-tenant applicants.
    tenantDomain = data.tenantDomain;
  } catch (err) {
    const e = err as { response?: { status?: number } };
    // 400/404/410 → token invalid/expired/already used. Anything else → server error.
    const status = e.response?.status;
    console.error('Handoff consume: token exchange failed', status ?? err);
    return redirectToLogin(
      request,
      status && status < 500 ? 'handoff-expired' : 'handoff-unavailable'
    );
  }

  // 2. Build the applicant session (same gating as the OTP flow). The backend
  // already validated the applicant, but we re-resolve here to produce the exact
  // session shape (tenant resolution, status/stage) the app expects.
  const safeDestination = isApplicantPortalPath(destination)
    ? destination
    : DEFAULT_DESTINATION;

  const result = await buildApplicantSessionData(
    email,
    safeDestination,
    tenantDomain
  );
  // A handoff always names its tenant, so ambiguity here means the supplied
  // `tenantDomain` didn't match any of the applicant's tenants. There's nobody
  // to ask in a server-to-server redirect — send them through normal login,
  // which offers the choice.
  if (result.ok === 'needs-tenant-selection') {
    console.error(
      `Handoff consume: tenantDomain "${tenantDomain}" did not match any tenant for ${email}`
    );
    return redirectToLogin(request, 'handoff-tenant-ambiguous');
  }

  if (!result.ok) {
    console.error(
      `Handoff consume: applicant not eligible (${result.status}) for ${email}`
    );
    return redirectToLogin(request, 'handoff-not-eligible');
  }

  // 3. Persist session, set cookies, redirect to the deep-link.
  const sessionId = await createOtpSession(result.sessionData);

  const response = NextResponse.redirect(
    new URL(result.redirectUrl, getPublicOrigin(request))
  );
  setOtpSessionCookies(response, sessionId);
  return response;
}
