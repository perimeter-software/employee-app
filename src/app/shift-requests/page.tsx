'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { format, parseISO, getDay, isAfter, startOfWeek, addWeeks } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { CalendarDays, Clock } from 'lucide-react';
import { formatTime as formatTimeTz, getUserTimeZone } from '@/lib/utils';

import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/Dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/ToggleGroup';
import { Table } from '@/components/ui/Table';
import { TableColumn } from '@/components/ui/Table/types';

import { useCurrentUser } from '@/domains/user';
import { useUserApplicantJob } from '@/domains/job/hooks';
import { toast } from 'sonner';
import type { GignologyJob, Shift } from '@/domains/job';
import type {
  RosterEntry,
  RosterEntryStatus,
} from '@/domains/job/types/schedule.types';
import { clsxm } from '@/lib/utils';

type DayKey =
  | 'sunday'
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday';

const DAY_KEYS: DayKey[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];

const dayLabel = (day: DayKey) =>
  day.charAt(0).toUpperCase() + day.slice(1).toLowerCase();

type RequestStatus = RosterEntryStatus;

const DEFAULT_TZ = 'America/Chicago';
const ALL_JOBS_ID = '__all__';

type ShiftSummary = {
  slug: string;
  shiftName: string;
  shiftStartDate: string;
  shiftEndDate: string;
};

type ShiftWithJob = { job: GignologyJob; summary: ShiftSummary };

/**
 * Today at start-of-day in the browser/user's timezone (fallback America/Chicago).
 * Use this for all "today" and min-date logic so the shift-request flow respects the user's timezone.
 */
function getTodayInUserTz(): Date {
  try {
    const tz = getUserTimeZone?.() ?? DEFAULT_TZ;
    const now = new Date();
    const zoned = toZonedTime(now, tz);
    return new Date(zoned.getFullYear(), zoned.getMonth(), zoned.getDate());
  } catch {
    return new Date(new Date().setHours(0, 0, 0, 0));
  }
}

type MyRequestRow = {
  id: string;
  jobId: string;
  shiftSlug: string;
  jobTitle: string;
  shiftName: string;
  dayOfWeek: DayKey;
  date: string | null;
  isRecurring: boolean;
  status: RequestStatus;
  source: 'schedule' | 'request';
  windowLabel: string;
  /** Used for table actions column */
  actions?: unknown;
};

function buildAssignedJobs(jobs: GignologyJob[] | undefined): GignologyJob[] {
  if (!jobs?.length) return [];
  return jobs.filter((job) => job.status === 'On Assignment');
}

function buildShiftSummaries(job: GignologyJob | undefined): ShiftSummary[] {
  if (!job?.shifts?.length) return [];
  const today = getTodayInUserTz();
  const todayYmd = format(today, 'yyyy-MM-dd');

  // Only include shifts whose end date is today or in the future (user timezone)
  return job.shifts
    .filter((shift) => {
      const end = new Date(shift.shiftEndDate);
      if (Number.isNaN(end.getTime())) return false;
      const endYmd = format(end, 'yyyy-MM-dd');
      return endYmd >= todayYmd;
    })
    .map((shift) => ({
      slug: shift.slug,
      shiftName: shift.shiftName,
      shiftStartDate: shift.shiftStartDate,
      shiftEndDate: shift.shiftEndDate,
    }));
}

