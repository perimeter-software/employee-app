import { CalendarContext } from './CalendarContext';
import { CalendarEvent, Mode } from './types';
import { useState } from 'react';

export default function CalendarProvider({
  events,
  setEvents,
  mode,
  setMode,
  date,
  setDate,
  calendarIconIsToday = true,
  weekStartsOn = 0,
  onOverflowClick,
  children,
}: {
  events: CalendarEvent[];
  setEvents: (events: CalendarEvent[]) => void;
  mode: Mode;
  setMode: (mode: Mode) => void;
  date: Date;
  setDate: (date: Date) => void;
  calendarIconIsToday: boolean;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  onOverflowClick?: (event: CalendarEvent, allEvents: CalendarEvent[]) => void;
  children: React.ReactNode;
}) {
  const [newEventDialogOpen, setNewEventDialogOpen] = useState(false);
  const [manageEventDialogOpen, setManageEventDialogOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null
  );

  return (
    <CalendarContext.Provider
      value={{
        events,
        setEvents,
        mode,
        setMode,
        date,
        setDate,
        calendarIconIsToday,
        weekStartsOn,
        newEventDialogOpen,
        setNewEventDialogOpen,
        manageEventDialogOpen,
        setManageEventDialogOpen,
        selectedEvent,
        setSelectedEvent,
        onOverflowClick,
      }}
    >
      {children}
    </CalendarContext.Provider>
  );
}
