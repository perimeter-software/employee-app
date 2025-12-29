// domains/pureblue/services/pureblue-service.ts

import axios from 'axios';

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
  private static readonly PUREBLUE_API_URL = process.env.NEXT_PUBLIC_PUREBLUE_API_URL;
  private static readonly PUREBLUE_CHAT_URL = process.env.NEXT_PUBLIC_PUREBLUE_CHAT_URL;
  private static readonly PUREBLUE_API_KEY = process.env.NEXT_PUBLIC_PUREBLUE_API_KEY;
  private static readonly PUREBLUE_PERSONA_SLUG = process.env.NEXT_PUBLIC_PUREBLUE_PERSONA_SLUG;

  /**
   * Extract hostname (with port) from a URL, removing protocol
   */
  private static extractHostnameFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // Return hostname with port if port is specified
      return urlObj.port ? `${urlObj.hostname}:${urlObj.port}` : urlObj.hostname;
    } catch {
      // If URL parsing fails, try to remove http:// or https:// manually
      return url.replace(/^https?:\/\//, '').split('/')[0];
    }
  }

  /**
   * Get external authentication token from PureBlue
   * Always uses entity-based authentication with personaSlug from environment
   */
  static async getAuthToken(userEmail: string): Promise<PureBlueAuthTokenResponse> {
    if (!this.PUREBLUE_API_URL) {
      throw new Error('NEXT_PUBLIC_PUREBLUE_API_URL environment variable is not set');
    }
    if (!this.PUREBLUE_CHAT_URL) {
      throw new Error('NEXT_PUBLIC_PUREBLUE_CHAT_URL environment variable is not set');
    }
    if (!this.PUREBLUE_API_KEY) {
      throw new Error('NEXT_PUBLIC_PUREBLUE_API_KEY environment variable is not set');
    }
    if (!this.PUREBLUE_PERSONA_SLUG) {
      throw new Error('NEXT_PUBLIC_PUREBLUE_PERSONA_SLUG environment variable is not set');
    }

    // Extract hostname from chat URL for x-origin header
    const tenantDomain = this.extractHostnameFromUrl(this.PUREBLUE_CHAT_URL);

    try {
      const response = await axios.post<PureBlueAuthTokenResponse>(
        `${this.PUREBLUE_API_URL}/api/v1/auth/external-token`,
        {
          email: userEmail,
          personaSlug: this.PUREBLUE_PERSONA_SLUG,
          entityBasedAuth: true,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.PUREBLUE_API_KEY,
            'x-origin': tenantDomain,
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error getting PureBlue auth token:', error);
      const errorMessage = 
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Failed to authenticate with PureBlue chatbot';
      throw new Error(errorMessage);
    }
  }

  /**
   * Get the chatbot iframe URL with authentication token
   */
  static async getChatbotUrl(userEmail: string): Promise<string> {
    if (!this.PUREBLUE_CHAT_URL) {
      throw new Error('NEXT_PUBLIC_PUREBLUE_CHAT_URL environment variable is not set');
    }
    if (!this.PUREBLUE_PERSONA_SLUG) {
      throw new Error('NEXT_PUBLIC_PUREBLUE_PERSONA_SLUG environment variable is not set');
    }

    const authResponse = await this.getAuthToken(userEmail);
    
    if (!authResponse.success || !authResponse.responseObject?.token) {
      throw new Error(authResponse.message || 'Failed to get authentication token');
    }

    const token = authResponse.responseObject.token;
    const personaSlug = this.PUREBLUE_PERSONA_SLUG;

    return `${this.PUREBLUE_CHAT_URL}/chat-auth/external-chat?authToken=${token}&personaSlug=${personaSlug}`;
  }

  /**
   * Get the PureBlue chat URL (for direct use)
   */
  static getChatUrl(): string {
    if (!this.PUREBLUE_CHAT_URL) {
      throw new Error('NEXT_PUBLIC_PUREBLUE_CHAT_URL environment variable is not set');
    }
    return this.PUREBLUE_CHAT_URL;
  }
}

