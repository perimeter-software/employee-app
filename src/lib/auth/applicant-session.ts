// lib/auth/applicant-session.ts
//
// Shared helpers for minting an applicant-only OTP session.
//
// Historically this logic lived inline inside /api/auth/otp/verify. It is now
// extracted so that BOTH entry points build identical sessions:
//   1. OTP verify  — applicant enters an emailed code.
//   2. Handoff consume — an external app (e.g. the admin app) hands the applicant
//      off via a single-use, server-minted token so they land pre-authenticated.
//
// Keeping the gating + session shape in one place guarantees the two paths can
// never drift (same status/stage checks, same tenant caching, same cookie set).
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import redisService from '@/lib/cache/redis-client';

const ALL_APPLICANT_STAGES = ['New', 'ATC', 'Screened', 'Pre-Hire'];
const DEFAULT_MIN_STAGE = 'Screened';

export interface ApplicantSessionData {
  userId: string;
  applicantId: string;
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  loginMethod: 'otp';
  isLimitedAccess: boolean;
  isApplicantOnly: true;
  userType: 'applicant';
  status?: string;
  employmentStatus?: string;
  applicantStatus?: string;
  acknowledgedDate?: string | null;
  tenant?: unknown;
  availableTenants?: unknown[];
  createdAt: string;
}

/** A tenant the applicant can choose between at login. Safe to send to the client. */
export interface SelectableTenant {
  clientDomain: string;
  clientName: string;
  tenantLogo?: string;
}

export type BuildApplicantSessionResult =
  | { ok: true; sessionData: ApplicantSessionData; redirectUrl: string }
  | {
      /**
       * The email exists in more than one eligible tenant and no preference was
       * supplied. The caller must ask which one, then call again with that
       * tenant's clientDomain as `preferredTenantDomain`.
       */
      ok: 'needs-tenant-selection';
      tenants: SelectableTenant[];
    }
  | { ok: false; status: number; error: string };

/**
 * Only allow relative, same-origin paths to prevent open redirects.
 * Mirrors the guard already used in the OTP verify route.
 */
export function isSafeRelativePath(path: string | null | undefined): path is string {
  if (!path) return false;
  return path.startsWith('/') && !path.startsWith('//');
}

/**
 * A deep-link is only honored for applicant-only sessions when it targets the
 * applicant portal. This prevents a generic `returnTo` default (e.g. "/time",
 * which the OTP login form sends) from bouncing an applicant out of their
 * portal, while still allowing "/applicant/jobs?run=aiscreening" style links.
 */
export function isApplicantPortalPath(path: string | null | undefined): path is string {
  return isSafeRelativePath(path) && /^\/applicant(\/|\?|$)/.test(path);
}

/**
 * Normalize a tenant domain for comparison: lowercase, strip scheme + trailing
 * slash. The backend stores the tenant's canonical `clientDomain`; on our side a
 * resolved tenant carries the same value in `url` (and sometimes `clientDomain`).
 */
function normalizeDomain(domain: string | null | undefined): string {
  if (!domain) return '';
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
}

/**
 * Project a candidate down to what the login screen may see. Deliberately does
 * NOT include dbName or the applicant's per-tenant id.
 */
function toSelectableTenant(candidate: {
  tenant: { clientDomain?: string; url: string; clientName: string; tenantLogo?: string };
}): SelectableTenant {
  return {
    clientDomain: candidate.tenant.clientDomain || candidate.tenant.url,
    clientName: candidate.tenant.clientName,
    tenantLogo: candidate.tenant.tenantLogo,
  };
}

/**
 * Validate an applicant by email and build the OTP session payload + default
 * redirect. Runs the exact status/stage gating used by the OTP flow.
 *
 * @param email        Raw email; will be normalized.
 * @param destination  Optional deep-link (e.g. "/applicant/jobs?run=aiscreening").
 *                     Used as the redirect when it is a safe relative path AND the
 *                     applicant is eligible for the onboarding portal.
 * @param preferredTenantDomain  Optional canonical tenant domain — the handoff's
 *                     `tenantDomain`, or the tenant the applicant just picked at
 *                     login. When it matches one of the applicant's tenants, that
 *                     tenant is pinned and its own applicant record drives the
 *                     session. Without it, an applicant who exists in more than
 *                     one eligible tenant yields `ok: 'needs-tenant-selection'`
 *                     instead of a silently-picked tenant.
 */
