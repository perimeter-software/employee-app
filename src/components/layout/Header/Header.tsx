'use client';

// components/layout/Header.tsx

import { useUser } from '@auth0/nextjs-auth0/client';
import Image from 'next/image';
import { Button } from '@/components/ui/Button/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { Bell, ChevronDown, LogOut, Settings, User, Menu } from 'lucide-react';
import { TenantInfo, useSwitchTenant } from '@/domains/tenant';
import { useCurrentUser } from '@/domains/user';

interface HeaderProps {
  onMobileMenuToggle?: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMobileMenuToggle }) => {
  const { user } = useUser();
  const { data: enhancedUser, isLoading: userLoading } = useCurrentUser();
  const { mutate: switchTenant, isPending: tenantSwitchLoading } =
    useSwitchTenant();

  const displayUser = (enhancedUser || user) as {
    name?: string;
    given_name?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  } | null;

  const handleLogout = () => {
    window.location.href = '/api/auth/logout';
  };

  const getTenantInitials = (tenant: TenantInfo) => {
    if (tenant?.clientName) {
      return tenant.clientName
        .split(' ')
        .map((w: string) => w[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();
    }
    if (tenant?.url) {
      return tenant.url.slice(0, 2).toUpperCase();
    }
    return '??';
  };

  const handleTenantSwitch = async (tenantUrl: string) => {
    switchTenant(tenantUrl);
  };

  const shouldShowTenantSelector =
    enhancedUser?.availableTenants && enhancedUser.availableTenants.length > 1;

  const getUserDisplayName = () => {
    return (
      displayUser?.firstName ||
      displayUser?.name ||
      displayUser?.given_name ||
      'John'
    );
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="flex items-center h-16 px-4 sm:px-6 gap-4">
        {/* Left Side - Mobile Menu + Welcome Text */}
        <div className="flex items-center gap-3 flex-1 min-w-0 overflow-hidden">
          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="sm"
            className="lg:hidden flex-shrink-0"
            onClick={onMobileMenuToggle}
          >
            <Menu className="w-5 h-5" />
            <span className="sr-only">Open menu</span>
          </Button>

          {/* Welcome Text Container */}
          <div className="min-w-0 flex-1 overflow-hidden">
            {/* Desktop Welcome Text */}
            <div className="hidden lg:block">
              <h1 className="text-xl font-semibold text-appPrimary truncate">
                <span className="text-black">Welcome back, </span>
                {userLoading ? 'Loading...' : getUserDisplayName()}
              </h1>
              <p className="text-sm text-zinc-500 truncate">
                Explore your dashboard and check your logs.
              </p>
            </div>

            {/* Tablet Welcome Text */}
            <div className="hidden md:block lg:hidden">
              <h1 className="text-lg font-semibold text-appPrimary truncate">
                <span className="text-black">Welcome, </span>
                {userLoading ? 'Loading...' : getUserDisplayName()}
              </h1>
            </div>

            {/* Mobile Welcome Text */}
            <div className="md:hidden">
              <h1 className="text-base font-semibold text-appPrimary truncate">
                <span className="text-black">Hi, </span>
                {userLoading ? 'Loading...' : getUserDisplayName()}
              </h1>
            </div>
          </div>
        </div>

        {/* Right Side - Tenant Selector, Notifications, User Menu */}
        <div className="flex items-center space-x-2 sm:space-x-4">
          {/* Tenant Selector - Hide on mobile if too many items */}
          {shouldShowTenantSelector && (
            <div className="hidden sm:block">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="flex items-center space-x-2 min-w-[140px] sm:min-w-[180px]"
                    disabled={tenantSwitchLoading}
                  >
                    <div className="flex items-center gap-2">
                      {enhancedUser?.tenant?.tenantLogo ? (
                        <Image
                          src={enhancedUser.tenant.tenantLogo}
                          alt="logo"
                          width={20}
                          height={20}
                          className="rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                          {getTenantInitials(
                            enhancedUser?.tenant as TenantInfo
                          )}
                        </div>
                      )}
                      <span className="text-sm truncate max-w-[80px] sm:max-w-[120px]">
                        {enhancedUser?.tenant?.clientName || 'Default Tenant'}
                      </span>
                    </div>
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-72 max-h-80 overflow-y-auto"
                >
                  <div className="px-3 py-2 border-b">
                    <p className="text-sm font-medium">Switch Tenant</p>
                    <p className="text-xs text-gray-500">
                      Currently:{' '}
                      {enhancedUser?.tenant?.clientName || 'Default Tenant'}
                    </p>
                  </div>
                  <div className="py-1">
                    {enhancedUser?.availableTenants?.map(
                      (tenant: TenantInfo) => (
                        <DropdownMenuItem
                          key={tenant.url}
                          className="flex items-center gap-3 cursor-pointer px-3 py-2 hover:bg-gray-50"
                          onClick={() => handleTenantSwitch(tenant.url)}
                        >
                          {tenant.tenantLogo ? (
                            <Image
                              src={tenant.tenantLogo}
                              alt="logo"
                              width={24}
                              height={24}
                              className="rounded-full object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {getTenantInitials(tenant)}
                            </div>
                          )}
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="font-medium text-sm truncate">
                              {tenant.clientName || tenant.url}
                            </span>
                            <span className="text-xs text-gray-500 capitalize">
                              {tenant.type}
                            </span>
                          </div>
                          {tenant.url === enhancedUser?.tenant?.url && (
                            <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                          )}
                        </DropdownMenuItem>
                      )
                    )}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {/* Notifications */}
          <Button variant="ghost" size="sm" className="relative">
            <Bell className="w-5 h-5 text-appPrimary" />
            <span className="sr-only">Notifications</span>
          </Button>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center space-x-2 px-1 sm:px-3"
              >
                <div className="flex items-center space-x-2 sm:space-x-3">
                  {/* User Info - Hidden on mobile */}
                  <div className="text-right hidden md:block">
                    <p className="text-sm font-medium text-gray-900">
                      {displayUser?.name || displayUser?.given_name || 'User'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {displayUser?.email || ''}
                    </p>
                  </div>

                  {/* Profile Picture/Avatar */}
                  {user?.picture ? (
                    <div className="w-8 h-8 rounded-full overflow-hidden">
                      <Image
                        src={user.picture}
                        alt="Profile"
                        width={32}
                        height={32}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                      <span className="text-white font-medium text-sm">
                        {(
                          displayUser?.name ||
                          displayUser?.given_name ||
                          'U'
                        ).charAt(0)}
                      </span>
                    </div>
                  )}

                  <ChevronDown className="w-4 h-4 text-gray-400 hidden sm:block" />
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <div className="px-3 py-2">
                <p className="text-sm font-medium">
                  {displayUser?.name || displayUser?.given_name || 'User'}
                </p>
                <p className="text-xs text-gray-500">
                  {displayUser?.email || ''}
                </p>
              </div>
              <DropdownMenuSeparator />

              {/* Mobile tenant selector in user menu */}
              {shouldShowTenantSelector && (
                <div className="sm:hidden">
                  <div className="px-3 py-2">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                      Switch Tenant
                    </p>
                  </div>
                  {enhancedUser?.availableTenants
                    ?.slice(0, 3)
                    .map((tenant: TenantInfo) => (
                      <DropdownMenuItem
                        key={tenant.url}
                        className="flex items-center gap-2"
                        onClick={() => handleTenantSwitch(tenant.url)}
                      >
                        {tenant.tenantLogo ? (
                          <Image
                            src={tenant.tenantLogo}
                            alt="logo"
                            width={20}
                            height={20}
                            className="rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                            {getTenantInitials(tenant)}
                          </div>
                        )}
                        <span className="text-sm truncate">
                          {tenant.clientName || tenant.url}
                        </span>
                        {tenant.url === enhancedUser?.tenant?.url && (
                          <div className="w-2 h-2 rounded-full bg-green-500 ml-auto" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  <DropdownMenuSeparator />
                </div>
              )}

              <DropdownMenuItem>
                <User className="w-4 h-4 mr-2" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};

export default Header;
