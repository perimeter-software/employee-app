// app/api/auth/otp/select-tenant/route.ts
//
// Step two of applicant login, reached only when the verified email exists in
// more than one eligible tenant. Authorized by the single-use ticket minted by
// /api/auth/otp/verify — see lib/auth/tenant-selection-ticket.ts.
import { NextRequest, NextResponse } from 'next/server';
import {
  buildApplicantSessionData,
  createOtpSession,
  setOtpSessionCookies,
} from '@/lib/auth/applicant-session';
import {
  consumeTenantSelectionTicket,
  readTenantSelectionTicket,
} from '@/lib/auth/tenant-selection-ticket';
import { logOtpLoginActivity } from '@/lib/auth/otp-login-activity';

export const dynamic = 'force-dynamic';

function normalizeDomain(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
}

export async function POST(request: NextRequest) {
  try {
    const { ticket, tenantDomain } = await request.json();

    if (typeof ticket !== 'string' || typeof tenantDomain !== 'string') {
      return NextResponse.json(
        { error: 'Ticket and tenant are required.' },
        { status: 400 }
      );
    }

    const ticketData = await readTenantSelectionTicket(ticket);
    if (!ticketData) {
      return NextResponse.json(
        { error: 'This selection expired. Please sign in again.' },
        { status: 400 }
      );
    }

    // Only a tenant that was actually offered may be redeemed.
    const target = normalizeDomain(tenantDomain);
    const isAllowed = ticketData.allowedDomains.some(
      (d) => normalizeDomain(d) === target
    );
    if (!isAllowed) {
      console.warn(
        `[tenant-selection] ${ticketData.email} tried to redeem "${tenantDomain}", which was not offered.`
      );
      return NextResponse.json(
        { error: 'That option is no longer available. Please sign in again.' },
        { status: 400 }
      );
    }

    const result = await buildApplicantSessionData(
      ticketData.email,
      ticketData.returnTo,
      tenantDomain
    );

    // Burn the ticket regardless of outcome — one attempt per verification.
    await consumeTenantSelectionTicket(ticket);

    if (result.ok === 'needs-tenant-selection') {
      // Only reachable if the chosen tenant vanished between the two calls.
      return NextResponse.json(
        { error: 'Could not confirm that selection. Please sign in again.' },
        { status: 409 }
      );
    }

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    const sessionId = await createOtpSession(result.sessionData);
    await logOtpLoginActivity(ticketData.email, result.sessionData, true);

    const response = NextResponse.json({
      success: true,
      redirectUrl: result.redirectUrl,
      message: 'Tenant selected successfully',
    });
    setOtpSessionCookies(response, sessionId);
    return response;
  } catch (error) {
    console.error('Error selecting tenant:', error);
    return NextResponse.json(
      { error: 'An error occurred. Please try again.' },
      { status: 500 }
    );
  }
}
