export const DOCUMENT_TYPES = {
  BIRTH_CERTIFICATE_FRONT: 'Birth_Certificate_Front',
  BIRTH_CERTIFICATE_BACK: 'Birth_Certificate_Back',
  DD214_FRONT: 'DD214_Front',
  DD214_BACK: 'DD214_Back',
  DLPHOTO_FRONT: 'DLPhoto_Front',
  DLPHOTO_BACK: 'DLPhoto_Back',
  EMPLOYMENT_AUTHORIZATION_CARD_FRONT: 'Employment_Authorization_Card_Front',
  EMPLOYMENT_AUTHORIZATION_CARD_BACK: 'Employment_Authorization_Card_Back',
  PERMANENT_RESIDENT_CARD_FRONT: 'Permanent_Resident_Card_Front',
  PERMANENT_RESIDENT_CARD_BACK: 'Permanent_Resident_Card_Back',
  SOCIAL_SECURITY_CARD_FRONT: 'Social_Security_Card_Front',
  SOCIAL_SECURITY_CARD_BACK: 'Social_Security_Card_Back',
  US_PASSPORT_FRONT: 'US_Passport_Front',
  US_PASSPORT_BACK: 'US_Passport_Back',
  FOREIGN_PASSPORT_FRONT: 'Foreign_Passport_Front',
  FOREIGN_PASSPORT_BACK: 'Foreign_Passport_Back',
  STUDENT_ID_FRONT: 'Student_ID_Front',
  STUDENT_ID_BACK: 'Student_ID_Back',
  I_94: 'I_94',
} as const;

export interface AttachmentFile {
  docType?: string;
  filename?: string;
  name?: string;
  title?: string;
  type?: string;
  uploadDate?: string | Date;
  hidden?: string;
  recognition?: unknown;
}

// NOTE: The I-9 completeness rule and the "which documents are still required"
// computation live exclusively on the backend now (see the backend
// DocumentProcessingService). The applicant record's `onboardingDocsComplete`
// carries `complete`, `validIDs`, `passport`, `residentCard`, and a
// `requiredDocuments: { type, description }[]` array that the UI renders directly.
// Do NOT re-implement the completeness logic here — it must stay single-sourced.
