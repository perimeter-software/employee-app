'use client';

import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import axios from 'axios';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { useNewApplicantContext } from '../../state/new-applicant-context';
import { i9Schema } from '../../data/i9-schema';
import SignatureModal from './SignatureModal';

interface I9FormValues {
  citizenshipStatus: string;
  alienRegistrationNumber: string;
  formI94AdmissionNumber: string;
  foreignPassportNumberAndCountryOfIssuance: string;
  expirationDate: string;
  authorizedAlienCountry: string;
  preparerOrTranslator: string;
  signature: string;
  processedDate: string;
}

interface CountryOption {
  code: string;
  label?: string;
}

const IMAGE_SERVER = process.env.NEXT_PUBLIC_IMAGE_SERVER ?? '';

// ── Field row ──────────────────────────────────────────────────────────────
const Field: React.FC<{
  label: string;
  error?: string;
  children: React.ReactNode;
}> = ({ label, error, children }) => (
  <div className="space-y-1">
    <Label className="text-xs font-medium uppercase tracking-wide text-gray-600">{label}</Label>
    {children}
    {error && <p className="text-xs text-red-600">{error}</p>}
  </div>
);

// ── Radio option ───────────────────────────────────────────────────────────
const RadioOption: React.FC<{
  value: string;
  current: string;
  onChange: (v: string) => void;
  label: string;
}> = ({ value, current, onChange, label }) => (
  <label className="flex cursor-pointer items-start gap-2">
    <input
      type="radio"
      className="mt-0.5 shrink-0"
      value={value}
      checked={current === value}
      onChange={() => onChange(value)}
    />
    <span className="text-sm font-semibold">{label}</span>
  </label>
);

// ── Read-only display field ────────────────────────────────────────────────
const ReadOnlyField: React.FC<{ label: string; value?: string }> = ({ label, value }) => (
  <div className="space-y-1">
    <Label className="text-xs font-medium uppercase tracking-wide text-gray-600">{label}</Label>
    <Input value={value ?? ''} readOnly tabIndex={-1} className="bg-gray-50" />
  </div>
);

