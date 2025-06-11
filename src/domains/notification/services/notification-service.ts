import { baseInstance } from "@/lib/api/instance";
import {
  Notification,
  NotificationResponse,
  NotificationError,
  MarkAllAsReadResponse,
  UserNotificationsResponse,
} from "../types";
import { AxiosError, AxiosResponse } from "axios";

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
      const response = await baseInstance.get<
        AxiosResponse<NotificationResponse>
      >(NotificationApiService.ENDPOINTS.GET_NOTIFICATION(id));

      console.log("📡 Raw API Response:", response);

      if (!response || !response.data?.notification) {
        console.error("❌ No notification data in response:", response);
        throw new Error("No notification data received from API");
      }

      console.log(
        "✅ Successfully fetched notification:",
        response.data.notification
      );
      return response.data.notification;
    } catch (error) {
      console.error("❌ getNotification API error:", error);
      if (error instanceof AxiosError && error.response?.data) {
        const errorData = error.response.data as NotificationError;
        throw new Error(errorData.message || "Failed to fetch notification");
      }
      throw error;
    }
  }

  /**
   * Update a notification
   */
  static async updateNotification(
    id: string,
    data: Partial<Notification>
  ): Promise<Notification> {
    console.log(
      "🔍 Making API call to:",
      this.ENDPOINTS.UPDATE_NOTIFICATION(id)
    );

    try {
      const response = await baseInstance.put<NotificationResponse>(
        NotificationApiService.ENDPOINTS.UPDATE_NOTIFICATION(id),
        data
      );

      console.log("📡 Raw API Response:", response);

      if (!response || !response.notification) {
        console.error("❌ No notification data in response:", response);
        throw new Error("No notification data received from API");
      }

      console.log(
        "✅ Successfully updated notification:",
        response.notification
      );
      return response.notification;
    } catch (error) {
      console.error("❌ updateNotification API error:", error);
      if (error instanceof AxiosError && error.response?.data) {
        const errorData = error.response.data as NotificationError;
        throw new Error(errorData.message || "Failed to update notification");
      }
      throw error;
    }
  }

  /**
   * Mark all notifications as read
   */
  static async markAllAsRead(): Promise<{ modifiedCount: number }> {
    console.log("🔍 Making API call to:", this.ENDPOINTS.MARK_ALL_AS_READ());

    try {
      const response = await baseInstance.put<MarkAllAsReadResponse>(
        NotificationApiService.ENDPOINTS.MARK_ALL_AS_READ()
      );

      console.log("📡 Raw API Response:", response);

      if (!response || !response.success) {
        console.error("❌ Failed to mark notifications as read:", response);
        throw new Error("Failed to mark notifications as read");
      }

      console.log(
        "✅ Successfully marked notifications as read:",
        response.modifiedCount
      );
      return { modifiedCount: response.modifiedCount };
    } catch (error) {
      console.error("❌ markAllAsRead API error:", error);
      if (error instanceof AxiosError && error.response?.data) {
        const errorData = error.response.data as NotificationError;
        throw new Error(
          errorData.message || "Failed to mark notifications as read"
        );
      }
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
      const response = await baseInstance.get<
        AxiosResponse<UserNotificationsResponse>
      >(NotificationApiService.ENDPOINTS.GET_USER_NOTIFICATIONS());

      console.log("📡 Raw API Response:", response);

      if (!response || !response.data?.notifications) {
        console.error("❌ No notifications data in response:", response);
        throw new Error("No notifications data received from API");
      }

      console.log("✅ Successfully fetched user notifications:", {
        count: response.data.count,
        notifications: response.data.notifications,
      });
      return {
        notifications: response.data.notifications,
        count: response.data.count,
      };
    } catch (error) {
      console.error("❌ getUserNotifications API error:", error);
      if (error instanceof AxiosError && error.response?.data) {
        const errorData = error.response.data as NotificationError;
        throw new Error(
          errorData.message || "Failed to fetch user notifications"
        );
      }
      throw error;
    }
  }
}
