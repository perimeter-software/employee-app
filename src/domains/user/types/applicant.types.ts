import { Attachment } from "./attachment.types";

export type Applicant = {
  _id: string;
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  attachments: Attachment[];
};
