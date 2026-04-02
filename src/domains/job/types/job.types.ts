import { Applicant } from '@/domains/user/types/applicant.types';
import { DefaultSchedule, RosterApplicant } from './schedule.types';
import { JobLocation } from './location.types';
import { LeaveRequest, Punch, PunchWJobInfoDayHours } from '@/domains/punch';

export type Position = {
  positionName: string;
  numberPositions: string | number;
  payRate?: string | number;
  billRate?: string | number;
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
  positions?: Position[];
};

export type EventManagerNotificationRecipient = {
  userId?: string;
  applicantId?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
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
    autoAddWaitlistedStaff: boolean;
    allowCallOff?: boolean;
    callOffBefore?: number;
    callOffBeforeUnit?: 'minutes' | 'hours' | 'days';
    /** Minimum lead time (in hours) required to request a shift swap. */
    swapBeforeHours?: number;
    eventManagerNotificationRecipients?: EventManagerNotificationRecipient[];
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
  autoAddWaitlistedStaff: boolean;
  allowCallOff?: boolean;
  callOffBefore?: number;
  callOffBeforeUnit?: 'minutes' | 'hours' | 'days';
  /** Minimum lead time (in hours) required to request a shift swap. */
  swapBeforeHours?: number;
  /** Swap / event-style emails to job managers (see swap admin notifications). */
  eventManagerNotificationRecipients?: EventManagerNotificationRecipient[];
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
