import { useMemo } from 'react';
import { usePrimaryCompany } from '@/domains/company/hooks/use-primary-company';
import { getWeekStartsOnFromWorkWeek } from '@/lib/utils/date-utils';

/**
 * Hook to get the company's work week setting and corresponding weekStartsOn value
 * @returns Object with workWeek string and weekStartsOn number for date-fns
 */
export function useCompanyWorkWeek() {
  const { data: primaryCompany } = usePrimaryCompany();

  // ERROR-PROOF: Memoize workWeek to prevent infinite loops
  const workWeek = useMemo(
    () => primaryCompany?.timeClockSettings?.workWeek,
    [primaryCompany?.timeClockSettings?.workWeek]
  );

  // ERROR-PROOF: Memoize weekStartsOn calculation to prevent calling getWeekStartsOnFromWorkWeek on every render
  const weekStartsOn = useMemo(
    () => getWeekStartsOnFromWorkWeek(workWeek),
    [workWeek]
  );

  return {
    workWeek,
    weekStartsOn,
    isLoading: !primaryCompany,
  };
}
