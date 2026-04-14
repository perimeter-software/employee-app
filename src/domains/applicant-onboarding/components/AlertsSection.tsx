'use client';

// Placeholder port of stadium-people AlertsSection (119 lines).
import type { CurrentApplicantResponse } from '../types';

interface Props {
  isAvailable: boolean;
  currentApplicant: CurrentApplicantResponse | null | undefined;
}

const AlertsSection: React.FC<Props> = ({ isAvailable, currentApplicant }) => {
  if (!isAvailable || !currentApplicant?.applicant) return null;
  return null; // Nothing to show until alerts logic is ported.
};

export default AlertsSection;
