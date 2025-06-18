import type { Db } from 'mongodb';
import { ObjectId as ObjectIdFunction } from 'mongodb';
import {
  formatISO,
  startOfDay,
  endOfDay,
  parseISO,
  startOfWeek,
  endOfWeek,
} from 'date-fns';
import { convertToJSON } from '@/lib/utils/mongo-utils';
import { calculateDistance } from '@/lib/utils/location-utils';
import { Punch, PunchNoId } from '../types';
import type { GignologyJob, Shift } from '@/domains/job/types';
import type { ClockInCoordinates } from '@/domains/job/types/location.types';
import {
  giveJobGeoCoords,
  giveJobAllowedGeoDistance,
} from '@/domains/punch/utils/shift-job-utils';
import { UpdateFilter, Document } from 'mongodb';

export async function createPunchIn(db: Db, punch: PunchNoId): Promise<Punch> {
  try {
    const result = await db.collection('timecard').insertOne({ ...punch });
    if (!result.insertedId) {
      throw new Error('Punch not created');
    }
    // @ts-expect-error - insertedId is not null if successful
    punch._id = result.insertedId.toString();
  } catch (e) {
    console.log('Error creating punch', e);
  }
  return punch as unknown as Punch;
}

export async function deletePunchById(
  db: Db,
  punchId: string
): Promise<boolean> {
  try {
    const result = await db
      .collection('timecard')
      .deleteOne({ _id: new ObjectIdFunction(punchId) });
    return result.deletedCount === 1;
  } catch (e) {
    console.error('Error deleting punch:', e);
    return false;
  }
}

export async function getPunchStatus(
  db: Db,
  punchId: string
): Promise<Punch | null> {
  const objectId = new ObjectIdFunction(punchId);

  try {
    const result = await db.collection('timecard').findOne({ _id: objectId });

    if (!result) {
      return null;
    }

    return convertToJSON(result) as Punch;
  } catch (e) {
    console.error('Error getting punch status:', e);
    throw e;
  }
}

export async function createPunchOut(
  db: Db,
  punch: Punch
): Promise<Punch | null> {
  const now = new Date().toISOString();
  const updatedPunch = {
    timeOut: now,
    modifiedDate: now,
  };

  const punchID = new ObjectIdFunction(punch._id);

  try {
    const result = await db
      .collection('timecard')
      .findOneAndUpdate(
        { _id: punchID },
        { $set: updatedPunch },
        { returnDocument: 'after' }
      );

    if (!result) {
      return null;
    }

    return convertToJSON(result) as Punch;
  } catch (e) {
    console.error('Error creating punch out:', e);
    throw e;
  }
}

export async function updatePunch(db: Db, punch: Punch): Promise<Punch | null> {
  const updatedPunch = {
    ...punch,
    timeOut: punch.timeOut ? punch.timeOut : null,
    modifiedDate: new Date().toISOString(),
  };

  // Remove _id from the updated punch
  const { _id, ...punchData } = updatedPunch;
  const punchID = new ObjectIdFunction(_id);

  try {
    const result = await db
      .collection('timecard')
      .findOneAndUpdate(
        { _id: punchID },
        { $set: punchData },
        { returnDocument: 'after' }
      );

    if (!result) {
      return null;
    }

    return convertToJSON(result) as Punch;
  } catch (e) {
    console.error('Error updating punch:', e);
    throw e;
  }
}

