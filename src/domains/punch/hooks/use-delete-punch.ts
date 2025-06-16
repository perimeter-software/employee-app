import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PunchApiService } from "../services";

export const useDeletePunch = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (punchId: string) => PunchApiService.deletePunch(punchId),
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["punch"] });
      queryClient.invalidateQueries({ queryKey: ["punches"] });
    },
  });
};
