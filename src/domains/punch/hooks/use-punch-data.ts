import { useMemo } from "react";
import { useUserStore } from "@/domains/user";
import { useDateStore } from "@/domains/shared";
import {
  processJobPunches,
  processTimeoff,
  calculateTotals,
} from "@/lib/utils/client-processing-utils";
import { usePunchViewerStore } from "../stores";

// Hook equivalent to displayJobs derived store
export function useDisplayJobs() {
  const user = useUserStore((state) => state.user);
  const selectedWeek = useDateStore((state) => state.selectedWeek);

  return useMemo(() => {
    return processJobPunches(user.jobs, selectedWeek, selectedWeek.clientWeek);
  }, [user.jobs, selectedWeek]);
}

// Hook equivalent to displayTimeoff derived store
export function useDisplayTimeoff() {
  const user = useUserStore((state) => state.user);
  const selectedWeek = useDateStore((state) => state.selectedWeek);

  return useMemo(() => {
    return processTimeoff(user.leaveRequests, selectedWeek.clientWeek);
  }, [user.leaveRequests, selectedWeek.clientWeek]);
}

// Hook equivalent to displayTotals derived store
export function useDisplayTotals() {
  const displayJobs = useDisplayJobs();
  const displayTimeoff = useDisplayTimeoff();
  const selectedWeek = useDateStore((state) => state.selectedWeek);

  return useMemo(() => {
    return calculateTotals(
      displayJobs,
      displayTimeoff,
      selectedWeek.clientWeek
    );
  }, [displayJobs, displayTimeoff, selectedWeek.clientWeek]);
}

// Combined hook for all display data (optimization for components that need multiple values)
export function useDisplayData() {
  const displayJobs = useDisplayJobs();
  const displayTimeoff = useDisplayTimeoff();
  const displayTotals = useDisplayTotals();

  return useMemo(
    () => ({
      displayJobs,
      displayTimeoff,
      displayTotals,
    }),
    [displayJobs, displayTimeoff, displayTotals]
  );
}

// Hook for punch viewer state
export function usePunchViewer() {
  const punchViewer = usePunchViewerStore();

  return useMemo(
    () => ({
      ...punchViewer,
      hasPunches: punchViewer.allPunches.length > 0,
      hasQueue: punchViewer.queue.length > 0,
      queueLength: punchViewer.queue.length,
    }),
    [punchViewer]
  );
}
