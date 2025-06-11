import { AdditionalConfiguration } from "@/domains/job/types/job.types";
import { GigLocation } from "../../job/types/location.types";

export type Status =
  | "Pending"
  | "Approved"
  | "Not Approved"
  | "Corrected"
  | "Edited"
  | "Edited Approved";

export type PunchDetail = {
  originalPunch: Punch;
  originalPunchId: string;
  originalPunchTimeIn: string;
  originalPunchTimeOut: string | null;
};

export type Punch = {
  _id: string;
  type: "punch";
  userId: string;
  applicantId: string;
  jobId: string; // the _id of the job need to scrub anything different than this
  timeIn: string;
  timeOut: string | null;
  userNote: string | null;
  managerNote: string | null;
  approvingManager: string | null;
  status: Status;
  modifiedDate: string;
  modifiedBy: string;
  leaveRequest: null;
  paidHours: number | null;
  clockInCoordinates: GigLocation | null;
  duration?: number;
  shiftSlug?: string;
  shiftName?: string;
  day?: string;
  details?: PunchDetail[];
};

export type PunchNoId = Omit<Punch, "_id">;

export type PunchWithJobInfo = {
  _id: string;
  type: "punch";
  userId: string;
  applicantId: string;
  jobId: string; // the _id of the job need to scrub anything different than this
  timeIn: string;
  timeOut: string | null;
  userNote: string | null;
  managerNote: string | null;
  approvingManager: string | null;
  status: Status;
  modifiedDate: string;
  modifiedBy: string;
  paidHours: number | null;
  shiftSlug: string;
  shiftName?: string;
  clockInCoordinates: GigLocation | null;
  leaveRequest: null;
  jobInfo: {
    _id: string;
    title: string;
    jobSlug: string;
    address: string;
    companyCity: string;
    companyState: string;
    zip: number;
    additionalConfig?: AdditionalConfiguration;
  };
  missingClockOut?: boolean;
};

export type PunchWJobInfoDayHours = PunchWithJobInfo & {
  day: string;
  hours: number;
  totalHours?: number;
};

export interface PunchResponse {
  success: boolean;
  message: string;
  punch: PunchWithJobInfo;
}

export interface PunchListResponse {
  success: boolean;
  message: string;
  punches: PunchWithJobInfo[];
}

export interface PunchError {
  error: string;
  message: string;
  openPunch?: string;
}
