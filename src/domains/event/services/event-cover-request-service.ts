import 'server-only';

import { NextResponse } from 'next/server';
import type { Db, Document } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { convertToJSON } from '@/lib/utils/mongo-utils';
import {
  EVENT_COVER_DOC_FILTER,
  EVENT_COVER_STORAGE_COLLECTION,
} from '@/domains/event/services/event-cover-constants';
import {
  getEventManagerEmailFromEventDoc,
  notifyEventCoverAcceptedByPeer,
  notifyEventCoverApprovedByAdmin,
  notifyEventCoverDeclinedByPeer,
  notifyEventCoverRejectedByAdmin,
  notifyEventCoverRequestCreated,
  notifyEventManagerCoverPeerAccepted,
} from '@/domains/event/services/event-cover-notifications';

const ADMIN_TYPES = new Set(['Admin', 'Master']);

export class EventCoverError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number = 400
  ) {
    super(message);
    this.name = 'EventCoverError';
  }
}

export function eventCoverErrorResponse(error: unknown): NextResponse {
  if (error instanceof EventCoverError) {
    return NextResponse.json(
      { error: error.code, message: error.message },
      { status: error.httpStatus }
    );
  }
  console.error('[event-cover-request-service]', error);
  return NextResponse.json(
    {
      error: 'internal-error',
      message: 'Internal server error',
      details: error instanceof Error ? error.message : String(error),
    },
    { status: 500 }
  );
}

/**
 * Stored in `swap-requests` with non-empty `eventUrl` (shift swaps omit `eventUrl`).
 * Event row is resolved by `eventUrl` only (no `eventId` on this document).
 */
export type EventCoverRequestDoc = {
  _id: ObjectId;
  type: 'swap';
  eventUrl: string;
  status:
    | 'pending_match'
    | 'pending_approval'
    | 'approved'
    | 'rejected'
    | 'expired';
  fromEmployeeId: string;
  toEmployeeId: string;
  notes?: string;
  submittedAt: Date;
  resolvedAt?: Date | null;
  resolvedBy?: string | null;
  resolution?: string | null;
};

const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function isValidEmailFormat(email: string): boolean {
  return email.length > 3 && email.length < 320 && EMAIL_RE.test(email);
}

export function assertEventCoverTimeWindow(eventStart: Date): void {
  const now = Date.now();
  const start = eventStart.getTime();
  const hours = (start - now) / (1000 * 60 * 60);
  if (hours <= 0) {
    throw new EventCoverError(
      'event-cover-window',
      'This event has already started or ended.',
      400
    );
  }
  if (hours < 2) {
    throw new EventCoverError(
      'event-cover-window',
      'Cover requests are only available at least 2 hours before the event.',
      400
    );
  }
  if (hours > 48) {
    throw new EventCoverError(
      'event-cover-window',
      'Cover requests are only available within 48 hours before the event.',
      400
    );
  }
}

type VenueEntry = { venueSlug?: string; status?: string };

function hasStaffingPoolForVenue(
  venues: VenueEntry[] | undefined,
  venueSlug: string
): boolean {
  if (!venues?.length || !venueSlug) return false;
  return venues.some(
    (v) => v.venueSlug === venueSlug && String(v.status) === 'StaffingPool'
  );
}

function rosterIdMatches(stored: unknown, employeeId: string): boolean {
  if (stored == null || !employeeId) return false;
  return String(stored) === String(employeeId);
}

function getEmployeeIdFromUser(user: AuthenticatedRequest['user']): string {
  if (user.applicantId) return String(user.applicantId);
  if (user.userId) return String(user.userId);
  if (user._id) return String(user._id);
  return '';
}

function isAdminUser(user: AuthenticatedRequest['user']): boolean {
  return ADMIN_TYPES.has(String(user.userType));
}

