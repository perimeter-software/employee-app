import { baseInstance } from "@/lib/api/instance";
import { SwitchTenantResponse } from "../types";

export const tenantQueryKeys = {
  all: ["tenant"] as const,
  current: () => [...tenantQueryKeys.all, "current"] as const,
} as const;

export class TenantApiService {
  static readonly ENDPOINTS = {
    SWITCH_TENANT: "/switch-tenant",
  } as const;

  static async switchTenant(tenantUrl: string): Promise<SwitchTenantResponse> {
    console.log(
      "🔄 Making switch tenant API call to:",
      TenantApiService.ENDPOINTS.SWITCH_TENANT
    );

    try {
      const response = await baseInstance.post<SwitchTenantResponse>(
        TenantApiService.ENDPOINTS.SWITCH_TENANT,
        { tenantUrl }
      );

      console.log("📡 Switch tenant API response:", response);

      // Explicit success check for extra safety and clarity
      if (!response.success || !response.data) {
        console.error("❌ Tenant switch failed:", response);
        throw new Error("Failed to switch tenant");
      }

      console.log("✅ Tenant switch successful:", response.data);
      return response.data;
    } catch (error) {
      console.error("❌ Switch tenant API error:", error);

      // The ApiClient already extracts and throws meaningful errors
      // Just re-throw the error - it already has the proper message and error code
      throw error;
    }
  }
}
