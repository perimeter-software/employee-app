import { Db } from 'mongodb';
import { PayrollBatch } from '../types';

/**
 * Check if a timecard is in a processed payroll batch
 * Processed statuses are: 'Submitted', 'Approved', 'Paid'
 */
export async function checkTimecardInProcessedBatch(
  db: Db,
  timecardId: string
): Promise<{
  isInProcessedBatch: boolean;
  batch?: PayrollBatch;
}> {
  try {
    // Check if the timecard exists in any payroll batch with processed status
    const payrollBatch = await db.collection('payroll-batches').findOne({
      $or: [
        { 'submittedJobTimecards._id': timecardId },
        { 'batchDataEdits.timecardId': timecardId },
      ],
      status: { $in: ['Submitted', 'Approved', 'Paid'] }, // Processed statuses that should prevent editing
    });

    if (!payrollBatch) {
      return {
        isInProcessedBatch: false,
      };
    }

    // Convert the MongoDB document to our PayrollBatch type
    const batch: PayrollBatch = {
      _id: payrollBatch._id.toString(),
      jobSlug: payrollBatch.jobSlug,
      startDate: payrollBatch.startDate,
      endDate: payrollBatch.endDate,
      status: payrollBatch.status,
      createdDate: payrollBatch.createdDate,
      modifiedDate: payrollBatch.modifiedDate,
      batchDataEdits: payrollBatch.batchDataEdits || [],
      submittedEventApplicants: payrollBatch.submittedEventApplicants || [],
      submittedJobTimecards: payrollBatch.submittedJobTimecards || [],
    };

    return {
      isInProcessedBatch: true,
      batch,
    };
  } catch (error) {
    console.error('Error checking timecard in processed batch:', error);
    // In case of error, err on the side of caution and don't allow editing
    return {
      isInProcessedBatch: true,
    };
  }
}

/**
 * Get all payroll batches for a specific job and date range
 */
export async function getPayrollBatches(
  db: Db,
  filters: {
    jobSlug?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
    timecardId?: string;
  } = {}
): Promise<PayrollBatch[]> {
  try {
    const query: Record<string, unknown> = {};

    if (filters.jobSlug) {
      query.jobSlug = filters.jobSlug;
    }

    if (filters.startDate && filters.endDate) {
      query.$or = [
        {
          startDate: { $gte: filters.startDate, $lte: filters.endDate },
        },
        {
          endDate: { $gte: filters.startDate, $lte: filters.endDate },
        },
        {
          $and: [
            { startDate: { $lte: filters.startDate } },
            { endDate: { $gte: filters.endDate } },
          ],
        },
      ];
    }

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.timecardId) {
      query.$or = [
        { 'submittedJobTimecards._id': filters.timecardId },
        { 'batchDataEdits.timecardId': filters.timecardId },
      ];
    }

    const batches = await db
      .collection('payroll-batches')
      .find(query)
      .toArray();

    return batches.map((batch) => ({
      _id: batch._id.toString(),
      jobSlug: batch.jobSlug,
      startDate: batch.startDate,
      endDate: batch.endDate,
      status: batch.status,
      createdDate: batch.createdDate,
      modifiedDate: batch.modifiedDate,
      batchDataEdits: batch.batchDataEdits || [],
      submittedEventApplicants: batch.submittedEventApplicants || [],
      submittedJobTimecards: batch.submittedJobTimecards || [],
    }));
  } catch (error) {
    console.error('Error getting payroll batches:', error);
    return [];
  }
}