export async function updatePunchUserCoordinates(
  db: Db,
  userId: string,
  applicantId: string,
  location: ClockInCoordinates | null
): Promise<Punch | null> {
  try {
    // Step 1: Find the active punch where timeOut is null
    const punch = await db.collection('timecard').findOne({
      userId: userId,
      applicantId: applicantId,
      timeOut: null, // Active punch (not clocked out)
    });

    // If no active punch is found, just return null (no update needed)
    if (!punch) {
      console.log('Active punch not found for this user');
      return null; // Normal scenario, no error
    }

    // Step 2: Retrieve the job details using the jobId from the punch
    const job = await db.collection('jobs').findOne({
      _id: new ObjectIdFunction(punch.jobId),
    });

    // If no job is found, return null (no update needed)
    if (!job) {
      console.log('Job not found for this punch');
      return null; // Normal scenario, no error
    }

    // Step 3: Check if autoClockOut or geofence is enabled
    if (
      !job.additionalConfig.autoClockoutShiftEnd &&
      !job.additionalConfig.geofence
    ) {
      console.log('Neither autoClockOut nor geofence are enabled for this job');
      return null; // No update needed
    }

    if (!location) {
      console.log('Invalid clockInCoordinates object');
      return null;
    }

    const parsedJob = convertToJSON(job) as GignologyJob;

    const jobsCoordinates = giveJobGeoCoords(parsedJob);

    if (jobsCoordinates?.lat === 0 || jobsCoordinates?.long === 0) {
      console.log('Missing required job coordinates');
      return null;
    }

    const currentDistance = calculateDistance(
      location.latitude,
      location.longitude,
      jobsCoordinates.lat,
      jobsCoordinates.long
    );

    if (
      !job.location?.graceDistanceFeet ||
      !job.location.geocoordinates?.geoFenceRadius
    ) {
      console.log('Missing required job coordinates');
      return null;
    }
    let isWithinGeofence = true;

    const allowedDistance = giveJobAllowedGeoDistance(parsedJob);
    if (currentDistance > allowedDistance) {
      console.log(
        'Unauthorized: Not within allowable distance of job location'
      );
      isWithinGeofence = false;
    }

    // Step 5: Push new coordinates to the punch's userCoordinates array
    const result = await db.collection('timecard').findOneAndUpdate(
      { _id: new ObjectIdFunction(punch._id) },
      {
        $push: {
          userCoordinates: { ...location, isWithinGeofence },
        },
        $set: {
          modifiedDate: new Date().toISOString(),
        },
      } as unknown as UpdateFilter<Document>,
      { returnDocument: 'after' }
    );

    // If the punch was not updated, return null
    if (!result) {
      console.log('Failed to update punch');
      return null;
    }

    return convertToJSON(result) as Punch;
  } catch (e) {
    console.error('Error updating punch:', e);
    throw e; // Only throw an error for actual unexpected issues
  }
}

export async function findOpenPunchByApplicantIdAndJobId(
  db: Db,
  applicantId: string,
  jobId: string
): Promise<Punch | undefined> {
  let punch: Punch | undefined = undefined;
  try {
    const punchDoc = await db.collection('timecard').findOne({
      applicantId: applicantId,
      jobId: jobId,
      timeOut: null,
      type: 'punch',
    });
    if (punchDoc) {
      const conversionResult = convertToJSON(punchDoc);
      if (conversionResult) punch = conversionResult as Punch;
      if (!conversionResult) {
        console.log('MongoDB conversion error');
      }
    }
    if (!punch) {
      console.log(
        'No Open Punches Found For Applicant:',
        applicantId,
        'and Job:',
        jobId
      );
    }
  } catch (e) {
    console.log('Error checking for open punch', e);
  }
  return punch;
}

export async function findOpenPunchByApplicantId(
  db: Db,
  applicantId: string
): Promise<Punch | undefined> {
  let punch: Punch | undefined = undefined;
  try {
    const punchDoc = await db.collection('timecard').findOne({
      applicantId: applicantId,
      timeOut: null,
      type: 'punch',
    });
    if (punchDoc) {
      const conversionResult = convertToJSON(punchDoc);
      if (conversionResult) punch = conversionResult as Punch;
      if (!conversionResult) {
        console.log('MongoDB conversion error');
      }
    }
    if (!punch) {
      console.log(
        'No open punches, for any job found For applicant:',
        applicantId
      );
    }
  } catch (e) {
    console.log('Error checking for open punch', e);
  }
  return punch;
}

