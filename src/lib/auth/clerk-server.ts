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
import { ObjectId } from 'mongodb';
import type { Auth0SessionUser } from '@/domains/user/types/user.types';
import { resolveActivityIdentityByEmail } from '@/lib/services/activity-identity';

/**
 * Mirror of gig-v4-backend's resolveClerkEnv — derives 'development' or
 * 'production' from the Clerk publishable key prefix so the on-disk path
 * (clerk.employeeapp.{env}) stays in sync between the two backends.
 */
function resolveClerkEnv(): 'development' | 'production' {
  const key =
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    process.env.CLERK_PUBLISHABLE_KEY ||
    '';
  return key.startsWith('pk_live_') ? 'production' : 'development';
}

/**
 * Persist the Clerk userId on the user document at clerk.employeeapp.{env}.
 *
 * This is the employee-app analogue of gig-v4-backend's authCheck.js write
 * (gig-v4-backend tags requests with appSource='gignology' or 'employeeapp'
 * and writes there; since the employee-app calls its OWN Next.js routes — not
 * v4-backend — that write never happens for this app, so we mirror it here).
 *
 * Idempotent: skips the write if the field already matches. Errors are
 * swallowed so a write failure can't break the auth flow.
 */
async function persistEmployeeAppClerkId(
  email: string,
  clerkUserId: string
): Promise<void> {
  try {
    const { default: redisService } = await import('@/lib/cache/redis-client');
    const tenantData = await redisService.getTenantData(email);
    const tenantDbName = tenantData?.tenant?.dbName;
    if (!tenantDbName) return;

    const { mongoConn } = await import('@/lib/db/mongodb');
    const { db } = await mongoConn(tenantDbName);

    const env = resolveClerkEnv();
    const fieldPath = `clerk.employeeapp.${env}`;

    const existing = await db.collection('users').findOne(
      { emailAddress: email },
      { projection: { _id: 1, clerk: 1 } }
    );

    // Only update if user exists and the field doesn't already match.
    const current = existing?.clerk?.employeeapp?.[env];
    if (!existing?._id || current === clerkUserId) return;

    await db.collection('users').updateOne(
      { _id: new ObjectId(existing._id as string | ObjectId) },
      { $set: { [fieldPath]: clerkUserId } }
    );
  } catch (error) {
    console.error('persistEmployeeAppClerkId failed', error);
  }
}

async function enrichAppUserIdentity(email: string): Promise<{
  _id?: string;
  applicantId?: string;
}> {
  try {
    const { default: redisService } = await import('@/lib/cache/redis-client');
    const tenantData = await redisService.getTenantData(email);
    const tenantDbName = tenantData?.tenant?.dbName;
    if (!tenantDbName) return {};

    const { mongoConn } = await import('@/lib/db/mongodb');
    const { db } = await mongoConn(tenantDbName);
    const { userId, applicantId } = await resolveActivityIdentityByEmail(
      db,
      email
    );
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
  if (!userId) return null;

  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const primaryEmail =
    clerkUser.emailAddresses.find(
      (e) => e.id === clerkUser.primaryEmailAddressId
    )?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;

  // Deny if Clerk user has no matching MongoDB record in any tenant.
  // Matches gig-v4-backend's "Access is not allowed for {email}" behavior.
  if (!primaryEmail) return null;
  const existsInMongo = await hasMongoRecord(primaryEmail.toLowerCase());
  if (!existsInMongo) return null;

  const firstName = clerkUser.firstName ?? undefined;
  const lastName = clerkUser.lastName ?? undefined;
  const displayName =
    [firstName, lastName].filter(Boolean).join(' ') || primaryEmail || userId;

  const enriched = await enrichAppUserIdentity(primaryEmail.toLowerCase());

  // Persist the Clerk userId at users.clerk.employeeapp.{env} so the user
  // record can be matched back to a Clerk identity by other services.
  // Fire-and-forget — auth shouldn't block on this and failures are swallowed.
  void persistEmployeeAppClerkId(primaryEmail.toLowerCase(), userId);

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
