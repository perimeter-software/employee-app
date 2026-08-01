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
 * client. Reads and writes are proxied to sp1-api's by-email user routes
 * (GET/PUT /users/email/:email).
 */

// Fields a user is allowed to edit on their own profile. Deliberately excludes
// userType / status / employeeType / dates etc. — those are admin-controlled.
const EDITABLE_FIELDS = [
  'firstName',
  'lastName',
  'primaryPhone',
  'secondaryPhone',
  'mobile',
  'address',
  'city',
  'state',
  'zip',
  'profileImg',
] as const;

function sp1ForUser(request: AuthenticatedRequest) {
  const user = request.user;
  if (!user?.sub || !user?.email) return null;
  const { tenant } = user;
  return getSp1Client(user.sub, user.email, tenant?.clientDomain || tenant?.url);
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
    const { data } = await sp1.get(`/users/email/${encodeURIComponent(email)}`);
    // sp1 returns the user document directly (optionally with applicant appended).
    return NextResponse.json({ success: true, data });
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

    // Whitelist: only forward editable fields the user is allowed to change.
    const patch: Record<string, unknown> = {};
    for (const key of EDITABLE_FIELDS) {
      if (key in body) patch[key] = body[key] === '' ? null : body[key];
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { success: false, message: 'No editable fields supplied.' },
        { status: 400 },
      );
    }

    const email = request.user.email!;
    const { data } = await sp1.put(
      `/users/email/${encodeURIComponent(email)}`,
      patch,
    );
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
