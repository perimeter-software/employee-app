'use client';

import { NextPage } from 'next';
import Layout from '@/components/layout/Layout';
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/Card';
import { Bell, MapPin, CalendarRange } from 'lucide-react';
import { useCurrentUser } from '@/domains/user';
import { useAppUser } from '@/domains/user/hooks/useAppUser';
import { usePageAuth } from '@/domains/shared/hooks/use-page-auth';
import {
  AuthErrorState,
  AuthLoadingState,
  UnauthenticatedState,
} from '@/components/shared/PageProtection';
import { DashboardView } from '@/domains/dashboard/components/DashboardView';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { baseInstance } from '@/lib/api/instance';
import type { VenueWithStatus } from '@/domains/venue/types/venue.types';
import { useRosterEvents } from '@/domains/event/hooks';
import type { GignologyEvent } from '@/domains/event/types';
import { EventDetailModal } from '@/domains/event';
import { useUserNotifications } from '@/domains/notification/hooks';
import { useNotifications } from '@/domains/notification/hooks';
import { usePrimaryCompany } from '@/domains/company/hooks/use-primary-company';
import { StatCard } from '@/domains/home/components/StatCard';
import { ShiftCard } from '@/domains/home/components/ShiftCard';
import { ShiftCardSkeleton } from '@/domains/home/components/ShiftCardSkeleton';

const HomePage: NextPage = () => {
  const { user, error: authError, isLoading: authLoading } = useAppUser();
  const { data: currentUser, isLoading: currentUserLoading } = useCurrentUser();
  const { data: primaryCompany } = usePrimaryCompany();
  const queryClient = useQueryClient();
  const [selectedEvent, setSelectedEvent] = useState<GignologyEvent | null>(null);
  const {
    shouldShowContent,
    isLoading: pageAuthLoading,
    error: pageAuthError,
  } = usePageAuth({ requireAuth: true });

  // ── My Venues (staffing pool count) ──────────────────────────────────────
  // Uses the same query key as the venues page so the cache is shared
  const { data: allVenues = [], isLoading: venuesLoading } = useQuery({
    queryKey: ['venues', 'visible'] as const,
    queryFn: async () => {
      const res = await baseInstance.get<VenueWithStatus[]>('venues');
      if (!res.success || !res.data) return [];
      return res.data;
    },
    enabled: !!currentUser,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
  const myVenuesCount = useMemo(
    () => allVenues.filter((v) => v.userVenueStatus === 'StaffingPool').length,
    [allVenues]
  );

  // ── Roster events (upcoming + today) ─────────────────────────────────────
  const applicantId = currentUser?.applicantId || '';
  const userId = currentUser?._id || '';
  const agentName = [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ');

  // 12-hour lookback — matches the clock-in window so events that started
  // recently (e.g. late last night) are still visible and clockable.
  const windowStart = useMemo(
    () => new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    []
  );

  const { data: rosterEvents = [], isLoading: eventsLoading } = useRosterEvents({
    applicantId,
    startDate: windowStart,
  });

  // Client-side guard: drop events older than the 12-hour window
  const upcomingEvents: GignologyEvent[] = useMemo(() => {
    const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000);
    return rosterEvents
      .filter((e) => {
        try {
          return new Date(e.eventDate) >= cutoff;
        } catch {
          return false;
        }
      })
      .sort(
        (a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime()
      );
  }, [rosterEvents]);

  // ── Unread notifications ──────────────────────────────────────────────────
  // Mirrors the exact logic in NotificationBell.tsx
  const { data: notifData, isLoading: notifLoading } = useUserNotifications();
  const { notifications: localNotifications } = useNotifications();
  const unreadCount = useMemo(() => {
    const server = notifData?.notifications || [];
    return [...server, ...localNotifications].filter(
      (n) => n.status === 'unread'
    ).length;
  }, [notifData?.notifications, localNotifications]);

  // ── Auth guards ───────────────────────────────────────────────────────────
  if (authLoading || currentUserLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-appPrimary border-t-transparent" />
      </div>
    );
  }

  if (pageAuthLoading) return <AuthLoadingState />;
  if (pageAuthError || authError) {
    const msg =
      pageAuthError?.message ||
      (authError && typeof authError === 'object' && 'message' in authError
        ? (authError as { message: string }).message
        : 'Authentication error');
    return <AuthErrorState error={msg} />;
  }
  if (!shouldShowContent) return <UnauthenticatedState />;

  const firstName =
    currentUser?.firstName ||
    (user as { given_name?: string } | null)?.given_name ||
    'there';

  return (
    <Layout>
      <div className="space-y-4">
        {/* Mobile greeting */}
        <div className="lg:hidden">
          <h2 className="text-2xl font-bold text-gray-900">Hi, {firstName}</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Welcome back. Here&apos;s what&apos;s happening.
          </p>
        </div>

        {/* Collapsible dashboard summary */}
        <DashboardView mode="mini" />

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            icon={MapPin}
            label="My Venues"
            value={myVenuesCount}
            isLoading={venuesLoading}
          />
          <StatCard
            icon={CalendarRange}
            label="Upcoming"
            value={upcomingEvents.length}
            isLoading={eventsLoading}
          />
          <StatCard
            icon={Bell}
            label="Unread"
            value={unreadCount}
            isLoading={notifLoading}
          />
        </div>

        {/* What's Next */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">
              What&apos;s next
            </h2>
            <Link
              href="/events"
              className="text-sm text-appPrimary font-medium hover:underline"
            >
              View all
            </Link>
          </div>

          {eventsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <ShiftCardSkeleton key={i} />
              ))}
            </div>
          ) : upcomingEvents.length === 0 ? (
            <Card>
              <CardContent className="py-12 flex flex-col items-center text-center">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                  <CalendarRange className="w-6 h-6 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-700">
                  No upcoming shifts
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  When you&apos;re rostered, your next shift shows up here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {upcomingEvents.map((event) => (
                <ShiftCard
                  key={event._id}
                  event={event}
                  applicantId={applicantId}
                  userId={userId}
                  agentName={agentName}
                  onClick={() => setSelectedEvent(event)}
                />
              ))}
            </div>
          )}
        </div>
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
            queryClient.invalidateQueries({ queryKey: ['event'] });
            queryClient.invalidateQueries({ queryKey: ['events-my'] });
          }}
        />
      )}
    </Layout>
  );
};

export default HomePage;
