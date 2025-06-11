import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PunchApiService } from "../services";
import { Punch } from "../types";

export const useClockOut = (userId: string, jobId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (punch: Punch) =>
      PunchApiService.clockOut(userId, jobId, punch),
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["punch"] });
    },
  });
};
