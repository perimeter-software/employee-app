import type { Applicant } from "../job";

export type ScheduleEntry = {
  start: string;
  end: string;
  roster: string[];
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