function buildMyRequests(jobs: GignologyJob[] | undefined, applicantId: string) {
  const rows: MyRequestRow[] = [];
  if (!jobs?.length) return rows;

  for (const job of jobs) {
    if (!job.shifts?.length) continue;

    for (const shift of job.shifts) {
      for (const dayKey of DAY_KEYS) {
        const schedule = shift.defaultSchedule?.[dayKey];
        if (!schedule) continue;

        const roster = schedule.roster as Array<string | RosterEntry>;
        if (!roster?.length) continue;

        for (const entry of roster) {
          if (typeof entry === 'string') {
            if (entry !== applicantId) continue;

            // Legacy recurring approved assignment
            const start = parseISO(shift.shiftStartDate);
            const end = parseISO(shift.shiftEndDate);

            const windowLabel = `${dayLabel(dayKey)} • ${format(
              start,
              'MMM d, yyyy'
            )} - ${format(end, 'MMM d, yyyy')}`;

            rows.push({
              id: `schedule-${job._id}-${shift.slug}-${dayKey}-recurring`,
              jobId: job._id,
              shiftSlug: shift.slug,
              jobTitle: job.title,
              shiftName: shift.shiftName,
              dayOfWeek: dayKey,
              date: null,
              isRecurring: true,
              status: 'approved',
              source: 'schedule',
              windowLabel,
            });
            continue;
          }

          if (entry.employeeId !== applicantId) continue;

          const status: RequestStatus = (entry.status ?? 'approved') as RequestStatus;
          const isRecurring = !entry.date;

          let windowLabel: string;
          if (entry.date) {
            const d = parseISO(entry.date);
            windowLabel = `${dayLabel(dayKey)} • ${format(d, 'MMM d, yyyy')}`;
          } else {
            const start = parseISO(shift.shiftStartDate);
            const end = parseISO(shift.shiftEndDate);
            windowLabel = `${dayLabel(dayKey)} • ${format(
              start,
              'MMM d, yyyy'
            )} - ${format(end, 'MMM d, yyyy')}`;
          }

          rows.push({
            id: `request-${job._id}-${shift.slug}-${dayKey}-${entry.date ?? 'recurring'}-${
              status || 'approved'
            }`,
            jobId: job._id,
            shiftSlug: shift.slug,
            jobTitle: job.title,
            shiftName: shift.shiftName,
            dayOfWeek: dayKey,
            date: entry.date ?? null,
            isRecurring,
            status,
            source: entry.status ? 'request' : 'schedule',
            windowLabel,
          });
        }
      }
    }
  }

  // De-duplicate identical rows, prefer explicit requests over schedule rows
  const map = new Map<string, MyRequestRow>();
  for (const row of rows) {
    const key = `${row.jobTitle}-${row.shiftName}-${row.dayOfWeek}-${row.date ?? 'all'}-${
      row.isRecurring ? 'recurring' : 'single'
    }`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, row);
    } else if (existing.source === 'schedule' && row.source === 'request') {
      map.set(key, row);
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    a.windowLabel.localeCompare(b.windowLabel)
  );
}

function statusBadge(status: RequestStatus | 'scheduled') {
  switch (status) {
    case 'pending':
      return (
        <Badge variant="outline" className="border-amber-400 text-amber-700">
          Pending
        </Badge>
      );
    case 'approved':
    case 'scheduled':
      return (
        <Badge variant="outline" className="border-emerald-500 text-emerald-700">
          Approved
        </Badge>
      );
    case 'rejected':
      return (
        <Badge variant="outline" className="border-rose-400 text-rose-700">
          Rejected
        </Badge>
      );
    case 'cancelled':
      return (
        <Badge variant="outline" className="border-gray-300 text-gray-600">
          Cancelled
        </Badge>
      );
    default:
      return null;
  }
}

type RequestModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: GignologyJob | null;
  shift: Shift | null;
  applicantId: string | undefined;
  onSubmit: (args: { dates: string[]; recurringDays: DayKey[] }) => Promise<void>;
};

