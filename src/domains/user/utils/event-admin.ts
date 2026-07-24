import type { EnhancedUser, ClientOrg } from '@/domains/user/types';

/**
 * An Event Admin is an employee (`userType === 'User'`) with
 * `employeeType === 'Event Admin'`. They keep the regular employee UI but gain
 * roster-management affordances on the venues they manage (their `clientOrgs`).
 * Mirrors the legacy stadium-people `isEventAdmin(userType, employeeType)` helper.
 */
export function isEventAdmin(user?: Pick<EnhancedUser, 'userType' | 'employeeType'> | null): boolean {
  return user?.userType === 'User' && user?.employeeType === 'Event Admin';
}

/** Venues an Event Admin (or Client) manages, as a Set of slugs. */
export function managedVenueSlugs(user?: { clientOrgs?: ClientOrg[] } | null): Set<string> {
  const orgs = user?.clientOrgs ?? [];
  return new Set(orgs.map((o) => o.slug).filter((s): s is string => !!s));
}

/** True when the given user can manage rosters for `venueSlug`. */
export function canManageEventVenue(
  user: (Pick<EnhancedUser, 'userType' | 'employeeType'> & { clientOrgs?: ClientOrg[] }) | undefined | null,
  venueSlug?: string
): boolean {
  if (!venueSlug) return false;
  if (!isEventAdmin(user) && user?.userType !== 'Client') return false;
  return managedVenueSlugs(user).has(venueSlug);
}
