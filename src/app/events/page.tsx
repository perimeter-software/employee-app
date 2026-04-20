'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarRange, Search } from 'lucide-react';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/ToggleGroup';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { useCurrentUser } from '@/domains/user';
import { usePrimaryCompany } from '@/domains/company/hooks/use-primary-company';
import { clsxm } from '@/lib/utils';
import {
  EventApiService,
  EventCard,
  EventDetailModal,
  INCOMING_COVER_REQUESTS_QUERY_KEY,
  IncomingCoverRequestsModal,
} from '@/domains/event';
import type { GignologyEvent, EventListPage } from '@/domains/event';
import { baseInstance } from '@/lib/api/instance';
import type { VenueWithStatus } from '@/domains/venue';

// ─── Page-local constants ─────────────────────────────────────────────────────

type TabValue = 'all' | 'my' | 'past';

const TABS: { value: TabValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'my', label: 'My Events' },
  { value: 'past', label: 'Past' },
];

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EventsPage() {
  const { data: currentUser } = useCurrentUser();
  const { data: primaryCompany } = usePrimaryCompany();

  const [tab, setTab] = useState<TabValue>('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const [selectedEvent, setSelectedEvent] = useState<GignologyEvent | null>(
    null
  );
  const [venueSlug, setVenueSlug] = useState('');
  const [incomingCoverModalOpen, setIncomingCoverModalOpen] = useState(false);

  const queryClient = useQueryClient();
  const applicantId = currentUser?.applicantId;
  const isEmployee = currentUser?.userType === 'User';

  // ── StaffingPool venues for the filter dropdown ──────────────────────────────
  const { data: incomingCoverList = [], isLoading: incomingCoverListLoading } =
    useQuery({
      queryKey: INCOMING_COVER_REQUESTS_QUERY_KEY,
      queryFn: () => EventApiService.listIncomingCoverRequests(),
      enabled: !!applicantId && isEmployee,
      staleTime: 60 * 1000,
    });
  const incomingCoverCount = incomingCoverList.length;

  const { data: staffingVenues = [] } = useQuery<VenueWithStatus[]>({
    queryKey: ['venues', 'staffing-pool'],
    queryFn: async () => {
      const res = await baseInstance.get<VenueWithStatus[]>('venues');
      if (!res.success || !res.data) return [];
      return res.data.filter((v) => v.userVenueStatus === 'StaffingPool');
    },
    enabled: !!currentUser && isEmployee,
    staleTime: 5 * 60 * 1000,
  });

  // ── All events ──────────────────────────────────────────────────────────────
  const {
    data: allEventsData,
    isLoading: isLoadingAll,
    fetchNextPage: fetchNextAll,
    isFetchingNextPage: isFetchingNextAll,
    hasNextPage: hasNextAll,
  } = useInfiniteQuery<
    EventListPage,
    Error,
    { pages: EventListPage[] },
    readonly unknown[],
    number
  >({
    queryKey: ['events-all', applicantId, debouncedSearch, venueSlug],
    queryFn: ({ pageParam }) =>
      EventApiService.fetchAllEvents({
        applicantId,
        search: debouncedSearch,
        page: pageParam,
        venueSlug,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.pagination?.next?.page ?? undefined,
    enabled: tab === 'all' && !!currentUser,
    staleTime: 0,
    gcTime: 0,
  });

  // ── My events ───────────────────────────────────────────────────────────────
  const {
    data: myEventsData,
    isLoading: isLoadingMy,
    fetchNextPage: fetchNextMy,
    isFetchingNextPage: isFetchingNextMy,
    hasNextPage: hasNextMy,
  } = useInfiniteQuery<
    EventListPage,
    Error,
    { pages: EventListPage[] },
    readonly unknown[],
    number
  >({
    queryKey: ['events-my', applicantId, debouncedSearch, venueSlug],
    queryFn: ({ pageParam }) =>
      EventApiService.fetchMyEvents({
        applicantId,
        search: debouncedSearch,
        page: pageParam,
        venueSlug,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.pagination?.next?.page ?? undefined,
    enabled: tab === 'my' && !!applicantId,
    staleTime: 0,
    gcTime: 0,
  });

  // ── Past events ─────────────────────────────────────────────────────────────
  const {
    data: pastEventsData,
    isLoading: isLoadingPast,
    fetchNextPage: fetchNextPast,
    isFetchingNextPage: isFetchingNextPast,
    hasNextPage: hasNextPast,
  } = useInfiniteQuery<
    EventListPage,
    Error,
    { pages: EventListPage[] },
    readonly unknown[],
    number
  >({
    queryKey: ['events-past', applicantId, debouncedSearch, venueSlug],
    queryFn: ({ pageParam }) =>
      EventApiService.fetchPastEvents({
        applicantId,
        search: debouncedSearch,
        page: pageParam,
        venueSlug,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.pagination?.next?.page ?? undefined,
    enabled: tab === 'past' && !!applicantId,
    staleTime: 0,
    gcTime: 0,
  });

  // ── Flatten + enrich pages ──────────────────────────────────────────────────
  // rosterStatus is set by the backend when applicantId is provided;
  // applicants array is stripped from the response so we don't re-derive from it.
  const resolveStatus = (e: GignologyEvent) =>
    e.rosterStatus && e.rosterStatus !== 'Not Roster'
      ? e.rosterStatus
      : (e.status ?? '');

  const allEvents = useMemo<GignologyEvent[]>(() => {
    if (!allEventsData?.pages) return [];
    return allEventsData.pages
      .flatMap((p) => p.data ?? [])
      .filter((e, i, arr) => arr.findIndex((x) => x._id === e._id) === i)
      .map((e) => ({ ...e, status: resolveStatus(e) }));
  }, [allEventsData?.pages]); // eslint-disable-line react-hooks/exhaustive-deps

  const myEvents = useMemo<GignologyEvent[]>(() => {
    if (!myEventsData?.pages) return [];
    return myEventsData.pages
      .flatMap((p) => p.data ?? [])
      .filter((e, i, arr) => arr.findIndex((x) => x._id === e._id) === i)
      .map((e) => ({ ...e, status: resolveStatus(e) }))
      .filter((e) =>
        isEmployee
          ? e.makePublicAndSendNotification === 'Yes' ||
            (e.makePublicAndSendNotification === 'No' &&
              (e.status === 'Roster' || e.status === 'Waitlist'))
          : true
      );
  }, [myEventsData?.pages, isEmployee]); // eslint-disable-line react-hooks/exhaustive-deps

  const pastEvents = useMemo<GignologyEvent[]>(() => {
    if (!pastEventsData?.pages) return [];
    return pastEventsData.pages
      .flatMap((p) => p.data ?? [])
      .filter((e, i, arr) => arr.findIndex((x) => x._id === e._id) === i)
      .map((e) => ({ ...e, status: resolveStatus(e) }));
  }, [pastEventsData?.pages]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Active list + loading state ─────────────────────────────────────────────
  const activeEvents =
    tab === 'all' ? allEvents : tab === 'my' ? myEvents : pastEvents;
  const isLoading =
    tab === 'all' ? isLoadingAll : tab === 'my' ? isLoadingMy : isLoadingPast;
  const isFetchingNext =
    tab === 'all'
      ? isFetchingNextAll
      : tab === 'my'
        ? isFetchingNextMy
        : isFetchingNextPast;
  const hasNext =
    tab === 'all' ? hasNextAll : tab === 'my' ? hasNextMy : hasNextPast;
  const fetchNext =
    tab === 'all' ? fetchNextAll : tab === 'my' ? fetchNextMy : fetchNextPast;

  const isSearching = search !== debouncedSearch;

  // ── Infinite scroll sentinel ─────────────────────────────────────────────────
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNext && !isFetchingNext) {
          fetchNext();
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNext, isFetchingNext, fetchNext]);

  const emptyMessage =
    tab === 'all'
      ? 'There are no upcoming events.'
      : tab === 'my'
        ? 'You are not on any rosters.'
        : "You haven't participated in any past event.";

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 space-y-6 h-[calc(100vh-11rem)] max-h-[calc(100vh-11rem)] overflow-hidden">
        {/* Header + tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Events</h1>
            <p className="mt-1 text-sm text-slate-600">
              Browse upcoming events and track your roster status.
            </p>
          </div>

          <ToggleGroup
            type="single"
            value={tab}
            onValueChange={(v) => v && setTab(v as TabValue)}
            className="inline-flex rounded-lg border border-gray-200 p-1 shadow-sm self-start sm:self-auto"
          >
            {TABS.map(({ value, label }) => (
              <ToggleGroupItem
                key={value}
                value={value}
                className={clsxm(
                  'rounded-md px-3 py-1.5 text-xs sm:text-sm font-medium transition-all',
                  tab === value
                    ? 'bg-appPrimary text-white shadow-md'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                )}
              >
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {/* Content card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2 min-w-0 w-full sm:w-auto sm:justify-start sm:gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <CalendarRange className="h-5 w-5 shrink-0 text-appPrimary" />
                  <div className="min-w-0">
                    <CardTitle className="text-base">
                      {tab === 'all'
                        ? 'All Events'
                        : tab === 'my'
                          ? 'My Events'
                          : 'Past Events'}
                    </CardTitle>
                    {!isLoading && !isSearching && (
                      <p className="text-xs text-slate-600">
                        {activeEvents.length} event
                        {activeEvents.length !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </div>
                {incomingCoverCount > 0 && (
                  <Button
                    type="button"
                    variant="outline-primary"
                    size="sm"
                    className="shrink-0 whitespace-nowrap"
                    onClick={() => setIncomingCoverModalOpen(true)}
                  >
                    Cover requests for you
                    <span className="ml-1.5 inline-flex min-w-[1.25rem] justify-center rounded-full bg-appPrimary/15 px-1.5 text-xs font-semibold tabular-nums">
                      {incomingCoverCount}
                    </span>
                  </Button>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                {staffingVenues.length > 1 && (
                  <Select value={venueSlug} onValueChange={setVenueSlug}>
                    <SelectTrigger className="h-[34px] w-full sm:w-56 text-sm border-zinc-200 focus:ring-appPrimary/30 focus:border-appPrimary">
                      <SelectValue
                        placeholder="All Venues"
                        displayText={
                          venueSlug
                            ? (staffingVenues.find((v) => v.slug === venueSlug)
                                ?.name ?? 'All Venues')
                            : 'All Venues'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Venues</SelectItem>
                      {staffingVenues.map((v) => (
                        <SelectItem key={v.slug} value={v.slug}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search events…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className={clsxm(
                      'w-full pl-9 pr-4 py-1.5 text-sm rounded-md border border-zinc-200',
                      'bg-white placeholder:text-zinc-400 text-zinc-900',
                      'focus:outline-none focus:ring-2 focus:ring-appPrimary/30 focus:border-appPrimary'
                    )}
                  />
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {isLoading || isSearching ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-24 rounded-xl bg-zinc-100 animate-pulse"
                  />
                ))}
              </div>
            ) : activeEvents.length === 0 ? (
              <div className="text-center py-16 text-zinc-400">
                <CalendarRange className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm font-medium">
                  {debouncedSearch
                    ? 'No events match your search.'
                    : emptyMessage}
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 content-start [&>*:only-child]:col-span-full overflow-y-auto h-[calc(100vh-23rem)] max-h-[calc(100vh-23rem)] min-h-0 pr-1 -mr-1 py-2 -my-2">
                {activeEvents.map((event) => (
                  <EventCard
                    key={event._id}
                    event={event}
                    imageBaseUrl={primaryCompany?.imageUrl}
                    onClick={() => setSelectedEvent(event)}
                  />
                ))}
                {/* Scroll sentinel — triggers next page load when it enters the viewport */}
                <div ref={sentinelRef} className="col-span-full h-4" />
                {isFetchingNext && (
                  <div className="col-span-full flex justify-center py-3">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-appPrimary border-t-transparent" />
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          imageBaseUrl={primaryCompany?.imageUrl}
          open={!!selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onEnrollmentChange={(eventId, newType) => {
            setSelectedEvent((prev) =>
              prev?._id === eventId
                ? { ...prev, rosterStatus: newType, status: newType }
                : prev
            );
            queryClient.invalidateQueries({ queryKey: ['events-all'] });
            queryClient.invalidateQueries({ queryKey: ['events-my'] });
            queryClient.invalidateQueries({ queryKey: ['events-past'] });
          }}
        />
      )}

      <IncomingCoverRequestsModal
        open={incomingCoverModalOpen}
        onClose={() => setIncomingCoverModalOpen(false)}
        items={incomingCoverList}
        isLoading={incomingCoverListLoading}
      />
    </Layout>
  );
}
