import { NextResponse } from 'next/server';
import { ObjectId } from 'mongodb';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import {
  getTenantAwareConnection,
  DEFAULT_APPLICANT_PROJECTION,
  DEFAULT_JOBS_PROJECTION,
} from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import { findJobByjobId } from '@/domains/user/utils/mongo-user-utils';
import type {
  RosterEntry,
  RosterEntryStatus,
} from '@/domains/job/types/schedule.types';
import { emailService } from '@/lib/services/email-service';
import { getShiftStartOnDate } from '@/domains/punch/utils/shift-job-utils';
import { escapeHtml } from '@/lib/utils/format-utils';

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
  /** Exact dates with day-of-week from the client. Each entry is stored in shift.defaultSchedule[dayKey].roster. */
  dateRequests?: Array<{ date: string; dayKey: DayKey }>;
  /** Position the employee is applying for when shift has positions (must match shift.positions[].positionName). */
  positionName?: string;
};

/** Position shape for capacity (numberPositionsByDate → numberPositionsByDay → numberPositions). */
type PositionCapacity = {
  numberPositions?: string | number;
  numberPositionsByDay?: Record<string, string | number>;
  numberPositionsByDate?: Record<string, string | number>;
};

type DeleteShiftRequestBody = {
  jobId: string;
  shiftSlug: string;
  dayKey: DayKey;
  /** Specific date to cancel (YYYY-MM-DD) or null for recurring entry */
  date?: string | null;
};

