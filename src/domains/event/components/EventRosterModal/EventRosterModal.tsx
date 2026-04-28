'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Mail,
  Check,
  Clock,
  HelpCircle,
  X,
  StickyNote,
} from 'lucide-react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { clsxm } from '@/lib/utils';
import { usePrimaryCompany } from '@/domains/company/hooks/use-primary-company';
import { SendMessageModal } from '@/domains/staffing/components/SendMessageModal/SendMessageModal';
import type { StaffingEmployee } from '@/domains/staffing/components/EmployeeViewModal/EmployeeViewModal';

const IMAGE_SERVER = process.env.NEXT_PUBLIC_IMAGE_SERVER ?? '';
const PAGE_LIMIT = 25;

// ─── Types ────────────────────────────────────────────────────────────────────

export type RosterApplicant = {
  _id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  emailAddress?: string;
  phone?: string;
  status?: string;
  profileImg?: string;
  platform?: string;
  loginVerified?: string;
  userRecordId?: string;
  rosterStatus: string;
  signupDate?: string | null;
  agent?: string | null;
  position?: string | null;
};

type RosterCounts = {
  all: number;
  roster: number;
  request: number;
  waitlist: number;
  notRoster: number;
};

type RosterFilter = 'all' | 'roster' | 'request' | 'waitlist' | 'notRoster';

type PageResult = {
  success: boolean;
  data: RosterApplicant[];
  counts: RosterCounts;
  pagination: { page: number; limit: number; total: number; hasMore: boolean };
};

const FILTER_DEFS: { mode: RosterFilter; label: string }[] = [
  { mode: 'all', label: 'All' },
  { mode: 'roster', label: 'On Roster' },
  { mode: 'request', label: 'Request' },
  { mode: 'waitlist', label: 'Waitlist' },
  { mode: 'notRoster', label: 'Not On Roster' },
];

const ZERO_COUNTS: RosterCounts = {
  all: 0,
  roster: 0,
  request: 0,
  waitlist: 0,
  notRoster: 0,
};

// requestType values match what sp1 /enroll endpoint expects
const ROSTER_STATUS_OPTIONS = [
  { value: 'Roster', label: 'On Roster' },
  { value: 'Request', label: 'Request' },
  { value: 'Waitlist', label: 'Waitlist' },
  { value: 'Not Roster', label: 'Not On Roster' },
];

// ─── Status badge (clickable) ─────────────────────────────────────────────────

const STATUS_CFG: Record<
  string,
  { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  Roster: { label: 'On Roster', cls: 'bg-emerald-100 text-emerald-700', Icon: Check },
  Request: { label: 'Request', cls: 'bg-amber-100 text-amber-700', Icon: HelpCircle },
  Waitlist: { label: 'Waitlist', cls: 'bg-blue-100 text-blue-700', Icon: Clock },
  'Not Roster': { label: 'Not On Roster', cls: 'bg-slate-100 text-slate-500', Icon: X },
};