function escapeRegexChars(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeEventUrlKey(s: string): string {
  const t = String(s || '').trim().replace(/\/+$/g, '');
  try {
    return decodeURIComponent(t).toLowerCase();
  } catch {
    return t.toLowerCase();
  }
}

/** Remove trailing "-sat-apr-04-2026" style segment for prefix/suffix DB matching */
function stripTrailingDateFromEventUrl(url: string): string {
  return String(url || '')
    .trim()
    .replace(/-(?:mon|tue|wed|thu|fri|sat|sun)-[a-z]{3}-\d{1,2}-\d{4}$/i, '');
}

function eventDateToIso(raw: unknown): string {
  if (raw instanceof Date) return raw.toISOString();
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return '';
}

type EventMetaProjection = { eventName?: unknown; eventUrl?: unknown; eventDate?: unknown };

/**
 * Resolve `events` row for a cover `eventUrl` when exact batch match failed.
 * Date/name for display must come from `events.eventDate` / `events.eventName`.
 */
async function findEventDocForCoverRequestUrl(
  db: Db,
  requestUrlRaw: string
): Promise<EventMetaProjection | null> {
  const requestUrl = String(requestUrlRaw || '').trim();
  if (!requestUrl) return null;

  const projection = { eventName: 1, eventUrl: 1, eventDate: 1 };
  const norm = normalizeEventUrlKey(requestUrl);

  let doc = await db.collection('events').findOne(
    { $expr: { $eq: [{ $toLower: '$eventUrl' }, norm] } },
    { projection }
  );
  if (doc) return doc as EventMetaProjection;

  doc = await db.collection('events').findOne(
    {
      eventUrl: {
        $regex: `^${escapeRegexChars(requestUrl)}$`,
        $options: 'i',
      },
    },
    { projection }
  );
  if (doc) return doc as EventMetaProjection;

  const stripped = stripTrailingDateFromEventUrl(requestUrl);
  if (stripped.length >= 16 && stripped !== requestUrl) {
    const c = await db
      .collection('events')
      .find(
        {
          eventType: 'Event',
          eventUrl: {
            $regex: `^${escapeRegexChars(stripped)}`,
            $options: 'i',
          },
        },
        { projection }
      )
      .limit(5)
      .toArray();
    if (c.length === 1) return c[0] as EventMetaProjection;
  }

  if (stripped.length >= 16) {
    const c = await db
      .collection('events')
      .find(
        {
          eventType: 'Event',
          eventUrl: {
            $regex: `${escapeRegexChars(stripped)}$`,
            $options: 'i',
          },
        },
        { projection }
      )
      .limit(5)
      .toArray();
    if (c.length === 1) return c[0] as EventMetaProjection;
  }

  const prefixOfRequest = await db
    .collection('events')
    .find(
      {
        eventType: 'Event',
        $expr: {
          $eq: [{ $indexOfCP: [requestUrl, '$eventUrl'] }, 0],
        },
      },
      { projection }
    )
    .toArray();
  if (prefixOfRequest.length === 1) {
    return prefixOfRequest[0] as EventMetaProjection;
  }
  if (prefixOfRequest.length > 1) {
    return prefixOfRequest.reduce((a, b) =>
      String(a.eventUrl || '').length > String(b.eventUrl || '').length ? a : b
    ) as EventMetaProjection;
  }

  return null;
}

async function loadEventRowByUrl(
  db: Db,
  eventUrl: string,
  projection: Record<string, 1>
): Promise<Record<string, unknown> | null> {
  const url = String(eventUrl || '').trim();
  if (!url) return null;
  const doc = await db
    .collection('events')
    .findOne({ eventUrl: url }, { projection });
  return doc as unknown as Record<string, unknown> | null;
}

/** Public JSON matches product contract (no `eventId`). */
export function toPublicEventCover(
  doc: EventCoverRequestDoc | null
): object | null {
  if (!doc) return null;
  const j = convertToJSON(doc as unknown as Document) as Record<string, unknown>;
  return {
    _id: j._id,
    type: j.type,
    eventUrl: j.eventUrl,
    status: j.status,
    fromEmployeeId: j.fromEmployeeId,
    toEmployeeId: j.toEmployeeId,
    ...(j.notes != null && j.notes !== '' ? { notes: j.notes } : {}),
    submittedAt: j.submittedAt,
    resolvedAt: j.resolvedAt ?? null,
    resolvedBy: j.resolvedBy ?? null,
    resolution: j.resolution ?? null,
  };
}

async function enrichEventCoverRowsWithEventMeta(
  db: Db,
  rows: EventCoverRequestDoc[]
): Promise<object[]> {
  const urls = [
    ...new Set(rows.map((r) => String(r.eventUrl || '').trim()).filter(Boolean)),
  ];

  const fromIds = [
    ...new Set(
      rows
        .map((r) => String(r.fromEmployeeId || ''))
        .filter((id) => ObjectId.isValid(id))
    ),
  ];
  const requestedByNameById = new Map<string, string>();
  if (fromIds.length > 0) {
    const applicants = await db
      .collection('applicants')
      .find(
        { _id: { $in: fromIds.map((id) => new ObjectId(id)) } },
        { projection: { firstName: 1, lastName: 1 } }
      )
      .toArray();
    for (const a of applicants) {
      const fn = typeof a.firstName === 'string' ? a.firstName.trim() : '';
      const ln = typeof a.lastName === 'string' ? a.lastName.trim() : '';
      const name = [fn, ln].filter(Boolean).join(' ');
      requestedByNameById.set(
        String(a._id),
        name.length > 0 ? name : 'Coworker'
      );
    }
  }

  if (urls.length === 0) {
    return rows
      .map((r) => {
        const pub = toPublicEventCover(r) as Record<string, unknown> | null;
        if (!pub) return null;
        const fromId = String(r.fromEmployeeId || '');
        const requestedByName = ObjectId.isValid(fromId)
          ? requestedByNameById.get(fromId)
          : undefined;
        return {
          ...pub,
          ...(requestedByName ? { requestedByName } : {}),
        };
      })
      .filter((x): x is object => x != null);
  }
  const uniqueNorms = [...new Set(urls.map(normalizeEventUrlKey))].filter(
    Boolean
  );

  const events = await db
    .collection('events')
    .find(
      {
        $expr: {
          $in: [{ $toLower: '$eventUrl' }, uniqueNorms],
        },
      },
      { projection: { eventName: 1, eventUrl: 1, eventDate: 1 } }
    )
    .toArray();

  const metaByNorm = new Map<
    string,
    { eventName: string; eventDate: string }
  >();
  const recordMeta = (e: (typeof events)[number]) => {
    const u = String(e.eventUrl || '').trim();
    if (!u) return;
    const k = normalizeEventUrlKey(u);
    if (!k || metaByNorm.has(k)) return;
    const eventDate = eventDateToIso(e.eventDate);
    metaByNorm.set(k, {
      eventName: String(e.eventName || ''),
      eventDate,
    });
  };
  for (const e of events) recordMeta(e);

  const result: object[] = [];
  for (const r of rows) {
    const pub = toPublicEventCover(r) as Record<string, unknown> | null;
    if (!pub) continue;
    const u = String(r.eventUrl || '').trim();
    const k = normalizeEventUrlKey(u);
    let meta = k ? metaByNorm.get(k) : undefined;

    if (!meta && u) {
      const doc = await findEventDocForCoverRequestUrl(db, u);
      if (doc) {
        meta = {
          eventName: String(doc.eventName ?? ''),
          eventDate: eventDateToIso(doc.eventDate),
        };
        if (k) metaByNorm.set(k, meta);
        const docKey = normalizeEventUrlKey(String(doc.eventUrl ?? ''));
        if (docKey && docKey !== k) metaByNorm.set(docKey, meta);
      }
    }

    const fromId = String(r.fromEmployeeId || '');
    const requestedByName = ObjectId.isValid(fromId)
      ? requestedByNameById.get(fromId)
      : undefined;

    const nameFromDb = meta?.eventName?.trim();
    const dateFromDb = meta?.eventDate?.trim();
    const eventName = nameFromDb || u || 'Event';
    /** Only `events.eventDate` — no date parsed from URL slug */
    const eventDate = dateFromDb || undefined;

    result.push({
      ...pub,
      eventName,
      ...(eventDate ? { eventDate } : {}),
      ...(requestedByName ? { requestedByName } : {}),
    });
  }

  return result;
}

export async function createEventCoverRequest(
  db: Db,
  user: AuthenticatedRequest['user'],
  eventId: string,
  peerEmailRaw: string,
  notes?: string
): Promise<object> {
  if (user.userType === 'Client') {
    throw new EventCoverError(
      'unauthorized',
      'Access denied. Employee account required.',
      403
    );
  }

  const fromEmployeeId = getEmployeeIdFromUser(user);
  if (!fromEmployeeId || !ObjectId.isValid(fromEmployeeId)) {
    throw new EventCoverError(
      'missing-identifiers',
      'Missing employee identifier.',
      400
    );
  }

  if (!eventId?.trim() || !ObjectId.isValid(eventId.trim())) {
    throw new EventCoverError('invalid-id', 'Invalid event id.', 400);
  }

  const emailNorm = normalizeEmail(peerEmailRaw);
  if (!isValidEmailFormat(emailNorm)) {
    throw new EventCoverError(
      'event-cover-invalid',
      'Unable to complete this request.',
      400
    );
  }

  const col = db.collection<EventCoverRequestDoc>(
    EVENT_COVER_STORAGE_COLLECTION
  );

  const event = await db.collection('events').findOne(
    { _id: new ObjectId(eventId.trim()) },
    {
      projection: {
        eventName: 1,
        eventDate: 1,
        eventUrl: 1,
        venueSlug: 1,
        applicants: 1,
        eventType: 1,
        eventManager: 1,
      },
    }
  );

  if (!event) {
    throw new EventCoverError('not-found', 'Event not found.', 404);
  }

  if (String(event.eventType || '') !== 'Event') {
    throw new EventCoverError(
      'event-cover-invalid',
      'Unable to complete this request.',
      400
    );
  }

  const eventStart = new Date(event.eventDate as string);
  if (Number.isNaN(eventStart.getTime())) {
    throw new EventCoverError(
      'event-cover-invalid',
      'Unable to complete this request.',
      400
    );
  }

  assertEventCoverTimeWindow(eventStart);

  const venueSlug = String(event.venueSlug || '');
  const applicants =
    (event.applicants as Array<{ id?: string; status?: string }>) ?? [];

  const initiatorOnRoster = applicants.some(
    (a) => rosterIdMatches(a.id, fromEmployeeId) && a.status === 'Roster'
  );
  if (!initiatorOnRoster) {
    throw new EventCoverError(
      'event-cover-invalid',
      'You must be on the roster for this event to request a cover.',
      400
    );
  }

  const peer = await db.collection('applicants').findOne(
    {
      $or: [{ email: emailNorm }, { emailAddress: emailNorm }],
    },
    {
      projection: {
        _id: 1,
        email: 1,
        emailAddress: 1,
        venues: 1,
        employmentStatus: 1,
        status: 1,
      },
    }
  );

  if (!peer?._id) {
    throw new EventCoverError(
      'event-cover-invalid',
      'No employee account was found with that email address.',
      400
    );
  }

  if (
    String(peer.employmentStatus || '') !== 'Active' ||
    String(peer.status || '') !== 'Employee'
  ) {
    throw new EventCoverError(
      'event-cover-invalid',
      'That person must be an active employee to cover this event.',
      400
    );
  }

  const toEmployeeId = String(peer._id);
  if (toEmployeeId === fromEmployeeId) {
    throw new EventCoverError(
      'event-cover-invalid',
      'Choose a coworker other than yourself.',
      400
    );
  }

  if (!hasStaffingPoolForVenue(peer.venues as VenueEntry[] | undefined, venueSlug)) {
    throw new EventCoverError(
      'event-cover-invalid',
      'That person must be approved for this venue (staffing pool) before they can cover you.',
      400
    );
  }

  const peerOnRoster = applicants.some(
    (a) => rosterIdMatches(a.id, toEmployeeId) && a.status === 'Roster'
  );
  if (peerOnRoster) {
    throw new EventCoverError(
      'event-cover-invalid',
      'That person is already on the roster for this event.',
      400
    );
  }

  const eventUrl = String(event.eventUrl || '').trim();
  if (!eventUrl) {
    throw new EventCoverError(
      'event-cover-invalid',
      'Unable to complete this request.',
      400
    );
  }

  const dup = await col.findOne({
    ...EVENT_COVER_DOC_FILTER,
    eventUrl,
    fromEmployeeId,
    status: { $in: ['pending_match', 'pending_approval'] },
  });
  if (dup) {
    throw new EventCoverError(
      'duplicate-request',
      'You already have a pending cover request for this event.',
      400
    );
  }

  const doc: EventCoverRequestDoc = {
    _id: new ObjectId(),
    type: 'swap',
    eventUrl,
    status: 'pending_match',
    fromEmployeeId,
    toEmployeeId,
    submittedAt: new Date(),
    resolvedAt: null,
    resolvedBy: null,
    resolution: null,
    ...(notes?.trim() ? { notes: notes.trim().slice(0, 5000) } : {}),
  };

  await col.insertOne(doc);

  const rawEvDate = event.eventDate;
  const eventDateIso =
    rawEvDate instanceof Date
      ? rawEvDate.toISOString()
      : typeof rawEvDate === 'string'
        ? rawEvDate
        : '';

  await notifyEventCoverRequestCreated(db, {
    toEmployeeId,
    fromEmployeeId,
    eventName: String(event.eventName || 'Event'),
    eventDate: eventDateIso,
    eventTimeZone:
      typeof event.timeZone === 'string' ? event.timeZone : undefined,
  });

  const created = await col.findOne({ _id: doc._id });
  return toPublicEventCover(created) as object;
}

export async function acceptEventCoverRequest(
  db: Db,
  user: AuthenticatedRequest['user'],
  requestId: string
): Promise<object | null> {
  if (user.userType === 'Client') {
    throw new EventCoverError(
      'unauthorized',
      'Access denied. Employee account required.',
      403
    );
  }

  const employeeId = getEmployeeIdFromUser(user);
  if (!employeeId || !ObjectId.isValid(employeeId)) {
    throw new EventCoverError(
      'missing-identifiers',
      'Missing employee identifier.',
      400
    );
  }

  if (!ObjectId.isValid(requestId)) {
    throw new EventCoverError('invalid-id', 'Invalid request id.', 400);
  }

  const _id = new ObjectId(requestId);
  const col = db.collection<EventCoverRequestDoc>(
    EVENT_COVER_STORAGE_COLLECTION
  );
  const existing = await col.findOne({ _id, ...EVENT_COVER_DOC_FILTER });
  if (!existing) {
    throw new EventCoverError('not-found', 'Request not found.', 404);
  }

  if (existing.status !== 'pending_match') {
    throw new EventCoverError(
      'invalid-status',
      'This request cannot be accepted now.',
      400
    );
  }

  if (String(existing.toEmployeeId) !== employeeId) {
    throw new EventCoverError(
      'unauthorized',
      'Only the invited coworker can accept this cover request.',
      403
    );
  }

  const now = new Date();
  const updated = await col.findOneAndUpdate(
    { _id, status: 'pending_match', ...EVENT_COVER_DOC_FILTER },
    {
      $set: {
        status: 'pending_approval',
        resolution: 'pending_approval',
        resolvedAt: now,
      },
    },
    { returnDocument: 'after' }
  );

  if (!updated) {
    throw new EventCoverError('conflict', 'Request was updated. Retry.', 409);
  }

  const ev = await loadEventRowByUrl(db, updated.eventUrl, {
    eventName: 1,
    eventDate: 1,
    timeZone: 1,
    eventManager: 1,
  });
  const eventName = String(ev?.eventName || 'Event');
  const rawDate = ev?.eventDate;
  const eventDateIso =
    rawDate instanceof Date
      ? rawDate.toISOString()
      : typeof rawDate === 'string'
        ? rawDate
        : '';

  await notifyEventCoverAcceptedByPeer(db, {
    fromEmployeeId: updated.fromEmployeeId,
    toEmployeeId: updated.toEmployeeId,
    eventName,
    eventDate: eventDateIso,
    eventTimeZone: typeof ev?.timeZone === 'string' ? ev.timeZone : undefined,
  });

  const managerEmail = getEventManagerEmailFromEventDoc(ev);
  if (managerEmail) {
    void notifyEventManagerCoverPeerAccepted(db, {
      managerEmail,
      fromEmployeeId: updated.fromEmployeeId,
      toEmployeeId: updated.toEmployeeId,
      eventName,
      eventDate: eventDateIso,
      eventTimeZone:
        typeof ev?.timeZone === 'string' ? ev.timeZone : undefined,
    });
  }

  return toPublicEventCover(updated) as object;
}

export async function declineEventCoverRequest(
  db: Db,
  user: AuthenticatedRequest['user'],
  requestId: string
): Promise<object | null> {
  if (user.userType === 'Client') {
    throw new EventCoverError(
      'unauthorized',
      'Access denied. Employee account required.',
      403
    );
  }

  const employeeId = getEmployeeIdFromUser(user);
  if (!employeeId || !ObjectId.isValid(employeeId)) {
    throw new EventCoverError(
      'missing-identifiers',
      'Missing employee identifier.',
      400
    );
  }

  if (!ObjectId.isValid(requestId)) {
    throw new EventCoverError('invalid-id', 'Invalid request id.', 400);
  }

  const _id = new ObjectId(requestId);
  const col = db.collection<EventCoverRequestDoc>(
    EVENT_COVER_STORAGE_COLLECTION
  );
  const existing = await col.findOne({ _id, ...EVENT_COVER_DOC_FILTER });
  if (!existing) {
    throw new EventCoverError('not-found', 'Request not found.', 404);
  }

  if (existing.status !== 'pending_match') {
    throw new EventCoverError(
      'invalid-status',
      'This request cannot be declined now.',
      400
    );
  }

  if (String(existing.toEmployeeId) !== employeeId) {
    throw new EventCoverError(
      'unauthorized',
      'Only the invited coworker can decline this cover request.',
      403
    );
  }

  const now = new Date();
  const updated = await col.findOneAndUpdate(
    { _id, status: 'pending_match', ...EVENT_COVER_DOC_FILTER },
    {
      $set: {
        status: 'rejected',
        resolvedBy: employeeId,
        resolution: 'rejected',
        resolvedAt: now,
      },
    },
    { returnDocument: 'after' }
  );

  if (!updated) {
    throw new EventCoverError('conflict', 'Request was updated. Retry.', 409);
  }

  const ev = await loadEventRowByUrl(db, updated.eventUrl, {
    eventName: 1,
    eventDate: 1,
    timeZone: 1,
  });
  const rawDecl = ev?.eventDate;
  const eventDateIso =
    rawDecl instanceof Date
      ? rawDecl.toISOString()
      : typeof rawDecl === 'string'
        ? rawDecl
        : '';
  void notifyEventCoverDeclinedByPeer(db, {
    fromEmployeeId: updated.fromEmployeeId,
    toEmployeeId: employeeId,
    eventName: String(ev?.eventName || 'Event'),
    eventDate: eventDateIso,
    eventTimeZone: typeof ev?.timeZone === 'string' ? ev.timeZone : undefined,
  });

  return toPublicEventCover(updated) as object;
}

export async function listEventCoverRequests(
  db: Db,
  user: AuthenticatedRequest['user'],
  options?: {
    limit?: number;
    status?: string | null;
    /** Pending event-cover invites where the current user is `toEmployeeId`. */
    scope?: 'incoming';
  }
): Promise<object[]> {
  if (user.userType === 'Client') {
    throw new EventCoverError(
      'unauthorized',
      'Access denied. Employee account required.',
      403
    );
  }

  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 100);
  const col = db.collection<EventCoverRequestDoc>(
    EVENT_COVER_STORAGE_COLLECTION
  );

  if (isAdminUser(user)) {
    const filter: Record<string, unknown> = { ...EVENT_COVER_DOC_FILTER };
    const st = options?.status?.trim();
    if (st) filter.status = st;
    const rows = await col
      .find(filter)
      .sort({ submittedAt: -1 })
      .limit(limit)
      .toArray();
    return rows
      .map((d) => toPublicEventCover(d))
      .filter((x): x is object => x != null);
  }

  const employeeId = getEmployeeIdFromUser(user);
  if (!employeeId || !ObjectId.isValid(employeeId)) {
    throw new EventCoverError(
      'missing-identifiers',
      'Missing employee identifier.',
      400
    );
  }

  if (options?.scope === 'incoming') {
    const rows = await col
      .find({
        ...EVENT_COVER_DOC_FILTER,
        toEmployeeId: employeeId,
        status: 'pending_match',
      })
      .sort({ submittedAt: -1 })
      .limit(limit)
      .toArray();
    return enrichEventCoverRowsWithEventMeta(db, rows);
  }

  const rows = await col
    .find({
      ...EVENT_COVER_DOC_FILTER,
      $or: [{ fromEmployeeId: employeeId }, { toEmployeeId: employeeId }],
    })
    .sort({ submittedAt: -1 })
    .limit(limit)
    .toArray();
  return rows
    .map((d) => toPublicEventCover(d))
    .filter((x): x is object => x != null);
}

