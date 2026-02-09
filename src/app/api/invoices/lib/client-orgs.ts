/**
 * Client org helpers for Invoices API.
 * Replicates sp1-api logic: Client users only see data for venues in their clientOrgs.
 * No calls to sp1-api; uses tenant DB only.
 */

import type { AuthenticatedRequest } from '@/lib/middleware/types';
import { getTenantAwareConnection } from '@/lib/db';
import { ObjectId } from 'mongodb';

type ClientOrg = { slug?: string; userType?: string; status?: string };
type UserWithClientOrgs = { clientOrgs?: ClientOrg[] };

function extractClientOrgSlugs(clientOrgs: ClientOrg[] | undefined): string[] {
  if (!clientOrgs || !Array.isArray(clientOrgs)) return [];
  return clientOrgs
    .map((org) => org.slug)
    .filter((slug): slug is string => typeof slug === 'string' && slug.trim() !== '');
}

/**
 * Get venue slugs the current user (Client) is allowed to see.
 * Returns empty array if not Client or no clientOrgs.
 */
export async function getClientOrgSlugsForInvoices(
  request: AuthenticatedRequest
): Promise<string[]> {
  const user = request.user;
  if (user.userType !== 'Client') return [];

  if (!user._id) return [];

  const { db } = await getTenantAwareConnection(request);
  let userObjectId: ObjectId;
  try {
    userObjectId = new ObjectId(user._id.toString());
  } catch {
    return [];
  }

  const clientUser = await db.collection('users').findOne({ _id: userObjectId });
  const clientOrgs = (clientUser as UserWithClientOrgs | null)?.clientOrgs;
  return extractClientOrgSlugs(clientOrgs);
}

export function requireClientUser(request: AuthenticatedRequest): boolean {
  return request.user?.userType === 'Client';
}
