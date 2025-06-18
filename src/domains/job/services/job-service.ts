import { GignologyUser } from '@/domains/user/types/user.types';
import { baseInstance } from '@/lib/api/instance';

export const jobQueryKeys = {
  all: ['job'] as const,
  pipeline: (email: string) =>
    [...jobQueryKeys.all, 'pipeline', email] as const,
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

      // The ApiClient now handles success/error checking automatically
      // If we reach this point, the request was successful
      if (!response.success || !response.data) {
        console.error('❌ No user data in response:', response);
        throw new Error('No user data received from API');
      }

      return response.data;
    } catch (error) {
      console.error('❌ getUserApplicantJobPipeline API error:', error);

      // The ApiClient already extracts and throws meaningful errors
      // Just re-throw the error - it already has the proper message and error code
      throw error;
    }
  }
}