function RosterStatusCell({
  row,
  eventId,
  onSuccess,
}: {
  row: RosterApplicant;
  eventId: string;
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { mutate, isPending } = useMutation({
    mutationFn: async (requestType: string) => {
      const res = await fetch(`/api/events/${eventId}/roster-applicants`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicantId: row._id, requestType }),
      });
      if (!res.ok) throw new Error('Failed to update roster status');
    },
    onSuccess: () => {
      toast.success('Roster status updated.');
      onSuccess();
    },
    onError: () => {
      toast.error('Failed to update roster status.');
    },
  });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const cfg = STATUS_CFG[row.rosterStatus] ?? STATUS_CFG['Not Roster'];
  const Icon = cfg.Icon;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        disabled={isPending}
        onClick={() => setOpen((o) => !o)}
        title="Click to change roster status"
        className={clsxm(
          'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50',
          cfg.cls
        )}
      >
        <Icon className="w-3 h-3" />
        {cfg.label}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-md shadow-lg min-w-[140px] py-1">
          {ROSTER_STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { setOpen(false); mutate(opt.value); }}
              className={clsxm(
                'w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors flex items-center gap-2',
                row.rosterStatus === opt.value
                  ? 'font-semibold text-appPrimary'
                  : 'text-slate-700'
              )}
            >
              {row.rosterStatus === opt.value ? (
                <Check className="w-3 h-3" />
              ) : (
                <span className="w-3" />
              )}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function ApplicantAvatar({
  firstName = '',
  lastName = '',
  imageSrc,
}: {
  firstName?: string;
  lastName?: string;
  imageSrc?: string;
}) {
  const [imgError, setImgError] = React.useState(false);
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
  if (imageSrc && !imgError) {
    return (
      <img
        src={imageSrc}
        alt={`${firstName} ${lastName}`}
        className="w-8 h-8 rounded-full object-cover bg-slate-100"
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <span className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 text-xs font-semibold flex items-center justify-center shrink-0">
      {initials || '?'}
    </span>
  );
}

// ─── Sort helpers ─────────────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc';

function SortableTH({
  children,
  sortKey,
  active,
  dir,
  onSort,
}: {
  children: React.ReactNode;
  sortKey: string;
  active: boolean;
  dir: SortDir;
  onSort: (key: string) => void;
}) {
  const Icon = active ? (dir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th className="text-xs font-semibold text-slate-500 px-3 py-2.5 text-left whitespace-nowrap">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:text-slate-800 transition-colors"
      >
        {children}
        <Icon
          className={clsxm('w-3 h-3', active ? 'text-appPrimary' : 'text-slate-400')}
        />
      </button>
    </th>
  );
}

// ─── Notes Modal ──────────────────────────────────────────────────────────────

function NotesModal({
  applicant,
  eventId,
  eventName,
  noteTypes,
  open,
  onClose,
}: {
  applicant: RosterApplicant;
  eventId: string;
  eventName: string;
  noteTypes: string[];
  open: boolean;
  onClose: () => void;
}) {
  const [noteType, setNoteType] = useState('');
  const [noteText, setNoteText] = useState('');

  // Set default when types load
  useEffect(() => {
    if (noteTypes.length > 0 && !noteType) setNoteType(noteTypes[0] ?? '');
  }, [noteTypes, noteType]);

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/applicants/${applicant._id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: noteType,
          text: noteText,
          firstName: applicant.firstName ?? '',
          lastName: applicant.lastName ?? '',
          userId: applicant.userRecordId ?? '',
          ...(eventId ? { eventUrl: `/events/${eventId}` } : {}),
          eventName,
        }),
      });
      if (!res.ok) throw new Error('Failed to save note');
    },
    onSuccess: () => {
      setNoteText('');
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            Add Note — {applicant.firstName} {applicant.lastName}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 pt-1">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Note Type
            </label>
            <select
              value={noteType}
              onChange={(e) => setNoteType(e.target.value)}
              aria-label="Note type"
              className="w-full text-sm border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-appPrimary/30"
            >
              {noteTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Note
            </label>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
              placeholder="Enter note…"
              className="w-full text-sm border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-appPrimary/30 resize-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !noteText.trim()}
              className="px-3 py-1.5 text-xs rounded-md bg-appPrimary text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isPending ? 'Saving…' : 'Save Note'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────

function RosterTable({
  rows,
  imageBase,
  eventId,
  onMessage,
  onNote,
  onStatusChange,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: RosterApplicant[];
  imageBase: string | null;
  eventId: string;
  onMessage: (a: RosterApplicant) => void;
  onNote: (a: RosterApplicant) => void;
  onStatusChange: () => void;
  sortKey: string;
  sortDir: SortDir;
  onSort: (key: string) => void;
}) {
  const formatDate = (d?: string | null) => {
    if (!d) return '—';
    try {
      return new Intl.DateTimeFormat('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(new Date(d));
    } catch {
      return '—';
    }
  };

  const sh = (key: string) => ({
    sortKey: key,
    active: sortKey === key,
    dir: sortDir,
    onSort,
  });

  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
        <tr>
          <th className="w-10"><span className="sr-only">Avatar</span></th>
          <th className="text-xs font-semibold text-slate-500 px-3 py-2.5 text-left whitespace-nowrap">
            Status
          </th>
          <SortableTH {...sh('lastName')}>Last Name</SortableTH>
          <SortableTH {...sh('firstName')}>First Name</SortableTH>
          <SortableTH {...sh('loginVerified')}>Login</SortableTH>
          <SortableTH {...sh('phone')}>Phone</SortableTH>
          <SortableTH {...sh('signupDate')}>Signup Date</SortableTH>
          <th className="text-xs font-semibold text-slate-500 px-3 py-2.5 text-left whitespace-nowrap">
            Position
          </th>
          <th className="text-xs font-semibold text-slate-500 px-3 py-2.5 text-right">
            Actions
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((row) => {
          const imgSrc = row.profileImg?.startsWith('https')
            ? row.profileImg
            : imageBase && row.profileImg && row.userRecordId
              ? `${imageBase}/users/${row.userRecordId}/photo/${row.profileImg}`
              : undefined;

          return (
            <tr key={row._id} className="hover:bg-slate-50 transition-colors">
              <td className="pl-3 pr-1 py-2">
                <ApplicantAvatar
                  firstName={row.firstName}
                  lastName={row.lastName}
                  imageSrc={imgSrc}
                />
              </td>
              <td className="px-3 py-2">
                <RosterStatusCell
                  row={row}
                  eventId={eventId}
                  onSuccess={onStatusChange}
                />
              </td>
              <td className="px-3 py-2.5 text-slate-800 font-medium">
                {row.lastName || '—'}
              </td>
              <td className="px-3 py-2.5 text-slate-700">{row.firstName || '—'}</td>
              <td className="px-3 py-2.5 text-center">
                {row.loginVerified === 'Yes' ? (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700">
                    <Check className="w-3 h-3" />
                  </span>
                ) : (
                  <span className="text-slate-400 text-xs">—</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-slate-600">{row.phone || '—'}</td>
              <td className="px-3 py-2.5 text-slate-600 text-xs">
                {row.signupDate ? (
                  <span title={row.agent ? `Agent: ${row.agent}` : undefined}>
                    {formatDate(row.signupDate)}
                  </span>
                ) : (
                  '—'
                )}
              </td>
              <td className="px-3 py-2.5 text-slate-600 text-xs">
                {row.position || '—'}
              </td>
              <td className="px-3 py-2.5">
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    title="Add Note"
                    onClick={() => onNote(row)}
                    className="p-1.5 rounded hover:bg-amber-50 text-amber-500 transition-colors"
                  >
                    <StickyNote className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    title="Send Message"
                    onClick={() => onMessage(row)}
                    className="p-1.5 rounded hover:bg-red-50 text-red-500 transition-colors"
                  >
                    <Mail className="w-4 h-4" />
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

type Props = {
  eventId: string;
  eventName: string;
  eventDate?: string;
  venueSlug?: string;
  open: boolean;
  onClose: () => void;
};

export function EventRosterModal({
  eventId,
  eventName,
  eventDate,
  venueSlug,
  open,
  onClose,
}: Props) {
  const { data: company } = usePrimaryCompany();
  const imageBase =
    IMAGE_SERVER && company?.uploadPath
      ? `${IMAGE_SERVER}/${company.uploadPath}`
      : null;

  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<RosterFilter>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortKey, setSortKey] = useState('lastName');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [messageApplicant, setMessageApplicant] = useState<RosterApplicant | null>(null);
  const [noteApplicant, setNoteApplicant] = useState<RosterApplicant | null>(null);

  const sentinelRef = useRef<HTMLDivElement>(null);

  // Fetch note types from the dropdowns endpoint
  const { data: noteTypesRaw } = useQuery<string[]>({
    queryKey: ['dropdowns', 'noteTypes'],
    queryFn: async () => {
      const res = await fetch('/api/applicant-onboarding/dropdowns/noteTypes');
      if (!res.ok) throw new Error('Failed to fetch note types');
      const json = await res.json() as Record<string, unknown>;
      // Response shape: { data: { arrayValue: [...] } } | { data: [...] } | [...]
      const raw: unknown = (json?.data as Record<string, unknown>)?.arrayValue ?? json?.data ?? json;
      if (Array.isArray(raw)) {
        return (raw as unknown[]).map((item) =>
          typeof item === 'string' ? item : String((item as Record<string, unknown>).value ?? item)
        );
      }
      return [];
    },
    staleTime: 10 * 60 * 1000,
  });
  const noteTypes = noteTypesRaw ?? [];

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(id);
  }, [search]);

  const queryKey = ['event-roster-applicants', eventId, filter, debouncedSearch, sortKey, sortDir];

  const { data, isLoading, isFetchingNextPage, fetchNextPage, hasNextPage } =
    useInfiniteQuery<PageResult>({
      queryKey,
      queryFn: async ({ pageParam = 1 }) => {
        const params = new URLSearchParams({
          filter,
          page: String(pageParam),
          limit: String(PAGE_LIMIT),
          sort: sortKey,
          sortDir,
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
        });
        const url = `/api/events/${eventId}/roster-applicants?${params.toString()}`;
        const res = await fetch(url);
        const json = (await res.json()) as PageResult;
        if (!json.success) throw new Error('Failed to load roster');
        return json;
      },
      getNextPageParam: (last) =>
        last.pagination.hasMore ? last.pagination.page + 1 : undefined,
      initialPageParam: 1,
      enabled: open && !!eventId,
      staleTime: 2 * 60 * 1000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    });

  // Flatten all loaded pages into one list
  const allRows = useMemo(
    () => data?.pages.flatMap((p) => p.data) ?? [],
    [data?.pages]
  );

  // Counts are stable: once loaded they never reset to zero when the filter
  // changes (counts are independent of the active filter tab).
  const [stableCounts, setStableCounts] = useState<RosterCounts>(ZERO_COUNTS);
  useEffect(() => {
    const incoming = data?.pages[0]?.counts;
    if (incoming) setStableCounts(incoming);
  }, [data?.pages]);

  // All filtering/search/sort is server-side; rows are ready to render as-is
  const filteredRows = allRows;

  // Infinite scroll sentinel
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleSort = (key: string) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const handleStatusChange = () => {
    void queryClient.invalidateQueries({
      queryKey: ['event-roster-applicants', eventId],
    });
  };

  const formattedDate = eventDate
    ? (() => {
        try {
          return new Intl.DateTimeFormat('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          }).format(new Date(eventDate));
        } catch {
          return eventDate;
        }
      })()
    : '';

  const toStaffingEmployee = (a: RosterApplicant): StaffingEmployee => ({
    _id: a._id,
    firstName: a.firstName ?? '',
    lastName: a.lastName ?? '',
    email: a.email ?? a.emailAddress ?? '',
    phone: a.phone,
    employmentStatus: a.status,
    profileImg: a.profileImg,
    userId: a.userRecordId,
  });

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-5xl p-0 overflow-hidden max-h-[90vh] flex flex-col">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-slate-100 flex-shrink-0">
            <DialogTitle className="text-base font-semibold">
              Client Event Roster – Signups
              {stableCounts.all > 0 && (
                <span className="ml-1.5 text-slate-500 font-normal">
                  · Applicant Pool Size: {stableCounts.all}
                </span>
              )}
            </DialogTitle>
            {eventName && (
              <p className="text-xs text-slate-500 mt-0.5">
                {eventName}
                {formattedDate && ` · ${formattedDate}`}
              </p>
            )}
          </DialogHeader>

          {/* Filters + search */}
          <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-slate-100 flex-shrink-0">
            <div className="flex flex-wrap gap-1.5">
              {FILTER_DEFS.map(({ mode, label }) => {
                const isActive = filter === mode;
                const count = stableCounts[mode];
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setFilter(mode);
                      setSearch('');
                    }}
                    className={clsxm(
                      'inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium border transition-colors',
                      isActive
                        ? 'bg-appPrimary text-white border-appPrimary'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    )}
                  >
                    {label}
                    <span
                      className={clsxm(
                        'inline-flex items-center justify-center rounded-full w-4 h-4 text-[10px] font-semibold',
                        isActive
                          ? 'bg-white text-appPrimary'
                          : 'bg-slate-200 text-slate-600'
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="ml-auto relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search roster…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-appPrimary/30 w-48"
              />
            </div>
          </div>

          {/* Scrollable table area */}
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
                Loading…
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
                {search ? 'No results match your search.' : 'No applicants found.'}
              </div>
            ) : (
              <>
                <RosterTable
                  rows={filteredRows}
                  imageBase={imageBase}
                  eventId={eventId}
                  onMessage={setMessageApplicant}
                  onNote={setNoteApplicant}
                  onStatusChange={handleStatusChange}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onSort={handleSort}
                />
                {/* Infinite scroll sentinel */}
                <div ref={sentinelRef} className="h-8 flex items-center justify-center">
                  {isFetchingNextPage && (
                    <span className="text-xs text-slate-400">Loading more…</span>
                  )}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {messageApplicant && (
        <SendMessageModal
          recipient={toStaffingEmployee(messageApplicant)}
          venueSlug={venueSlug ?? ''}
          venueAttachments={[]}
          open
          onClose={() => setMessageApplicant(null)}
        />
      )}

      {noteApplicant && (
        <NotesModal
          applicant={noteApplicant}
          eventId={eventId}
          eventName={eventName}
          noteTypes={noteTypes}
          open
          onClose={() => setNoteApplicant(null)}
        />
      )}
    </>
  );
}
