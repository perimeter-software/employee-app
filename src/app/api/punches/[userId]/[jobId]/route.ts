import { NextResponse } from 'next/server';
import { withEnhancedAuthAPI } from '@/lib/middleware';
import { getTenantAwareConnection } from '@/lib/db';
import type { AuthenticatedRequest } from '@/domains/user/types';
import {
  findOpenPunchByApplicantIdAndJobId,
  createPunchIn,
  createPunchOut,
  updatePunch,
  checkForOverlappingPunch,
  checkForPreviousPunchesWithinShift,
  getTotalWorkedHoursForWeek,
} from '@/domains/punch/utils';
import { ObjectId as ObjectIdFunction } from 'mongodb';
import { parseClockInCoordinates } from '@/lib/utils';
import { ClockInCoordinates, Shift } from '@/domains/job';
import { findJobByjobId, getUserType } from '@/domains/user/utils';
import {
  giveJobAllowedGeoDistance,
  giveJobGeoCoords,
  isJobGeoFenced,
  jobHasShiftForUser,
} from '@/domains/punch/utils/shift-job-utils';
import { Punch, PunchNoId } from '@/domains/punch';
import { createNotification } from '@/domains/notification/utils/mongo-notification-utils';
import type {
  ApplicantCollectionDoc,
  ApplicantNote,
} from '@/domains/user/types/applicant.types';
import { emailService } from '@/lib/services/email-service';

// Utility Functions
const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in km
  return distance;
};

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createNewPunch(
  userId: string,
  applicantId: string,
  jobId: string,
  userNote: string | null,
  coordinates: ClockInCoordinates | null,
  timeIn: string,
  selectedShift: Shift
): PunchNoId {
  const now = new Date().toISOString();

  return {
    type: 'punch',
    userId,
    applicantId,
    jobId,
    timeIn,
    timeOut: null,
    userNote: userNote || null,
    managerNote: null,
    approvingManager: null,
    status: 'Pending',
    modifiedDate: now,
    modifiedBy: userId,
    clockInCoordinates: coordinates,
    leaveRequest: null,
    paidHours: null,
    shiftSlug: selectedShift.slug,
  };
}