export async function findAllOpenPunchesWithJobInfo(
  db: Db,
  userId: string,
  applicantId: string
): Promise<(Punch & { jobInfo: GignologyJob | null })[]> {
  try {
    // Step 1: Find all open punches for the user and applicant
    const punches = await db
      .collection('timecard')
      .find({
        userId,
        applicantId,
        timeOut: null,
        type: 'punch',
      })
      .toArray();

    // If no punches found, return an empty array
    if (punches.length === 0) {
      return [];
    }

    // Step 2: Extract all jobIds from the punches
    const jobIds = punches.map((punch) => new ObjectIdFunction(punch.jobId));

    // Step 3: Fetch the corresponding jobs from the jobs collection
    const jobs = await db
      .collection('jobs')
      .find({
        _id: { $in: jobIds },
      })
      .toArray();

    // Step 4: Create a map of jobId to jobInfo for easy lookup
    const jobsMap = jobs.reduce(
      (acc, job) => {
        const convertedJob = convertToJSON(job) as GignologyJob;
        acc[job._id.toString()] = convertedJob;
        return acc;
      },
      {} as { [key: string]: GignologyJob }
    );

    // Step 5: Attach jobInfo to each punch by matching jobId
    const punchesWithJobInfo = punches.map((punch) => ({
      ...(convertToJSON(punch) as Punch),
      _id: punch._id.toString(),
      jobId: punch.jobId.toString(),
      jobInfo: jobsMap[punch.jobId.toString()] || null,
    }));

    console.log(
      `Found ${punchesWithJobInfo.length} open punch(es) with job info for user:`,
      userId
    );

    return punchesWithJobInfo;
  } catch (e) {
    console.error('Error finding open punches with job info:', e);
    return [];
  }
}

export async function findOpenPunchesByJobIdsAndUserId(
  db: Db,
  jobIds: string[],
  userId: string,
  status: string | null
): Promise<Punch[]> {
  let punches: Punch[] = [];
  try {
    const query: {
      userId: string;
      jobId: { $in: string[] };
      timeOut: null;
      type: 'punch';
      status?: string;
    } = {
      userId: userId,
      jobId: { $in: jobIds },
      timeOut: null,
      type: 'punch',
    };

    if (status) {
      query.status = status;
    }

    const punchDocs = await db.collection('timecard').find(query).toArray();

    punches = punchDocs
      .map((punchDoc) => {
        const conversionResult = convertToJSON(punchDoc);
        return conversionResult as Punch;
      })
      .filter((punch): punch is Punch => punch !== null);
  } catch (e) {
    console.error('Error finding open punches:', e);
  }
  return punches;
}

export async function findOpenPunchesByDateRange(
  db: Db,
  userId: string,
  jobIds: string[],
  startDate: string,
  endDate: string,
  status: string | null
): Promise<Punch[]> {
  let punches: Punch[] = [];
  try {
    const query: {
      userId: string;
      type: 'punch';
      jobId: { $in: string[] };
      timeIn: {
        $ne: null;
        $gte: string;
        $lte: string;
      };
      timeOut: null;
      status?: string;
    } = {
      userId: userId,
      type: 'punch',
      jobId: { $in: jobIds },
      timeIn: {
        $ne: null,
        $gte: formatISO(new Date(startDate)),
        $lte: formatISO(new Date(endDate)),
      },
      timeOut: null,
    };

    if (status) {
      query.status = status;
    }

    const punchDocs = await db.collection('timecard').find(query).toArray();

    punches = punchDocs
      .map((punchDoc) => {
        const conversionResult = convertToJSON(punchDoc);
        return conversionResult as Punch;
      })
      .filter((punch): punch is Punch => punch !== null);
  } catch (e) {
    console.error('Error finding open punches:', e);
  }
  return punches;
}

