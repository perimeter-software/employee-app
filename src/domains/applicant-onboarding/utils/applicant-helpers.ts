// Ported from stadium-people/src/utils/helpers/applicant.
import { differenceInYears } from 'date-fns';
import type { ApplicantRecord } from '../types';
import { SUPPORTED_TAX_STATES } from './state-tax-forms';

interface ApplicantVenueAssignment {
  venueSlug: string;
  status: string;
  [k: string]: unknown;
}
interface ApplicantJobAssignment {
  jobSlug: string;
  status: string;
  [k: string]: unknown;
}

export function isUnder18(birthDate?: string | Date | null): boolean {
  if (!birthDate) return false;
  const d = typeof birthDate === 'string' ? new Date(birthDate) : birthDate;
  if (Number.isNaN(d.getTime())) return false;
  return differenceInYears(new Date(), d) < 18;
}

export function getApplicantVenueStatus(
  applicant: ApplicantRecord | null | undefined,
  venueSlug: string
): ApplicantVenueAssignment | undefined {
  return (applicant?.venues as ApplicantVenueAssignment[] | undefined)?.find(
    (v) => v.venueSlug === venueSlug
  );
}

export function getApplicantJobStatus(
  applicant: ApplicantRecord | null | undefined,
  jobSlug: string
): ApplicantJobAssignment | undefined {
  return (applicant?.jobs as ApplicantJobAssignment[] | undefined)?.find(
    (j) => j.jobSlug === jobSlug
  );
}

// Ported from stadium-people/src/utils/helpers/applicant.getApplicantRequiredTaxStates.
// Returns supported 2-letter state codes that require tax forms for the applicant.
interface VenueLookup {
  [slug: string]: { state?: string } | undefined;
}

export function getApplicantRequiredTaxStates(
  applicant: ApplicantRecord | null | undefined,
  venues: VenueLookup | null | undefined
): string[] {
  const required = new Set<string>();
  const a = applicant as (ApplicantRecord & {
    state?: string;
    jobs?: Array<{ venueState?: string; companyState?: string }>;
  }) | null | undefined;

  if (a?.state) required.add(a.state);
  (a?.venues as ApplicantVenueAssignment[] | undefined)?.forEach((v) => {
    const venueState = venues?.[v.venueSlug]?.state;
    if (venueState) required.add(venueState);
  });
  (a?.jobs as Array<{ venueState?: string; companyState?: string }> | undefined)?.forEach((j) => {
    if (j.venueState) required.add(j.venueState);
    if (j.companyState) required.add(j.companyState);
  });

  return Array.from(required).filter((s) => SUPPORTED_TAX_STATES.includes(s));
}

export function parseApplicantPhone(phone: string | undefined | null): string {
  if (!phone) return '';
  if (phone.length === 11) {
    return `(${phone.slice(1, 4)}) ${phone.slice(4, 7)} ${phone.slice(7, 11)}`;
  }
  return phone;
}

// Ported from stadium-people/src/utils/helpers/formHelpers.getDirtyFields
export function getDirtyFieldValues<T extends Record<string, unknown>>(
  dirty: Partial<Record<keyof T, unknown>>,
  values: T
): Partial<T> {
  const out: Partial<T> = {};
  (Object.keys(dirty) as (keyof T)[]).forEach((k) => {
    const flag = dirty[k];
    if (flag && typeof flag === 'object') {
      const nested = getDirtyFieldValues(
        flag as Record<string, unknown>,
        values[k] as Record<string, unknown>
      );
      if (Object.keys(nested).length) {
        (out as Record<string, unknown>)[k as string] = nested;
      }
    } else if (flag) {
      out[k] = values[k];
    }
  });
  return out;
}
