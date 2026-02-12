import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formQueryKeys, FormService } from '../services';

export interface SaveFormDraftVariables {
  formId: string;
  employeeId: string;
  formValues: Record<string, any>;
}

/**
 * Save form as draft. Invalidates form-with-employee query so refetch shows updated draft.
 */
export function useSaveFormDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      formId,
      employeeId,
      formValues,
    }: SaveFormDraftVariables) =>
      FormService.saveDraft(formId, employeeId, formValues),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: formQueryKeys.withEmployee(
          variables.formId,
          variables.employeeId
        ),
      });
    },
    onError: (error) => {
      console.error('Failed to save draft:', error);
    },
  });
}
