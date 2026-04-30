export interface EventNote {
  type?: string;
  date?: string;
  text?: string;
  firstName?: string;
  lastName?: string;
  userId?: string;
}

export interface EventSecondaryLocation {
  locationName?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  latitude?: number;
  longitude?: number;
  radius?: number;
  graceDistanceFeet?: number;
}

export interface EventActivity {
  _id?: string;
  activityDate?: string;
  activityType?: string;
  activityDetails?: string;
  activityText?: string;
  createdByName?: string;
  [key: string]: unknown;
}

export interface EventPosition {
  positionName: string;
  reportTime?: string;
  endTime?: string;
  makePublic?: boolean;
  numberPositions?: number;
  billRate?: number;
  payRate?: number;
}

export interface EventAttachment {
  filename: string;
  title?: string;
  type?: string;
  docType?: string;
  uploadDate?: string;
}

export interface EventApplicant {
  id: string;
  status: string;
  primaryPosition?: string;
  note?: string;
  /** Actual clock-in time (null/undefined until the employee clocks in) */
  timeIn?: string | null;
  /** Actual clock-out time (null/undefined until the employee clocks out) */
  timeOut?: string | null;
  /** When the applicant is expected to report — falls back to event.eventDate if absent */
  reportTime?: string;
  agent?: string;
  createAgent?: string;
  eventUrl?: string;
  dateModified?: string;
  timeInBeforeEdit?: string;
  timeOutBeforeEdit?: string | null;
}

export interface GignologyEvent {
  _id: string;
  eventId?: string;
  eventName: string;
  eventDate: string;
  eventEndTime?: string;
  reportTimeTBD?: string;
  /** Whether employees may clock in up to 1 hour early */
  allowEarlyClockin?: string; // 'Yes' | 'No'
  venueName?: string;
  venueSlug?: string;
  venueCity?: string;
  venueState?: string;
  address?: string;
  zip?: string;
  logoUrl?: string;
  eventType?: string;
  eventUrl?: string;
  status?: string;
  timeZone?: string;
  applicants?: EventApplicant[];
  // Listing-page fields
  companySlug?: string;
  jobSlug?: string;
  makePublicAndSendNotification?: string;
  allowPartners?: boolean;
  positionsRequested?: number;
  numberOnRoster?: number;
  numberOnWaitlist?: number;
  numberOnRequest?: number;
  numberOnPremise?: number;
  // Detail-only fields (returned by GET /api/events/[eventId])
  description?: string;
  tags?: string[];
  positions?: EventPosition[];
  attachments?: EventAttachment[];
  notes?: EventNote[];
  waitListPercentage?: string;
  billRate?: number;
  payRate?: number;
  eventManager?: string;
  payrollPurchaseOrder?: string;
  sendConfirmationToSignUps?: string;
  notifyCallOff?: string;
  reminder24Hour?: string;
  reminder48Hour?: string;
  enableClockInReminders?: string;
  googleMap?: string;
  interviewLink?: string;
  eventImage?: string;
  secondaryLocation?: EventSecondaryLocation;
  // Enriched by frontend
  favorite?: boolean;
  isEventAdmin?: boolean;
  rosterStatus?: string;
  /** Pending call-off row id in `swap-requests` for the current user, if any */
  pendingCallOffRequestId?: string | null;
  /** Pending “let someone cover” row id for the current user as requester */
  pendingCoverRequestId?: string | null;
  /** Invited peer email when `pendingCoverRequestId` is set */
  pendingCoverPeerEmail?: string | null;
  /** Invite cover request where current user is `toEmployeeId` (pending_match) */
  incomingCoverRequestId?: string | null;
  /** 'Yes' when the event enforces a geofence check on clock-in */
  geoFence?: string;
}
