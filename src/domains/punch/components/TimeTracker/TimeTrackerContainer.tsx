"use client";

import { useUser } from "@auth0/nextjs-auth0";
import { useUserApplicantJob } from "@/domains/job/hooks";
import { useAllOpenPunches, useFindPunches } from "@/domains/punch/hooks";
import { ErrorState, LoadingState } from "./States";
import { TimerCard } from "./TimerCard";
import { ShiftsSection } from "./ShiftsSection";
import { useMemo, useEffect, useState } from "react";

export const TimeTrackerContainer = () => {
  const { user: auth0User, isLoading: auth0Loading } = useUser();
  const {
    data: userData,
    isLoading: userLoading,
    error: userError,
  } = useUserApplicantJob(auth0User?.email || "");

  // Track the current view type to adjust date range
  const [currentViewType, setCurrentViewType] = useState<"table" | "calendar">(
    "table"
  );

  // Track the base date for navigation (for table view week navigation)
  const [baseDate, setBaseDate] = useState(new Date());

  // Still need open punches for the timer card
  const { data: openPunches } = useAllOpenPunches(userData?._id || "");

  // DYNAMIC DATE RANGE - adjusts based on view type and base date
  const dateRange = useMemo(() => {
    if (currentViewType === "table") {
      // Table view: Current week (Sunday to Saturday) based on baseDate
      const startOfWeek = new Date(baseDate);
      const day = startOfWeek.getDay(); // 0 = Sunday, 1 = Monday, etc.
      startOfWeek.setDate(baseDate.getDate() - day); // Go back to Sunday
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6); // Saturday
      endOfWeek.setHours(23, 59, 59, 999);

      console.log("📅 TABLE date range (current week):", {
        baseDate: baseDate.toISOString(),
        startDate: startOfWeek.toISOString(),
        endDate: endOfWeek.toISOString(),
        dayOfWeek: day,
      });

      return {
        startDate: startOfWeek.toISOString(),
        endDate: endOfWeek.toISOString(),
      };
    } else {
      // Calendar view: 1 month range around current date
      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(now.getDate() - 30); // 1 month ago
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(now);
      endDate.setDate(now.getDate() + 30); // 1 month from now
      endDate.setHours(23, 59, 59, 999);

      console.log("📅 CALENDAR date range:", {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      return {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      };
    }
  }, [currentViewType, baseDate]); // Dependency on both view type and base date

  // Get job IDs for the user
  const jobIds = useMemo(() => {
    const ids = userData?.jobs?.map((job) => job._id) || [];
    console.log("🏢 Job IDs:", ids);
    return ids;
  }, [userData?.jobs]);

  // Fetch punches based on current date range
  const {
    data: allPunches,
    isLoading: punchesLoading,
    error: punchesError,
  } = useFindPunches({
    userId: userData?._id || "",
    jobIds,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    // Don't filter by status to get both completed and open punches
  });

  // DEBUG: Log when API is called
  useEffect(() => {
    if (userData?._id && jobIds.length > 0) {
      console.log("🔥 API call triggered with:", {
        userId: userData._id,
        jobIds,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        viewType: currentViewType,
      });
    }
  }, [
    userData?._id,
    jobIds,
    dateRange.startDate,
    dateRange.endDate,
    currentViewType,
  ]);

  // DEBUG: Log results
  useEffect(() => {
    console.log("📊 Punch data results:", {
      loading: punchesLoading,
      dataCount: allPunches?.length || 0,
      error: punchesError?.message,
      viewType: currentViewType,
    });
  }, [punchesLoading, allPunches, punchesError, currentViewType]);

  // Handle view type change from ShiftsSection
  const handleViewTypeChange = (viewType: "table" | "calendar") => {
    console.log("🔄 View type changed to:", viewType);
    setCurrentViewType(viewType);
  };

  // Handle date navigation for table view
  const handleDateNavigation = (direction: number) => {
    if (currentViewType === "table") {
      // Navigate by weeks
      const newDate = new Date(baseDate);
      newDate.setDate(baseDate.getDate() + direction * 7);
      setBaseDate(newDate);
      console.log("📅 Navigating to week of:", newDate.toDateString());
    }
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

      {/* DEBUG: Show punch loading/error state */}
      {punchesLoading && (
        <div className="p-4 bg-yellow-100 border border-yellow-300 rounded">
          Loading punches for {currentViewType} view...
        </div>
      )}

      {punchesError && (
        <div className="p-4 bg-red-100 border border-red-300 rounded">
          Error loading punches: {punchesError.message}
        </div>
      )}

      {/* DEBUG: Show current status */}
      <div className="p-4 bg-blue-100 border border-blue-300 rounded text-sm">
        <strong>Debug Info:</strong>
        <br />
        User ID: {userData?._id || "Not found"}
        <br />
        Job IDs: {jobIds.join(", ") || "None"}
        <br />
        Current View: {currentViewType}
        <br />
        Punches Loading: {punchesLoading ? "Yes" : "No"}
        <br />
        Punches Count: {allPunches?.length || 0}
        <br />
        Date Range: {dateRange.startDate} to {dateRange.endDate}
      </div>

      {/* Pass the date range, view change handler, and navigation handler to ShiftsSection */}
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
