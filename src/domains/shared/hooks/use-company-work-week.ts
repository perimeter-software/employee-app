import { usePrimaryCompany } from '@/domains/company/hooks/use-primary-company';
import { getWeekStartsOnFromWorkWeek } from '@/lib/utils/date-utils';

/**
 * Hook to get the company's work week setting and corresponding weekStartsOn value
 * @returns Object with workWeek string and weekStartsOn number for date-fns
 */
export function useCompanyWorkWeek() {
  const { data: primaryCompany } = usePrimaryCompany();

  const workWeek = primaryCompany?.timeClockSettings?.workWeek;
  const weekStartsOn = getWeekStartsOnFromWorkWeek(workWeek);

  return {
    workWeek,
    weekStartsOn,
    isLoading: !primaryCompany,
  };
}
