'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  CalendarDays,
  LayoutGrid,
  Calendar,
  ClipboardList,
  RefreshCw,
} from 'lucide-react';
import { startOfWeek, endOfWeek } from 'date-fns';
import { useAppUser } from '@/domains/user/hooks/useAppUser';
import { useUserApplicantJob } from '@/domains/job/hooks';
import { useAllOpenPunches, useFindPunches } from '@/domains/punch/hooks';
import { useCurrentUser } from '@/domains/user';
import { useRosterEvents } from '@/domains/event/hooks';
import { usePrimaryCompany } from '@/domains/company/hooks/use-primary-company';
import { useCompanyWorkWeek } from '@/domains/shared/hooks/use-company-work-week';
import { clsxm } from '@/lib/utils';
import {
  getUserShiftForToday,
  resolveShiftDates,
} from '@/domains/punch/utils/shift-job-utils';
import { LoadingState } from '@/domains/punch/components/TimeTracker/States';
import { EventsTab } from './EventsTab';
import { ShiftsTab } from './ShiftsTab';
import { MyEventsTab } from './MyEventsTab';
import { MyShiftsTab } from './MyShiftsTab';
import { RequestsTab } from './RequestsTab';

type TabId = 'events' | 'shifts' | 'my-events' | 'my-shifts' | 'requests';

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'events', label: 'Events', icon: CalendarDays },
  { id: 'shifts', label: 'Shifts', icon: LayoutGrid },
  { id: 'my-events', label: 'My Events', icon: Calendar },
  { id: 'my-shifts', label: 'My Shifts', icon: ClipboardList },
  { id: 'requests', label: 'Requests', icon: RefreshCw },
];

