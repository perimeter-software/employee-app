'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Zap,
  History,
  Globe,
  Search,
  Info,
  Hash,
  Check,
  Users,
  HelpCircle,
  Building2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { useCurrentUser } from '@/domains/user';
import { usePrimaryCompany } from '@/domains/company/hooks/use-primary-company';
import { clsxm } from '@/lib/utils';
import { EventApiService } from '@/domains/event/services/event-service';
import { ClientEventDetailModal } from './ClientEventDetailModal';
import { EventRosterModal } from '@/domains/event/components/EventRosterModal/EventRosterModal';
import type { GignologyEvent } from '@/domains/event/types/event.types';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 5;

type TimeFrame = 'Current' | 'Past' | 'All';
type SortDir = 'asc' | 'desc';

interface SortState {
  field: string;
  dir: SortDir;
}

const DEFAULT_SORT: Record<TimeFrame, SortState> = {
  Current: { field: 'eventDate', dir: 'asc' },
  Past: { field: 'eventDate', dir: 'desc' },
  All: { field: 'eventDate', dir: 'asc' },
};

// ─── Filter tab definitions ───────────────────────────────────────────────────

const FILTER_TABS: {
  value: TimeFrame;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  iconColorClass: string;
  activeBgClass: string;
  activeBorderClass: string;
}[] = [
  {
    value: 'Current',
    label: 'Current',
    Icon: Zap,
    iconColorClass: 'text-green-600',
    activeBgClass: 'bg-green-600',
    activeBorderClass: 'border-green-600',
  },
  {
    value: 'Past',
    label: 'Past',
    Icon: History,
    iconColorClass: 'text-red-500',
    activeBgClass: 'bg-red-500',
    activeBorderClass: 'border-red-500',
  },
  {
    value: 'All',
    label: 'All',
    Icon: Globe,
    iconColorClass: 'text-gray-800',
    activeBgClass: 'bg-gray-800',
    activeBorderClass: 'border-gray-800',
  },
];

// Columns that can be sorted and their MongoDB field names
const SORTABLE_COLUMNS: Record<string, string> = {
  Venue: 'venueSlug',
  Event: 'eventName',
  'Event Date': 'eventDate',
  City: 'venueCity',
  State: 'venueState',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatEventDate(dateStr?: string, timeZone?: string): string {
  if (!dateStr) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone ?? undefined,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(dateStr));
  } catch {
    return '—';
  }
}

function formatTime(dateStr?: string, timeZone?: string): string {
  if (!dateStr) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone ?? undefined,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(dateStr));
  } catch {
    return '—';
  }
}

function formatCount(n?: number): string {
  if (n == null) return '—';
  if (n >= 1000) return `${Math.floor(n / 1000)}k`;
  return String(n);
}

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NumberBadge({
  icon,
  value,
  color,
  title,
}: {
  icon: React.ReactNode;
  value?: number;
  color: 'blue' | 'green' | 'gray' | 'amber';
  title: string;
}) {
  const colorMap = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    gray: 'bg-gray-400',
    amber: 'bg-amber-500',
  };
  return (
    <span
      title={title}
      className={clsxm(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white',
        colorMap[color]
      )}
    >
      {icon}
      {value ?? 0}
    </span>
  );
}

function EventNumbers({ row }: { row: GignologyEvent }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <NumberBadge
        icon={<Hash className="w-3 h-3" />}
        value={row.positionsRequested}
        color="blue"
        title="Positions Requested"
      />
      <NumberBadge
        icon={<Check className="w-3 h-3" />}
        value={row.numberOnRoster}
        color="green"
        title="On Roster"
      />
      <NumberBadge
        icon={<Users className="w-3 h-3" />}
        value={row.numberOnWaitlist}
        color="gray"
        title="On Waitlist"
      />
      <NumberBadge
        icon={<HelpCircle className="w-3 h-3" />}
        value={row.numberOnRequest}
        color="amber"
        title="On Request"
      />
    </div>
  );
}

