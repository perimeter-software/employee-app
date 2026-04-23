'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Controller, useForm, type Control, type SubmitHandler } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'sonner';
import { Paperclip } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Button } from '@/components/ui/Button';
import { FileDropzone } from '@/components/ui/FileDropzone';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/Dialog';
import { useNewApplicantContext } from '../../state/new-applicant-context';
import { usePrimaryOnboardingCompany } from '../../hooks/use-company-venues';
import {
  directDepositSchema,
  type DirectDepositFormValues,
} from '../../data/direct-deposit-schema';

// ── Types ──────────────────────────────────────────────────────────────────

interface CheckRecognition {
  routing1: string;
  account1: string;
  bankName1: string;
  accountType1: string;
}

// ── Data fetchers ──────────────────────────────────────────────────────────

async function fetchAccountTypes(): Promise<string[]> {
  const res = await axios.get('/api/applicant-onboarding/dropdowns/accountTypes');
  // Backend returns { data: { arrayValue: [...] } } proxied through Next.js
  return res.data?.data?.arrayValue ?? res.data?.arrayValue ?? [];
}

// ── Shared helpers ─────────────────────────────────────────────────────────

const ReadOnlyField: React.FC<{ label: string; value?: string }> = ({ label, value }) => (
  <div className="space-y-1">
    <Label className="text-xs font-medium text-gray-500">{label}</Label>
    <Input value={value ?? ''} disabled readOnly tabIndex={-1} />
  </div>
);

const FieldError: React.FC<{ message?: string }> = ({ message }) =>
  message ? <p className="mt-1 text-xs text-red-600">{message}</p> : null;

// ── Voided Check Upload Modal ──────────────────────────────────────────────

interface VoidedCheckModalProps {
  open: boolean;
  applicantId: string;
  onClose: () => void;
  onSuccess: (data: CheckRecognition) => void;
  onSwitchToBranch?: () => void;
}

const MAX_CHECK_FILE_SIZE = 3 * 1024 * 1024; // 3 MB

