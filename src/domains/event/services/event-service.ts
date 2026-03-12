import { baseInstance } from '@/lib/api/instance';
import type { GignologyEvent } from '../types';

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

export const eventQueryKeys = {
  all: ['event'] as const,
  roster: (params: RosterEventsParams) =>
    [...eventQueryKeys.all, 'roster', params] as const,
} as const;

export class EventApiService {
  static readonly ENDPOINTS = {
    ROSTER: () => `/events/roster`,
    CLOCK_IN: (eventId: string) => `/events/${eventId}/clock-in`,
    CLOCK_OUT: (eventId: string) => `/events/${eventId}/clock-out`,
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
