import type { Applicant } from '@/domains/user/types/applicant.types';

export type RosterEntryStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'called_off';

export type RosterEntry = {
  employeeId: string;
  /**
   * Specific work date for this roster entry (YYYY-MM-DD).
   * When omitted, the entry is treated as recurring for that day-of-week
   * across the shift's date range.
   */
  date?: string;
  /** Position assigned when approved; used for capacity/filled count. */
  assignedPosition?: string;
  /** Position requested when status is pending; not used for capacity until approved. */
  requestedPosition?: string;
  /**
   * Optional workflow status for shift requests.
   * When missing, the entry is treated as approved for backwards compatibility.
   */
  status?: RosterEntryStatus;
  /**
   * Optional free-form notes attached to this roster entry
   * (e.g. manager's reason when a request is rejected).
   */
  notes?: string | string[];
  /**
   * Employee's reason for calling off the shift (when status is 'called_off').
   */
  callOffReason?: string;
};

export type ScheduleEntry = {
  start: string;
  end: string;
  roster: RosterEntry[];
};

export type RosterApplicant = Applicant & {
  totalHours: number;
  overtime: boolean;
};

export type DefaultSchedule = {
  monday: ScheduleEntry;
  tuesday: ScheduleEntry;
  wednesday: ScheduleEntry;
  thursday: ScheduleEntry;
  friday: ScheduleEntry;
  saturday: ScheduleEntry;
  sunday: ScheduleEntry;
};
