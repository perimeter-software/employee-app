'use client';

// Port of stadium-people DirectDeposit (57) — small form.
import { Controller } from 'react-hook-form';
import { StepScaffold, SimpleField } from './_StepScaffold';
import { Input } from '@/components/ui/Input';
import { useNewApplicantContext } from '../../state/new-applicant-context';

interface Values {
  accountType: string;
  routingNumber: string;
  accountNumber: string;
  bankName: string;
}

const DirectDeposit: React.FC = () => {
  const { applicant } = useNewApplicantContext();
  const existing = (applicant?.directDeposit as Record<string, unknown> | undefined) ?? {};
  return (
    <StepScaffold<Values>
      title="Direct Deposit"
      defaultValues={{
        accountType: (existing.accountType as string) ?? '',
        routingNumber: (existing.routingNumber as string) ?? '',
        accountNumber: (existing.accountNumber as string) ?? '',
        bankName: (existing.bankName as string) ?? '',
      }}
      toPayload={(v) => ({ directDeposit: v })}
    >
      {({ control }) => (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Controller
            name="accountType"
            control={control}
            render={({ field }) => (
              <SimpleField label="Account Type (Checking/Savings)">
                <Input {...field} />
              </SimpleField>
            )}
          />
          <Controller
            name="bankName"
            control={control}
            render={({ field }) => (
              <SimpleField label="Bank Name">
                <Input {...field} />
              </SimpleField>
            )}
          />
          <Controller
            name="routingNumber"
            control={control}
            render={({ field }) => (
              <SimpleField label="Routing Number">
                <Input {...field} inputMode="numeric" />
              </SimpleField>
            )}
          />
          <Controller
            name="accountNumber"
            control={control}
            render={({ field }) => (
              <SimpleField label="Account Number">
                <Input {...field} inputMode="numeric" />
              </SimpleField>
            )}
          />
        </div>
      )}
    </StepScaffold>
  );
};

export default DirectDeposit;
