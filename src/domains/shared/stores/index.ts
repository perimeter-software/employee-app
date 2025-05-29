// domains/shared/stores/index.ts
export { useDateStore } from "@/domains/shared/stores/date-store";
export {
  useNotificationStore,
  notify,
} from "@/domains/shared/stores/notification-store";
export { useUIStore } from "@/domains/shared/stores/ui-store";

export type { DateState } from "@/domains/shared/stores/date-store";
export type { NotificationState } from "@/domains/shared/stores/notification-store";
export type { Notification } from "@/domains/notification";
export type { UIState } from "@/domains/shared/stores/ui-store";
