import type { GignologyJob } from "@/domains/job";
import { LeaveRequest } from "@/domains/punch";
import { TenantInfo } from "@/domains/tenant";

export type UserType = "Master" | "User" | "Admin";

export type GignologyUser = {
  _id: string;
  firstName?: string;
  lastName?: string;
  emailAddress: string;
  userType?: string;
  employeeType?: string;
  status?: string;
  applicantId: string;
  jobs?: GignologyJob[];
  applicantInfo?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    status?: string;
  };
};

export type Auth0UserNoPassword = {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  iat: number;
  exp: number;
  lastValidated?: number;
  _id?: string;
  applicantId?: string;
};

export type Auth0WithIds = Auth0UserNoPassword & {
  _id: string;
  applicantId: string;
};

export type EnhancedUser = {
  _id?: string;
  applicantId?: string;
  tenant?: TenantInfo;
  availableTenants?: TenantInfo[];
  email?: string;
  name?: string;
  [key: string]: unknown;
};

export type UserNoPassword = {
  _id: string;
  firstName: string;
  lastName: string;
  emailAddress: string;
  status: string;
  userId: string;
  profileImg: string | null;
  accrualRate: string;
  ptoBalance: number;
  jobs: GignologyJob[];
  leaveRequests: LeaveRequest[];
  userType: UserType;
  employeeType: string;
  applicantId: string;
};
