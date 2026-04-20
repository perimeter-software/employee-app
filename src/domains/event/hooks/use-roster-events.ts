import { useQuery } from '@tanstack/react-query';
import { EventApiService, eventQueryKeys, RosterEventsParams } from '../services';

export const useRosterEvents = (params: RosterEventsParams) => {
  return useQuery({
    queryKey: eventQueryKeys.roster(params),
    queryFn: () => EventApiService.getRosterEvents(params),
    enabled: !!params.applicantId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
};
