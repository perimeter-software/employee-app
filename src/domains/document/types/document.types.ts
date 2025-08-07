/* eslint-disable @typescript-eslint/no-explicit-any */
export type Document = {
  id?: string;
  _id?: string;
  name: string;
  originalName?: string;
  description?: string;
  filePath?: string;
  fileName?: string;
  fileSize?: number;
  fileType: string;
  fileExtension?: string;
  company?: string;
  uploadedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
  applicantId?: string;
  uploadedAt?: Date;
  type?: string;
  downloadCount?: number;
};

// Interface for the MongoDB attachment structure
export interface MongoAttachment {
  _id?: any;
  title?: string;
  filename?: string;
  docType?: string;
  type?: string;
  uploadDate?: Date;
  uploadedAt?: Date;
  deleted?: boolean;
  deletedAt?: Date;
  recognition?: any;
  recognition_date?: string;
  previous_type?: string;
  type_changed_by?: string;
  [key: string]: any; // Allow other properties from the MongoDB structure
}
