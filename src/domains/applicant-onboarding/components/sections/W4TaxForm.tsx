'use client';

// Structural port of stadium-people W4TaxForm (527) + FederalW4Tax. Full source
// computes federal withholding per the 2020+ W-4. This port collects the headline
// fields; implement calculators and PDF output per stadium-people/W4TaxForm.
import { Controller } from 'react-hook-form';
import { StepScaffold, SimpleField, StubBanner } from './_StepScaffold';
import { Input } from '@/components/ui/Input';
import { useNewApplicantContext } from '../../state/new-applicant-context';

interface Values {
  filingStatus: string;
  multipleJobs: string;
  dependentsAmount: string;
  otherIncome: string;
  deductions: string;
  extraWithholding: string;
  signature: string;
  signatureDate: string;
}

const W4TaxForm: React.FC = () => {
  const { applicant } = useNewApplicantContext();
  const existing = (applicant?.w4Tax as Record<string, unknown> | undefined) ?? {};
  return (
    <StepScaffold<Values>
      title="W-4 Tax Form"
      defaultValues={{
        filingStatus: (existing.filingStatus as string) ?? '',
        multipleJobs: (existing.multipleJobs as string) ?? '',
        dependentsAmount: (existing.dependentsAmount as string) ?? '',
        otherIncome: (existing.otherIncome as string) ?? '',
        deductions: (existing.deductions as string) ?? '',
        extraWithholding: (existing.extraWithholding as string) ?? '',
        signature: (existing.signature as string) ?? '',
        signatureDate: (existing.signatureDate as string) ?? '',
      }}
      toPayload={(v) => ({ w4Tax: v })}
    >
      {({ control }) => (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <StubBanner note="W-4 calculator + PDF rendering pending." />
          {(
            [
              ['filingStatus', 'Filing Status (S/M/HoH)'],
              ['multipleJobs', 'Multiple Jobs (Yes/No)'],
              ['dependentsAmount', 'Dependents Amount'],
              ['otherIncome', 'Other Income'],
              ['deductions', 'Deductions'],
              ['extraWithholding', 'Extra Withholding'],
              ['signature', 'Signature'],
              ['signatureDate', 'Date'],
            ] as [keyof Values, string][]
          ).map(([name, label]) => (
            <Controller
              key={name}
              name={name}
              control={control}
              render={({ field }) => (
                <SimpleField label={label}>
                  <Input {...field} />
                </SimpleField>
              )}
            />
          ))}
        </div>
      )}
    </StepScaffold>
  );
};

export default W4TaxForm;
