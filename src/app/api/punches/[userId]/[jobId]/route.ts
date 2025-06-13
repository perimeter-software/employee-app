import { NextResponse } from "next/server";
import { withEnhancedAuthAPI } from "@/lib/middleware";
import { mongoConn } from "@/lib/db";
import type { AuthenticatedRequest } from "@/domains/user/types";
import {
  findOpenPunchByApplicantIdAndJobId,
  createPunchIn,
  createPunchOut,
  updatePunch,
  checkForOverlappingPunch,
  checkForPreviousPunchesWithinShift,
  getTotalWorkedHoursForWeek,
  Punch,
  PunchNoId,
} from "@/domains/punch";
import { parseClockInCoordinates } from "@/lib/utils";
import { ClockInCoordinates, Shift } from "@/domains/job";
import { findJobByjobId, getUserType } from "@/domains/user/utils";
import {
  giveJobAllowedGeoDistance,
  giveJobGeoCoords,
  isJobGeoFenced,
  jobHasShiftForUser,
} from "@/domains/punch/utils/shift-job-utils";

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
  coordinates: ClockInCoordinates,
  timeIn: string,
  selectedShift: Shift
): PunchNoId {
  const now = new Date().toISOString();

  return {
    type: "punch",
    userId,
    applicantId,
    jobId,
    timeIn,
    timeOut: null,
    userNote: userNote || null,
    managerNote: null,
    approvingManager: null,
    status: "Pending",
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
    const params = context?.params as
      | { userId: string; jobId: string }
      | undefined;
    const userId = params?.userId;
    const jobId = params?.jobId;

    if (!jobId || !userId) {
      return NextResponse.json(
        { error: "missing-required-info", message: "Missing required info!" },
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
    } = await request.json();

    const applicantId = user.applicantId;

    // Connect to database
    const { db } = await mongoConn();

    const openPunch = (await findOpenPunchByApplicantIdAndJobId(
      db,
      applicantId || "",
      jobId
    )) as Punch;

    const totalHoursWorked = await getTotalWorkedHoursForWeek(
      db,
      userId,
      applicantId || "",
      jobId
    );

    if (openPunch) {
      return NextResponse.json(
        {
          error: "open-punch-exists",
          message: "Unauthorized: Open punch exists",
          openPunch: JSON.stringify(openPunch),
        },
        { status: 403 }
      );
    }

    // We want the backend to be the source of truth for logic enforcement so get from db
    const job = await findJobByjobId(db, jobId);
    if (!job) {
      return NextResponse.json(
        { error: "job-not-found", message: "Job not found" },
        { status: 400 }
      );
    }

    if (!jobHasShiftForUser(job, applicantId || "")) {
      return NextResponse.json(
        { error: "no-shifts", message: "No shifts to clock in for!" },
        { status: 404 }
      );
    }

    // Initiate usersCurrentCoordinates
    let usersCurrentCoordinates = {
      latitude: 0,
      longitude: 0,
      accuracy: 0,
    } as ClockInCoordinates;

    const type = await getUserType(db, user._id || "");

    // Admin and Master user role can always clockin regardless if geofenced or not
    if (isJobGeoFenced(job) && type === "User") {
      const coordinateResults = parseClockInCoordinates(clockInCoordinates);

      if (!coordinateResults) {
        return NextResponse.json(
          {
            error: "invalid-coordinates",
            message: "Invalid clockInCoordinates object",
          },
          { status: 400 }
        );
      }

      usersCurrentCoordinates = { ...coordinateResults };
      const jobsCoordinates = giveJobGeoCoords(job);

      if (jobsCoordinates?.lat === 0 || jobsCoordinates?.long === 0) {
        return NextResponse.json(
          {
            error: "missing-job-coordinates",
            message: "Missing required job coordinates",
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
            error: "missing-job-coordinates",
            message: "Missing required job coordinates",
          },
          { status: 404 }
        );
      }

      const allowedDistance = giveJobAllowedGeoDistance(job);
      if (currentDistance > allowedDistance) {
        return NextResponse.json(
          {
            error: "outside-geofence",
            message:
              "Unauthorized: Not within allowable distance of job location",
          },
          { status: 400 }
        );
      }
    }

    // Check if breaks are not allowed and there are previous punches for today
    if (!newStartDate || !newEndDate) {
      return NextResponse.json(
        { error: "no-valid-shift", message: "No valid shift for today!" },
        { status: 400 }
      );
    }

    const hasPreviousPunches = await checkForPreviousPunchesWithinShift(
      db,
      userId,
      applicantId || "",
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
          error: "breaks-not-allowed",
          message:
            "You cannot clock in again during this shift because breaks are not allowed.",
        },
        { status: 403 }
      );
    }

    // Check for overtime and allowOvertime setting
    const allowOvertime = job.additionalConfig?.allowOvertime ?? true;

    if (!allowOvertime && totalHoursWorked > 40) {
      return NextResponse.json(
        {
          error: "overtime-not-allowed",
          message:
            "You cannot clock in again because you've exceeded 40 hours and overtime is not allowed.",
        },
        { status: 400 }
      );
    }

    const newPunch: PunchNoId = createNewPunch(
      userId,
      applicantId || "",
      jobId,
      userNote,
      clockInCoordinates,
      timeIn,
      selectedShift
    );

    const punch = await createPunchIn(db, newPunch);
    if (!punch) {
      return NextResponse.json(
        { error: "clock-in-failed", message: "Error clocking in" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Clocked in successfully!",
        data: {
          punch,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Clock in error:", error);
    return NextResponse.json(
      { error: "internal-error", message: "Internal server error" },
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
        { error: "missing-punch", message: "Missing punch" },
        { status: 400 }
      );
    }

    // Connect to database
    const { db } = await mongoConn();

    let updatedPunch;

    if (action === "clockOut") {
      updatedPunch = await createPunchOut(db, punch);
      if (!updatedPunch) {
        return NextResponse.json(
          { error: "clock-out-failed", message: "Error clocking out" },
          { status: 500 }
        );
      }
    } else if (action === "update") {
      const overlap = await checkForOverlappingPunch(
        db,
        user.applicantId || "",
        punch.timeIn,
        punch.timeOut ?? null,
        punch._id
      );

      if (overlap) {
        return NextResponse.json(
          {
            error: "punch-overlap",
            message: "Making this change would create a punch overlap!",
          },
          { status: 400 }
        );
      }

      const updateData: Punch = {
        ...punch,
        modifiedDate: new Date().toISOString(),
        modifiedBy: user._id,
      };

      updatedPunch = await updatePunch(db, updateData);
      if (!updatedPunch) {
        return NextResponse.json(
          { error: "update-failed", message: "Error updating punch" },
          { status: 500 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "invalid-action", message: "Invalid action" },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message:
          action === "clockOut"
            ? "Clocked out successfully!"
            : "Punch updated successfully!",
        data: updatedPunch,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Punch update error:", error);
    return NextResponse.json(
      { error: "internal-error", message: "Internal server error" },
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
