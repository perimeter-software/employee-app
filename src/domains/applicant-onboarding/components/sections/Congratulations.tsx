'use client';

import { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import { CircleCheck } from 'lucide-react';
import { useNewApplicantContext } from '../../state/new-applicant-context';
import { OnboardingService } from '../../services/onboarding-service';
import type { Company } from '@/domains/company/types';

const Congratulations: React.FC = () => {
  const { updateButtons, updateCurrentFormState, submitRef } = useNewApplicantContext();
  const [company, setCompany] = useState<Company | null>(null);

  useEffect(() => {
    updateCurrentFormState({ isDirty: false });
    updateButtons({
      previous: { show: false, disabled: false },
      next: { show: false, disabled: false },
      submit: { show: false, disabled: false },
    });
    submitRef.current = null;
  }, [updateButtons, updateCurrentFormState, submitRef]);

  useEffect(() => {
    OnboardingService.getPrimaryCompany().then(setCompany).catch(() => {});
  }, []);

  const completionHtml =
    typeof window !== 'undefined' && company?.onboardingCompletionText
      ? DOMPurify.sanitize(company.onboardingCompletionText)
      : '';

  return (
    <div className="space-y-4 p-3">
      <h2 className="flex items-center gap-2 text-2xl font-bold">
        <CircleCheck className="h-7 w-7 text-green-600" />
        Congratulations!
      </h2>

      {completionHtml ? (
        <div className="space-y-3 text-sm">
          <div dangerouslySetInnerHTML={{ __html: completionHtml }} />
          <p>
            If you have not received your email after 48 hours from completion you may contact your
            recruiter or send us a message at:{' '}
            {company?.companyEmail && (
              <a
                href={`mailto:${company.companyEmail}`}
                className="font-bold text-blue-600 hover:underline"
              >
                {company.companyEmail}
              </a>
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          <p>
            You have completed the onboarding forms and will receive an email from{' '}
            {company?.name ?? 'our organization'} as soon as your background screening is complete,
            and you can begin.
          </p>
          <p>
            In the meantime, we thank you for applying with our organization and look forward to
            working together.
          </p>
          <p>
            If you have not received your email after 48 hours from completion you may contact your
            recruiter or send us a message at:{' '}
            {company?.companyEmail && (
              <a
                href={`mailto:${company.companyEmail}`}
                className="font-bold text-blue-600 hover:underline"
              >
                {company.companyEmail}
              </a>
            )}
          </p>
        </div>
      )}
    </div>
  );
};

export default Congratulations;
