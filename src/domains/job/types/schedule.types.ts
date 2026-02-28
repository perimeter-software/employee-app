import type { Applicant } from '@/domains/user/types/applicant.types';

export type RosterEntryStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export type RosterEntry = {
  employeeId: string;
  /**
   * Specific work date for this roster entry (YYYY-MM-DD).
   * When omitted, the entry is treated as recurring for that day-of-week
   * across the shift's date range.
   */
  date?: string;
  /** Position is filled when assigned to someone (see stadium-people WeeklyScheduleConfigurationModal) */
  assignedPosition?: string;
  /**
   * Optional workflow status for shift requests.
   * When missing, the entry is treated as approved for backwards compatibility.
   */
  status?: RosterEntryStatus;
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
