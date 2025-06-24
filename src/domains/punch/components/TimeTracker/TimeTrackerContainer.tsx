'use client';

import { useUser } from '@auth0/nextjs-auth0/client';
import { useUserApplicantJob } from '@/domains/job/hooks';
import { useAllOpenPunches, useFindPunches } from '@/domains/punch/hooks';
import { ErrorState, LoadingState } from './States';
import { TimerCard } from './TimerCard';
import { ShiftsSection } from './ShiftsSection';
import { useMemo, useState } from 'react';

export const TimeTrackerContainer = () => {
  const { user: auth0User, isLoading: auth0Loading } = useUser();
  const {
    data: userData,
    isLoading: userLoading,
    error: userError,
  } = useUserApplicantJob(auth0User?.email || '');

  // Track the current view type to adjust date range
  const [currentViewType, setCurrentViewType] = useState<'table' | 'calendar'>(
    'table'
  );

  // Track the base date for navigation (for table view week navigation)
  const [baseDate, setBaseDate] = useState(new Date());

  // Still need open punches for the timer card
  const { data: openPunches } = useAllOpenPunches(userData?._id || '');

  const dateRange = useMemo(() => {
    if (currentViewType === 'table') {
      // Table view: Current week (Sunday to Saturday) based on baseDate
      const startOfWeek = new Date(baseDate);

      // Get the day of the week (0 = Sunday, 1 = Monday, etc.)
      const day = startOfWeek.getDay();

      // Calculate days to subtract to get to Sunday
      // This ensures we always get the Sunday of the current week
      startOfWeek.setDate(baseDate.getDate() - day);
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6); // Saturday
      endOfWeek.setHours(23, 59, 59, 999);

      return {
        startDate: startOfWeek.toISOString(),
        endDate: endOfWeek.toISOString(),
      };
    } else {
      // Calendar view: 2 month range around current date for better calendar display
      const now = new Date();
      const startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 1); // 1 month ago
      startDate.setDate(1); // Start of that month
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(now);
      endDate.setMonth(now.getMonth() + 2); // 2 months from now
      endDate.setDate(0); // Last day of the month
      endDate.setHours(23, 59, 59, 999);

      return {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      };
    }
  }, [currentViewType, baseDate]);

  // Get job IDs for the user
  const jobIds = useMemo(() => {
    const ids = userData?.jobs?.map((job) => job._id) || [];
    return ids;
  }, [userData?.jobs]);

  // Fetch punches based on current date range
  const { data: allPunches, isLoading: punchesLoading } = useFindPunches({
    userId: userData?._id || '',
    jobIds,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    // Don't filter by status to get both completed and open punches
  });

  // Handle view type change from ShiftsSection
  const handleViewTypeChange = (viewType: 'table' | 'calendar') => {
    setCurrentViewType(viewType);
  };

  const handleDateNavigation = (direction: number) => {
    if (currentViewType === 'table') {
      // Navigate by weeks - ensure we maintain proper week boundaries
      const newDate = new Date(baseDate);
      newDate.setDate(baseDate.getDate() + direction * 7);

      setBaseDate(newDate);
    }
    // Calendar view navigation is handled by the calendar component itself
  };

  if (auth0Loading || userLoading) {
    return <LoadingState />;
  }

  if (userError) {
    return <ErrorState error={userError} />;
  }

  if (!userData) {
    return <ErrorState error="No user data found" />;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <TimerCard userData={userData} openPunches={openPunches} />

      <ShiftsSection
        userData={userData}
        openPunches={openPunches}
        allPunches={allPunches || []}
        punchesLoading={punchesLoading}
        dateRange={dateRange}
        onViewTypeChange={handleViewTypeChange}
        onDateNavigation={handleDateNavigation}
        currentViewType={currentViewType}
      />
    </div>
  );
};
