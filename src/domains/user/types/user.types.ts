import type { GignologyJob } from "@/domains/job";
import { LeaveRequest } from "@/domains/punch";
import { TenantInfo } from "@/domains/tenant";
import { ApiResponse } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";

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
  firstName?: string;
  lastName?: string;
  userType?: string;
  employeeType?: string;
  status?: string;
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

export type Auth0SessionUser = EnhancedUser & {
  sub: string; // Auth0 user ID (always present)
  email?: string; // Email (optional in Auth0)
  email_verified?: boolean; // Email verification status
  name?: string; // Display name
  given_name?: string; // First name
  family_name?: string; // Last name
  nickname?: string; // Nickname
  picture?: string; // Profile picture URL
  updated_at?: string; // Last updated
  iss?: string; // Issuer
  aud?: string | string[]; // Audience
  iat?: number; // Issued at
  exp?: number; // Expires at
  [key: string]: unknown; // Allow other custom claims
};

// Or extend the official UserProfile if you want to be more strict
export interface AuthenticatedRequest extends NextRequest {
  user: Auth0SessionUser;
  params: {
    [key: string]: string;
  };
}

export type RouteHandler<T = unknown> = {
  (request: AuthenticatedRequest, context?: Record<string, unknown>): Promise<
    NextResponse<T>
  >;
};

// Type guard to ensure user has required fields
export function isValidAuth0User(user: unknown): user is Auth0SessionUser {
  if (!user || typeof user !== "object") {
    return false;
  }

  const userObj = user as Record<string, unknown>;
  return typeof userObj.sub === "string";
}

export type CurrentUserResponse = ApiResponse<{ user: EnhancedUser }>;
