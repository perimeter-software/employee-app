'use client';

// Structural port of stadium-people ApplicantResumeAndJobHistory (419) +
// EducationModal (214) + JobHistoryModal (373). Full feature: resume dropzone,
// add/edit job history rows, add/edit education rows. This port shows the applicant's
// current job/education arrays read-only and wires save — extend with file upload
// + modal CRUD as needed.
import { useController } from 'react-hook-form';
import { StepScaffold, StubBanner } from './_StepScaffold';
import { Textarea } from '@/components/ui/Textarea';
import { Input } from '@/components/ui/Input';
import { useNewApplicantContext } from '../../state/new-applicant-context';

interface Values {
  objective: string;
  skills: string;
}

const ApplicantResumeAndJobHistory: React.FC = () => {
  const { applicant } = useNewApplicantContext();
  const history = (applicant?.jobHistory as Array<Record<string, unknown>> | undefined) ?? [];
  const education =
    (applicant?.educationHistory as Array<Record<string, unknown>> | undefined) ?? [];

  return (
    <StepScaffold<Values>
      title="Resume & Job History"
      description="Upload your resume, review job history, and add education."
      defaultValues={{
        objective: (applicant?.objective as string) ?? '',
        skills: Array.isArray(applicant?.skills)
          ? (applicant?.skills as string[]).join(', ')
          : (applicant?.skills as string) ?? '',
      }}
      toPayload={(v) => ({
        objective: v.objective,
        skills: v.skills
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      })}
    >
      {({ control }) => (
        <div className="space-y-4">
          <StubBanner note="Resume upload + job history / education modals pending full port." />
          <ObjectiveField control={control} />
          <SkillsField control={control} />
          <section>
            <h4 className="mb-2 text-sm font-semibold text-gray-700">Job History</h4>
            {history.length === 0 && <p className="text-xs text-gray-500">No entries yet.</p>}
            <ul className="divide-y divide-gray-100 text-sm">
              {history.map((h, i) => (
                <li key={i} className="py-2">
                  {String(h.jobTitle ?? h.title ?? '—')} @ {String(h.employer ?? h.company ?? '—')}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h4 className="mb-2 text-sm font-semibold text-gray-700">Education</h4>
            {education.length === 0 && <p className="text-xs text-gray-500">No entries yet.</p>}
            <ul className="divide-y divide-gray-100 text-sm">
              {education.map((e, i) => (
                <li key={i} className="py-2">
                  {String(e.schoolName ?? e.school ?? '—')} — {String(e.degree ?? '—')}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </StepScaffold>
  );
};

const ObjectiveField: React.FC<{ control: import('react-hook-form').Control<Values> }> = ({ control }) => {
  const { field } = useController({ name: 'objective', control });
  return (
    <label className="block text-sm">
      <div className="mb-1 text-xs font-medium uppercase text-gray-600">Objective</div>
      <Textarea rows={3} {...field} />
    </label>
  );
};

const SkillsField: React.FC<{ control: import('react-hook-form').Control<Values> }> = ({ control }) => {
  const { field } = useController({ name: 'skills', control });
  return (
    <label className="block text-sm">
      <div className="mb-1 text-xs font-medium uppercase text-gray-600">Skills (comma separated)</div>
      <Input {...field} />
    </label>
  );
};

export default ApplicantResumeAndJobHistory;
