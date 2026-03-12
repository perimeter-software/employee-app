import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { EventApiService, EventClockPayload, eventQueryKeys } from '../services';

interface ClockMutationVars {
  eventId: string;
  payload: EventClockPayload;
}

export const useEventClockIn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventId, payload }: ClockMutationVars) => {
      const loadingId = toast.loading('Clocking in...', {
        description: 'Recording your time',
      });
      try {
        const result = await EventApiService.clockIn(eventId, payload);
        toast.dismiss(loadingId);
        return result;
      } catch (error) {
        toast.dismiss(loadingId);
        throw error;
      }
    },
    onSuccess: () => {
      toast.success('Successfully clocked in!', {
        description: 'Your event start time has been recorded',
        duration: 4000,
      });
      queryClient.invalidateQueries({ queryKey: eventQueryKeys.all });
    },
    onError: (error: Error) => {
      // Always refetch so the UI reflects the true DB state
      queryClient.invalidateQueries({ queryKey: eventQueryKeys.all });
      toast.error('Failed to clock in', {
        description: error.message || 'Please try again',
        duration: 5000,
      });
    },
  });
};

export const useEventClockOut = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventId, payload }: ClockMutationVars) => {
      const loadingId = toast.loading('Clocking out...', {
        description: 'Recording your end time',
      });
      try {
        const result = await EventApiService.clockOut(eventId, payload);
        toast.dismiss(loadingId);
        return result;
      } catch (error) {
        toast.dismiss(loadingId);
        throw error;
      }
    },
    onSuccess: () => {
      toast.success('Successfully clocked out!', {
        description: 'Your event end time has been recorded',
        duration: 4000,
      });
      queryClient.invalidateQueries({ queryKey: eventQueryKeys.all });
    },
    onError: (error: Error) => {
      // Always refetch so the UI reflects the true DB state
      queryClient.invalidateQueries({ queryKey: eventQueryKeys.all });
      toast.error('Failed to clock out', {
        description: error.message || 'Please try again',
        duration: 5000,
      });
    },
  });
};
