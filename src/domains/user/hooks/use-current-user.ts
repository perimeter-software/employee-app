import { useQuery } from "@tanstack/react-query";
import { userQueryKeys, UserApiService } from "../services";

export const useCurrentUser = (options?: {
  enabled?: boolean;
  staleTime?: number;
  refetchOnWindowFocus?: boolean;
}) => {
  console.log("🎣 useCurrentUser hook called with options:", options);

  return useQuery({
    queryKey: userQueryKeys.current(),
    queryFn: () => {
      console.log("🚀 Query function executed");
      return UserApiService.getCurrentUser();
    },
    staleTime: options?.staleTime ?? 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? false,
    enabled: options?.enabled ?? true,
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
