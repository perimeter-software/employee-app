import type { QueryClient } from '@tanstack/react-query';
import { baseInstance } from '@/lib/api/instance';
import type { GignologyEvent } from '../types';
import type { ClockInCoordinates } from '@/domains/job/types/location.types';

export interface EventListPage {
  data: GignologyEvent[];
  pagination?: { next?: { page: number } };
}

export interface FetchEventsParams {
  applicantId?: string;
  search?: string;
  page?: number;
  limit?: number;
  /** venueSlug to filter by; empty/undefined means show all accessible venues */
  venueSlug?: string;
}

export interface RosterEventsParams {
  applicantId: string;
  startDate?: string;
  endDate?: string;
}

export interface EventClockPayload {
  applicantId: string;
  /** Display name of the acting user (e.g. "Jane Smith") */
  agent: string;
  /** _id of the acting user */
  createAgent: string;
  /** GPS coordinates collected at clock-in time */
  coordinates?: ClockInCoordinates | null;
}

export type EnrollmentType = 'Not Roster' | 'Roster' | 'Waitlist' | 'Request';
export type AllowedAction = 'Roster' | 'Waitlist' | 'Not Roster' | 'Request';

export interface OverlappingEvent {
  eventUrl: string;
  venue: string;
  eventName: string;
  eventDate: string;
  eventEndTime: string;
  address?: string;
  venueCity?: string;
  venueState?: string;
  zip?: string;
}

export interface OverTimeEvent {
  eventName: string;
  venue: string;
  eventDate: string;
  duration: string;
}

// The external API returns the enrollment object directly (not wrapped in { data }).
// Most fields are optional because early-return paths omit capacity/count fields.
export interface EnrollmentCheckResult {
  type: EnrollmentType;
  allowed: AllowedAction;
  message: string;
  status: 'Success' | 'Warning' | 'Error';
  success?: boolean;
  numEnrolled?: number;
  capacity?: number;
  waitListCapacity?: number;
  waitListEnrolled?: number;
  overlappingEvent?: OverlappingEvent;
  overTimeEventList?: OverTimeEvent[];
  totalHours?: number;
  otherWaitlists?: unknown[];
}

export const eventQueryKeys = {
  all: ['event'] as const,
  roster: (params: RosterEventsParams) =>
    [...eventQueryKeys.all, 'roster', params] as const,
  detail: (eventId: string) => [...eventQueryKeys.all, 'detail', eventId] as const,
  enrollment: (eventId: string) => [...eventQueryKeys.all, 'enrollment', eventId] as const,
} as const;

/** React Query key for pending cover invites (incoming). */
export const INCOMING_COVER_REQUESTS_QUERY_KEY = [
  'event-cover-requests',
  'incoming',
] as const;

/**
 * Invalidates `/events` list caches (all / my / past tabs) plus event detail/roster
 * queries. Use after call-off, cover request, or enrollment changes.
 */
export async function invalidateEventListCaches(
  queryClient: QueryClient
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['events-all'] }),
    queryClient.invalidateQueries({ queryKey: ['events-my'] }),
    queryClient.invalidateQueries({ queryKey: ['events-past'] }),
    queryClient.invalidateQueries({ queryKey: eventQueryKeys.all }),
  ]);
}

export class EventApiService {
  static readonly ENDPOINTS = {
    ROSTER: () => `/events/roster`,
    CLOCK_IN: (eventId: string) => `/events/${eventId}/clock-in`,
    CLOCK_OUT: (eventId: string) => `/events/${eventId}/clock-out`,
    DETAIL: (eventId: string) => `/events/${eventId}`,
    ENROLLMENT: (eventId: string) => `/events/${eventId}/enrollment`,
    EVENT_CALL_OFF: (eventId: string) => `/events/${eventId}/call-off`,
    EVENT_CALL_OFF_REQUEST: (requestId: string) =>
      `/event-call-off-requests/${requestId}`,
    EVENT_COVER_ACCEPT: (requestId: string) =>
      `/event-cover-requests/${requestId}/accept`,
    EVENT_COVER_DECLINE: (requestId: string) =>
      `/event-cover-requests/${requestId}/decline`,
    EVENT_COVER_REQUESTS: () => `/event-cover-requests`,
  } as const;