export function TimeContainer() {
  const [activeTab, setActiveTab] = useState<TabId>('events');

  const { user: auth0User, isLoading: auth0Loading } = useAppUser();
  const { weekStartsOn, isLoading: companyLoading } = useCompanyWorkWeek();
  const { data: currentUser, isLoading: currentUserLoading } = useCurrentUser();
  const { data: primaryCompany } = usePrimaryCompany();

  const isVenueCompany = primaryCompany?.companyType === 'Venue';

  const { data: userData, isLoading: userLoading } = useUserApplicantJob(
    auth0User?.email || '',
    { enabled: !!auth0User?.email }
  );

  const hasShiftJobs = !!userData?.jobs?.length;

  const [currentViewType, setCurrentViewType] = useState<'table' | 'calendar'>('table');

  const [baseDate, setBaseDate] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: weekStartsOn || 0 })
  );

  useEffect(() => {
    if (!companyLoading && weekStartsOn !== undefined) {
      setBaseDate(startOfWeek(new Date(), { weekStartsOn }));
    }
  }, [weekStartsOn, companyLoading]);

  const dateRange = useMemo(() => {
    if (currentViewType === 'table') {
      const weekStart = startOfWeek(baseDate, { weekStartsOn: weekStartsOn || 0 });
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = endOfWeek(baseDate, { weekStartsOn: weekStartsOn || 0 });
      weekEnd.setHours(23, 59, 59, 999);
      return { startDate: weekStart.toISOString(), endDate: weekEnd.toISOString() };
    }
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999);
    return { startDate: startDate.toISOString(), endDate: endDate.toISOString() };
  }, [currentViewType, baseDate, weekStartsOn]);

  const jobIds = useMemo(
    () => userData?.jobs?.map((job) => job._id) || [],
    [userData?.jobs]
  );

  const rosterCheckRange = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setMonth(end.getMonth() + 6);
    end.setHours(23, 59, 59, 999);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }, []);

  const { data: rosterCheckEvents } = useRosterEvents({
    applicantId: isVenueCompany ? userData?.applicantId || '' : '',
    startDate: rosterCheckRange.startDate,
    endDate: rosterCheckRange.endDate,
  });

  const hasRosterEvents = useMemo(() => {
    if (!isVenueCompany || !rosterCheckEvents?.length || !userData?.applicantId) return false;
    return rosterCheckEvents.some((event) =>
      event.applicants?.some(
        (a) => a.id === userData.applicantId && a.status === 'Roster'
      )
    );
  }, [isVenueCompany, rosterCheckEvents, userData?.applicantId]);

  const { data: openPunches } = useAllOpenPunches(userData?._id || '');

  const isBlockedByJobPunch = useMemo(() => {
    if (!openPunches?.length || !userData) return false;
    const openPunch = openPunches.find((p) => !p.timeOut);
    if (!openPunch) return false;
    const punchAge = Date.now() - new Date(openPunch.timeIn).getTime();
    if (punchAge > 24 * 60 * 60 * 1000) return false;
    const openJob = userData.jobs?.find((j) => j._id === openPunch.jobId);
    if (!openJob) return true;
    const openShift = openJob.shifts?.find((s) => s.slug === openPunch.shiftSlug);
    if (!openShift) return true;
    const now = new Date().toISOString();
    const { start, end, isOvernightFromPreviousDay } = getUserShiftForToday(
      openJob,
      userData.applicantId,
      now,
      openShift
    );
    if (!start || !end) return true;
    const { shiftEndTime } = resolveShiftDates(start, end, now, isOvernightFromPreviousDay);
    return new Date() <= shiftEndTime;
  }, [openPunches, userData]);

  const hasActiveEventClockIn = useMemo(() => {
    if (!isVenueCompany || !rosterCheckEvents?.length || !userData?.applicantId) return false;
    const now = new Date();
    return rosterCheckEvents.some((event) => {
      const applicantEntry = event.applicants?.find(
        (a) => a.id === userData.applicantId && a.status === 'Roster'
      );
      if (!applicantEntry?.timeIn || applicantEntry?.timeOut) return false;
      if (now.getTime() - new Date(applicantEntry.timeIn).getTime() > 24 * 60 * 60 * 1000) return false;
      if (event.eventEndTime && now > new Date(event.eventEndTime)) return false;
      return true;
    });
  }, [isVenueCompany, rosterCheckEvents, userData?.applicantId]);

  const { data: allPunches, isLoading: punchesLoading } = useFindPunches({
    userId: userData?._id || '',
    jobIds,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  const handleViewTypeChange = (viewType: 'table' | 'calendar') => {
    setCurrentViewType(viewType);
  };

  const handleDateNavigation = (direction: number) => {
    if (currentViewType === 'table') {
      const newDate = new Date(baseDate);
      newDate.setDate(baseDate.getDate() + direction * 7);
      setBaseDate(newDate);
    }
  };

  if (auth0Loading || userLoading || currentUserLoading) {
    return <LoadingState />;
  }

  if (!userData) {
    return <LoadingState />;
  }

  const applicantId = userData.applicantId || '';
  const userId = userData._id || '';
  const agentName = [userData.firstName, userData.lastName].filter(Boolean).join(' ');

  return (
    <div className="w-full space-y-4">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Time</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Clock in to events or shift-jobs, view your schedule, manage requests.
        </p>
      </div>

      {/* Tab bar — horizontally scrollable on small screens */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={clsxm(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap shrink-0',
                isActive
                  ? 'bg-gray-900 text-white'
                  : 'bg-transparent text-gray-600 hover:bg-gray-100 border border-gray-200'
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'events' && (
        <EventsTab
          applicantId={applicantId}
          userId={userId}
          agentName={agentName}
        />
      )}

      {activeTab === 'shifts' && (
        <ShiftsTab
          userData={userData}
          openPunches={openPunches}
          hasShiftJobs={hasShiftJobs}
          isBlockedByJobPunch={isBlockedByJobPunch}
          hasActiveEventClockIn={hasActiveEventClockIn}
        />
      )}

      {activeTab === 'my-events' && (
        <MyEventsTab
          userData={userData}
          openPunches={openPunches}
          allPunches={allPunches || []}
          punchesLoading={punchesLoading}
          dateRange={dateRange}
          onViewTypeChange={handleViewTypeChange}
          onDateNavigation={handleDateNavigation}
          currentViewType={currentViewType}
          hasRosterEvents={hasRosterEvents}
          isBlockedByJobPunch={isBlockedByJobPunch}
          hasActiveEventClockIn={hasActiveEventClockIn}
        />
      )}

      {activeTab === 'my-shifts' && (
        <MyShiftsTab
          userData={userData}
          openPunches={openPunches}
          allPunches={allPunches || []}
          punchesLoading={punchesLoading}
          dateRange={dateRange}
          onViewTypeChange={handleViewTypeChange}
          onDateNavigation={handleDateNavigation}
          currentViewType={currentViewType}
          hasShiftJobs={hasShiftJobs}
          isBlockedByJobPunch={isBlockedByJobPunch}
          hasActiveEventClockIn={hasActiveEventClockIn}
        />
      )}

      {activeTab === 'requests' && <RequestsTab />}
    </div>
  );
}
