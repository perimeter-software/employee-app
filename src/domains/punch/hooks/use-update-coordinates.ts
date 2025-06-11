import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PunchApiService } from "../services";
import { ClockInCoordinates } from "@/domains/job/types/location.types";

export const useUpdateCoordinates = (userId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (location: ClockInCoordinates) =>
      PunchApiService.updateCoordinates(userId, location),
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["punch"] });
    },
  });
};
