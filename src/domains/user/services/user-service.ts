// domains/user/services/user-api-service.ts

import { baseInstance } from "@/lib/api/instance";
import { EnhancedUser } from "../types";

export const userQueryKeys = {
  all: ["user"] as const,
  current: () => [...userQueryKeys.all, "current"] as const,
} as const;

export class UserApiService {
  static readonly ENDPOINTS = {
    CURRENT_USER: "/current-user", // Added /api prefix
  } as const;

  /**
   * Get current authenticated user with enhanced data
   */
  static async getCurrentUser(): Promise<EnhancedUser> {
    console.log("🔍 Making API call to:", this.ENDPOINTS.CURRENT_USER);

    try {
      // Updated to use the standardized API response format
      const response = await baseInstance.get<EnhancedUser>(
        UserApiService.ENDPOINTS.CURRENT_USER
      );

      console.log("📡 Raw API Response:", response);

      // Explicit success check for extra safety and clarity
      if (!response.success || !response.data) {
        console.error("❌ No user data in response:", response);
        throw new Error("No user data received from API");
      }

      console.log("✅ Successfully fetched current user:", response.data);
      return response.data;
    } catch (error) {
      console.error("❌ getCurrentUser API error:", error);

      // The ApiClient already extracts and throws meaningful errors
      // Just re-throw the error - it already has the proper message and error code
      throw error;
    }
  }
}
