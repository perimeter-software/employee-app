// Server-side Clerk helpers used only when IS_V4=true.
//
// This file is the V4 analogue of getSession() from @auth0/nextjs-auth0.
// It resolves the current Clerk-authenticated request into an
// Auth0SessionUser-shaped object so that existing downstream code (the
// /api/auth/me endpoint, eventually every withApiAuthRequired handler) can
// consume it without caring which provider is active.
//
// Scope note: this cut populates the fields Clerk natively provides PLUS the
// activity-identity pair (_id, applicantId) via resolveActivityIdentityByEmail
// so applicant-only flows work. userType / employmentStatus / tenant / jobs
// enrichment is deferred — follow-up PR needs to re-plumb what the Auth0 side
// does via x-enhanced-user middleware headers.
import { auth, currentUser } from '@clerk/nextjs/server';
import type { Auth0SessionUser } from '@/domains/user/types/user.types';
import { resolveActivityIdentityByEmail } from '@/lib/services/activity-identity';

async function enrichAppUserIdentity(email: string): Promise<{
  _id?: string;
  applicantId?: string;
}> {
  try {
    console.error('[enrichAppUserIdentity] start', email);
    const { default: redisService } = await import('@/lib/cache/redis-client');
    console.error('[enrichAppUserIdentity] imported redisService, calling getTenantData');
    const tenantData = await redisService.getTenantData(email);
    console.error('[enrichAppUserIdentity] tenantData:', tenantData ? { dbName: tenantData.tenant?.dbName } : null);
    const tenantDbName = tenantData?.tenant?.dbName;
    if (!tenantDbName) return {};

    const { mongoConn } = await import('@/lib/db/mongodb');
    const { db } = await mongoConn(tenantDbName);
    const { userId, applicantId } = await resolveActivityIdentityByEmail(
      db,
      email
    );
    console.error('[enrichAppUserIdentity] resolved:', { userId, applicantId });
    return { _id: userId, applicantId };
  } catch (error) {
    console.error('resolveClerkAppUser: identity enrichment failed', error);
    return {};
  }
}

/**
 * Verify that a Clerk user has a matching record in MongoDB (user or applicant)
 * in at least one tenant. Mirrors the gig-v4-backend /auth/clerk-token behavior:
 * if the Clerk-authenticated email has no matching record, access is denied.
 */
async function hasMongoRecord(email: string): Promise<boolean> {
  try {
    const { findApplicantAndTenantsByEmail } = await import(
      '@/domains/user/utils/mongo-user-utils'
    );
    const result = await findApplicantAndTenantsByEmail(email);
    return Boolean(result && result.tenants && result.tenants.length > 0);
  } catch (error) {
    console.error('resolveClerkAppUser: mongo existence check failed', error);
    // Fail closed — if we can't verify, deny access.
    return false;
  }
}

export async function resolveClerkAppUser(): Promise<Auth0SessionUser | null> {
  const { userId } = await auth();
  console.error('[resolveClerkAppUser] auth() userId:', userId);
  if (!userId) return null;

  const clerkUser = await currentUser();
  console.error('[resolveClerkAppUser] currentUser:', clerkUser ? { id: clerkUser.id, primaryEmail: clerkUser.primaryEmailAddressId } : null);
  if (!clerkUser) return null;

  const primaryEmail =
    clerkUser.emailAddresses.find(
      (e) => e.id === clerkUser.primaryEmailAddressId
    )?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;

  // Deny if Clerk user has no matching MongoDB record in any tenant.
  // Matches gig-v4-backend's "Access is not allowed for {email}" behavior.
  if (!primaryEmail) return null;
  console.error('[resolveClerkAppUser] checking mongo for:', primaryEmail.toLowerCase());
  const existsInMongo = await hasMongoRecord(primaryEmail.toLowerCase());
  console.error('[resolveClerkAppUser] existsInMongo:', existsInMongo);
  if (!existsInMongo) return null;

  const firstName = clerkUser.firstName ?? undefined;
  const lastName = clerkUser.lastName ?? undefined;
  const displayName =
    [firstName, lastName].filter(Boolean).join(' ') || primaryEmail || userId;

  const enriched = await enrichAppUserIdentity(primaryEmail.toLowerCase());

  // Partial Auth0SessionUser — userType / employmentStatus / tenant enrichment
  // is deferred (see scope note at top of file).
  return {
    sub: userId,
    email: primaryEmail,
    email_verified: clerkUser.emailAddresses.some(
      (e) => e.verification?.status === 'verified'
    ),
    name: displayName,
    given_name: firstName,
    family_name: lastName,
    firstName,
    lastName,
    picture: clerkUser.imageUrl,
    loginMethod: 'clerk',
    _id: enriched._id,
    applicantId: enriched.applicantId,
  } as Auth0SessionUser;
}
