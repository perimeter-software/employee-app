import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PunchApiService } from "../services";
import { Punch } from "../types";

export const useUpdatePunch = (userId: string, jobId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (punch: Punch) =>
      PunchApiService.updatePunch(userId, jobId, punch),
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["punch"] });
    },
  });
};
