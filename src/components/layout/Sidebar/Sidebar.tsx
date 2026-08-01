'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { X } from 'lucide-react';
import { clsxm } from '@/lib/utils';
import { Button } from '@/components/ui/Button/Button';
import { useNavigation } from '@/components/layout/hooks/use-navigation';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onClose }) => {
  const { navigationGroups } = useNavigation();

  const handleLinkClick = () => {
    if (onClose) onClose();
  };

  return (
    // Desktop-only: hidden on mobile, always visible on lg+
    <div className="hidden lg:flex flex-col fixed inset-y-0 left-0 z-50 w-64 bg-zinc-50 shadow-xl">
      {/* Logo Section */}
      <div className="flex items-center justify-between h-24 px-6">
        <Image
          src="/images/powered-by-gig-blue.png"
          alt="gig·nology"
          width={160}
          height={48}
          className="object-contain"
        />
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
            <span className="sr-only">Close menu</span>
          </Button>
        )}
      </div>

      {/* Navigation */}
      <nav className="mt-3 px-4 space-y-6 overflow-y-auto flex-1">
        {navigationGroups.map((group) => (
          <div key={group.label || 'ungrouped'}>
            {group.label && (
              <p className="px-3 mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                {group.label}
              </p>
            )}
            <ul className="space-y-1">
              {group.items.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    onClick={handleLinkClick}
                    className={clsxm(
                      'group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                      item.current
                        ? 'bg-appPrimary text-white'
                        : 'text-zinc-700 hover:bg-gray-50 hover:text-zinc-900'
                    )}
                  >
                    <item.icon
                      className={clsxm(
                        'mr-3 h-5 w-5 flex-shrink-0',
                        item.current
                          ? 'text-white'
                          : 'text-zinc-400 group-hover:text-zinc-500'
                      )}
                    />
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
};

export default Sidebar;
