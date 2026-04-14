'use client';

// Structural port of stadium-people DynamicStateTaxForm (973) + 6 state-specific
// variants (CA/GA/MI/SC/OK/AL). Full source renders the correct state form per
// applicant tax states with PDF generation. This port stores free-form state tax
// data under `applicant.stateTaxForms[<state>]`.
import { useMemo } from 'react';
import { Controller } from 'react-hook-form';
import { StepScaffold, SimpleField, StubBanner } from './_StepScaffold';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { useNewApplicantContext } from '../../state/new-applicant-context';

interface Values {
  allowances: string;
  additionalWithholding: string;
  exempt: string;
  notes: string;
  signature: string;
  signatureDate: string;
}

interface Props {
  stateCode: string;
}

const DynamicStateTaxForm: React.FC<Props> = ({ stateCode }) => {
  const { applicant } = useNewApplicantContext();
  const key = useMemo(() => `${stateCode.toLowerCase()}StateTaxForm`, [stateCode]);
  const existing =
    ((applicant as Record<string, unknown> | undefined)?.[key] as Record<string, unknown> | undefined) ??
    {};

  return (
    <StepScaffold<Values>
      title={`State Tax Form — ${stateCode}`}
      defaultValues={{
        allowances: (existing.allowances as string) ?? '',
        additionalWithholding: (existing.additionalWithholding as string) ?? '',
        exempt: (existing.exempt as string) ?? '',
        notes: (existing.notes as string) ?? '',
        signature: (existing.signature as string) ?? '',
        signatureDate: (existing.signatureDate as string) ?? '',
      }}
      toPayload={(v) => ({ [key]: v })}
    >
      {({ control }) => (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <StubBanner
            note={`Per-state ${stateCode} field set + PDF rendering pending; generic fields used here.`}
          />
          <Controller
            name="allowances"
            control={control}
            render={({ field }) => (
              <SimpleField label="Allowances">
                <Input {...field} />
              </SimpleField>
            )}
          />
          <Controller
            name="additionalWithholding"
            control={control}
            render={({ field }) => (
              <SimpleField label="Additional Withholding">
                <Input {...field} />
              </SimpleField>
            )}
          />
          <Controller
            name="exempt"
            control={control}
            render={({ field }) => (
              <SimpleField label="Exempt (Yes/No)">
                <Input {...field} />
              </SimpleField>
            )}
          />
          <Controller
            name="notes"
            control={control}
            render={({ field }) => (
              <div className="md:col-span-2">
                <SimpleField label="Notes">
                  <Textarea rows={3} {...field} />
                </SimpleField>
              </div>
            )}
          />
          <Controller
            name="signature"
            control={control}
            render={({ field }) => (
              <SimpleField label="Signature">
                <Input {...field} />
              </SimpleField>
            )}
          />
          <Controller
            name="signatureDate"
            control={control}
            render={({ field }) => (
              <SimpleField label="Date">
                <Input {...field} />
              </SimpleField>
            )}
          />
        </div>
      )}
    </StepScaffold>
  );
};

export default DynamicStateTaxForm;