export async function applyEventCoverRosterOnApprove(
  db: Db,
  req: EventCoverRequestDoc
): Promise<void> {
  const url = String(req.eventUrl || '').trim();
  if (!url) {
    throw new EventCoverError(
      'invalid-request',
      'Invalid event reference on cover request.',
      400
    );
  }

  const fromId = String(req.fromEmployeeId);
  const toId = String(req.toEmployeeId || '');
  if (!toId) {
    throw new EventCoverError(
      'invalid-request',
      'Cover request is missing the replacement employee.',
      400
    );
  }

  const ev = await db.collection('events').findOne(
    { eventUrl: url },
    { projection: { applicants: 1 } }
  );

  if (!ev?.applicants || !Array.isArray(ev.applicants)) {
    throw new EventCoverError('not-found', 'Event not found.', 404);
  }

  const applicants = [...ev.applicants] as Array<Record<string, unknown>>;
  const idx = applicants.findIndex(
    (a) =>
      rosterIdMatches(a.id, fromId) && String(a.status) === 'Roster'
  );

  if (idx < 0) {
    throw new EventCoverError(
      'roster-update-failed',
      'Original employee is no longer on the event roster.',
      400
    );
  }

  const next = [...applicants];
  next[idx] = { ...next[idx], id: toId };

  const res = await db.collection('events').updateOne(
    { eventUrl: url },
    { $set: { applicants: next } }
  );

  if (res.matchedCount === 0) {
    throw new EventCoverError(
      'roster-update-failed',
      'Could not update event roster.',
      500
    );
  }
}

