import { PunchDetail, Status } from "./punch.types";

export type EmbedLeaveRequest = {
  startDate: string;
  endDate: string;
  leaveRequestType: string;
  ptoHours: number;
  companyPaid: boolean;
  companyHours: number;
};

export type LeaveRequest = {
  _id: string;
  type: "leaveRequest";
  userId: string;
  applicantId: string;
  jobId: null; // the _id of the job need to scrub anything different than this
  timeIn: null;
  timeOut: null;
  userNote: string | null;
  managerNote: string | null;
  approvingManager: string | null;
  status: Status;
  modifiedDate: string;
  modifiedBy: string;
  leaveRequest: EmbedLeaveRequest;
  paidHours: number | null;
  clockInCoordinates: null;
  day?: string;
  hours?: number;
  totalHours?: number;
  multiplePunches?: boolean;
  details?: PunchDetail[];
};
