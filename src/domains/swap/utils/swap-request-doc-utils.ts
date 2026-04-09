import 'server-only';

import type { GignologyJob } from '@/domains/job/types/job.types';
import type { ShiftDaySnapshot } from '@/domains/swap/types';
import {
  buildShiftDaySnapshotFromJob,
  combineDateAndScheduleIso,
} from '@/domains/swap/utils/shift-day-snapshot-from-job';
import { toDayKey } from '@/domains/swap/utils/swap-roster-utils';

export { dayKeyFromYmd, buildShiftDaySnapshotFromJob } from '@/domains/swap/utils/shift-day-snapshot-from-job';

/** Fill missing start/end on a snapshot from live schedule. */
export function enrichShiftDayFromSchedule(
  job: GignologyJob,
  shiftSlug: string,
  snap: ShiftDaySnapshot
): ShiftDaySnapshot {
  const dk = toDayKey(snap.dayOfWeek);
  const shift = job.shifts?.find((s) => s.slug === shiftSlug);
  if (!shift?.defaultSchedule || !dk) return snap;
  const sched = shift.defaultSchedule[dk];
  if (!sched?.start || !sched?.end) return snap;
  return {
    ...snap,
    start: snap.start || combineDateAndScheduleIso(snap.date, sched.start),
    end:
      snap.end ||
      (() => {
        let e = combineDateAndScheduleIso(snap.date, sched.end);
        const s = snap.start || combineDateAndScheduleIso(snap.date, sched.start);
        if (Date.parse(e) <= Date.parse(s)) {
          e = new Date(Date.parse(e) + 24 * 60 * 60 * 1000).toISOString();
        }
        return e;
      })(),
  };
}

/** Stored shape may be flat (new) or nested + shiftSlug (legacy). */
export type SwapRequestStoredDoc = {
  jobSlug: string;
  fromEmployeeId: string;
  type: string;
  status: string;
  fromShiftSlug?: string;
  fromShiftDate?: string;
  shiftSlug?: string;
  fromShiftDay?: ShiftDaySnapshot;
  toShiftSlug?: string | null;
  toShiftDate?: string | null;
  toShiftDay?: ShiftDaySnapshot | null;
  toEmployeeId?: string | null;
};

export function getFromShiftSlug(d: SwapRequestStoredDoc): string {
  return (d.fromShiftSlug || d.shiftSlug || '').trim();
}

export function getFromShiftDate(d: SwapRequestStoredDoc): string {
  return (d.fromShiftDate || d.fromShiftDay?.date || '').trim();
}

export function getToShiftSlug(d: SwapRequestStoredDoc): string | null {
  if (d.toShiftSlug != null && String(d.toShiftSlug).trim() !== '') {
    return String(d.toShiftSlug).trim();
  }
  if (d.toShiftDay && d.shiftSlug) {
    return String(d.shiftSlug).trim();
  }
  return null;
}

export function getToShiftDate(d: SwapRequestStoredDoc): string | null {
  if (d.toShiftDate != null && String(d.toShiftDate).trim() !== '') {
    return String(d.toShiftDate).trim();
  }
  if (d.toShiftDay?.date) {
    return String(d.toShiftDay.date).trim();
  }
  return null;
}

export function resolveFromShiftDaySnapshot(
  job: GignologyJob,
  d: SwapRequestStoredDoc
): ShiftDaySnapshot | null {
  const slug = getFromShiftSlug(d);
  const date = getFromShiftDate(d);
  if (
    d.fromShiftDay?.date &&
    d.fromShiftDay?.dayOfWeek &&
    toDayKey(d.fromShiftDay.dayOfWeek)
  ) {
    return enrichShiftDayFromSchedule(job, slug, d.fromShiftDay);
  }
  if (slug && date) {
    return buildShiftDaySnapshotFromJob(job, slug, date);
  }
  return null;
}

export function resolveToShiftDaySnapshot(
  job: GignologyJob,
  d: SwapRequestStoredDoc
): ShiftDaySnapshot | null {
  const slug = getToShiftSlug(d) || getFromShiftSlug(d);
  const date = getToShiftDate(d);
  if (d.toShiftDay?.date && d.toShiftDay?.dayOfWeek) {
    return enrichShiftDayFromSchedule(job, slug, d.toShiftDay);
  }
  if (slug && date) {
    return buildShiftDaySnapshotFromJob(job, slug, date);
  }
  return null;
}

export function normalizeResolutionForApi(
  r: string | null | undefined
): 'approved' | 'rejected' | 'expired' | null {
  if (r == null || r === '') return null;
  if (r === 'approved' || r === 'rejected' || r === 'expired') return r;
  return null;
}
