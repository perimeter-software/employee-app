import { baseInstance } from "@/lib/api/instance";
import { Punch, PunchWithJobInfo } from "../types";
import { ClockInCoordinates } from "@/domains/job/types/location.types";
import { Shift } from "@/domains/job/types/job.types";

export const punchQueryKeys = {
  all: ["punch"] as const,
  list: () => [...punchQueryKeys.all, "list"] as const,
  detail: (id: string) => [...punchQueryKeys.all, "detail", id] as const,
  open: () => [...punchQueryKeys.all, "open"] as const,
  allOpen: (userId: string) =>
    [...punchQueryKeys.all, "allOpen", userId] as const,
  status: (id: string) => [...punchQueryKeys.all, "status", id] as const,
} as const;

export class PunchApiService {
  static readonly ENDPOINTS = {
    CLOCK_IN: (userId: string, jobId: string) => `/punches/${userId}/${jobId}`,
    CLOCK_OUT: (userId: string, jobId: string) => `/punches/${userId}/${jobId}`,
    UPDATE_COORDINATES: (userId: string) =>
      `/punches/${userId}/update-coordinates`,
    ALL_OPEN_PUNCHES: (userId: string) => `/punches/${userId}?type=allOpen`,
    PUNCH_STATUS: (id: string) => `/punches/status/${id}`,
    FIND_BY_DATE_RANGE: () => `/punches`,
    DELETE: (userId: string) => `/punches/remove/${userId}`,
  } as const;

  /**
   * Get all open punches with job info for a user
   */
  static async getAllOpenPunches(userId: string): Promise<PunchWithJobInfo[]> {
    console.log(
      "🔍 Making API call to:",
      this.ENDPOINTS.ALL_OPEN_PUNCHES(userId)
    );

    try {
      const response = await baseInstance.get<PunchWithJobInfo[]>(
        PunchApiService.ENDPOINTS.ALL_OPEN_PUNCHES(userId)
      );

      console.log("📡 Raw API Response:", response);

      // Explicit success check for extra safety and clarity
      if (!response.success || !response.data) {
        console.error("❌ No punches data in response:", response);
        throw new Error("No punches data received from API");
      }

      console.log("✅ Successfully fetched all open punches:", response.data);
      return response.data;
    } catch (error) {
      console.error("❌ getAllOpenPunches API error:", error);

      // The ApiClient already extracts and throws meaningful errors
      // Just re-throw the error - it already has the proper message and error code
      throw error;
    }
  }

  /**
   * Clock in for a job
   */
  static async clockIn(
    userId: string,
    jobId: string,
    data: {
      userNote?: string;
      clockInCoordinates: ClockInCoordinates;
      timeIn: string;
      newStartDate: string;
      newEndDate: string;
      selectedShift: Shift;
    }
  ): Promise<PunchWithJobInfo> {
    console.log(
      "🔍 Making API call to:",
      this.ENDPOINTS.CLOCK_IN(userId, jobId)
    );

    try {
      const response = await baseInstance.post<PunchWithJobInfo>(
        PunchApiService.ENDPOINTS.CLOCK_IN(userId, jobId),
        data
      );

      console.log("📡 Raw API Response:", response);

      // Explicit success check for extra safety and clarity
      if (!response.success || !response.data) {
        console.error("❌ No punch data in response:", response);
        throw new Error("No punch data received from API");
      }

      console.log("✅ Successfully clocked in:", response.data);
      return response.data;
    } catch (error) {
      console.error("❌ clockIn API error:", error);

      // The ApiClient already extracts and throws meaningful errors
      // Just re-throw the error - it already has the proper message and error code
      throw error;
    }
  }

  /**
   * Clock out from a job
   */
  static async clockOut(
    userId: string,
    jobId: string,
    punch: Punch
  ): Promise<PunchWithJobInfo> {
    console.log(
      "🔍 Making API call to:",
      this.ENDPOINTS.CLOCK_OUT(userId, jobId)
    );

    try {
      const response = await baseInstance.put<PunchWithJobInfo>(
        PunchApiService.ENDPOINTS.CLOCK_OUT(userId, jobId),
        {
          action: "clockOut",
          punch,
        }
      );

      console.log("📡 Raw API Response:", response);

      // Explicit success check for extra safety and clarity
      if (!response.success || !response.data) {
        console.error("❌ No punch data in response:", response);
        throw new Error("No punch data received from API");
      }

      console.log("✅ Successfully clocked out:", response.data);
      return response.data;
    } catch (error) {
      console.error("❌ clockOut API error:", error);

      // The ApiClient already extracts and throws meaningful errors
      // Just re-throw the error - it already has the proper message and error code
      throw error;
    }
  }

