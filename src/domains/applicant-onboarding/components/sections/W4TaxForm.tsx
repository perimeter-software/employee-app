'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { toast } from 'sonner';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { useNewApplicantContext } from '../../state/new-applicant-context';
import { w4Schema, type W4FormValues } from '../../data/w4-schema';

// ── Helpers ────────────────────────────────────────────────────────────────

const ReadOnlyField: React.FC<{ label: string; value?: string }> = ({ label, value }) => (
  <div className="space-y-1">
    <Label className="text-xs font-medium text-gray-500">{label}</Label>
    <Input value={value ?? ''} disabled readOnly tabIndex={-1} />
  </div>
);

const CurrencyInput: React.FC<{
  value: number | undefined;
  onChange: (v: number) => void;
  onBlur?: () => void;
  disabled?: boolean;
  tabIndex?: number;
}> = ({ value, onChange, onBlur, disabled, tabIndex }) => (
  <div className="relative">
    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
      $
    </span>
    <Input
      type="number"
      min={0}
      step={0.01}
      value={value ?? 0}
      onChange={(e) => onChange(Number(e.target.value))}
      onBlur={onBlur}
      disabled={disabled}
      tabIndex={tabIndex}
      className="pl-7 text-right"
    />
  </div>
);

const DisplayAmount: React.FC<{ value: number | null }> = ({ value }) => (
  <div className="relative">
    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">
      $
    </span>
    <Input
      type="number"
      value={value ?? 0}
      disabled
      readOnly
      tabIndex={-1}
      className="pl-7 text-right"
    />
  </div>
);

// ── Component ──────────────────────────────────────────────────────────────

