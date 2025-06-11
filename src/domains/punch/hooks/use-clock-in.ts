import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PunchApiService } from "../services";
import { ClockInCoordinates } from "@/domains/job/types/location.types";
import { Shift } from "@/domains/job/types/job.types";

interface ClockInData {
  userNote?: string;
  clockInCoordinates: ClockInCoordinates;
  timeIn: string;
  newStartDate: string;
  newEndDate: string;
  selectedShift: Shift;
}

export const useClockIn = (userId: string, jobId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: ClockInData) =>
      PunchApiService.clockIn(userId, jobId, data),
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["punch"] });
    },
  });
};
