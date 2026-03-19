'use client';

import React, { useMemo, useState } from 'react';
import { Building2, Search } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import Layout from '@/components/layout/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/ToggleGroup';
import { useCurrentUser } from '@/domains/user';
import { usePrimaryCompany } from '@/domains/company/hooks/use-primary-company';
import { baseInstance } from '@/lib/api/instance';
import { clsxm } from '@/lib/utils';
import {
  VenueCard,
  VenueDetailModal,
  useGeoCoords,
  type VenueWithStatus,
} from '@/domains/venue';

// ─── Page-local constants ─────────────────────────────────────────────────────

type TabValue = 'all' | 'my' | 'pending';

const TABS: { value: TabValue; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'my', label: 'My Venues' },
  { value: 'pending', label: 'Pending' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function VenueRequestsPage() {
  const { data: currentUser } = useCurrentUser();
  const { data: primaryCompany } = usePrimaryCompany();
  const coords = useGeoCoords();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<TabValue>('all');
  const [search, setSearch] = useState('');
  const [selectedVenue, setSelectedVenue] = useState<VenueWithStatus | null>(null);

  const venueQueryKey = ['venues', coords?.longitude, coords?.latitude] as const;

  const { data: venues = [], isLoading } = useQuery({
    queryKey: venueQueryKey,
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (coords?.longitude != null) searchParams.set('longitude', String(coords.longitude));
      if (coords?.latitude != null) searchParams.set('latitude', String(coords.latitude));
      const qs = searchParams.toString();
      const res = await baseInstance.get<VenueWithStatus[]>(`venues${qs ? `?${qs}` : ''}`);
      if (!res.success || !res.data) throw new Error('Failed to fetch venues');
      return res.data;
    },
    enabled: !!currentUser,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: (count, err) => {
      const msg = (err as Error).message;
      if (msg.includes('401') || msg.includes('403')) return false;
      return count < 2;
    },
  });

  const handleStatusChange = (slug: string, newStatus: string) => {
    queryClient.setQueryData<VenueWithStatus[]>(venueQueryKey, (prev) =>
      prev?.map((v) => (v.slug === slug ? { ...v, userVenueStatus: newStatus } : v)) ?? []
    );
    setSelectedVenue((prev) =>
      prev?.slug === slug ? { ...prev, userVenueStatus: newStatus } : prev
    );
  };

  const filtered = useMemo(() => {
    let list = venues;
    if (tab === 'my') list = list.filter((v) => v.userVenueStatus === 'StaffingPool');
    else if (tab === 'pending') list = list.filter((v) => v.userVenueStatus === 'Pending');
    if (search.trim()) {
      const term = search.toLowerCase();
      list = list.filter((v) => v.name.toLowerCase().includes(term));
    }
    return list;
  }, [venues, tab, search]);

  const myVenueCount = venues.filter((v) => v.userVenueStatus === 'StaffingPool').length;
  const pendingCount = venues.filter((v) => v.userVenueStatus === 'Pending').length;

  const tabCount = (t: TabValue) =>
    t === 'my' ? myVenueCount : t === 'pending' ? pendingCount : null;

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8 space-y-6 h-[calc(100vh-11rem)] max-h-[calc(100vh-11rem)] overflow-hidden">
        {/* Header + tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Venues</h1>
            <p className="mt-1 text-sm text-slate-600">
              Browse available venues and track your applications.
            </p>
          </div>

          <ToggleGroup
            type="single"
            value={tab}
            onValueChange={(v) => v && setTab(v as TabValue)}
            className="inline-flex rounded-lg border border-gray-200 p-1 shadow-sm self-start sm:self-auto"
          >
            {TABS.map(({ value, label }) => {
              const count = tabCount(value);
              return (
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
                  <span className="inline-flex items-center gap-1.5">
                    {label}
                    {count != null && count > 0 && (
                      <span className={clsxm(
                        'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold',
                        tab === value ? 'bg-white text-appPrimary' : 'bg-appPrimary text-white'
                      )}>
                        {count}
                      </span>
                    )}
                  </span>
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
        </div>

        {/* Content card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-appPrimary" />
                <div>
                  <CardTitle className="text-base">
                    {tab === 'all' ? 'All Venues' : tab === 'my' ? 'My Venues' : 'Pending Applications'}
                  </CardTitle>
                  <p className="text-xs text-slate-600">
                    {filtered.length} venue{filtered.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search venues…"
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
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-24 rounded-xl bg-zinc-100 animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-zinc-400">
                <Building2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm font-medium">
                  {search ? 'No venues match your search.' : 'No venues found.'}
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 content-start [&>*:only-child]:col-span-full overflow-y-auto h-[calc(100vh-23rem)] max-h-[calc(100vh-23rem)] min-h-0 pr-1 -mr-1 py-2 -my-2">
                {filtered.map((venue) => (
                  <VenueCard
                    key={venue._id}
                    venue={venue}
                    imageBaseUrl={primaryCompany?.imageUrl}
                    onClick={() => setSelectedVenue(venue)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {selectedVenue && (
        <VenueDetailModal
          venue={selectedVenue}
          imageBaseUrl={primaryCompany?.imageUrl}
          open
          onClose={() => setSelectedVenue(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </Layout>
  );
}