const W4TaxForm: React.FC = () => {
  const {
    applicant,
    updateApplicantAction,
    updateButtons,
    updateCurrentFormState,
    submitRef,
  } = useNewApplicantContext();

  const existing = applicant?.w4Tax as Record<string, unknown> | undefined;

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { isDirty, isSubmitSuccessful },
  } = useForm<W4FormValues>({
    resolver: yupResolver(w4Schema),
    mode: 'onBlur',
    defaultValues: {
      formYear: '2026',
      filingStatus: (existing?.filingStatus as string) || '',
      multipleJobs: existing?.multipleJobs === 'Yes' ? 'Yes' : 'No',
      numberOfChildren: Number(existing?.numberOfChildren ?? 0),
      otherDependents: Number(existing?.otherDependents ?? 0),
      otherIncome: Number(existing?.otherIncome ?? 0),
      deductions: Number(existing?.deductions ?? 0),
      extraWithholding: Number(existing?.extraWithholding ?? 0),
      exemptFromWithholding: existing?.exemptFromWithholding === 'Yes' ? 'Yes' : 'No',
    },
  });

  const [canContinue, setCanContinue] = useState(false);
  const renderKey = useRef(0);

  const formYear = watch('formYear');
  const childrenMultiplier = formYear === '2026' ? 2200 : 2000;

  const numberOfChildren = watch('numberOfChildren') ?? 0;
  const otherDependents = watch('otherDependents') ?? 0;
  const childrenAmount = Math.floor(Number(numberOfChildren) * childrenMultiplier);
  const dependentsAmount = Math.floor(Number(otherDependents) * 500);
  const totalDependents = childrenAmount + dependentsAmount;

  // Sync if applicant data changes (e.g. after save)
  useEffect(() => {
    if (applicant?.w4Tax) {
      const w4 = applicant.w4Tax as Record<string, unknown>;
      reset({
        formYear: '2026',
        filingStatus: (w4.filingStatus as string) || '',
        multipleJobs: w4.multipleJobs === 'Yes' ? 'Yes' : 'No',
        numberOfChildren: Number(w4.numberOfChildren ?? 0),
        otherDependents: Number(w4.otherDependents ?? 0),
        otherIncome: Number(w4.otherIncome ?? 0),
        deductions: Number(w4.deductions ?? 0),
        extraWithholding: Number(w4.extraWithholding ?? 0),
        exemptFromWithholding: w4.exemptFromWithholding === 'Yes' ? 'Yes' : 'No',
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicant]);

  useEffect(() => {
    updateCurrentFormState({ isDirty });
  }, [isDirty, updateCurrentFormState]);

  useEffect(() => {
    const currentKey = Math.round(Math.random() * 10000);
    renderKey.current = currentKey;
    if (applicant?.w4Tax) {
      w4Schema
        .validate(applicant.w4Tax)
        .then(() => { if (renderKey.current === currentKey) setCanContinue(true); })
        .catch(() => { if (renderKey.current === currentKey) setCanContinue(false); });
    } else if (renderKey.current === currentKey) {
      setCanContinue(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicant]);

  useEffect(() => {
    updateButtons({
      previous: { show: true, disabled: false },
      next: { show: true, disabled: !canContinue },
      submit: { show: true, disabled: !isDirty && !isSubmitSuccessful },
    });
  }, [isDirty, canContinue, isSubmitSuccessful, updateButtons]);

  const onSubmit = useCallback(async (data: W4FormValues) => {
    if (!applicant?._id) return;
    // formYear is not registered as a Controller field, so inject it explicitly
    await updateApplicantAction(applicant._id, { w4Tax: { ...data, formYear: '2026' } });
  }, [applicant?._id, updateApplicantAction]);

  useEffect(() => {
    submitRef.current = handleSubmit(onSubmit, () => {
      toast.error('Please complete all required fields before saving.');
    });
    return () => { submitRef.current = null; };
  }, [handleSubmit, onSubmit, submitRef]);

  return (
    <div className="space-y-6">
      {/* Personal info (read-only) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ReadOnlyField label="First Name" value={applicant?.firstName as string} />
        <ReadOnlyField label="Last Name" value={applicant?.lastName as string} />
        <ReadOnlyField label="Address" value={applicant?.address1 as string} />
        <ReadOnlyField label="City" value={applicant?.city as string} />
        <ReadOnlyField label="State" value={applicant?.state as string} />
        <ReadOnlyField label="Zip Code" value={applicant?.zip as string} />
      </div>

      <form id="current-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Step 1: Filing Status */}
        <Controller
          name="filingStatus"
          control={control}
          render={({ field, fieldState }) => (
            <div className="space-y-2">
              {(
                [
                  ['Single', 'Single or Married filing separately'],
                  ['Married', 'Married filing jointly or Qualifying surviving spouse'],
                  [
                    'Head of Household',
                    "Head of household (Check only if you're unmarried and pay more than half the costs of keeping up home for yourself and a qualifying individual)",
                  ],
                ] as [string, string][]
              ).map(([val, label]) => (
                <label key={val} className="flex cursor-pointer items-start gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    className="mt-0.5 shrink-0"
                    checked={field.value === val}
                    onChange={() => field.onChange(val)}
                  />
                  {label}
                </label>
              ))}
              {fieldState.error && (
                <p className="text-xs text-red-600">{fieldState.error.message}</p>
              )}
            </div>
          )}
        />

        {/* Step 2: Multiple Jobs */}
        <div className="space-y-1">
          <p className="text-sm font-semibold">Step 2: Multiple Jobs</p>
          <Controller
            name="multipleJobs"
            control={control}
            render={({ field }) => (
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 shrink-0"
                  checked={field.value === 'Yes'}
                  onChange={(e) => field.onChange(e.target.checked ? 'Yes' : 'No')}
                />
                Do you have multiple jobs, or do both you and your spouse work?
              </label>
            )}
          />
        </div>

        {/* Step 3: Claim Dependents */}
        <div className="space-y-3">
          <p className="text-sm font-semibold">Step 3: Claim Dependents</p>

          {/* Children row */}
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3">
            <p className="text-sm">
              Multiply the number of qualifying children under age 17 by ${childrenMultiplier.toLocaleString()}
            </p>
            <div className="w-28">
              <Controller
                name="numberOfChildren"
                control={control}
                render={({ field }) => (
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Children</Label>
                    <Input
                      type="number"
                      min={0}
                      max={25}
                      step={1}
                      value={field.value ?? 0}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      onBlur={field.onBlur}
                      className="text-right"
                    />
                  </div>
                )}
              />
            </div>
            <div className="w-32">
              <Label className="text-xs text-gray-500">Total Benefit</Label>
              <DisplayAmount value={childrenAmount} />
            </div>
          </div>

          {/* Dependents row */}
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3">
            <p className="text-sm">Multiply the number of other dependents by $500</p>
            <div className="w-28">
              <Controller
                name="otherDependents"
                control={control}
                render={({ field }) => (
                  <div className="space-y-1">
                    <Label className="text-xs text-gray-500">Dependents</Label>
                    <Input
                      type="number"
                      min={0}
                      max={25}
                      step={1}
                      value={field.value ?? 0}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      onBlur={field.onBlur}
                      className="text-right"
                    />
                  </div>
                )}
              />
            </div>
            <div className="w-32">
              <Label className="text-xs text-gray-500">Total Benefit</Label>
              <DisplayAmount value={dependentsAmount} />
            </div>
          </div>

          {/* Total row */}
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3">
            <p className="text-sm">Add the amounts above and enter the total here</p>
            <div className="w-28" />
            <div className="w-32">
              <Label className="text-xs text-gray-500">TOTAL</Label>
              <DisplayAmount value={totalDependents} />
            </div>
          </div>
        </div>

        {/* Step 4: Other Adjustments */}
        <div className="space-y-3">
          <p className="text-sm font-semibold">Step 4 (optional): Other Adjustments</p>

          <div className="grid grid-cols-[1fr_auto] items-start gap-3">
            <p className="text-sm">
              (a) Other income (not from jobs). If you want tax withheld for other income you expect
              this year that won&apos;t have withholding, enter the amount of other income here. This
              may include interest, dividends, and retirement income.
            </p>
            <div className="w-32">
              <Controller
                name="otherIncome"
                control={control}
                render={({ field }) => (
                  <CurrencyInput
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto] items-start gap-3">
            <p className="text-sm">
              (b) Deductions. If you expect to claim deductions other than the standard deduction
              and want to reduce your withholding, use the Deductions Worksheet on page 4 and enter
              the result here
            </p>
            <div className="w-32">
              <Controller
                name="deductions"
                control={control}
                render={({ field }) => (
                  <CurrencyInput
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-[1fr_auto] items-start gap-3">
            <p className="text-sm">
              (c) Extra withholding. Enter any additional tax you want withheld each pay period.
            </p>
            <div className="w-32">
              <Controller
                name="extraWithholding"
                control={control}
                render={({ field }) => (
                  <CurrencyInput
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                )}
              />
            </div>
          </div>
        </div>

        {/* Exempt from Withholding */}
        <div className="space-y-1">
          <p className="text-sm font-semibold">Exempt from Withholding</p>
          <Controller
            name="exemptFromWithholding"
            control={control}
            render={({ field }) => (
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 shrink-0"
                  checked={field.value === 'Yes'}
                  onChange={(e) => field.onChange(e.target.checked ? 'Yes' : 'No')}
                />
                I claim exemption from withholding for 2026, and I certify that I meet both of the
                conditions for exemption for 2026. I understand I will need to submit a new Form
                W-4 for 2027.
              </label>
            )}
          />
        </div>
      </form>
    </div>
  );
};

export default W4TaxForm;
