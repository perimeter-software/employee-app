'use client';

import React from 'react';
import { Construction } from 'lucide-react';

interface ApplicantPlaceholderProps {
  title: string;
}

/**
 * Temporary placeholder shown for applicant screens that have not yet been
 * ported from stadium-people. Replace with the real component when ready.
 */
const ApplicantPlaceholder: React.FC<ApplicantPlaceholderProps> = ({ title }) => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-zinc-500">
    <Construction className="w-12 h-12 text-zinc-300" />
    <h2 className="text-xl font-semibold text-zinc-700">{title}</h2>
    <p className="text-sm">This screen is coming soon.</p>
  </div>
);

export default ApplicantPlaceholder;
