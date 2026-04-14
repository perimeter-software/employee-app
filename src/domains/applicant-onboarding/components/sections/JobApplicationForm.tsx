'use client';

// Structural port of stadium-people JobApplicationForm (766). Full source collects
// employment eligibility answers, signatures, and writes to applicant.jobApplication.
// This port wires a few representative fields; fill out the full question set from
// the source as needed.
import { Controller } from 'react-hook-form';
import { StepScaffold, SimpleField, StubBanner } from './_StepScaffold';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { useNewApplicantContext } from '../../state/new-applicant-context';

interface Values {
  desiredPosition: string;
  desiredPay: string;
  authorizedToWorkInUS: string;
  requireSponsorship: string;
  convictedOfFelony: string;
  felonyExplanation: string;
  signature: string;
}

const JobApplicationForm: React.FC = () => {
  const { applicant } = useNewApplicantContext();
  const existing = (applicant?.jobApplication as Record<string, unknown> | undefined) ?? {};

  return (
    <StepScaffold<Values>
      title="Job Application"
      defaultValues={{
        desiredPosition: (existing.desiredPosition as string) ?? '',
        desiredPay: (existing.desiredPay as string) ?? '',
        authorizedToWorkInUS: (existing.authorizedToWorkInUS as string) ?? '',
        requireSponsorship: (existing.requireSponsorship as string) ?? '',
        convictedOfFelony: (existing.convictedOfFelony as string) ?? '',
        felonyExplanation: (existing.felonyExplanation as string) ?? '',
        signature: (existing.signature as string) ?? '',
      }}
      toPayload={(v) => ({ jobApplication: v })}
    >
      {({ control, formState: { errors } }) => (
        <div className="space-y-4">
          <StubBanner note="Full question set (availability, prior employment, references) pending." />
          <Controller
            name="desiredPosition"
            control={control}
            render={({ field }) => (
              <SimpleField label="Desired Position">
                <Input {...field} />
              </SimpleField>
            )}
          />
          <Controller
            name="desiredPay"
            control={control}
            render={({ field }) => (
              <SimpleField label="Desired Pay">
                <Input {...field} />
              </SimpleField>
            )}
          />
          <Controller
            name="authorizedToWorkInUS"
            control={control}
            render={({ field }) => (
              <SimpleField label="Authorized to work in the U.S.?">
                <Input {...field} placeholder="Yes / No" />
              </SimpleField>
            )}
          />
          <Controller
            name="requireSponsorship"
            control={control}
            render={({ field }) => (
              <SimpleField label="Require sponsorship?">
                <Input {...field} placeholder="Yes / No" />
              </SimpleField>
            )}
          />
          <Controller
            name="convictedOfFelony"
            control={control}
            render={({ field }) => (
              <SimpleField label="Convicted of a felony?">
                <Input {...field} placeholder="Yes / No" />
              </SimpleField>
            )}
          />
          <Controller
            name="felonyExplanation"
            control={control}
            render={({ field }) => (
              <SimpleField label="If yes, please explain">
                <Textarea rows={3} {...field} />
              </SimpleField>
            )}
          />
          <Controller
            name="signature"
            control={control}
            render={({ field }) => (
              <SimpleField label="Signature (type full name)" error={errors.signature?.message}>
                <Input {...field} />
              </SimpleField>
            )}
          />
        </div>
      )}
    </StepScaffold>
  );
};

export default JobApplicationForm;
