import type { Applicant } from '@/domains/user/types/applicant.types';

export type RosterEntry = {
  employeeId: string;
  date: string;
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
