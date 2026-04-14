// Ported from stadium-people/src/utils/constants/venues.jsx
// Dynamic state tax form step generation used to splice per-state W-4 style steps
// into the registration step list based on the applicant's required tax states.
import type { RegistrationStep } from '../types';

export interface StateTaxFormStep extends RegistrationStep {
  stateCode: string;
  stateName: string;
}

export function createStateTaxFormStep(
  stateCode: string,
  stateName: string,
  id: number
): StateTaxFormStep {
  return {
    id,
    label: `State Tax Form - ${stateCode}`,
    applicantObject: `${stateCode.toLowerCase()}StateTaxForm` as StateTaxFormStep['applicantObject'],
    iconKey: 'request',
    stateCode,
    stateName,
  };
}

export function createStateTaxFormSteps(
  stateCodes: string[],
  stateNames: Record<string, string> = {},
  startId = 33
): StateTaxFormStep[] {
  return stateCodes.map((code, i) =>
    createStateTaxFormStep(code, stateNames[code] ?? code, startId + i)
  );
}

// Supported states — mirrors stadium-people's VENUE_STATE_TAX_FORM_STEPS keys.
export const SUPPORTED_TAX_STATES: readonly string[] = [
  'AL', 'AZ', 'AR', 'CA', 'CT', 'GA', 'HI', 'IL', 'IN', 'IA', 'KS', 'KY',
  'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'NJ', 'NY', 'NC', 'OH',
  'OK', 'OR', 'RI', 'SC', 'VT', 'VA', 'WV', 'WI', 'DC', 'PA',
];

export const VENUE_STATE_TAX_FORM_STEPS: Record<string, StateTaxFormStep> =
  SUPPORTED_TAX_STATES.reduce<Record<string, StateTaxFormStep>>((acc, code, i) => {
    acc[code] = createStateTaxFormStep(code, code, 33 + i);
    return acc;
  }, {});
