'use client';

// Ported from stadium-people/.../NewApplicantForms/ApplicantContactForm (429 lines).
// MUI + CustomTextField replaced by shadcn Input/Label; Autocomplete for state replaced by
// a native-backed shadcn Select; PatternFormat by a simple pattern-formatting controller.
import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { format } from 'date-fns';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { clsxm } from '@/lib/utils';
import { useNewApplicantContext } from '../../state/new-applicant-context';
import {
  onboardApplicantSchema,
  type OnboardApplicantValues,
} from '../../schemas/onboard-applicant-schema';
import { STATE_CODES } from '../../utils/state-codes';
import { parseApplicantPhone } from '../../utils/applicant-helpers';

function formatPhone(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 10);
  const a = d.slice(0, 3);
  const b = d.slice(3, 6);
  const c = d.slice(6, 10);
  if (d.length <= 3) return a;
  if (d.length <= 6) return `(${a}) ${b}`;
  return `(${a}) ${b} ${c}`;
}

type AvailabilityMode = '' | 'Immediate' | 'WithinTwoWeeks' | 'Within30Days' | 'enterDate';

const ApplicantContactForm: React.FC = () => {
  const {
    applicant,
    updateApplicantAction,
    updateButtons,
    updateCurrentFormState,
    submitRef,
  } = useNewApplicantContext();

  const defaultValues: OnboardApplicantValues = useMemo(
    () => ({
      applicationDate: applicant?.applicationDate
        ? format(new Date(applicant.applicationDate as string), 'MM/dd/yyyy')
        : format(new Date(), 'MM/dd/yyyy'),
      firstName: (applicant?.firstName as string) ?? '',
      lastName: (applicant?.lastName as string) ?? '',
      middleInitial: (applicant?.middleInitial as string) ?? '',
      address1: (applicant?.address1 as string) ?? '',
      city: (applicant?.city as string) ?? '',
      state: (applicant?.state as string) ?? '',
      zip: (applicant?.zip as string) ?? '',
      phone: applicant?.phone ? parseApplicantPhone(applicant.phone as string) : '',
      altPhone: (applicant?.altPhone as string) ?? '',
      availability: (applicant?.availability as string | null) ?? null,
    }),
    [applicant]
  );

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty, isValid, isSubmitSuccessful },
  } = useForm<OnboardApplicantValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: yupResolver(onboardApplicantSchema) as any,
    defaultValues,
    mode: 'onBlur',
  });

  // Keep the form in sync when the applicant in context changes.
  useEffect(() => {
    reset(defaultValues);
  }, [applicant, defaultValues, reset]);

  // Mirror stadium-people: show Save enabled while dirty or after a successful submit.
  useEffect(() => {
    updateCurrentFormState({ isDirty });
    updateButtons({ submit: { show: true, disabled: !isDirty } });
  }, [isDirty, updateButtons, updateCurrentFormState]);

  useEffect(() => {
    updateButtons({
      previous: { show: true, disabled: true },
      next: { show: true, disabled: !isValid },
      submit: { show: true, disabled: !isDirty && !isSubmitSuccessful },
    });
  }, [isValid, isSubmitSuccessful, isDirty, updateButtons]);

  const onSubmit = async (values: OnboardApplicantValues) => {
    if (!applicant?._id) return;
    const payload = {
      firstName: values.firstName,
      lastName: values.lastName,
      middleInitial: values.middleInitial ?? '',
      address1: values.address1,
      city: values.city,
      state: (values.state ?? '').toUpperCase(),
      zip: (values.zip ?? '').replace(/\D/g, ''),
      phone: (values.phone ?? '').replace(/\D/g, ''),
      altPhone: (values.altPhone ?? '').replace(/\D/g, ''),
      availability: values.availability ?? null,
    };
    await updateApplicantAction(applicant._id, payload);
  };

  // Register this form's submit with the parent FormContainer so its header Save button works.
  useEffect(() => {
    submitRef.current = handleSubmit(onSubmit);
    return () => {
      submitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleSubmit]);

  // Availability helpers: enterDate requires manual date; other options compute a future date.
  const availability = watch('availability');
  const availabilityMode: AvailabilityMode = useMemo(() => {
    if (!availability) return 'enterDate';
    return 'enterDate';
  }, [availability]);

  const handleAvailabilityChange = (mode: AvailabilityMode) => {
    const now = new Date();
    if (mode === 'enterDate') {
      setValue('availability', null, { shouldDirty: true });
    } else if (mode === 'Immediate') {
      setValue('availability', now.toISOString(), { shouldDirty: true });
    } else if (mode === 'WithinTwoWeeks') {
      const d = new Date(now);
      d.setDate(now.getDate() + 15);
      setValue('availability', d.toISOString(), { shouldDirty: true });
    } else if (mode === 'Within30Days') {
      const d = new Date(now);
      d.setDate(now.getDate() + 30);
      setValue('availability', d.toISOString(), { shouldDirty: true });
    }
  };

  return (
    <form id="current-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <p className="text-sm text-gray-700">
        Please review your email address, first and last name for accuracy before proceeding.
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReadonlyField label="Email Address" value={(applicant?.email as string) ?? ''} />
        <Controller
          name="applicationDate"
          control={control}
          render={({ field }) => (
            <ReadonlyField label="Application Date" value={field.value ?? ''} />
          )}
        />
        <Controller
          name="firstName"
          control={control}
          render={({ field }) => (
            <FormField label="First Name" error={errors.firstName?.message}>
              <Input {...field} value={field.value ?? ''} />
            </FormField>
          )}
        />
        <Controller
          name="middleInitial"
          control={control}
          render={({ field }) => (
            <FormField label="Middle Initial" error={errors.middleInitial?.message}>
              <Input {...field} value={field.value ?? ''} maxLength={1} />
            </FormField>
          )}
        />
        <Controller
          name="lastName"
          control={control}
          render={({ field }) => (
            <FormField label="Last Name" error={errors.lastName?.message}>
              <Input {...field} value={field.value ?? ''} />
            </FormField>
          )}
        />
        <Controller
          name="phone"
          control={control}
          render={({ field }) => (
            <FormField label="Mobile Number" error={errors.phone?.message}>
              <Input
                placeholder="(555) 555 5555"
                value={field.value ?? ''}
                onChange={(e) => field.onChange(formatPhone(e.target.value))}
                inputMode="tel"
              />
            </FormField>
          )}
        />
        <Controller
          name="address1"
          control={control}
          render={({ field }) => (
            <div className="lg:col-span-2">
              <FormField label="Address (include Unit #)" error={errors.address1?.message}>
                <Input {...field} value={field.value ?? ''} />
              </FormField>
            </div>
          )}
        />
        <Controller
          name="city"
          control={control}
          render={({ field }) => (
            <FormField label="City" error={errors.city?.message}>
              <Input {...field} value={field.value ?? ''} />
            </FormField>
          )}
        />
        <Controller
          name="state"
          control={control}
          render={({ field }) => (
            <FormField label="State" error={errors.state?.message}>
              <Select
                value={field.value ?? ''}
                onValueChange={(v) => field.onChange(v.toUpperCase())}
              >
                <SelectTrigger>
                  <SelectValue placeholder="State" />
                </SelectTrigger>
                <SelectContent>
                  {STATE_CODES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          )}
        />
        <Controller
          name="zip"
          control={control}
          render={({ field }) => (
            <FormField label="Zip Code" error={errors.zip?.message}>
              <Input {...field} value={field.value ?? ''} inputMode="numeric" />
            </FormField>
          )}
        />
        <Controller
          name="altPhone"
          control={control}
          render={({ field }) => (
            <FormField label="Alternate Mobile Number" error={errors.altPhone?.message}>
              <Input
                placeholder="(555) 555 5555"
                value={field.value ?? ''}
                onChange={(e) => field.onChange(formatPhone(e.target.value))}
                inputMode="tel"
              />
            </FormField>
          )}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-700">Availability</legend>
        <div className="flex flex-wrap gap-4 text-sm">
          {(['Immediate', 'WithinTwoWeeks', 'Within30Days', 'enterDate'] as AvailabilityMode[]).map(
            (mode) => (
              <label key={mode} className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="availability-mode"
                  value={mode}
                  checked={availabilityMode === mode}
                  onChange={() => handleAvailabilityChange(mode)}
                />
                <span>
                  {mode === 'Immediate' && 'Immediate'}
                  {mode === 'WithinTwoWeeks' && 'Within 2 weeks'}
                  {mode === 'Within30Days' && 'Within 30 days'}
                  {mode === 'enterDate' && 'Enter a date'}
                </span>
              </label>
            )
          )}
        </div>
        {availabilityMode === 'enterDate' && (
          <Controller
            name="availability"
            control={control}
            render={({ field }) => (
              <Input
                type="date"
                value={field.value ? format(new Date(field.value as string), 'yyyy-MM-dd') : ''}
                onChange={(e) =>
                  field.onChange(
                    e.target.value ? new Date(e.target.value).toISOString() : null
                  )
                }
                className="max-w-xs"
              />
            )}
          />
        )}
      </fieldset>

      {Object.keys(errors).length > 0 && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <div className="font-semibold">Please fix the following:</div>
          <ul className="mt-1 list-inside list-disc">
            {Object.entries(errors).map(([k, v]) => (
              <li key={k}>{(v as { message?: string })?.message ?? k}</li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
};

const FormField: React.FC<{
  label: string;
  error?: string;
  children: React.ReactNode;
}> = ({ label, error, children }) => (
  <div className="space-y-1">
    <Label>{label}</Label>
    {children}
    {error && <p className="text-xs text-red-600">{error}</p>}
  </div>
);

const ReadonlyField: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="space-y-1">
    <Label>{label}</Label>
    <Input value={value} readOnly disabled className={clsxm('bg-gray-50')} />
  </div>
);

export default ApplicantContactForm;
