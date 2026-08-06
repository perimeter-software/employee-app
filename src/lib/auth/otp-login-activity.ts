// lib/auth/otp-login-activity.ts
//
// Activity logging for OTP logins. Extracted from /api/auth/otp/verify so the
// tenant-selection entry point (/api/auth/otp/select-tenant) logs identically —
// the two routes mint the same session, so they must leave the same trail.
import redisService from '@/lib/cache/redis-client';

/**
 * Both call sites pass their whole session payload, and the user-flow and
 * applicant-flow shapes differ (one is an interface, so `Record<string, unknown>`
 * would reject it). Stay loose and read only what's needed.
 */
type OtpLoginSessionLike = object;

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

/**
 * Best-effort: never throws, never blocks login. Resolves the tenant from the
 * Redis tenant cache (written moments earlier by the session builder).
 */
export async function logOtpLoginActivity(
  normalizedEmail: string,
  session: OtpLoginSessionLike,
  isApplicantOnly: boolean
): Promise<void> {
  const sessionData = session as Record<string, unknown>;
  try {
    const { mongoConn } = await import('@/lib/db/mongodb');
    const { logActivity, createActivityLogData } = await import(
      '@/lib/services/activity-logger'
    );

    const tenantData = await redisService.getTenantData(normalizedEmail);
    const tenantDbName = tenantData?.tenant?.dbName;
    if (!tenantDbName) {
      console.warn(
        `Skipping OTP login activity log: tenant dbName unavailable for ${normalizedEmail}`
      );
      return;
    }

    const { db } = await mongoConn(tenantDbName);
    const { resolveActivityIdentityByEmail } = await import(
      '@/lib/services/activity-identity'
    );
    const resolvedIdentity = await resolveActivityIdentityByEmail(
      db,
      normalizedEmail
    );

    const userId =
      resolvedIdentity.userId ||
      (sessionData.userId ? String(sessionData.userId) : undefined);
    const applicantId =
      resolvedIdentity.applicantId ||
      (sessionData.applicantId ? String(sessionData.applicantId) : undefined);

    if (!userId || !applicantId) {
      console.warn(
        `Skipping OTP login activity log: unresolved DB IDs for ${normalizedEmail}`
      );
      return;
    }

    const firstName = str(sessionData.firstName);
    const lastName = str(sessionData.lastName);
    const agentName: string =
      firstName && lastName
        ? `${firstName} ${lastName}`.trim()
        : firstName || lastName || str(sessionData.email) || normalizedEmail;

    await logActivity(
      db,
      createActivityLogData(
        'OTP Login',
        `${agentName} logged in using OTP (Email: ${normalizedEmail})${
          isApplicantOnly ? ' [Applicant-Only]' : ''
        }`,
        {
          applicantId,
          userId,
          agent: agentName,
          email: normalizedEmail,
          details: {
            loginMethod: 'OTP',
            email: normalizedEmail,
            employmentStatus: str(sessionData.employmentStatus),
            isLimitedAccess: Boolean(sessionData.isLimitedAccess),
            isApplicantOnly,
            tenant: tenantDbName,
          },
        }
      )
    );
  } catch (error) {
    // Don't fail login if logging fails
    console.error('Error logging OTP login activity:', error);
  }
}
