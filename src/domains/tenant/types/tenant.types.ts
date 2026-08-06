import { ApiResponse } from "@/lib/api";

export type TenantInfo = {
  _id: string;
  url: string;
  status: string;
  clientName: string;
  type: string;
  lastLoginDate?: string;
  tenantLogo?: string;
  dbName?: string;
  peoIntegration?: string;
  clientDomain?: string;
};

export type TenantDocument = {
  _id?: string;
  clientName: string;
  clientDomain?: string;
  additionalDomains?: string[];
  type: string;
  tenantLogo?: string;
  dbName?: string;
  peoIntegration?: string;
  /**
   * Tenants not yet live on v4 (or intentionally turned off) carry `disabled: true`.
   * Nothing may resolve a session onto a disabled tenant — see `isTenantEligible`.
   */
  disabled?: boolean;
  stage?: string;
};

/**
 * A tenant is eligible to host a session only when it has a database to talk to
 * and has not been disabled. Applicant login used to hardcode every tenant it
 * found as active, which let sessions land on tenants that were not migrated.
 */
export function isTenantEligible(
  tenant: Pick<TenantDocument, 'dbName' | 'disabled'>
): boolean {
  return Boolean(tenant.dbName) && tenant.disabled !== true;
}

export type TenantObjectsIndexed = {
  [key: string]: {
    clientName: string;
    type: string;
    tenantLogo?: string;
    clientDomain?: string;
    additionalDomains?: string[];
    dbName?: string;
    peoIntegration?: string;
  };
};

export type SwitchTenantResponse = ApiResponse<{
  tenant: TenantInfo;
}>;