// ── I9Form ─────────────────────────────────────────────────────────────────
const I9Form: React.FC = () => {
  const {
    applicant,
    updateApplicantAction,
    updateButtons,
    updateCurrentFormState,
    submitRef,
  } = useNewApplicantContext();

  const i9 = applicant?.i9Form as Record<string, unknown> | undefined;

  const {
    control,
    handleSubmit,
    setValue,
    trigger,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<I9FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: yupResolver(i9Schema as any),
    mode: 'onBlur',
    defaultValues: {
      citizenshipStatus: (i9?.citizenshipStatus as string) ?? '',
      alienRegistrationNumber: (i9?.alienRegistrationNumber as string) ?? '',
      formI94AdmissionNumber: (i9?.formI94AdmissionNumber as string) ?? '',
      foreignPassportNumberAndCountryOfIssuance:
        (i9?.foreignPassportNumberAndCountryOfIssuance as string) ?? '',
      expirationDate: (i9?.expirationDate as string) ?? '',
      authorizedAlienCountry: (i9?.authorizedAlienCountry as string) ?? '',
      preparerOrTranslator: (i9?.preparerOrTranslator as string) ?? '',
      signature: (i9?.signature as string) ?? '',
      processedDate: (i9?.processedDate as string) ?? new Date().toISOString(),
    },
  });

  const citizenshipStatus = watch('citizenshipStatus');
  const preparerOrTranslator = watch('preparerOrTranslator');

  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [canContinue, setCanContinue] = useState(false);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const renderKey = useRef(0);

  // ── Fetch countries ──────────────────────────────────────────────────────
  useEffect(() => {
    axios
      .get<CountryOption[] | { data: CountryOption[] }>(
        '/api/applicant-onboarding/dropdowns/countries'
      )
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : (res.data as { data: CountryOption[] }).data ?? [];
        setCountries(list);
      })
      .catch(() => {
        // Countries list is optional — proceed without it
      });
  }, []);

  // ── Validate saved i9Form data to determine if "next" is allowed ─────────
  useEffect(() => {
    const currentRenderKey = Math.round(Math.random() * 10000);
    renderKey.current = currentRenderKey;
    if (applicant?.i9Form) {
      i9Schema
        .validate(applicant.i9Form)
        .then(() => {
          if (renderKey.current === currentRenderKey) setCanContinue(true);
        })
        .catch(() => {
          if (renderKey.current === currentRenderKey) setCanContinue(false);
        });
    } else {
      setCanContinue(false);
    }
  }, [applicant]);

  // ── Sync form when applicant changes ────────────────────────────────────
  useEffect(() => {
    if (applicant?.i9Form) {
      reset(applicant.i9Form as I9FormValues, { keepErrors: true });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicant]);

  // ── Button state: next requires saved valid data + signature ─────────────
  useEffect(() => {
    updateButtons({
      previous: { show: true, disabled: false },
      next: {
        show: true,
        disabled: !canContinue || !applicant?.i9Form?.signature,
      },
      submit: { show: true, disabled: !isDirty },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canContinue, applicant?.i9Form?.signature, isDirty]);

  useEffect(() => {
    updateCurrentFormState({ isDirty });
  }, [isDirty, updateCurrentFormState]);

  // ── Submit ref: validate then open signature modal ───────────────────────
  const validateAndSign = async () => {
    const valid = await trigger();
    if (valid) setSignatureModalOpen(true);
  };

  useEffect(() => {
    submitRef.current = validateAndSign;
    return () => { submitRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  // ── Save form after signature is captured ────────────────────────────────
  const onSubmit = async (values: I9FormValues) => {
    if (!applicant?._id) return;
    await updateApplicantAction(applicant._id, { i9Form: values });
  };

  const handleSignatureSaved = async (filename: string) => {
    setValue('signature', filename, { shouldDirty: true });
    await handleSubmit(onSubmit)();
  };

  // ── Citizenship change: clear dependent fields ───────────────────────────
  const handleCitizenChange = (value: string) => {
    setValue('citizenshipStatus', value, { shouldDirty: true });
    setValue('alienRegistrationNumber', '');
    setValue('foreignPassportNumberAndCountryOfIssuance', '');
    setValue('formI94AdmissionNumber', '');
    setValue('expirationDate', '');
    setValue('authorizedAlienCountry', '');
  };

  const handlePreparerChange = (value: string) => {
    setValue('preparerOrTranslator', value, { shouldDirty: true });
  };

  const existingSignature = applicant?.i9Form?.signature as string | undefined;
  const processedDate = i9?.processedDate
    ? new Date(i9.processedDate as string).toLocaleDateString()
    : new Date().toLocaleDateString();

  return (
    <>
      <form id="current-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* ── Personal info (read-only) ────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <ReadOnlyField label="First Name" value={applicant?.firstName as string | undefined} />
          <ReadOnlyField label="Middle Initial" value={applicant?.middleInitial as string | undefined} />
          <ReadOnlyField label="Last Name" value={applicant?.lastName as string | undefined} />
          <ReadOnlyField label="Maiden Name" value={applicant?.maidenName as string | undefined} />
          <ReadOnlyField
            label="Date of Birth"
            value={
              applicant?.birthDate
                ? new Date(
                    `${(applicant.birthDate as string).split('T')[0]} 00:00:000`
                  ).toLocaleDateString()
                : ''
            }
          />
          <ReadOnlyField label="Social Security" value={applicant?.socialSecurity as string | undefined} />
          <ReadOnlyField label="Email Address" value={applicant?.email as string | undefined} />
          <ReadOnlyField label="Mobile Number" value={applicant?.phone as string | undefined} />
          <div className="col-span-2 sm:col-span-2">
            <ReadOnlyField label="Address" value={applicant?.address1 as string | undefined} />
          </div>
          <ReadOnlyField label="City" value={applicant?.city as string | undefined} />
          <ReadOnlyField label="State" value={applicant?.state as string | undefined} />
          <ReadOnlyField label="Zip Code" value={applicant?.zip as string | undefined} />
        </div>

        {/* ── Citizenship Status ──────────────────────────────────────── */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Citizenship Status:</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <RadioOption
              value="US Citizen"
              current={citizenshipStatus}
              onChange={handleCitizenChange}
              label="1. A citizen of the United States"
            />
            <RadioOption
              value="Non-Citizen"
              current={citizenshipStatus}
              onChange={handleCitizenChange}
              label="2. A non-citizen of the United States"
            />
            <RadioOption
              value="Permanent Resident"
              current={citizenshipStatus}
              onChange={handleCitizenChange}
              label="3. A lawful permanent resident: (Alien Registration Number/USCIS Number)"
            />
            {/* Option 4 with inline date + country fields */}
            <div className="space-y-3">
              <RadioOption
                value="Authorized Alien"
                current={citizenshipStatus}
                onChange={handleCitizenChange}
                label="4. An alien authorized to work until expiration date"
              />
              {citizenshipStatus === 'Authorized Alien' && (
                <div className="ml-5 grid grid-cols-2 gap-3">
                  <Controller
                    name="expirationDate"
                    control={control}
                    render={({ field }) => (
                      <Field label="Expiration Date" error={errors.expirationDate?.message as string | undefined}>
                        <Input
                          type="date"
                          {...field}
                          value={
                            field.value
                              ? typeof field.value === 'string' && field.value.includes('T')
                                ? field.value.split('T')[0]
                                : (field.value as string)
                              : ''
                          }
                          min={new Date().toISOString().split('T')[0]}
                        />
                      </Field>
                    )}
                  />
                  <Controller
                    name="authorizedAlienCountry"
                    control={control}
                    render={({ field }) => (
                      <Field label="Country" error={errors.authorizedAlienCountry?.message}>
                        {countries.length > 0 ? (
                          <select
                            {...field}
                            className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                          >
                            <option value="">Select country…</option>
                            {countries.map((c) => (
                              <option key={c.code} value={c.code}>
                                {c.code}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Input {...field} placeholder="Country code" />
                        )}
                      </Field>
                    )}
                  />
                </div>
              )}
            </div>
          </div>
          {errors.citizenshipStatus && (
            <p className="text-xs text-red-600">{errors.citizenshipStatus.message}</p>
          )}
        </div>

        {/* ── Permanent Resident: alien registration number ────────────── */}
        {citizenshipStatus === 'Permanent Resident' && (
          <div className="max-w-sm">
            <Controller
              name="alienRegistrationNumber"
              control={control}
              render={({ field }) => (
                <Field
                  label="USCIS or Alien Registration Number"
                  error={errors.alienRegistrationNumber?.message}
                >
                  <Input
                    {...field}
                    onChange={(e) =>
                      setValue('alienRegistrationNumber', e.target.value, { shouldDirty: true })
                    }
                  />
                </Field>
              )}
            />
          </div>
        )}

        {/* ── Authorized Alien: enter one of three fields ──────────────── */}
        {citizenshipStatus === 'Authorized Alien' && (
          <div className="rounded border border-gray-300 p-4">
            <p className="mb-3 text-sm font-semibold">Enter one of these:</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Controller
                    name="alienRegistrationNumber"
                    control={control}
                    render={({ field }) => (
                      <Field label="USCIS or Alien Registration Number">
                        <Input
                          {...field}
                          onChange={(e) => {
                            setValue('alienRegistrationNumber', e.target.value, { shouldDirty: true });
                            setValue('foreignPassportNumberAndCountryOfIssuance', '');
                            setValue('formI94AdmissionNumber', '');
                          }}
                        />
                      </Field>
                    )}
                  />
                </div>
                <span className="mb-1 text-sm font-semibold text-gray-500">OR</span>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Controller
                    name="formI94AdmissionNumber"
                    control={control}
                    render={({ field }) => (
                      <Field label="Form I-94 Admission Number">
                        <Input
                          {...field}
                          onChange={(e) => {
                            setValue('formI94AdmissionNumber', e.target.value, { shouldDirty: true });
                            setValue('alienRegistrationNumber', '');
                          }}
                        />
                      </Field>
                    )}
                  />
                </div>
                <span className="mb-1 text-sm font-semibold text-gray-500">OR</span>
              </div>
              <Controller
                name="foreignPassportNumberAndCountryOfIssuance"
                control={control}
                render={({ field }) => (
                  <Field label="Foreign Passport Number and Country of Issuance">
                    <Input
                      {...field}
                      onChange={(e) => {
                        setValue(
                          'foreignPassportNumberAndCountryOfIssuance',
                          e.target.value,
                          { shouldDirty: true }
                        );
                        setValue('alienRegistrationNumber', '');
                      }}
                    />
                  </Field>
                )}
              />
            </div>
          </div>
        )}

        {/* ── Preparer and/or Translator Certification ─────────────────── */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold">
            Preparer and/or Translator Certification (check one):
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <RadioOption
              value="1"
              current={preparerOrTranslator}
              onChange={handlePreparerChange}
              label="1. A preparer or translator was not used while filling this form"
            />
            <RadioOption
              value="2"
              current={preparerOrTranslator}
              onChange={handlePreparerChange}
              label="2. A preparer or translator was used while filling this form"
            />
          </div>
          {errors.preparerOrTranslator && (
            <p className="text-xs text-red-600">{errors.preparerOrTranslator.message}</p>
          )}
        </div>

        {/* ── Signature + date ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            {applicant?._id && existingSignature && (
              <>
                <p className="mb-1 text-sm font-semibold">E-Signature</p>
                <Card className="w-1/2">
                  <img
                    src={`${IMAGE_SERVER}/applicants/${applicant._id}/signature/${existingSignature}?${Date.now()}`}
                    alt="signature"
                    className="w-full"
                  />
                </Card>
              </>
            )}
          </div>
          <div>
            <Field label={i9?.processedDate ? 'Processed Date' : "Today's Date"}>
              <Input value={processedDate} readOnly tabIndex={-1} className="bg-gray-50" />
            </Field>
          </div>
        </div>

        {/* Cross-field error for authorized alien one-of-three */}
        {errors.root && (
          <p className="text-xs text-red-600">{errors.root.message}</p>
        )}
      </form>

      <SignatureModal
        applicantId={applicant?._id as string}
        applicantFirstName={applicant?.firstName as string | undefined}
        applicantLastName={applicant?.lastName as string | undefined}
        existingSignature={existingSignature}
        open={signatureModalOpen}
        onOpenChange={setSignatureModalOpen}
        onSignatureSaved={handleSignatureSaved}
      />
    </>
  );
};

export default I9Form;
