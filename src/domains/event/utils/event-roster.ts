import { ObjectId, type Db } from 'mongodb';

/**
 * Data access for the `eventroster` collection.
 *
 * Roster entries used to be an embedded `events.applicants` array. They now live one
 * document per entry in `eventroster`, keyed back to the event by `eventId`.
 * gig-v4-backend hydrates `event.applicants` when it serves events over HTTP so the
 * API contract is unchanged — but a DIRECT Mongo read (which this app does) sees no
 * such field. Anything deriving roster status from `eventDoc.applicants` therefore
 * finds nothing and reports every applicant as "Not Roster".
 *
 * Mirrors gig-v4-backend `utils/eventRosterUtils`.
 */
export const EVENT_ROSTER_COLLECTION = 'eventroster';

export type EventRosterEntry = {
  id?: string;
  status?: string;
  timeIn?: string | null;
  timeOut?: string | null;
  reportTime?: string | null;
  primaryPosition?: string | null;
  position?: string | null;
  partnerSlug?: string;
  dateModified?: string;
  agent?: string | null;
  [k: string]: unknown;
};

const toObjectId = (id: string | ObjectId): ObjectId =>
  id instanceof ObjectId ? id : new ObjectId(String(id));

/** Strip storage-only fields so an eventroster doc matches an embedded applicants[] entry. */
function toRosterEntry(doc: Record<string, unknown>): EventRosterEntry {
  const entry = { ...doc };
  delete entry._id;
  delete entry.eventId;
  return entry as EventRosterEntry;
}

/**
 * Fetch an event's roster entries (optionally narrowed by an entry-level filter,
 * e.g. `{ status: 'Roster' }`). Storage-only fields (`_id`, `eventId`) are stripped so
 * each entry matches the legacy embedded `applicants[]` shape exactly — the same
 * normalization the backend's `toRosterEntry` performs.
 */
export async function getEventRosterEntries(
  db: Db,
  eventId: string | ObjectId,
  entryFilter: Record<string, unknown> = {}
): Promise<EventRosterEntry[]> {
  const docs = await db
    .collection(EVENT_ROSTER_COLLECTION)
    .find({ eventId: toObjectId(eventId), ...entryFilter })
    .toArray();
  return docs.map(toRosterEntry);
}

/** Single roster entry for one applicant on one event (optionally further filtered). */
export async function getRosterEntry(
  db: Db,
  eventId: string | ObjectId,
  applicantId: string,
  entryFilter: Record<string, unknown> = {}
): Promise<EventRosterEntry | null> {
  const doc = await db
    .collection(EVENT_ROSTER_COLLECTION)
    .findOne({ eventId: toObjectId(eventId), id: applicantId, ...entryFilter });
  return doc ? toRosterEntry(doc) : null;
}

/**
 * How many `Roster` entries occupy each position on one event, keyed by position name.
 *
 * Replaces counting over an embedded `applicants[]` array — the shape callers need to
 * decide whether a capped position still has room. Mongo stores the position as
 * `position` while SP1 exposes it as `primaryPosition`, so both are read (same
 * precedence the event-detail route uses for a single entry). Entries with no position
 * are skipped rather than folded into a default, matching the old strict-equality
 * comparison against `positionName`.
 */
export async function getRosterPositionCounts(
  db: Db,
  eventId: string | ObjectId
): Promise<Record<string, number>> {
  const entries = await getEventRosterEntries(db, eventId, { status: 'Roster' });
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    const name = String(entry.primaryPosition ?? entry.position ?? '').trim();
    if (!name) continue;
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return counts;
}

/**
 * Distinct event ids whose roster matches an entry-level filter — the building block
 * for every legacy `'applicants.id': x` / `$elemMatch` event query.
 * e.g. `findRosterEventIds(db, { id: applicantId, status: 'Roster' })`.
 */
export async function findRosterEventIds(
  db: Db,
  entryFilter: Record<string, unknown>
): Promise<ObjectId[]> {
  return db
    .collection(EVENT_ROSTER_COLLECTION)
    .distinct('eventId', entryFilter) as Promise<ObjectId[]>;
}

/** Roster entries for many events, grouped by event id string. One query. */
export async function getRostersByEventIds(
  db: Db,
  eventIds: (string | ObjectId)[],
  entryFilter: Record<string, unknown> = {}
): Promise<Map<string, EventRosterEntry[]>> {
  const byEventId = new Map<string, EventRosterEntry[]>();
  if (!eventIds.length) return byEventId;
  const docs = await db
    .collection(EVENT_ROSTER_COLLECTION)
    .find({ eventId: { $in: eventIds.map(toObjectId) }, ...entryFilter })
    .toArray();
  for (const doc of docs) {
    const key = String((doc as unknown as { eventId: ObjectId }).eventId);
    if (!byEventId.has(key)) byEventId.set(key, []);
    byEventId.get(key)!.push(toRosterEntry(doc));
  }
  return byEventId;
}

/**
 * Update matching entries on one event — the equivalent of
 * `$set { 'applicants.$[elem].field': ... }` with arrayFilters. `update` is a full
 * Mongo update document (`{ $set: {...} }`).
 */
export async function updateRosterEntries(
  db: Db,
  eventId: string | ObjectId,
  entryFilter: Record<string, unknown>,
  update: Record<string, unknown>
) {
  return db
    .collection(EVENT_ROSTER_COLLECTION)
    .updateMany({ eventId: toObjectId(eventId), ...entryFilter }, update);
}
