import { useQuery } from '@tanstack/react-query';
import { formQueryKeys, FormService } from '../services';

/**
 * Get form with employee data pre-filled (for form filler page).
 */
export function useFormWithEmployeeData(
  formId: string | undefined,
  employeeId: string | undefined
) {
  return useQuery({
    queryKey: formQueryKeys.withEmployee(formId ?? '', employeeId ?? ''),
    queryFn: () =>
      FormService.getFormWithEmployeeData(formId!, employeeId!),
    enabled: !!formId && !!employeeId,
  });
}
