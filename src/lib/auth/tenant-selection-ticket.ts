// lib/auth/tenant-selection-ticket.ts
//
// When an applicant's email exists in more than one eligible tenant, login
// becomes two steps: verify the code, then pick the tenant. The OTP code is
// consumed by step one, so step two is authorized by this short-lived,
// single-use ticket instead — the code is never left redeemable while the
// applicant thinks about which company they meant.
//
// The ticket also pins the choices: only a domain that was offered can be
// redeemed, so the second request can't be used to reach a tenant the applicant
// has no record in.
import crypto from 'crypto';
import redisService from '@/lib/cache/redis-client';

const TICKET_TTL_SECONDS = 5 * 60;
const ticketKey = (ticket: string) => `tenant_select:${ticket}`;

export interface TenantSelectionTicketData {
  email: string;
  /** Canonical clientDomains offered to the applicant. */
  allowedDomains: string[];
  returnTo?: string;
  createdAt: string;
}

export async function createTenantSelectionTicket(
  email: string,
  allowedDomains: string[],
  returnTo?: string
): Promise<string> {
  const ticket = crypto.randomUUID();
  const data: TenantSelectionTicketData = {
    email,
    allowedDomains,
    returnTo,
    createdAt: new Date().toISOString(),
  };
  await redisService.set(ticketKey(ticket), data, TICKET_TTL_SECONDS);
  return ticket;
}

export async function readTenantSelectionTicket(
  ticket: string
): Promise<TenantSelectionTicketData | null> {
  if (!ticket || typeof ticket !== 'string') return null;
  return redisService.get<TenantSelectionTicketData>(ticketKey(ticket));
}

/** Single use: redeem once, then it's gone even if the caller retries. */
export async function consumeTenantSelectionTicket(
  ticket: string
): Promise<void> {
  await redisService.del(ticketKey(ticket));
}
