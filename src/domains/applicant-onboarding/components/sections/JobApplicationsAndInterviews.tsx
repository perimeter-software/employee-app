'use client';

// Structural port of stadium-people JobApplicationsAndInterviews (697). Full source
// shows two lists (applied jobs + scheduled interviews) with cancel/withdraw actions
// and AI screening launcher. This port renders the current arrays read-only.
import { useEffect } from 'react';
import { useNewApplicantContext } from '../../state/new-applicant-context';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { StubBanner } from './_StepScaffold';

const JobApplicationsAndInterviews: React.FC = () => {
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
    (applicant?.jobs as Array<{ jobSlug?: string; status?: string; title?: string }> | undefined) ??
    [];
  const interviews =
    (applicant?.interviews as
      | Array<{ date?: string; venueName?: string; status?: string }>
      | undefined) ?? [];

  return (
    <div className="space-y-4">
      <StubBanner note="Cancel/withdraw actions + AI screening launcher pending full port." />
      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Applications</h3>
        {jobs.length === 0 && <p className="text-xs text-gray-500">No applications yet.</p>}
        <div className="grid gap-2">
          {jobs.map((j, i) => (
            <Card key={i}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <div className="font-medium">{j.title ?? j.jobSlug}</div>
                </div>
                <Badge>{j.status ?? '—'}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-700">Interviews</h3>
        {interviews.length === 0 && <p className="text-xs text-gray-500">No interviews scheduled.</p>}
        <div className="grid gap-2">
          {interviews.map((iv, i) => (
            <Card key={i}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <div className="font-medium">{iv.venueName ?? 'Interview'}</div>
                  <div className="text-xs text-gray-500">{iv.date ?? ''}</div>
                </div>
                <Badge>{iv.status ?? '—'}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
};

export default JobApplicationsAndInterviews;
