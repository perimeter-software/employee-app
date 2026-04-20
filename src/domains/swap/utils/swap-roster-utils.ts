import 'server-only';

import type { Db } from 'mongodb';
import { convertToJSON } from '@/lib/utils/mongo-utils';
import type { GignologyJob } from '@/domains/job/types/job.types';
import type { RosterEntry } from '@/domains/job/types/schedule.types';
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
export type DayKey = (typeof DAY_KEYS)[number];

export function isDayKey(s: string): s is DayKey {
  return (DAY_KEYS as readonly string[]).includes(s);
}

export function toDayKey(dayOfWeek: string): DayKey | null {
  const k = dayOfWeek.trim().toLowerCase();
  return isDayKey(k) ? k : null;
}

/** Normalize legacy roster entries (string id vs object) for safe pull/push. */
export function rosterEntryToObject(
  entry: string | RosterEntry
): { employeeId: string; rest: Partial<RosterEntry> } {
  if (typeof entry === 'string') {
    return { employeeId: entry, rest: {} };
  }
  return {
    employeeId: String(entry.employeeId),
    rest: { ...entry },
  };
}

export function rosterEntryMatches(
  entry: string | RosterEntry,
  employeeId: string,
  date: string
): boolean {
  if (typeof entry === 'string') {
    return entry === employeeId;
  }
  return entry.employeeId === employeeId && entry.date === date;
}

export async function findJobByJobSlug(
  db: Db,
  jobSlug: string
): Promise<GignologyJob | null> {
  const doc = await db.collection('jobs').findOne(
    { jobSlug },
    {
      projection: {
        _id: 1,
        jobSlug: 1,
        title: 1,
        shifts: 1,
        additionalConfig: 1,
      },
    }
  );
  return doc ? (convertToJSON(doc) as GignologyJob) : null;
}

function parseIsoMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

export function timeRangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  const as = parseIsoMs(aStart);
  const ae = parseIsoMs(aEnd);
  const bs = parseIsoMs(bStart);
  const be = parseIsoMs(bEnd);
  if (!as || !ae || !bs || !be) return false;
  return as < be && bs < ae;
}

type Assignment = {
  shiftSlug: string;
  dayKey: DayKey;
  date: string;
  start: string;
  end: string;
  raw: string | RosterEntry;
};

/** All roster hits for an employee on a calendar date (YYYY-MM-DD) across the job. */
export function listAssignmentsOnDate(
  job: GignologyJob,
  employeeId: string,
  date: string
): Assignment[] {
  const out: Assignment[] = [];
  for (const shift of job.shifts || []) {
    const slug = shift.slug;
    for (const dk of DAY_KEYS) {
      const sched = shift.defaultSchedule?.[dk];
      if (!sched?.roster?.length) continue;
      const start = sched.start;
      const end = sched.end;
      for (const raw of sched.roster) {
        if (typeof raw === 'string') {
          if (raw === employeeId && date) {
            /* recurring string id — skip date-specific overlap; rare */
          }
          continue;
        }
        if (raw.employeeId === employeeId && raw.date === date) {
          out.push({
            shiftSlug: slug,
            dayKey: dk,
            date,
            start,
            end,
            raw,
          });
        }
      }
    }
  }
  return out;
}

/**
 * Before approve (swap): exclude each party’s current roster cell when checking the destination day.
 */
