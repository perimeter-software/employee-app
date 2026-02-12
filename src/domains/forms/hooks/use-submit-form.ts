import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formQueryKeys, FormService } from '../services';

export interface SubmitFormVariables {
  formId: string;
  employeeId: string;
  formValues: Record<string, any>;
}

/**
 * Submit form. Invalidates form-with-employee query on success.
 */
export function useSubmitForm() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      formId,
      employeeId,
      formValues,
    }: SubmitFormVariables) =>
      FormService.submitForm(formId, employeeId, formValues),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: formQueryKeys.withEmployee(
          variables.formId,
          variables.employeeId
        ),
      });
    },
    onError: (error) => {
      console.error('Failed to submit form:', error);
    },
  });
}
