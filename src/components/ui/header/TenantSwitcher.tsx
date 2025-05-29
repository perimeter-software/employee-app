"use client";

import { FC, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/Button/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu/DropdownMenu";
import { ChevronDown } from "lucide-react";
import { TenantInfo } from "@/domains/tenant";
import { TenantSwitcherProps } from "./types";

export const TenantSwitcher: FC<TenantSwitcherProps> = ({
  user,
  onTenantSwitch,
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const getTenantInitials = (tenant: TenantInfo) => {
    if (tenant?.clientName) {
      return tenant.clientName
        .split(" ")
        .map((w: string) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
    }
    if (tenant?.url) {
      return tenant.url.slice(0, 2).toUpperCase();
    }
    return "??";
  };

  const handleTenantSwitch = async (tenantUrl: string) => {
    if (tenantUrl === user.tenant?.url || isLoading) return;

    setIsLoading(true);
    try {
      await onTenantSwitch(tenantUrl);
    } finally {
      setIsLoading(false);
    }
  };

  if (!user.availableTenants || user.availableTenants.length <= 1) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          loading={isLoading}
          rightIcon={<ChevronDown className="w-4 h-4 opacity-50" />}
          className="bg-white/50 backdrop-blur-sm border-white/20 hover:bg-white/70 transition-all min-w-[180px] justify-between"
        >
          <div className="flex items-center gap-2">
            {user.tenant?.tenantLogo ? (
              <Image
                src={user.tenant.tenantLogo}
                alt="logo"
                width={20}
                height={20}
                className="rounded-full object-cover"
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                {getTenantInitials(user.tenant!)}
              </div>
            )}
            <span className="truncate max-w-[120px] font-medium">
              {user.tenant?.clientName || user.tenant?.url || "Select Tenant"}
            </span>
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-56 bg-white/95 backdrop-blur-sm border-white/20"
      >
        {user.availableTenants.map((tenant: TenantInfo) => (
          <DropdownMenuItem
            key={tenant.url}
            className="flex items-center gap-2 cursor-pointer focus:bg-blue-50 hover:bg-blue-50 p-3"
            onClick={() => handleTenantSwitch(tenant.url)}
          >
            {tenant.tenantLogo ? (
              <Image
                src={tenant.tenantLogo}
                alt="logo"
                width={24}
                height={24}
                className="rounded-full object-cover"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                {getTenantInitials(tenant)}
              </div>
            )}
            <div className="flex flex-col">
              <span className="font-medium">
                {tenant.clientName || tenant.url}
              </span>
              <span className="text-xs text-gray-500">{tenant.type}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
