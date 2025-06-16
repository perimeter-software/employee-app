export type TimesheetStatus =
    | "Pending"
    | "Approved"
    | "Not Approved"
    | "Corrected"
    | "Edited"
    | "Edited Approved";

export type ValidationResult = {
    isValid: boolean;
    errors: string[];
};

export type TimesheetType = "punch" | "break" | "lunch" | "leave" | "overtime";

// Main Timesheet type
export type Timesheet = {
    _id?: string;
    type: TimesheetType;
    userId: string;
    applicantId: string;
    jobId: string;
    timeIn: Date;
    timeOut: Date | null;
    userNote: string | null;
    managerNote: string | null;
    approvingManager: string | null;
    status: TimesheetStatus;
    modifiedDate: Date;
    modifiedBy: string;
    leaveRequest: string | null;
    paidHours: number | null;
    shiftSlug: string;
    createdAt?: Date;
    updatedAt?: Date;
};
