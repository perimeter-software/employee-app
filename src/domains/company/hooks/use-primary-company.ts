import { useQuery } from '@tanstack/react-query';
import { CompanyService, companyQueryKeys } from '../services/company-service';

export const usePrimaryCompany = () => {
  return useQuery({
    queryKey: companyQueryKeys.primary(),
    queryFn: () => CompanyService.getPrimaryCompany(),
    staleTime: 15 * 60 * 1000, // 15 minutes (company data doesn't change often)
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
    refetchOnWindowFocus: false, // ERROR-PROOF: Don't refetch on window focus
    refetchOnMount: false, // ERROR-PROOF: Don't refetch on remount
    refetchOnReconnect: false, // ERROR-PROOF: Don't refetch on reconnect
    retry: (failureCount, error) => {
      // Don't retry on auth errors (handled by interceptor)
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
};
