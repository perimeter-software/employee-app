'use client';

import { useMemo } from 'react';
import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui/Card';
import { MapPin, Clock, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { clsxm } from '@/lib/utils';
import { useEventClockIn, useEventClockOut } from '@/domains/event/hooks';
import type { GignologyEvent, EventApplicant } from '@/domains/event/types';

// ---------------------------------------------------------------------------
// Clock-state logic (mirrored from EventsTable.tsx)
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
    } else if (reportTime <= now && now < new Date(reportTime.getTime() + 12 * 60 * 60 * 1000)) {
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
// Helpers
// ---------------------------------------------------------------------------
function formatTimeRange(eventDate: string, eventEndTime?: string): string {
  try {
    const start = format(new Date(eventDate), 'h:mm a');
    if (!eventEndTime) return start;
    try {
      const end = format(new Date(eventEndTime), 'h:mm a');
      return `${start} – ${end}`;
    } catch {
      return `${start} – ${eventEndTime}`;
    }
  } catch {
    return '';
  }
}

function isEventActive(eventDate: string): boolean {
  try {
    const d = new Date(eventDate);
    return d <= new Date() || d.toDateString() === new Date().toDateString();
  } catch {
    return false;
  }
}

function getMonthLabel(eventDate: string): string {
  try {
    return format(new Date(eventDate), 'MMM').toUpperCase();
  } catch {
    return '';
  }
}

function getDayLabel(eventDate: string): string {
  try {
    return format(new Date(eventDate), 'd');
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export interface ShiftCardProps {
  event: GignologyEvent;
  applicantId: string;
  userId: string;
  agentName: string;
  onClick: () => void;
}

export function ShiftCard({ event, applicantId, userId, agentName, onClick }: ShiftCardProps) {
  const today = isEventActive(event.eventDate);
  const location = [event.venueCity, event.venueState].filter(Boolean).join(', ');
  const timeRange = formatTimeRange(event.eventDate, event.eventEndTime);

  const clockInMutation = useEventClockIn();
  const clockOutMutation = useEventClockOut();

  // Only compute clock state for events within 12 hours — farther-out events
  // can't be clocked in so there's no point running the logic.
  const within12h = useMemo(() => {
    try {
      return new Date(event.eventDate).getTime() - Date.now() <= 12 * 60 * 60 * 1000;
    } catch {
      return false;
    }
  }, [event.eventDate]);

  const clockState = useMemo((): ClockState | null => {
    if (!within12h) return null;
    const applicantEntry = event.applicants?.find(
      (a: EventApplicant) => a.id === applicantId && a.status === 'Roster'
    );
    const reportTimeIso = applicantEntry?.reportTime ?? event.eventDate;
    return computeClockState(
      reportTimeIso,
      event.allowEarlyClockin === 'Yes',
      applicantEntry?.timeIn,
      applicantEntry?.timeOut
    );
  }, [within12h, event, applicantId]);

  const isMutating = clockInMutation.isPending || clockOutMutation.isPending;
  const showClockButton = clockState && (clockState.showClockIn || clockState.showClockOut);

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          {/* Date badge */}
          <div className="shrink-0 w-11 rounded-lg bg-appPrimary text-white text-center py-1.5">
            <p className="text-[10px] font-semibold uppercase leading-none tracking-wide">
              {getMonthLabel(event.eventDate)}
            </p>
            <p className="text-lg font-bold leading-tight">
              {getDayLabel(event.eventDate)}
            </p>
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0">
            <div className="mb-0.5">
              <span
                className={clsxm(
                  'text-[10px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide',
                  today ? 'bg-green-100 text-green-700' : 'bg-sky-100 text-sky-700'
                )}
              >
                {today ? 'TODAY' : 'UPCOMING'}
              </span>
            </div>
            <p className="text-sm font-semibold text-gray-900 leading-snug">
              {event.eventName}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
              {timeRange && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Clock className="w-3 h-3 shrink-0" />
                  {timeRange}
                </span>
              )}
              {location && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <MapPin className="w-3 h-3 shrink-0" />
                  {location}
                </span>
              )}
            </div>
          </div>

          {/* Action */}
          {showClockButton ? (
            <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
              {clockState.showClockIn && (
                <Button
                  size="sm"
                  className="text-xs bg-appPrimary hover:bg-appPrimary/90 text-white disabled:opacity-50"
                  disabled={isMutating || clockState.clockInButtonDisabled}
                  title={
                    clockState.showEarlyClockInWarning
                      ? 'Early clock-in — arriving before your scheduled report time'
                      : undefined
                  }
                  onClick={() =>
                    clockInMutation.mutate({
                      eventId: event._id,
                      payload: { applicantId, agent: agentName, createAgent: userId },
                      geoFence: event.geoFence,
                    })
                  }
                >
                  {clockInMutation.isPending ? (
                    <Clock className="w-3 h-3 animate-spin" />
                  ) : (
                    <>
                      <Clock className="w-3 h-3 mr-1" />
                      Clock In
                    </>
                  )}
                </Button>
              )}
              {clockState.showClockOut && (
                <Button
                  size="sm"
                  className="text-xs bg-red-500 hover:bg-red-600 text-white disabled:opacity-50"
                  disabled={isMutating || clockState.clockOutButtonDisabled}
                  onClick={() =>
                    clockOutMutation.mutate({
                      eventId: event._id,
                      payload: { applicantId, agent: agentName, createAgent: userId },
                    })
                  }
                >
                  {clockOutMutation.isPending ? (
                    <Clock className="w-3 h-3 animate-spin" />
                  ) : (
                    <>
                      <Clock className="w-3 h-3 mr-1" />
                      Clock Out
                    </>
                  )}
                </Button>
              )}
            </div>
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