export async function findAllPunchesByDateRange(
  db: Db,
  userId: string,
  jobIds: string[],
  startDate: string,
  endDate: string,
  status: string | null
): Promise<Punch[]> {
  try {
    const startDateTime = startOfDay(parseISO(startDate));
    const endDateTime = endOfDay(parseISO(endDate));

    console.log(
      `Querying punches for user ${userId} from ${formatISO(
        startDateTime
      )} to ${formatISO(endDateTime)}`
    );

    const query: {
      userId: string;
      type: 'punch';
      jobId: { $in: string[] };
      timeIn: {
        $ne: null;
        $gte: string;
        $lte: string;
      };
      status?: string;
    } = {
      userId: userId,
      type: 'punch',
      jobId: { $in: jobIds },
      timeIn: {
        $ne: null,
        $gte: formatISO(startDateTime),
        $lte: formatISO(endDateTime),
      },
    };

    if (status) {
      query.status = status;
    }

    const punchDocs = await db.collection('timecard').find(query).toArray();

    console.log(`Found ${punchDocs.length} punches for user ${userId}`);

    const jobDocs = await db
      .collection('jobs')
      .find({ _id: { $in: jobIds.map((id) => new ObjectIdFunction(id)) } })
      .toArray();

    const jobMap = new Map<string, GignologyJob>();
    jobDocs.forEach((jobDoc) => {
      const convertedJob = convertToJSON(jobDoc) as GignologyJob;
      jobMap.set(jobDoc._id.toString(), convertedJob);
    });

    const punches = punchDocs
      .map((punchDoc) => {
        const job = jobMap.get(punchDoc.jobId);
        if (!job) {
          return null; // Skip punches with no matching job
        }

        // Find the matching shift based on punch shiftSlug (if available)
        let shiftName = undefined;
        if (punchDoc.shiftSlug && job.shifts) {
          const matchingShift = job.shifts.find(
            (shift: Shift) => shift.slug === punchDoc.shiftSlug
          );
          shiftName = matchingShift?.shiftName;
        }

        const punchWithShiftName = {
          ...convertToJSON(punchDoc),
          shiftName,
        };

        return punchWithShiftName as Punch | null;
      })
      .filter((punch): punch is Punch => punch !== null);

    console.log(`Converted ${punches.length} valid punches`);

    return punches;
  } catch (e) {
    console.error('Error finding punches:', e);
    throw new Error(`Failed to fetch punches: ${(e as Error).message}`);
  }
}

