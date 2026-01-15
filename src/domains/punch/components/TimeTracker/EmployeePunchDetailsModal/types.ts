// Re-export EmployeePunch type for the modal
export interface EmployeePunch {
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
  employeeEmail: string;
  jobTitle: string;
  jobSite: string;
  location: string;
}
