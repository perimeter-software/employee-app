import { NextResponse } from 'next/server';
import { AuthenticatedRequest, withEnhancedAuthAPI } from '@/lib/middleware';
import { getSp1Client } from '@/lib/sp1Client';

// Force dynamic rendering for authenticated routes
export const dynamic = 'force-dynamic';

/**
 * Self-service profile endpoints for the logged-in user.
 *
 * Everything is keyed off the trusted session email (request.user.email) so a
 * user can only ever read / write their OWN record — no id is accepted from the
 * client. The applicant id is resolved server-side from the caller's users doc.
 *
 * WHERE THE DATA LIVES: the `users` doc holds only login identity — name, email
 * and profile picture. Every other person-level field (phone, address,
 * employment) lives on the linked `applicants` doc, which is what the admin
 * screens read. So reads merge the two, and a save sends both halves in ONE
 * call: PUT /users/email/:email takes the users fields at the top level and a
 * nested `applicant` object that sp1 applies to the doc at users.applicantId —
 * which is also where it fires the PEO sync when address1 / city / state / zip
 * / phone change on an Employee with an employeeID.
 */

// Login-identity fields, stored on the users doc.
const USER_FIELDS = ['firstName', 'lastName', 'profileImg'] as const;

// Read-only users fields echoed back on GET. `employeeType` (e.g. "Event
// Admin") is an admin-assigned role on the users doc — often absent, so the UI
// only renders it when set.
const USER_READONLY_FIELDS = ['employeeType', 'startDate', 'endDate'] as const;

// Person-level fields, stored on the applicant doc. Names are deliberately in
// both: the users doc drives the login/display name, the applicant doc drives
// what admins see on the Employees screen.
const APPLICANT_FIELDS = [
  'firstName',
  'lastName',
  'phone',
  'altPhone',
  'address1',
  'city',
  'state',
  'zip',
] as const;

// Read-only applicant fields echoed back on GET for the Employment card.
const APPLICANT_READONLY_FIELDS = [
  'status',
  'employmentStatus',
  'employmentType',
  'hireDate',
] as const;

// emailAddress is NOT editable here — changing it is an identity change that
// goes through the verification flow, not a profile save.

function sp1ForUser(request: AuthenticatedRequest) {
  const user = request.user;
  if (!user?.sub || !user?.email) return null;
  const { tenant } = user;
  return getSp1Client(user.sub, user.email, tenant?.clientDomain || tenant?.url);
}

function pick(
  source: Record<string, unknown> | undefined,
  fields: readonly string[],
) {
  const out: Record<string, unknown> = {};
  if (!source) return out;
  for (const key of fields) {
    if (key in source) out[key] = source[key];
  }
  return out;
}

async function getProfileHandler(request: AuthenticatedRequest) {
  try {
    const sp1 = sp1ForUser(request);
    if (!sp1) {
      return NextResponse.json(
        { success: false, message: 'Invalid session' },
        { status: 401 },
      );
    }
    const email = request.user.email!;
    // sp1 appends the linked applicant as `user.applicant` when the users doc
    // has a valid applicantId.
    const { data } = await sp1.get(`/users/email/${encodeURIComponent(email)}`);
    const user = (data ?? {}) as Record<string, unknown>;
    const applicant = user.applicant as Record<string, unknown> | undefined;

    return NextResponse.json({
      success: true,
      data: {
        _id: user._id,
        applicantId: user.applicantId,
        emailAddress: user.emailAddress,
        userType: user.userType,
        ...pick(user, USER_FIELDS),
        ...pick(user, USER_READONLY_FIELDS),
        // Applicant wins for the person-level fields — it is the record the
        // admin side shows, and the users doc has no address at all.
        ...pick(applicant, APPLICANT_FIELDS),
        ...pick(applicant, APPLICANT_READONLY_FIELDS),
      },
    });
  } catch (error: unknown) {
    const e = error as { response?: { status?: number; data?: unknown }; message?: string };
    console.error('Error fetching profile:', e.message);
    return NextResponse.json(
      e.response?.data ?? { success: false, message: 'Internal server error' },
      { status: e.response?.status ?? 500 },
    );
  }
}

async function updateProfileHandler(request: AuthenticatedRequest) {
  try {
    const sp1 = sp1ForUser(request);
    if (!sp1) {
      return NextResponse.json(
        { success: false, message: 'Invalid session' },
        { status: 401 },
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: 'Invalid request body.' },
        { status: 400 },
      );
    }

    // Whitelist: only forward editable fields, normalizing '' to null.
    const normalized: Record<string, unknown> = {};
    for (const key of [...USER_FIELDS, ...APPLICANT_FIELDS]) {
      if (key in body) normalized[key] = body[key] === '' ? null : body[key];
    }

    if (Object.keys(normalized).length === 0) {
      return NextResponse.json(
        { success: false, message: 'No editable fields supplied.' },
        { status: 400 },
      );
    }

    const userPatch = pick(normalized, USER_FIELDS);
    const applicantPatch = pick(normalized, APPLICANT_FIELDS);

    // One call does both writes: sp1's user update applies a top-level
    // `applicant` key to the doc at users.applicantId, resolving that id
    // server-side from the caller's own record — so no id crosses the wire —
    // and fires the PEO sync from there. See gig-v4-backend
    // controllers/users/userUpdate.controller.ts.
    const email = request.user.email!;
    const wantsApplicantWrite = Object.keys(applicantPatch).length > 0;
    const { data } = await sp1.put(`/users/email/${encodeURIComponent(email)}`, {
      ...userPatch,
      ...(wantsApplicantWrite ? { applicant: applicantPatch } : {}),
    });

    // sp1 echoes the applicant updateOne result. When the users doc has no
    // applicantId it resolves nothing and the cascade quietly matches zero
    // docs — the exact silent-drop this endpoint used to have. Surface it
    // rather than reporting a save that never reached the admin side.
    const applicantResult = (data as { applicantUpdate?: { matchedCount?: number } })
      ?.applicantUpdate;
    if (wantsApplicantWrite && !applicantResult?.matchedCount) {
      return NextResponse.json(
        {
          success: false,
          message: 'No employee record is linked to this account.',
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const e = error as { response?: { status?: number; data?: unknown }; message?: string };
    console.error('Error updating profile:', e.message);
    return NextResponse.json(
      e.response?.data ?? { success: false, message: 'Internal server error' },
      { status: e.response?.status ?? 500 },
    );
  }
}

export const GET = withEnhancedAuthAPI(getProfileHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});

export const PUT = withEnhancedAuthAPI(updateProfileHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