export async function checkForOverlappingPunch(
  db: Db,
  applicantId: string,
  timeIn: string,
  timeOut: string | null,
  excludePunchId: string
): Promise<boolean> {
  try {
    console.log('🔍 === OVERLAP CHECK DEBUG START ===');
    console.log('Parameters:', {
      applicantId,
      timeIn,
      timeOut,
      excludePunchId,
    });

    // Convert to Date objects for easier comparison
    const newTimeIn = new Date(timeIn);
    const newTimeOut = timeOut ? new Date(timeOut) : null;

    console.log('Converted dates:', {
      newTimeIn: newTimeIn.toISOString(),
      newTimeOut: newTimeOut?.toISOString() || 'null (active punch)',
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: any = {
      applicantId,
      type: 'punch',
      _id: { $ne: new ObjectIdFunction(excludePunchId) },
    };

    // OPTIMIZATION: Only check punches that could potentially overlap
    if (newTimeOut) {
      // For completed punches, only check punches that start before our end time
      // and end after our start time (or are still active)
      query.$or = [
        // Punches that are still active (no timeOut)
        { timeOut: null },
        // Completed punches that could overlap
        {
          timeIn: { $lt: newTimeOut.toISOString() },
          timeOut: { $gt: newTimeIn.toISOString() },
        },
      ];
    } else {
      // For active punches (no timeOut), check all punches that start before our start time
      // and either have no end time or end after our start time
      query.$or = [
        // Other active punches
        { timeOut: null },
        // Completed punches that end after our start time
        { timeOut: { $gt: newTimeIn.toISOString() } },
      ];
    }

    console.log('MongoDB query:', JSON.stringify(query, null, 2));

    const existingPunches = await db
      .collection('timecard')
      .find(query)
      .toArray();

    console.log(
      `Found ${existingPunches.length} existing punches to check against`
    );

    if (existingPunches.length === 0) {
      console.log('✅ No existing punches found - no overlap possible');
      console.log('🔍 === OVERLAP CHECK DEBUG END ===');
      return false;
    }

    // Log all existing punches
    existingPunches.forEach((punch, index) => {
      console.log(`Existing punch ${index + 1}:`, {
        id: punch._id.toString(),
        timeIn: punch.timeIn,
        timeOut: punch.timeOut || 'null (active)',
        jobId: punch.jobId,
        shiftSlug: punch.shiftSlug,
      });
    });

    // Check each existing punch for overlap
    for (let i = 0; i < existingPunches.length; i++) {
      const existingPunch = existingPunches[i];
      console.log(`\n--- Checking existing punch ${i + 1} ---`);

      const existingTimeIn = new Date(existingPunch.timeIn);
      const existingTimeOut = existingPunch.timeOut
        ? new Date(existingPunch.timeOut)
        : null;

      console.log('Time comparison:', {
        newRange: `${newTimeIn.toISOString()} → ${
          newTimeOut?.toISOString() || 'ACTIVE'
        }`,
        existingRange: `${existingTimeIn.toISOString()} → ${
          existingTimeOut?.toISOString() || 'ACTIVE'
        }`,
      });

      // FIXED: Improved overlap detection logic

      // Case 1: Both punches are active (no timeOut)
      if (!newTimeOut && !existingTimeOut) {
        console.log('❌ OVERLAP FOUND: Both punches are active (no timeOut)');
        console.log('🔍 === OVERLAP CHECK DEBUG END ===');
        return true;
      }

      // Case 2: New punch is active, existing punch is completed
      if (!newTimeOut && existingTimeOut) {
        // Active punch overlaps if it starts before the existing punch ends
        if (newTimeIn < existingTimeOut) {
          console.log(
            '❌ OVERLAP FOUND: New active punch starts before existing punch ends'
          );
          console.log(
            `New starts: ${newTimeIn.toISOString()}, Existing ends: ${existingTimeOut.toISOString()}`
          );
          console.log('🔍 === OVERLAP CHECK DEBUG END ===');
          return true;
        }
        console.log(
          '✅ No overlap: New active punch starts after existing punch ends'
        );
        continue;
      }

      // Case 3: New punch is completed, existing punch is active
      if (newTimeOut && !existingTimeOut) {
        // Completed punch overlaps with active punch if active punch starts before completed punch ends
        if (existingTimeIn < newTimeOut) {
          console.log(
            '❌ OVERLAP FOUND: Existing active punch starts before new punch ends'
          );
          console.log(
            `Existing starts: ${existingTimeIn.toISOString()}, New ends: ${newTimeOut.toISOString()}`
          );
          console.log('🔍 === OVERLAP CHECK DEBUG END ===');
          return true;
        }
        console.log(
          '✅ No overlap: Existing active punch starts after new punch ends'
        );
        continue;
      }

      // Case 4: Both punches are completed
      if (newTimeOut && existingTimeOut) {
        console.log('Checking completed punch overlap...');

        // FIXED: Two time ranges overlap if they are not completely separate
        // Ranges are separate if: newEnd <= existingStart OR existingEnd <= newStart
        // Therefore, they overlap if: NOT (newEnd <= existingStart OR existingEnd <= newStart)
        // Which simplifies to: newEnd > existingStart AND existingEnd > newStart

        const condition1 = newTimeOut > existingTimeIn; // New punch ends after existing starts
        const condition2 = existingTimeOut > newTimeIn; // Existing punch ends after new starts
        const hasOverlap = condition1 && condition2;

        console.log('Overlap conditions:', {
          'newTimeOut > existingTimeIn': `${newTimeOut.toISOString()} > ${existingTimeIn.toISOString()} = ${condition1}`,
          'existingTimeOut > newTimeIn': `${existingTimeOut.toISOString()} > ${newTimeIn.toISOString()} = ${condition2}`,
          'hasOverlap (both true)': hasOverlap,
        });

        if (hasOverlap) {
          console.log('❌ OVERLAP FOUND: Time ranges overlap');

          // ADDITIONAL CHECK: Allow touching time ranges (one ends exactly when another starts)
          const exactTouch =
            newTimeOut.getTime() === existingTimeIn.getTime() ||
            existingTimeOut.getTime() === newTimeIn.getTime();

          if (exactTouch) {
            console.log(
              '✅ Actually OK: Punches only touch at endpoints (no actual overlap)'
            );
            continue;
          }

          console.log('🔍 === OVERLAP CHECK DEBUG END ===');
          return true;
        }
        console.log('✅ No overlap: Time ranges are separate');
      }
    }

    console.log('✅ FINAL RESULT: No overlaps found with any existing punches');
    console.log('🔍 === OVERLAP CHECK DEBUG END ===');
    return false;
  } catch (e) {
    console.error('❌ Error in overlap check:', e);
    console.log('🔍 === OVERLAP CHECK DEBUG END (ERROR) ===');
    return true; // Return true on error to be safe
  }
}

export async function checkForPreviousPunchesWithinShift(
  db: Db,
  userId: string,
  applicantId: string,
  jobId: string,
  shiftStart: string,
  shiftEnd: string
): Promise<boolean> {
  // Find punches that overlap with the shift
  const punches = await db
    .collection('timecard')
    .find({
      userId,
      applicantId,
      jobId,
      type: 'punch',
      $or: [
        { timeIn: { $gte: shiftStart, $lt: shiftEnd } },
        { timeOut: { $gte: shiftStart, $lt: shiftEnd } },
        { timeIn: { $lte: shiftStart }, timeOut: { $gte: shiftEnd } },
      ],
    })
    .toArray();

  return punches.length > 0;
}

export async function getTotalWorkedHoursForWeek(
  db: Db,
  userId: string,
  applicantId: string,
  jobId: string
) {
  // Get the current week's start (Monday) and end (Sunday)
  const now = new Date();
  const startOfWeekDate = startOfWeek(now, { weekStartsOn: 1 }); // Week starts on Monday
  const endOfWeekDate = endOfWeek(now, { weekStartsOn: 1 }); // End of week is Sunday

  const punches = await db
    .collection('timecard')
    .aggregate([
      {
        $match: {
          userId,
          applicantId,
          jobId,
          timeIn: {
            $gte: startOfWeekDate.toISOString(),
            $lte: endOfWeekDate.toISOString(),
          },
          timeOut: { $ne: null },
        },
      },
      {
        $addFields: {
          timeInDate: {
            $dateFromString: { dateString: '$timeIn' }, // Ensure timeIn is treated as Date
          },
          timeOutDate: {
            $dateFromString: { dateString: '$timeOut' }, // Ensure timeOut is treated as Date
          },
        },
      },
      {
        $project: {
          timeIn: 1,
          timeOut: 1,
          duration: {
            $subtract: ['$timeOutDate', '$timeInDate'], // Calculate duration
          },
        },
      },
    ])
    .toArray();

  const convertedPunches = punches.map(
    (punch) => convertToJSON(punch) as Punch
  );

  // Convert duration to hours
  const totalHoursWorked = convertedPunches.reduce(
    (total: number, punch: Punch) => {
      return total + (punch.duration || 0) / (1000 * 60 * 60);
    },
    0
  );

  return totalHoursWorked;
}

export async function getTimezone(db: Db, venueSlug: string): Promise<string> {
  const event = await db
    .collection('events')
    .findOne({ venueSlug }, { projection: { timeZone: 1 } });

  return event ? event.timeZone : 'America/Chicago';
}
