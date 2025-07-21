export type CalendarProps = {
  events: CalendarEvent[];
  setEvents: (events: CalendarEvent[]) => void;
  mode: Mode;
  setMode: (mode: Mode) => void;
  date: Date;
  setDate: (date: Date) => void;
  calendarIconIsToday?: boolean;
  hideTotalColumn?: boolean;
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday, 1 = Monday, 2 = Tuesday, etc.
};

export type CalendarContextType = CalendarProps & {
  newEventDialogOpen: boolean;
  setNewEventDialogOpen: (open: boolean) => void;
  manageEventDialogOpen: boolean;
  setManageEventDialogOpen: (open: boolean) => void;
  selectedEvent: CalendarEvent | null;
  setSelectedEvent: (event: CalendarEvent | null) => void;
};
export type CalendarEvent = {
  id: string;
  title: string;
  color: string;
  start: Date;
  end: Date;
};

export const calendarModes = ['day', 'week', 'month'] as const;
export type Mode = (typeof calendarModes)[number];