// POST Handler for Creating Punches (Clock In)
async function createPunchHandler(
  request: AuthenticatedRequest,
  context?: Record<string, unknown>
) {
  try {
    const user = request.user;
    const params = (await context?.params) as
      | { userId: string; jobId: string }
      | undefined;
    const userId = params?.userId;
    const jobId = params?.jobId;

    if (!jobId || !userId) {
      return NextResponse.json(
        { error: 'missing-required-info', message: 'Missing required info!' },
        { status: 400 }
      );
    }

    const {
      userNote,
      clockInCoordinates,
      timeIn,
      newStartDate,
      newEndDate,
      selectedShift,
      applicantId,
    } = await request.json();

    // Connect to database
    const { db } = await getTenantAwareConnection(request);

    const openPunch = (await findOpenPunchByApplicantIdAndJobId(
      db,
      applicantId || '',
      jobId
    )) as Punch;

    const totalHoursWorked = await getTotalWorkedHoursForWeek(
      db,
      userId,
      applicantId || '',
      jobId
    );

    if (openPunch) {
      return NextResponse.json(
        {
          error: 'open-punch-exists',
          message: 'Unauthorized: Open punch exists',
          openPunch: JSON.stringify(openPunch),
        },
        { status: 403 }
      );
    }

    // We want the backend to be the source of truth for logic enforcement so get from db
    const job = await findJobByjobId(db, jobId);
    if (!job) {
      return NextResponse.json(
        { error: 'job-not-found', message: 'Job not found' },
        { status: 400 }
      );
    }

    if (!jobHasShiftForUser(job, applicantId || '')) {
      return NextResponse.json(
        { error: 'no-shifts', message: 'No shifts to clock in for!' },
        { status: 404 }
      );
    }

    // Initiate usersCurrentCoordinates - will remain null if coordinates are invalid or not provided
    let usersCurrentCoordinates: ClockInCoordinates | null = null;

    const type = await getUserType(db, user._id || '');

    // Admin and Master user role can always clockin regardless if geofenced or not
    if (isJobGeoFenced(job) && type === 'User') {
      const coordinateResults = parseClockInCoordinates(clockInCoordinates);

      if (!coordinateResults) {
        return NextResponse.json(
          {
            error: 'invalid-coordinates',
            message: 'Invalid or missing clockInCoordinates for geofenced job',
          },
          { status: 400 }
        );
      }

      usersCurrentCoordinates = { ...coordinateResults };
      const jobsCoordinates = giveJobGeoCoords(job);

      if (jobsCoordinates?.lat === 0 || jobsCoordinates?.long === 0) {
        return NextResponse.json(
          {
            error: 'missing-job-coordinates',
            message: 'Missing required job coordinates',
          },
          { status: 404 }
        );
      }

      // coordinates is where user is now, and then we pull lat & lng from job.location.geocoordinates
      const currentDistance = calculateDistance(
        usersCurrentCoordinates.latitude,
        usersCurrentCoordinates.longitude,
        jobsCoordinates.lat,
        jobsCoordinates.long
      );

      if (
        !job.location?.graceDistanceFeet ||
        !job.location.geocoordinates?.geoFenceRadius
      ) {
        return NextResponse.json(
          {
            error: 'missing-job-coordinates',
            message: 'Missing required job coordinates',
          },
          { status: 404 }
        );
      }

      const allowedDistance = giveJobAllowedGeoDistance(job);
      if (currentDistance > allowedDistance) {
        return NextResponse.json(
          {
            error: 'outside-geofence',
            message:
              'Unauthorized: Not within allowable distance of job location',
          },
          { status: 400 }
        );
      }
    } else {
      // For non-geofenced jobs or admin/master users, try to parse coordinates if provided but don't require them
      if (clockInCoordinates) {
        const coordinateResults = parseClockInCoordinates(clockInCoordinates);
        if (coordinateResults) {
          usersCurrentCoordinates = { ...coordinateResults };
        }
        // If coordinates are invalid, we'll just continue without them (usersCurrentCoordinates remains null)
      }
    }

    // Check if breaks are not allowed and there are previous punches for today
    if (!newStartDate || !newEndDate) {
      return NextResponse.json(
        { error: 'no-valid-shift', message: 'No valid shift for today!' },
        { status: 400 }
      );
    }

    const hasPreviousPunches = await checkForPreviousPunchesWithinShift(
      db,
      userId,
      applicantId || '',
      jobId,
      newStartDate,
      newEndDate
    );

    if (
      job.additionalConfig &&
      !job.additionalConfig.allowBreaks &&
      hasPreviousPunches
    ) {
      return NextResponse.json(
        {
          error: 'breaks-not-allowed',
          message:
            'You cannot clock in again during this shift because breaks are not allowed.',
        },
        { status: 403 }
      );
    }

    // Check for overtime and allowOvertime setting
    const allowOvertime = job.additionalConfig?.allowOvertime ?? true;

    if (!allowOvertime && totalHoursWorked > 40) {
      return NextResponse.json(
        {
          error: 'overtime-not-allowed',
          message:
            "You cannot clock in again because you've exceeded 40 hours and overtime is not allowed.",
        },
        { status: 400 }
      );
    }

    const newPunch: PunchNoId = createNewPunch(
      userId,
      applicantId || '',
      jobId,
      userNote,
      usersCurrentCoordinates, // This can now be null
      timeIn,
      selectedShift
    );

    const punch = await createPunchIn(db, newPunch);
    if (!punch) {
      return NextResponse.json(
        { error: 'clock-in-failed', message: 'Error clocking in' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Clocked in successfully!',
        data: {
          punch,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Clock in error:', error);
    return NextResponse.json(
      { error: 'internal-error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT Handler for Updating Punches (Clock Out or Edit)
async function updatePunchHandler(request: AuthenticatedRequest) {
  try {
    const user = request.user;
    const { action, punch } = await request.json();

    if (!punch) {
      return NextResponse.json(
        { error: 'missing-punch', message: 'Missing punch' },
        { status: 400 }
      );
    }

    // Connect to database
    const { db } = await getTenantAwareConnection(request);

    let updatedPunch;

    if (action === 'clockOut') {
      updatedPunch = await createPunchOut(db, punch);
      if (!updatedPunch) {
        return NextResponse.json(
          { error: 'clock-out-failed', message: 'Error clocking out' },
          { status: 500 }
        );
      }
    } else if (action === 'update') {
      // Get the original punch from database to compare times
      const originalPunch = await db.collection('timecard').findOne({
        _id: new ObjectIdFunction(punch._id),
      });

      if (!originalPunch) {
        return NextResponse.json(
          { error: 'punch-not-found', message: 'Original punch not found' },
          { status: 404 }
        );
      }

      // Only check for overlap if timeIn or timeOut has actually changed
      const timeInChanged = originalPunch.timeIn !== punch.timeIn;
      const timeOutChanged = originalPunch.timeOut !== punch.timeOut;

      if (timeInChanged || timeOutChanged) {
        const overlap = await checkForOverlappingPunch(
          db,
          user.applicantId || '',
          punch.timeIn,
          punch.timeOut ?? null,
          punch._id
        );

        if (overlap) {
          return NextResponse.json(
            {
              error: 'punch-overlap',
              message: 'Making this change would create a punch overlap!',
            },
            { status: 400 }
          );
        }
      }

      // Check if managerNote was added or updated
      const managerNoteAdded = 
        punch.managerNote && 
        (!originalPunch.managerNote || originalPunch.managerNote !== punch.managerNote);

      const updatedAtIso = new Date().toISOString();
      const updateData: Punch = {
        ...punch,
        modifiedDate: updatedAtIso,
        modifiedBy: String(user._id ?? ''),
      };

      updatedPunch = await updatePunch(db, updateData);

      if (!updatedPunch) {
        return NextResponse.json(
          { error: 'update-failed', message: 'Error updating punch' },
          { status: 500 }
        );
      }

      // Add manager note to applicant's notes array when manager note was added/updated
      if (managerNoteAdded && punch.managerNote && punch.applicantId) {
        try {
          const managerFirstName =
            user.firstName || user.name?.split(' ')[0] || 'Manager';
          const managerLastName =
            user.lastName || user.name?.split(' ').slice(1).join(' ') || '';
          const managerUserId =
            user._id != null ? String(user._id) : '';

          const applicantNote: ApplicantNote = {
            type: 'General',
            text: `<div>${String(punch.managerNote)
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')}</div>`,
            firstName: managerFirstName,
            lastName: managerLastName,
            userId: managerUserId,
            date: new Date(),
          };

          await db
            .collection<ApplicantCollectionDoc>('applicants')
            .updateOne(
              { _id: new ObjectIdFunction(punch.applicantId) },
              {
                $push: { notes: applicantNote },
                $set: { modifiedDate: new Date() },
              }
            );
        } catch (applicantNoteError) {
          console.error(
            'Error adding manager note to applicant notes:',
            applicantNoteError
          );
        }
      }

      // Notify event manager(s): same condition for both in-app and email (time edited OR note added)
      const punchTimeEdited = timeInChanged || timeOutChanged;
      const shouldNotifyEventManagers = (managerNoteAdded && punch.managerNote) || punchTimeEdited;
      if (shouldNotifyEventManagers) {
        try {
          const job = await findJobByjobId(db, punch.jobId);
          type EventManagerRecipient = { userId?: string; applicantId?: string; firstName?: string; lastName?: string; fullName?: string; email?: string };
          const configRecipients = (job?.additionalConfig as { eventManagerNotificationRecipients?: EventManagerRecipient[] })?.eventManagerNotificationRecipients;
          if (!job || !Array.isArray(configRecipients) || configRecipients.length === 0) {
            // No recipients configured; punch update already succeeded
          } else {
            const employeeApplicant = await db.collection('applicants').findOne({
              _id: new ObjectIdFunction(punch.applicantId),
            }) as { firstName?: string; lastName?: string } | null;
            const employeeName = employeeApplicant
              ? `${employeeApplicant.firstName || ''} ${employeeApplicant.lastName || ''}`.trim() || 'Employee'
              : 'Employee';
            const editorName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.name || 'User';
            // US Central Time for event manager email and notification; label for clarity
            const CENTRAL_TZ = 'America/Chicago';
            const TZ_LABEL = 'Central Time';
            const formatDt = (iso: string | null | undefined) => {
              if (!iso) return '—';
              const d = new Date(iso);
              if (Number.isNaN(d.getTime())) return '—';
              return d.toLocaleString('en-US', { timeZone: CENTRAL_TZ, dateStyle: 'medium', timeStyle: 'short' }) + ` ${TZ_LABEL}`;
            };
            const shiftName = (punch as { shiftName?: string }).shiftName || job.shifts?.find((s: { slug?: string }) => s.slug === (punch as { shiftSlug?: string }).shiftSlug)?.shiftName || '—';
            const stripHtml = (s: string) => String(s || '').replace(/<[^>]*>/g, '').trim();

            // One notification body for both time edit and/or manager note
            const notificationParts = [
              `Punch updated for ${employeeName}.`,
              `(All times in US Central Time.)`,
              `Job: ${job.title || 'N/A'}`,
              `Shift: ${shiftName}`,
              '',
            ];
            if (punchTimeEdited) {
              notificationParts.push(
                'Time change:',
                `Original: ${formatDt(originalPunch.timeIn)} – ${formatDt(originalPunch.timeOut ?? null)}`,
                `New:      ${formatDt(punch.timeIn)} – ${formatDt(punch.timeOut ?? null)}`,
                ''
              );
            }
            if (managerNoteAdded && punch.managerNote) {
              notificationParts.push('Manager note: ' + stripHtml(punch.managerNote), '');
            }
            notificationParts.push('Updated by: ' + editorName, 'Updated at: ' + formatDt(updatedAtIso));
            const notificationBody = notificationParts.join('\n');

            // In-app notification for every recipient (same condition as email)
            for (const r of configRecipients) {
              const recipientUserId = r?.userId?.trim();
              if (!recipientUserId) continue;
              try {
                await createNotification(db, {
                  fromUserId: user._id || '',
                  fromFirstName: user.firstName || user.name?.split(' ')[0] || 'Client',
                  fromLastName: user.lastName || user.name?.split(' ').slice(1).join(' ') || 'User',
                  recipient: {
                    userId: recipientUserId,
                    applicantId: r?.applicantId?.trim() || '',
                    firstName: r?.firstName ?? '',
                    lastName: r?.lastName ?? '',
                  },
                  msgType: 'system',
                  subject: 'Punch updated',
                  msgTemplate: 'system',
                  body: notificationBody,
                  profileImg: '',
                  status: 'unread',
                  type: 'info',
                });
              } catch (notifErr) {
                console.error('Error sending punch-update notification to', recipientUserId, notifErr);
              }
            }

            // Email for every recipient (same condition; content adapts to time edit and/or note)
            const subject = `Punch updated: ${employeeName} – ${job.title || 'Job'}`;
            const textParts = [
              'A punch was updated with the following details.',
              'All times are in US Central Time.',
              '',
              'Employee: ' + employeeName,
              'Job: ' + (job.title || 'N/A'),
              'Shift: ' + shiftName,
              '',
            ];
            if (punchTimeEdited) {
              textParts.push(
                'Original Time In:  ' + formatDt(originalPunch.timeIn),
                'Original Time Out: ' + formatDt(originalPunch.timeOut ?? null),
                'New Time In:       ' + formatDt(punch.timeIn),
                'New Time Out:      ' + formatDt(punch.timeOut ?? null),
                '',
              );
            }
            textParts.push('Updated by: ' + editorName, 'Updated at: ' + formatDt(updatedAtIso));
            if (punch.userNote) textParts.push('', 'User note: ' + stripHtml(punch.userNote));
            if (punch.managerNote) textParts.push('', 'Manager note: ' + stripHtml(punch.managerNote));
            const text = textParts.join('\n');

            const timeChangeTableRows = punchTimeEdited
              ? [
                  '<tr style="background:#f9fafb;"><td colspan="2" style="padding:10px 14px; font-weight:600; color:#374151; border-bottom:1px solid #e5e7eb;">Time change</td></tr>',
                  '<tr><td style="padding:10px 14px; color:#6b7280; width:140px; border-bottom:1px solid #f3f4f6;">Original time in</td><td style="padding:10px 14px; color:#111827; border-bottom:1px solid #f3f4f6;">' + escapeHtml(formatDt(originalPunch.timeIn)) + '</td></tr>',
                  '<tr><td style="padding:10px 14px; color:#6b7280; border-bottom:1px solid #f3f4f6;">Original time out</td><td style="padding:10px 14px; color:#111827; border-bottom:1px solid #f3f4f6;">' + escapeHtml(formatDt(originalPunch.timeOut ?? null)) + '</td></tr>',
                  '<tr><td style="padding:10px 14px; color:#6b7280; border-bottom:1px solid #f3f4f6;">New time in</td><td style="padding:10px 14px; color:#0d9488; font-weight:500; border-bottom:1px solid #f3f4f6;">' + escapeHtml(formatDt(punch.timeIn)) + '</td></tr>',
                  '<tr><td style="padding:10px 14px; color:#6b7280;">New time out</td><td style="padding:10px 14px; color:#0d9488; font-weight:500;">' + escapeHtml(formatDt(punch.timeOut ?? null)) + '</td></tr>',
                ]
              : [];
            const html = [
              '<div style="font-family:\'Segoe UI\',Tahoma,Geneva,Verdana,sans-serif; max-width:560px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:8px; overflow:hidden;">',
              '<div style="background:#0d9488; color:#fff; padding:14px 20px; font-size:18px; font-weight:600;">Punch update notification</div>',
              '<div style="padding:20px;">',
              '<p style="margin:0 0 4px; color:#374151; font-size:14px;">A punch was updated with the following details.</p>',
              '<p style="margin:0 0 16px; color:#6b7280; font-size:12px;">All times are in US Central Time.</p>',
              '<table style="width:100%; border-collapse:collapse; font-size:14px; margin-bottom:20px; border:1px solid #e5e7eb; border-radius:6px;">',
              '<tr style="background:#f9fafb;"><td colspan="2" style="padding:10px 14px; font-weight:600; color:#374151; border-bottom:1px solid #e5e7eb;">Punch details</td></tr>',
              '<tr><td style="padding:10px 14px; color:#6b7280; width:140px; border-bottom:1px solid #f3f4f6;">Employee</td><td style="padding:10px 14px; color:#111827; border-bottom:1px solid #f3f4f6;">' + escapeHtml(employeeName) + '</td></tr>',
              '<tr><td style="padding:10px 14px; color:#6b7280; border-bottom:1px solid #f3f4f6;">Job</td><td style="padding:10px 14px; color:#111827; border-bottom:1px solid #f3f4f6;">' + escapeHtml(job.title || 'N/A') + '</td></tr>',
              '<tr><td style="padding:10px 14px; color:#6b7280;">Shift</td><td style="padding:10px 14px; color:#111827;">' + escapeHtml(shiftName) + '</td></tr>',
              '</table>',
              ...(timeChangeTableRows.length > 0
                ? ['<table style="width:100%; border-collapse:collapse; font-size:14px; margin-bottom:20px; border:1px solid #e5e7eb; border-radius:6px;">', ...timeChangeTableRows, '</table>']
                : []),
              '<table style="width:100%; border-collapse:collapse; font-size:14px; margin-bottom:20px; border:1px solid #e5e7eb; border-radius:6px;">',
              '<tr style="background:#f9fafb;"><td colspan="2" style="padding:10px 14px; font-weight:600; color:#374151; border-bottom:1px solid #e5e7eb;">Edited by</td></tr>',
              '<tr><td style="padding:10px 14px; color:#6b7280; width:140px;">Updated by</td><td style="padding:10px 14px; color:#111827;">' + escapeHtml(editorName) + '</td></tr>',
              '<tr><td style="padding:10px 14px; color:#6b7280;">Updated at</td><td style="padding:10px 14px; color:#111827;">' + escapeHtml(formatDt(updatedAtIso)) + '</td></tr>',
              '</table>',
              ...(punch.userNote
                ? ['<div style="margin-bottom:16px; padding:12px 14px; background:#f0f9ff; border-left:4px solid #0ea5e9; border-radius:4px;"><div style="font-size:12px; font-weight:600; color:#0369a1; margin-bottom:4px;">User note</div><div style="font-size:14px; color:#374151;">' + escapeHtml(punch.userNote) + '</div></div>']
                : []),
              ...(punch.managerNote
                ? ['<div style="margin-bottom:16px; padding:12px 14px; background:#fefce8; border-left:4px solid #eab308; border-radius:4px;"><div style="font-size:12px; font-weight:600; color:#a16207; margin-bottom:4px;">Manager note</div><div style="font-size:14px; color:#374151;">' + escapeHtml(punch.managerNote) + '</div></div>']
                : []),
              '</div>',
              '<div style="padding:12px 20px; background:#f9fafb; border-top:1px solid #e5e7eb; font-size:12px; color:#6b7280;">This is an automated notification from the Employee App.</div>',
              '</div>',
            ].join('');

            for (const r of configRecipients) {
              const email = r?.email?.trim();
              if (!email) continue;
              try {
                await emailService.sendEmail({ to: email, subject, html, text });
              } catch (emailErr) {
                console.error('Error sending punch-update email to', email, emailErr);
              }
            }
          }
        } catch (err) {
          console.error('Error notifying event manager(s):', err);
        }
      }
    } else {
      return NextResponse.json(
        { error: 'invalid-action', message: 'Invalid action' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message:
          action === 'clockOut'
            ? 'Clocked out successfully!'
            : 'Punch updated successfully!',
        data: updatedPunch,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Punch update error:', error);
    return NextResponse.json(
      { error: 'internal-error', message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Export with enhanced auth wrapper
export const POST = withEnhancedAuthAPI(createPunchHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});

export const PUT = withEnhancedAuthAPI(updatePunchHandler, {
  requireDatabaseUser: true,
  requireTenant: true,
});
