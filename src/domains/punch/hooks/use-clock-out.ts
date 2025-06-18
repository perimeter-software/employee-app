import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PunchApiService, punchQueryKeys } from '../services';
import { Punch } from '../types';
import { toast } from 'sonner';

interface ApiErrorWithDetails extends Error {
  errorCode?: string;
  status?: number;
  apiResponse?: {
    success: boolean;
    message: string;
    error?: string;
  };
}

export const useClockOut = (userId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (punch: Punch) => {
      // Show loading toast
      const loadingToastId = toast.loading('Clocking out...', {
        description: 'Recording your end time',
      });

      try {
        const result = await PunchApiService.clockOut(
          userId,
          punch.jobId,
          punch
        );

        // Dismiss loading toast
        toast.dismiss(loadingToastId);

        return result;
      } catch (error) {
        // Dismiss loading toast on error
        toast.dismiss(loadingToastId);
        throw error;
      }
    },
    onSuccess: () => {
      // Show success toast
      toast.success('Successfully clocked out! 🏁', {
        description: 'Your work time has been recorded',
        duration: 4000,
      });

      // Invalidate using the exact query keys from your punchQueryKeys
      queryClient.invalidateQueries({ queryKey: punchQueryKeys.all });
      queryClient.invalidateQueries({
        queryKey: punchQueryKeys.allOpen(userId),
      });
      queryClient.invalidateQueries({ queryKey: punchQueryKeys.open() });

      // Invalidate user data queries
      queryClient.invalidateQueries({ queryKey: ['user'] });
      queryClient.invalidateQueries({ queryKey: ['userApplicantJob'] });

      // Force refetch immediately
      queryClient.refetchQueries({
        queryKey: punchQueryKeys.allOpen(userId),
        type: 'active',
      });
    },
    onError: (error: ApiErrorWithDetails) => {
      console.error('Clock out failed:', error);

      // Get the specific error code from your API
      const errorCode = error.errorCode || error.apiResponse?.error;
      const apiMessage = error.apiResponse?.message || error.message;

      // Enhanced error handling with specific messages
      let errorTitle = 'Failed to clock out';
      let errorDescription = apiMessage || 'Please try again';

      switch (errorCode) {
        case 'missing-punch':
          errorTitle = 'Missing Time Entry';
          errorDescription = 'No active time entry found to clock out';
          break;

        case 'clock-out-failed':
          errorTitle = 'Clock Out Failed';
          errorDescription = 'Unable to record your end time. Please try again';
          break;

        case 'internal-error':
          errorTitle = 'System Error';
          errorDescription =
            'A system error occurred. Please contact support if this continues';
          break;

        default:
          // Handle network/connection errors
          if (error.message?.includes('Network connection failed')) {
            errorTitle = 'Connection Issue';
            errorDescription = 'Check your internet connection and try again';
          } else if (error.message?.includes('Request timeout')) {
            errorTitle = 'Request Timeout';
            errorDescription = 'The request took too long. Please try again';
          } else {
            // Use the API message if available, otherwise use the error message
            errorDescription =
              apiMessage || error.message || 'An unexpected error occurred';
          }
          break;
      }

      toast.error(errorTitle, {
        description: errorDescription,
        duration: 5000,
        action: {
          label: 'Retry',
          onClick: () => {},
        },
      });
    },
  });
};
