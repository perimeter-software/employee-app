'use client';

// Structural port of stadium-people Subscriptions (226). Original manages email/SMS
// preferences and venue subscriptions.
import { Controller } from 'react-hook-form';
import { StepScaffold, SimpleField } from './_StepScaffold';
import { useNewApplicantContext } from '../../state/new-applicant-context';

interface Values {
  emailNotifications: boolean;
  smsNotifications: boolean;
  marketingEmails: boolean;
}

const Subscriptions: React.FC = () => {
  const { applicant } = useNewApplicantContext();
  const subs = (applicant?.subscriptions as Record<string, boolean> | undefined) ?? {};

  return (
    <StepScaffold<Values>
      title="Subscriptions & Settings"
      defaultValues={{
        emailNotifications: !!subs.emailNotifications,
        smsNotifications: !!subs.smsNotifications,
        marketingEmails: !!subs.marketingEmails,
      }}
      toPayload={(v) => ({ subscriptions: v })}
    >
      {({ control }) => (
        <div className="space-y-3">
          <Controller
            name="emailNotifications"
            control={control}
            render={({ field }) => (
              <SimpleField label="">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                  />
                  Email notifications
                </label>
              </SimpleField>
            )}
          />
          <Controller
            name="smsNotifications"
            control={control}
            render={({ field }) => (
              <SimpleField label="">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                  />
                  SMS notifications
                </label>
              </SimpleField>
            )}
          />
          <Controller
            name="marketingEmails"
            control={control}
            render={({ field }) => (
              <SimpleField label="">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                  />
                  Marketing emails
                </label>
              </SimpleField>
            )}
          />
        </div>
      )}
    </StepScaffold>
  );
};

export default Subscriptions;
