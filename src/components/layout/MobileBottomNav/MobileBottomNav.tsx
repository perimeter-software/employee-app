'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Bell,
  Settings,
  LogOut,
  ChevronRight,
  MoreHorizontal,
} from 'lucide-react';
import { clsxm } from '@/lib/utils';
import {
  useNavigation,
  NavigationItem,
} from '@/components/layout/hooks/use-navigation';
import { useCurrentUser } from '@/domains/user/hooks/use-current-user';

function computeBottomDistribution(flatNavItems: NavigationItem[]): {
  bottomBarItems: NavigationItem[];
  moreNavItems: NavigationItem[];
  featuredItem: NavigationItem | null;
} {
  const eventsItem = flatNavItems.find((i) => i.href === '/events') ?? null;
  const homeItem = flatNavItems.find((i) => i.href === '/home') ?? null;

  if (eventsItem) {
    const eventsIndex = flatNavItems.indexOf(eventsItem);

    // Items before Events in the list, excluding Home
    const beforeEvents = flatNavItems
      .slice(0, eventsIndex)
      .filter((i) => i.href !== '/dashboard');

    // Item just before Events (excluding Home) → left slot next to Events
    const slot2 = beforeEvents[beforeEvents.length - 1] ?? null;

    // Item just after Events → right slot next to Events
    const slot4 = flatNavItems[eventsIndex + 1] ?? null;

    const usedHrefs = new Set(
      [homeItem?.href, eventsItem.href, slot2?.href, slot4?.href].filter(
        Boolean
      )
    );

    const bottomBarItems = [homeItem, slot2, eventsItem, slot4].filter(
      (x): x is NavigationItem => x !== null
    );

    const moreNavItems = flatNavItems.filter((i) => !usedHrefs.has(i.href));

    return { bottomBarItems, moreNavItems, featuredItem: eventsItem };
  }

  // No Events: first 4 items in bottom bar, rest in More
  return {
    bottomBarItems: flatNavItems.slice(0, 4),
    moreNavItems: flatNavItems.slice(4),
    featuredItem: null,
  };
}

