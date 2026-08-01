import { useQuery } from '@tanstack/react-query';
import { EventApiService, eventQueryKeys, RosterEventsParams } from '../services';

export interface RosterEventsOptions {
  /**
   * Override the inherited `refetchOnMount: false`. Pass `'always'` on screens where
   * arriving should show fresh numbers (e.g. the Home stat cards). Callers that omit
   * it keep the cached-until-stale behaviour.
   */
  refetchOnMount?: boolean | 'always';
}

export const useRosterEvents = (
  params: RosterEventsParams,
  options: RosterEventsOptions = {}
) => {
  return useQuery({
    queryKey: eventQueryKeys.roster(params),
    queryFn: () => EventApiService.getRosterEvents(params),
    enabled: !!params.applicantId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    ...options,
  });
};
