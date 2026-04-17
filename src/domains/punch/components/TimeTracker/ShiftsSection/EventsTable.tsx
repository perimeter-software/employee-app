'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Table } from '@/components/ui/Table';
import { TableColumn } from '@/components/ui/Table/types';
import { Skeleton } from '@/components/ui/Skeleton';
import { Clock } from 'lucide-react';
import { toast } from 'sonner';
import {
  useRosterEvents,
  useEventClockIn,
  useEventClockOut,
} from '@/domains/event/hooks';
import type { GignologyEvent, EventApplicant } from '@/domains/event/types';
import {
  EventCoverRequestModal,
  type EventCoverModalIntent,
} from '@/domains/event/components/EventCoverRequestModal/EventCoverRequestModal';
import { EventCallOffConfirmModal } from '@/domains/event/components/EventCallOffConfirmModal/EventCallOffConfirmModal';
import {
  IncomingCoverRequestsModal,
  INCOMING_COVER_REQUESTS_QUERY_KEY,
} from '@/domains/event/components/IncomingCoverRequestsModal/IncomingCoverRequestsModal';
import {
  EventApiService,
  invalidateEventListCaches,
} from '@/domains/event/services';
import { isEventCoverWindowOpen } from '@/domains/event/utils/event-cover-window';

// ---------------------------------------------------------------------------
// Clock-state logic — replicates the backend showClockIn function.
// The 6.5h pre-event window is used for initial button visibility.
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

  // Only show buttons within 6.5h before report time (or once event has started)
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
    // Before report time but within 6h window
    if (
      reportTime > now &&
      now < new Date(reportTime.getTime() + 6 * 60 * 60 * 1000)
    ) {
      showClockIn = true;
      const msDiff = reportTime.getTime() - now.getTime();
      if (msDiff <= 15 * 60 * 1000) {
        clockInButtonDisabled = false;
      } else if (allowEarlyClockin && msDiff <= 60 * 60 * 1000) {
        clockInButtonDisabled = false;
        showEarlyClockInWarning = true;
      }
    }
    // After report time, within 12h window
    else if (
      reportTime <= now &&
      now < new Date(reportTime.getTime() + 12 * 60 * 60 * 1000)
    ) {
      showClockIn = true;
      clockInButtonDisabled = false;
    }
  } else if (clockedIn && !clockedOut) {
    showClockOut = true;
    clockOutButtonDisabled = now <= new Date(actualTimeIn!);
    clockInTime = formatTime(actualTimeIn!);
  } else {
    // Both clocked in and out — display only
    clockInTime = formatTime(actualTimeIn!);
    clockOutTime = formatTime(actualTimeOut!);
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
const formatTime = (isoString: string): string =>
  new Date(isoString).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

const formatDate = (isoString: string): string =>
  new Date(isoString).toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });

// ---------------------------------------------------------------------------
// Row data
// ---------------------------------------------------------------------------
interface EventRowData extends Record<string, unknown> {
  eventId: string;
  eventName: string;
  eventDate: Date;
  eventDateDisplay: string;
  venueName: string;
  venueLocation: string;
  scheduledTimeIn: string;
  scheduledTimeOut: string;
  isPast: boolean;
  reportTimeIso: string;
  allowEarlyClockin: boolean;
  actualTimeIn: string | null | undefined;
  actualTimeOut: string | null | undefined;
  rawEvent: GignologyEvent;
}

function buildEventRows(
  events: GignologyEvent[],
  applicantId: string
): EventRowData[] {
  const now = new Date();

  return events
    .map((event): EventRowData | null => {
      const applicantEntry: EventApplicant | undefined = event.applicants?.find(
        (a) => a.id === applicantId && a.status === 'Roster'
      );

      const eventDate = new Date(event.eventDate);
      const eventEnd = event.eventEndTime ? new Date(event.eventEndTime) : null;

      const reportTimeIso = applicantEntry?.reportTime ?? event.eventDate;
      const scheduledTimeIn = formatTime(reportTimeIso);
      const scheduledTimeOut = eventEnd
        ? formatTime(event.eventEndTime!)
        : '----';

      const venueLocation = [event.venueCity, event.venueState]
        .filter(Boolean)
        .join(', ');

      return {
        eventId: event._id,
        eventName: event.eventName,
        eventDate,
        eventDateDisplay: formatDate(event.eventDate),
        venueName: event.venueName || '—',
        venueLocation: venueLocation || '—',
        scheduledTimeIn,
        scheduledTimeOut,
        isPast: eventEnd ? now > eventEnd : now > eventDate,
        reportTimeIso,
        allowEarlyClockin: event.allowEarlyClockin === 'Yes',
        actualTimeIn: applicantEntry?.timeIn,
        actualTimeOut: applicantEntry?.timeOut,
        rawEvent: event,
      };
    })
    .filter((row): row is EventRowData => row !== null)
    .sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime());
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
interface EventsTableProps {
  applicantId: string;
  /** _id of the current user (used as createAgent) */
  userId: string;
  /** Full name of the current user (used as agent) */
  agentName: string;
  dateRange: {
    startDate: string;
    endDate: string;
    displayRange: string;
  };
  isBlockedByJobPunch?: boolean;
  hasActiveEventClockIn?: boolean;
  onEventClick?: (event: GignologyEvent) => void;
}

