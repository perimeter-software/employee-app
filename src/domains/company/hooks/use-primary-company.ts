import { useQuery } from '@tanstack/react-query';
import { CompanyService, companyQueryKeys } from '../services/company-service';

export const usePrimaryCompany = () => {
  return useQuery({
    queryKey: companyQueryKeys.primary(),
    queryFn: () => CompanyService.getPrimaryCompany(),
    staleTime: 15 * 60 * 1000, // 15 minutes (company data doesn't change often)
    refetchOnWindowFocus: false, // Don't refetch on window focus for company data
    retry: (failureCount, error) => {
      // Don't retry on auth errors (handled by interceptor)
      if (error.message.includes('401') || error.message.includes('403')) {
        return false;
      }
      return failureCount < 2;
    },
  });
};
