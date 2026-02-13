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
   * Get PureBlue configuration from primary company for a given persona.
   * Validates that the requested personaSlug exists in config.personas.
   */
  private static getConfig(
    primaryCompanyConfig: PureBlueConfig,
    personaSlug: string
  ): {
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
    const personas = primaryCompanyConfig.personas;

    if (!apiUrl || !chatUrl || !apiKey || !personas?.length) {
      throw new Error('Chatbot not available for this tenant');
    }

    const persona = personas.find((p) => p.personaSlug === personaSlug);
    if (!persona) {
      throw new Error(
        `Chatbot persona "${personaSlug}" not found for this tenant`
      );
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
   * Always uses entity-based authentication with the requested personaSlug
   */
  static async getAuthToken(
    userEmail: string,
    applicantId: string,
    primaryCompanyConfig: PureBlueConfig,
    personaSlug: string
  ): Promise<PureBlueAuthTokenResponse> {
    const config = this.getConfig(primaryCompanyConfig, personaSlug);

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
    primaryCompanyConfig: PureBlueConfig,
    personaSlug: string
  ): Promise<string> {
    const config = this.getConfig(primaryCompanyConfig, personaSlug);

    const authResponse = await this.getAuthToken(
      userEmail,
      applicantId,
      primaryCompanyConfig,
      personaSlug
    );

    if (!authResponse.success || !authResponse.responseObject?.token) {
      throw new Error(
        authResponse.message || 'Failed to get authentication token'
      );
    }

    const token = authResponse.responseObject.token;

    return `${config.chatUrl}/chat-auth/external-chat?authToken=${token}&personaSlug=${personaSlug}`;
  }

  /**
   * Get the PureBlue chat URL (for direct use).
   * Requires a personaSlug only to validate config; returns chatUrl from config.
   */
  static getChatUrl(
    primaryCompanyConfig: PureBlueConfig,
    personaSlug: string
  ): string {
    const config = this.getConfig(primaryCompanyConfig, personaSlug);
    return config.chatUrl;
  }
}
