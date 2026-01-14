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
  });
}
