import { useQuery } from "@tanstack/react-query";
import { PunchApiService, punchQueryKeys } from "../services";

interface FindPunchesParams {
  userId: string;
  jobIds: string[];
  startDate: string;
  endDate: string;
  status?: string;
}

export const useFindPunches = (params: FindPunchesParams) => {
  console.log("🐛 DEBUG: useFindPunches called with params:", params);

  const enabled = !!params.userId && !!params.jobIds.length;
  console.log("🐛 DEBUG: Query enabled:", enabled);

  return useQuery({
    queryKey: [...punchQueryKeys.list(), params],
    queryFn: async () => {
      console.log("🐛 DEBUG: Executing findPunchesByDateRange with:", params);
      const result = await PunchApiService.findPunchesByDateRange(params);
      console.log("🐛 DEBUG: findPunchesByDateRange result:", result);
      return result;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
    enabled,
    retry: (failureCount, error) => {
      console.log("❌ Query retry:", { failureCount, error: error.message });
      // Don't retry on auth errors (handled by interceptor)
      if (error.message.includes("401") || error.message.includes("403")) {
        return false;
      }
      return failureCount < 2;
    },
  });
};