  /**
   * Update an existing punch
   */
  static async updatePunch(
    userId: string,
    jobId: string,
    punch: Punch
  ): Promise<PunchWithJobInfo> {
    console.log(
      "🔍 Making API call to:",
      this.ENDPOINTS.CLOCK_OUT(userId, jobId)
    );

    try {
      const response = await baseInstance.put<PunchWithJobInfo>(
        PunchApiService.ENDPOINTS.CLOCK_OUT(userId, jobId),
        {
          action: "update",
          punch,
        }
      );

      console.log("📡 Raw API Response:", response);

      // Explicit success check for extra safety and clarity
      if (!response.success || !response.data) {
        console.error("❌ No punch data in response:", response);
        throw new Error("No punch data received from API");
      }

      console.log("✅ Successfully updated punch:", response.data);
      return response.data;
    } catch (error) {
      console.error("❌ updatePunch API error:", error);

      // The ApiClient already extracts and throws meaningful errors
      // Just re-throw the error - it already has the proper message and error code
      throw error;
    }
  }

  /**
   * Update coordinates for an open punch
   */
  static async updateCoordinates(
    userId: string,
    location: ClockInCoordinates
  ): Promise<PunchWithJobInfo | null> {
    console.log(
      "🔍 Making API call to:",
      this.ENDPOINTS.UPDATE_COORDINATES(userId)
    );

    try {
      const response = await baseInstance.post<PunchWithJobInfo>(
        PunchApiService.ENDPOINTS.UPDATE_COORDINATES(userId),
        { location }
      );

      console.log("📡 Raw API Response:", response);

      // Handle special case for 204 status (no content needed)
      if (response.success && !response.data) {
        console.log("✅ No coordinate updates were necessary");
        return null;
      }

      // Explicit success check for extra safety and clarity
      if (!response.success || !response.data) {
        console.error("❌ No punch data in response:", response);
        throw new Error("No punch data received from API");
      }

      console.log("✅ Successfully updated punch coordinates:", response.data);
      return response.data;
    } catch (error) {
      console.error("❌ updateCoordinates API error:", error);

      // The ApiClient already extracts and throws meaningful errors
      // Just re-throw the error - it already has the proper message and error code
      throw error;
    }
  }

  /**
   * Get punch status by ID
   */
  static async getPunchStatus(id: string): Promise<Punch> {
    console.log("🔍 Making API call to:", this.ENDPOINTS.PUNCH_STATUS(id));

    try {
      const response = await baseInstance.get<Punch>(
        PunchApiService.ENDPOINTS.PUNCH_STATUS(id)
      );

      console.log("📡 Raw API Response:", response);

      // Explicit success check for extra safety and clarity
      if (!response.success || !response.data) {
        console.error("❌ No punch data in response:", response);
        throw new Error("No punch data received from API");
      }

      console.log("✅ Successfully fetched punch status:", response.data);
      return response.data;
    } catch (error) {
      console.error("❌ getPunchStatus API error:", error);

      // The ApiClient already extracts and throws meaningful errors
      // Just re-throw the error - it already has the proper message and error code
      throw error;
    }
  }

  /**
   * Find punches by date range
   */
  static async findPunchesByDateRange(params: {
    userId: string;
    jobIds: string[];
    startDate: string;
    endDate: string;
    status?: string;
  }): Promise<PunchWithJobInfo[]> {
    console.log("🔍 Making API call to:", this.ENDPOINTS.FIND_BY_DATE_RANGE());

    try {
      const response = await baseInstance.post<PunchWithJobInfo[]>(
        PunchApiService.ENDPOINTS.FIND_BY_DATE_RANGE(),
        params
      );

      console.log("📡 Raw API Response:", response);

      // Explicit success check for extra safety and clarity
      if (!response.success || !response.data) {
        console.error("❌ No punches data in response:", response);
        throw new Error("No punches data received from API");
      }

      console.log("✅ Successfully fetched punches:", response.data);
      return response.data;
    } catch (error) {
      console.error("❌ findPunchesByDateRange API error:", error);

      // The ApiClient already extracts and throws meaningful errors
      // Just re-throw the error - it already has the proper message and error code
      throw error;
    }
  }

  /**
   * Delete a punch by ID
   */
  static async deletePunch(userId: string): Promise<boolean> {
    console.log("🔍 Making API call to:", this.ENDPOINTS.DELETE(userId));

    try {
      const response = await baseInstance.delete<{
        success: boolean;
        message: string;
      }>(PunchApiService.ENDPOINTS.DELETE(userId));

      console.log("📡 Raw API Response:", response);

      // Explicit success check for extra safety and clarity
      if (!response.success || !response.data) {
        console.error("❌ Delete operation failed:", response);
        throw new Error("Failed to delete punch");
      }

      console.log("✅ Successfully deleted punch");
      return response.data.success;
    } catch (error) {
      console.error("❌ deletePunch API error:", error);

      // The ApiClient already extracts and throws meaningful errors
      // Just re-throw the error - it already has the proper message and error code
      throw error;
    }
  }
}
