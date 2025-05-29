// domains/user/hooks/use-user-data.ts
import { useMemo } from "react";
import { useUserStore } from "../stores";
import { getTodayMidnight } from "@/lib/utils";
import { processHistoricalPunches } from "@/lib/utils/client-processing-utils";

// Hook equivalent to todaysJobPunches derived store
export function useTodaysJobPunches() {
  const user = useUserStore((state) => state.user);

  return useMemo(() => {
    const todayMidnight = getTodayMidnight();
    const allPunchesToday = user.jobs.flatMap((job) =>
      (job.punches || []).filter(
        (punch) => new Date(punch.timeIn).getDate() === todayMidnight.getDate()
      )
    );

    const open = allPunchesToday.find((punch) => !punch.timeOut);
    const closed = allPunchesToday.filter((punch) => punch.timeOut);

    return { open, closed };
  }, [user.jobs]);
}

// Hook equivalent to authedUsersLoadedPunches derived store
export function useAuthedUsersLoadedPunches() {
  const user = useUserStore((state) => state.user);

  return useMemo(() => {
    const currentTime = new Date().toISOString();
    return processHistoricalPunches(user.jobs, currentTime);
  }, [user.jobs]);
}

// Hook for user profile data
export function useUserProfile() {
  const user = useUserStore((state) => state.user);
  const isLoading = useUserStore((state) => state.isLoading);
  const error = useUserStore((state) => state.error);

  return useMemo(
    () => ({
      profile: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        emailAddress: user.emailAddress,
        profileImg: user.profileImg,
        userType: user.userType,
        employeeType: user.employeeType,
      },
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      initials: `${user.firstName?.[0] || ""}${
        user.lastName?.[0] || ""
      }`.toUpperCase(),
      isLoading,
      error,
    }),
    [user, isLoading, error]
  );
}

// Hook for user jobs
export function useUserJobs() {
  const jobs = useUserStore((state) => state.user.jobs);

  return useMemo(
    () => ({
      jobs,
      activeJobs: jobs.filter((job) => job.status === "active"),
      jobCount: jobs.length,
      hasJobs: jobs.length > 0,
    }),
    [jobs]
  );
}
