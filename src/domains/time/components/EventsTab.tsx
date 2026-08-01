'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { CalendarRange } from 'lucide-react';
import { useRosterEvents } from '@/domains/event/hooks';
import { ShiftCard } from '@/domains/home/components/ShiftCard';
import { ShiftCardSkeleton } from '@/domains/home/components/ShiftCardSkeleton';
import { EventDetailModal } from '@/domains/event/components/EventDetailModal/EventDetailModal';
import type { GignologyEvent } from '@/domains/event/types';

interface EventsTabProps {
  applicantId: string;
  userId: string;
  agentName: string;
}

export function EventsTab({ applicantId, userId, agentName }: EventsTabProps) {
  const [selectedEvent, setSelectedEvent] = useState<GignologyEvent | null>(null);

  const { windowStart, windowEnd } = useMemo(() => {
    const start = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { windowStart: start.toISOString(), windowEnd: end.toISOString() };
  }, []);

  const { data: rosterEvents = [], isLoading } = useRosterEvents({
    applicantId,
    startDate: windowStart,
    endDate: windowEnd,
  });

  const todayEvents = useMemo(() => {
    const today = new Date().toDateString();
    return rosterEvents
      .filter((e) => {
        try {
          return new Date(e.eventDate).toDateString() === today;
        } catch {
          return false;
        }
      })
      .sort((a, b) => new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime());
  }, [rosterEvents]);

  return (
    <div className="space-y-4">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        TODAY&apos;S EVENTS ({isLoading ? '…' : todayEvents.length})
      </h2>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <ShiftCardSkeleton key={i} />
          ))}
        </div>
      ) : todayEvents.length === 0 ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <CalendarRange className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-700">No events today</p>
            <p className="text-xs text-gray-400 mt-1">
              Events you&apos;re rostered for will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {todayEvents.map((event) => (
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

      <p className="text-xs text-gray-400">
        Tip: events appear here automatically when their start time is within the geofence window. Tap a card for full details.
      </p>

      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          open={!!selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}