  static async getRosterEvents(
    params: RosterEventsParams
  ): Promise<GignologyEvent[]> {
    const query = new URLSearchParams({
      applicantId: params.applicantId,
      ...(params.startDate && { startDate: params.startDate }),
      ...(params.endDate && { endDate: params.endDate }),
    });

    const response = await baseInstance.get<GignologyEvent[]>(
      `${EventApiService.ENDPOINTS.ROSTER()}?${query.toString()}`
    );

    if (!response.success || !response.data) {
      throw new Error('No event data received from API');
    }

    return response.data;
  }

  static async clockIn(
    eventId: string,
    payload: EventClockPayload
  ): Promise<{ rosterRecord: Record<string, unknown> }> {
    const response = await baseInstance.post<{ rosterRecord: Record<string, unknown> }>(
      EventApiService.ENDPOINTS.CLOCK_IN(eventId),
      {
        applicantId: payload.applicantId,
        agent: payload.agent,
        createAgent: payload.createAgent,
        timeIn: new Date().toISOString(),
        ...(payload.coordinates && { coordinates: payload.coordinates }),
      }
    );

    if (!response.success || !response.data) {
      throw new Error('Clock-in failed');
    }

    return response.data;
  }

  static async fetchAllEvents({
    applicantId,
    search = '',
    page = 1,
    limit = 10,
    venueSlug = '',
  }: FetchEventsParams): Promise<EventListPage> {
    const filterParts = ['timeFrame:Current', 'eventType:Event'];
    if (venueSlug) filterParts.push(`venueSlug:${venueSlug}`);
    const qs = new URLSearchParams({
      filter: filterParts.join(','),
      limit: String(limit),
      sort: 'eventDate:asc',
      page: String(page),
      ...(applicantId && { applicantId }),
      ...(search && { search }),
    });
    const res = await baseInstance.get<EventListPage>(`/events?${qs}`);
    if (!res.success || !res.data) throw new Error('Failed to fetch all events');
    return res.data;
  }

  static async fetchMyEvents({
    applicantId,
    search = '',
    page = 1,
    limit = 10,
    venueSlug = '',
  }: FetchEventsParams): Promise<EventListPage> {
    if (!applicantId) return { data: [] };
    const filterParts = [`timeFrame:Current`, `eventType:Event`, `applicants.id:${applicantId}`];
    if (venueSlug) filterParts.push(`venueSlug:${venueSlug}`);
    const qs = new URLSearchParams({
      filter: filterParts.join(','),
      limit: String(limit),
      sort: 'eventDate:asc',
      page: String(page),
      applicantId,
      ...(search && { search }),
    });
    const res = await baseInstance.get<EventListPage>(`/events?${qs}`);
    if (!res.success || !res.data) throw new Error('Failed to fetch my events');
    return res.data;
  }

  static async fetchPastEvents({
    applicantId,
    search = '',
    page = 1,
    limit = 10,
    venueSlug = '',
  }: FetchEventsParams): Promise<EventListPage> {
    if (!applicantId) return { data: [] };
    const filterParts = [
      `timeFrame:Past`,
      `eventType:Event`,
      `applicants.id:${applicantId}`,
      `applicants.status:Roster`,
    ];
    if (venueSlug) filterParts.push(`venueSlug:${venueSlug}`);
    const qs = new URLSearchParams({
      filter: filterParts.join(','),
      limit: String(limit),
      sort: 'eventDate:desc',
      page: String(page),
      applicantId,
      ...(search && { search }),
    });
    const res = await baseInstance.get<EventListPage>(`/events?${qs}`);
    if (!res.success || !res.data) throw new Error('Failed to fetch past events');
    return res.data;
  }

