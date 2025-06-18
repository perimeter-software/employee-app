/* eslint-disable @typescript-eslint/no-explicit-any */
import { convertToJSON } from '@/lib/utils/mongo-utils';
import {
  ObjectId,
  type Db,
  type UpdateResult,
  type InsertOneResult,
} from 'mongodb';
import { Timesheet } from '../types';

export async function findTimecardsByUserId(
  db: Db,
  userId: string
): Promise<Timesheet[]> {
  let timecard: Timesheet[] = [];

  try {
    const timesheetDocs = await db
      .collection('timecard')
      .aggregate([
        {
          $match: {
            userId: userId,
            status: { $ne: 'Cancelled' },
          },
        },
        {
          $sort: { timeIn: -1 },
        },
      ])
      .toArray();

    timecard = timesheetDocs.reduce((acc: Timesheet[], timesheetDoc) => {
      const conversionResult = convertToJSON(timesheetDoc);
      if (conversionResult) {
        acc.push(conversionResult as Timesheet);
      }
      return acc;
    }, []);
  } catch (e) {
    console.error('Error finding timecard:', e);
  }

  return timecard;
}

export async function findTimesheetById(
  db: Db,
  timesheetId: string
): Promise<Timesheet | null> {
  try {
    const timesheetDoc = await db.collection('timecard').findOne({
      _id: new ObjectId(timesheetId),
      status: { $ne: 'Cancelled' },
    });

    if (!timesheetDoc) {
      return null;
    }

    const timesheet = convertToJSON(timesheetDoc) as Timesheet;
    return timesheet;
  } catch (error) {
    console.error('Error finding timesheet by ID:', error);
    return null;
  }
}

export async function createTimesheet(
  db: Db,
  timesheetData: Omit<
    Timesheet,
    '_id' | 'createdAt' | 'updatedAt' | 'modifiedDate' | 'modifiedBy'
  >
): Promise<InsertOneResult<Timesheet>> {
  if (!timesheetData) {
    throw new Error('Invalid timesheet data');
  }

  const Timecards = db.collection('timecard');

  try {
    const now = new Date();
    const newTimesheet = {
      ...timesheetData,
      createdAt: now,
      updatedAt: now,
      modifiedDate: now,
      modifiedBy: timesheetData.userId,
      status: timesheetData.status || ('Pending' as const),
    };

    const result: InsertOneResult<Timesheet> =
      await Timecards.insertOne(newTimesheet);
    return result;
  } catch (error) {
    console.error('Error creating timesheet:', error);
    throw error;
  }
}

export async function updateTimesheet(
  db: Db,
  id: string,
  body: Partial<Timesheet>,
  modifiedBy: string
): Promise<UpdateResult<Timesheet>> {
  if (!id) {
    throw new Error('Invalid Id or Id not found');
  }

  if (!body) {
    throw new Error('Invalid body to update request');
  }

  if (body._id) {
    delete body._id;
  }

  if (body.createdAt) {
    delete body.createdAt;
  }

  // Add modification tracking
  body.modifiedDate = new Date();
  body.modifiedBy = modifiedBy;
  body.updatedAt = new Date();

  const Timecards = db.collection('timecard');

  try {
    const result: UpdateResult<Timesheet> = await Timecards.updateOne(
      {
        _id: new ObjectId(id),
        status: { $ne: 'Cancelled' },
      },
      { $set: body },
      { upsert: false }
    );

    return result;
  } catch (error) {
    console.error('Error updating timesheet:', error);
    throw error;
  }
}

