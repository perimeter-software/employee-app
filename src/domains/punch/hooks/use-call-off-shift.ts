import { useMutation, useQueryClient } from '@tanstack/react-query';
import { jobQueryKeys } from '@/domains/job/services/job-service';
import { callOffShift, type CallOffShiftParams } from '@/domains/job/services/call-off-service';
import { toast } from 'sonner';

export const useCallOffShift = (userId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CallOffShiftParams) => {
      const loadingToastId = toast.loading('Calling off shift...', {
        description: 'Updating your schedule',
      });
      try {
        const result = await callOffShift(params);
        toast.dismiss(loadingToastId);
        return result;
      } catch (error) {
        toast.dismiss(loadingToastId);
        throw error;
      }
    },
    onSuccess: async () => {
      toast.success('Shift called off', {
        description: 'Your schedule has been updated.',
        duration: 4000,
      });
      // Call-off only updates roster (status/callOffReason) in the job; weekly schedule comes from job pipeline.
      await queryClient.invalidateQueries({ queryKey: jobQueryKeys.all });
    },
    onError: (error: Error) => {
      console.error('Call off failed:', error);
      const message = error.message || 'Failed to call off shift.';
      let description = message;
      if (message.includes('not allowed')) {
        description = 'Call off is not enabled for this job.';
      } else if (message.includes('at least') || message.includes('before shift')) {
        description = message;
      } else if (message.includes('already called off')) {
        description = 'This shift is already called off.';
      } else if (message.includes('No date-specific') || message.includes('not found')) {
        description = 'No matching shift found to call off.';
      }
      toast.error('Could not call off shift', {
        description,
        duration: 5000,
      });
    },
  });
};
