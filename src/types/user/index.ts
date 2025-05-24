import type { GignologyJob } from "../job";
import { TenantInfo } from "../tenant";

export interface GignologyUser {
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
}

export interface auth0userNoPassword {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
  iat: number;
  exp: number;
  lastValidated?: number;
  _id?: string;
  applicantId?: string;
}

export interface Auth0WithIds extends auth0userNoPassword {
  _id: string;
  applicantId: string;
}

export type EnhancedUser = {
  _id?: string;
  applicantId?: string;
  tenant?: TenantInfo;
  availableTenants?: TenantInfo[];
  email?: string;
  name?: string;
  [key: string]: unknown;
};
