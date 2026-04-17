import { Db } from 'mongodb';
import {
  EmployeePayrollBatch,
  PayrollBatch,
  PayrollVoucher,
  SubmittedEventApplicant,
  SubmittedJobTimecard,
  TaxDetails,
} from '../types';

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

/**
 * Helper to sum a tax field across an array of items
 */
function sumTaxField(
  items: (SubmittedEventApplicant | SubmittedJobTimecard)[],
  field: keyof TaxDetails
): number {
  return items.reduce((sum, item) => {
    const val = item.taxDetails?.[field];
    return sum + (typeof val === 'number' ? val : 0);
  }, 0);
}

/**
 * Get payroll history for a specific employee, enriched with billing vouchers.
 * Fetches all payroll-batches with payrollStatus === 'Submitted' that contain
 * the given applicantId, then cross-references prism-billing-vouchers.
 */
export async function getEmployeePayrollHistory(
  db: Db,
  applicantId: string,
  employeeID?: string
): Promise<EmployeePayrollBatch[]> {
  try {
    const rawBatches = await db
      .collection('payroll-batches')
      .find({
        payrollStatus: 'Submitted',
        $or: [
          { 'submittedEventApplicants.applicantId': applicantId },
          { 'submittedJobTimecards.applicantId': applicantId },
        ],
      })
      .sort({ startDate: -1 })
      .toArray();

    // ── Batch-lookup event and job names/venues ───────────────────────────────
    const eventUrls = [
      ...new Set(rawBatches.map((b) => b.eventUrl).filter(Boolean)),
    ];
    const jobSlugs = [
      ...new Set(rawBatches.map((b) => b.jobSlug).filter(Boolean)),
    ];

    const [eventDocs, jobDocs] = await Promise.all([
      eventUrls.length
        ? db
            .collection('events')
            .find(
              { eventUrl: { $in: eventUrls } },
              { projection: { eventUrl: 1, eventName: 1, venueName: 1 } }
            )
            .toArray()
        : Promise.resolve([]),
      jobSlugs.length
        ? db
            .collection('jobs')
            .find(
              { jobSlug: { $in: jobSlugs } },
              { projection: { jobSlug: 1, title: 1, venueName: 1 } }
            )
            .toArray()
        : Promise.resolve([]),
    ]);

    const eventMap = new Map<
      string,
      { eventName?: string; venueName?: string }
    >(
      eventDocs.map((e) => [
        e.eventUrl,
        { eventName: e.eventName, venueName: e.venueName },
      ])
    );
    const jobMap = new Map<string, { jobTitle?: string; venueName?: string }>(
      jobDocs.map((j) => [
        j.jobSlug,
        { jobTitle: j.title, venueName: j.venueName },
      ])
    );
    // ─────────────────────────────────────────────────────────────────────────

    const results: EmployeePayrollBatch[] = [];

    for (const batch of rawBatches) {
      const isEvent = !!batch.eventUrl;

      // Extract this employee's items from whichever array applies
      const rawEventItems: SubmittedEventApplicant[] = (
        (batch.submittedEventApplicants as SubmittedEventApplicant[]) || []
      ).filter((item) => item.applicantId === applicantId);

      const rawJobItems: SubmittedJobTimecard[] = (
        (batch.submittedJobTimecards as SubmittedJobTimecard[]) || []
      ).filter((item) => item.applicantId === applicantId);

      const allItems: (SubmittedEventApplicant | SubmittedJobTimecard)[] = [
        ...rawEventItems,
        ...rawJobItems,
      ];

      if (allItems.length === 0) continue;

      const regularItems = allItems.filter((item) => item.earningId === 'REG');
      const overtimeItems = allItems.filter((item) => item.earningId === 'OT');
      const extraItems = allItems.filter(
        (item) => item.earningId !== 'REG' && item.earningId !== 'OT'
      );

      const totalRegularHours = regularItems.reduce(
        (s, i) => s + (i.totalHours ?? 0),
        0
      );
      const totalOvertimeHours = overtimeItems.reduce(
        (s, i) => s + (i.totalHours ?? 0),
        0
      );
      const totalGrossRegularPay = sumTaxField(regularItems, 'totalPay');
      const totalGrossOvertimePay = sumTaxField(overtimeItems, 'totalPay');
      const totalExtraEarnings = sumTaxField(extraItems, 'totalPay');
      const totalGrossPay =
        totalGrossRegularPay + totalGrossOvertimePay + totalExtraEarnings;

      const totalFicaSS = sumTaxField(allItems, 'ficaSS');
      const totalFicaMED = sumTaxField(allItems, 'ficaMED');
      const totalFederalTax = sumTaxField(allItems, 'federalTax');
      const totalStateTax = sumTaxField(allItems, 'stateTax');
      const totalTaxes =
        totalFicaSS + totalFicaMED + totalFederalTax + totalStateTax;
      const totalNetPay = sumTaxField(allItems, 'checkNet');

      // Fetch payroll voucher (employee deductions + taxes)
      let payrollVoucher: PayrollVoucher | undefined;
      const batchNumber = batch.lastCreatedPEOBatch?.batchNumber;
      if (batchNumber && employeeID) {
        try {
          const payrollDoc = await db
            .collection('prism-payroll-vouchers')
            .findOne(
              { batchId: String(batchNumber), employeeId: employeeID },
              {
                projection: {
                  batchId: 1,
                  employeeId: 1,
                  voucherId: 1,
                  payDate: 1,
                  deduction: 1,
                  employeeTax: 1,
                },
              }
            );

          if (payrollDoc) {
            const deductions = (payrollDoc.deduction || []).map(
              (item: {
                deductCode: string;
                deductDescription: string;
                deductAmount: number;
              }) => ({
                code: item.deductCode,
                description: item.deductDescription,
                amount: item.deductAmount,
              })
            );
            const taxes = (payrollDoc.employeeTax || []).map(
              (item: {
                empTaxDeductCode: string;
                empTaxDeductCodeDesc: string;
                empTaxAmount: number;
              }) => ({
                code: item.empTaxDeductCode,
                description: item.empTaxDeductCodeDesc,
                amount: item.empTaxAmount,
              })
            );
            payrollVoucher = {
              _id: payrollDoc._id?.toString(),
              employeeId: payrollDoc.employeeId,
              batchNumber: payrollDoc.batchId,
              voucherId: payrollDoc.voucherId,
              payDate: payrollDoc.payDate,
              deductions: [...deductions, ...taxes],
            };
          }
        } catch (voucherError) {
          console.warn('Could not fetch payroll voucher:', voucherError);
        }
      }

      const eventMeta = batch.eventUrl
        ? eventMap.get(batch.eventUrl)
        : undefined;
      const jobMeta = batch.jobSlug ? jobMap.get(batch.jobSlug) : undefined;

      results.push({
        _id: batch._id.toString(),
        type: isEvent ? 'event' : 'job',
        eventUrl: batch.eventUrl,
        eventName: eventMeta?.eventName,
        jobSlug: batch.jobSlug,
        jobTitle: jobMeta?.jobTitle,
        venueName: eventMeta?.venueName ?? jobMeta?.venueName,
        startDate: batch.startDate,
        endDate: batch.endDate,
        payrollStatus: batch.payrollStatus,
        createdDate: batch.createdDate,
        modifiedDate: batch.modifiedDate,
        regularItems,
        overtimeItems,
        extraItems,
        totalRegularHours,
        totalOvertimeHours,
        totalGrossRegularPay,
        totalGrossOvertimePay,
        totalExtraEarnings,
        totalGrossPay,
        totalFicaSS,
        totalFicaMED,
        totalFederalTax,
        totalStateTax,
        totalTaxes,
        totalNetPay,
        payrollVoucher,
        lastCreatedPEOBatch: batch.lastCreatedPEOBatch
          ? {
              batchNumber: batch.lastCreatedPEOBatch.batchNumber,
              batchStatus: batch.lastCreatedPEOBatch.batchStatus,
              billingVouchersAvailable:
                batch.lastCreatedPEOBatch.billingVouchersAvailable,
              payrollVouchersAvailable:
                batch.lastCreatedPEOBatch.payrollVouchersAvailable,
              lastBillingSync: batch.lastCreatedPEOBatch.lastBillingSync,
            }
          : undefined,
      });
    }

    return results;
  } catch (error) {
    console.error('Error getting employee payroll history:', error);
    return [];
  }
}
