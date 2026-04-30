'use client';

import { useState, useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import axios from 'axios';
import { format } from 'date-fns';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { FileDropzone } from '@/components/ui/FileDropzone';
import { clsxm } from '@/lib/utils';
import { useNewApplicantContext } from '../../state/new-applicant-context';
import { STATE_CODES } from '../../utils/state-codes';
import { parseApplicantPhone } from '../../utils/applicant-helpers';
import { usePrimaryOnboardingCompany } from '../../hooks/use-company-venues';
import { jobApplicationSchema } from '../../schemas/onboard-applicant-schema';
import { StepScaffold } from './_StepScaffold';

// ── Constants ────────────────────────────────────────────────────────────────

const SALARY_UNITS = [
  'Hourly',
  'Daily',
  'Weekly',
  'Monthly',
  'Yearly',
] as const;
const FULL_PART_TIME = ['Full-Time', 'Part-Time'] as const;

// ── Types ────────────────────────────────────────────────────────────────────

interface JobHistoryEntry {
  companyName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  supervisor: string;
  fromDate: string;
  toDate: string;
  startingTitle: string;
  lastTitle: string;
  startingSalary: string;
  endingSalary: string;
  salaryUnit: string;
  fullPartTime: string;
  duties: string;
  reasonForLeaving: string;
}

interface Values {
  applicationDate: string;
  firstName: string;
  middleInitial: string;
  lastName: string;
  maidenName: string;
  socialSecurity: string;
  birthDate: string;
  driverLicense: string;
  address1: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  altPhone: string;
  emergencyContactNumber: string;
  emergencyContactName: string;
  criminalHistoryDisclosure: string;
  jobHistory: JobHistoryEntry[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 10);
  const a = d.slice(0, 3);
  const b = d.slice(3, 6);
  const c = d.slice(6, 10);
  if (d.length <= 3) return a;
  if (d.length <= 6) return `(${a}) ${b}`;
  return `(${a}) ${b} ${c}`;
}

function formatSSN(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 9);
  const a = d.slice(0, 3);
  const b = d.slice(3, 5);
  const c = d.slice(5, 9);
  if (d.length <= 3) return a;
  if (d.length <= 5) return `${a}-${b}`;
  return `${a}-${b}-${c}`;
}

function safeDateFormat(value: unknown, fmt: string): string {
  if (!value) return '';
  try {
    return format(new Date(value as string), fmt);
  } catch {
    return '';
  }
}

const EMPTY_JOB_ENTRY: JobHistoryEntry = {
  companyName: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  phone: '',
  supervisor: '',
  fromDate: '',
  toDate: '',
  startingTitle: '',
  lastTitle: '',
  startingSalary: '',
  endingSalary: '',
  salaryUnit: '',
  fullPartTime: '',
  duties: '',
  reasonForLeaving: '',
};

// ── Job History Modal ────────────────────────────────────────────────────────

interface JobHistoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialEntry: JobHistoryEntry;
  onSave: (entry: JobHistoryEntry) => void;
}

