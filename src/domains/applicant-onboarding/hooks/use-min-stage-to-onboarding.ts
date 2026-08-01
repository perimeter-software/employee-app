'use client';

// Ported from stadium-people/src/hooks/useMinStageToOnboarding.
import { useMemo } from 'react';
import { usePrimaryCompany } from '@/domains/company/hooks/use-primary-company';

const DEFAULT_MIN_STAGE = 'Screened';
const ALL_STAGES = ['New', 'ATC', 'Screened', 'Pre-Hire'] as const;

export interface MinStageToOnboarding {
  minStage: string;
  allowedStages: string[];
  disallowedStages: string[];
}

export function useMinStageToOnboarding(): MinStageToOnboarding {
  const { data: company } = usePrimaryCompany();
  const minStage =
    (company as { minStageToOnboarding?: string } | undefined)?.minStageToOnboarding ??
    DEFAULT_MIN_STAGE;

  const [allowedStages, disallowedStages] = useMemo(() => {
    const allowed: string[] = [];
    const disallowed: string[] = ['Declined'];
    let found = false;
    for (const stage of ALL_STAGES) {
      if (stage === minStage) found = true;
      if (found) allowed.push(stage);
      else disallowed.push(stage);
    }
    return [allowed, disallowed];
  }, [minStage]);

  return { minStage, allowedStages, disallowedStages };
}
