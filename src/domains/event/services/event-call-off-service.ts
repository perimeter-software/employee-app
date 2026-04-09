import 'server-only';

import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { convertToJSON } from '@/lib/utils/mongo-utils';
import type { Document } from 'mongodb';
import {
  EVENT_CALL_OFF_DOC_FILTER,
  EVENT_COVER_STORAGE_COLLECTION,
} from '@/domains/event/services/event-cover-constants';
import {
  assertEventCoverTimeWindow,
  EventCoverError,
} from '@/domains/event/services/event-cover-request-service';
import {
  getEventManagerEmailFromEventDoc,
  notifyEventManagerCallOff,
} from '@/domains/event/services/event-cover-notifications';

export type EventCallOffRequestDoc = {
  _id: ObjectId;
  type: 'call-off';
  eventUrl: string;
  status: 'pending_approval';
  fromEmployeeId: string;
  toEmployeeId: null;
  notes?: string;
  submittedAt: Date;
  resolvedAt?: Date | null;
  resolvedBy?: string | null;
  resolution?: string | null;
};

function getEmployeeIdFromUser(user: AuthenticatedRequest['user']): string {
  if (user.applicantId) return String(user.applicantId);
  if (user.userId) return String(user.userId);
  if (user._id) return String(user._id);
  return '';
}

function rosterIdMatches(stored: unknown, employeeId: string): boolean {
  if (stored == null || !employeeId) return false;
  return String(stored) === String(employeeId);
}

export function toPublicEventCallOff(doc: EventCallOffRequestDoc | null): object | null {
  if (!doc) return null;
  const j = convertToJSON(doc as unknown as Document) as Record<string, unknown>;
  return {
    _id: j._id,
    type: j.type,
    eventUrl: j.eventUrl,
    status: j.status,
    fromEmployeeId: j.fromEmployeeId,
    toEmployeeId: null,
    ...(j.notes != null && j.notes !== '' ? { notes: j.notes } : {}),
    submittedAt: j.submittedAt,
    resolvedAt: j.resolvedAt ?? null,
    resolvedBy: j.resolvedBy ?? null,
    resolution: j.resolution ?? null,
  };
}

export async function createEventCallOffRequest(
  db: Db,
  user: AuthenticatedRequest['user'],
  eventId: string,
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

  const col = db.collection<EventCallOffRequestDoc>(EVENT_COVER_STORAGE_COLLECTION);
  const eid = eventId.trim();

  const event = await db.collection('events').findOne(
    { _id: new ObjectId(eid) },
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

  const applicants =
    (event.applicants as Array<{ id?: string; status?: string }>) ?? [];
  const onRoster = applicants.some(
    (a) => rosterIdMatches(a.id, fromEmployeeId) && a.status === 'Roster'
  );
  if (!onRoster) {
    throw new EventCoverError(
      'event-cover-invalid',
      'You must be on the roster for this event to call off.',
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
    ...EVENT_CALL_OFF_DOC_FILTER,
    eventUrl,
    fromEmployeeId,
  });
  if (dup) {
    throw new EventCoverError(
      'duplicate-request',
      'You already have a pending call-off request for this event.',
      400
    );
  }

  const doc: EventCallOffRequestDoc = {
    _id: new ObjectId(),
    type: 'call-off',
    eventUrl,
    status: 'pending_approval',
    fromEmployeeId,
    toEmployeeId: null,
    submittedAt: new Date(),
    resolvedAt: null,
    resolvedBy: null,
    resolution: null,
    ...(notes?.trim() ? { notes: notes.trim().slice(0, 5000) } : {}),
  };

  await col.insertOne(doc);

  const managerEmail = getEventManagerEmailFromEventDoc(event);
  if (managerEmail) {
    void notifyEventManagerCallOff(db, {
      managerEmail,
      fromEmployeeId,
      eventName: String(event.eventName || 'Event'),
      eventUrl,
      notes: notes?.trim(),
    });
  }

  const created = await col.findOne({ _id: doc._id });
  return toPublicEventCallOff(created!) as object;
}

export async function deleteEventCallOffRequest(
  db: Db,
  user: AuthenticatedRequest['user'],
  requestId: string
): Promise<{ deleted: boolean }> {
  if (user.userType === 'Client') {
    throw new EventCoverError(
      'unauthorized',
      'Access denied. Employee account required.',
      403
    );
  }

  const fromEmployeeId = getEmployeeIdFromUser(user);
  if (!fromEmployeeId || !ObjectId.isValid(requestId)) {
    throw new EventCoverError('invalid-id', 'Invalid request.', 400);
  }

  const _id = new ObjectId(requestId);
  const col = db.collection<EventCallOffRequestDoc>(EVENT_COVER_STORAGE_COLLECTION);
  const res = await col.deleteOne({
    _id,
    ...EVENT_CALL_OFF_DOC_FILTER,
    fromEmployeeId,
  });

  if (res.deletedCount === 0) {
    throw new EventCoverError('not-found', 'Call-off request not found.', 404);
  }

  return { deleted: true };
}
