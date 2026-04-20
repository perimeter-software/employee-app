import type { GignologyJob } from '@/domains/job/types/job.types';
import { buildShiftDaySnapshotFromJob } from '@/domains/swap/utils/shift-day-snapshot-from-job';

/** Inclusive YYYY-MM-DD range as array (local noon stepping, matches swap service). */
export function eachYmdInRange(startYmd: string, endYmd: string): string[] {
  if (startYmd > endYmd) return [];
  const out: string[] = [];
  const start = Date.parse(`${startYmd}T12:00:00`);
  const end = Date.parse(`${endYmd}T12:00:00`);
  if (Number.isNaN(start) || Number.isNaN(end)) return [];
  for (let t = start; t <= end; t += 86400000) {
    const d = new Date(t);
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    );
  }
  return out;
}

export function todayYmdLocal(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

/**
 * True when this calendar day has a scheduled shift start at least `minLeadHours`
 * from now (same rule as `assertSwapLeadTimeAtLeastHours` on the server).
 */
export function shiftDayMeetsSwapLead(
  job: GignologyJob,
  shiftSlug: string,
  ymd: string,
  minLeadHours: number
): boolean {
  const snap = buildShiftDaySnapshotFromJob(job, shiftSlug, ymd);
  if (!snap?.start) return false;
  if (ymd < todayYmdLocal()) return false;
  const startMs = Date.parse(snap.start);
  if (Number.isNaN(startMs)) return false;
  const hoursUntilShift = (startMs - Date.now()) / (1000 * 60 * 60);
  return hoursUntilShift >= minLeadHours;
}

export function listYmdInRangeMeetingSwapLead(
  job: GignologyJob,
  shiftSlug: string,
  rangeStart: string,
  rangeEnd: string,
  minLeadHours: number
): string[] {
  return eachYmdInRange(rangeStart, rangeEnd).filter((ymd) =>
    shiftDayMeetsSwapLead(job, shiftSlug, ymd, minLeadHours)
  );
}

/** `startYmd` + `dayCount` calendar days (local noon), returns YYYY-MM-DD. */
export function addCalendarDaysToYmd(startYmd: string, dayCount: number): string {
  const start = Date.parse(`${startYmd}T12:00:00`);
  if (Number.isNaN(start)) return startYmd;
  const t = start + dayCount * 86400000;
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * First calendar day at or after `fromYmd` within `maxForwardDays` where this
 * shift meets the advance-notice rule (for date-picker bounds beyond “table week”).
 */
export function firstForwardYmdMeetingSwapLead(
  job: GignologyJob,
  shiftSlug: string,
  minLeadHours: number,
  fromYmd: string,
  maxForwardDays: number
): string | null {
  const endYmd = addCalendarDaysToYmd(fromYmd, maxForwardDays);
  for (const ymd of eachYmdInRange(fromYmd, endYmd)) {
    if (shiftDayMeetsSwapLead(job, shiftSlug, ymd, minLeadHours)) return ymd;
  }
  return null;
}