function SortIcon({ col, sort }: { col: string; sort: SortState }) {
  const field = SORTABLE_COLUMNS[col];
  if (!field) return null;
  if (sort.field !== field)
    return <ArrowUpDown className="w-3.5 h-3.5 text-gray-400 ml-1 inline" />;
  return sort.dir === 'asc' ? (
    <ArrowUp className="w-3.5 h-3.5 text-gray-700 ml-1 inline" />
  ) : (
    <ArrowDown className="w-3.5 h-3.5 text-gray-700 ml-1 inline" />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ClientEventsView() {
  const { data: currentUser } = useCurrentUser();
  const { data: primaryCompany } = usePrimaryCompany();
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('Current');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT['Current']);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const [selectedEvent, setSelectedEvent] = useState<GignologyEvent | null>(
    null
  );
  const [rosterEvent, setRosterEvent] = useState<GignologyEvent | null>(null);

  const clientOrgSlugs = useMemo(() => {
    const orgs = currentUser?.clientOrgs as { slug?: string }[] | undefined;
    if (!Array.isArray(orgs) || orgs.length === 0) return '';
    return orgs
      .map((o) => o.slug)
      .filter(Boolean)
      .join(';');
  }, [currentUser?.clientOrgs]);

  const imageBaseUrl = primaryCompany?.imageUrl ?? '';

  // Reset page when search/sort/timeFrame changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, sort, timeFrame]);

  const handleTimeFrameChange = useCallback((tf: TimeFrame) => {
    setTimeFrame(tf);
    setSort(DEFAULT_SORT[tf]);
    setPage(1);
  }, []);

  const handleSort = useCallback((col: string) => {
    const field = SORTABLE_COLUMNS[col];
    if (!field) return;
    setSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { field, dir: 'asc' }
    );
    setPage(1);
  }, []);

  const sortString = `${sort.field}:${sort.dir}`;

  // ── Count queries (limit=1 gives us pagination.total cheaply) ──────────────
  const countQueryOpts = (tf: TimeFrame) => ({
    queryKey: ['client-events-count', tf, clientOrgSlugs] as const,
    queryFn: () =>
      EventApiService.fetchClientEvents({
        venueSlugFilter: clientOrgSlugs,
        timeFrame: tf,
        limit: 1,
      }),
    enabled: !!clientOrgSlugs,
    staleTime: 60_000,
  });
  const { data: currentCountPage } = useQuery(countQueryOpts('Current'));
  const { data: pastCountPage } = useQuery(countQueryOpts('Past'));
  const { data: allCountPage } = useQuery(countQueryOpts('All'));

  const counts: Record<TimeFrame, number | undefined> = {
    Current: currentCountPage?.pagination?.total,
    Past: pastCountPage?.pagination?.total,
    All: allCountPage?.pagination?.total,
  };

  // ── Main data query (server-side page + sort) ───────────────────────────────
  const {
    data: eventsPage,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: [
      'client-events-main',
      timeFrame,
      clientOrgSlugs,
      debouncedSearch,
      page,
      sortString,
    ],
    queryFn: () =>
      EventApiService.fetchClientEvents({
        venueSlugFilter: clientOrgSlugs,
        timeFrame,
        search: debouncedSearch,
        page,
        limit: PAGE_SIZE,
        sort: sortString,
      }),
    enabled: !!clientOrgSlugs,
    staleTime: 0,
    gcTime: 0,
    placeholderData: (prev) => prev,
  });

  const events = eventsPage?.data ?? [];
  const total = eventsPage?.pagination?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function getLogoUrl(event: GignologyEvent): string | null {
    if (!event.logoUrl) return null;
    if (event.logoUrl.startsWith('http')) return event.logoUrl;
    return `${imageBaseUrl}/${event.venueSlug}/venues/logo/${event.logoUrl}`;
  }

  const COLUMNS = [
    'Logo',
    'Venue',
    'Event',
    'Event Date',
    'Report Time',
    'Est End Time',
    'City',
    'State',
    'Numbers',
    'Event Actions',
  ];

  const emptyMessages: Record<TimeFrame, string> = {
    Current: 'No current events found for your venues.',
    Past: 'No past events found for your venues.',
    All: 'No events found for your venues.',
  };

  const isSearching = search !== debouncedSearch;

  return (
    <div className="space-y-4">
      {/* ── Filter tabs ── */}
      <div className="flex gap-3 flex-wrap">
        {FILTER_TABS.map((tab) => {
          const isActive = timeFrame === tab.value;
          const count = counts[tab.value];
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => handleTimeFrameChange(tab.value)}
              className={clsxm(
                'flex items-center gap-2 px-4 py-2 rounded-lg border-2 font-medium text-sm transition-all',
                isActive
                  ? `${tab.activeBgClass} ${tab.activeBorderClass} text-white`
                  : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
              )}
            >
              <tab.Icon
                className={clsxm(
                  'w-4 h-4',
                  isActive ? 'text-white' : tab.iconColorClass
                )}
              />
              <span>{tab.label}</span>
              {count != null && (
                <span
                  className={clsxm(
                    'ml-0.5 min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-center text-xs font-semibold',
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-gray-100 text-gray-600'
                  )}
                >
                  {formatCount(count)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Table card ── */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Card header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div>
            <p className="font-semibold text-gray-900 text-base">
              Events &mdash; List View
            </p>
            {!isLoading && !isSearching && (
              <p className="text-xs text-gray-500 mt-0.5">
                {total} event{total !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search Event"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-1.5 text-sm rounded-md border border-zinc-200 bg-white placeholder:text-zinc-400 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-appPrimary/30 focus:border-appPrimary w-56"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-left">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {COLUMNS.map((col) => {
                  const isSortable = !!SORTABLE_COLUMNS[col];
                  return (
                    <th
                      key={col}
                      onClick={() => isSortable && handleSort(col)}
                      className={clsxm(
                        'px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide whitespace-nowrap select-none',
                        isSortable && 'cursor-pointer hover:bg-gray-100'
                      )}
                    >
                      {col}
                      {isSortable && <SortIcon col={col} sort={sort} />}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading || isFetching || isSearching ? (
                Array.from({ length: PAGE_SIZE }).map((_, i) => (
                  <tr key={i}>
                    {COLUMNS.map((col) => (
                      <td key={col} className="px-4 py-3">
                        <div className="h-4 rounded bg-gray-200 animate-pulse w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : events.length === 0 ? (
                <tr>
                  <td
                    colSpan={COLUMNS.length}
                    className="px-4 py-14 text-center text-gray-400"
                  >
                    <Globe className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-medium">
                      {emptyMessages[timeFrame]}
                    </p>
                  </td>
                </tr>
              ) : (
                events.map((row) => {
                  const logoUrl = getLogoUrl(row);
                  return (
                    <tr
                      key={row._id}
                      className="hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => setSelectedEvent(row)}
                    >
                      {/* Logo */}
                      <td className="px-4 py-3">
                        <div className="w-10 h-10 rounded overflow-hidden bg-gray-100 flex items-center justify-center flex-shrink-0">
                          {logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={logoUrl}
                              alt={row.venueName ?? ''}
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                (
                                  e.currentTarget as HTMLImageElement
                                ).style.display = 'none';
                              }}
                            />
                          ) : (
                            <Building2 className="w-5 h-5 text-gray-400" />
                          )}
                        </div>
                      </td>
                      {/* Venue */}
                      <td className="px-4 py-3 font-medium text-xs whitespace-nowrap">
                        {row.venueSlug?.toUpperCase() ?? '—'}
                      </td>
                      {/* Event */}
                      <td className="px-4 py-3 text-gray-900 max-w-[200px]">
                        <span className="line-clamp-2">{row.eventName}</span>
                      </td>
                      {/* Event Date */}
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                        {formatEventDate(row.eventDate, row.timeZone)}
                      </td>
                      {/* Report Time */}
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                        {row.reportTimeTBD ??
                          formatTime(row.eventDate, row.timeZone)}
                      </td>
                      {/* Est End Time */}
                      <td className="px-4 py-3 whitespace-nowrap text-gray-700">
                        {row.reportTimeTBD ??
                          formatTime(row.eventEndTime, row.timeZone)}
                      </td>
                      {/* City */}
                      <td className="px-4 py-3 text-gray-700">
                        {row.venueCity ?? '—'}
                      </td>
                      {/* State */}
                      <td className="px-4 py-3 text-gray-700">
                        {row.venueState ?? '—'}
                      </td>
                      {/* Numbers */}
                      <td className="px-4 py-3">
                        <EventNumbers row={row} />
                      </td>
                      {/* Actions */}
                      <td
                        className="px-4 py-3"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setRosterEvent(row)}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
                            title="Event Roster"
                          >
                            <Users className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedEvent(row)}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                            title="Event Info"
                          >
                            <Info className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {!isLoading && total > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 border-t border-gray-100 text-sm text-gray-600">
            <span>
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 rounded-md border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <span className="px-2 font-medium">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 rounded-md border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Event Detail Modal ── */}
      {selectedEvent && (
        <ClientEventDetailModal
          event={selectedEvent}
          open={!!selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}

      {/* ── Event Roster Modal ── */}
      {rosterEvent && (
        <EventRosterModal
          eventId={rosterEvent._id}
          eventName={rosterEvent.eventName}
          eventDate={rosterEvent.eventDate}
          venueSlug={rosterEvent.venueSlug}
          open={!!rosterEvent}
          onClose={() => setRosterEvent(null)}
        />
      )}
    </div>
  );
}