  static async fetchEventDetail(eventId: string): Promise<GignologyEvent> {
    const res = await baseInstance.get<GignologyEvent>(EventApiService.ENDPOINTS.DETAIL(eventId));
    if (!res.success || !res.data) throw new Error('Failed to fetch event detail');
    return res.data;
  }

  static async checkEnrollment(eventId: string): Promise<EnrollmentCheckResult> {
    // The external API returns the enrollment object at the top level (not wrapped
    // in { data }), so we return the raw response body directly.
    const res = await baseInstance.get<never>(EventApiService.ENDPOINTS.ENROLLMENT(eventId));
    return res as unknown as EnrollmentCheckResult;
  }

  static async submitEnrollment(
    eventId: string,
    requestType: EnrollmentType,
    positionName?: string
  ): Promise<EnrollmentCheckResult> {
    // Same as checkEnrollment: external API returns the object at the top level.
    const res = await baseInstance.put<never>(
      EventApiService.ENDPOINTS.ENROLLMENT(eventId),
      { requestType, ...(positionName && { positionName }) }
    );
    return res as unknown as EnrollmentCheckResult;
  }

  static async submitEventCallOff(
    eventId: string,
    notes?: string
  ): Promise<unknown> {
    const res = await baseInstance.post<{ data: unknown }>(
      EventApiService.ENDPOINTS.EVENT_CALL_OFF(eventId),
      { notes }
    );
    if (!res.success || res.data === undefined) {
      throw new Error(res.message || 'Call-off request failed');
    }
    return res.data;
  }

  static async deleteEventCallOffRequest(requestId: string): Promise<void> {
    const res = await baseInstance.delete(
      EventApiService.ENDPOINTS.EVENT_CALL_OFF_REQUEST(requestId)
    );
    if (!res.success) {
      throw new Error(res.message || 'Failed to remove call-off request');
    }
  }

  static async acceptEventCoverRequest(requestId: string): Promise<unknown> {
    const res = await baseInstance.patch<{ data: unknown }>(
      EventApiService.ENDPOINTS.EVENT_COVER_ACCEPT(requestId),
      {}
    );
    if (!res.success || res.data === undefined) {
      throw new Error(res.message || 'Unable to accept cover request.');
    }
    return res.data;
  }

  static async declineEventCoverRequest(requestId: string): Promise<unknown> {
    const res = await baseInstance.patch<{ data: unknown }>(
      EventApiService.ENDPOINTS.EVENT_COVER_DECLINE(requestId),
      {}
    );
    if (!res.success || res.data === undefined) {
      throw new Error(res.message || 'Unable to decline cover request.');
    }
    return res.data;
  }

  /** Pending cover invites where you are the invitee (`pending_match`). Includes `eventName` / `eventDate` when the event exists. */
  static async listIncomingCoverRequests(
    limit = 50
  ): Promise<Record<string, unknown>[]> {
    const qs = new URLSearchParams({
      scope: 'incoming',
      limit: String(limit),
    });
    const res = await baseInstance.get<Record<string, unknown>[]>(
      `${EventApiService.ENDPOINTS.EVENT_COVER_REQUESTS()}?${qs.toString()}`
    );
    if (!res.success || res.data === undefined) {
      throw new Error(res.message || 'Unable to load cover requests.');
    }
    return Array.isArray(res.data) ? res.data : [];
  }

  static async clockOut(
    eventId: string,
    payload: EventClockPayload
  ): Promise<{ rosterRecord: Record<string, unknown> }> {
    const response = await baseInstance.post<{ rosterRecord: Record<string, unknown> }>(
      EventApiService.ENDPOINTS.CLOCK_OUT(eventId),
      {
        applicantId: payload.applicantId,
        agent: payload.agent,
        createAgent: payload.createAgent,
        timeOut: new Date().toISOString(),
        ...(payload.coordinates && { coordinates: payload.coordinates }),
      }
    );

    if (!response.success || !response.data) {
      throw new Error('Clock-out failed');
    }

    return response.data;
  }
}
