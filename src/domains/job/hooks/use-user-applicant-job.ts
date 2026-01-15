import { useQuery } from "@tanstack/react-query";
import { JobPipelineService, jobQueryKeys } from "../services/job-service";
import { GignologyUser } from "@/domains/user/types/user.types";

export function useUserApplicantJob(
  email: string,
  options?: { enabled?: boolean }
) {
  return useQuery<GignologyUser>({
    queryKey: jobQueryKeys.pipeline(email),
    queryFn: () => JobPipelineService.getUserApplicantJobPipeline(email),
    enabled: options?.enabled !== undefined ? options.enabled : !!email,
    staleTime: 5 * 60 * 1000, // ERROR-PROOF: 5 minutes (user job data doesn't change often)
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    refetchOnWindowFocus: false, // ERROR-PROOF: Don't refetch on window focus
    refetchOnMount: false, // ERROR-PROOF: Don't refetch on remount
    refetchOnReconnect: false, // ERROR-PROOF: Don't refetch on reconnect
    retry: (failureCount, error) => {
      // Don't retry on auth errors
      if (error.message.includes('401') || error.message.includes('403')) {
        return false;
      }
      // Don't retry on rate limit errors
      if (error.message.includes('429')) {
        return false;
      }
      return failureCount < 2;
    },
  });
}
