import { baseInstance } from "@/lib/api/instance";
import { Notification } from "../types";

export const notificationQueryKeys = {
  all: ["notification"] as const,
  list: () => [...notificationQueryKeys.all, "list"] as const,
  detail: (id: string) => [...notificationQueryKeys.all, "detail", id] as const,
  user: (userId: string) =>
    [...notificationQueryKeys.all, "user", userId] as const,
} as const;

export class NotificationApiService {
  static readonly ENDPOINTS = {
    GET_NOTIFICATION: (id: string) => `/api/notifications/${id}`,
    UPDATE_NOTIFICATION: (id: string) => `/api/notifications/${id}`,
    MARK_ALL_AS_READ: () => `/api/notifications/mark-all-read`,
    GET_USER_NOTIFICATIONS: () => `/api/notifications`,
  } as const;

  /**
   * Get a notification by ID
   */
  static async getNotification(id: string): Promise<Notification> {
    console.log("🔍 Making API call to:", this.ENDPOINTS.GET_NOTIFICATION(id));

    try {
      const response = await baseInstance.get<Notification>(
        NotificationApiService.ENDPOINTS.GET_NOTIFICATION(id)
      );

      console.log("📡 Raw API Response:", response);

      // Explicit success check for extra safety and clarity
      if (!response.success || !response.data) {
        console.error("❌ No notification data in response:", response);
        throw new Error("No notification data received from API");
      }

      console.log("✅ Successfully fetched notification:", response.data);
      return response.data;
    } catch (error) {
      console.error("❌ getNotification API error:", error);

      // The ApiClient already extracts and throws meaningful errors
      // Just re-throw the error - it already has the proper message and error code
      throw error;
    }
  }

  /**
   * Update a notification
   */
  static async updateNotification(
    id: string,
    data: Partial<Notification>
  ): Promise<{ modifiedCount: number }> {
    console.log(
      "🔍 Making API call to:",
      this.ENDPOINTS.UPDATE_NOTIFICATION(id)
    );

    try {
      const response = await baseInstance.put<{ modifiedCount: number }>(
        NotificationApiService.ENDPOINTS.UPDATE_NOTIFICATION(id),
        data
      );

      console.log("📡 Raw API Response:", response);

      // Explicit success check for extra safety and clarity
      if (!response.success || !response.data) {
        console.error("❌ No notification update data in response:", response);
        throw new Error("No notification update data received from API");
      }

      console.log("✅ Successfully updated notification:", response.data);
      return response.data;
    } catch (error) {
      console.error("❌ updateNotification API error:", error);

      // The ApiClient already extracts and throws meaningful errors
      // Just re-throw the error - it already has the proper message and error code
      throw error;
    }
  }

  /**
   * Mark all notifications as read
   */
  static async markAllAsRead(): Promise<{ modifiedCount: number }> {
    console.log("🔍 Making API call to:", this.ENDPOINTS.MARK_ALL_AS_READ());

    try {
      const response = await baseInstance.put<{ modifiedCount: number }>(
        NotificationApiService.ENDPOINTS.MARK_ALL_AS_READ()
      );

      console.log("📡 Raw API Response:", response);

      // Explicit success check for extra safety and clarity
      if (!response.success || !response.data) {
        console.error("❌ Failed to mark notifications as read:", response);
        throw new Error("Failed to mark notifications as read");
      }

      console.log(
        "✅ Successfully marked notifications as read:",
        response.data
      );
      return response.data;
    } catch (error) {
      console.error("❌ markAllAsRead API error:", error);

      // The ApiClient already extracts and throws meaningful errors
      // Just re-throw the error - it already has the proper message and error code
      throw error;
    }
  }

  /**
   * Get all notifications for the current user
   */
  static async getUserNotifications(): Promise<{
    notifications: Notification[];
    count: number;
  }> {
    console.log(
      "🔍 Making API call to:",
      this.ENDPOINTS.GET_USER_NOTIFICATIONS()
    );

    try {
      const response = await baseInstance.get<{
        notifications: Notification[];
        count: number;
      }>(NotificationApiService.ENDPOINTS.GET_USER_NOTIFICATIONS());

      console.log("📡 Raw API Response:", response);

      // Explicit success check for extra safety and clarity
      if (!response.success || !response.data) {
        console.error("❌ No notifications data in response:", response);
        throw new Error("No notifications data received from API");
      }

      console.log("✅ Successfully fetched user notifications:", response.data);
      return response.data;
    } catch (error) {
      console.error("❌ getUserNotifications API error:", error);

      // The ApiClient already extracts and throws meaningful errors
      // Just re-throw the error - it already has the proper message and error code
      throw error;
    }
  }
}
