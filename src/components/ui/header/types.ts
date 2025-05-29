import { EnhancedUser } from "@/domains/user";

export type HeaderProps = {
  user: EnhancedUser;
  onTenantSwitch: (tenantUrl: string) => void;
};

export type TenantSwitcherProps = {
  user: EnhancedUser;
  onTenantSwitch: (tenantUrl: string) => void;
};

export type UserMenuProps = {
  user: EnhancedUser;
};
