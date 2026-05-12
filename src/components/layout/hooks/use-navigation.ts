'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import React from 'react';
import {
  Clock,
  FileText,
  FileSpreadsheet,
  Home,
  CalendarClock,
  MessageCircleQuestion,
  Receipt,
  ClipboardList,
  CalendarRange,
  MapPin,
  GraduationCap,
} from 'lucide-react';
import { usePrimaryCompany } from '@/domains/company/hooks/use-primary-company';
import { useCurrentUser } from '@/domains/user/hooks/use-current-user';

export interface NavigationItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  current?: boolean;
}

export interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

export function useNavigation() {
  const pathname = usePathname();
  const { data: primaryCompany } = usePrimaryCompany();
  const { data: currentUser } = useCurrentUser();

  const isLimitedAccess = currentUser?.isLimitedAccess || false;
  const isApplicantOnly = currentUser?.isApplicantOnly || false;
  const applicantRecordStatus = currentUser?.status as string | undefined;

  const navigationGroups: NavigationGroup[] = useMemo(() => {
    const isClient = currentUser?.userType === 'Client';

    // ── Applicant-only sessions ───────────────────────────────────────────────
    if (isApplicantOnly) {
      const items: NavigationItem[] = [];

      if (
        applicantRecordStatus === 'Employee' ||
        applicantRecordStatus !== 'Applicant'
      ) {
        items.push({
          name: 'Payroll',
          href: '/payroll',
          icon: Receipt,
          current:
            pathname === '/payroll' ||
            pathname.startsWith('/payroll') ||
            pathname.startsWith('/paycheck-stubs'),
        });
      }

      items.push({
        name: 'Applicant',
        href: '/applicant',
        icon: GraduationCap,
        current:
          pathname === '/applicant' || pathname.startsWith('/applicant/'),
      });

      return [{ label: '', items }];
    }

    // ── Terminated/Inactive employees (non-applicant limited access) ──────────
    const isPrism = primaryCompany?.peoIntegration === 'Prism';

    if (isLimitedAccess) {
      if (!isPrism) return [];
      return [
        {
          label: '',
          items: [
            {
              name: 'Payroll',
              href: '/payroll',
              icon: Receipt,
              current:
                pathname === '/payroll' ||
                pathname.startsWith('/payroll') ||
                pathname.startsWith('/paycheck-stubs'),
            },
          ],
        },
      ];
    }

    // ── Full user navigation ──────────────────────────────────────────────────
    const isVenueCompany = primaryCompany?.companyType === 'Venue';
    const clientOrgs = currentUser?.clientOrgs as
      | { slug?: string }[]
      | undefined;
    const hasClientOrgs =
      isClient && Array.isArray(clientOrgs) && clientOrgs.length > 0;
    const showPaidTimeOff =
      primaryCompany?.timeClockSettings?.showPaidTimeOff ?? true;

    const workspaceItems: NavigationItem[] = [];
    const selfServiceItems: NavigationItem[] = [];

    workspaceItems.push({
      name: 'Home',
      href: '/home',
      icon: Home,
      current: pathname === '/home',
    });

    if ((!isClient && isVenueCompany) || (hasClientOrgs && isVenueCompany)) {
      workspaceItems.push(
        {
          name: 'Venues',
          href: '/venues',
          icon: MapPin,
          current: pathname === '/venues' || pathname.startsWith('/venues'),
        },
        {
          name: 'Events',
          href: '/events',
          icon: CalendarRange,
          current: pathname === '/events' || pathname.startsWith('/events'),
        }
      );
    }

    if (!isClient) {
      workspaceItems.push({
        name: 'Time',
        href: '/time',
        icon: Clock,
        current:
          pathname === '/time' ||
          pathname.startsWith('/time/') ||
          pathname === '/time-attendance' ||
          pathname.startsWith('/time-attendance'),
      });

      if (showPaidTimeOff) {
        workspaceItems.push({
          name: 'Paid Time Off',
          href: '/pto',
          icon: CalendarClock,
          current: pathname === '/pto' || pathname.startsWith('/pto'),
        });
      }
    }

    if (!isClient && isPrism) {
      selfServiceItems.push({
        name: 'Payroll',
        href: '/payroll',
        icon: Receipt,
        current:
          pathname === '/payroll' ||
          pathname.startsWith('/payroll') ||
          pathname.startsWith('/paycheck-stubs'),
      });
    }

    if (isClient) {
      selfServiceItems.push(
        {
          name: 'Invoices',
          href: '/invoices',
          icon: FileSpreadsheet,
          current: pathname === '/invoices' || pathname.startsWith('/invoices'),
        },
        {
          name: 'Forms',
          href: '/forms',
          icon: ClipboardList,
          current: pathname === '/forms' || pathname.startsWith('/forms'),
        }
      );
    }

    if (!isClient) {
      selfServiceItems.push(
        {
          name: 'Ask a Question',
          href: '/conversation',
          icon: MessageCircleQuestion,
          current:
            pathname === '/conversation' ||
            pathname.startsWith('/conversation'),
        },
        {
          name: 'Documents',
          href: '/documents',
          icon: FileText,
          current:
            pathname === '/documents' || pathname.startsWith('/documents'),
        },
        {
          name: 'Applicant',
          href: '/applicant',
          icon: GraduationCap,
          current:
            pathname === '/applicant' || pathname.startsWith('/applicant/'),
        }
      );
    }

    const groups: NavigationGroup[] = [];
    if (workspaceItems.length > 0)
      groups.push({ label: 'Workspace', items: workspaceItems });
    if (selfServiceItems.length > 0)
      groups.push({ label: 'Self Service', items: selfServiceItems });

    return groups;
  }, [
    pathname,
    primaryCompany,
    isLimitedAccess,
    isApplicantOnly,
    applicantRecordStatus,
    currentUser?.userType,
    currentUser?.clientOrgs,
  ]);

  const flatNavItems = useMemo(
    () => navigationGroups.flatMap((g) => g.items),
    [navigationGroups]
  );

  return { navigationGroups, flatNavItems };
}
