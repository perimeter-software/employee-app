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

export interface EmptyBox {
  type: string;
  description: string;
}

export function getRequiredEmptyBoxes(filesFinal: AttachmentFile[]): EmptyBox[] {
  const emptyBoxes: EmptyBox[] = [];

  if (!filesFinal.length) {
    emptyBoxes.push({
      type: 'Upload_Front',
      description: 'Please upload front and back of any required document',
    });
    return emptyBoxes;
  }

  const fileTypes = filesFinal.map((f) => f.type ?? '');
  const hasAnyDocumentType = Object.values(DOCUMENT_TYPES).some((t) => fileTypes.includes(t));

  if (!hasAnyDocumentType) {
    emptyBoxes.push({
      type: 'Upload_Front',
      description: 'Please upload front and back of any required document',
    });
    return emptyBoxes;
  }

  const isPairComplete = (front: string, back: string) =>
    fileTypes.includes(front) && fileTypes.includes(back);

  const hasUSPassport = isPairComplete(DOCUMENT_TYPES.US_PASSPORT_FRONT, DOCUMENT_TYPES.US_PASSPORT_BACK);
  const hasForeignPassport = isPairComplete(DOCUMENT_TYPES.FOREIGN_PASSPORT_FRONT, DOCUMENT_TYPES.FOREIGN_PASSPORT_BACK);
  const hasPermanentResident = isPairComplete(DOCUMENT_TYPES.PERMANENT_RESIDENT_CARD_FRONT, DOCUMENT_TYPES.PERMANENT_RESIDENT_CARD_BACK);
  const hasEmploymentAuth = isPairComplete(DOCUMENT_TYPES.EMPLOYMENT_AUTHORIZATION_CARD_FRONT, DOCUMENT_TYPES.EMPLOYMENT_AUTHORIZATION_CARD_BACK);
  const hasDLPhoto = isPairComplete(DOCUMENT_TYPES.DLPHOTO_FRONT, DOCUMENT_TYPES.DLPHOTO_BACK);
  const hasBirthCertificate = isPairComplete(DOCUMENT_TYPES.BIRTH_CERTIFICATE_FRONT, DOCUMENT_TYPES.BIRTH_CERTIFICATE_BACK);
  const hasSocialSecurityCard = isPairComplete(DOCUMENT_TYPES.SOCIAL_SECURITY_CARD_FRONT, DOCUMENT_TYPES.SOCIAL_SECURITY_CARD_BACK);
  const hasDD214 = isPairComplete(DOCUMENT_TYPES.DD214_FRONT, DOCUMENT_TYPES.DD214_BACK);
  const hasStudentID = isPairComplete(DOCUMENT_TYPES.STUDENT_ID_FRONT, DOCUMENT_TYPES.STUDENT_ID_BACK);
  const hasI94 = isPairComplete(DOCUMENT_TYPES.I_94, DOCUMENT_TYPES.I_94);

  const validDocuments: string[] = [];
  if (hasUSPassport) validDocuments.push('US Passport');
  if (hasPermanentResident) validDocuments.push('Permanent Resident Card');
  if (hasEmploymentAuth) validDocuments.push('Employment Authorization Card');
  if (hasDLPhoto) validDocuments.push("Driver's License");
  if (hasBirthCertificate) validDocuments.push('Birth Certificate');
  if (hasSocialSecurityCard) validDocuments.push('Social Security Card');
  if (hasDD214) validDocuments.push('DD214');
  if (hasI94) validDocuments.push('I-94');
  if (hasForeignPassport) validDocuments.push('Foreign Passport');
  if (hasStudentID) validDocuments.push('Student ID');

  const hasPrimaryDocument = hasUSPassport || hasPermanentResident || hasEmploymentAuth || hasForeignPassport;

  if (validDocuments.length >= 2) return [];
  if (hasPrimaryDocument) return [];

  if (validDocuments.length === 1) {
    // Suggest the missing side of incomplete pairs first
    const incompleteSide = findIncompleteSide(fileTypes);
    if (incompleteSide) {
      emptyBoxes.push(incompleteSide);
    } else {
      if (!hasBirthCertificate)
        emptyBoxes.push({ type: 'Birth_Certificate_Front_And_Back', description: 'Please upload Birth Certificate Front and Back' });
      if (!hasSocialSecurityCard)
        emptyBoxes.push({ type: 'Social_Security_Card_Front_And_Back', description: 'Please upload Social Security Card Front and Back' });
      if (!hasDD214)
        emptyBoxes.push({ type: 'DD214_Front_And_Back', description: 'Please upload DD214 Front and Back' });
      if (!hasI94)
        emptyBoxes.push({ type: 'I_94', description: 'Please upload I-94' });
    }
    return emptyBoxes;
  }

  // 0 valid documents — show incomplete pairs or suggestions
  const incompletePairs = buildIncompletePairs(fileTypes);
  emptyBoxes.push(...incompletePairs);

  if (incompletePairs.length === 0) {
    if (!hasBirthCertificate)
      emptyBoxes.push({ type: 'Birth_Certificate_Front_And_Back', description: 'Please upload Birth Certificate Front and Back' });
    if (!hasSocialSecurityCard)
      emptyBoxes.push({ type: 'Social_Security_Card_Front_And_Back', description: 'Please upload Social Security Card Front and Back' });
    if (!hasDD214)
      emptyBoxes.push({ type: 'DD214_Front_And_Back', description: 'Please upload DD214 Front and Back' });
    if (!hasI94)
      emptyBoxes.push({ type: 'I_94', description: 'Please upload I-94' });
  }

  return emptyBoxes;
}

