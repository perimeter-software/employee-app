import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { findJobByjobId } from '@/domains/user/utils/mongo-user-utils';
import type { RosterEntry, RosterEntryStatus } from '@/domains/job/types/schedule.types';
import { emailService } from '@/lib/services/email-service';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

type DayKey =
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday';

type CreateShiftRequestsBody = {
  jobId: string;
  shiftSlug: string;
  /** Exact dates (YYYY-MM-DD) within the shift range to request. */
  dates?: string[];
  /**
   * One or more recurring weekdays (e.g. ['monday', 'wednesday']).
   * For each selected day we create a single roster entry without date.
   */
  recurringDays?: DayKey[];
};

type DeleteShiftRequestBody = {
  jobId: string;
  shiftSlug: string;
  dayKey: DayKey;
  /** Specific date to cancel (YYYY-MM-DD) or null for recurring entry */
  date?: string | null;
};

const DAY_KEYS: DayKey[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

function getApplicantIdFromUser(user: AuthenticatedRequest['user']): string {
  if (user.applicantId) return String(user.applicantId);
  if (user.userId) return String(user.userId);
  if (user._id) return String(user._id);
  return '';
}

// Helper to group request entries per weekday
function getDayKeyFromDate(dateString: string): DayKey | null {
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return null;
  return DAY_KEYS[d.getDay()];
}

// POST /api/shift-requests
// Creates one or more shift requests for the current employee
// by appending roster entries with status="pending" onto the
// appropriate shift.defaultSchedule[day].roster arrays.
async function createShiftRequestsHandler(request: AuthenticatedRequest) {
  try {
    const user = request.user;

    if (user.userType === 'Client') {
      return NextResponse.json(
        {
          error: 'unauthorized',
          message: 'Access denied. Employee account required.',
        },
        { status: 403 }
      );
    }

    const applicantId = getApplicantIdFromUser(user);
    if (!applicantId) {
      return NextResponse.json(
        {
          error: 'missing-identifiers',
          message: 'Missing applicant id for shift requests.',
        },
        { status: 400 }
      );
    }

    const body = (await request.json()) as CreateShiftRequestsBody;
    const { jobId, shiftSlug, dates = [], recurringDays = [] } = body;

    if (!jobId || !shiftSlug) {
      return NextResponse.json(
        {
          error: 'missing-parameters',
          message: 'jobId and shiftSlug are required.',
        },
        { status: 400 }
      );
    }

    if (!Array.isArray(dates) && !Array.isArray(recurringDays)) {
      return NextResponse.json(
        {
          error: 'missing-requests',
          message: 'Provide at least one date or recurring day to request.',
        },
        { status: 400 }
      );
    }

    const { db } = await getTenantAwareConnection(request);

    const job = await findJobByjobId(db, jobId);
    if (!job) {
      return NextResponse.json(
        {
          error: 'job-not-found',
          message: 'Job not found for shift request.',
        },
        { status: 404 }
      );
    }

    const shift = (job.shifts || []).find((s) => s.slug === shiftSlug);
    if (!shift) {
      return NextResponse.json(
        {
          error: 'shift-not-found',
          message: 'Shift not found for the provided slug.',
        },
        { status: 404 }
      );
    }

    const shiftStart = new Date(shift.shiftStartDate);
    const shiftEnd = new Date(shift.shiftEndDate);
    if (Number.isNaN(shiftStart.getTime()) || Number.isNaN(shiftEnd.getTime())) {
      return NextResponse.json(
        {
          error: 'invalid-shift-range',
          message: 'Shift has an invalid date range.',
        },
        { status: 400 }
      );
    }

    // Build an in-memory map of existing roster entries for this shift
    const existingByDay: Record<
      DayKey,
      Array<string | (RosterEntry & { status?: RosterEntryStatus })>
    > = {
      sunday: [],
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
    };

    for (const dayKey of DAY_KEYS) {
      const schedule = shift.defaultSchedule?.[dayKey];
      existingByDay[dayKey] = (schedule?.roster ?? []) as Array<
        string | (RosterEntry & { status?: RosterEntryStatus })
      >;
    }

    // Determine which new entries we actually need to add per day-of-week
    const toAddByDay: Record<DayKey, RosterEntry[]> = {
      sunday: [],
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
    };

    // Handle specific dates
    for (const raw of dates || []) {
      const dateStr = String(raw);
      const dateObj = new Date(dateStr);
      if (Number.isNaN(dateObj.getTime())) {
        continue;
      }

      // Ensure date is within shift range
      if (dateObj < shiftStart || dateObj > shiftEnd) {
        continue;
      }

      const dayKey = getDayKeyFromDate(dateStr);
      if (!dayKey) continue;

      const existing = existingByDay[dayKey] || [];
      const alreadyExists = existing.some((entry) => {
        if (typeof entry === 'string') {
          // legacy recurring assignment; treat as covering all dates
          return entry === applicantId;
        }
        return entry.employeeId === applicantId && entry.date === dateStr;
      });

      if (!alreadyExists) {
        toAddByDay[dayKey].push({
          employeeId: applicantId,
          date: dateStr,
          status: 'pending',
        });
      }
    }

    // Handle recurring days (no specific date)
    for (const day of recurringDays || []) {
      if (!DAY_KEYS.includes(day)) continue;
      const dayKey = day as DayKey;
      const existing = existingByDay[dayKey] || [];

      const alreadyExists = existing.some((entry) => {
        if (typeof entry === 'string') {
          return entry === applicantId; // legacy recurring
        }
        return entry.employeeId === applicantId && !entry.date;
      });

      if (!alreadyExists) {
        toAddByDay[dayKey].push({
          employeeId: applicantId,
          status: 'pending',
        });
      }
    }

    // If nothing new to add, short-circuit
    const hasAnyNew = DAY_KEYS.some((day) => toAddByDay[day].length > 0);
    if (!hasAnyNew) {
      return NextResponse.json(
        {
          success: true,
          message: 'No new shift requests to create (duplicates ignored).',
        },
        { status: 200 }
      );
    }

    // Build a single update with $push for daily roster entries
    const pushDoc: Record<string, unknown> = {};

    for (const dayKey of DAY_KEYS) {
      const entries = toAddByDay[dayKey];
      if (!entries.length) continue;
      const path = `shifts.$[shift].defaultSchedule.${dayKey}.roster`;
      pushDoc[path] = { $each: entries };
    }

    // Ensure this applicant exists in the shiftRoster list so downstream
    // features (time tracking, admin UIs, etc.) can see them as part of
    // the shift, regardless of request status.
    let addToShiftRoster: Record<string, unknown> | null = null;
    const existingShiftRoster =
      Array.isArray(shift.shiftRoster) && shift.shiftRoster.length > 0
        ? (shift.shiftRoster as Array<{ _id?: string; employeeId?: string }>)
        : [];
    const isInShiftRoster = existingShiftRoster.some(
      (emp: { _id?: string; employeeId?: string }) => {
        if (!emp) return false;
        const id = (emp._id ?? emp.employeeId) as string | undefined;
        return id && String(id) === String(applicantId);
      }
    );

    if (!isInShiftRoster) {
      const shiftRosterId = ObjectId.isValid(applicantId)
        ? new ObjectId(applicantId)
        : applicantId;

      const firstName = user.given_name ?? user.firstName ?? '';
      const lastName = user.family_name ?? user.lastName ?? '';
      const fullName =
        (user.name as string | undefined)?.trim() ||
        [firstName, lastName].filter(Boolean).join(' ') ||
        '';

      addToShiftRoster = {
        _id: shiftRosterId,
        firstName,
        lastName,
        fullName,
        email: user.email ?? undefined,
      };
    }

    const updateOps: Record<string, unknown> = {
      $push: pushDoc,
    };

    if (addToShiftRoster) {
      updateOps.$addToSet = {
        'shifts.$[shift].shiftRoster': addToShiftRoster,
      };
    }

    const updateResult = await db.collection('jobs').updateOne(
      { _id: new ObjectId(jobId) },
      updateOps,
      {
        arrayFilters: [{ 'shift.slug': shiftSlug }],
      }
    );

    if (!updateResult.acknowledged) {
      return NextResponse.json(
        {
          error: 'update-failed',
          message: 'Failed to create shift requests.',
        },
        { status: 500 }
      );
    }

    // Notify manager(s) by email (same recipients as event manager notifications)
    type ManagerRecipient = {
      userId?: string;
      applicantId?: string;
      firstName?: string;
      lastName?: string;
      fullName?: string;
      email?: string;
    };
    const configRecipients = (job?.additionalConfig as { eventManagerNotificationRecipients?: ManagerRecipient[] })
      ?.eventManagerNotificationRecipients;
    if (Array.isArray(configRecipients) && configRecipients.length > 0) {
      const firstName = user.given_name ?? user.firstName ?? '';
      const lastName = user.family_name ?? user.lastName ?? '';
      const employeeName =
        (user.name as string | undefined)?.trim() ||
        [firstName, lastName].filter(Boolean).join(' ') ||
        'Employee';
      const shiftName = (shift as { shiftName?: string }).shiftName || shiftSlug;
      const dateLabels =
        (dates?.length ?? 0) > 0
          ? (dates || [])
              .slice(0, 10)
              .map((d) => new Date(d).toLocaleDateString('en-US', { dateStyle: 'medium' }))
              .join(', ') + ((dates?.length ?? 0) > 10 ? ` and ${(dates?.length ?? 0) - 10} more` : '')
          : '';
      const requestedSummary = dateLabels || 'See schedule';
      const subject = `Shift request: ${employeeName} – ${job.title || 'Job'}`;
      const text = [
        'An employee has submitted a shift request.',
        '',
        `Employee: ${employeeName}`,
        `Job: ${job.title || 'N/A'}`,
        `Shift: ${shiftName}`,
        `Requested: ${requestedSummary}`,
        '',
        'Please review and approve or reject in the Weekly Schedule Configuration for this shift.',
        '',
        'This is an automated notification from the Employee App.',
      ].join('\n');
      const html = [
        '<div style="font-family:\'Segoe UI\',Tahoma,Geneva,Verdana,sans-serif; max-width:560px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:8px; overflow:hidden;">',
        '<div style="background:#0d9488; color:#fff; padding:14px 20px; font-size:18px; font-weight:600;">Shift request submitted</div>',
        '<div style="padding:20px;">',
        '<p style="margin:0 0 16px; color:#374151; font-size:14px;">An employee has submitted a shift request.</p>',
        '<table style="width:100%; border-collapse:collapse; font-size:14px; margin-bottom:20px; border:1px solid #e5e7eb; border-radius:6px;">',
        '<tr style="background:#f9fafb;"><td colspan="2" style="padding:10px 14px; font-weight:600; color:#374151; border-bottom:1px solid #e5e7eb;">Request details</td></tr>',
        `<tr><td style="padding:10px 14px; color:#6b7280; width:140px; border-bottom:1px solid #f3f4f6;">Employee</td><td style="padding:10px 14px; color:#111827; border-bottom:1px solid #f3f4f6;">${escapeHtml(employeeName)}</td></tr>`,
        `<tr><td style="padding:10px 14px; color:#6b7280; border-bottom:1px solid #f3f4f6;">Job</td><td style="padding:10px 14px; color:#111827; border-bottom:1px solid #f3f4f6;">${escapeHtml(job.title || 'N/A')}</td></tr>`,
        `<tr><td style="padding:10px 14px; color:#6b7280; border-bottom:1px solid #f3f4f6;">Shift</td><td style="padding:10px 14px; color:#111827; border-bottom:1px solid #f3f4f6;">${escapeHtml(shiftName)}</td></tr>`,
        `<tr><td style="padding:10px 14px; color:#6b7280;">Requested</td><td style="padding:10px 14px; color:#111827;">${escapeHtml(requestedSummary)}</td></tr>`,
        '</table>',
        '<p style="margin:0; color:#6b7280; font-size:13px;">Please review and approve or reject in the Weekly Schedule Configuration for this shift.</p>',
        '</div>',
        '<div style="padding:12px 20px; background:#f9fafb; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280;">This is an automated notification from the Employee App.</div>',
        '</div>',
      ].join('');
      for (const r of configRecipients) {
        const to = r?.email?.trim();
        if (!to) continue;
        try {
          await emailService.sendEmail({ to, subject, html, text });
        } catch (emailErr) {
          console.error('[Shift Requests API] Error sending manager email to', to, emailErr);
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Shift requests created successfully.',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[Shift Requests API] POST error:', error);
    return NextResponse.json(
      {
        error: 'internal-error',
        message: 'Internal server error',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

export const POST = withEnhancedAuthAPI(createShiftRequestsHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});

// DELETE /api/shift-requests
// Cancels a pending shift request for the current employee by pulling
// the matching roster entry from the appropriate day-of-week array.
async function deleteShiftRequestHandler(request: AuthenticatedRequest) {
  try {
    const user = request.user;

    if (user.userType === 'Client') {
      return NextResponse.json(
        {
          error: 'unauthorized',
          message: 'Access denied. Employee account required.',
        },
        { status: 403 }
      );
    }

    const applicantId = getApplicantIdFromUser(user);
    if (!applicantId) {
      return NextResponse.json(
        {
          error: 'missing-identifiers',
          message: 'Missing applicant id for shift request cancellation.',
        },
        { status: 400 }
      );
    }

    const body = (await request.json()) as DeleteShiftRequestBody;
    const { jobId, shiftSlug, dayKey, date } = body;

    if (!jobId || !shiftSlug || !dayKey) {
      return NextResponse.json(
        {
          error: 'missing-parameters',
          message: 'jobId, shiftSlug and dayKey are required.',
        },
        { status: 400 }
      );
    }

    if (!DAY_KEYS.includes(dayKey)) {
      return NextResponse.json(
        {
          error: 'invalid-day',
          message: 'Invalid day of week for shift request.',
        },
        { status: 400 }
      );
    }

    const { db } = await getTenantAwareConnection(request);

    const job = await findJobByjobId(db, jobId);
    if (!job) {
      return NextResponse.json(
        {
          error: 'job-not-found',
          message: 'Job not found for shift request cancellation.',
        },
        { status: 404 }
      );
    }

    const shift = (job.shifts || []).find((s) => s.slug === shiftSlug);
    if (!shift) {
      return NextResponse.json(
        {
          error: 'shift-not-found',
          message: 'Shift not found for the provided slug.',
        },
        { status: 404 }
      );
    }

    const path = `shifts.$[shift].defaultSchedule.${dayKey}.roster`;
    const pullCriteria: {
      employeeId: string;
      status: RosterEntryStatus;
      date?: string | { $exists: boolean };
    } = {
      employeeId: applicantId,
      status: 'pending',
    };

    if (date) {
      pullCriteria.date = date;
    } else {
      // Only cancel recurring requests without a date
      pullCriteria.date = { $exists: false };
    }

    const updateResult = await db.collection('jobs').updateOne(
      { _id: new ObjectId(jobId) },
      {
        $pull: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          [path]: pullCriteria as any,
        },
      },
      {
        arrayFilters: [{ 'shift.slug': shiftSlug }],
      }
    );

    if (!updateResult.acknowledged) {
      return NextResponse.json(
        {
          error: 'update-failed',
          message: 'Failed to cancel shift request.',
        },
        { status: 500 }
      );
    }

    if (updateResult.modifiedCount === 0) {
      return NextResponse.json(
        {
          success: false,
          message: 'No matching pending request found to cancel.',
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Shift request cancelled successfully.',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Shift Requests API] DELETE error:', error);
    return NextResponse.json(
      {
        error: 'internal-error',
        message: 'Internal server error',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

export const DELETE = withEnhancedAuthAPI(deleteShiftRequestHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});

