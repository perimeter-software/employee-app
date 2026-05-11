'use client';

import { ShiftsSection } from '@/domains/punch/components/TimeTracker/ShiftsSection/ShiftsSection';
import type { GignologyUser } from '@/domains/user/types';
import type { PunchWithJobInfo } from '@/domains/punch/types';

interface MyShiftsTabProps {
  userData: GignologyUser;
  openPunches: PunchWithJobInfo[] | undefined;
  allPunches: PunchWithJobInfo[];
  punchesLoading: boolean;
  dateRange: { startDate: string; endDate: string };
  onViewTypeChange: (viewType: 'table' | 'calendar') => void;
  onDateNavigation: (direction: number) => void;
  currentViewType: 'table' | 'calendar';
  hasShiftJobs: boolean;
  isBlockedByJobPunch: boolean;
  hasActiveEventClockIn: boolean;
}

export function MyShiftsTab({
  userData,
  openPunches,
  allPunches,
  punchesLoading,
  dateRange,
  onViewTypeChange,
  onDateNavigation,
  currentViewType,
  hasShiftJobs,
  isBlockedByJobPunch,
  hasActiveEventClockIn,
}: MyShiftsTabProps) {
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
      hasRosterEvents={false}
      hasShiftJobs={hasShiftJobs}
      isBlockedByJobPunch={isBlockedByJobPunch}
      hasActiveEventClockIn={hasActiveEventClockIn}
      title="My Shifts"
    />
  );
}
