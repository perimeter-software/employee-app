import { Applicant } from '@/domains/user/types/applicant.types';
import { DefaultSchedule, RosterApplicant } from './schedule.types';
import { JobLocation } from './location.types';
import { LeaveRequest, Punch, PunchWJobInfoDayHours } from '@/domains/punch';

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
  defaultSchedule: DefaultSchedule;
  jobShiftRoster: RosterApplicant[];
};

export type AdditionalConfiguration = {
  geofence: boolean;
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

export type GignologyJob = {
  _id: string;
  title: string;
  jobId?: string;
  jobSlug: string;
  companySlug?: string;
  venueSlug?: string;
  shiftJob?: string | boolean;
  shifts?: Shift[];
  additionalConfig?: AdditionalConfiguration;
  location?: JobLocation;
  status?: string;
  applicantStatus?: string;
  dateModified?: string;
  applyDate?: string;
  jobShiftSettings?: JobShiftSettings;
  punches: Punch[];
  leaveRequests: LeaveRequest[];
  companyCity?: string;
  companyState?: string;
  zip?: number;
  address?: string;
};

export type DisplayJob = GignologyJob & {
  punches: PunchWJobInfoDayHours[];
};

/** Params for jobs-with-shifts API (Client time & attendance). */
export type JobsWithShiftsParams = {
  includeHiddenJobs?: boolean;
};
