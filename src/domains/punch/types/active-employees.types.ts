/** Params for active employee count / list (Client time & attendance). */
export interface ActiveEmployeesParams {
  jobIds?: string[];
  shiftSlug?: string;
}

/** Response shape from active-count API when includeList is false. */
export interface ActiveEmployeeCountResponse {
  count: number;
}

/** Response shape from active-count API when includeList is true. */
export interface ActiveEmployeeRow {
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
  jobTitle: string;
  jobSite: string;
  location: string;
}

export interface ActiveEmployeesListResponse {
  count: number;
  employees: ActiveEmployeeRow[];
}