function findIncompleteSide(fileTypes: string[]): EmptyBox | null {
  const pairs: Array<[string, string, string, string]> = [
    [DOCUMENT_TYPES.US_PASSPORT_FRONT, DOCUMENT_TYPES.US_PASSPORT_BACK, 'US Passport Front', 'US Passport Back'],
    [DOCUMENT_TYPES.PERMANENT_RESIDENT_CARD_FRONT, DOCUMENT_TYPES.PERMANENT_RESIDENT_CARD_BACK, 'Permanent Resident Card Front', 'Permanent Resident Card Back'],
    [DOCUMENT_TYPES.EMPLOYMENT_AUTHORIZATION_CARD_FRONT, DOCUMENT_TYPES.EMPLOYMENT_AUTHORIZATION_CARD_BACK, 'Employment Authorization Card Front', 'Employment Authorization Card Back'],
    [DOCUMENT_TYPES.FOREIGN_PASSPORT_FRONT, DOCUMENT_TYPES.FOREIGN_PASSPORT_BACK, 'Foreign Passport Front', 'Foreign Passport Back'],
    [DOCUMENT_TYPES.DLPHOTO_FRONT, DOCUMENT_TYPES.DLPHOTO_BACK, 'Driver License Photo Front', 'Driver License Photo Back'],
    [DOCUMENT_TYPES.BIRTH_CERTIFICATE_FRONT, DOCUMENT_TYPES.BIRTH_CERTIFICATE_BACK, 'Birth Certificate Front', 'Birth Certificate Back'],
    [DOCUMENT_TYPES.SOCIAL_SECURITY_CARD_FRONT, DOCUMENT_TYPES.SOCIAL_SECURITY_CARD_BACK, 'Social Security Card Front', 'Social Security Card Back'],
    [DOCUMENT_TYPES.DD214_FRONT, DOCUMENT_TYPES.DD214_BACK, 'DD214 Front', 'DD214 Back'],
    [DOCUMENT_TYPES.STUDENT_ID_FRONT, DOCUMENT_TYPES.STUDENT_ID_BACK, 'Student ID Front', 'Student ID Back'],
  ];
  for (const [front, back, frontLabel, backLabel] of pairs) {
    if (fileTypes.includes(front) && !fileTypes.includes(back))
      return { type: back, description: `Please upload ${backLabel} to complete the set` };
    if (fileTypes.includes(back) && !fileTypes.includes(front))
      return { type: front, description: `Please upload ${frontLabel} to complete the set` };
  }
  return null;
}

function buildIncompletePairs(fileTypes: string[]): EmptyBox[] {
  const result: EmptyBox[] = [];
  const docPairs: Array<[string, string, string, string]> = [
    [DOCUMENT_TYPES.US_PASSPORT_FRONT, DOCUMENT_TYPES.US_PASSPORT_BACK, 'Please upload US Passport Front', 'Please upload US Passport Back'],
    [DOCUMENT_TYPES.PERMANENT_RESIDENT_CARD_FRONT, DOCUMENT_TYPES.PERMANENT_RESIDENT_CARD_BACK, 'Please upload Permanent Resident Card Front', 'Please upload Permanent Resident Card Back'],
    [DOCUMENT_TYPES.EMPLOYMENT_AUTHORIZATION_CARD_FRONT, DOCUMENT_TYPES.EMPLOYMENT_AUTHORIZATION_CARD_BACK, 'Please upload Employment Authorization Card Front', 'Please upload Employment Authorization Card Back'],
    [DOCUMENT_TYPES.FOREIGN_PASSPORT_FRONT, DOCUMENT_TYPES.FOREIGN_PASSPORT_BACK, 'Please upload Foreign Passport Front', 'Please upload Foreign Passport Back'],
    [DOCUMENT_TYPES.DLPHOTO_FRONT, DOCUMENT_TYPES.DLPHOTO_BACK, 'Please upload Driver License Photo Front', 'Please upload Driver License Photo Back'],
    [DOCUMENT_TYPES.BIRTH_CERTIFICATE_FRONT, DOCUMENT_TYPES.BIRTH_CERTIFICATE_BACK, 'Please upload Birth Certificate Front', 'Please upload Birth Certificate Back'],
    [DOCUMENT_TYPES.SOCIAL_SECURITY_CARD_FRONT, DOCUMENT_TYPES.SOCIAL_SECURITY_CARD_BACK, 'Please upload Social Security Card Front', 'Please upload Social Security Card Back'],
    [DOCUMENT_TYPES.DD214_FRONT, DOCUMENT_TYPES.DD214_BACK, 'Please upload DD214 Front', 'Please upload DD214 Back'],
    [DOCUMENT_TYPES.STUDENT_ID_FRONT, DOCUMENT_TYPES.STUDENT_ID_BACK, 'Please upload Student ID Front', 'Please upload Student ID Back'],
  ];
  for (const [front, back, frontMsg, backMsg] of docPairs) {
    const hasF = fileTypes.includes(front);
    const hasB = fileTypes.includes(back);
    if ((hasF || hasB) && !(hasF && hasB)) {
      if (!hasB) result.push({ type: back, description: backMsg });
      if (!hasF) result.push({ type: front, description: frontMsg });
    }
  }
  return result;
}
