"use client";

import { Zap } from "lucide-react";
import { HeaderProps } from "./types";
import { FC } from "react";
import { TenantSwitcher } from "./TenantSwitcher";
import { UserMenu } from "./UserMenu";

export const Header: FC<HeaderProps> = ({ user, onTenantSwitch }) => {
  return (
    <div className="bg-white/80 backdrop-blur-lg border-b border-white/20 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Dashboard
              </h1>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <TenantSwitcher user={user} onTenantSwitch={onTenantSwitch} />
            <UserMenu user={user} />
          </div>
        </div>
      </div>
    </div>
  );
};
