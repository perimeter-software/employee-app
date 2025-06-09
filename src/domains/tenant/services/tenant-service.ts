// domains/tenant/services/tenant-api-service.ts

import { baseInstance } from "@/lib/api/instance";
import { SwitchTenantResponse } from "../types";

export const tenantQueryKeys = {
  all: ["tenant"] as const,
  current: () => [...tenantQueryKeys.all, "current"] as const,
} as const;

export class TenantApiService {
  // Remove 'private' to make it accessible, or use the class name instead of 'this'
  static readonly ENDPOINTS = {
    SWITCH_TENANT: "/switch-tenant",
  } as const;

  static async switchTenant(tenantUrl: string): Promise<SwitchTenantResponse> {
    console.log("🔄 Making switch tenant API call to:", tenantUrl);
    // Use TenantApiService.ENDPOINTS instead of this.ENDPOINTS
    console.log(
      "🔄 Making switch tenant API call to:",
      TenantApiService.ENDPOINTS.SWITCH_TENANT
    );

    try {
      // Use TenantApiService.ENDPOINTS instead of this.ENDPOINTS
      const response = await baseInstance.post<SwitchTenantResponse>(
        TenantApiService.ENDPOINTS.SWITCH_TENANT,
        { tenantUrl }
      );

      console.log("📡 Switch tenant API response:", response);

      // Based on your API, it returns { success: true, message: "...", tenant: {...} } directly
      if (response && response.success) {
        console.log("✅ Tenant switch successful");
        return response;
      } else {
        console.error("❌ Tenant switch failed:", response);
        throw new Error(response?.message || "Failed to switch tenant");
      }
    } catch (error) {
      console.error("❌ Switch tenant API error:", error);

      // If it's already an Error object, re-throw it
      if (error instanceof Error) {
        throw error;
      }

      throw new Error("Failed to switch tenant");
    }
  }
}
