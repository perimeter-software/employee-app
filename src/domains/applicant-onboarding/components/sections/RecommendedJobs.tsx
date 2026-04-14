'use client';

// Structural port of stadium-people RecommendedJobs (461). The full source queries
// /jobs with filters derived from the applicant's skills + venues, renders cards,
// and lets the applicant apply. This port just lists `applicant.recommendedJobs` if
// present and links to a stub apply flow; extend with the real fetch query.
import { useNewApplicantContext } from '../../state/new-applicant-context';
import { Card, CardContent } from '@/components/ui/Card';
import { StubBanner } from './_StepScaffold';
import { useEffect } from 'react';

const RecommendedJobs: React.FC = () => {
  const { applicant, updateButtons, updateCurrentFormState, submitRef } = useNewApplicantContext();

  useEffect(() => {
    updateCurrentFormState({ isDirty: false });
    updateButtons({
      previous: { show: true, disabled: false },
      next: { show: true, disabled: false },
      submit: { show: false, disabled: true },
    });
    submitRef.current = null;
  }, [updateButtons, updateCurrentFormState, submitRef]);

  const jobs =
    (applicant?.recommendedJobs as
      | Array<{ title?: string; venueName?: string; companyName?: string }>
      | undefined) ?? [];

  return (
    <div className="space-y-4">
      <StubBanner note="Recommended-jobs query pending. Showing what's on the applicant record." />
      {jobs.length === 0 && (
        <p className="text-sm text-gray-500">No recommended jobs at the moment.</p>
      )}
      <div className="grid gap-3">
        {jobs.map((j, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="font-medium text-gray-900">{j.title ?? 'Job'}</div>
              <div className="text-xs text-gray-500">
                {j.venueName ?? j.companyName ?? ''}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default RecommendedJobs;
