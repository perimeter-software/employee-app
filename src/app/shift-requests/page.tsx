'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { format, parseISO, getDay } from 'date-fns';
import { CalendarDays, Clock } from 'lucide-react';

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
import { Input } from '@/components/ui/Input';
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

type ShiftSummary = {
  slug: string;
  shiftName: string;
  shiftStartDate: string;
  shiftEndDate: string;
};

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
};

type RequestMode = 'dates' | 'recurring';

function buildAssignedJobs(jobs: GignologyJob[] | undefined): GignologyJob[] {
  if (!jobs?.length) return [];
  return jobs.filter((job) => job.status === 'On Assignment');
}

function buildShiftSummaries(job: GignologyJob | undefined): ShiftSummary[] {
  if (!job?.shifts?.length) return [];
  const now = new Date();

  // Only include shifts whose end date is today or in the future
  return job.shifts
    .filter((shift) => {
      const end = new Date(shift.shiftEndDate);
      if (Number.isNaN(end.getTime())) return false;
      // Normalize to date-only comparison
      const endYmd = format(end, 'yyyy-MM-dd');
      const todayYmd = format(now, 'yyyy-MM-dd');
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
  onSubmit: (args: { dates: string[]; recurringDays: DayKey[] }) => Promise<void>;
};

const RequestShiftModal: React.FC<RequestModalProps> = ({
  open,
  onOpenChange,
  job,
  shift,
  onSubmit,
}) => {
  const [mode, setMode] = useState<RequestMode>('dates');
  const [newDate, setNewDate] = useState('');
  const [dates, setDates] = useState<string[]>([]);
  const [recurringDays, setRecurringDays] = useState<DayKey[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);

  if (!job || !shift) return null;

  const shiftStart = parseISO(shift.shiftStartDate);
  const shiftEnd = parseISO(shift.shiftEndDate);
  const minDateStr = format(shiftStart, 'yyyy-MM-dd');
  const maxDateStr = format(shiftEnd, 'yyyy-MM-dd');

  // Only allow recurring selection for days that actually have a schedule
  const allowedRecurringDays: DayKey[] = [];
  for (const day of DAY_KEYS) {
    const schedule = shift.defaultSchedule?.[day];
    if (schedule?.start && schedule.end) {
      allowedRecurringDays.push(day);
    }
  }

  const handleAddDate = () => {
    if (!newDate) {
      return;
    }
    const d = new Date(newDate);
    if (Number.isNaN(d.getTime())) {
      return;
    }

    // Enforce that selected date is one of the valid shift weekdays
    const dayIndex = getDay(d); // 0 (Sun) - 6 (Sat)
    const dayKey = DAY_KEYS[dayIndex];
    if (!allowedRecurringDays.includes(dayKey)) {
      setDateError(
        `This shift only runs on ${allowedRecurringDays
          .map((d) => d.slice(0, 3))
          .join(', ')}. Please pick one of those days.`
      );
      return;
    }

    if (d < shiftStart || d > shiftEnd) return;
    if (dates.includes(newDate)) return;
    setDateError(null);
    setDates((prev) => [...prev, newDate].sort());
  };

  const toggleRecurringDay = (day: DayKey) => {
    setRecurringDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSubmit = async () => {
    const hasDates = dates.length > 0;
    const hasRecurring = recurringDays.length > 0;
    if (!hasDates && !hasRecurring) return;

    setSubmitting(true);
    try {
      await onSubmit({ dates, recurringDays });
      setDates([]);
      setRecurringDays([]);
      setNewDate('');
      setMode('dates');
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const hasAnySelection =
    (mode === 'dates' && dates.length > 0) ||
    (mode === 'recurring' && recurringDays.length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request shift</DialogTitle>
          <DialogDescription>
            {job.title} — {shift.shiftName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-xs text-gray-600">
            Shift runs from{' '}
            <span className="font-medium">
              {format(shiftStart, 'MMM d, yyyy')}
            </span>{' '}
            to{' '}
            <span className="font-medium">
              {format(shiftEnd, 'MMM d, yyyy')}
            </span>
            .
          </div>

          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(v) =>
              v && setMode(v as RequestMode)
            }
            className="inline-flex rounded-lg border border-gray-200 p-1 shadow-sm"
          >
            <ToggleGroupItem
              value="dates"
              className={clsxm(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                mode === 'dates'
                  ? 'bg-appPrimary text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
              )}
            >
              Specific dates
            </ToggleGroupItem>
            <ToggleGroupItem
              value="recurring"
              className={clsxm(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-all',
                mode === 'recurring'
                  ? 'bg-appPrimary text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
              )}
            >
              Recurring days
            </ToggleGroupItem>
          </ToggleGroup>

          {mode === 'dates' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  min={minDateStr}
                  max={maxDateStr}
                  value={newDate}
                  onChange={(e) => {
                    setNewDate(e.target.value);
                    if (dateError) setDateError(null);
                  }}
                  className="h-9"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddDate}
                >
                  Add
                </Button>
              </div>
              {dateError && (
                <p className="text-xs text-red-600">{dateError}</p>
              )}
              {dates.length > 0 && (
                <div className="flex flex-wrap gap-2 text-xs">
                  {dates.map((d) => (
                    <span
                      key={d}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5"
                    >
                      {format(new Date(d), 'MMM d, yyyy')}
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

          {mode === 'recurring' && (
            <div className="space-y-2">
              <p className="text-xs text-gray-600">
                Select the days of week you want to work. Requests will be
                created for all matching dates within the shift range.
              </p>
              <div className="grid grid-cols-4 gap-2 text-xs">
                {allowedRecurringDays.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleRecurringDay(day)}
                    className={clsxm(
                      'rounded-md border px-2 py-1 capitalize',
                      recurringDays.includes(day)
                        ? 'bg-appPrimary text-white border-appPrimary'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    )}
                  >
                    {day.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
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
    assignedJobs[0]?._id ?? ''
  );

  // When jobs load for the first time, ensure we default-select the first one
  useEffect(() => {
    if (!selectedJobId && assignedJobs.length > 0) {
      setSelectedJobId(assignedJobs[0]._id);
    }
  }, [assignedJobs, selectedJobId]);

  const selectedJob = useMemo(
    () => assignedJobs.find((job) => job._id === selectedJobId) ?? assignedJobs[0],
    [assignedJobs, selectedJobId]
  );

  const selectedJobLabel =
    selectedJob?.title ||
    (assignedJobs.length > 0 ? 'Select job' : 'No jobs available');

  const [pageIndex, setPageIndex] = useState(0);
  const pageSize = 3;
  const shiftSummaries = useMemo(
    () => buildShiftSummaries(selectedJob),
    [selectedJob]
  );

  const pagedShifts = shiftSummaries.slice(
    pageIndex * pageSize,
    pageIndex * pageSize + pageSize
  );

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
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-slate-600">Loading shift requests…</p>
        </div>
      </Layout>
    );
  }

  if (userJobsError) {
    return (
      <Layout>
        <div className="flex min-h-screen items-center justify-center">
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
    <Layout title="Shift Requests">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 space-y-6">
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
              className={clsxm(
                'rounded-md px-3 py-1.5 text-xs sm:text-sm font-medium transition-all',
                activeTab === 'mine'
                  ? 'bg-appPrimary text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
              )}
            >
              My Requests
              {myPendingCount > 0 && (
                <span className="ml-1 rounded-full bg-white/20 px-1.5 text-[10px]">
                  {myPendingCount}
                </span>
              )}
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
                      value={selectedJobId}
                      onValueChange={(v) => {
                        setSelectedJobId(v);
                        setPageIndex(0);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue
                          placeholder="Select job"
                          displayText={selectedJobLabel}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {assignedJobs.map((job) => (
                          <SelectItem key={job._id} value={job._id}>
                            {job.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 disabled:opacity-100"
                      disabled={pageIndex === 0}
                      onClick={() =>
                        setPageIndex((prev) => Math.max(prev - 1, 0))
                      }
                    >
                      <span className="text-base leading-none text-slate-700">
                        ‹
                      </span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 disabled:opacity-100"
                      disabled={
                        (pageIndex + 1) * pageSize >= shiftSummaries.length
                      }
                      onClick={() =>
                        setPageIndex((prev) =>
                          (prev + 1) * pageSize < shiftSummaries.length
                            ? prev + 1
                            : prev
                        )
                      }
                    >
                      <span className="text-base leading-none text-slate-700">
                        ›
                      </span>
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              {!selectedJob || !selectedJob.shifts?.length ? (
                <p className="text-sm text-slate-600">
                  No shifts found for this job.
                </p>
              ) : (
                <div className="space-y-3">
                  {pagedShifts.map((summary) => {
                    const shift =
                      selectedJob.shifts?.find(
                        (s) => s.slug === summary.slug
                      ) ?? null;
                    if (!shift) return null;

                    const start = parseISO(shift.shiftStartDate);
                    const end = parseISO(shift.shiftEndDate);

                    return (
                      <div
                        key={shift.slug}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm text-slate-900">
                              {selectedJob.title} — {shift.shiftName}
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
                            onClick={() =>
                              openModalForShift(selectedJob, shift.slug)
                            }
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
        onSubmit={handleSubmitRequests}
      />
    </Layout>
  );
}

