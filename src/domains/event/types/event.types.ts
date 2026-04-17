export interface EventPosition {
  positionName: string;
  reportTime?: string;
  endTime?: string;
  makePublic?: boolean;
  numberPositions?: number;
}

export interface EventAttachment {
  filename: string;
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
  numberOnPremise?: number;
  // Detail-only fields (returned by GET /api/events/[eventId])
  description?: string;
  positions?: EventPosition[];
  attachments?: EventAttachment[];
  waitListPercentage?: string;
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
}
