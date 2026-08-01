'use client';

import { ShiftsSection } from '@/domains/punch/components/TimeTracker/ShiftsSection/ShiftsSection';
import type { GignologyUser } from '@/domains/user/types';
import type { PunchWithJobInfo } from '@/domains/punch/types';

interface MyEventsTabProps {
  userData: GignologyUser;
  openPunches: PunchWithJobInfo[] | undefined;
  allPunches: PunchWithJobInfo[];
  punchesLoading: boolean;
  dateRange: { startDate: string; endDate: string };
  onViewTypeChange: (viewType: 'table' | 'calendar') => void;
  onDateNavigation: (direction: number) => void;
  currentViewType: 'table' | 'calendar';
  hasRosterEvents: boolean;
  isBlockedByJobPunch: boolean;
  hasActiveEventClockIn: boolean;
}

export function MyEventsTab({
  userData,
  openPunches,
  allPunches,
  punchesLoading,
  dateRange,
  onViewTypeChange,
  onDateNavigation,
  currentViewType,
  hasRosterEvents,
  isBlockedByJobPunch,
  hasActiveEventClockIn,
}: MyEventsTabProps) {
  return (
    <ShiftsSection
      userData={userData}
      openPunches={openPunches}
      allPunches={allPunches}
      punchesLoading={punchesLoading}
      dateRange={dateRange}
      onViewTypeChange={onViewTypeChange}
      onDateNavigation={onDateNavigation}
      currentViewType={currentViewType}
      hasRosterEvents={hasRosterEvents}
      hasShiftJobs={false}
      isBlockedByJobPunch={isBlockedByJobPunch}
      hasActiveEventClockIn={hasActiveEventClockIn}
      title="My Events"
    />
  );
}