function resolverIdFromUser(user: AuthenticatedRequest['user']): string {
  if (user._id != null) return String(user._id);
  if (user.userId != null) return String(user.userId);
  if (user.applicantId != null) return String(user.applicantId);
  return 'unknown';
}

export async function approveEventCoverRequest(
  db: Db,
  user: AuthenticatedRequest['user'],
  id: string
): Promise<object | null> {
  if (!isAdminUser(user)) {
    throw new EventCoverError(
      'unauthorized',
      'Only administrators can approve.',
      403
    );
  }

  if (!ObjectId.isValid(id)) {
    throw new EventCoverError('invalid-id', 'Invalid request id.', 400);
  }

  const _id = new ObjectId(id);
  const col = db.collection<EventCoverRequestDoc>(
    EVENT_COVER_STORAGE_COLLECTION
  );
  const req = await col.findOne({ _id, ...EVENT_COVER_DOC_FILTER });
  if (!req) {
    throw new EventCoverError('not-found', 'Request not found.', 404);
  }

  if (req.status !== 'pending_approval') {
    throw new EventCoverError(
      'invalid-status',
      'Only pending_approval requests can be approved.',
      400
    );
  }

  await applyEventCoverRosterOnApprove(db, req);

  const resolverId = resolverIdFromUser(user);
  const after = await col.findOneAndUpdate(
    { _id, status: 'pending_approval', ...EVENT_COVER_DOC_FILTER },
    {
      $set: {
        status: 'approved',
        resolvedAt: new Date(),
        resolvedBy: resolverId,
        resolution: 'approved',
      },
    },
    { returnDocument: 'after' }
  );

  if (!after) {
    throw new EventCoverError(
      'internal-error',
      'Roster updated but request state could not be finalized.',
      500
    );
  }

  const ev = await loadEventRowByUrl(db, after.eventUrl, {
    eventName: 1,
    eventDate: 1,
    timeZone: 1,
  });
  const eventName = String(ev?.eventName || 'Event');
  const rawApprovedDate = ev?.eventDate;
  const approvedEventDateIso =
    rawApprovedDate instanceof Date
      ? rawApprovedDate.toISOString()
      : typeof rawApprovedDate === 'string'
        ? rawApprovedDate
        : '';
  await notifyEventCoverApprovedByAdmin(db, {
    fromEmployeeId: after.fromEmployeeId,
    toEmployeeId: after.toEmployeeId,
    eventName,
    eventDate: approvedEventDateIso,
    eventTimeZone: typeof ev?.timeZone === 'string' ? ev.timeZone : undefined,
  });

  return toPublicEventCover(after) as object;
}

