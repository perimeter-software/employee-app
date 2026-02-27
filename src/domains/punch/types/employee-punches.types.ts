/** Params for employee punches by date range (Client time & attendance). */
export interface EmployeePunchesParams {
  startDate: string;
  endDate: string;
  jobIds?: string[];
  shiftSlugs?: string[];
}

/** Shape of a punch row from the employee punches API / table (Client time & attendance). */
export interface EmployeePunch extends Record<string, unknown> {
  _id: string;
  userId: string;
  applicantId: string;
  jobId: string;
  timeIn: string;
  timeOut: string | null;
  status: string;
  shiftSlug?: string;
  shiftName?: string;
  employeeName: string;
  firstName?: string;
  lastName?: string;
  employeeEmail: string;
  phoneNumber?: string;
  profileImg?: string | null;
  jobTitle: string;
  jobSite: string;
  location: string;
  userNote?: string;
  managerNote?: string;
  modifiedDate?: string;
  modifiedBy?: string;
  modifiedByName?: string;
  /** History of updates (same punch doc); length > 0 means punch was updated */
  updateHistory?: Array<{
    timeIn: string;
    timeOut: string | null;
    userNote: string | null;
    managerNote: string | null;
    timeInBefore?: string;
    timeOutBefore?: string | null;
    userNoteBefore?: string | null;
    managerNoteBefore?: string | null;
    modifiedBy: string;
    modifiedByName?: string;
    modifiedDate: string;
  }>;
  isSelected?: boolean;
  checkbox?: unknown;
  date?: unknown;
  employee?: unknown;
  timeRange?: unknown;
  totalHours?: unknown;
}

/** Props for the EmployeeTimeAttendanceTable component (Client time & attendance). */
export interface EmployeeTimeAttendanceTableProps {
  startDate?: string;
  endDate?: string;
}
