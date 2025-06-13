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