export function validateSwapOverlap(
  job: GignologyJob,
  shiftSlug: string,
  fromEmployeeId: string,
  toEmployeeId: string,
  fromShiftDay: ShiftDaySnapshot,
  toShiftDay: ShiftDaySnapshot
): void {
  const fromKey = toDayKey(fromShiftDay.dayOfWeek);
  const toKey = toDayKey(toShiftDay.dayOfWeek);
  if (!fromKey || !toKey) throw new Error('invalid dayOfWeek');

  for (const a of listAssignmentsOnDate(job, fromEmployeeId, toShiftDay.date)) {
    if (
      a.shiftSlug === shiftSlug &&
      a.dayKey === fromKey &&
      a.date === fromShiftDay.date
    ) {
      continue;
    }
    if (timeRangesOverlap(a.start, a.end, toShiftDay.start, toShiftDay.end)) {
      throw new Error(
        `overlap: initiator has conflicting work on ${toShiftDay.date}`
      );
    }
  }

  for (const b of listAssignmentsOnDate(job, toEmployeeId, fromShiftDay.date)) {
    if (
      b.shiftSlug === shiftSlug &&
      b.dayKey === toKey &&
      b.date === toShiftDay.date
    ) {
      continue;
    }
    if (timeRangesOverlap(b.start, b.end, fromShiftDay.start, fromShiftDay.end)) {
      throw new Error(
        `overlap: peer has conflicting work on ${fromShiftDay.date}`
      );
    }
  }
}

/**
 * True if the assignee already works another shift on the same calendar day whose
 * hours overlap the target shift (excluding the target shift’s own roster cell).
 * Used for pickup interest and giveaway recipient checks.
 */
export function assigneeHasScheduleConflictForShiftDay(
  job: GignologyJob,
  targetShiftSlug: string,
  assigneeId: string,
  targetShiftDay: ShiftDaySnapshot
): boolean {
  const fromKey = toDayKey(targetShiftDay.dayOfWeek);
  if (!fromKey) return false;

  for (const x of listAssignmentsOnDate(job, assigneeId, targetShiftDay.date)) {
    if (
      x.shiftSlug === targetShiftSlug &&
      x.dayKey === fromKey &&
      x.date === targetShiftDay.date
    ) {
      continue;
    }
    if (
      timeRangesOverlap(x.start, x.end, targetShiftDay.start, targetShiftDay.end)
    ) {
      return true;
    }
  }
  return false;
}

export function validateGiveawayOverlap(
  job: GignologyJob,
  shiftSlug: string,
  toEmployeeId: string,
  fromShiftDay: ShiftDaySnapshot
): void {
  if (
    assigneeHasScheduleConflictForShiftDay(
      job,
      shiftSlug,
      toEmployeeId,
      fromShiftDay
    )
  ) {
    throw new Error(
      `overlap: assignee has conflicting work on ${fromShiftDay.date}`
    );
  }
}

function stripEntryForInsert(
  entry: RosterEntry,
  newDate: string,
  newEmployeeId: string
): RosterEntry {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { employeeId: _e, date: _d, ...rest } = entry;
  return {
    ...rest,
    employeeId: newEmployeeId,
    date: newDate,
    status: entry.status === 'pending' ? 'approved' : entry.status,
  };
}

/**
 * Apply true swap on one shift: A <-> B between two shift-days.
 * Only mutates `defaultSchedule[*].roster`, not `shiftRoster`.
 */
