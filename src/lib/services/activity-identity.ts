import type { Db } from 'mongodb';

export interface ActivityIdentity {
  userId?: string;
  applicantId?: string;
}

/**
 * Resolve canonical activity identity from tenant data.
 * - userId: users._id when a user record exists
 * - applicantId: users.applicantId (or applicants._id for applicant-only flows)
 */
export async function resolveActivityIdentityByEmail(
  db: Db,
  email: string
): Promise<ActivityIdentity> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return {};

  const user = await db.collection('users').findOne(
    { emailAddress: normalizedEmail },
    { projection: { _id: 1, applicantId: 1 } }
  );

  if (user?._id) {
    const userId = String(user._id);
    const applicantId =
      typeof user.applicantId === 'string' && user.applicantId.trim()
        ? user.applicantId.trim()
        : undefined;
    return { userId, applicantId };
  }

  const applicant = await db.collection('applicants').findOne(
    { email: normalizedEmail },
    { projection: { _id: 1 } }
  );

  if (applicant?._id) {
    const applicantId = String(applicant._id);
    // Applicant-only sessions use applicant id as acting id.
    return { userId: applicantId, applicantId };
  }

  return {};
}