export async function rejectEventCoverRequest(
  db: Db,
  user: AuthenticatedRequest['user'],
  id: string,
  reason?: string
): Promise<object | null> {
  if (!isAdminUser(user)) {
    throw new EventCoverError(
      'unauthorized',
      'Only administrators can reject.',
      403
    );
  }

  if (!ObjectId.isValid(id)) {
    throw new EventCoverError('invalid-id', 'Invalid request id.', 400);
  }

  const _id = new ObjectId(id);
  const col = db.collection<EventCoverRequestDoc>(
    EVENT_COVER_STORAGE_COLLECTION
  );
  const existing = await col.findOne({ _id, ...EVENT_COVER_DOC_FILTER });
  if (!existing) {
    throw new EventCoverError('not-found', 'Request not found.', 404);
  }

  const resolverId = resolverIdFromUser(user);
  const r = typeof reason === 'string' ? reason.trim() : '';
  const mergedNotes =
    r.length > 0
      ? existing.notes
        ? `${existing.notes}\n[reject] ${r}`
        : `[reject] ${r}`
      : existing.notes;

  const updated = await col.findOneAndUpdate(
    {
      _id,
      status: { $in: ['pending_match', 'pending_approval'] },
      ...EVENT_COVER_DOC_FILTER,
    },
    {
      $set: {
        status: 'rejected',
        resolvedAt: new Date(),
        resolvedBy: resolverId,
        resolution: 'rejected',
        ...(mergedNotes !== undefined ? { notes: mergedNotes } : {}),
      },
    },
    { returnDocument: 'after' }
  );

  if (!updated) {
    throw new EventCoverError(
      'invalid-status',
      'Request cannot be rejected in current state.',
      400
    );
  }

  const ev = await loadEventRowByUrl(db, updated.eventUrl, {
    eventName: 1,
    eventDate: 1,
    timeZone: 1,
  });
  const rawRejectedDate = ev?.eventDate;
  const rejectedEventDateIso =
    rawRejectedDate instanceof Date
      ? rawRejectedDate.toISOString()
      : typeof rawRejectedDate === 'string'
        ? rawRejectedDate
        : '';
  await notifyEventCoverRejectedByAdmin(db, {
    fromEmployeeId: updated.fromEmployeeId,
    eventName: String(ev?.eventName || 'Event'),
    eventDate: rejectedEventDateIso,
    eventTimeZone: typeof ev?.timeZone === 'string' ? ev.timeZone : undefined,
  });

  return toPublicEventCover(updated) as object;
}
