import { EnhancedUser } from "@/types/user";

export type HeaderProps = {
  user: EnhancedUser;
  onTenantSwitch: (tenantUrl: string) => void;
};
