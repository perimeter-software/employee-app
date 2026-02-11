import type { ObjectId } from "mongodb";
import { Attachment } from "./attachment.types";

export type Applicant = {
  _id: string;
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  attachments: Attachment[];
};

/** Note entry on an applicant document (e.g. manager note from timecard) */
export type ApplicantNote = {
  type: string;
  text: string;
  firstName: string;
  lastName: string;
  userId: string;
  date: Date;
};

/** Applicant document as stored in MongoDB (ObjectId _id for collection filter/update typing) */
export type ApplicantCollectionDoc = {
  _id: ObjectId;
  notes?: ApplicantNote[];
  modifiedDate?: Date;
};
