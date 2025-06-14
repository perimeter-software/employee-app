"use client";

import { useUser } from "@auth0/nextjs-auth0";
import { useUserApplicantJob } from "@/domains/job/hooks";
import { useAllOpenPunches, useFindPunches } from "@/domains/punch/hooks";
import { ErrorState, LoadingState } from "./States";
import { TimerCard } from "./TimerCard";
import { ShiftsSection } from "./ShiftsSection";
import { useMemo } from "react";

export const TimeTrackerContainer = () => {
  const { user: auth0User, isLoading: auth0Loading } = useUser();
  const {
    data: userData,
    isLoading: userLoading,
    error: userError,
  } = useUserApplicantJob(auth0User?.email || "");

  // Still need open punches for the timer card
  const { data: openPunches } = useAllOpenPunches(userData?._id || "");

  // Calculate date range for punches (let's use current week by default)
  const dateRange = useMemo(() => {
    const now = new Date();

    // Get start of current week (Monday)
    const startOfWeek = new Date(now);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);

    // Get end of current week (Sunday)
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    return {
      startDate: startOfWeek.toISOString(),
      endDate: endOfWeek.toISOString(),
    };
  }, []);

  // Get job IDs for the user
  const jobIds = useMemo(() => {
    return userData?.jobs?.map((job) => job._id) || [];
  }, [userData?.jobs]);

  // Fetch all punches for the date range using useFindPunches
  const { data: allPunches, isLoading: punchesLoading } = useFindPunches({
    userId: userData?._id || "",
    jobIds,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    // Don't filter by status to get both completed and open punches
  });

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
      />
    </div>
  );
};
