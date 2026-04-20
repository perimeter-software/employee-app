import { useQuery } from '@tanstack/react-query';
import { formQueryKeys, FormService } from '../services';

/**
 * Get list of employees for the current client (e.g. for form filler employee selector).
 */
export function useEmployeesList() {
  return useQuery({
    queryKey: formQueryKeys.employeesList(),
    queryFn: () => FormService.getEmployeesList(),
    staleTime: 5 * 60 * 1000,
  });
}
