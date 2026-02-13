// domains/pureblue/services/pureblue-service.ts

import axios from 'axios';
import type { PureBlueConfig } from '@/domains/company/types/company.types';

export interface PureBlueAuthTokenResponse {
  success: boolean;
  message: string;
  responseObject: {
    token: string;
    expiresAt: string;
    user: {
      _id: string;
      email: string;
      username: string;
      roles: string[];
    };
  };
  statusCode: number;
}

export class PureBlueService {
  /**
   * Get PureBlue configuration from primary company
   */
  private static getConfig(primaryCompanyConfig: PureBlueConfig): {
    apiUrl: string;
    chatUrl: string;
    apiKey: string;
    personaSlug: string;
  } {
    if (!primaryCompanyConfig) {
      throw new Error('Chatbot not available for this tenant');
    }

    const apiUrl = primaryCompanyConfig.apiUrl;
    const chatUrl = primaryCompanyConfig.chatUrl;
    const apiKey = primaryCompanyConfig.apiKey;
    const personaSlug = primaryCompanyConfig.personaSlug;

    if (!apiUrl || !chatUrl || !apiKey || !personaSlug) {
      throw new Error('Chatbot not available for this tenant');
    }

    return { apiUrl, chatUrl, apiKey, personaSlug };
  }

  /**
   * Extract hostname (with port) from a URL, removing protocol
   */
  private static extractHostnameFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // Return hostname with port if port is specified
      return urlObj.port
        ? `${urlObj.hostname}:${urlObj.port}`
        : urlObj.hostname;
    } catch {
      // If URL parsing fails, try to remove http:// or https:// manually
      return url.replace(/^https?:\/\//, '').split('/')[0];
    }
  }

  /**
   * Get external authentication token from PureBlue
   * Always uses entity-based authentication with personaSlug from primary company
   */
  static async getAuthToken(
    userEmail: string,
    applicantId: string,
    primaryCompanyConfig: PureBlueConfig
  ): Promise<PureBlueAuthTokenResponse> {
    const config = this.getConfig(primaryCompanyConfig);

    // Extract hostname from chat URL for x-origin header
    const tenantDomain = this.extractHostnameFromUrl(config.chatUrl);

    const pureblueChatVariables = {
      email: userEmail,
      applicantId,
    };

    try {
      const response = await axios.post<PureBlueAuthTokenResponse>(
        `${config.apiUrl}/api/v1/auth/external-token`,
        {
          pureblueChatVariables,
          personaSlug: config.personaSlug,
          entityBasedAuth: true,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.apiKey,
            'x-origin': tenantDomain,
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error getting PureBlue auth token:', error);
      const errorMessage =
        (error as { response?: { data?: { message?: string } } })?.response
          ?.data?.message || 'Failed to authenticate with PureBlue chatbot';
      throw new Error(errorMessage);
    }
  }

  /**
   * Get the chatbot iframe URL with authentication token
   */
  static async getChatbotUrl(
    userEmail: string,
    applicantId: string,
    primaryCompanyConfig: PureBlueConfig
  ): Promise<string> {
    const config = this.getConfig(primaryCompanyConfig);

    const authResponse = await this.getAuthToken(
      userEmail,
      applicantId,
      primaryCompanyConfig
    );

    if (!authResponse.success || !authResponse.responseObject?.token) {
      throw new Error(
        authResponse.message || 'Failed to get authentication token'
      );
    }

    const token = authResponse.responseObject.token;
    const personaSlug = config.personaSlug;

    return `${config.chatUrl}/chat-auth/external-chat?authToken=${token}&personaSlug=${personaSlug}`;
  }

  /**
   * Get the PureBlue chat URL (for direct use)
   */
  static getChatUrl(primaryCompanyConfig: PureBlueConfig): string {
    const config = this.getConfig(primaryCompanyConfig);
    return config.chatUrl;
  }

  /**
   * Get the persona slug
   */
  static getPersonaSlug(primaryCompanyConfig: PureBlueConfig): string {
    const config = this.getConfig(primaryCompanyConfig);
    return config.personaSlug;
  }
}
