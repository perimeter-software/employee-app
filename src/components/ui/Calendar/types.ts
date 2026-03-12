export type CalendarDayBadge = {
  value: number | string;
  color: string; // Tailwind bg color class (e.g., 'bg-blue-500', 'bg-green-500')
  textColor?: string; // Tailwind text color class (defaults to 'text-white')
  label?: string; // Optional label for accessibility/tooltips
};

export type CalendarDayBadges = CalendarDayBadge[];

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
  dayBadges?: Record<string, CalendarDayBadges>; // Map of date (yyyy-MM-dd) to array of badges
};

export type CalendarContextType = CalendarProps & {
  newEventDialogOpen: boolean;
  setNewEventDialogOpen: (open: boolean) => void;
  manageEventDialogOpen: boolean;
  setManageEventDialogOpen: (open: boolean) => void;
  selectedEvent: CalendarEvent | null;
  setSelectedEvent: (event: CalendarEvent | null) => void;
  onOverflowClick?: (event: CalendarEvent, allEvents: CalendarEvent[], clickEvent?: MouseEvent) => void;
};
export type CalendarEvent = {
  id: string;
  title: string;
  color: string;
  start: Date;
  end: Date;
  profileImg?: string | null;
  firstName?: string;
  lastName?: string;
  applicantId?: string;
  userId?: string;
  isFuture?: boolean; // Flag to indicate if this is a future event
};

export const calendarModes = ['day', 'week', 'month'] as const;
export type Mode = (typeof calendarModes)[number];
