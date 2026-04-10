import 'server-only';

import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import type {
  AllowedAction,
  EnrollmentCheckResult,
  EnrollmentType,
} from '@/domains/event/services/event-service';

const MS_48H = 48 * 60 * 60 * 1000;

type ApplicantEntry = {
  id?: string;
  status?: string;
  positionName?: string;
  [key: string]: unknown;
};

type EventDoc = {
  eventDate?: string | Date;
  applicants?: ApplicantEntry[];
  positions?: Array<{ positionName?: string; numberPositions?: number }>;
  numberOnRoster?: number;
};

function rosterCapacity(event: EventDoc): number {
  const n = Number(event.numberOnRoster);
  if (Number.isFinite(n) && n > 0) return n;
  const positions = event.positions ?? [];
  if (positions.length === 0) return 999;
  const sum = positions.reduce(
    (s, p) => s + (Number(p.numberPositions) || 0),
    0
  );
  return sum > 0 ? sum : 999;
}

function findApplicant(
  applicants: ApplicantEntry[] | undefined,
  applicantId: string
): ApplicantEntry | undefined {
  return applicants?.find((a) => String(a.id) === String(applicantId));
}

function defaultSuccess(
  type: EnrollmentType,
  allowed: AllowedAction,
  extra: Partial<EnrollmentCheckResult> = {}
): EnrollmentCheckResult {
  return {
    type,
    allowed,
    message: extra.message ?? '',
    status: extra.status ?? 'Success',
    ...extra,
  };
}

export async function getEnrollmentForApplicant(
  db: Db,
  eventId: string,
  applicantId: string
): Promise<EnrollmentCheckResult> {
  if (!ObjectId.isValid(eventId) || !applicantId) {
    return defaultSuccess('Not Roster', 'Not Roster', {
      status: 'Error',
      message: 'Invalid event or user.',
    });
  }

  const event = (await db.collection('events').findOne(
    { _id: new ObjectId(eventId) },
    {
      projection: {
        eventDate: 1,
        applicants: 1,
        positions: 1,
        numberOnRoster: 1,
      },
    }
  )) as EventDoc | null;

  if (!event) {
    return defaultSuccess('Not Roster', 'Not Roster', {
      status: 'Error',
      message: 'Event not found.',
    });
  }

  const applicants = event.applicants ?? [];
  const entry = findApplicant(applicants, applicantId);
  const eventStart = new Date(event.eventDate as string);
  const now = Date.now();
  const within48hOfStart =
    !Number.isNaN(eventStart.getTime()) &&
    eventStart.getTime() - now < MS_48H &&
    eventStart.getTime() > now;

  if (entry) {
    const st = String(entry.status || '');
    if (st === 'Roster') {
      if (within48hOfStart) {
        return defaultSuccess('Roster', 'Roster', {
          status: 'Warning',
          message:
            'You cannot remove yourself from this event within 48 hours of the start time. Contact your event manager.',
        });
      }
      return defaultSuccess('Roster', 'Not Roster');
    }
    if (st === 'Waitlist') {
      return defaultSuccess('Waitlist', 'Not Roster');
    }
    if (st === 'Request') {
      return defaultSuccess('Request', 'Not Roster');
    }
    return defaultSuccess(st as EnrollmentType, 'Not Roster');
  }

  const rostered = applicants.filter((a) => a.status === 'Roster').length;
  const cap = rosterCapacity(event);
  const allowed: AllowedAction = rostered < cap ? 'Roster' : 'Waitlist';

  return defaultSuccess('Not Roster', allowed, {
    numEnrolled: rostered,
    capacity: cap,
  });
}

export async function applyEnrollmentChange(
  db: Db,
  eventId: string,
  applicantId: string,
  body: { requestType: string; positionName?: string }
): Promise<EnrollmentCheckResult> {
  const requestType = String(body.requestType || '') as EnrollmentType;
  if (!ObjectId.isValid(eventId) || !applicantId) {
    return defaultSuccess('Not Roster', 'Not Roster', {
      status: 'Error',
      message: 'Invalid event or user.',
    });
  }

  const oid = new ObjectId(eventId);
  const event = (await db.collection('events').findOne(
    { _id: oid },
    { projection: { eventDate: 1, applicants: 1, positions: 1, numberOnRoster: 1 } }
  )) as EventDoc | null;

  if (!event) {
    return defaultSuccess('Not Roster', 'Not Roster', {
      status: 'Error',
      message: 'Event not found.',
    });
  }

  const applicants = [...(event.applicants ?? [])];

  if (requestType === 'Not Roster') {
    const next = applicants.filter((a) => String(a.id) !== String(applicantId));
    await db.collection('events').updateOne({ _id: oid }, { $set: { applicants: next } });
    return getEnrollmentForApplicant(db, eventId, applicantId);
  }

  if (findApplicant(applicants, applicantId)) {
    return defaultSuccess('Not Roster', 'Not Roster', {
      status: 'Error',
      message: 'You are already linked to this event.',
    });
  }

  const positionName =
    typeof body.positionName === 'string' && body.positionName.trim()
      ? body.positionName.trim()
      : 'Event Staff';

  if (requestType === 'Roster') {
    const rostered = applicants.filter((a) => a.status === 'Roster').length;
    const cap = rosterCapacity(event);
    if (rostered >= cap) {
      return defaultSuccess('Not Roster', 'Waitlist', {
        status: 'Error',
        message: 'Roster is full. Try joining the waitlist.',
      });
    }
    applicants.push({
      id: applicantId,
      status: 'Roster',
      positionName,
    });
    await db.collection('events').updateOne({ _id: oid }, { $set: { applicants } });
    return getEnrollmentForApplicant(db, eventId, applicantId);
  }

  if (requestType === 'Waitlist') {
    applicants.push({
      id: applicantId,
      status: 'Waitlist',
      positionName,
    });
    await db.collection('events').updateOne({ _id: oid }, { $set: { applicants } });
    return getEnrollmentForApplicant(db, eventId, applicantId);
  }

  if (requestType === 'Request') {
    applicants.push({
      id: applicantId,
      status: 'Request',
      positionName,
    });
    await db.collection('events').updateOne({ _id: oid }, { $set: { applicants } });
    return getEnrollmentForApplicant(db, eventId, applicantId);
  }

  return defaultSuccess('Not Roster', 'Not Roster', {
    status: 'Error',
    message: 'Unsupported enrollment action.',
  });
}