const RequestShiftModal: React.FC<RequestModalProps> = ({
  open,
  onOpenChange,
  job,
  shift,
  applicantId,
  onSubmit,
}) => {
  const [dates, setDates] = useState<string[]>([]);
  const [recurringDays, setRecurringDays] = useState<DayKey[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [currentWeekStartMs, setCurrentWeekStartMs] = useState<number>(0);

  const shiftStart = job && shift ? parseISO(shift.shiftStartDate) : null;
  const shiftEnd = job && shift ? parseISO(shift.shiftEndDate) : null;
  const today = getTodayInUserTz(); // browser/user timezone for "today"
  const minSelectable =
    shiftStart && shiftEnd
      ? isAfter(shiftStart, today)
        ? shiftStart
        : today
      : null;

  // Per-day schedule time label (e.g. "12:00 AM – 5:00 AM") for day boxes.
  // Uses app timezone (getUserTimeZone via formatTime) so display matches rest of app.
  const scheduleTimeByDay = React.useMemo((): Record<DayKey, string> => {
    const out = {} as Record<DayKey, string>;
    if (!shift?.defaultSchedule) return out;
    for (const day of DAY_KEYS) {
      const schedule = shift.defaultSchedule[day];
      if (schedule?.start && schedule?.end) {
        try {
          const start = new Date(schedule.start);
          const end = new Date(schedule.end);
          if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
            out[day] = `${formatTimeTz(start, 'h:mm a')} – ${formatTimeTz(end, 'h:mm a')}`;
          }
        } catch {
          // ignore
        }
      }
    }
    return out;
  }, [shift?.defaultSchedule]);

  // Dates already requested by this user for this shift (from roster)
  const alreadyRequestedDateSet = React.useMemo(() => {
    const set = new Set<string>();
    if (!applicantId || !shift?.defaultSchedule) return set;
    for (const day of DAY_KEYS) {
      const schedule = shift.defaultSchedule[day];
      const roster = schedule?.roster;
      if (!Array.isArray(roster)) continue;
      for (const entry of roster) {
        if (typeof entry === 'string') continue;
        if (entry.employeeId === applicantId && entry.date) {
          set.add(entry.date);
        }
      }
    }
    return set;
  }, [applicantId, shift?.defaultSchedule]);

  // Days this shift runs (for filtering selectable dates to Mon–Sat that have schedule)
  const allowedRecurringDays = React.useMemo((): DayKey[] => {
    if (!shift?.defaultSchedule) return [];
    const out: DayKey[] = [];
    for (const day of DAY_KEYS) {
      const schedule = shift.defaultSchedule[day];
      if (schedule?.start && schedule?.end) out.push(day);
    }
    return out;
  }, [shift]);

  // Build flat list of selectable dates
  const selectableDateList = React.useMemo(() => {
    if (!minSelectable || !shiftEnd) return [];
    const list: string[] = [];
    const d = new Date(minSelectable.getTime());
    const end = new Date(shiftEnd);
    while (d <= end) {
      const dayKey = DAY_KEYS[getDay(d)];
      if (allowedRecurringDays.includes(dayKey)) {
        list.push(format(d, 'yyyy-MM-dd'));
      }
      d.setDate(d.getDate() + 1);
    }
    return list;
  }, [minSelectable, shiftEnd, allowedRecurringDays]);

  // Grid by week: rows = weeks, columns = Mon(0)..Sat(5). Sunday excluded so layout is Mon–Sat.
  const WEEKDAY_INDEX = (date: Date) => (getDay(date) + 6) % 7; // Mon=0 .. Sun=6
  const selectableDateGridFull = React.useMemo(() => {
    if (selectableDateList.length === 0) return [];
    const byWeek = new Map<number, (string | null)[]>();
    for (const dateStr of selectableDateList) {
      const d = parseISO(dateStr);
      const weekStart = startOfWeek(d, { weekStartsOn: 1 });
      const weekKey = weekStart.getTime();
      const dayIndex = WEEKDAY_INDEX(d);
      if (dayIndex === 6) continue; // skip Sunday so columns are Mon–Sat only
      if (!byWeek.has(weekKey)) {
        byWeek.set(weekKey, [null, null, null, null, null, null]);
      }
      const row = byWeek.get(weekKey)!;
      row[dayIndex] = dateStr;
    }
    const weekKeys = Array.from(byWeek.keys()).sort((a, b) => a - b);
    return weekKeys.map((weekKey) => ({
      weekStart: weekKey,
      days: byWeek.get(weekKey)!,
    }));
  }, [selectableDateList]);

  const firstWeekStartMs = minSelectable
    ? startOfWeek(minSelectable, { weekStartsOn: 1 }).getTime()
    : 0;
  const lastWeekStartMs = shiftEnd
    ? startOfWeek(shiftEnd, { weekStartsOn: 1 }).getTime()
    : 0;

  // Reset to first week when modal opens or shift changes
  useEffect(() => {
    if (!open || !firstWeekStartMs) return;
    setCurrentWeekStartMs(firstWeekStartMs);
  }, [open, firstWeekStartMs]);

  // Reset selection state when modal opens or when opening for a different job/shift
  useEffect(() => {
    if (!open) return;
    setDates([]);
    setRecurringDays([]);
  }, [open, job?._id, shift?.slug]);

  // Single week to display: use data from full grid or empty row for that week.
  // Match by week Monday date string so DST doesn't break lookup after a few weeks.
  const selectableDateGrid = React.useMemo(() => {
    if (!currentWeekStartMs) return [];
    const currentMondayStr = format(new Date(currentWeekStartMs), 'yyyy-MM-dd');
    const row = selectableDateGridFull.find((r) => {
      const rowMondayStr = format(new Date(r.weekStart), 'yyyy-MM-dd');
      return rowMondayStr === currentMondayStr;
    });
    if (row) return [row];
    return [{ weekStart: currentWeekStartMs, days: [null, null, null, null, null, null] }];
  }, [selectableDateGridFull, currentWeekStartMs]);

  const canGoPrev = currentWeekStartMs > firstWeekStartMs;
  const canGoNext = currentWeekStartMs < lastWeekStartMs;
  const goPrevWeek = () => {
    if (!canGoPrev) return;
    const prevMonday = addWeeks(new Date(currentWeekStartMs), -1);
    setCurrentWeekStartMs(startOfWeek(prevMonday, { weekStartsOn: 1 }).getTime());
  };
  const goNextWeek = () => {
    if (!canGoNext) return;
    const nextMonday = addWeeks(new Date(currentWeekStartMs), 1);
    setCurrentWeekStartMs(startOfWeek(nextMonday, { weekStartsOn: 1 }).getTime());
  };
  const currentWeekLabel = currentWeekStartMs
    ? format(new Date(currentWeekStartMs), 'MMM d, yyyy')
    : '';

  const toggleDateInGrid = (dateStr: string) => {
    if (dates.includes(dateStr)) {
      setDates((prev) => prev.filter((x) => x !== dateStr));
    } else {
      setDates((prev) => [...prev, dateStr].sort());
    }
  };

  const handleSubmit = async () => {
    if (dates.length === 0) return;

    setSubmitting(true);
    try {
      await onSubmit({ dates, recurringDays });
      setDates([]);
      setRecurringDays([]);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const hasAnySelection = dates.length > 0;

  if (!job || !shift) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[60vw] max-w-[60vw]">
        <DialogHeader>
          <DialogTitle className="text-lg">Request shift</DialogTitle>
          <DialogDescription className="text-sm">
            {job.title} — {shift.shiftName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-gray-600">
            Shift runs from{' '}
            <span className="font-medium">
              {format(parseISO(shift.shiftStartDate), 'MMM d, yyyy')}
            </span>{' '}
            to{' '}
            <span className="font-medium">
              {format(parseISO(shift.shiftEndDate), 'MMM d, yyyy')}
            </span>
            .
          </div>

          {minSelectable && shiftEnd && (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={goPrevWeek}
                    disabled={!canGoPrev}
                    className="h-9 w-9 shrink-0 p-0"
                    aria-label="Previous week"
                  >
                    <span className="text-lg leading-none">&lsaquo;</span>
                  </Button>
                  <span className="min-w-[180px] text-center text-sm font-medium text-slate-700">
                    Week of {currentWeekLabel}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={goNextWeek}
                    disabled={!canGoNext}
                    className="h-9 w-9 shrink-0 p-0"
                    aria-label="Next week"
                  >
                    <span className="text-lg leading-none">&rsaquo;</span>
                  </Button>
                </div>
              {selectableDateGrid.length > 0 ? (
                <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                  <div className="grid grid-cols-6 gap-4">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                      <div key={day} className="text-center text-xs font-medium text-slate-500">
                        {day}
                      </div>
                    ))}
                    {selectableDateGrid.flatMap((row) =>
                      row.days.map((dateStr, dayIndex) => {
                        if (!dateStr) {
                          return <div key={`${row.weekStart}-${dayIndex}`} className="min-h-[52px]" />;
                        }
                        const isAlreadyRequested = alreadyRequestedDateSet.has(dateStr);
                        const checked = dates.includes(dateStr) || isAlreadyRequested;
                        const d = parseISO(dateStr);
                        const dayKey = DAY_KEYS[getDay(d)];
                        const timeLabel = scheduleTimeByDay[dayKey];
                        return (
                          <label
                            key={dateStr}
                            className={clsxm(
                              'flex min-w-[10rem] items-center gap-2 rounded-md border px-2.5 py-2 transition-colors',
                              isAlreadyRequested && 'cursor-default bg-slate-100/80 border-slate-200',
                              !isAlreadyRequested && 'cursor-pointer hover:border-slate-300 hover:bg-slate-50',
                              checked && !isAlreadyRequested && 'border-appPrimary bg-appPrimary/10 text-appPrimary',
                              checked && isAlreadyRequested && 'border-slate-300 text-slate-600',
                              !checked && !isAlreadyRequested && 'border-slate-200 bg-white'
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={isAlreadyRequested}
                              onChange={() => !isAlreadyRequested && toggleDateInGrid(dateStr)}
                              className="h-5 w-5 shrink-0 rounded border-slate-300 text-appPrimary focus:ring-appPrimary disabled:opacity-70"
                            />
                            <div className="min-w-0 flex-1 text-left">
                              <div className="font-semibold text-base leading-tight">
                                {format(d, 'EEE')}
                              </div>
                              <div className="whitespace-nowrap text-xs leading-tight text-slate-500">
                                {format(d, 'd MMM yyyy')}
                              </div>
                              {timeLabel && (
                                <div className="mt-0.5 whitespace-nowrap text-[10px] leading-tight text-slate-400">
                                  {timeLabel}
                                </div>
                              )}
                              {isAlreadyRequested && (
                                <div className="text-[10px] font-medium text-slate-500 mt-0.5">Requested</div>
                              )}
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : null}
              {dates.length > 0 && (
                <div className="flex flex-wrap gap-2 text-sm">
                  {dates.map((d) => (
                    <span
                      key={d}
                      className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1"
                    >
                      {format(parseISO(d), 'MMM d, yyyy')}
                      <button
                        type="button"
                        className="text-slate-500 hover:text-slate-700"
                        onClick={() =>
                          setDates((prev) => prev.filter((x) => x !== d))
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!hasAnySelection || submitting}
            >
              {submitting ? 'Submitting...' : 'Submit request'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default function ShiftRequestsPage() {
  const { data: currentUser, isLoading: currentUserLoading } = useCurrentUser();
  const {
    data: userData,
    isLoading: userJobsLoading,
    error: userJobsError,
    refetch: refetchUserJobs,
  } = useUserApplicantJob(currentUser?.email || '', {
    enabled: !!currentUser?.email,
  });

  const [activeTab, setActiveTab] = useState<'available' | 'mine'>('available');

  const assignedJobs = useMemo(
    () => buildAssignedJobs(userData?.jobs),
    [userData?.jobs]
  );

  const [selectedJobId, setSelectedJobId] = useState<string>(() =>
    assignedJobs.length > 0 ? ALL_JOBS_ID : (assignedJobs[0]?._id ?? '')
  );

  // When jobs load for the first time, default to All jobs or first job
  useEffect(() => {
    if (!selectedJobId && assignedJobs.length > 0) {
      setSelectedJobId(ALL_JOBS_ID);
    }
  }, [assignedJobs, selectedJobId]);

  const selectedJob = useMemo(
    () =>
      selectedJobId === ALL_JOBS_ID
        ? null
        : assignedJobs.find((job) => job._id === selectedJobId) ?? assignedJobs[0] ?? null,
    [assignedJobs, selectedJobId]
  );

  const selectedJobLabel =
    selectedJobId === ALL_JOBS_ID
      ? 'All jobs'
      : selectedJob?.title ||
        (assignedJobs.length > 0 ? 'Select job' : 'No jobs available');

  const shiftSummariesWithJob: ShiftWithJob[] = useMemo(() => {
    if (selectedJobId === ALL_JOBS_ID) {
      return assignedJobs.flatMap((job) =>
        buildShiftSummaries(job).map((summary) => ({ job, summary }))
      );
    }
    const job = assignedJobs.find((j) => j._id === selectedJobId) ?? assignedJobs[0];
    if (!job) return [];
    return buildShiftSummaries(job).map((summary) => ({ job, summary }));
  }, [assignedJobs, selectedJobId]);

  const applicantId = userData?.applicantId;
  const myRequests = useMemo(
    () =>
      applicantId ? buildMyRequests(userData?.jobs, applicantId) : [],
    [userData?.jobs, applicantId]
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [modalJob, setModalJob] = useState<GignologyJob | null>(null);
  const [modalShift, setModalShift] = useState<Shift | null>(null);

  const openModalForShift = (job: GignologyJob, shiftSlug: string) => {
    const shift = job.shifts?.find((s) => s.slug === shiftSlug) ?? null;
    if (!shift) return;
    setModalJob(job);
    setModalShift(shift);
    setModalOpen(true);
  };

  const handleSubmitRequests = async (args: {
    dates: string[];
    recurringDays: DayKey[];
  }) => {
    if (!modalJob || !modalShift) return;
    const body = {
      jobId: modalJob._id,
      shiftSlug: modalShift.slug,
      dates: args.dates,
      recurringDays: args.recurringDays,
    };

    const loadingToastId = toast.loading('Submitting shift request...', {
      description: `${modalJob.title} — ${modalShift.shiftName}`,
    });

    try {
      const res = await fetch('/api/shift-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json().catch(() => ({}));

      toast.dismiss(loadingToastId);

      if (!res.ok) {
        const message =
          (json && (json.message as string)) ||
          'Failed to create shift request. Please try again.';
        toast.error(message);
        return;
      }

      toast.success('Shift request submitted', {
        description: 'You will see it under “My Requests” once processed.',
      });

      // Refresh job data so My Requests and badges pick up new entries
      await refetchUserJobs();
    } catch (error) {
      console.error('Failed to create shift requests', error);
      toast.dismiss(loadingToastId);
      toast.error('Something went wrong while submitting your request.');
    }
  };

  const handleCancelRequest = async (row: MyRequestRow) => {
    const loadingToastId = toast.loading('Cancelling shift request...', {
      description: `${row.jobTitle} — ${row.shiftName}`,
    });

    try {
      const res = await fetch('/api/shift-requests', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: row.jobId,
          shiftSlug: row.shiftSlug,
          dayKey: row.dayOfWeek,
          date: row.date,
        }),
      });

      const json = await res.json().catch(() => ({}));

      toast.dismiss(loadingToastId);

      if (!res.ok) {
        const message =
          (json && (json.message as string)) ||
          'Failed to cancel shift request. Please try again.';
        toast.error(message);
        return;
      }

      toast.success('Shift request cancelled');
      await refetchUserJobs();
    } catch (error) {
      console.error('Failed to cancel shift request', error);
      toast.dismiss(loadingToastId);
      toast.error('Something went wrong while cancelling your request.');
    }
  };

  // Distinguish initial jobs load from manual refetches.
  const isInitialJobsLoading = userJobsLoading && !userData;

  // Simple loading state for first render only
  if (currentUserLoading || isInitialJobsLoading) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 flex min-h-[50vh] items-center justify-center">
          <p className="text-sm text-slate-600">Loading shift requests…</p>
        </div>
      </Layout>
    );
  }

  if (userJobsError) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 flex min-h-[50vh] items-center justify-center">
          <p className="text-sm text-red-600">
            Failed to load your jobs. Please refresh the page.
          </p>
        </div>
      </Layout>
    );
  }

  const isClient = currentUser?.userType === 'Client';
  if (isClient) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto py-10">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Shift Requests are only available for employees
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-700">
                You are currently signed in as a client user. Use the client
                portal to manage shift assignments.
              </p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const myPendingCount = myRequests.filter((r) => r.status === 'pending').length;
  const myApprovedCount = myRequests.filter((r) => r.status === 'approved').length;
  const myRequestsTooltip =
    myRequests.length > 0
      ? `Total: ${myRequests.length} • Pending: ${myPendingCount} • Approved: ${myApprovedCount}`
      : 'No requests yet';

  const myColumns: TableColumn<MyRequestRow>[] = [
    {
      key: 'windowLabel',
      header: 'Shift',
      render: (value, row) => (
        <div className="space-y-1">
          <div className="font-medium text-sm text-slate-900">
            {row.jobTitle} — {row.shiftName}
          </div>
          <div className="text-xs text-slate-600">{row.windowLabel}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (value) => statusBadge(value as RequestStatus | 'scheduled'),
    },
    {
      key: 'source',
      header: 'Source',
      render: (value, row) => (
        <span className="text-xs text-slate-600">
          {row.source === 'schedule' ? 'Scheduled' : 'Request'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (value, row) =>
        row.source === 'request' && row.status === 'pending' ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleCancelRequest(row)}
          >
            Cancel
          </Button>
        ) : null,
    },
  ];

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 space-y-6 h-[calc(100vh-11rem)] max-h-[calc(100vh-11rem)] overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              Shift Requests
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Browse shifts for your jobs and request to be added to the
              schedule.
            </p>
          </div>

          <ToggleGroup
            type="single"
            value={activeTab}
            onValueChange={(v) =>
              v && setActiveTab(v as typeof activeTab)
            }
            className="inline-flex rounded-lg border border-gray-200 p-1 shadow-sm self-start sm:self-auto"
          >
            <ToggleGroupItem
              value="available"
              className={clsxm(
                'rounded-md px-3 py-1.5 text-xs sm:text-sm font-medium transition-all',
                activeTab === 'available'
                  ? 'bg-appPrimary text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
              )}
            >
              Available Shifts
            </ToggleGroupItem>
            <ToggleGroupItem
              value="mine"
              title={myRequestsTooltip}
              className={clsxm(
                'rounded-md px-3 py-1.5 text-xs sm:text-sm font-medium transition-all',
                activeTab === 'mine'
                  ? 'bg-appPrimary text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
              )}
            >
              <span className="inline-flex items-center gap-1.5">
                My Requests
                {myPendingCount > 0 && (
                  <span
                    className={clsxm(
                      'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold',
                      activeTab === 'mine'
                        ? 'bg-white text-appPrimary'
                        : 'bg-appPrimary text-white'
                    )}
                    title={myRequestsTooltip}
                  >
                    {myPendingCount}
                  </span>
                )}
              </span>
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {activeTab === 'available' && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-appPrimary" />
                  <div>
                    <CardTitle className="text-base">
                      Available shifts
                    </CardTitle>
                    <p className="text-xs text-slate-600">
                      Select a job and request shifts within its date range.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                  <div className="min-w-[200px]">
                    <Select
                      value={selectedJobId || undefined}
                      onValueChange={setSelectedJobId}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder="Select job"
                          displayText={selectedJobLabel}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem key={ALL_JOBS_ID} value={ALL_JOBS_ID}>
                          All jobs
                        </SelectItem>
                        {assignedJobs.map((job) => (
                          <SelectItem key={job._id} value={job._id}>
                            {job.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {shiftSummariesWithJob.length > 0 && (
                    <span className="text-xs text-slate-600 whitespace-nowrap">
                      {shiftSummariesWithJob.length} shift{shiftSummariesWithJob.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              {shiftSummariesWithJob.length === 0 ? (
                <p className="text-sm text-slate-600">
                  No shifts found for the selected filters.
                </p>
              ) : (
                <div className="space-y-3 overflow-y-auto h-[calc(100vh-23rem)] max-h-[calc(100vh-23rem)] min-h-0 pr-1 -mr-1">
                  {shiftSummariesWithJob.map(({ job, summary }) => {
                    const shift = job.shifts?.find((s) => s.slug === summary.slug) ?? null;
                    if (!shift) return null;

                    const start = parseISO(shift.shiftStartDate);
                    const end = parseISO(shift.shiftEndDate);

                    return (
                      <div
                        key={`${job._id}-${shift.slug}`}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm text-slate-900">
                              {job.title} — {shift.shiftName}
                            </p>
                            <Badge
                              variant="outline"
                              className="border-slate-300 text-slate-700"
                            >
                              {format(start, 'MMM d, yyyy')} –{' '}
                              {format(end, 'MMM d, yyyy')}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-600">
                            You can request specific dates or recurring days
                            within this range.
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => openModalForShift(job, shift.slug)}
                          >
                            Request shift
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeTab === 'mine' && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-appPrimary" />
                <div>
                  <CardTitle className="text-base">
                    My Shift Requests & Schedule
                  </CardTitle>
                  <p className="text-xs text-slate-600">
                    Pending and approved rows come from your jobs&apos; shift
                    rosters.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {myRequests.length === 0 ? (
                <p className="text-sm text-slate-600">
                  You do not have any shift requests yet.
                </p>
              ) : (
                <Table
                  columns={myColumns}
                  data={myRequests}
                  showPagination={true}
                  selectable={false}
                  className="w-full"
                  emptyMessage="No shift requests found."
                />
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <RequestShiftModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        job={modalJob}
        shift={modalShift}
        applicantId={userData?.applicantId}
        onSubmit={handleSubmitRequests}
      />
    </Layout>
  );
}

