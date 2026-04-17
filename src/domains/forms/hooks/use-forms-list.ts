import { useQuery } from '@tanstack/react-query';
import { formQueryKeys, FormService } from '../services';

/**
 * Get all active forms for the current tenant (client users).
 */
export function useFormsList() {
  return useQuery({
    queryKey: formQueryKeys.list(),
    queryFn: () => FormService.getForms(),
    staleTime: 5 * 60 * 1000,
  });
}
