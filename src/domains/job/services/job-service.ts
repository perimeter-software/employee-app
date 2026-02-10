import { GignologyUser } from '@/domains/user/types/user.types';
import { baseInstance } from '@/lib/api/instance';
import type {
  GignologyJob,
  JobsWithShiftsParams,
  Shift,
} from '@/domains/job/types/job.types';

export const jobQueryKeys = {
  all: ['job'] as const,
  pipeline: (email: string) =>
    [...jobQueryKeys.all, 'pipeline', email] as const,
  /** Jobs with shifts (Client time & attendance). Key includes includeHiddenJobs for cache separation. */
  withShifts: (includeHiddenJobs: boolean) =>
    [...jobQueryKeys.all, 'withShifts', includeHiddenJobs] as const,
  /** Full shifts for a single job (Client time & attendance). */
  shifts: (jobId: string) => [...jobQueryKeys.all, 'shifts', jobId] as const,
} as const;

export class JobPipelineService {
  static readonly ENDPOINTS = {
    GET_USER_APPLICANT_PIPELINE: (email: string) => `/jobs/users/${email}`,
  } as const;

  /**
   * Get user applicant job pipeline by email
   */
  static async getUserApplicantJobPipeline(
    email: string
  ): Promise<GignologyUser> {
    try {
      const response = await baseInstance.get<GignologyUser>(
        this.ENDPOINTS.GET_USER_APPLICANT_PIPELINE(email)
      );

      if (!response.success || !response.data) {
        console.error('❌ No user data in response:', response);
        throw new Error('No user data received from API');
      }

      return response.data;
    } catch (error) {
      console.error('❌ getUserApplicantJobPipeline API error:', error);
      throw error;
    }
  }
}

/** Service for jobs-with-shifts API (Client time & attendance). Uses Next.js API route. */
export class JobsWithShiftsService {
  /** Path relative to API base URL (no leading slash so baseURL is applied; base URL already includes /api). */
  static readonly ENDPOINT = 'jobs/with-shifts' as const;

  /**
   * Get jobs with shifts. When includeHiddenJobs is false (default), API excludes jobs where hideThisJob === 'Yes'.
   */
  static async getJobsWithShifts(
    params: JobsWithShiftsParams = {}
  ): Promise<GignologyJob[]> {
    try {
      const requestParams: Record<string, string> = {};
      if (params.includeHiddenJobs === true) {
        requestParams.includeHiddenJobs = 'true';
      }
      const response = await baseInstance.get<GignologyJob[]>(
        JobsWithShiftsService.ENDPOINT,
        { params: requestParams }
      );

      if (!response.success || !response.data) {
        console.error('❌ No jobs data in response:', response);
        throw new Error('No jobs data received from API');
      }

      return response.data;
    } catch (error) {
      console.error('❌ getJobsWithShifts API error:', error);
      throw error;
    }
  }
}

/** Service for job-shifts API (full shift data for one job). */
export class JobShiftsService {
  static getEndpoint = (jobId: string) => `jobs/${jobId}/shifts` as const;

  /**
   * Get full shifts for a job (includes defaultSchedule, shiftRoster, etc.).
   */
  static async getJobShifts(jobId: string): Promise<Shift[]> {
    try {
      const response = await baseInstance.get<{ jobId: string; shifts: Shift[] }>(
        JobShiftsService.getEndpoint(jobId)
      );

      if (!response.success || !response.data) {
        console.error('❌ No job shifts data in response:', response);
        throw new Error('No job shifts data received from API');
      }

      return response.data.shifts ?? [];
    } catch (error) {
      console.error('❌ getJobShifts API error:', error);
      throw error;
    }
  }
}
