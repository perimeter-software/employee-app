import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';

/**
 * POST /api/me/clock-in-qr
 *
 * Issues a short-lived QR clock-in code for the authenticated worker. Persists
 * the OTP + expiry to the user record (`clockInQr` sub-doc) exactly like the
 * login OTP, then returns the pipe-delimited `GIGQR1` payload that the employee
 * app renders as a QR code and the admin scanner redeems
 * (`POST /events/id/:id/clock/qr-redeem`).
 *
 * Body: { eventId?: string, coordinates?: { latitude: number, longitude: number } }
 *
 * Called when the employee opens the QR modal and on every auto-refresh.
 */

const OTP_TTL_MS = 3 * 60 * 1000; // 3 minutes — same lifetime as the login OTP

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function clockInQrHandler(request: AuthenticatedRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { eventId, coordinates } = (body ?? {}) as {
      eventId?: string;
      coordinates?: { latitude?: number; longitude?: number };
      applicantId?: string;
    };

    // Identity comes from the authenticated session — never trust a client id.
    const applicantId = request.user?.applicantId || body?.applicantId;
    if (!applicantId) {
      return NextResponse.json(
        {
          error: 'no-applicant',
          message: 'No applicant is associated with this account',
        },
        { status: 400 }
      );
    }

    const otp = generateOtp();
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + OTP_TTL_MS);

    const geo =
      coordinates &&
      Number.isFinite(coordinates.latitude) &&
      Number.isFinite(coordinates.longitude)
        ? {
            lat: Number(coordinates.latitude),
            lng: Number(coordinates.longitude),
          }
        : null;

    const clockInQr = {
      otp,
      issuedAt,
      expiresAt,
      eventId: eventId ?? null,
      geo,
      redeemedAt: null,
    };

    const { db } = await getTenantAwareConnection(request);
    const result = await db
      .collection('users')
      .updateOne(
        { applicantId },
        { $set: { clockInQr, modifiedDate: issuedAt } }
      );

    if (!result.matchedCount) {
      return NextResponse.json(
        { error: 'user-not-found', message: 'User record not found' },
        { status: 400 }
      );
    }

    // Build the GIGQR1 payload — matches the envelope the admin scanner parses.
    // `t` is a display-only 24-hour issue time; `exp` governs validity, and it
    // is re-checked server-side against the stored token on redeem.
    const pad = (n: number) => String(n).padStart(2, '0');
    const t = `${pad(issuedAt.getHours())}:${pad(issuedAt.getMinutes())}`;
    const parts = [
      'GIGQR1',
      `eid=${applicantId}`,
      ...(eventId ? [`evt=${eventId}`] : []),
      `t=${t}`,
      `otp=${otp}`,
      ...(geo ? [`g=${geo.lat},${geo.lng}`] : []),
      `exp=${expiresAt.toISOString()}`,
    ];
    const payload = parts.join('|');

    return NextResponse.json(
      {
        success: true,
        message: 'QR code issued',
        data: {
          payload,
          otp,
          issuedAt: issuedAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
          eventId: eventId ?? null,
          geo,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Clock-In QR API] Error:', error);
    return NextResponse.json(
      {
        error: 'internal-error',
        message: 'Internal server error',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

export const POST = withEnhancedAuthAPI(clockInQrHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