export async function applySwapToRosters(
  db: Db,
  jobSlug: string,
  shiftSlug: string,
  fromEmployeeId: string,
  toEmployeeId: string,
  fromShiftDay: ShiftDaySnapshot,
  toShiftDay: ShiftDaySnapshot
): Promise<void> {
  const fromKey = toDayKey(fromShiftDay.dayOfWeek);
  const toKey = toDayKey(toShiftDay.dayOfWeek);
  if (!fromKey || !toKey) throw new Error('invalid dayOfWeek');

  const jobDoc = await db.collection('jobs').findOne({ jobSlug });
  if (!jobDoc) throw new Error('job not found');
  const job = convertToJSON(jobDoc) as GignologyJob;
  const shift = job.shifts?.find((s) => s.slug === shiftSlug);
  if (!shift?.defaultSchedule) throw new Error('shift not found');

  const fromSched = shift.defaultSchedule[fromKey];
  const toSched = shift.defaultSchedule[toKey];
  const fromRoster = [...(fromSched.roster || [])] as Array<string | RosterEntry>;
  const toRoster = [...(toSched.roster || [])] as Array<string | RosterEntry>;

  let entryA: RosterEntry | null = null;
  let idxA = -1;
  fromRoster.forEach((raw, i) => {
    if (rosterEntryMatches(raw, fromEmployeeId, fromShiftDay.date)) {
      const o = rosterEntryToObject(raw as string | RosterEntry);
      entryA = { employeeId: o.employeeId, date: fromShiftDay.date, ...o.rest } as RosterEntry;
      idxA = i;
    }
  });
  let entryB: RosterEntry | null = null;
  let idxB = -1;
  toRoster.forEach((raw, i) => {
    if (rosterEntryMatches(raw, toEmployeeId, toShiftDay.date)) {
      const o = rosterEntryToObject(raw as string | RosterEntry);
      entryB = { employeeId: o.employeeId, date: toShiftDay.date, ...o.rest } as RosterEntry;
      idxB = i;
    }
  });

  if (!entryA || idxA < 0) throw new Error('initiator roster entry not found');
  if (!entryB || idxB < 0) throw new Error('peer roster entry not found');

  const newFrom = fromRoster.filter((_, i) => i !== idxA);
  const newTo = toRoster.filter((_, i) => i !== idxB);

  const insertB = stripEntryForInsert(entryB, fromShiftDay.date, toEmployeeId);
  const insertA = stripEntryForInsert(entryA, toShiftDay.date, fromEmployeeId);

  newFrom.push(insertB);
  newTo.push(insertA);

  await db.collection('jobs').updateOne(
    { jobSlug },
    {
      $set: {
        [`shifts.$[s].defaultSchedule.${fromKey}.roster`]: newFrom,
        [`shifts.$[s].defaultSchedule.${toKey}.roster`]: newTo,
      },
    },
    { arrayFilters: [{ 's.slug': shiftSlug }] }
  );
}

/** Giveaway / pickup: remove `from` from `fromShiftDay`, add `toEmployee` to same slot. */
export async function applyGiveawayToRoster(
  db: Db,
  jobSlug: string,
  shiftSlug: string,
  fromEmployeeId: string,
  toEmployeeId: string,
  fromShiftDay: ShiftDaySnapshot
): Promise<void> {
  const fromKey = toDayKey(fromShiftDay.dayOfWeek);
  if (!fromKey) throw new Error('invalid dayOfWeek');

  const jobDoc = await db.collection('jobs').findOne({ jobSlug });
  if (!jobDoc) throw new Error('job not found');
  const job = convertToJSON(jobDoc) as GignologyJob;
  const shift = job.shifts?.find((s) => s.slug === shiftSlug);
  if (!shift?.defaultSchedule) throw new Error('shift not found');

  const fromSched = shift.defaultSchedule[fromKey];
  const fromRoster = [...(fromSched.roster || [])] as Array<string | RosterEntry>;
  let entryA: RosterEntry | null = null;
  let idxA = -1;
  fromRoster.forEach((raw, i) => {
    if (rosterEntryMatches(raw, fromEmployeeId, fromShiftDay.date)) {
      const o = rosterEntryToObject(raw as string | RosterEntry);
      entryA = { employeeId: o.employeeId, date: fromShiftDay.date, ...o.rest } as RosterEntry;
      idxA = i;
    }
  });
  if (!entryA || idxA < 0) throw new Error('initiator roster entry not found');

  const newFrom = fromRoster.filter((_, i) => i !== idxA);
  const giveTo = stripEntryForInsert(entryA, fromShiftDay.date, toEmployeeId);
  giveTo.employeeId = toEmployeeId;
  giveTo.date = fromShiftDay.date;
  newFrom.push(giveTo);

  await db.collection('jobs').updateOne(
    { jobSlug },
    {
      $set: {
        [`shifts.$[s].defaultSchedule.${fromKey}.roster`]: newFrom,
      },
    },
    { arrayFilters: [{ 's.slug': shiftSlug }] }
  );
}
