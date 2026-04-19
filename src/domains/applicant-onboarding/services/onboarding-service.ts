import axios from 'axios';
import type { ApplicantRecord, CurrentApplicantResponse, OutsideMode } from '../types';

const BASE = '/api/applicant-onboarding';

export const onboardingQueryKeys = {
  all: ['applicant-onboarding'] as const,
  current: (mode: OutsideMode) =>
    [...onboardingQueryKeys.all, 'current', mode] as const,
};

export const OnboardingService = {
  async getCurrentApplicant(mode: OutsideMode = 'protected'): Promise<CurrentApplicantResponse> {
    const { data } = await axios.get(`${BASE}/current`, { params: { mode } });
    return (data?.data ?? data) as CurrentApplicantResponse;
  },
  async createApplicant(payload: Partial<ApplicantRecord>): Promise<ApplicantRecord> {
    const { data } = await axios.post(`${BASE}/applicants`, payload);
    return (data?.data ?? data) as ApplicantRecord;
  },
  async updateApplicant(
    id: string,
    payload: Partial<ApplicantRecord>
  ): Promise<ApplicantRecord> {
    const { data } = await axios.put(`${BASE}/applicants/${id}`, payload);
    return (data?.data ?? data) as ApplicantRecord;
  },
  async uploadResume(applicantId: string, formData: FormData): Promise<unknown> {
    const { data } = await axios.post(`${BASE}/applicants/${applicantId}/resume`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },
  async addAttachment(applicantId: string, attachment: Record<string, unknown>): Promise<unknown> {
    const { data } = await axios.put(`${BASE}/applicants/${applicantId}/attachment`, { attachment });
    return data;
  },

  async getJobAutoAssessmentLink(applicantId: string): Promise<unknown> {
    const { data } = await axios.get(`${BASE}/jobs/assessment/link/${applicantId}`);
    return data;
  },

  async getJobAvailability(jobSlug: string): Promise<unknown> {
    const { data } = await axios.get(`${BASE}/jobs/${jobSlug}/availability`);
    return data;
  },

  async processAIInterviewConversation(
    id: string,
    jobSlug: string,
    payload: unknown
  ): Promise<unknown> {
    const { data } = await axios.post(
      `${BASE}/applicants/${id}/job/${jobSlug}/ai/renderprescreen`,
      payload
    );
    return data;
  },

  async suggestAIInterviewSlots(
    id: string,
    jobSlug: string,
    payload: unknown
  ): Promise<unknown> {
    const { data } = await axios.post(
      `${BASE}/applicants/${id}/job/${jobSlug}/ai/suggestinterview`,
      payload
    );
    return data;
  },

  async pushAIInterviewMessage(id: string, payload: unknown): Promise<unknown> {
    const { data } = await axios.post(`${BASE}/applicants/${id}/job/aiinterviews/message`, payload);
    return data;
  },

  async createScreeningInterview(payload: unknown): Promise<unknown> {
    const { data } = await axios.post(`${BASE}/events/interview/screening`, payload);
    return data;
  },

  async suggestScreeningInterview(payload: unknown): Promise<unknown> {
    const { data } = await axios.post(`${BASE}/events/interview/suggestion`, payload);
    return data;
  },

  async cancelScreeningInterview(applicantId: string, eventUrl: string): Promise<unknown> {
    const { data } = await axios.delete(`${BASE}/events/interview/screening`, {
      params: { applicantId, eventUrl },
    });
    return data;
  },

  async cancelScreeningSuggestion(applicantId: string, jobSlug: string): Promise<unknown> {
    const { data } = await axios.delete(`${BASE}/events/interview/suggestion`, {
      params: { applicantId, jobSlug },
    });
    return data;
  },

  async getForms(): Promise<unknown[]> {
    const { data } = await axios.get(`${BASE}/forms`);
    return (Array.isArray(data) ? data : data?.data ?? []) as unknown[];
  },

  async generateFilledPdf(payload: {
    formId: string;
    applicantId: string;
    formValues: Record<string, unknown>;
  }): Promise<unknown> {
    const { data } = await axios.post(`${BASE}/forms/generate-pdf`, payload);
    return data;
  },
};