const JobHistoryModal: React.FC<JobHistoryModalProps> = ({
  open,
  onOpenChange,
  initialEntry,
  onSave,
}) => {
  const [entry, setEntry] = useState<JobHistoryEntry>(initialEntry);

  // Sync with initialEntry whenever the dialog opens
  useEffect(() => {
    if (open) setEntry(initialEntry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (name: keyof JobHistoryEntry, value: string) =>
    setEntry((prev) => ({ ...prev, [name]: value }));

  const handleSave = () => {
    if (!entry.companyName.trim()) {
      toast.error('Company name is required.');
      return;
    }
    onSave(entry);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Job History</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Company Name">
            <Input
              value={entry.companyName}
              onChange={(e) => set('companyName', e.target.value)}
            />
          </FormField>
          <FormField label="Supervisor">
            <Input
              value={entry.supervisor}
              onChange={(e) => set('supervisor', e.target.value)}
            />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="Address">
              <Input
                value={entry.address}
                onChange={(e) => set('address', e.target.value)}
              />
            </FormField>
          </div>
          <FormField label="City">
            <Input
              value={entry.city}
              onChange={(e) => set('city', e.target.value)}
            />
          </FormField>
          <FormField label="State">
            <Select value={entry.state} onValueChange={(v) => set('state', v)}>
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
          <FormField label="Zip Code">
            <Input
              value={entry.zip}
              onChange={(e) => set('zip', e.target.value)}
              inputMode="numeric"
            />
          </FormField>
          <FormField label="Phone">
            <Input
              placeholder="(###) ### ####"
              value={entry.phone}
              onChange={(e) => set('phone', formatPhone(e.target.value))}
              inputMode="tel"
            />
          </FormField>
          <FormField label="Start Date">
            <Input
              type="date"
              value={entry.fromDate}
              onChange={(e) => set('fromDate', e.target.value)}
            />
          </FormField>
          <FormField label="End Date">
            <Input
              type="date"
              value={entry.toDate}
              onChange={(e) => set('toDate', e.target.value)}
            />
          </FormField>
          <FormField label="Hired As">
            <Input
              value={entry.startingTitle}
              onChange={(e) => set('startingTitle', e.target.value)}
            />
          </FormField>
          <FormField label="Last Position">
            <Input
              value={entry.lastTitle}
              onChange={(e) => set('lastTitle', e.target.value)}
            />
          </FormField>
          <FormField label="Starting Salary">
            <Input
              value={entry.startingSalary}
              onChange={(e) => set('startingSalary', e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
            />
          </FormField>
          <FormField label="Ending Salary">
            <Input
              value={entry.endingSalary}
              onChange={(e) => set('endingSalary', e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
            />
          </FormField>
          <FormField label="Salary Unit">
            <Select
              value={entry.salaryUnit}
              onValueChange={(v) => set('salaryUnit', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {SALARY_UNITS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Employment Status">
            <Select
              value={entry.fullPartTime}
              onValueChange={(v) => set('fullPartTime', v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {FULL_PART_TIME.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="Duties & Responsibilities">
              <Textarea
                rows={4}
                value={entry.duties}
                onChange={(e) => set('duties', e.target.value)}
              />
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <FormField label="Reason For Leaving">
              <Textarea
                rows={4}
                value={entry.reasonForLeaving}
                onChange={(e) => set('reasonForLeaving', e.target.value)}
              />
            </FormField>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ── Form Body ────────────────────────────────────────────────────────────────

const JobApplicationFormBody: React.FC<{
  form: ReturnType<typeof useForm<Values>>;
  email: string;
  applicantId: string | undefined;
  isCompany: boolean;
}> = ({ form, email, applicantId, isCompany }) => {
  const {
    control,
    watch,
    setValue,
    formState: { errors },
  } = form;

  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingEntry, setEditingEntry] =
    useState<JobHistoryEntry>(EMPTY_JOB_ENTRY);

  const jobHistory = (watch('jobHistory') ?? []) as JobHistoryEntry[];

  const handleResumeChange = async (file: File | null) => {
    setResumeFile(file);
    if (!file || !applicantId) return;
    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      await axios.post(
        `/api/applicant-onboarding/applicants/${applicantId}/resume`,
        formData
      );
      await axios.put(
        `/api/applicant-onboarding/applicants/${applicantId}/attachment`,
        {
          title: 'Resume',
          type: 'Resume',
          docType: file.name.split('.').pop(),
          filename: file.name,
          uploadDate: new Date(),
        }
      );
      toast.success('Resume uploaded successfully!');
    } catch {
      toast.error('Resume upload failed. Please try again.');
      setResumeFile(null);
    } finally {
      setIsUploading(false);
    }
  };

  const openAddModal = () => {
    setEditingIndex(null);
    setEditingEntry(EMPTY_JOB_ENTRY);
    setModalOpen(true);
  };

  const openEditModal = (idx: number) => {
    setEditingIndex(idx);
    setEditingEntry(jobHistory[idx]);
    setModalOpen(true);
  };

  const handleSaveJob = (entry: JobHistoryEntry) => {
    const updated =
      editingIndex !== null
        ? jobHistory.map((j, i) => (i === editingIndex ? entry : j))
        : [...jobHistory, entry];
    setValue('jobHistory', updated, { shouldDirty: true });
  };

  const handleRemoveJob = (idx: number) => {
    setValue(
      'jobHistory',
      jobHistory.filter((_, i) => i !== idx),
      { shouldDirty: true }
    );
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-700">
        Please review your email address, first and last name for accuracy
        before proceeding.
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── Left column ── */}
        <div className="grid grid-cols-2 gap-4">
          <Controller
            name="applicationDate"
            control={control}
            render={({ field }) => (
              <ReadonlyField
                label="Application Date"
                value={field.value ?? ''}
              />
            )}
          />
          <ReadonlyField label="Email Address" value={email} />
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
              <FormField label="Middle Initial">
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
            name="maidenName"
            control={control}
            render={({ field }) => (
              <FormField label="Maiden Name">
                <Input {...field} value={field.value ?? ''} />
              </FormField>
            )}
          />
          <Controller
            name="socialSecurity"
            control={control}
            render={({ field }) => (
              <FormField label="Social Security">
                <Input
                  placeholder="___-__-____"
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(formatSSN(e.target.value))}
                  inputMode="numeric"
                />
              </FormField>
            )}
          />
          <Controller
            name="birthDate"
            control={control}
            render={({ field }) => (
              <FormField label="Date of Birth">
                <Input
                  type="date"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                />
              </FormField>
            )}
          />
          <Controller
            name="phone"
            control={control}
            render={({ field }) => (
              <FormField label="Mobile Number" error={errors.phone?.message}>
                <Input
                  placeholder="(###) ### ####"
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(formatPhone(e.target.value))}
                  inputMode="tel"
                />
              </FormField>
            )}
          />
          <Controller
            name="altPhone"
            control={control}
            render={({ field }) => (
              <FormField label="Alternate Number">
                <Input
                  placeholder="(###) ### ####"
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(formatPhone(e.target.value))}
                  inputMode="tel"
                />
              </FormField>
            )}
          />
        </div>

        {/* ── Right column ── */}
        <div className="space-y-4">
          <Controller
            name="address1"
            control={control}
            render={({ field }) => (
              <FormField label="Address (include Unit #)">
                <Input {...field} value={field.value ?? ''} />
              </FormField>
            )}
          />
          <div className="grid grid-cols-3 gap-3">
            <Controller
              name="city"
              control={control}
              render={({ field }) => (
                <FormField label="City">
                  <Input {...field} value={field.value ?? ''} />
                </FormField>
              )}
            />
            <Controller
              name="state"
              control={control}
              render={({ field }) => (
                <FormField label="State">
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
                <FormField label="Zip Code">
                  <Input
                    {...field}
                    value={field.value ?? ''}
                    inputMode="numeric"
                  />
                </FormField>
              )}
            />
          </div>
          <Controller
            name="driverLicense"
            control={control}
            render={({ field }) => (
              <FormField label="Driver License">
                <Input {...field} value={field.value ?? ''} />
              </FormField>
            )}
          />
          <div className="grid grid-cols-2 gap-4">
            <Controller
              name="emergencyContactNumber"
              control={control}
              render={({ field }) => (
                <FormField label="Emergency Contact Number">
                  <Input
                    placeholder="(###) ### ####"
                    value={field.value ?? ''}
                    onChange={(e) =>
                      field.onChange(formatPhone(e.target.value))
                    }
                    inputMode="tel"
                  />
                </FormField>
              )}
            />
            <Controller
              name="emergencyContactName"
              control={control}
              render={({ field }) => (
                <FormField label="Emergency Contact Name">
                  <Input {...field} value={field.value ?? ''} />
                </FormField>
              )}
            />
          </div>
        </div>
      </div>

      {/* Criminal History Disclosure — full width */}
      <Controller
        name="criminalHistoryDisclosure"
        control={control}
        render={({ field }) => (
          <FormField label="Criminal History Disclosure">
            <Input {...field} value={field.value ?? ''} />
          </FormField>
        )}
      />

      {/* Company-only: Resume upload + Job history */}
      {isCompany && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">
              Resume upload (optional)
            </p>
            <FileDropzone
              value={resumeFile}
              onChange={handleResumeChange}
              accept=".pdf,.rtf,.docx"
              disabled={isUploading}
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">Job History</p>
                <p className="text-xs text-gray-500">
                  Please complete this section if you did not attach a resume
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openAddModal}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add Job
              </Button>
            </div>
            {jobHistory.length === 0 ? (
              <p className="text-sm italic text-gray-400">
                No job history added yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {jobHistory.map((j, idx) => (
                  <li
                    key={idx}
                    className="flex items-center justify-between rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
                  >
                    <button
                      type="button"
                      className="flex-1 text-left hover:underline"
                      onClick={() => openEditModal(idx)}
                    >
                      <span className="font-medium">{j.companyName}</span>
                      {j.startingTitle && (
                        <span className="ml-2 text-gray-500">
                          — {j.startingTitle}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveJob(idx)}
                      className="ml-2 text-red-500 hover:text-red-700"
                      aria-label="Remove job entry"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

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

      {isCompany && (
        <JobHistoryModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          initialEntry={editingEntry}
          onSave={handleSaveJob}
        />
      )}
    </div>
  );
};

// ── Field helpers ────────────────────────────────────────────────────────────

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

const ReadonlyField: React.FC<{ label: string; value: string }> = ({
  label,
  value,
}) => (
  <div className="space-y-1">
    <Label>{label}</Label>
    <Input value={value} readOnly disabled className={clsxm('bg-gray-50')} />
  </div>
);

// ── Main Component ───────────────────────────────────────────────────────────

const JobApplicationForm: React.FC = () => {
  const { applicant } = useNewApplicantContext();
  const { data: company } = usePrimaryOnboardingCompany();

  const companyType =
    (company as { companyType?: string } | undefined)?.companyType ??
    (company as { settings?: { companyType?: string } } | undefined)?.settings
      ?.companyType;
  const isCompany = companyType === 'Company';

  const defaultValues = useMemo<Values>(
    () => ({
      applicationDate:
        safeDateFormat(
          applicant?.applicationDate ?? new Date(),
          'MM/dd/yyyy'
        ) || format(new Date(), 'MM/dd/yyyy'),
      firstName: (applicant?.firstName as string) ?? '',
      middleInitial: (applicant?.middleInitial as string) ?? '',
      lastName: (applicant?.lastName as string) ?? '',
      maidenName: (applicant?.maidenName as string) ?? '',
      socialSecurity: applicant?.socialSecurity
        ? formatSSN(String(applicant.socialSecurity))
        : '',
      birthDate: safeDateFormat(applicant?.birthDate, 'yyyy-MM-dd'),
      driverLicense: (applicant?.driverLicense as string) ?? '',
      address1: (applicant?.address1 as string) ?? '',
      city: (applicant?.city as string) ?? '',
      state: (applicant?.state as string) ?? '',
      zip: (applicant?.zip as string) ?? '',
      // formatPhone handles both raw digits (post-save) and pre-formatted (from DB)
      phone: applicant?.phone
        ? formatPhone(parseApplicantPhone(applicant.phone as string))
        : '',
      altPhone: applicant?.altPhone
        ? formatPhone(applicant.altPhone as string)
        : '',
      emergencyContactNumber: applicant?.emergencyContactNumber
        ? formatPhone(applicant.emergencyContactNumber as string)
        : '',
      emergencyContactName: (applicant?.emergencyContactName as string) ?? '',
      criminalHistoryDisclosure:
        (applicant?.criminalHistoryDisclosure as string) ?? '',
      jobHistory: (applicant?.jobHistory as JobHistoryEntry[]) ?? [],
    }),
    // Depend on full applicant so defaultValues stays fresh after each save.
    // StepScaffold calls reset(defaultValues) whenever applicant changes; if we
    // only depended on _id the memo would be stale and reset would revert the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [applicant]
  );

  return (
    <StepScaffold<Values>
      defaultValues={defaultValues}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolver={yupResolver(jobApplicationSchema) as any}
      toPayload={(values) => ({
        firstName: values.firstName,
        middleInitial: values.middleInitial ?? '',
        lastName: values.lastName,
        maidenName: values.maidenName ?? '',
        socialSecurity: (values.socialSecurity ?? '').replace(/\D/g, ''),
        birthDate: values.birthDate || null,
        driverLicense: values.driverLicense ?? '',
        address1: values.address1 ?? '',
        city: values.city ?? '',
        state: (values.state ?? '').toUpperCase(),
        zip: (values.zip ?? '').replace(/\D/g, ''),
        phone: (values.phone ?? '').replace(/\D/g, ''),
        altPhone: (values.altPhone ?? '').replace(/\D/g, ''),
        emergencyContactNumber: (values.emergencyContactNumber ?? '').replace(
          /\D/g,
          ''
        ),
        emergencyContactName: values.emergencyContactName ?? '',
        criminalHistoryDisclosure: values.criminalHistoryDisclosure ?? '',
        ...(isCompany && { jobHistory: values.jobHistory }),
      })}
    >
      {(form) => (
        <JobApplicationFormBody
          form={form}
          email={(applicant?.email as string) ?? ''}
          applicantId={applicant?._id}
          isCompany={isCompany}
        />
      )}
    </StepScaffold>
  );
};

export default JobApplicationForm;
