export type PayrollBatchStatus =
  | 'Draft'
  | 'Submitted'
  | 'Approved'
  | 'Paid'
  | 'Cancelled';

export interface BatchDataEdit {
  applicantId: string;
  payRate: number;
  billRate: number;
  deductionAmount: number | null;
  deductionCode: string | null;
  deductionMaxAmount: number | null;
  deductionAmountType: string | null;
  deductionMaxAmountType: string | null;
  deductionSponsor: string | null;
  salary: 'Yes' | 'No';
  earningId: string | null;
  totalHours: number;
  timecardId: string;
}

export interface SubmittedJobTimecard {
  _id: string;
  type: 'punch';
  userId: string | null;
  applicantId: string;
  jobId: string;
  timeIn: string;
  timeOut: string;
  userNote: string | null;
  managerNote: string | null;
  approvingManager: string | null;
  status: string;
  modifiedDate: string;
  modifiedBy: string;
  clockInCoordinates: Record<string, unknown> | null;
  leaveRequest: Record<string, unknown> | null;
  paidHours: number | null;
  shiftSlug: string;
  shiftName?: string;
  createdFrom?: string;
  payRate: number;
  billRate: number;
  deductionAmount: number | null;
  deductionCode: string | null;
  deductionMaxAmount: number | null;
  deductionAmountType: string | null;
  deductionMaxAmountType: string | null;
  deductionSponsor: string | null;
  salary: 'Yes' | 'No';
  earningId: string | null;
  totalHours: number;
}

export interface PayrollBatch {
  _id: string;
  jobSlug: string;
  startDate: string;
  endDate: string;
  status: PayrollBatchStatus;
  createdDate: string;
  modifiedDate: string;
  batchDataEdits: BatchDataEdit[];
  submittedEventApplicants: Record<string, unknown>[];
  submittedJobTimecards: SubmittedJobTimecard[];
}

export interface PayrollBatchParams {
  jobSlug?: string;
  startDate?: string;
  endDate?: string;
  status?: PayrollBatchStatus;
  timecardId?: string;
}
