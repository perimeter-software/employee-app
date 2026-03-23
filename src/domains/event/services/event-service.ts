import { baseInstance } from '@/lib/api/instance';
import type { GignologyEvent } from '../types';

export interface EventListPage {
  data: GignologyEvent[];
  pagination?: { next?: { page: number } };
}

export interface FetchEventsParams {
  applicantId?: string;
  search?: string;
  page?: number;
  limit?: number;
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

export class EventApiService {
  static readonly ENDPOINTS = {
    ROSTER: () => `/events/roster`,
    CLOCK_IN: (eventId: string) => `/events/${eventId}/clock-in`,
    CLOCK_OUT: (eventId: string) => `/events/${eventId}/clock-out`,
    DETAIL: (eventId: string) => `/events/${eventId}`,
    ENROLLMENT: (eventId: string) => `/events/${eventId}/enrollment`,
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
  }: FetchEventsParams): Promise<EventListPage> {
    const qs = new URLSearchParams({
      filter: 'timeFrame:Current,eventType:Event',
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
  }: FetchEventsParams): Promise<EventListPage> {
    if (!applicantId) return { data: [] };
    const qs = new URLSearchParams({
      filter: `timeFrame:Current,eventType:Event,applicants.id:${applicantId}`,
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
  }: FetchEventsParams): Promise<EventListPage> {
    if (!applicantId) return { data: [] };
    const qs = new URLSearchParams({
      filter: `timeFrame:Past,eventType:Event,applicants.id:${applicantId},applicants.status:Roster`,
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
      }
    );

    if (!response.success || !response.data) {
      throw new Error('Clock-out failed');
    }

    return response.data;
  }
}