export async function clockIn(
  db: Db,
  clockData: {
    type: string;
    userId: string;
    applicantId: string;
    jobId: string;
    shiftSlug: string;
    clockInCoordinates?: any;
    userNote?: string;
  }
): Promise<InsertOneResult<Timesheet>> {
  if (!clockData) {
    throw new Error('Invalid clock data');
  }

  const Timecards = db.collection('timecard');

  try {
    const now = new Date();
    const newTimesheet = {
      type: clockData.type,
      userId: clockData.userId,
      applicantId: clockData.applicantId,
      jobId: clockData.jobId,
      timeIn: now,
      timeOut: null,
      userNote: clockData.userNote || null,
      managerNote: null,
      approvingManager: null,
      status: 'Pending',
      modifiedDate: now,
      modifiedBy: clockData.userId,
      clockInCoordinates: clockData.clockInCoordinates || null,
      leaveRequest: null,
      paidHours: null,
      shiftSlug: clockData.shiftSlug,
      createdAt: now,
      updatedAt: now,
    };

    const result: InsertOneResult<Timesheet> =
      await Timecards.insertOne(newTimesheet);
    return result;
  } catch (error) {
    console.error('Error clocking in:', error);
    throw error;
  }
}

export async function clockOut(
  db: Db,
  timesheetId: string,
  userId: string,
  clockOutData?: {
    clockOutCoordinates?: any;
    userNote?: string;
  }
): Promise<UpdateResult<Timesheet>> {
  if (!timesheetId) {
    throw new Error('Invalid timesheet ID');
  }

  if (!userId) {
    throw new Error('Invalid user ID');
  }

  const Timecards = db.collection('timecard');

  try {
    const now = new Date();
    const updateData: any = {
      timeOut: now,
      modifiedDate: now,
      modifiedBy: userId,
      updatedAt: now,
    };

    if (clockOutData?.clockOutCoordinates) {
      updateData.clockOutCoordinates = clockOutData.clockOutCoordinates;
    }

    if (clockOutData?.userNote) {
      updateData.userNote = clockOutData.userNote;
    }

    const result: UpdateResult<Timesheet> = await Timecards.updateOne(
      {
        _id: new ObjectId(timesheetId),
        userId: userId, // Ensure user owns the timesheet
        timeOut: null, // Only update if not already clocked out
        status: { $ne: 'Cancelled' },
      },
      { $set: updateData },
      { upsert: false }
    );

    return result;
  } catch (error) {
    console.error('Error clocking out:', error);
    throw error;
  }
}

export async function approveTimesheet(
  db: Db,
  timesheetId: string,
  approvingManager: string,
  approvalData: {
    status: 'Approved' | 'Rejected';
    managerNote?: string;
    paidHours?: number;
  }
): Promise<UpdateResult<Timesheet>> {
  if (!timesheetId) {
    throw new Error('Invalid timesheet ID');
  }

  if (!approvingManager) {
    throw new Error('Invalid approving manager ID');
  }

  const Timecards = db.collection('timecard');

  try {
    const now = new Date();
    const updateData = {
      status: approvalData.status,
      approvingManager: approvingManager,
      modifiedDate: now,
      modifiedBy: approvingManager,
      updatedAt: now,
      ...(approvalData.managerNote && {
        managerNote: approvalData.managerNote,
      }),
      ...(approvalData.paidHours && { paidHours: approvalData.paidHours }),
    };

    const result: UpdateResult<Timesheet> = await Timecards.updateOne(
      {
        _id: new ObjectId(timesheetId),
        status: 'Pending',
      },
      { $set: updateData },
      { upsert: false }
    );

    return result;
  } catch (error) {
    console.error('Error approving timesheet:', error);
    throw error;
  }
}

