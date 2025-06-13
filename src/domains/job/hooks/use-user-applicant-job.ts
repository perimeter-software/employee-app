import { useQuery } from "@tanstack/react-query";
import { JobPipelineService, jobQueryKeys } from "../services/job-service";
import { GignologyUser } from "@/domains/user/types/user.types";

export function useUserApplicantJob(email: string) {
  return useQuery<GignologyUser>({
    queryKey: jobQueryKeys.pipeline(email),
    queryFn: () => JobPipelineService.getUserApplicantJobPipeline(email),
    enabled: !!email,
  });
}
