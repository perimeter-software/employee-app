export type PayrollBatchStatus =
  | 'Draft'
  | 'Submitted'
  | 'Approved'
  | 'Paid'
  | 'Cancelled';

export interface TaxDetails {
  totalPay: number;
  totalBill: number;
  burden?: number;
  grossMargin?: number;
  grossMarginPercentage?: number;
  ficaSS: number;
  ficaMED: number;
  federalTax: number;
  stateTax: number;
  checkNet: number;
  billingVoucherId?: string;
}

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

export interface SubmittedEventApplicant {
  applicantId: string;
  companySlug?: string;
  earningId: string | null;
  payRate?: number;
  billRate?: number;
  totalHours?: number;
  taxDetails?: TaxDetails;
  rowId?: string;
  isEstimated?: boolean;
  isSynced?: boolean;
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
  taxDetails?: TaxDetails;
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

// ── Employee-facing payroll history types ─────────────────────────────────────

export interface BillingVoucherItem {
  billCode: string;
  billCodeDescription: string;
  billAmt: number;
}

export interface BillingVoucher {
  _id?: string;
  employeeId: string;
  batchNumber: string;
  voucherId?: string;
  payDate?: string;
  voucherStatus?: string;
  sumBilling: BillingVoucherItem[];
}

export interface EmployeePayrollBatch {
  _id: string;
  type: 'event' | 'job';
  eventUrl?: string;
  jobSlug?: string;
  startDate: string;
  endDate: string;
  payrollStatus: string;
  createdDate: string;
  modifiedDate: string;
  regularItems: (SubmittedEventApplicant | SubmittedJobTimecard)[];
  overtimeItems: (SubmittedEventApplicant | SubmittedJobTimecard)[];
  totalRegularHours: number;
  totalOvertimeHours: number;
  totalGrossRegularPay: number;
  totalGrossOvertimePay: number;
  totalGrossPay: number;
  totalFicaSS: number;
  totalFicaMED: number;
  totalFederalTax: number;
  totalStateTax: number;
  totalTaxes: number;
  totalNetPay: number;
  billingVoucher?: BillingVoucher;
  lastCreatedPEOBatch?: {
    batchNumber: string;
    batchStatus?: string;
    billingVouchersAvailable?: string;
    payrollVouchersAvailable?: string;
  };
}

export interface EmployeePayrollHistoryResponse {
  payrollBatches: EmployeePayrollBatch[];
  count: number;
}