const VoidedCheckUploadModal: React.FC<VoidedCheckModalProps> = ({
  open,
  applicantId,
  onClose,
  onSuccess,
  onSwitchToBranch,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string>();
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = (f: File | null) => {
    setFileError(undefined);
    setFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    if (file.size > MAX_CHECK_FILE_SIZE) {
      setFileError('File size too large. Please choose a file under 3 MB.');
      return;
    }

    setIsUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await axios.post(
        `/api/applicant-onboarding/applicants/${applicantId}/upload/Voided_Check`,
        form
      );

      const checkData = res.data?.recognition;
      if (!checkData?.isCheck) throw new Error('Invalid voided check document');

      onSuccess({
        routing1: checkData.routingNumber ?? '',
        account1: checkData.accountNumber ?? '',
        bankName1: checkData.bankName ?? '',
        accountType1: checkData.accountType ?? '',
      });
      toast.success('Voided check uploaded and processed successfully.');
      onClose();
    } catch (error) {
      const e = error as { response?: { status: number }; message?: string };
      let msg = 'Failed to upload voided check.';
      if (e.response?.status === 400)
        msg = 'Failed to grab check information from the uploaded document.';
      else if (e.response?.status === 413)
        msg = 'File size too large. Please choose a smaller file.';
      else if (e.response?.status === 415)
        msg = 'Invalid file type. Please choose a different file.';
      else if (e.message === 'Invalid voided check document')
        msg = 'The uploaded document is not a valid voided check.';
      if (onSwitchToBranch) {
        toast.error(msg, {
          duration: 10_000,
          action: {
            label: 'Switch to Branch',
            onClick: () => { onClose(); onSwitchToBranch(); },
          },
        });
      } else {
        toast.error(msg);
      }
    } finally {
      setIsUploading(false);
    }
  };

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setFile(null);
      setFileError(undefined);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !isUploading) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-red-500" />
            Upload Voided Check
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-gray-500">Attachment Type</Label>
            <Input value="Voided Check" disabled readOnly tabIndex={-1} />
          </div>
          <p className="text-sm font-medium text-blue-600">
            Upload Voided Check or Form from your bank with routing &amp; account number
          </p>
          <FileDropzone
            value={file}
            onChange={handleFileChange}
            accept=".pdf,.txt,.png,.bmp,.jpeg,.jpg,.doc,.docx"
            maxSize={MAX_CHECK_FILE_SIZE}
            disabled={isUploading}
            error={fileError}
          />
          <p className="text-xs text-gray-400">
            Allowed types: PDF, TXT, PNG, BMP, JPEG/JPG, DOC, DOCX — max 3 MB
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isUploading}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={!file || isUploading}>
            {isUploading ? 'Uploading…' : 'Upload'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ── Bank Section ───────────────────────────────────────────────────────────

interface BankSectionProps {
  title: string;
  num: '1' | '2';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<DirectDepositFormValues, any, any>;
  isDisabled: boolean;
  accountTypes: string[];
}

const BankSection: React.FC<BankSectionProps> = ({ title, num, control, isDisabled, accountTypes }) => (
  <div className="space-y-3">
    <p className="text-sm font-semibold">{title}</p>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div className="lg:col-span-2">
        <Controller
          name={`bankName${num}`}
          control={control}
          render={({ field, fieldState }) => (
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Bank Name</Label>
              <Input
                name={field.name}
                ref={field.ref}
                value={field.value ?? ''}
                onChange={field.onChange}
                onBlur={field.onBlur}
                disabled={isDisabled}
              />
              <FieldError message={fieldState.error?.message} />
            </div>
          )}
        />
      </div>

      <div>
        <Controller
          name={`routing${num}`}
          control={control}
          render={({ field, fieldState }) => (
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Routing #</Label>
              <Input
                name={field.name}
                ref={field.ref}
                inputMode="numeric"
                value={field.value ?? ''}
                onChange={field.onChange}
                onBlur={field.onBlur}
                disabled={isDisabled}
              />
              <FieldError message={fieldState.error?.message} />
            </div>
          )}
        />
      </div>

      <div>
        <Controller
          name={`account${num}`}
          control={control}
          render={({ field, fieldState }) => (
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Account #</Label>
              <Input
                name={field.name}
                ref={field.ref}
                inputMode="numeric"
                value={field.value ?? ''}
                onChange={field.onChange}
                onBlur={field.onBlur}
                disabled={isDisabled}
              />
              <FieldError message={fieldState.error?.message} />
            </div>
          )}
        />
      </div>

      <div>
        <Controller
          name={`accountType${num}`}
          control={control}
          render={({ field, fieldState }) => (
            <div className="space-y-1">
              <Label htmlFor={field.name} className="text-xs text-gray-500">
                Account Type
              </Label>
              <select
                id={field.name}
                name={field.name}
                ref={field.ref}
                value={field.value ?? ''}
                onChange={field.onChange}
                onBlur={field.onBlur}
                disabled={isDisabled}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Select…</option>
                {accountTypes.map((t) => (
                  <option key={t} value={t.toUpperCase()}>
                    {t}
                  </option>
                ))}
              </select>
              <FieldError message={fieldState.error?.message} />
            </div>
          )}
        />
      </div>

      <div className="sm:col-span-2 lg:col-span-1">
        <Controller
          name={`amountPercentage${num}`}
          control={control}
          render={({ field, fieldState }) => (
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Amount %</Label>
              <Input
                name={field.name}
                ref={field.ref}
                type="number"
                min={0}
                max={100}
                value={field.value ?? ''}
                onChange={field.onChange}
                onBlur={field.onBlur}
                disabled={isDisabled}
                className="text-right"
              />
              <FieldError message={fieldState.error?.message} />
            </div>
          )}
        />
      </div>
    </div>
  </div>
);

// ── Constants ──────────────────────────────────────────────────────────────

const ALL_PAYMENT_TYPES: {
  id: string;
  label: string;
  flag: 'directDeposit' | 'moneyNetworkService' | 'branchVirtualWallet' | 'employerIssuedPaperCheck';
  venueOnly?: boolean;
}[] = [
  { id: 'DirectDeposit',            label: 'Direct deposit',              flag: 'directDeposit' },
  { id: 'MoneyNetworkService',       label: 'Money Network Service',       flag: 'moneyNetworkService' },
  { id: 'BranchVirtualWallet',       label: 'Branch Account & Debit card', flag: 'branchVirtualWallet', venueOnly: true },
  { id: 'EmployerIssuedPaperCheck',  label: 'Employer-Issued Paper Check', flag: 'employerIssuedPaperCheck' },
];

const BANK_FIELDS = [
  'account1', 'bankName1', 'accountType1', 'routing1', 'amountPercentage1',
  'account2', 'bankName2', 'accountType2', 'routing2', 'amountPercentage2',
] as const;

// ── Main Component ─────────────────────────────────────────────────────────

const DirectDeposit: React.FC = () => {
  const {
    applicant,
    updateApplicantAction,
    updateButtons,
    updateCurrentFormState,
    submitRef,
  } = useNewApplicantContext();

  const existing = applicant?.directDeposit as Record<string, unknown> | undefined;

  const { data: company } = usePrimaryOnboardingCompany();
  const depositOptions = company?.depositOptions;
  const paymentTypes = ALL_PAYMENT_TYPES.filter(({ flag, venueOnly }) => {
    if (venueOnly && company?.companyType !== 'Venue') return false;
    return depositOptions?.[flag] === 'Yes';
  });

  const { data: accountTypes = [] } = useQuery({
    queryKey: ['accountTypes'],
    queryFn: fetchAccountTypes,
    staleTime: 30_000,
    gcTime: 60_000,
  });

  const {
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    getValues,
    formState: { isDirty, isValid, isSubmitSuccessful, submitCount },
  } = useForm<DirectDepositFormValues, unknown, DirectDepositFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: yupResolver(directDepositSchema) as any,
    mode: 'onBlur',
    defaultValues: {
      paymentType: (existing?.paymentType as string) || '',
      bankName1: (existing?.bankName1 as string) || '',
      routing1: (existing?.routing1 as string) || '',
      account1: (existing?.account1 as string) || '',
      accountType1: (existing?.accountType1 as string) || '',
      amountPercentage1: String(existing?.amountPercentage1 ?? ''),
      bankName2: (existing?.bankName2 as string) || '',
      routing2: (existing?.routing2 as string) || '',
      account2: (existing?.account2 as string) || '',
      accountType2: (existing?.accountType2 as string) || '',
      amountPercentage2: String(existing?.amountPercentage2 ?? ''),
      date: existing?.date
        ? (existing.date as string).slice(0, 10)
        : new Date().toISOString().slice(0, 10),
    },
  });

  const paymentType = watch('paymentType');
  const isDisabled =
    !paymentType ||
    paymentType === 'EmployerIssuedPaperCheck' ||
    paymentType === 'BranchVirtualWallet';

  // Modal state
  const [voidedCheckOpen, setVoidedCheckOpen] = useState(false);
  const [paperCheckConfirmOpen, setPaperCheckConfirmOpen] = useState(false);
  const [branchWalletConfirmOpen, setBranchWalletConfirmOpen] = useState(false);
  const [branchThankYouOpen, setBranchThankYouOpen] = useState(false);
  const [pendingPaymentType, setPendingPaymentType] = useState<string | null>(null);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [pendingSubmitPayload, setPendingSubmitPayload] = useState<Record<string, unknown> | null>(null);

  const [canContinue, setCanContinue] = useState(false);
  const renderKey = useRef(0);

  const clearBankFields = useCallback(() => {
    BANK_FIELDS.forEach((f) => setValue(f, '', { shouldDirty: true }));
  }, [setValue]);

  const handlePaymentTypeChange = useCallback((typeId: string) => {
    if (typeId === 'DirectDeposit') {
      setPendingPaymentType(typeId);
      setVoidedCheckOpen(true);
    } else if (typeId === 'EmployerIssuedPaperCheck') {
      setPendingPaymentType(typeId);
      setPaperCheckConfirmOpen(true);
    } else if (typeId === 'BranchVirtualWallet') {
      setPendingPaymentType(typeId);
      setBranchWalletConfirmOpen(true);
    } else {
      setValue('paymentType', typeId, { shouldDirty: true });
    }
  }, [setValue]);

  const handleVoidedCheckSuccess = useCallback((data: CheckRecognition) => {
    setValue('paymentType', 'DirectDeposit', { shouldDirty: true });
    setValue('routing1', data.routing1, { shouldDirty: true });
    setValue('account1', data.account1, { shouldDirty: true });
    setValue('bankName1', data.bankName1, { shouldDirty: true });
    if (data.accountType1) {
      const matched = accountTypes.find(
        (t) => t.toLowerCase() === data.accountType1.toLowerCase()
      );
      setValue('accountType1', matched ? matched.toUpperCase() : data.accountType1.toUpperCase(), {
        shouldDirty: true,
      });
    }
    setPendingPaymentType(null);
  }, [setValue, accountTypes]);

  // Sync form when applicant data changes (after save)
  useEffect(() => {
    if (applicant?.directDeposit) {
      const dd = applicant.directDeposit as Record<string, unknown>;
      reset({
        paymentType: (dd.paymentType as string) || '',
        bankName1: (dd.bankName1 as string) || '',
        routing1: (dd.routing1 as string) || '',
        account1: (dd.account1 as string) || '',
        accountType1: (dd.accountType1 as string) || '',
        amountPercentage1: String(dd.amountPercentage1 ?? ''),
        bankName2: (dd.bankName2 as string) || '',
        routing2: (dd.routing2 as string) || '',
        account2: (dd.account2 as string) || '',
        accountType2: (dd.accountType2 as string) || '',
        amountPercentage2: String(dd.amountPercentage2 ?? ''),
        date: dd.date ? (dd.date as string).slice(0, 10) : new Date().toISOString().slice(0, 10),
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicant]);

  useEffect(() => {
    updateCurrentFormState({ isDirty });
  }, [isDirty, updateCurrentFormState]);

  // canContinue: validate saved data against schema
  useEffect(() => {
    const currentKey = Math.round(Math.random() * 10000);
    renderKey.current = currentKey;
    if (applicant?.directDeposit) {
      directDepositSchema
        .validate(applicant.directDeposit)
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

  // Auto-set paymentType=DirectDeposit and amountPercentage=100 when bank fields are first filled
  useEffect(() => {
    if (!isValid && submitCount < 1) {
      const subscription = watch((formData, { name }) => {
        if (!name || !BANK_FIELDS.includes(name as typeof BANK_FIELDS[number])) return;
        if (formData[name as keyof DirectDepositFormValues]) {
          setValue('paymentType', 'DirectDeposit', { shouldDirty: true });
          const bankNum = name.slice(-1) as '1' | '2';
          const pctKey = `amountPercentage${bankNum}` as keyof DirectDepositFormValues;
          if (!getValues(pctKey)) {
            setValue(pctKey, '100', { shouldDirty: true });
          }
        }
      });
      return () => subscription.unsubscribe();
    }
    return undefined;
  }, [watch, submitCount, isValid, setValue, getValues]);

  const doSave = useCallback(async (payload: Record<string, unknown>) => {
    if (!applicant?._id) return;
    await updateApplicantAction(applicant._id, payload);
  }, [applicant?._id, updateApplicantAction]);

  const onSubmit: SubmitHandler<DirectDepositFormValues> = useCallback(async (data) => {
    const { routing1, routing2, ...rest } = data;
    const parsedPayload = {
      directDeposit: {
        ...(routing1 && { routing1: routing1.padStart(9, '0') }),
        ...(routing2 && { routing2: routing2.padStart(9, '0') }),
        ...rest,
      },
    };
    // Guard: non-DirectDeposit selected but bank info is still present
    if (
      data.paymentType !== 'DirectDeposit' &&
      data.account1 && data.bankName1 && data.accountType1 && routing1
    ) {
      setPendingSubmitPayload(parsedPayload);
      setSubmitConfirmOpen(true);
      return;
    }
    await doSave(parsedPayload);
    reset(data, { keepValues: true });
  }, [doSave, reset]);

  useEffect(() => {
    submitRef.current = handleSubmit(onSubmit, () => {
      toast.error('Please complete all required fields before saving.');
    });
    return () => { submitRef.current = null; };
  }, [handleSubmit, onSubmit, submitRef]);

  return (
    <div className="space-y-6">
      <form id="current-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Payment Type */}
        <div className="space-y-3">
          <p className="text-sm font-semibold">Payment Type Options:</p>
          <Controller
            name="paymentType"
            control={control}
            render={({ field, fieldState }) => (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-6">
                  {paymentTypes.map(({ id, label }) => (
                    <label
                      key={id}
                      className="flex cursor-pointer items-center gap-2 text-sm font-semibold"
                    >
                      <input
                        type="checkbox"
                        className="shrink-0"
                        checked={field.value === id}
                        onChange={() => handlePaymentTypeChange(id)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <FieldError message={fieldState.error?.message} />
              </div>
            )}
          />
        </div>

        {/* Bank One */}
        <BankSection
          title="Bank One Information"
          num="1"
          control={control}
          isDisabled={isDisabled}
          accountTypes={accountTypes}
        />

        {/* Bank Two */}
        <BankSection
          title="Bank Two Information"
          num="2"
          control={control}
          isDisabled={isDisabled}
          accountTypes={accountTypes}
        />

        {/* Read-only footer */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ReadOnlyField
            label="Email Address"
            value={applicant?.email as string | undefined}
          />
          <ReadOnlyField
            label="Employee Name"
            value={
              (applicant?.firstName || applicant?.lastName)
                ? `${applicant?.firstName ?? ''} ${applicant?.lastName ?? ''}`.trim()
                : undefined
            }
          />
          <ReadOnlyField
            label="Social Security"
            value={applicant?.socialSecurity as string | undefined}
          />
          <Controller
            name="date"
            control={control}
            render={({ field }) => (
              <div className="space-y-1">
                <Label className="text-xs font-medium text-gray-500">Date</Label>
                <Input
                  type="date"
                  name={field.name}
                  ref={field.ref}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              </div>
            )}
          />
        </div>
      </form>

      {/* Voided Check Upload Modal (triggered when selecting Direct Deposit) */}
      <VoidedCheckUploadModal
        open={voidedCheckOpen}
        applicantId={applicant?._id as string}
        onClose={() => {
          setVoidedCheckOpen(false);
          setPendingPaymentType(null);
        }}
        onSuccess={handleVoidedCheckSuccess}
        onSwitchToBranch={() => {
          setVoidedCheckOpen(false);
          setPendingPaymentType('BranchVirtualWallet');
          setBranchWalletConfirmOpen(true);
        }}
      />

      {/* Paper Check confirmation */}
      <Dialog open={paperCheckConfirmOpen} onOpenChange={setPaperCheckConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Warning: Paper Check Selection</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-700">
            Are you certain you want to receive paper checks via USPS? The company will not be held
            responsible for any lost checks or incorrect addresses. Please note that it may take up
            to 60 days to receive your payment.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPaperCheckConfirmOpen(false);
                setPendingPaymentType(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (pendingPaymentType) {
                  setValue('paymentType', pendingPaymentType, { shouldDirty: true });
                  clearBankFields();
                }
                setPaperCheckConfirmOpen(false);
                setPendingPaymentType(null);
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Branch Account & Debit card — sign-up info confirmation */}
      <Dialog open={branchWalletConfirmOpen} onOpenChange={(v) => { if (!v) { setBranchWalletConfirmOpen(false); setPendingPaymentType(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign up for free for a Branch account</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm text-gray-700">
            <p>
              The Branch App is a digital bank account and debit card that gives you easier access
              to your pay: no minimum balance, no credit check, and zero monthly fees. While we are
              partnering with Branch, all matters related to this account will be handled directly
              between you and Branch.
            </p>
            <p className="text-center italic text-gray-500">
              Branch is not a bank. Banking services provided by Evolve Bank &amp; Trust, Member FDIC.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setBranchWalletConfirmOpen(false); setPendingPaymentType(null); }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (pendingPaymentType) {
                  setValue('paymentType', pendingPaymentType, { shouldDirty: true });
                  clearBankFields();
                }
                setBranchWalletConfirmOpen(false);
                setPendingPaymentType(null);
                setBranchThankYouOpen(true);
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Branch — thank-you info after confirming */}
      <Dialog open={branchThankYouOpen} onOpenChange={setBranchThankYouOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Thank you for choosing Branch</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-700">
            Once your paperwork has been reviewed, the creation of your Branch account will be
            initiated. Be on the lookout for an email and text message from Branch with a
            personalized link to claim your account and complete the set-up process.
          </p>
          <DialogFooter>
            <Button onClick={() => setBranchThankYouOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submit guard: non-DirectDeposit but bank info present */}
      <Dialog open={submitConfirmOpen} onOpenChange={setSubmitConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Banking information entered</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-700">
            You have entered banking information. Are you sure you want Money Network / Paper Check
            and not Direct Deposit?
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSubmitConfirmOpen(false);
                setPendingSubmitPayload(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (pendingSubmitPayload) {
                  await doSave(pendingSubmitPayload);
                  reset(getValues(), { keepValues: true });
                }
                setSubmitConfirmOpen(false);
                setPendingSubmitPayload(null);
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DirectDeposit;
