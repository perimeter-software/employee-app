'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { ChevronDown, Clock } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { CircularTimer } from '../TimerCard/CircularTimer';
import { ElapsedTime } from '../TimerCard/ElapsedTime';
import { useRosterEvents, useEventClockIn, useEventClockOut } from '@/domains/event/hooks';
import type { GignologyUser } from '@/domains/user/types';
import type { GignologyEvent, EventApplicant } from '@/domains/event/types';

// ---------------------------------------------------------------------------
// Clock-state logic — mirrors EventsTable.tsx computeClockState
// ---------------------------------------------------------------------------
interface ClockState {
  showClockIn: boolean;
  showClockOut: boolean;
  clockInButtonDisabled: boolean;
  clockOutButtonDisabled: boolean;
  showEarlyClockInWarning: boolean;
  clockInTime?: string;
  clockOutTime?: string;
}

function computeClockState(
  reportTimeIso: string,
  allowEarlyClockin: boolean,
  actualTimeIn: string | null | undefined,
  actualTimeOut: string | null | undefined
): ClockState {
  const now = new Date();
  const reportTime = new Date(reportTimeIso);
  const clockedIn = !!actualTimeIn;
  const clockedOut = !!actualTimeOut;

  const inWindow = now >= new Date(reportTime.getTime() - 6.5 * 60 * 60 * 1000);

  if (!inWindow) {
    return {
      showClockIn: false,
      showClockOut: false,
      clockInButtonDisabled: true,
      clockOutButtonDisabled: true,
      showEarlyClockInWarning: false,
    };
  }

  let showClockIn = false;
  let showClockOut = false;
  let clockInButtonDisabled = true;
  let showEarlyClockInWarning = false;
  let clockOutButtonDisabled = true;
  let clockInTime: string | undefined;
  let clockOutTime: string | undefined;

  if (!clockedIn) {
    if (reportTime > now && now < new Date(reportTime.getTime() + 6 * 60 * 60 * 1000)) {
      showClockIn = true;
      const msDiff = reportTime.getTime() - now.getTime();
      if (msDiff <= 15 * 60 * 1000) {
        clockInButtonDisabled = false;
      } else if (allowEarlyClockin && msDiff <= 60 * 60 * 1000) {
        clockInButtonDisabled = false;
        showEarlyClockInWarning = true;
      }
    } else if (
      reportTime <= now &&
      now < new Date(reportTime.getTime() + 12 * 60 * 60 * 1000)
    ) {
      showClockIn = true;
      clockInButtonDisabled = false;
    }
  } else if (clockedIn && !clockedOut) {
    showClockOut = true;
    clockOutButtonDisabled = now <= new Date(actualTimeIn!);
    clockInTime = new Date(actualTimeIn!).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } else {
    clockInTime = new Date(actualTimeIn!).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    clockOutTime = new Date(actualTimeOut!).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }

  return {
    showClockIn,
    showClockOut,
    clockInButtonDisabled,
    clockOutButtonDisabled,
    showEarlyClockInWarning,
    clockInTime,
    clockOutTime,
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface ActionableItem {
  event: GignologyEvent;
  applicantEntry: EventApplicant | undefined;
  clockState: ClockState;
}

interface EventTimerCardProps {
  userData: GignologyUser;
}

// ---------------------------------------------------------------------------
// Inner content — no Card wrapper, suitable for embedding in a tab
// ---------------------------------------------------------------------------
export function EventTimerCardContent({ userData }: EventTimerCardProps) {
  const applicantId = userData.applicantId || '';
  const agentName = [userData.firstName, userData.lastName].filter(Boolean).join(' ');
  const userId = userData._id || '';

  const { startDate, endDate } = useMemo(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(23, 59, 59, 999);

    return { startDate: yesterday.toISOString(), endDate: tomorrow.toISOString() };
  }, []);

  const { data: events, isLoading } = useRosterEvents({ applicantId, startDate, endDate });

  const clockInMutation = useEventClockIn();
  const clockOutMutation = useEventClockOut();
  const isMutating = clockInMutation.isPending || clockOutMutation.isPending;

  const [currentTime, setCurrentTime] = useState(() =>
    new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  );
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(
        new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      );
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const actionableItems = useMemo((): ActionableItem[] => {
    if (!events?.length || !applicantId) return [];
    const now = new Date();
    return events
      .map((event): ActionableItem | null => {
        const applicantEntry = event.applicants?.find(
          (a) => a.id === applicantId && a.status === 'Roster'
        );
        const reportTimeIso = applicantEntry?.reportTime ?? event.eventDate;
        const reportTime = new Date(reportTimeIso);

        const inWindow = now >= new Date(reportTime.getTime() - 6.5 * 60 * 60 * 1000);
        if (!inWindow) return null;

        const clockState = computeClockState(
          reportTimeIso,
          event.allowEarlyClockin === 'Yes',
          applicantEntry?.timeIn,
          applicantEntry?.timeOut
        );

        if (clockState.clockInTime && clockState.clockOutTime) return null;

        return { event, applicantEntry, clockState };
      })
      .filter((item): item is ActionableItem => item !== null);
  }, [events, applicantId]);

  const venues = useMemo(() => {
    const map = new Map<string, string>();
    for (const { event } of actionableItems) {
      if (event.venueSlug) {
        map.set(event.venueSlug, event.venueName || event.venueSlug);
      }
    }
    return Array.from(map.entries()).map(([slug, name]) => ({ slug, name }));
  }, [actionableItems]);

  const [selectedVenueSlug, setSelectedVenueSlug] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  useEffect(() => {
    if (venues.length === 0) {
      setSelectedVenueSlug(null);
      setSelectedEventId(null);
    } else if (venues.length === 1) {
      setSelectedVenueSlug(venues[0].slug);
    } else if (selectedVenueSlug && !venues.find((v) => v.slug === selectedVenueSlug)) {
      setSelectedVenueSlug(venues[0].slug);
      setSelectedEventId(null);
    }
  }, [venues, selectedVenueSlug]);

  const venueEvents = useMemo(
    () => actionableItems.filter((item) => item.event.venueSlug === selectedVenueSlug),
    [actionableItems, selectedVenueSlug]
  );

  useEffect(() => {
    if (venueEvents.length === 0) {
      setSelectedEventId(null);
    } else if (venueEvents.length === 1) {
      setSelectedEventId(venueEvents[0].event._id);
    } else if (selectedEventId && !venueEvents.find((item) => item.event._id === selectedEventId)) {
      setSelectedEventId(null);
    }
  }, [venueEvents, selectedEventId]);

  const selectedItem = useMemo(
    () => actionableItems.find((item) => item.event._id === selectedEventId) ?? null,
    [actionableItems, selectedEventId]
  );

  const handleClockIn = () => {
    if (!selectedEventId || !selectedItem?.clockState?.showClockIn || selectedItem.clockState.clockInButtonDisabled) return;
    clockInMutation.mutate({
      eventId: selectedEventId,
      payload: { applicantId, agent: agentName, createAgent: userId },
    });
  };

  const handleClockOut = () => {
    if (!selectedEventId || !selectedItem?.clockState?.showClockOut || selectedItem.clockState.clockOutButtonDisabled) return;
    clockOutMutation.mutate({
      eventId: selectedEventId,
      payload: { applicantId, agent: agentName, createAgent: userId },
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="w-full h-12 bg-gray-200" />
        <Skeleton className="w-full h-12 bg-gray-200" />
        <Skeleton className="w-64 h-64 bg-gray-200 mx-auto rounded-full" />
      </div>
    );
  }

  if (actionableItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <Clock className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm">No upcoming events</p>
      </div>
    );
  }

  const clockState = selectedItem?.clockState;
  const isActive = !!clockState?.showClockOut;
  const venueDropdownDisabled = isActive;

  return (
    <>
      {/* Venue and Event selectors */}
      <div className="space-y-4 mb-8">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-between h-12 text-base font-medium border-2 border-gray-200 hover:border-blue-300 data-[state=open]:border-blue-300"
              disabled={venueDropdownDisabled}
              title={
                venueDropdownDisabled
                  ? 'Clock out of the current event first'
                  : 'Select a venue'
              }
            >
              <span className="truncate">
                {venues.find((v) => v.slug === selectedVenueSlug)?.name || 'Select Venue'}
              </span>
              <ChevronDown className="h-5 w-5 flex-shrink-0 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-[var(--radix-dropdown-menu-trigger-width)] w-[var(--radix-dropdown-menu-trigger-width)] max-h-60 overflow-y-auto"
            align="start"
          >
            {venues.map((venue) => (
              <DropdownMenuItem
                key={venue.slug}
                onClick={() => {
                  setSelectedVenueSlug(venue.slug);
                  setSelectedEventId(null);
                }}
                className={`cursor-pointer py-1.5 px-2 ${
                  selectedVenueSlug === venue.slug
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : ''
                }`}
              >
                {venue.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {selectedVenueSlug && venueEvents.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-between h-12 text-base font-medium border-2 border-gray-200 hover:border-blue-300 data-[state=open]:border-blue-300"
                disabled={venueDropdownDisabled}
                title={
                  venueDropdownDisabled
                    ? 'Clock out of the current event first'
                    : 'Select an event'
                }
              >
                <span className="truncate">
                  {venueEvents.find((item) => item.event._id === selectedEventId)?.event
                    .eventName || 'Select Event'}
                </span>
                <ChevronDown className="h-5 w-5 flex-shrink-0 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="min-w-[var(--radix-dropdown-menu-trigger-width)] w-[var(--radix-dropdown-menu-trigger-width)] max-h-60 overflow-y-auto"
              align="start"
            >
              {venueEvents.map(({ event }) => (
                <DropdownMenuItem
                  key={event._id}
                  onClick={() => setSelectedEventId(event._id)}
                  className={`cursor-pointer py-1.5 px-2 ${
                    selectedEventId === event._id
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : ''
                  }`}
                >
                  <div className="flex flex-col items-start">
                    <span className="truncate">{event.eventName}</span>
                    <span className="text-xs text-muted-foreground font-normal">
                      {new Date(event.eventDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Timer display */}
      {selectedItem && clockState ? (
        isActive ? (
          <ElapsedTime
            startTime={selectedItem.applicantEntry?.timeIn!}
            shiftEndTime={selectedItem.event.eventEndTime}
            onClick={
              !clockState.clockOutButtonDisabled && !isMutating ? handleClockOut : undefined
            }
          />
        ) : (
          <CircularTimer
            time={currentTime}
            isActive={false}
            onClick={handleClockIn}
            disabled={clockState.clockInButtonDisabled || isMutating}
          />
        )
      ) : (
        <CircularTimer
          time={currentTime}
          isActive={false}
          onClick={() => {}}
          disabled={true}
        />
      )}

      {/* Early clock-in warning */}
      {clockState?.showEarlyClockInWarning && (
        <p className="text-xs text-amber-600 text-center -mt-2 mb-4">
          Early clock-in is enabled for this event
        </p>
      )}

      {/* Bottom info row */}
      <div className="flex justify-between items-center mt-4 text-sm text-gray-500">
        <span>
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </span>
        {isMutating && <Clock className="h-4 w-4 animate-spin text-blue-500" />}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Standalone card — kept for backward compatibility
// ---------------------------------------------------------------------------
export function EventTimerCard({ userData }: EventTimerCardProps) {
  return (
    <Card className="w-full max-w-lg shadow-lg border-0 rounded-2xl">
      <CardContent className="py-8 px-8">
        <EventTimerCardContent userData={userData} />
      </CardContent>
    </Card>
  );
}
