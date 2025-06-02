export type TenantInfo = {
  _id: string;
  url: string;
  status: string;
  clientName: string;
  type: string;
  lastLoginDate?: string;
  tenantLogo?: string;
  dbName?: string;
};

export type TenantDocument = {
  _id?: string;
  clientName: string;
  clientDomain?: string;
  additionalDomains?: string[];
  type: string;
  tenantLogo?: string;
  dbName?: string;
};

export type TenantObjectsIndexed = {
  [key: string]: {
    clientName: string;
    type: string;
    tenantLogo?: string;
    clientDomain?: string;
    additionalDomains?: string[];
    dbName?: string;
  };
};
