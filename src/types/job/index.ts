import type { DefaultSchedule, RosterApplicant } from "../schedule";

export type Applicant = {
  _id: string;
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  // ... other applicant info
};

export type Shift = {
  defaultSchedule: DefaultSchedule;
  billRate: number;
  payRate: number;
  shiftName: string;
  shiftStartDate: string;
  shiftEndDate: string;
  shiftRoster: Applicant[] | RosterApplicant[];
  exceptions: unknown[];
  slug: string;
};

export type JobShiftSettings = {
  shifts: Shift[];
  startDate: string;
  endDate: string;
  position: string;
  location: string;
  payRate: number;
  billRate: number;
  additionalConfig: {
    earlyClockInMinutes: number;
    autoAdjustEarlyClockIn: boolean;
    allowManualPunches: boolean;
    allowOvertime: boolean;
    allowBreaks: boolean;
    allowPersonnelClockout: boolean;
    allowUnaccruedLeaveRequest: boolean;
    allowNegativeLeave: boolean;
    negativeHoursLimit: number;
    autoClockoutShiftEnd: boolean;
  };
  defaultSchedule: {
    monday: { start: string; end: string; roster: [] };
    tuesday: { start: string; end: string; roster: [] };
    wednesday: { start: string; end: string; roster: [] };
    thursday: { start: string; end: string; roster: [] };
    friday: { start: string; end: string; roster: [] };
    saturday: { start: string; end: string; roster: [] };
    sunday: { start: string; end: string; roster: [] };
  };
  jobShiftRoster: RosterApplicant[];
};

export interface GignologyJob {
  _id: string;
  title: string;
  jobId?: string;
  jobSlug: string;
  companySlug?: string;
  venueSlug?: string;
  shiftJob?: string | boolean;
  shifts?: Shift[];
  additionalConfig?: unknown;
  location?: unknown;
  status?: string;
  applicantStatus?: string;
  dateModified?: string;
  applyDate?: string;
  jobShiftSettings?: JobShiftSettings;
}
