import { useQuery } from '@tanstack/react-query';
import { formQueryKeys, FormService } from '../services';

/**
 * Get a single form by ID.
 */
export function useForm(formId: string | undefined) {
  return useQuery({
    queryKey: formQueryKeys.detail(formId ?? ''),
    queryFn: () => FormService.getForm(formId!),
    enabled: !!formId,
  });
}
