'use client';

// Port of stadium-people Acknowledgement (147). Applicant signs off that all data is
// accurate; sets `acknowledged.date` on save which flips the onboarding flow to
// "complete" state (see setApplicantSteps in new-applicant-context).
import { Controller } from 'react-hook-form';
import { StepScaffold, SimpleField } from './_StepScaffold';
import { Input } from '@/components/ui/Input';
import { useNewApplicantContext } from '../../state/new-applicant-context';

interface Values {
  agree: boolean;
  signature: string;
}

const Acknowledgement: React.FC = () => {
  const { applicant } = useNewApplicantContext();
  const ack = applicant?.acknowledged as { date?: string; signature?: string } | undefined;
  return (
    <StepScaffold<Values>
      title="Acknowledgement"
      defaultValues={{
        agree: !!ack?.date,
        signature: ack?.signature ?? '',
      }}
      toPayload={(v) =>
        v.agree
          ? ({
              acknowledged: { date: new Date().toISOString(), signature: v.signature },
            } as unknown as import('../../types').ApplicantRecord)
          : null
      }
    >
      {({ control }) => (
        <div className="space-y-4 text-sm">
          <p>
            I certify that the information provided throughout this onboarding process is true and
            correct to the best of my knowledge.
          </p>
          <Controller
            name="agree"
            control={control}
            render={({ field }) => (
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!field.value}
                  onChange={(e) => field.onChange(e.target.checked)}
                />
                I agree.
              </label>
            )}
          />
          <Controller
            name="signature"
            control={control}
            render={({ field }) => (
              <SimpleField label="Signature (type full name)">
                <Input {...field} />
              </SimpleField>
            )}
          />
        </div>
      )}
    </StepScaffold>
  );
};

export default Acknowledgement;
