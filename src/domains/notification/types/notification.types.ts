export type Recipient = {
  applicantId: string;
  userId: string;
  firstName: string;
  lastName: string;
};

export type Notification = {
  _id: string;
  fromUserId: string;
  fromFirstName: string;
  fromLastName: string;
  recipient: Recipient;
  sendTime: Date;
  msgType: string;
  subject: string;
  msgTemplate: string;
  body: string;
  profileImg: string;
  status: string;
  type: "info" | "success" | "warning" | "error";
  duration?: number;
  persistent?: boolean;
  message?: string;
};

export interface NotificationResponse {
  success: boolean;
  message: string;
  notification: Notification;
}

export interface NotificationError {
  error: string;
  message: string;
}

export interface MarkAllAsReadResponse {
  success: boolean;
  message: string;
  modifiedCount: number;
}

export interface UserNotificationsResponse {
  success: boolean;
  message: string;
  notifications: Notification[];
  count: number;
}