export async function findTimecardsByDateRange(
  db: Db,
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<Timesheet[]> {
  let timecard: Timesheet[] = [];

  try {
    const timesheetDocs = await db
      .collection('timecard')
      .aggregate([
        {
          $match: {
            userId: userId,
            timeIn: {
              $gte: startDate,
              $lte: endDate,
            },
            status: { $ne: 'Cancelled' },
          },
        },
        {
          $sort: { timeIn: -1 },
        },
      ])
      .toArray();

    timecard = timesheetDocs.reduce((acc: Timesheet[], timesheetDoc) => {
      const conversionResult = convertToJSON(timesheetDoc);
      if (conversionResult) {
        acc.push(conversionResult as Timesheet);
      }
      return acc;
    }, []);
  } catch (e) {
    console.error('Error finding timecard by date range:', e);
  }

  return timecard;
}

export async function findTimecardsByType(
  db: Db,
  userId: string,
  type: string
): Promise<Timesheet[]> {
  let timecard: Timesheet[] = [];

  try {
    const timesheetDocs = await db
      .collection('timecard')
      .aggregate([
        {
          $match: {
            userId: userId,
            type: type,
            status: { $ne: 'Cancelled' },
          },
        },
        {
          $sort: { timeIn: -1 },
        },
      ])
      .toArray();

    timecard = timesheetDocs.reduce((acc: Timesheet[], timesheetDoc) => {
      const conversionResult = convertToJSON(timesheetDoc);
      if (conversionResult) {
        acc.push(conversionResult as Timesheet);
      }
      return acc;
    }, []);
  } catch (e) {
    console.error('Error finding timecard by type:', e);
  }

  return timecard;
}

export async function findPendingApprovals(
  db: Db,
  managerId: string
): Promise<Timesheet[]> {
  let timecard: Timesheet[] = [];

  console.log('managerId: ', managerId);

  try {
    const timesheetDocs = await db
      .collection('timecard')
      .aggregate([
        {
          $match: {
            status: 'Pending',
            // Add logic here to match timecard that this manager can approve
            // This might involve joining with jobs or other collections
          },
        },
        {
          $sort: { timeIn: -1 },
        },
      ])
      .toArray();

    timecard = timesheetDocs.reduce((acc: Timesheet[], timesheetDoc) => {
      const conversionResult = convertToJSON(timesheetDoc);
      if (conversionResult) {
        acc.push(conversionResult as Timesheet);
      }
      return acc;
    }, []);
  } catch (e) {
    console.error('Error finding pending approvals:', e);
  }

  return timecard;
}

export async function bulkApproveTimecards(
  db: Db,
  timesheetIds: string[],
  approvingManager: string,
  approvalData: {
    status: 'Approved' | 'Rejected';
    managerNote?: string;
  }
): Promise<UpdateResult<Timesheet[]>> {
  if (!timesheetIds || timesheetIds.length === 0) {
    throw new Error('Invalid timesheet IDs');
  }

  if (!approvingManager) {
    throw new Error('Invalid approving manager ID');
  }

  const Timecards = db.collection('timecard');

  try {
    const objectIds = timesheetIds.map((id) => new ObjectId(id));
    const now = new Date();

    const updateData = {
      status: approvalData.status,
      approvingManager: approvingManager,
      modifiedDate: now,
      modifiedBy: approvingManager,
      updatedAt: now,
      ...(approvalData.managerNote && {
        managerNote: approvalData.managerNote,
      }),
    };

    const result: UpdateResult<Timesheet[]> = await Timecards.updateMany(
      {
        _id: { $in: objectIds },
        status: 'Pending',
      },
      { $set: updateData },
      { upsert: false }
    );

    return result;
  } catch (error) {
    console.error('Error bulk approving timecard:', error);
    throw error;
  }
}

export async function cancelTimesheet(
  db: Db,
  timesheetId: string,
  userId: string
): Promise<UpdateResult<Timesheet>> {
  if (!timesheetId) {
    throw new Error('Invalid timesheet ID');
  }

  if (!userId) {
    throw new Error('Invalid user ID');
  }

  const Timecards = db.collection('timecard');

  try {
    const result: UpdateResult<Timesheet> = await Timecards.updateOne(
      {
        _id: new ObjectId(timesheetId),
        userId: userId, // Ensure user owns the timesheet
        status: { $in: ['Pending', 'In Progress'] },
      },
      {
        $set: {
          status: 'Cancelled',
          modifiedDate: new Date(),
          modifiedBy: userId,
          updatedAt: new Date(),
        },
      },
      { upsert: false }
    );

    return result;
  } catch (error) {
    console.error('Error cancelling timesheet:', error);
    throw error;
  }
}
