'use client';

import { useUser } from '@auth0/nextjs-auth0/client';
import { useUserApplicantJob } from '@/domains/job/hooks';
import { useAllOpenPunches, useFindPunches } from '@/domains/punch/hooks';
import { useCurrentUser } from '@/domains/user';
import { useRosterEvents } from '@/domains/event/hooks';
import { usePrimaryCompany } from '@/domains/company/hooks/use-primary-company';
import { ErrorState, LoadingState } from './States';
import { TimerCard } from './TimerCard';
import { ShiftsSection } from './ShiftsSection';
import { EmployeeTimeAttendanceTable } from './EmployeeTimeAttendanceTable';
import { useMemo, useState, useEffect } from 'react';
import { useCompanyWorkWeek } from '@/domains/shared/hooks/use-company-work-week';
import { startOfWeek, endOfWeek } from 'date-fns';
import {
  getUserShiftForToday,
  resolveShiftDates,
} from '@/domains/punch/utils/shift-job-utils';

export const TimeTrackerContainer = () => {
  const { user: auth0User, isLoading: auth0Loading } = useUser();

  // Get company work week settings
  const { weekStartsOn, isLoading: companyLoading } = useCompanyWorkWeek();

  // Get current user data to check userType (this is already cached by Header component)
  const { data: currentUser, isLoading: currentUserLoading } = useCurrentUser();

  // Get primary company to check companyType
  const { data: primaryCompany } = usePrimaryCompany();
  const isVenueCompany = primaryCompany?.companyType === 'Venue';

  // Check if user is Client - userType comes from API, not Auth0
  const isClient = currentUser?.userType === 'Client';

  // Only fetch user data if not a Client (to avoid unnecessary API calls)
  const shouldFetchUserData = !isClient && !!auth0User?.email;
  const {
    data: userData,
    isLoading: userLoading,
    error: userError,
  } = useUserApplicantJob(auth0User?.email || '', {
    enabled: shouldFetchUserData,
  });

  // True when the user is assigned to at least one shift job (the pipeline already
  // filters to shiftJob === 'Yes' / true, so any entry in jobs[] counts).
  const hasShiftJobs = !!userData?.jobs?.length;

  // Track the current view type to adjust date range
  const [currentViewType, setCurrentViewType] = useState<'table' | 'calendar'>(
    'table'
  );

  // Track the base date for navigation (for table view week navigation)
  // Initialize to start of current week based on company work week settings
  const [baseDate, setBaseDate] = useState(() => {
    const now = new Date();
    return startOfWeek(now, { weekStartsOn: weekStartsOn || 0 });
  });

  // Update baseDate when company work week settings change
  useEffect(() => {
    if (!companyLoading && weekStartsOn !== undefined) {
      const now = new Date();
      const newStartDate = startOfWeek(now, { weekStartsOn });
      setBaseDate(newStartDate);
    }
  }, [weekStartsOn, companyLoading]);

  const dateRange = useMemo(() => {
    if (currentViewType === 'table') {
      // Table view: Current week based on company work week settings
      const weekStart = startOfWeek(baseDate, {
        weekStartsOn: weekStartsOn || 0,
      });
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = endOfWeek(baseDate, { weekStartsOn: weekStartsOn || 0 });
      weekEnd.setHours(23, 59, 59, 999);

      return {
        startDate: weekStart.toISOString(),
        endDate: weekEnd.toISOString(),
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
  }, [currentViewType, baseDate, weekStartsOn]);

  // Get job IDs for the user
  const jobIds = useMemo(() => {
    const ids = userData?.jobs?.map((job) => job._id) || [];
    return ids;
  }, [userData?.jobs]);

  // Check if user has any rostered events — start from yesterday to catch events that began yesterday
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
    if (!isVenueCompany) return false;
    if (!rosterCheckEvents?.length || !userData?.applicantId) return false;
    return rosterCheckEvents.some((event) =>
      event.applicants?.some(
        (a) => a.id === userData.applicantId && a.status === 'Roster'
      )
    );
  }, [isVenueCompany, rosterCheckEvents, userData?.applicantId]);

  // Still need open punches for the timer card (only enabled for non-Client users)
  const { data: openPunches } = useAllOpenPunches(userData?._id || '');

  // True when there is an active job punch whose scheduled shift has NOT yet ended.
  // Once the shift ends the user is forgiven and can clock in to something else.
  const isBlockedByJobPunch = useMemo(() => {
    if (!openPunches?.length || !userData) return false;
    const openPunch = openPunches.find((p) => !p.timeOut);
    if (!openPunch) return false;

    // Forgiveness: punch older than 24 h is considered stale
    const punchAge = Date.now() - new Date(openPunch.timeIn).getTime();
    if (punchAge > 24 * 60 * 60 * 1000) return false;

    const openJob = userData.jobs?.find((j) => j._id === openPunch.jobId);
    if (!openJob) return true; // can't determine end time → conservative

    const openShift = openJob.shifts?.find(
      (s) => s.slug === openPunch.shiftSlug
    );
    if (!openShift) return true; // can't determine end time → conservative

    const now = new Date().toISOString();
    const { start, end, isOvernightFromPreviousDay } = getUserShiftForToday(
      openJob,
      userData.applicantId,
      now,
      openShift
    );
    if (!start || !end) return true; // can't determine end time → conservative

    const { shiftEndTime } = resolveShiftDates(
      start,
      end,
      now,
      isOvernightFromPreviousDay
    );
    // Forgiveness: shift has already ended
    return new Date() <= shiftEndTime;
  }, [openPunches, userData]);

  // True when the user is clocked into an event that has NOT yet ended.
  const hasActiveEventClockIn = useMemo(() => {
    if (!isVenueCompany || !rosterCheckEvents?.length || !userData?.applicantId)
      return false;
    const now = new Date();
    return rosterCheckEvents.some((event) => {
      const applicantEntry = event.applicants?.find(
        (a) => a.id === userData.applicantId && a.status === 'Roster'
      );
      if (!applicantEntry?.timeIn || applicantEntry?.timeOut) return false;
      // Forgiveness: clock-in older than 24 h
      const punchAge =
        now.getTime() - new Date(applicantEntry.timeIn).getTime();
      if (punchAge > 24 * 60 * 60 * 1000) return false;
      // Forgiveness: event has ended
      if (event.eventEndTime && now > new Date(event.eventEndTime))
        return false;
      return true;
    });
  }, [isVenueCompany, rosterCheckEvents, userData?.applicantId]);

  // Fetch punches based on current date range (only enabled for non-Client users)
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

  // For Client role, show only the employee time and attendance table
  if (isClient) {
    if (auth0Loading || companyLoading || currentUserLoading) {
      return <LoadingState />;
    }
    const hideEmployeesDetails = !!currentUser?.hideEmployeesDetails;
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <EmployeeTimeAttendanceTable
          hideEmployeesDetails={hideEmployeesDetails}
        />
      </div>
    );
  }

  // For non-Client users, wait for user data
  if (auth0Loading || userLoading || currentUserLoading) {
    return <LoadingState />;
  }

  if (userError) {
    return <ErrorState error={userError} />;
  }

  if (!userData) {
    return <ErrorState error="No user data found" />;
  }

  // For regular users, show the normal time tracker with TimerCard and ShiftsSection
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <TimerCard
        userData={userData}
        openPunches={openPunches}
        hasRosterEvents={hasRosterEvents}
        hasShiftJobs={hasShiftJobs}
        isBlockedByJobPunch={isBlockedByJobPunch}
        hasActiveEventClockIn={hasActiveEventClockIn}
      />

      <ShiftsSection
        userData={userData}
        openPunches={openPunches}
        allPunches={allPunches || []}
        punchesLoading={punchesLoading}
        dateRange={dateRange}
        onViewTypeChange={handleViewTypeChange}
        onDateNavigation={handleDateNavigation}
        currentViewType={currentViewType}
        hasRosterEvents={hasRosterEvents}
        hasShiftJobs={hasShiftJobs}
        isBlockedByJobPunch={isBlockedByJobPunch}
        hasActiveEventClockIn={hasActiveEventClockIn}
      />
    </div>
  );
};
