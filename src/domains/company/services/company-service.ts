import { baseInstance } from '@/lib/api/instance';
import { Company } from '../types';

export const companyQueryKeys = {
  all: ['company'] as const,
  primary: () => [...companyQueryKeys.all, 'primary'] as const,
} as const;

export class CompanyService {
  static readonly ENDPOINTS = {
    GET_PRIMARY_COMPANY: () => `/companies/primary`,
  } as const;

  /**
   * Get the primary company
   */
  static async getPrimaryCompany(): Promise<Company> {
    try {
      const response = await baseInstance.get<Company>(
        CompanyService.ENDPOINTS.GET_PRIMARY_COMPANY()
      );

      // Explicit success check for extra safety and clarity
      if (!response.success || !response.data) {
        console.error('❌ No primary company data in response:', response);
        throw new Error('No primary company data received from API');
      }

      return response.data;
    } catch (error) {
      console.error('❌ getPrimaryCompany API error:', error);

      // The ApiClient already extracts and throws meaningful errors
      // Just re-throw the error - it already has the proper message and error code
      throw error;
    }
  }
}
