// domains/user/services/user-api-service.ts

import { baseInstance } from "@/lib/api/instance";
import { EnhancedUser } from "../types";

export const userQueryKeys = {
  all: ["user"] as const,
  current: () => [...userQueryKeys.all, "current"] as const,
} as const;

// Update the response type to match your actual API response
interface CurrentUserApiResponse {
  user: EnhancedUser;
}

export class UserApiService {
  static readonly ENDPOINTS = {
    CURRENT_USER: "/current-user",
  } as const;

  /**
   * Get current authenticated user with enhanced data
   */
  static async getCurrentUser(): Promise<EnhancedUser> {
    console.log("🔍 Making API call to:", this.ENDPOINTS.CURRENT_USER);

    try {
      // Your API returns { user: EnhancedUser } directly, not wrapped in success/data
      const response = await baseInstance.get<CurrentUserApiResponse>(
        UserApiService.ENDPOINTS.CURRENT_USER
      );

      console.log("📡 Raw API Response:", response);

      // Check if we have the user data
      if (!response || !response.user) {
        console.error("❌ No user data in response:", response);
        throw new Error("No user data received from API");
      }

      console.log("✅ Successfully parsed user data:", response.user);
      return response.user;
    } catch (error) {
      console.error("❌ getCurrentUser API error:", error);
      throw error;
    }
  }
}