export const MobileBottomNav: React.FC = () => {
  const { flatNavItems } = useNavigation();
  const { data: currentUser } = useCurrentUser();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const userInitial = (
    currentUser?.firstName?.[0] ||
    currentUser?.name?.[0] ||
    'U'
  ).toUpperCase();

  const { bottomBarItems, moreNavItems, featuredItem } =
    computeBottomDistribution(flatNavItems);

  const closeMore = () => setIsMoreOpen(false);

  const handleLogout = () => {
    window.location.href = '/api/auth/logout';
  };

  // More button is "active" when the overlay is open, or when the active page
  // is one of the overflow items
  const isMoreActive = isMoreOpen || moreNavItems.some((i) => i.current);

  return (
    <>
      {/* ── More fullscreen overlay ─────────────────────────────────────────── */}
      {isMoreOpen && (
        <div className="fixed inset-x-0 top-0 bottom-16 z-50 bg-gray-50 flex flex-col lg:hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100">
            <Image
              src="/images/powered-by-gig-blue.png"
              alt="gig·nology"
              width={120}
              height={36}
              className="object-contain"
            />
            <div className="flex items-center gap-3">
              <button type="button" className="p-2" aria-label="Notifications">
                <Bell className="w-5 h-5 text-gray-600" />
              </button>
              <div className="w-8 h-8 rounded-full bg-appPrimary flex items-center justify-center">
                <span className="text-white text-sm font-semibold">
                  {userInitial}
                </span>
              </div>
            </div>
          </div>

          {/* Title */}
          <div className="px-4 pt-5 pb-4">
            <h1 className="text-2xl font-bold text-gray-900">More</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Self-service, account, and support.
            </p>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-4 pb-24">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-100">
              {/* Overflow nav items */}
              {moreNavItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMore}
                  className="flex items-center gap-3 px-4 py-3.5"
                >
                  <div
                    className={clsxm(
                      'w-9 h-9 rounded-xl flex items-center justify-center',
                      item.current ? 'bg-appPrimary/10' : 'bg-sky-50'
                    )}
                  >
                    <item.icon
                      className={clsxm(
                        'w-5 h-5',
                        item.current ? 'text-appPrimary' : 'text-sky-600'
                      )}
                    />
                  </div>
                  <span
                    className={clsxm(
                      'flex-1 text-sm font-medium',
                      item.current ? 'text-appPrimary' : 'text-gray-800'
                    )}
                  >
                    {item.name}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </Link>
              ))}

              {/* Notifications — always shown, no action yet */}
              <button type="button" className="w-full flex items-center gap-3 px-4 py-3.5">
                <div className="w-9 h-9 rounded-xl bg-sky-50 flex items-center justify-center">
                  <Bell className="w-5 h-5 text-sky-600" />
                </div>
                <span className="flex-1 text-left text-sm font-medium text-gray-800">
                  Notifications
                </span>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </button>

              {/* Settings — always shown, no action yet */}
              <button type="button" className="w-full flex items-center gap-3 px-4 py-3.5">
                <div className="w-9 h-9 rounded-xl bg-sky-50 flex items-center justify-center">
                  <Settings className="w-5 h-5 text-sky-600" />
                </div>
                <span className="flex-1 text-left text-sm font-medium text-gray-800">
                  Settings
                </span>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {/* Log out */}
            <button
              type="button"
              onClick={handleLogout}
              className="w-full mt-4 py-3.5 rounded-2xl border border-gray-200 bg-white flex items-center justify-center gap-2 text-red-500 font-medium text-sm"
            >
              <LogOut className="w-4 h-4" />
              Log out
            </button>
          </div>
        </div>
      )}

      {/* ── Bottom tab bar ──────────────────────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-white border-t border-gray-200">
        <div className="flex items-stretch h-16 overflow-visible max-w-lg mx-auto w-full">
          {bottomBarItems.map((item) => {
            const isFeatured =
              featuredItem !== null && item.href === featuredItem.href;

            if (isFeatured) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMore}
                  className="flex-1 flex flex-col items-center justify-end pb-2 relative"
                >
                  <div
                    className={clsxm(
                      'absolute left-1/2 -translate-x-1/2 -top-5 w-14 h-14 rounded-full shadow-md flex items-center justify-center',
                      item.current ? 'bg-appPrimary' : 'bg-gray-900'
                    )}
                  >
                    <item.icon className="w-6 h-6 text-white" />
                  </div>
                  <span
                    className={clsxm(
                      'text-xs',
                      item.current ? 'text-appPrimary font-medium' : 'text-gray-500'
                    )}
                  >
                    {item.name}
                  </span>
                </Link>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMore}
                className="flex-1 flex flex-col items-center justify-center gap-1"
              >
                <item.icon
                  className={clsxm(
                    'w-5 h-5',
                    item.current ? 'text-appPrimary' : 'text-gray-400'
                  )}
                />
                <span
                  className={clsxm(
                    'text-xs',
                    item.current
                      ? 'text-appPrimary font-medium'
                      : 'text-gray-500'
                  )}
                >
                  {item.name}
                </span>
              </Link>
            );
          })}

          {/* More button — always shown */}
          <button
            type="button"
            onClick={() => setIsMoreOpen((v) => !v)}
            className="flex-1 flex flex-col items-center justify-center gap-1"
          >
            <MoreHorizontal
              className={clsxm(
                'w-5 h-5',
                isMoreActive ? 'text-appPrimary' : 'text-gray-400'
              )}
            />
            <span
              className={clsxm(
                'text-xs',
                isMoreActive ? 'text-appPrimary font-medium' : 'text-gray-500'
              )}
            >
              More
            </span>
          </button>
        </div>
      </nav>
    </>
  );
};
