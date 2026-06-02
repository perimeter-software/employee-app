import { NextResponse } from 'next/server';
import { AuthenticatedRequest, withEnhancedAuthAPI } from '@/lib/middleware';
import { getSp1Client } from '@/lib/sp1Client';

// Force dynamic rendering for authenticated routes
export const dynamic = 'force-dynamic';

/**
 * Identity (AWS SES sender) verification for the logged-in user's own email.
 *
 * Ports the "Identity Verified" control from the stadium-people / gignology-v4
 * profile screen. Gated to Master / Admin users — matching the legacy gating
 * (regular employees never see or hit this). Proxies to sp1-api:
 *   GET    /users/ses/verified/:email
 *   POST   /users/ses/verified         { email, createAgent }
 *   DELETE /users/ses/verified/:email
 */

const ALLOWED_USER_TYPES = ['Master', 'Admin'];

function sp1ForUser(request: AuthenticatedRequest) {
  const user = request.user;
  if (!user?.sub || !user?.email) return null;
  const { tenant } = user;
  return getSp1Client(user.sub, user.email, tenant?.clientDomain || tenant?.url);
}

function ensureAllowed(request: AuthenticatedRequest) {
  return ALLOWED_USER_TYPES.includes(String(request.user?.userType ?? ''));
}

async function getIdentityHandler(request: AuthenticatedRequest) {
  if (!ensureAllowed(request)) {
    return NextResponse.json(
      { success: false, message: 'Access denied.' },
      { status: 403 },
    );
  }
  try {
    const sp1 = sp1ForUser(request);
    if (!sp1) {
      return NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 });
    }
    const email = request.user.email!;
    const { data } = await sp1.get(`/users/ses/verified/${encodeURIComponent(email)}`);
    // sp1 returns { email, status }
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const e = error as { response?: { status?: number; data?: unknown }; message?: string };
    // 404 => no identity on file; treat as "none" rather than an error.
    if (e.response?.status === 404) {
      return NextResponse.json({ success: true, data: { status: 'none' } });
    }
    console.error('Error fetching SES identity:', e.message);
    return NextResponse.json(
      e.response?.data ?? { success: false, message: 'Internal server error' },
      { status: e.response?.status ?? 500 },
    );
  }
}

async function submitIdentityHandler(request: AuthenticatedRequest) {
  if (!ensureAllowed(request)) {
    return NextResponse.json(
      { success: false, message: 'Access denied.' },
      { status: 403 },
    );
  }
  try {
    const sp1 = sp1ForUser(request);
    if (!sp1) {
      return NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 });
    }
    const email = request.user.email!;
    const createAgent = request.user._id ?? request.user.sub;
    const { data } = await sp1.post(`/users/ses/verified`, { email, createAgent });
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const e = error as { response?: { status?: number; data?: unknown }; message?: string };
    console.error('Error submitting SES identity:', e.message);
    return NextResponse.json(
      e.response?.data ?? { success: false, message: 'Internal server error' },
      { status: e.response?.status ?? 500 },
    );
  }
}

async function removeIdentityHandler(request: AuthenticatedRequest) {
  if (!ensureAllowed(request)) {
    return NextResponse.json(
      { success: false, message: 'Access denied.' },
      { status: 403 },
    );
  }
  try {
    const sp1 = sp1ForUser(request);
    if (!sp1) {
      return NextResponse.json({ success: false, message: 'Invalid session' }, { status: 401 });
    }
    const email = request.user.email!;
    const { data } = await sp1.delete(`/users/ses/verified/${encodeURIComponent(email)}`);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const e = error as { response?: { status?: number; data?: unknown }; message?: string };
    console.error('Error removing SES identity:', e.message);
    return NextResponse.json(
      e.response?.data ?? { success: false, message: 'Internal server error' },
      { status: e.response?.status ?? 500 },
    );
  }
}

export const GET = withEnhancedAuthAPI(getIdentityHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});

export const POST = withEnhancedAuthAPI(submitIdentityHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});

export const DELETE = withEnhancedAuthAPI(removeIdentityHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