export async function buildApplicantSessionData(
  email: string,
  destination?: string | null,
  preferredTenantDomain?: string | null
): Promise<BuildApplicantSessionResult> {
  const normalizedEmail = email.toLowerCase().trim();

  const { findApplicantAndTenantsByEmail } = await import(
    '@/domains/user/utils/mongo-user-utils'
  );
  const applicantData = await findApplicantAndTenantsByEmail(normalizedEmail);

  if (!applicantData || applicantData.candidates.length === 0) {
    return {
      ok: false,
      status: 404,
      error: 'Account not found. Please contact your supervisor.',
    };
  }

  const { candidates } = applicantData;

  // Resolve which tenant this session belongs to.
  //  - explicit preference (handoff / login pick) wins, when it matches
  //  - a single candidate needs no question
  //  - otherwise the caller must ask; we refuse to guess
  let selected = candidates[0];
  if (preferredTenantDomain) {
    const target = normalizeDomain(preferredTenantDomain);
    const match = candidates.find(
      (c) =>
        normalizeDomain(c.tenant.clientDomain) === target ||
        normalizeDomain(c.tenant.url) === target
    );
    if (match) {
      selected = match;
    } else {
      console.warn(
        `tenantDomain "${preferredTenantDomain}" is not one of ${normalizedEmail}'s eligible tenants; ignoring.`
      );
      if (candidates.length > 1) {
        return {
          ok: 'needs-tenant-selection',
          tenants: candidates.map(toSelectableTenant),
        };
      }
    }
  } else if (candidates.length > 1) {
    return {
      ok: 'needs-tenant-selection',
      tenants: candidates.map(toSelectableTenant),
    };
  }

  // Order tenants with the selected one first; every consumer reads `tenant`
  // explicitly, but `availableTenants` powers the in-app switcher.
  const tenants = [
    selected.tenant,
    ...candidates.filter((c) => c !== selected).map((c) => c.tenant),
  ];

  // Gating uses the SELECTED tenant's applicant record — status and onboarding
  // stage differ per tenant, so reading them off any other record is wrong.
  const { status, applicantStatus } = selected.applicantInfo;

  // Block login if the applicant record status is not a recognized value
  if (status !== 'Employee' && status !== 'Applicant') {
    return {
      ok: false,
      status: 403,
      error:
        'Your account is not currently active. Please contact your supervisor.',
    };
  }

  // For "Applicant" status, also validate applicantStatus is a known pipeline stage
  if (status === 'Applicant') {
    if (!applicantStatus || !ALL_APPLICANT_STAGES.includes(applicantStatus)) {
      return {
        ok: false,
        status: 403,
        error:
          'Your application is not in an eligible stage. Please contact your supervisor.',
      };
    }
  }

  // Cache tenant data immediately so withEnhancedAuthAPI can resolve tenant on
  // the very first authenticated request, without waiting for /api/current-user.
  // `availableTenants` lists EVERY eligible tenant, current one included — the
  // same shape the user flow produces, which is what the header switcher
  // (`availableTenants.length > 1`) and /api/switch-tenant both assume.
  await redisService.setTenantData(
    normalizedEmail,
    {
      tenant: selected.tenant,
      availableTenants: tenants,
      isApplicantOnly: true,
    },
    24 * 60 * 60
  );

  // Resolve redirect. Default mirrors the OTP flow (/applicant for applicants
  // that can onboard, /payroll for Employee-status paystub access). A safe
  // relative `destination` overrides the default for "Applicant" status only —
  // Employee-status applicants remain constrained to /payroll.
  let redirectUrl: string;
  if (status === 'Applicant') {
    // Kept for parity with the OTP flow; the client-side protection hook
    // enforces the actual company minStageToOnboarding setting.
    const minStageIndex = ALL_APPLICANT_STAGES.indexOf(DEFAULT_MIN_STAGE);
    const stageIndex = ALL_APPLICANT_STAGES.indexOf(applicantStatus ?? '');
    void (stageIndex >= minStageIndex && stageIndex !== -1);

    redirectUrl = isApplicantPortalPath(destination) ? destination : '/applicant';
  } else {
    // status === 'Employee': payroll/paystub access only
    redirectUrl = '/payroll';
  }

  // Everything below comes from the SELECTED candidate — including applicantId,
  // which differs per tenant (each tenant holds its own applicant document).
  const info = selected.applicantInfo;
  const sessionData: ApplicantSessionData = {
    userId: selected.applicantId,
    applicantId: selected.applicantId,
    email: normalizedEmail,
    name:
      info.firstName && info.lastName
        ? `${info.firstName} ${info.lastName}`.trim()
        : info.firstName || info.lastName || normalizedEmail,
    firstName: info.firstName,
    lastName: info.lastName,
    loginMethod: 'otp',
    isLimitedAccess: true,
    isApplicantOnly: true,
    userType: 'applicant',
    status,
    employmentStatus: info.employmentStatus,
    applicantStatus: info.applicantStatus,
    acknowledgedDate: info.acknowledgedDate,
    tenant: selected.tenant,
    availableTenants: tenants,
    createdAt: new Date().toISOString(),
  };

  return { ok: true, sessionData, redirectUrl };
}

/**
 * Persist an OTP session in Redis (24h) and return the session id used as the
 * `otp_session_id` cookie value.
 */
export async function createOtpSession(sessionData: unknown): Promise<string> {
  const sessionId = `otp_session_${crypto.randomUUID()}`;
  await redisService.set(`otp_session:${sessionId}`, sessionData, 24 * 60 * 60);
  return sessionId;
}

/**
 * Attach the OTP session cookies to a response. `otp_session_id` is the httpOnly
 * session handle; `auth0.is.authenticated` is a non-httpOnly compatibility flag
 * read by existing client checks.
 */
export function setOtpSessionCookies(
  response: NextResponse,
  sessionId: string
): void {
  const maxAge = 24 * 60 * 60; // 24 hours
  response.cookies.set('otp_session_id', sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
  response.cookies.set('auth0.is.authenticated', 'true', {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}
