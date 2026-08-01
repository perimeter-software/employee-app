import { ObjectId, type Db } from 'mongodb';

type RosterUser = {
  _id?: string;
  userId?: string;
  userType?: string;
  employeeType?: string;
};

/**
 * Resolves which venues a user may manage rosters for.
 *
 * - Master / Admin → `all: true` (unrestricted).
 * - Client         → limited to their `clientOrgs` slugs.
 * - Event Admin    → (userType 'User' + employeeType 'Event Admin') limited to `clientOrgs` slugs.
 * - any other User → no access.
 *
 * clientOrgs is read fresh from the `users` collection (the session token does not
 * carry it), matching how the current-user and roster-status routes resolve it.
 */
export async function getRosterVenueAccess(
  db: Db,
  user: RosterUser
): Promise<{ all: boolean; slugs: Set<string> }> {
  if (user.userType === 'Master' || user.userType === 'Admin') {
    return { all: true, slugs: new Set() };
  }

  const isEventAdmin =
    user.userType === 'User' && user.employeeType === 'Event Admin';
  const isClient = user.userType === 'Client';
  if (!isClient && !isEventAdmin) {
    return { all: false, slugs: new Set() };
  }

  const userId = user.userId ?? user._id;
  if (!userId || !ObjectId.isValid(String(userId))) {
    return { all: false, slugs: new Set() };
  }

  const doc = await db
    .collection('users')
    .findOne({ _id: new ObjectId(String(userId)) }, { projection: { clientOrgs: 1 } });
  const orgs =
    (doc as { clientOrgs?: { slug?: string }[] } | null)?.clientOrgs ?? [];
  return {
    all: false,
    slugs: new Set(orgs.map((o) => o.slug ?? '').filter(Boolean)),
  };
}

/** True when the user may manage the roster for `venueSlug`. */
export async function canManageRoster(
  db: Db,
  user: RosterUser,
  venueSlug: string
): Promise<boolean> {
  const access = await getRosterVenueAccess(db, user);
  return access.all || access.slugs.has(venueSlug);
}