export function EventsTable({
  applicantId,
  userId,
  agentName,
  dateRange,
  isBlockedByJobPunch = false,
  hasActiveEventClockIn = false,
  onEventClick,
}: EventsTableProps) {
  const queryClient = useQueryClient();
  const [incomingListModalOpen, setIncomingListModalOpen] = useState(false);
  const { data: incomingCoverList = [], isLoading: incomingCoverListLoading } =
    useQuery({
      queryKey: INCOMING_COVER_REQUESTS_QUERY_KEY,
      queryFn: () => EventApiService.listIncomingCoverRequests(),
      staleTime: 30 * 1000,
    });
  const incomingCoverCount = incomingCoverList.length;

  const {
    data: events,
    isLoading,
    error,
  } = useRosterEvents({
    applicantId,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  const clockInMutation = useEventClockIn();
  const clockOutMutation = useEventClockOut();

  const [coverModal, setCoverModal] = useState<{
    event: GignologyEvent;
    intent: EventCoverModalIntent;
  } | null>(null);
  const [callOffTarget, setCallOffTarget] = useState<{
    eventId: string;
    pendingRequestId: string | null;
  } | null>(null);
  const [callOffEventId, setCallOffEventId] = useState<string | null>(null);

  const handleSubmitCallOff = useCallback(
    async (eventId: string, notes: string): Promise<boolean> => {
      setCallOffEventId(eventId);
      try {
        await EventApiService.submitEventCallOff(eventId, notes || undefined);
        toast.success('Call-off request submitted.');
        await invalidateEventListCaches(queryClient);
        return true;
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Unable to submit call-off.'
        );
        return false;
      } finally {
        setCallOffEventId(null);
      }
    },
    [queryClient]
  );

  const handleRemoveCallOffRequest = useCallback(
    async (eventId: string, requestId: string): Promise<boolean> => {
      setCallOffEventId(eventId);
      try {
        await EventApiService.deleteEventCallOffRequest(requestId);
        toast.success('Call-off request removed.');
        await invalidateEventListCaches(queryClient);
        return true;
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : 'Unable to remove request.'
        );
        return false;
      } finally {
        setCallOffEventId(null);
      }
    },
    [queryClient]
  );

  const eventRows = useMemo(() => {
    if (!events?.length) return [];
    return buildEventRows(events, applicantId);
  }, [events, applicantId]);

  const columns: TableColumn<EventRowData>[] = useMemo(
    () => [
      {
        key: 'eventDateDisplay',
        header: 'Date & Time',
        render: (value, row) => (
          <div className="space-y-1">
            <div>{String(value)}</div>
            <div className="text-xs text-gray-500">
              {row.scheduledTimeIn} – {row.scheduledTimeOut}
            </div>
          </div>
        ),
      },
      {
        key: 'eventName',
        header: 'Event',
        render: (value) => <span className="font-medium">{String(value)}</span>,
      },
      {
        key: 'venueName',
        header: 'Venue',
        render: (value, row) => (
          <div className="space-y-0.5">
            <div>{String(value)}</div>
            {row.venueLocation !== '—' && (
              <div className="text-xs text-gray-500">{row.venueLocation}</div>
            )}
          </div>
        ),
      },
      {
        key: 'actualTimeIn',
        header: 'Actual Clock In/Out',
        render: (_, row) => {
          const { clockInTime, clockOutTime } = computeClockState(
            row.reportTimeIso,
            row.allowEarlyClockin,
            row.actualTimeIn,
            row.actualTimeOut
          );
          if (clockInTime && clockOutTime) {
            return (
              <div className="text-sm text-gray-700 space-y-0.5">
                <div>In: {clockInTime}</div>
                <div>Out: {clockOutTime}</div>
              </div>
            );
          }
          if (clockInTime) {
            return (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700">In: {clockInTime}</span>
                <Badge
                  variant="outline"
                  className="text-xs bg-green-50 text-green-700"
                >
                  Active
                </Badge>
              </div>
            );
          }
          return <span className="text-gray-400 text-sm">—</span>;
        },
      },
      {
        key: 'isPast',
        header: 'Status',
        render: (_, row) => {
          const { clockInTime, clockOutTime } = computeClockState(
            row.reportTimeIso,
            row.allowEarlyClockin,
            row.actualTimeIn,
            row.actualTimeOut
          );
          if (clockInTime && clockOutTime) {
            return (
              <Badge variant="outline" className="text-xs text-gray-500">
                Completed
              </Badge>
            );
          }
          if (clockInTime) {
            return (
              <Badge
                variant="outline"
                className="text-xs bg-green-50 text-green-700"
              >
                Clocked In
              </Badge>
            );
          }
          if (row.isPast) {
            return (
              <Badge variant="outline" className="text-xs text-gray-400">
                Ended
              </Badge>
            );
          }
          return (
            <Badge
              variant="outline"
              className="text-xs bg-blue-50 text-blue-700"
            >
              Upcoming
            </Badge>
          );
        },
      },
      {
        key: 'eventId',
        header: 'Action',
        render: (value, row) => {
          const eventId = String(value);
          const isMutating =
            clockInMutation.isPending || clockOutMutation.isPending;

          const {
            showClockIn,
            showClockOut,
            clockInButtonDisabled,
            clockOutButtonDisabled,
            showEarlyClockInWarning,
            clockInTime,
            clockOutTime,
          } = computeClockState(
            row.reportTimeIso,
            row.allowEarlyClockin,
            row.actualTimeIn,
            row.actualTimeOut
          );

          const showCover =
            !row.isPast && isEventCoverWindowOpen(row.rawEvent.eventDate);

          const clockButtons =
            !(clockInTime && clockOutTime) && (showClockIn || showClockOut) ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      isMutating ||
                      !showClockIn ||
                      clockInButtonDisabled ||
                      isBlockedByJobPunch ||
                      hasActiveEventClockIn
                    }
                    onClick={() =>
                      clockInMutation.mutate({
                        eventId,
                        payload: {
                          applicantId,
                          agent: agentName,
                          createAgent: userId,
                        },
                      })
                    }
                    className="border-blue-500 text-blue-500 hover:bg-blue-50 disabled:opacity-50"
                    title={
                      isBlockedByJobPunch
                        ? 'You are clocked into a job shift. Please clock out first.'
                        : hasActiveEventClockIn
                          ? 'You are already clocked into another event. Please clock out first.'
                          : showEarlyClockInWarning
                            ? 'Early clock-in — arriving before your scheduled report time'
                            : undefined
                    }
                  >
                    {clockInMutation.isPending ? (
                      <Clock className="h-3 w-3 animate-spin" />
                    ) : (
                      'Clock In'
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      isMutating || !showClockOut || clockOutButtonDisabled
                    }
                    onClick={() =>
                      clockOutMutation.mutate({
                        eventId,
                        payload: {
                          applicantId,
                          agent: agentName,
                          createAgent: userId,
                        },
                      })
                    }
                    className="border-red-500 text-red-500 hover:bg-red-50 disabled:opacity-50"
                  >
                    {clockOutMutation.isPending ? (
                      <Clock className="h-3 w-3 animate-spin" />
                    ) : (
                      'Clock Out'
                    )}
                  </Button>
                </div>
                {showEarlyClockInWarning && (
                  <p className="text-xs text-amber-600">
                    Early clock-in is enabled for this event
                  </p>
                )}
              </div>
            ) : null;

          const coverButtons = showCover ? (
            <div className="flex flex-wrap gap-3 items-start max-w-[260px]">
              <div className="flex flex-col gap-0.5 items-start">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-8 px-2.5 border-violet-500 text-violet-600 hover:bg-violet-50"
                  title="Ask a coworker to cover for you"
                  onClick={() =>
                    setCoverModal({
                      event: row.rawEvent,
                      intent: 'invite-cover',
                    })
                  }
                >
                  Let someone cover for me
                </Button>
                {row.rawEvent.pendingCoverRequestId ? (
                  <span className="text-[10px] text-violet-600 font-medium">
                    Requested
                  </span>
                ) : null}
              </div>
              <div className="flex flex-col gap-0.5 items-start">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-8 px-2.5 border-amber-600 text-amber-800 hover:bg-amber-50"
                  title="Submit a call-off request for the event manager"
                  onClick={() =>
                    setCallOffTarget({
                      eventId,
                      pendingRequestId:
                        row.rawEvent.pendingCallOffRequestId ?? null,
                    })
                  }
                >
                  Call off
                </Button>
                {row.rawEvent.pendingCallOffRequestId ? (
                  <span className="text-[10px] text-amber-800 font-medium">
                    Requested
                  </span>
                ) : null}
              </div>
            </div>
          ) : null;

          if (!coverButtons && !clockButtons) {
            return null;
          }

          return (
            <div
              className="flex flex-col gap-2 min-w-[140px] items-start"
              onClick={(e) => e.stopPropagation()}
            >
              {clockButtons != null && (
                <div className="order-1 w-full">{clockButtons}</div>
              )}
              {coverButtons != null && (
                <div className="order-2 w-full">{coverButtons}</div>
              )}
            </div>
          );
        },
      },
    ],
    [
      clockInMutation,
      clockOutMutation,
      applicantId,
      userId,
      agentName,
      isBlockedByJobPunch,
      hasActiveEventClockIn,
    ]
  );

  if (isLoading) {
    return (
      <div className="space-y-4 mt-8">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                {[
                  'Date & Time',
                  'Event',
                  'Venue',
                  'Actual Clock In/Out',
                  'Status',
                  'Action',
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left py-3 px-4 font-medium text-gray-600"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...Array(3)].map((_, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-3 px-4">
                    <Skeleton className="h-4 w-20" />
                  </td>
                  <td className="py-3 px-4">
                    <Skeleton className="h-4 w-40" />
                  </td>
                  <td className="py-3 px-4">
                    <Skeleton className="h-4 w-28" />
                  </td>
                  <td className="py-3 px-4">
                    <Skeleton className="h-4 w-24" />
                  </td>
                  <td className="py-3 px-4">
                    <Skeleton className="h-4 w-16" />
                  </td>
                  <td className="py-3 px-4">
                    <Skeleton className="h-8 w-28" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8">
        <p className="text-red-600 text-sm">
          Failed to load events: {(error as Error).message}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <Table
        title="Events"
        description={`Events for ${dateRange.displayRange}`}
        headerAction={
          incomingCoverCount > 0 ? (
            <Button
              type="button"
              variant="outline-primary"
              size="sm"
              className="whitespace-nowrap shrink-0"
              onClick={() => setIncomingListModalOpen(true)}
            >
              Cover requests for you
              <span className="ml-1.5 inline-flex min-w-[1.25rem] justify-center rounded-full bg-appPrimary/15 px-1.5 text-xs font-semibold tabular-nums">
                {incomingCoverCount}
              </span>
            </Button>
          ) : undefined
        }
        columns={columns}
        data={eventRows}
        showPagination={false}
        selectable={false}
        className="w-full"
        emptyMessage="No rostered events found for the selected date range."
        getRowClassName={(row) =>
          [
            row.actualTimeIn && row.actualTimeOut ? 'opacity-70' : '',
            onEventClick ? 'hover:bg-gray-50' : '',
          ]
            .filter(Boolean)
            .join(' ')
        }
        onRowClick={
          onEventClick ? (row) => onEventClick(row.rawEvent) : undefined
        }
      />

      {coverModal && (
        <EventCoverRequestModal
          open
          onClose={() => setCoverModal(null)}
          event={coverModal.event}
          intent={coverModal.intent}
          pendingPeerEmail={coverModal.event.pendingCoverPeerEmail ?? null}
        />
      )}
      <IncomingCoverRequestsModal
        open={incomingListModalOpen}
        onClose={() => setIncomingListModalOpen(false)}
        items={incomingCoverList}
        isLoading={incomingCoverListLoading}
      />
      <EventCallOffConfirmModal
        open={!!callOffTarget}
        onClose={() => setCallOffTarget(null)}
        pendingRequestId={callOffTarget?.pendingRequestId ?? null}
        onConfirm={async (notes) => {
          if (!callOffTarget) return;
          const ok = await handleSubmitCallOff(callOffTarget.eventId, notes);
          if (ok) setCallOffTarget(null);
        }}
        onRemoveRequest={async () => {
          if (!callOffTarget?.pendingRequestId) return;
          const ok = await handleRemoveCallOffRequest(
            callOffTarget.eventId,
            callOffTarget.pendingRequestId
          );
          if (ok) setCallOffTarget(null);
        }}
        loading={!!callOffTarget && callOffEventId === callOffTarget.eventId}
      />
    </div>
  );
}
