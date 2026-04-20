'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  EventApiService,
  EventClockPayload,
  eventQueryKeys,
} from '../services';
import { handleLocationServices, parseClockInCoordinates } from '@/lib/utils';

interface ClockMutationVars {
  eventId: string;
  payload: EventClockPayload;
  /** Pass event.geoFence so the hook can enforce location collection before calling the API */
  geoFence?: string;
}

export const useEventClockIn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventId, payload, geoFence }: ClockMutationVars) => {
      const loadingId = toast.loading('Clocking in...', {
        description: 'Recording your time',
      });
      try {
        // Collect geolocation. For geofenced events it is mandatory; for others
        // we pass it opportunistically so the backend can log it.
        const { locationInfo } = await handleLocationServices();
        const coordinates = locationInfo
          ? parseClockInCoordinates(locationInfo)
          : null;

        if (!coordinates && geoFence === 'Yes') {
          throw new Error(
            'Unable to determine your location. Please enable location services and try again.'
          );
        }

        const result = await EventApiService.clockIn(eventId, {
          ...payload,
          coordinates: coordinates ?? undefined,
        });
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
    onError: (
      error: Error & { apiResponse?: { error?: string; message?: string } }
    ) => {
      // Always refetch so the UI reflects the true DB state
      queryClient.invalidateQueries({ queryKey: eventQueryKeys.all });

      const errorCode = error.apiResponse?.error;
      const apiMessage = error.apiResponse?.message || error.message;

      let title = 'Failed to clock in';
      let description = apiMessage || 'Please try again';

      if (errorCode === 'outside-geofence') {
        title = 'Outside Geofence';
        description =
          'You are outside the required location. Please move closer and try again.';
      } else if (errorCode === 'coordinates-required') {
        title = 'Location Required';
        description =
          'This event requires location access. Please enable location services and try again.';
      }

      toast.error(title, { description, duration: 5000 });
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
        // Collect coordinates opportunistically — never blocks clock-out if unavailable
        const { locationInfo } = await handleLocationServices();
        const coordinates = locationInfo
          ? parseClockInCoordinates(locationInfo)
          : null;

        const result = await EventApiService.clockOut(eventId, {
          ...payload,
          coordinates: coordinates ?? undefined,
        });
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
