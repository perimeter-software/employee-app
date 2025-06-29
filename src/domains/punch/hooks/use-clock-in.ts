import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PunchApiService, punchQueryKeys } from '../services';
import { ClockInCoordinates } from '@/domains/job/types/location.types';
import { Shift } from '@/domains/job/types/job.types';
import { toast } from 'sonner';
import { ApiErrorWithDetails } from '@/lib/api';

export interface ClockInData {
  userNote?: string;
  clockInCoordinates?: ClockInCoordinates;
  timeIn: string;
  newStartDate: string;
  newEndDate: string;
  selectedShift: Shift;
  applicantId: string;
  jobId: string;
}

export const useClockIn = (userId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ClockInData) => {
      // Show loading toast
      const loadingToastId = toast.loading('Clocking in...', {
        description: 'Recording your time and location',
      });

      try {
        const result = await PunchApiService.clockIn(userId, data.jobId, data);

        // Dismiss loading toast
        toast.dismiss(loadingToastId);

        return result;
      } catch (error) {
        // Dismiss loading toast on error
        toast.dismiss(loadingToastId);
        throw error;
      }
    },
    onSuccess: (newPunch, variables) => {
      // Show success toast
      toast.success('Successfully clocked in! ⏰', {
        description: `Started work on ${
          variables.selectedShift.shiftName || 'shift'
        }`,
        duration: 4000,
      });

      // Invalidate using the exact query keys from your punchQueryKeys
      queryClient.invalidateQueries({ queryKey: punchQueryKeys.all });
      queryClient.invalidateQueries({
        queryKey: punchQueryKeys.allOpen(userId),
      });
      queryClient.invalidateQueries({ queryKey: punchQueryKeys.open() });

      // Invalidate user data queries (in case punches are nested in user data)
      queryClient.invalidateQueries({ queryKey: ['user'] });
      queryClient.invalidateQueries({ queryKey: ['userApplicantJob'] });

      // Force refetch immediately for critical queries
      queryClient.refetchQueries({
        queryKey: punchQueryKeys.allOpen(userId),
        type: 'active',
      });
    },
    onError: (error: ApiErrorWithDetails) => {
      console.error('Clock in failed:', error);

      // Get the specific error code from your API
      const errorCode = error.errorCode || error.apiResponse?.error;
      const apiMessage = error.apiResponse?.message || error.message;

      // Enhanced error handling with specific messages based on API error codes
      let errorTitle = 'Failed to clock in';
      let errorDescription = apiMessage || 'Please try again';

      switch (errorCode) {
        case 'outside-geofence':
          errorTitle = 'Location Issue';
          errorDescription = "You're not within the required work location";
          break;

        case 'open-punch-exists':
          errorTitle = 'Already Clocked In';
          errorDescription =
            'You already have an active time entry for this job';
          break;

        case 'no-shifts':
          errorTitle = 'No Available Shifts';
          errorDescription = 'No shifts are available to clock in for';
          break;

        case 'breaks-not-allowed':
          errorTitle = 'Breaks Not Permitted';
          errorDescription =
            'You cannot clock in again during this shift because breaks are not allowed';
          break;

        case 'overtime-not-allowed':
          errorTitle = 'Overtime Restricted';
          errorDescription =
            "You've exceeded 40 hours and overtime is not allowed";
          break;

        case 'no-valid-shift':
          errorTitle = 'Invalid Shift';
          errorDescription = 'No valid shift found for the current time';
          break;

        case 'missing-job-coordinates':
          errorTitle = 'Location Setup Issue';
          errorDescription = 'Job location is not properly configured';
          break;

        case 'invalid-coordinates':
          errorTitle = 'Location Error';
          errorDescription = 'Unable to determine your current location';
          break;

        case 'job-not-found':
          errorTitle = 'Job Not Found';
          errorDescription =
            "The job you're trying to clock into was not found";
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
        duration: 6000,
        action: {
          label: 'Retry',
          onClick: () => {
            // Note: You'd need to pass the retry function here if needed
          },
        },
      });
    },
  });
};