type CallOffRequestBody = {
  jobId: string;
  shiftSlug: string;
  date: string;
  dayKey: DayKey;
  /** Required reason for the call off (stored in roster entry callOffReason). */
  reason: string;
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

/** Value for approvedBy when entry is auto-approved (same shape as admin manual approve). */
const AUTO_APPROVED_BY = { _id: 'system', fullName: 'Auto-approved' };

function getApplicantIdFromUser(user: AuthenticatedRequest['user']): string {
  if (user.applicantId) return String(user.applicantId);
  if (user.userId) return String(user.userId);
  if (user._id) return String(user._id);
  return '';
}

/** Capacity for a single position on a date (numberPositionsByDate → numberPositionsByDay → numberPositions). */
function getPositionTotalForDate(
  position: PositionCapacity | null | undefined,
  dayName: string,
  dateKey: string
): number {
  if (!position) return 0;
  const byDate = position.numberPositionsByDate;
  if (
    byDate &&
    typeof byDate === 'object' &&
    dateKey &&
    byDate[dateKey] != null
  ) {
    const n = parseInt(String(byDate[dateKey]), 10);
    if (!Number.isNaN(n)) return Math.max(0, n);
  }
  const byDay = position.numberPositionsByDay;
  if (byDay && typeof byDay === 'object' && dayName && byDay[dayName] != null) {
    const n = parseInt(String(byDay[dayName]), 10);
    if (!Number.isNaN(n)) return Math.max(0, n);
  }
  const n = parseInt(String(position.numberPositions), 10);
  return Number.isNaN(n) ? 0 : Math.max(0, n);
}

/** Sum of capacity over all positions for (shift, dayName, dateKey). Returns 0 if no positions. */
function getTotalPositionsForShiftDayDate(
  shift: { positions?: Array<PositionCapacity & { positionName?: string }> },
  dayName: string,
  dateKey: string
): number {
  const positions = shift.positions;
  if (!Array.isArray(positions) || positions.length === 0) return 0;
  return positions.reduce(
    (sum, p) => sum + getPositionTotalForDate(p, dayName, dateKey),
    0
  );
}

/** Capacity for a single position by name. Returns 0 if position not found. */
function getTotalForPosition(
  shift: { positions?: Array<PositionCapacity & { positionName?: string }> },
  positionName: string,
  dayName: string,
  dateKey: string
): number {
  const positions = shift.positions;
  if (!Array.isArray(positions)) return 0;
  const pos = positions.find(
    (p) => (p as { positionName?: string }).positionName === positionName
  );
  return getPositionTotalForDate(pos, dayName, dateKey);
}

/** Normalize assignedPosition for comparison (treat undefined and empty string as same). */
function normalizedAssignedPosition(
  entry: { assignedPosition?: string | null } | string
): string | null {
  if (typeof entry === 'string') return null;
  const p = entry.assignedPosition;
  if (p == null || p === '') return null;
  return p;
}

/** Position for waitlist matching: requested (pending) or assigned (approved). */
function normalizedRequestedOrAssignedPosition(
  entry:
    | { requestedPosition?: string | null; assignedPosition?: string | null }
    | string
): string | null {
  if (typeof entry === 'string') return null;
  const p = entry.requestedPosition ?? entry.assignedPosition;
  if (p == null || p === '') return null;
  return p;
}

/** Count filled (approved/legacy) entries for (dateKey, position). Only object entries; skip legacy strings.
 * Pending, rejected, called_off, and cancelled entries are excluded—so storing assignedPosition on
 * pending entries does not increase filled count anywhere. */
function getFilledCountForPosition(
  roster: Array<
    | string
    | (RosterEntry & { status?: RosterEntryStatus; assignedPosition?: string })
  >,
  dateKey: string,
  positionNameOrNull: string | null
): number {
  return roster.filter((e) => {
    if (typeof e === 'string') return false;
    if (e.date !== dateKey) return false;
    const status = e.status;
    if (status !== undefined && status !== 'approved') return false;
    const entryPos = normalizedAssignedPosition(e);
    return entryPos === positionNameOrNull;
  }).length;
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
    const { jobId, shiftSlug, dateRequests = [], positionName } = body;

    if (!jobId || !shiftSlug) {
      return NextResponse.json(
        {
          error: 'missing-parameters',
          message: 'jobId and shiftSlug are required.',
        },
        { status: 400 }
      );
    }

    const hasDateRequests =
      Array.isArray(dateRequests) && dateRequests.length > 0;
    if (!hasDateRequests) {
      return NextResponse.json(
        {
          error: 'missing-requests',
          message: 'Provide at least one date (dateRequests) to request.',
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
    if (
      Number.isNaN(shiftStart.getTime()) ||
      Number.isNaN(shiftEnd.getTime())
    ) {
      return NextResponse.json(
        {
          error: 'invalid-shift-range',
          message: 'Shift has an invalid date range.',
        },
        { status: 400 }
      );
    }

    // If positionName provided, validate against shift.positions. When shift has positions, position is required.
    const shiftHasPositions =
      Array.isArray(shift.positions) && shift.positions.length > 0;
    const validPositionName =
      typeof positionName === 'string' &&
      positionName.trim() !== '' &&
      shiftHasPositions &&
      (shift.positions as Array<{ positionName?: string }>).some(
        (p) => p.positionName === positionName
      )
        ? positionName.trim()
        : undefined;
    if (shiftHasPositions && !validPositionName) {
      return NextResponse.json(
        {
          error: 'position-required',
          message: 'Position is required for this shift.',
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

    // Handle specific dates (date + dayKey from client)
    if (hasDateRequests) {
      for (const { date: dateStr, dayKey } of dateRequests) {
        if (!dateStr || !DAY_KEYS.includes(dayKey)) continue;
        const dateObj = new Date(dateStr);
        if (Number.isNaN(dateObj.getTime())) continue;
        if (dateObj < shiftStart || dateObj > shiftEnd) continue;

        const existing = existingByDay[dayKey] || [];
        const alreadyExists = existing.some((entry) => {
          if (typeof entry === 'string') return entry === applicantId;
          return entry.employeeId === applicantId && entry.date === dateStr;
        });
        if (!alreadyExists) {
          const newEntry: RosterEntry & { status?: RosterEntryStatus } = {
            employeeId: applicantId,
            date: dateStr,
            status: 'pending',
          };
          if (validPositionName)
            (newEntry as Record<string, unknown>).requestedPosition =
              validPositionName;
          toAddByDay[dayKey].push(newEntry);
        }
      }
    }

    // Auto-approve when autoAddWaitlistedStaff is on and slot is open (position-aware, date-specific only).
    // When auto is off, entries stay pending with only requestedPosition (never assignedPosition).
    const additionalConfig = job.additionalConfig as
      | { autoAddWaitlistedStaff?: boolean }
      | undefined;
    const autoAddEnabled = additionalConfig?.autoAddWaitlistedStaff === true;
    const hasPositions =
      Array.isArray(shift.positions) && shift.positions.length > 0;
    if (autoAddEnabled && hasPositions) {
      for (const dayKey of DAY_KEYS) {
        const roster = existingByDay[dayKey] || [];
        const entries = toAddByDay[dayKey];
        for (const entry of entries) {
          if (!entry.date) continue; // recurring: not used for auto-add
          const dateKey = entry.date;
          const posNorm = normalizedRequestedOrAssignedPosition(
            entry as { requestedPosition?: string; assignedPosition?: string }
          );
          const total =
            posNorm != null
              ? getTotalForPosition(
                  shift as {
                    positions?: Array<
                      PositionCapacity & { positionName?: string }
                    >;
                  },
                  posNorm,
                  dayKey,
                  dateKey
                )
              : getTotalPositionsForShiftDayDate(
                  shift as {
                    positions?: Array<
                      PositionCapacity & { positionName?: string }
                    >;
                  },
                  dayKey,
                  dateKey
                );
          if (total <= 0) continue;
          const filled = getFilledCountForPosition(
            roster as Array<
              | string
              | (RosterEntry & {
                  status?: RosterEntryStatus;
                  assignedPosition?: string;
                })
            >,
            dateKey,
            posNorm
          );
          if (filled < total) {
            entry.status = 'approved';
            (entry as Record<string, unknown>).approvedBy = AUTO_APPROVED_BY;
            if (posNorm != null)
              (entry as Record<string, unknown>).assignedPosition = posNorm;
          }
        }
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

    const updateResult = await db
      .collection('jobs')
      .updateOne({ _id: new ObjectId(jobId) }, updateOps, {
        arrayFilters: [{ 'shift.slug': shiftSlug }],
      });

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
    const configRecipients = (
      job?.additionalConfig as {
        eventManagerNotificationRecipients?: ManagerRecipient[];
      }
    )?.eventManagerNotificationRecipients;
    if (Array.isArray(configRecipients) && configRecipients.length > 0) {
      const firstName = user.given_name ?? user.firstName ?? '';
      const lastName = user.family_name ?? user.lastName ?? '';
      const employeeName =
        (user.name as string | undefined)?.trim() ||
        [firstName, lastName].filter(Boolean).join(' ') ||
        'Employee';
      const shiftName =
        (shift as { shiftName?: string }).shiftName || shiftSlug;
      // Use body dates as-is (YYYY-MM-DD), no timezone conversion
      const requestedDatesList = dateRequests.map((r) => r.date);
      const dateLabels =
        (requestedDatesList?.length ?? 0) > 0
          ? (requestedDatesList || []).slice(0, 10).join(', ') +
            ((requestedDatesList?.length ?? 0) > 10
              ? ` and ${(requestedDatesList?.length ?? 0) - 10} more`
              : '')
          : '';
      const requestedSummary = dateLabels || 'See schedule';
      // Count how many new date-specific entries were auto-approved
      let autoApprovedCount = 0;
      let totalDateSpecificCount = 0;
      for (const dayKey of DAY_KEYS) {
        for (const entry of toAddByDay[dayKey]) {
          if (!entry.date) continue;
          totalDateSpecificCount += 1;
          if (entry.status === 'approved') autoApprovedCount += 1;
        }
      }
      const allAutoApproved =
        totalDateSpecificCount > 0 &&
        autoApprovedCount === totalDateSpecificCount;
      const someAutoApproved =
        autoApprovedCount > 0 && autoApprovedCount < totalDateSpecificCount;
      const allPending = autoApprovedCount === 0 && totalDateSpecificCount > 0;
      const statusLine = allAutoApproved
        ? 'This request was automatically approved because positions were available for all requested dates. No action needed.'
        : someAutoApproved
          ? 'Some requested dates were automatically approved (positions were available). The rest are pending because no positions were available for those dates. You can review in the Weekly Schedule Configuration if needed.'
          : allPending && !autoAddEnabled
            ? 'Auto-add is disabled for this shift. Please review and approve or reject in the Weekly Schedule Configuration for this shift.'
            : allPending && autoAddEnabled
              ? 'All requested dates are pending because positions are already filled for those dates. The employee has been added to the waitlist. You can review in the Weekly Schedule Configuration if needed.'
              : 'Please review and approve or reject in the Weekly Schedule Configuration for this shift.';
      const subject = `Shift request: ${employeeName} – ${job.title || 'Job'}`;
      const text = [
        'An employee has submitted a shift request.',
        '',
        `Employee: ${employeeName}`,
        `Job: ${job.title || 'N/A'}`,
        `Shift: ${shiftName}`,
        `Requested: ${requestedSummary}`,
        '',
        statusLine,
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
        `<p style="margin:0; color:#6b7280; font-size:13px;">${escapeHtml(statusLine)}</p>`,
        '</div>',
        '<div style="padding:12px 20px; background:#f9fafb; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280;">This is an automated notification from the Employee App.</div>',
        '</div>',
      ].join('');
      for (const r of configRecipients) {
        const to = r?.email?.trim();
        if (!to) continue;
        try {
          await emailService.sendEmail({ to, subject, html, text, db });
        } catch (emailErr) {
          console.error(
            '[Shift Requests API] Error sending manager email to',
            to,
            emailErr
          );
        }
      }
    }

    // Send "Shift request approved" email to requester for each auto-approved entry
    const requesterEmail =
      user.email ??
      (existingShiftRoster as Array<{ email?: string }>).find(
        (e) =>
          e &&
          String(
            (e as { _id?: string; employeeId?: string })._id ??
              (e as { _id?: string; employeeId?: string }).employeeId
          ) === String(applicantId)
      )?.email;
    if (requesterEmail) {
      const jobTitle = job.title || 'Job';
      const shiftName =
        (shift as { shiftName?: string }).shiftName || shiftSlug;
      for (const dayKey of DAY_KEYS) {
        for (const entry of toAddByDay[dayKey]) {
          if (entry.status !== 'approved' || !entry.date) continue;
          const positionLabel = entry.assignedPosition
            ? ` – ${entry.assignedPosition}`
            : '';
          const subject = `Shift request approved – ${jobTitle} – ${shiftName}${positionLabel}`;
          const plainSummary = `Your shift request for ${jobTitle} – ${shiftName} (${entry.date}) was approved.`;
          const html = [
            '<div style="font-family:\'Segoe UI\',Tahoma,Geneva,Verdana,sans-serif; max-width:560px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:8px; overflow:hidden;">',
            '<div style="background:#059669; color:#fff; padding:14px 20px; font-size:18px; font-weight:600;">Shift request approved</div>',
            '<div style="padding:20px;">',
            `<p style="margin:0 0 16px; color:#374151; font-size:14px;">${escapeHtml(plainSummary)}</p>`,
            '<table style="width:100%; border-collapse:collapse; font-size:14px; border:1px solid #e5e7eb; border-radius:6px;">',
            '<tr style="background:#f9fafb;"><td style="padding:10px 14px; color:#6b7280; width:120px;">Job</td><td style="padding:10px 14px; color:#111827;">' +
              escapeHtml(jobTitle) +
              '</td></tr>',
            '<tr><td style="padding:10px 14px; color:#6b7280;">Shift</td><td style="padding:10px 14px; color:#111827;">' +
              escapeHtml(shiftName) +
              '</td></tr>',
            '<tr><td style="padding:10px 14px; color:#6b7280;">Date</td><td style="padding:10px 14px; color:#111827;">' +
              escapeHtml(entry.date) +
              '</td></tr>',
            entry.assignedPosition
              ? '<tr><td style="padding:10px 14px; color:#6b7280;">Position</td><td style="padding:10px 14px; color:#111827;">' +
                escapeHtml(entry.assignedPosition) +
                '</td></tr>'
              : '',
            '</table>',
            '</div>',
            '<div style="padding:12px 20px; background:#f9fafb; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280;">This is an automated notification from the Employee App.</div>',
            '</div>',
          ].join('');
          try {
            await emailService.sendEmail({
              to: requesterEmail,
              subject,
              html,
              text: plainSummary,
              db,
            });
          } catch (emailErr) {
            console.error(
              '[Shift Requests API] Error sending approval email to requester',
              emailErr
            );
          }
        }
      }

      // If any requested dates are pending, send one "request received" email to the employee
      let hasAnyPending = false;
      for (const dayKey of DAY_KEYS) {
        for (const entry of toAddByDay[dayKey]) {
          if (entry.date && entry.status !== 'approved') {
            hasAnyPending = true;
            break;
          }
        }
        if (hasAnyPending) break;
      }
      if (hasAnyPending && requesterEmail) {
        const jobTitle = job.title || 'Job';
        const shiftName =
          (shift as { shiftName?: string }).shiftName || shiftSlug;
        const requestedDatesList = dateRequests.map((r) => r.date);
        const dateLabels =
          (requestedDatesList?.length ?? 0) > 0
            ? (requestedDatesList || []).slice(0, 10).join(', ') +
              ((requestedDatesList?.length ?? 0) > 10
                ? ` and ${(requestedDatesList?.length ?? 0) - 10} more`
                : '')
            : '';
        const pendingReason = autoAddEnabled
          ? 'Positions are currently filled for the requested dates, so you have been added to the waitlist. You will be notified if a position becomes available.'
          : 'Your request is pending manager review. You will be notified once it has been reviewed.';
        const subject = `Shift request received – ${jobTitle} – ${shiftName}`;
        const plainSummary = `Your shift request for ${jobTitle} – ${shiftName} (${dateLabels || 'requested dates'}) has been received and is pending. ${pendingReason}`;
        const html = [
          '<div style="font-family:\'Segoe UI\',Tahoma,Geneva,Verdana,sans-serif; max-width:560px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:8px; overflow:hidden;">',
          '<div style="background:#0d9488; color:#fff; padding:14px 20px; font-size:18px; font-weight:600;">Shift request received</div>',
          '<div style="padding:20px;">',
          `<p style="margin:0 0 16px; color:#374151; font-size:14px;">Your shift request has been received.</p>`,
          '<table style="width:100%; border-collapse:collapse; font-size:14px; border:1px solid #e5e7eb; border-radius:6px;">',
          '<tr style="background:#f9fafb;"><td style="padding:10px 14px; color:#6b7280; width:120px;">Job</td><td style="padding:10px 14px; color:#111827;">' +
            escapeHtml(jobTitle) +
            '</td></tr>',
          '<tr><td style="padding:10px 14px; color:#6b7280;">Shift</td><td style="padding:10px 14px; color:#111827;">' +
            escapeHtml(shiftName) +
            '</td></tr>',
          '<tr><td style="padding:10px 14px; color:#6b7280;">Requested dates</td><td style="padding:10px 14px; color:#111827;">' +
            escapeHtml(dateLabels || '—') +
            '</td></tr>',
          '</table>',
          `<p style="margin:16px 0 0; color:#6b7280; font-size:13px;">${escapeHtml(pendingReason)}</p>`,
          '</div>',
          '<div style="padding:12px 20px; background:#f9fafb; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280;">This is an automated notification from the Employee App.</div>',
          '</div>',
        ].join('');
        try {
          await emailService.sendEmail({
            to: requesterEmail,
            subject,
            html,
            text: plainSummary,
            db,
          });
        } catch (emailErr) {
          console.error(
            '[Shift Requests API] Error sending pending-request email to requester',
            emailErr
          );
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

function callOffBeforeToMinutes(callOffBefore: number, unit: string): number {
  if (unit === 'days') return callOffBefore * 1440;
  if (unit === 'hours') return callOffBefore * 60;
  return callOffBefore;
}

// PATCH /api/shift-requests
// Call off an approved date-specific shift for the current employee.
// Only date-specific roster entries are supported (recurring/legacy not supported).
async function callOffShiftHandler(request: AuthenticatedRequest) {
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
          message: 'Missing applicant id for call off.',
        },
        { status: 400 }
      );
    }

    const body = (await request.json()) as CallOffRequestBody;
    const { jobId, shiftSlug, date, dayKey, reason } = body;

    if (!jobId || !shiftSlug || !date || !dayKey) {
      return NextResponse.json(
        {
          error: 'missing-parameters',
          message: 'jobId, shiftSlug, date and dayKey are required.',
        },
        { status: 400 }
      );
    }

    const reasonTrimmed = typeof reason === 'string' ? reason.trim() : '';
    if (!reasonTrimmed) {
      return NextResponse.json(
        {
          error: 'missing-reason',
          message: 'A reason for the call off is required.',
        },
        { status: 400 }
      );
    }

    if (!DAY_KEYS.includes(dayKey)) {
      return NextResponse.json(
        {
          error: 'invalid-day',
          message: 'Invalid day of week.',
        },
        { status: 400 }
      );
    }

    const { db } = await getTenantAwareConnection(request);

    const job = await findJobByjobId(db, jobId);
    if (!job) {
      return NextResponse.json(
        { error: 'job-not-found', message: 'Job not found.' },
        { status: 404 }
      );
    }

    const shift = (job.shifts || []).find((s) => s.slug === shiftSlug);
    if (!shift) {
      return NextResponse.json(
        { error: 'shift-not-found', message: 'Shift not found.' },
        { status: 404 }
      );
    }

    const additionalConfig = job.additionalConfig as
      | {
          allowCallOff?: boolean;
          callOffBefore?: number;
          callOffBeforeUnit?: string;
        }
      | undefined;
    if (!additionalConfig?.allowCallOff) {
      return NextResponse.json(
        {
          error: 'call-off-not-allowed',
          message: 'Call off is not allowed for this job.',
        },
        { status: 400 }
      );
    }

    const schedule = shift.defaultSchedule?.[dayKey];
    const roster = (schedule?.roster ?? []) as Array<
      string | (RosterEntry & { status?: RosterEntryStatus })
    >;

    const entry = roster.find((e) => {
      if (typeof e === 'string') return false;
      return e.employeeId === applicantId && e.date === date;
    }) as (RosterEntry & { status?: RosterEntryStatus }) | undefined;

    if (!entry || typeof entry === 'string') {
      return NextResponse.json(
        {
          error: 'roster-entry-not-found',
          message:
            'No date-specific roster entry found for this shift and date.',
        },
        { status: 404 }
      );
    }

    if (!entry.date) {
      return NextResponse.json(
        {
          error: 'recurring-not-supported',
          message: 'Call off is only supported for date-specific shifts.',
        },
        { status: 400 }
      );
    }

    const status = entry.status;
    if (status === 'called_off' || status === 'cancelled') {
      return NextResponse.json(
        {
          error: 'already-called-off',
          message: 'This shift is already called off or cancelled.',
        },
        { status: 400 }
      );
    }
    if (status !== 'approved' && status !== undefined) {
      return NextResponse.json(
        {
          error: 'invalid-status',
          message: 'Only approved shifts can be called off.',
        },
        { status: 400 }
      );
    }

    const callOffBefore = Number(additionalConfig?.callOffBefore) || 0;
    const callOffBeforeUnit = additionalConfig?.callOffBeforeUnit ?? 'minutes';
    const requiredMinutesBefore =
      callOffBefore > 0
        ? callOffBeforeToMinutes(callOffBefore, callOffBeforeUnit)
        : 0;

    if (requiredMinutesBefore > 0 && schedule?.start) {
      const shiftStart = getShiftStartOnDate(schedule.start, date);
      const now = new Date();
      if (!shiftStart) {
        return NextResponse.json(
          {
            error: 'invalid-schedule',
            message: 'Invalid shift start time.',
          },
          { status: 400 }
        );
      }
      const minutesUntilStart =
        (shiftStart.getTime() - now.getTime()) / (60 * 1000);
      if (minutesUntilStart < requiredMinutesBefore) {
        return NextResponse.json(
          {
            error: 'too-late-to-call-off',
            message: `Call off must be at least ${callOffBefore} ${callOffBeforeUnit} before shift start.`,
          },
          { status: 400 }
        );
      }
    }

    const statusPath = `shifts.$[shift].defaultSchedule.${dayKey}.roster.$[entry].status`;
    const callOffReasonPath = `shifts.$[shift].defaultSchedule.${dayKey}.roster.$[entry].callOffReason`;
    const updateResult = await db.collection('jobs').updateOne(
      { _id: new ObjectId(jobId) },
      {
        $set: {
          [statusPath]: 'called_off',
          [callOffReasonPath]: reasonTrimmed,
        },
      },
      {
        arrayFilters: [
          { 'shift.slug': shiftSlug },
          { 'entry.employeeId': applicantId, 'entry.date': date },
        ],
      }
    );

    if (!updateResult.acknowledged) {
      return NextResponse.json(
        {
          error: 'update-failed',
          message: 'Failed to call off shift.',
        },
        { status: 500 }
      );
    }

    if (updateResult.modifiedCount === 0) {
      return NextResponse.json(
        {
          error: 'update-failed',
          message: 'No matching roster entry found to update.',
        },
        { status: 400 }
      );
    }

    // Notify event manager(s) by email (same recipients as shift request notifications)
    type ManagerRecipient = {
      userId?: string;
      applicantId?: string;
      firstName?: string;
      lastName?: string;
      fullName?: string;
      email?: string;
    };
    const configRecipients = (
      job?.additionalConfig as {
        eventManagerNotificationRecipients?: ManagerRecipient[];
      }
    )?.eventManagerNotificationRecipients;
    if (Array.isArray(configRecipients) && configRecipients.length > 0) {
      const firstName = user.given_name ?? user.firstName ?? '';
      const lastName = user.family_name ?? user.lastName ?? '';
      const employeeName =
        (user.name as string | undefined)?.trim() ||
        [firstName, lastName].filter(Boolean).join(' ') ||
        'Employee';
      const shiftName =
        (shift as { shiftName?: string }).shiftName || shiftSlug;
      // Use body date and dayKey as-is, no timezone conversion
      const dayLabel =
        dayKey.charAt(0).toUpperCase() + dayKey.slice(1).toLowerCase();
      const subject = `Shift call-off: ${employeeName} – ${job.title || 'Job'}`;
      const text = [
        'An employee has called off a shift.',
        '',
        `Employee: ${employeeName}`,
        `Job: ${job.title || 'N/A'}`,
        `Shift: ${shiftName}`,
        `Day: ${dayLabel}`,
        `Date: ${date}`,
        `Reason: ${reasonTrimmed}`,
        '',
        'This is an automated notification from the Employee App.',
      ].join('\n');
      const html = [
        '<div style="font-family:\'Segoe UI\',Tahoma,Geneva,Verdana,sans-serif; max-width:560px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:8px; overflow:hidden;">',
        '<div style="background:#b45309; color:#fff; padding:14px 20px; font-size:18px; font-weight:600;">Shift call-off</div>',
        '<div style="padding:20px;">',
        '<p style="margin:0 0 16px; color:#374151; font-size:14px;">An employee has called off a shift.</p>',
        '<table style="width:100%; border-collapse:collapse; font-size:14px; margin-bottom:20px; border:1px solid #e5e7eb; border-radius:6px;">',
        '<tr style="background:#f9fafb;"><td colspan="2" style="padding:10px 14px; font-weight:600; color:#374151; border-bottom:1px solid #e5e7eb;">Call-off details</td></tr>',
        `<tr><td style="padding:10px 14px; color:#6b7280; width:140px; border-bottom:1px solid #f3f4f6;">Employee</td><td style="padding:10px 14px; color:#111827; border-bottom:1px solid #f3f4f6;">${escapeHtml(employeeName)}</td></tr>`,
        `<tr><td style="padding:10px 14px; color:#6b7280; border-bottom:1px solid #f3f4f6;">Job</td><td style="padding:10px 14px; color:#111827; border-bottom:1px solid #f3f4f6;">${escapeHtml(job.title || 'N/A')}</td></tr>`,
        `<tr><td style="padding:10px 14px; color:#6b7280; border-bottom:1px solid #f3f4f6;">Shift</td><td style="padding:10px 14px; color:#111827; border-bottom:1px solid #f3f4f6;">${escapeHtml(shiftName)}</td></tr>`,
        `<tr><td style="padding:10px 14px; color:#6b7280; border-bottom:1px solid #f3f4f6;">Day</td><td style="padding:10px 14px; color:#111827; border-bottom:1px solid #f3f4f6;">${escapeHtml(dayLabel)}</td></tr>`,
        `<tr><td style="padding:10px 14px; color:#6b7280; border-bottom:1px solid #f3f4f6;">Date</td><td style="padding:10px 14px; color:#111827; border-bottom:1px solid #f3f4f6;">${escapeHtml(date)}</td></tr>`,
        `<tr><td style="padding:10px 14px; color:#6b7280;">Reason</td><td style="padding:10px 14px; color:#111827;">${escapeHtml(reasonTrimmed)}</td></tr>`,
        '</table>',
        '</div>',
        '<div style="padding:12px 20px; background:#f9fafb; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280;">This is an automated notification from the Employee App.</div>',
        '</div>',
      ].join('');
      for (const r of configRecipients) {
        const to = r?.email?.trim();
        if (!to) continue;
        try {
          await emailService.sendEmail({ to, subject, html, text, db });
        } catch (emailErr) {
          console.error(
            '[Shift Requests API] Error sending call-off email to',
            to,
            emailErr
          );
        }
      }
    }

    // Auto-add waitlisted: promote first pending with same position when slot opens
    const autoAddConfig = job.additionalConfig as
      | { autoAddWaitlistedStaff?: boolean }
      | undefined;
    const shiftWithPositions = shift as {
      positions?: Array<PositionCapacity & { positionName?: string }>;
      shiftName?: string;
      shiftRoster?: Array<{
        _id?: unknown;
        employeeId?: string;
        email?: string;
      }>;
    };
    if (
      autoAddConfig?.autoAddWaitlistedStaff === true &&
      Array.isArray(shiftWithPositions.positions) &&
      shiftWithPositions.positions.length > 0
    ) {
      const totalForDay = getTotalPositionsForShiftDayDate(
        shiftWithPositions,
        dayKey,
        date
      );
      if (totalForDay > 0) {
        const jobAfter = (await db
          .collection('jobs')
          .findOne(
            { _id: new ObjectId(jobId) },
            { projection: DEFAULT_JOBS_PROJECTION }
          )) as {
          shifts?: Array<{
            slug?: string;
            defaultSchedule?: Record<string, { roster?: unknown[] }>;
            shiftRoster?: Array<{
              _id?: unknown;
              employeeId?: string;
              email?: string;
            }>;
            positions?: Array<PositionCapacity & { positionName?: string }>;
          }>;
        } | null;
        const shiftAfter = jobAfter?.shifts?.find((s) => s.slug === shiftSlug);
        const rosterAfter = (shiftAfter?.defaultSchedule?.[dayKey]?.roster ??
          []) as Array<
          | string
          | (RosterEntry & {
              status?: RosterEntryStatus;
              assignedPosition?: string;
              requestedPosition?: string;
            })
        >;
        const calledOffPos = normalizedAssignedPosition(
          entry as RosterEntry & { assignedPosition?: string }
        );
        const total =
          calledOffPos != null
            ? getTotalForPosition(
                shiftWithPositions,
                calledOffPos,
                dayKey,
                date
              )
            : getTotalPositionsForShiftDayDate(
                shiftWithPositions,
                dayKey,
                date
              );
        const filled = getFilledCountForPosition(
          rosterAfter,
          date,
          calledOffPos
        );
        if (filled < total) {
          const pendingEntry = rosterAfter.find(
            (
              e
            ): e is RosterEntry & {
              status?: RosterEntryStatus;
              assignedPosition?: string;
              requestedPosition?: string;
              employeeId: string;
            } => {
              if (typeof e === 'string') return false;
              return (
                e.date === date &&
                e.status === 'pending' &&
                normalizedRequestedOrAssignedPosition(e) === calledOffPos
              );
            }
          );
          if (pendingEntry) {
            const statusPath = `shifts.$[shift].defaultSchedule.${dayKey}.roster.$[entry].status`;
            const approvedByPath = `shifts.$[shift].defaultSchedule.${dayKey}.roster.$[entry].approvedBy`;
            const assignedPositionPath = `shifts.$[shift].defaultSchedule.${dayKey}.roster.$[entry].assignedPosition`;
            const promoteResult = await db.collection('jobs').updateOne(
              { _id: new ObjectId(jobId) },
              {
                $set: {
                  [statusPath]: 'approved',
                  [approvedByPath]: AUTO_APPROVED_BY,
                  ...(calledOffPos != null
                    ? { [assignedPositionPath]: calledOffPos }
                    : {}),
                },
              },
              {
                arrayFilters: [
                  { 'shift.slug': shiftSlug },
                  {
                    'entry.employeeId': pendingEntry.employeeId,
                    'entry.date': date,
                    'entry.status': 'pending',
                  },
                ],
              }
            );
            if (
              promoteResult.acknowledged &&
              promoteResult.modifiedCount &&
              promoteResult.modifiedCount > 0
            ) {
              let promotedEmail: string | undefined = (
                shiftAfter?.shiftRoster as
                  | Array<{
                      _id?: unknown;
                      employeeId?: string;
                      email?: string;
                    }>
                  | undefined
              )
                ?.find(
                  (emp) =>
                    emp &&
                    String(emp._id ?? emp.employeeId) ===
                      String(pendingEntry.employeeId)
                )
                ?.email?.trim();
              if (!promotedEmail) {
                const applicantFilter = ObjectId.isValid(
                  pendingEntry.employeeId
                )
                  ? { _id: new ObjectId(pendingEntry.employeeId) }
                  : null;
                const applicantDoc = applicantFilter
                  ? ((await db
                      .collection('applicants')
                      .findOne(applicantFilter, {
                        projection: DEFAULT_APPLICANT_PROJECTION,
                      })) as { email?: string } | null)
                  : null;
                promotedEmail = applicantDoc?.email?.trim();
              }
              if (promotedEmail) {
                const jobTitle = job.title || 'Job';
                const shiftName = shiftWithPositions.shiftName || shiftSlug;
                const promotedPosition =
                  pendingEntry.requestedPosition ??
                  pendingEntry.assignedPosition ??
                  calledOffPos;
                const positionLabel = promotedPosition
                  ? ` – ${promotedPosition}`
                  : '';
                const subject = `Shift request approved – ${jobTitle} – ${shiftName}${positionLabel}`;
                const plainSummary = `Your shift request for ${jobTitle} – ${shiftName} (${date}) was approved.`;
                const html = [
                  '<div style="font-family:\'Segoe UI\',Tahoma,Geneva,Verdana,sans-serif; max-width:560px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:8px; overflow:hidden;">',
                  '<div style="background:#059669; color:#fff; padding:14px 20px; font-size:18px; font-weight:600;">Shift request approved</div>',
                  '<div style="padding:20px;">',
                  `<p style="margin:0 0 16px; color:#374151; font-size:14px;">${escapeHtml(plainSummary)}</p>`,
                  '<table style="width:100%; border-collapse:collapse; font-size:14px; border:1px solid #e5e7eb; border-radius:6px;">',
                  '<tr style="background:#f9fafb;"><td style="padding:10px 14px; color:#6b7280; width:120px;">Job</td><td style="padding:10px 14px; color:#111827;">' +
                    escapeHtml(jobTitle) +
                    '</td></tr>',
                  '<tr><td style="padding:10px 14px; color:#6b7280;">Shift</td><td style="padding:10px 14px; color:#111827;">' +
                    escapeHtml(shiftName) +
                    '</td></tr>',
                  '<tr><td style="padding:10px 14px; color:#6b7280;">Date</td><td style="padding:10px 14px; color:#111827;">' +
                    escapeHtml(date) +
                    '</td></tr>',
                  promotedPosition
                    ? '<tr><td style="padding:10px 14px; color:#6b7280;">Position</td><td style="padding:10px 14px; color:#111827;">' +
                      escapeHtml(promotedPosition) +
                      '</td></tr>'
                    : '',
                  '</table>',
                  '</div>',
                  '<div style="padding:12px 20px; background:#f9fafb; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280;">This is an automated notification from the Employee App.</div>',
                  '</div>',
                ].join('');
                try {
                  await emailService.sendEmail({
                    to: promotedEmail,
                    subject,
                    html,
                    text: plainSummary,
                    db,
                  });
                } catch (emailErr) {
                  console.error(
                    '[Shift Requests API] Error sending approval email to promoted employee',
                    emailErr
                  );
                }
              }
            }
          }
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Shift called off successfully.',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Shift Requests API] PATCH error:', error);
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

export const PATCH = withEnhancedAuthAPI(callOffShiftHandler, {
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
