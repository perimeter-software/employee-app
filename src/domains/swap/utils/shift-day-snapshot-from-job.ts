import type { GignologyJob } from '@/domains/job/types/job.types';
import type { ShiftDaySnapshot } from '@/domains/swap/types';

const DAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

/** Calendar day key (lowercase) for a YYYY-MM-DD in local time. */
export function dayKeyFromYmd(dateYmd: string): (typeof DAY_KEYS)[number] | null {
  const parts = dateYmd.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, mo, d] = parts;
  const local = new Date(y, mo - 1, d);
  const idx = local.getDay();
  return DAY_KEYS[idx] ?? null;
}

export function combineDateAndScheduleIso(
  dateYmd: string,
  scheduleIso: string
): string {
  const t = new Date(scheduleIso);
  if (Number.isNaN(t.getTime()))
    return new Date(`${dateYmd}T00:00:00`).toISOString();
  const combined = new Date(`${dateYmd}T00:00:00`);
  combined.setHours(t.getHours(), t.getMinutes(), 0, 0);
  return combined.toISOString();
}

/** Build roster snapshot from job schedule for a shift slug + calendar date. */
export function buildShiftDaySnapshotFromJob(
  job: GignologyJob,
  shiftSlug: string,
  dateYmd: string
): ShiftDaySnapshot | null {
  const dk = dayKeyFromYmd(dateYmd);
  if (!dk) return null;
  const shift = job.shifts?.find((s) => s.slug === shiftSlug);
  if (!shift?.defaultSchedule) return null;
  const sched = shift.defaultSchedule[dk];
  if (!sched?.start || !sched?.end) return null;
  const start = combineDateAndScheduleIso(dateYmd, sched.start);
  let end = combineDateAndScheduleIso(dateYmd, sched.end);
  if (Date.parse(end) <= Date.parse(start)) {
    end = new Date(Date.parse(end) + 24 * 60 * 60 * 1000).toISOString();
  }
  return {
    date: dateYmd,
    dayOfWeek: dk,
    start,
    end,
  };
}
