import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { logActivity } from '@/lib/services/activity-logger';

// ─── Types ────────────────────────────────────────────────────────────────────

type ApplicantRecord = {
  id: string;
  status: string;
  note?: string;
  timeIn?: string | null;
  timeOut?: string | null;
  reportTime?: string;
  endTime?: string;
  primaryPosition?: string;
  agent?: string;
  createAgent?: string;
  eventUrl?: string;
  dateModified?: string;
  [key: string]: unknown;
};

type EventPosition = {
  positionName: string;
  reportTime?: string;
  endTime?: string;
  makePublic?: boolean;
  numberPositions?: number;
};

type EnrollmentType = 'Not Roster' | 'Roster' | 'Waitlist' | 'Request';
type AllowedAction = 'Roster' | 'Waitlist' | 'Not Roster' | 'Request';

type EnrollmentCheckResult = {
  type: EnrollmentType;
  allowed: AllowedAction;
  message: string;
  status: 'Success' | 'Warning';
  numEnrolled: number;
  capacity: number;
  waitListCapacity: number;
  waitListEnrolled: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getNumEnrolled(applicants: ApplicantRecord[], stat: string): number {
  const unique = new Set<string>();
  for (const a of applicants) {
    if (a.status === stat) unique.add(a.id);
  }
  return unique.size;
}

function getCapacityInfo(event: Record<string, unknown>) {
  const applicants = (event.applicants as ApplicantRecord[]) ?? [];
  const numEnrolled = getNumEnrolled(applicants, 'Roster');

  let capacity = 0;
  const raw = event.positionsRequested;
  if (raw && +raw !== 0) capacity = +raw;

  let waitListCapacity = 0;
  const wlPct = event.waitListPercentage as string | undefined;
  if (wlPct === 'Infinity') {
    waitListCapacity = 10000;
  } else if (wlPct && capacity > 0) {
    waitListCapacity = Math.round((capacity * parseFloat(wlPct)) / 100);
  }

  const waitListEnrolled = applicants.filter(
    (a) => a.status === 'Waitlist'
  ).length;

  return { numEnrolled, capacity, waitListCapacity, waitListEnrolled };
}

function isEventLessThan48Hours(eventDate: unknown): boolean {
  if (!eventDate) return false;
  const evtMs = new Date(eventDate as string).getTime();
  const diffHours = (evtMs - Date.now()) / (1000 * 60 * 60);
  return diffHours < 48;
}

// ─── GET — check enrollment status ───────────────────────────────────────────

async function getEnrollmentHandler(
  request: AuthenticatedRequest,
  context?: Record<string, unknown>
) {
  try {
    const params = (await context?.params) as { eventId: string } | undefined;
    const eventId = params?.eventId;

    if (!eventId || !ObjectId.isValid(eventId)) {
      return NextResponse.json(
        { success: false, message: 'Invalid event ID' },
        { status: 400 }
      );
    }

    const { db } = await getTenantAwareConnection(request);
    const user = request.user;
    const applicantId = user.applicantId ? String(user.applicantId) : '';

    if (!applicantId) {
      return NextResponse.json(
        { success: false, message: 'No applicant ID in session' },
        { status: 401 }
      );
    }

    // Fetch event
    const event = await db.collection('events').findOne(
      { _id: new ObjectId(eventId) },
      {
        projection: {
          applicants: 1,
          positionsRequested: 1,
          waitListPercentage: 1,
          eventDate: 1,
          eventEndTime: 1,
          venueSlug: 1,
          eventUrl: 1,
          eventName: 1,
          positions: 1,
        },
      }
    );

    if (!event) {
      return NextResponse.json(
        { success: false, message: 'Event not found' },
        { status: 404 }
      );
    }

    const applicants: ApplicantRecord[] = (event.applicants ??
      []) as ApplicantRecord[];
    const existingRecord = applicants.find((a) => a.id === applicantId);
    const currentType: EnrollmentType =
      (existingRecord?.status as EnrollmentType) ?? 'Not Roster';

    const { numEnrolled, capacity, waitListCapacity, waitListEnrolled } =
      getCapacityInfo(event as Record<string, unknown>);

    let result: EnrollmentCheckResult;

    // ── Already enrolled ──────────────────────────────────────────────────────
    if (currentType === 'Roster') {
      if (isEventLessThan48Hours(event.eventDate)) {
        result = {
          type: 'Roster',
          allowed: 'Roster',
          status: 'Warning',
          message:
            'You cannot call off within 48 hours of this event. Please contact your event manager.',
          numEnrolled,
          capacity,
          waitListCapacity,
          waitListEnrolled,
        };
      } else {
        result = {
          type: 'Roster',
          allowed: 'Not Roster',
          status: 'Success',
          message: 'You are on the roster for this event.',
          numEnrolled,
          capacity,
          waitListCapacity,
          waitListEnrolled,
        };
      }
      return NextResponse.json(
        { success: true, data: result },
        { status: 200 }
      );
    }

    if (currentType === 'Waitlist') {
      result = {
        type: 'Waitlist',
        allowed: 'Not Roster',
        status: 'Success',
        message: 'You are on the waitlist for this event.',
        numEnrolled,
        capacity,
        waitListCapacity,
        waitListEnrolled,
      };
      return NextResponse.json(
        { success: true, data: result },
        { status: 200 }
      );
    }

    if (currentType === 'Request') {
      result = {
        type: 'Request',
        allowed: 'Not Roster',
        status: 'Success',
        message: 'You have requested this event.',
        numEnrolled,
        capacity,
        waitListCapacity,
        waitListEnrolled,
      };
      return NextResponse.json(
        { success: true, data: result },
        { status: 200 }
      );
    }

    // ── Not enrolled — determine what is allowed ───────────────────────────────
    // Block joining past events
    if (event.eventDate && new Date(event.eventDate as string) < new Date()) {
      const eventEnd = event.eventEndTime
        ? new Date(event.eventEndTime as string)
        : null;
      if (!eventEnd || eventEnd < new Date()) {
        result = {
          type: 'Not Roster',
          allowed: 'Not Roster',
          status: 'Warning',
          message: 'This event has already taken place.',
          numEnrolled,
          capacity,
          waitListCapacity,
          waitListEnrolled,
        };
        return NextResponse.json(
          { success: true, data: result },
          { status: 200 }
        );
      }
    }

    // Check applicant venue status
    let venueStatus = '';
    if (ObjectId.isValid(applicantId)) {
      const applicantDoc = await db
        .collection('applicants')
        .findOne(
          { _id: new ObjectId(applicantId) },
          { projection: { venues: 1 } }
        );

      type VenueEntry = { venueSlug?: string; status?: string };
      const venueEntry = ((applicantDoc?.venues ?? []) as VenueEntry[]).find(
        (v) => v.venueSlug === event.venueSlug
      );
      venueStatus = venueEntry?.status ?? '';
    }

    // Not on venue or Pending → can only Request
    if (!venueStatus || venueStatus === 'Pending') {
      result = {
        type: 'Not Roster',
        allowed: 'Request',
        status: 'Success',
        message:
          venueStatus === 'Pending'
            ? 'Your venue request is pending. You may request this event.'
            : 'You are not on the staffing pool for this venue. You may request this event.',
        numEnrolled,
        capacity,
        waitListCapacity,
        waitListEnrolled,
      };
      return NextResponse.json(
        { success: true, data: result },
        { status: 200 }
      );
    }

    // StaffingPool — waitListAll (Infinity) forces all new sign-ups to Waitlist,
    // regardless of how many slots remain on the roster (matches mobile app logic).
    const waitListAll = event.waitListPercentage === 'Infinity';
    if (waitListAll) {
      result = {
        type: 'Not Roster',
        allowed: 'Waitlist',
        status: 'Success',
        message: 'You may join the waitlist for this event.',
        numEnrolled,
        capacity,
        waitListCapacity,
        waitListEnrolled,
      };
      return NextResponse.json(
        { success: true, data: result },
        { status: 200 }
      );
    }

    // StaffingPool — check capacity (0 = no limit)
    if (capacity === 0 || numEnrolled < capacity) {
      result = {
        type: 'Not Roster',
        allowed: 'Roster',
        status: 'Success',
        message: 'You may register for this event.',
        numEnrolled,
        capacity,
        waitListCapacity,
        waitListEnrolled,
      };
    } else if (waitListCapacity > 0 && waitListEnrolled < waitListCapacity) {
      result = {
        type: 'Not Roster',
        allowed: 'Waitlist',
        status: 'Success',
        message: 'The roster is full. You may join the waitlist.',
        numEnrolled,
        capacity,
        waitListCapacity,
        waitListEnrolled,
      };
    } else {
      result = {
        type: 'Not Roster',
        allowed: 'Not Roster',
        status: 'Warning',
        message: 'Both the roster and waitlist are full for this event.',
        numEnrolled,
        capacity,
        waitListCapacity,
        waitListEnrolled,
      };
    }

    return NextResponse.json({ success: true, data: result }, { status: 200 });
  } catch (error) {
    console.error('[Enrollment GET] Error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ─── PUT — perform enrollment action ─────────────────────────────────────────

async function putEnrollmentHandler(
  request: AuthenticatedRequest,
  context?: Record<string, unknown>
) {
  try {
    const params = (await context?.params) as { eventId: string } | undefined;
    const eventId = params?.eventId;

    if (!eventId || !ObjectId.isValid(eventId)) {
      return NextResponse.json(
        { success: false, message: 'Invalid event ID' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { requestType, positionName, reason } = body as {
      requestType: string;
      positionName?: string;
      reason?: string;
    };

    const validTypes = ['Roster', 'Waitlist', 'Request', 'Not Roster'];
    if (!validTypes.includes(requestType)) {
      return NextResponse.json(
        { success: false, message: `Invalid requestType: ${requestType}` },
        { status: 400 }
      );
    }

    const { db } = await getTenantAwareConnection(request);
    const user = request.user;
    const applicantId = user.applicantId ? String(user.applicantId) : '';
    const agent =
      [user.firstName, user.lastName].filter(Boolean).join(' ') ||
      (user.email as string) ||
      'Employee';
    const createAgent = (user._id as string) ?? applicantId;

    if (!applicantId) {
      return NextResponse.json(
        { success: false, message: 'No applicant ID in session' },
        { status: 401 }
      );
    }

    // Fetch event
    const event = await db.collection('events').findOne(
      { _id: new ObjectId(eventId) },
      {
        projection: {
          _id: 1,
          eventUrl: 1,
          eventName: 1,
          eventDate: 1,
          eventEndTime: 1,
          venueSlug: 1,
          applicants: 1,
          positionsRequested: 1,
          waitListPercentage: 1,
          positions: 1,
          eventHistory: 1,
        },
      }
    );

    if (!event) {
      return NextResponse.json(
        { success: false, message: 'Event not found' },
        { status: 404 }
      );
    }

    // Fetch applicant for firstName/lastName (used in activity descriptions) and venues
    type VenueEntry = {
      venueSlug?: string;
      status?: string;
      dateModified?: string;
    };
    const applicantDoc = ObjectId.isValid(applicantId)
      ? await db
          .collection('applicants')
          .findOne(
            { _id: new ObjectId(applicantId) },
            { projection: { firstName: 1, lastName: 1, venues: 1 } }
          )
      : null;
    const firstName: string = (applicantDoc?.firstName as string) ?? '';
    const lastName: string = (applicantDoc?.lastName as string) ?? '';
    const eventUrl: string = (event.eventUrl as string) ?? eventId;

    let applicants: ApplicantRecord[] = (event.applicants ??
      []) as ApplicantRecord[];
    const existingIdx = applicants.findIndex((a) => a.id === applicantId);
    const existingRecord = existingIdx > -1 ? applicants[existingIdx] : null;

    const now = new Date();

    // ── Remove from event (Not Roster) ────────────────────────────────────────
    if (requestType === 'Not Roster') {
      // Deny if currently Roster and < 48h away
      if (
        existingRecord?.status === 'Roster' &&
        isEventLessThan48Hours(event.eventDate)
      ) {
        return NextResponse.json(
          {
            success: false,
            message: 'You cannot call off within 48 hours of this event.',
          },
          { status: 400 }
        );
      }

      applicants = applicants.filter((a) => a.id !== applicantId);

      // Append to eventHistory exactly as mobile does
      const historyEntry = {
        id: applicantId,
        status: 'Not Roster',
        reason: reason || '',
        dateModified: now.toISOString(),
      };
      const eventHistory = [
        ...((event.eventHistory as unknown[]) ?? []),
        historyEntry,
      ];

      await db
        .collection('events')
        .updateOne(
          { _id: new ObjectId(eventId) },
          { $set: { applicants, eventHistory, modifiedDate: now } }
        );

      const message = `${firstName} ${lastName} removed from ${eventUrl}`;
      await logActivity(db, {
        userId: createAgent,
        eventId,
        applicantId,
        action: 'Applicant Added To Event as Not Roster',
        description: message,
      });

      return NextResponse.json(
        {
          success: true,
          data: {
            type: 'Not Roster',
            message: 'You have been removed from this event.',
          },
        },
        { status: 200 }
      );
    }

    // ── Request: add applicant to venue as Pending and event as Request ────────
    // Mirrors mobile: `if (!venue || requestType === 'Request')` early-return path
    if (requestType === 'Request') {
      let venues: VenueEntry[] = (applicantDoc?.venues as VenueEntry[]) ?? [];
      const venueIdx = venues.findIndex((v) => v.venueSlug === event.venueSlug);
      const venueRec: VenueEntry = {
        venueSlug: event.venueSlug as string,
        status: 'Pending',
        dateModified: now.toISOString(),
      };

      venues = [...venues];
      if (venueIdx === -1) {
        venues.push(venueRec);
      } else {
        venues[venueIdx] = venueRec;
      }

      if (ObjectId.isValid(applicantId)) {
        await db
          .collection('applicants')
          .updateOne(
            { _id: new ObjectId(applicantId) },
            {
              $set: {
                venues,
                modifiedDate: now,
                modifiedAgent: createAgent,
                modifiedAgentName: agent,
              },
            }
          );
      }

      const requestRecord: ApplicantRecord = {
        id: applicantId,
        status: 'Request',
        note: reason ?? '',
        timeIn: null,
        timeOut: null,
        agent,
        createAgent,
        eventUrl,
        dateModified: now.toISOString(),
      };

      applicants = [...applicants];
      if (existingIdx > -1) {
        applicants[existingIdx] = { ...existingRecord, ...requestRecord };
        // Remove any duplicates, keeping updated index
        applicants = applicants.filter(
          (item, idx) => item.id !== applicantId || idx === existingIdx
        );
      } else {
        applicants.push(requestRecord);
      }

      await db
        .collection('events')
        .updateOne(
          { _id: new ObjectId(eventId) },
          { $set: { applicants, modifiedDate: now } }
        );

      await logActivity(db, {
        userId: createAgent,
        eventId,
        applicantId,
        action: 'Applicant Added To Venue-Pending and Event-Request',
        description: `${firstName} ${lastName} added to ${eventUrl} as Request`,
      });

      return NextResponse.json(
        {
          status: 'Warning',
          success: true,
          data: {
            type: 'Request',
            message: 'Your request has been submitted.',
          },
          message: 'Applicant added to Venue as Pending and Event as Request',
        },
        { status: 200 }
      );
    }

    // ── Add to Roster or Waitlist ──────────────────────────────────────────────
    const newRecord: ApplicantRecord = {
      id: applicantId,
      status: requestType as EnrollmentType,
      note: reason ?? '',
      timeIn: existingRecord?.timeIn ?? null,
      timeOut: existingRecord?.timeOut ?? null,
      agent,
      createAgent,
      eventUrl,
      dateModified: now.toISOString(),
    };

    // Attach position times when registering with a specific position
    if (requestType === 'Roster' && positionName) {
      const positions = (event.positions as EventPosition[]) ?? [];
      const pos = positions.find((p) => p.positionName === positionName);
      if (pos?.makePublic) {
        newRecord.primaryPosition = positionName;
        if (pos.reportTime) newRecord.reportTime = pos.reportTime;
        if (pos.endTime) newRecord.endTime = pos.endTime;
      }
    }

    applicants = [...applicants];
    if (existingIdx > -1) {
      applicants[existingIdx] = { ...existingRecord, ...newRecord };
      // Remove any duplicates, keeping updated index
      applicants = applicants.filter(
        (item, idx) => item.id !== applicantId || idx === existingIdx
      );
    } else {
      applicants.push(newRecord);
    }

    await db
      .collection('events')
      .updateOne(
        { _id: new ObjectId(eventId) },
        { $set: { applicants, modifiedDate: now } }
      );

    const message = `${firstName} ${lastName} set to ${requestType} for ${eventUrl}`;
    await logActivity(db, {
      userId: createAgent,
      eventId,
      applicantId,
      action: `Applicant Added To Event as ${requestType}`,
      description: message,
    });

    const userMessages: Record<string, string> = {
      Roster: 'You have been added to the roster.',
      Waitlist: 'You have been added to the waitlist.',
    };

    return NextResponse.json(
      {
        success: true,
        data: {
          type: requestType,
          message: userMessages[requestType] ?? 'Done.',
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Enrollment PUT] Error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withEnhancedAuthAPI(getEnrollmentHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
  allowApplicants: true,
});

export const PUT = withEnhancedAuthAPI(putEnrollmentHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
  allowApplicants: true,
});
