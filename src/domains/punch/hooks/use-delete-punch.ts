import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PunchApiService, punchQueryKeys } from "../services";

export const useDeletePunch = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (punchId: string) => PunchApiService.deletePunch(punchId),
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: punchQueryKeys.all });
    },
  });
};
