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
import { ObjectId as ObjectIdFunction, ObjectId } from 'mongodb';
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
import { convertToJSON } from '@/lib/utils/mongo-utils';

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

    // Log clock in activity
    try {
      const { logActivity, createActivityLogData } = await import('@/lib/services/activity-logger');
      const agentName = user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Employee';
      
      await logActivity(
        db,
        createActivityLogData(
          'Event Clock In',
          `${agentName} clocked in at ${new Date(timeIn).toISOString()} for job ${jobId}`,
          {
            applicantId: applicantId || user.applicantId,
            userId: user._id || userId,
            agent: agentName,
            email: user.email || '',
            jobId: jobId,
            details: {
              rosterRecord: {
                timeIn: timeIn,
                platform: 'Mobile',
                clockInCoordinates: usersCurrentCoordinates,
                shiftSlug: selectedShift.slug,
                shiftName: selectedShift.shiftName,
              },
            },
          }
        )
      );
    } catch (error) {
      // Don't fail clock in if logging fails
      console.error('Error logging clock in activity:', error);
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

      // Log clock out activity
      try {
        const { logActivity, createActivityLogData } = await import('@/lib/services/activity-logger');
        const agentName = user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Employee';
        const timeOut = punch.timeOut || new Date().toISOString();
        
        await logActivity(
          db,
          createActivityLogData(
            'Event Clock Out',
            `${agentName} clocked out at ${new Date(timeOut).toISOString()} for job ${punch.jobId}`,
            {
              applicantId: user.applicantId || punch.applicantId,
              userId: user._id || punch.userId,
              agent: agentName,
              email: user.email || '',
              jobId: punch.jobId,
              details: {
                rosterRecord: {
                  timeIn: punch.timeIn,
                  timeOut: timeOut,
                  platform: 'Mobile',
                  clockOutCoordinates: punch.clockOutCoordinates || null,
                  shiftSlug: punch.shiftSlug,
                },
              },
            }
          )
        );
      } catch (error) {
        // Don't fail clock out if logging fails
        console.error('Error logging clock out activity:', error);
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

      const updateData: Punch = {
        ...punch,
        modifiedDate: new Date().toISOString(),
        modifiedBy: user._id,
      };

      updatedPunch = await updatePunch(db, updateData);

      if (!updatedPunch) {
        return NextResponse.json(
          { error: 'update-failed', message: 'Error updating punch' },
          { status: 500 }
        );
      }

      // Send notification to venue manager if managerNote was added/updated
      if (managerNoteAdded && punch.managerNote) {
        try {
          // Fetch job to get venueSlug
          const job = await findJobByjobId(db, punch.jobId);
          
          if (job && job.venueSlug) {
            // Fetch venue to get manager info
            const venue = await db.collection('venues').findOne(
              { slug: job.venueSlug },
              { projection: { venueContact1: 1, venueContact2: 1 } }
            );

            if (venue?.venueContact1?.email) {
              const managerEmail = venue.venueContact1.email;
              
              // Find user/applicant by email to get userId and applicantId
              const managerUser = await db.collection('users').findOne(
                { emailAddress: managerEmail }
              );

              if (managerUser) {
                const managerApplicant = managerUser.applicantId
                  ? await db.collection('applicants').findOne({
                      _id: new ObjectIdFunction(managerUser.applicantId),
                    })
                  : null;

                // Get employee/applicant info for the punch
                const employeeApplicant = await db.collection('applicants').findOne({
                  _id: new ObjectIdFunction(punch.applicantId),
                });

                const employeeName = employeeApplicant
                  ? `${employeeApplicant.firstName || ''} ${employeeApplicant.lastName || ''}`.trim()
                  : 'Employee';

                // Create notification
                const notificationBody = `A manager note has been added to a punch for ${employeeName}.\n\nJob: ${job.title || 'N/A'}\nNote: ${punch.managerNote}`;

                await createNotification(db, {
                  fromUserId: user._id || '',
                  fromFirstName: user.firstName || user.name?.split(' ')[0] || 'Client',
                  fromLastName: user.lastName || user.name?.split(' ').slice(1).join(' ') || 'User',
                  recipient: {
                    userId: managerUser._id?.toString() || '',
                    applicantId: managerUser.applicantId?.toString() || managerApplicant?._id?.toString() || '',
                    firstName: venue.venueContact1.firstName || '',
                    lastName: venue.venueContact1.lastName || '',
                  },
                  msgType: 'system',
                  subject: 'Manager Note Added to Punch',
                  msgTemplate: 'system',
                  body: notificationBody,
                  profileImg: '',
                  status: 'active',
                  type: 'info',
                });
              }
            }
          }
        } catch (notificationError) {
          // Don't fail punch update if notification fails
          console.error('Error sending notification to venue manager:', notificationError);
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
