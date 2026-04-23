'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';
import { StepScaffold } from './_StepScaffold';
import { FileDropzone } from '@/components/ui/FileDropzone/FileDropzone';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { Label } from '@/components/ui/Label';
import { useNewApplicantContext } from '../../state/new-applicant-context';
import { OnboardingService } from '../../services/onboarding-service';
import { STATE_CODES } from '../../utils/state-codes';

// ---------- Types ----------

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
  fullPartTime: string;
  startingSalary: string;
  endingSalary: string;
  salaryUnit: string;
  duties: string;
  reasonForLeaving: string;
}

interface EducationEntry {
  schoolName: string;
  city: string;
  state: string;
  startYear: string;
  endYear: string;
  degreeDiploma: string;
  major: string;
  minor: string;
  description: string;
}

interface FormValues {
  jobHistory: JobHistoryEntry[];
  education: EducationEntry[];
  tags: string[];
}

interface ParsedJobHistoryEntry {
  companyName?: string;
  city?: string;
  state?: string;
  fromDate?: string;
  toDate?: string;
  lastTitle?: string;
  startingTitle?: string;
  duties?: string[] | string;
}

interface ParsedEducationEntry {
  schoolName?: string;
  city?: string;
  state?: string;
  startYear?: string;
  endYear?: string;
  degreeDiploma?: string;
  major?: string;
  minor?: string;
}

// ---------- Constants ----------

const SALARY_UNITS = ['Hourly', 'Daily', 'Weekly', 'Monthly', 'Yearly'];
const EMPLOYMENT_STATUS = ['Full-Time', 'Part-Time'];

const REQUIRED_JOB_FIELDS: Array<keyof JobHistoryEntry> = [
  'companyName',
  'address',
  'city',
  'state',
  'zip',
  'phone',
  'supervisor',
  'fromDate',
  'toDate',
  'startingTitle',
  'lastTitle',
  'fullPartTime',
  'startingSalary',
  'endingSalary',
  'salaryUnit',
  'duties',
  'reasonForLeaving',
];

const JOB_FIELD_LABELS: Record<keyof JobHistoryEntry, string> = {
  companyName: 'Customer Name',
  address: 'Address',
  city: 'City',
  state: 'State',
  zip: 'Zip Code',
  phone: 'Phone',
  supervisor: 'Supervisor',
  fromDate: 'Start Date',
  toDate: 'End Date',
  startingTitle: 'Hired As',
  lastTitle: 'Last Position',
  fullPartTime: 'Employment Status',
  startingSalary: 'Starting Salary',
  endingSalary: 'Ending Salary',
  salaryUnit: 'Salary Unit',
  duties: 'Duties & Responsibilities',
  reasonForLeaving: 'Reason For Leaving',
};

const REQUIRED_EDU_FIELDS: Array<keyof EducationEntry> = [
  'schoolName',
  'city',
  'state',
  'startYear',
  'endYear',
  'degreeDiploma',
];

const EDU_FIELD_LABELS: Partial<Record<keyof EducationEntry, string>> = {
  schoolName: 'School Name',
  city: 'City',
  state: 'State',
  startYear: 'Start Year',
  endYear: 'End Year',
  degreeDiploma: 'Degree / Diploma',
  major: 'Major',
  minor: 'Minor',
  description: 'Description',
};

// ---------- Main Component ----------

const ApplicantResumeAndJobHistory: React.FC = () => {
  const { applicant } = useNewApplicantContext();

  const defaultValues: FormValues = {
    jobHistory: (applicant?.jobHistory as JobHistoryEntry[]) ?? [],
    education: (applicant?.education as EducationEntry[]) ?? [],
    tags: (applicant?.tags as string[]) ?? [],
  };

  return (
    <StepScaffold<FormValues>
      // title="Resume & Job History"
      defaultValues={defaultValues}
      toPayload={(v) => ({
        jobHistory: v.jobHistory,
        education: v.education,
        tags: v.tags,
      })}
    >
      {(form) => <ResumeFormBody form={form} />}
    </StepScaffold>
  );
};

// ---------- Form Body ----------

const ResumeFormBody: React.FC<{
  form: ReturnType<typeof useForm<FormValues>>;
}> = ({ form }) => {
  const { setValue, watch } = form;
  const { applicant } = useNewApplicantContext();

  const resumeData = applicant?.resumeData as
    | Record<string, unknown>
    | undefined;
  const parsedResume = resumeData?.parsedResume as
    | Record<string, unknown>
    | undefined;
  const parsedJobHistory =
    (parsedResume?.jobHistory as ParsedJobHistoryEntry[]) ?? [];
  const parsedEducation =
    (parsedResume?.education as ParsedEducationEntry[]) ?? [];
  const resumeSkills = (resumeData?.otherSkills as string[]) ?? [];

  const [isJobHistoryModalOpen, setJobHistoryModalOpen] = useState(false);
  const [currentJobHistory, setCurrentJobHistory] = useState<
    Partial<JobHistoryEntry>
  >({});
  const [jobHistoryIndex, setJobHistoryIndex] = useState<number | null>(null);
  const [jobHistoryReadOnly, setJobHistoryReadOnly] = useState(false);

  const [isEducationModalOpen, setEducationModalOpen] = useState(false);
  const [currentEducation, setCurrentEducation] = useState<
    Partial<EducationEntry>
  >({});
  const [educationIndex, setEducationIndex] = useState<number | null>(null);
  const [educationReadOnly, setEducationReadOnly] = useState(false);

  const jobHistoryList = watch('jobHistory') ?? [];
  const educationList = watch('education') ?? [];
  const tags = watch('tags') ?? [];

  const handleOpenJobHistoryModal = (
    idx: number | null,
    row: Partial<JobHistoryEntry>
  ) => {
    setJobHistoryReadOnly(false);
    setJobHistoryIndex(idx);
    setCurrentJobHistory(idx !== null ? row : {});
    setJobHistoryModalOpen(true);
  };

  const handleViewParsedJobHistory = (row: ParsedJobHistoryEntry) => {
    setJobHistoryReadOnly(true);
    setJobHistoryIndex(null);
    setCurrentJobHistory({
      companyName: row.companyName ?? '',
      city: row.city ?? '',
      state: row.state ?? '',
      fromDate: row.fromDate ?? '',
      toDate: row.toDate ?? '',
      lastTitle: row.lastTitle ?? '',
      startingTitle: row.startingTitle ?? '',
      duties: Array.isArray(row.duties)
        ? row.duties.join('\n')
        : (row.duties ?? ''),
    });
    setJobHistoryModalOpen(true);
  };

  const handleJobHistoryChange = (updated: JobHistoryEntry[]) => {
    setValue('jobHistory', updated, { shouldDirty: true });
  };

  const handleRemoveJobHistory = (idx: number) => {
    setValue(
      'jobHistory',
      jobHistoryList.filter((_, i) => i !== idx),
      { shouldDirty: true }
    );
  };

  const handleOpenEducationModal = (
    idx: number | null,
    row: Partial<EducationEntry>
  ) => {
    setEducationReadOnly(false);
    setEducationIndex(idx);
    setCurrentEducation(idx !== null ? row : {});
    setEducationModalOpen(true);
  };

  const handleViewParsedEducation = (row: ParsedEducationEntry) => {
    setEducationReadOnly(true);
    setEducationIndex(null);
    setCurrentEducation({
      schoolName: row.schoolName ?? '',
      city: row.city ?? '',
      state: row.state ?? '',
      startYear: row.startYear ?? '',
      endYear: row.endYear ?? '',
      degreeDiploma: row.degreeDiploma ?? '',
      major: row.major ?? '',
      minor: row.minor ?? '',
    });
    setEducationModalOpen(true);
  };

  const handleEducationChange = (updated: EducationEntry[]) => {
    setValue('education', updated, { shouldDirty: true });
  };

  const handleRemoveEducation = (idx: number) => {
    setValue(
      'education',
      educationList.filter((_, i) => i !== idx),
      { shouldDirty: true }
    );
  };

  const handleAddTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setValue('tags', [...tags, trimmed], { shouldDirty: true });
    }
  };

  const handleRemoveTag = (tag: string) => {
    setValue(
      'tags',
      tags.filter((t) => t !== tag),
      { shouldDirty: true }
    );
  };

  return (
    <div className="space-y-6">
      <ResumeUploadSection />

      {/* Job History */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium text-gray-700">
              Job History
            </span>
            <span className="ml-2 text-xs text-blue-600">
              (Please complete this section if you did not attach a resume)
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleOpenJobHistoryModal(null, {})}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="rounded border border-gray-200">
          {jobHistoryList.length === 0 && parsedJobHistory.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400 bg-gray-50">
              No Data
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {jobHistoryList.map((item, i) => (
                <JobHistoryRow
                  key={`editable-${i}`}
                  row={item}
                  idx={i}
                  onEdit={() => handleOpenJobHistoryModal(i, item)}
                  onRemove={() => handleRemoveJobHistory(i)}
                />
              ))}
              {parsedJobHistory.map((item, i) => (
                <ParsedJobHistoryRow
                  key={`parsed-${i}`}
                  row={item}
                  onClick={() => handleViewParsedJobHistory(item)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Education */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Education</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleOpenEducationModal(null, {})}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="rounded border border-gray-200">
          {educationList.length === 0 && parsedEducation.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400 bg-gray-50">
              No Data
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {educationList.map((item, i) => (
                <EducationRow
                  key={`editable-${i}`}
                  row={item}
                  idx={i}
                  onEdit={() => handleOpenEducationModal(i, item)}
                  onRemove={() => handleRemoveEducation(i)}
                />
              ))}
              {parsedEducation.map((item, i) => (
                <ParsedEducationRow
                  key={`parsed-${i}`}
                  row={item}
                  onClick={() => handleViewParsedEducation(item)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Skills */}
      <div className="space-y-2">
        <div>
          <span className="text-sm font-semibold text-gray-700">Skills</span>
          <span className="ml-2 text-xs text-blue-600">
            (entering skills allow us to match you to more opportunities)
          </span>
        </div>
        <SkillsInput
          tags={tags}
          onAdd={handleAddTag}
          onRemove={handleRemoveTag}
          resumeSkills={resumeSkills}
        />
      </div>

      <JobHistoryModal
        isOpen={isJobHistoryModalOpen}
        onClose={() => setJobHistoryModalOpen(false)}
        jobHistoryList={jobHistoryList}
        currentEntry={currentJobHistory}
        setCurrentEntry={setCurrentJobHistory}
        entryIndex={jobHistoryIndex}
        setEntryIndex={setJobHistoryIndex}
        onSave={handleJobHistoryChange}
        readOnly={jobHistoryReadOnly}
      />

      <EducationModal
        isOpen={isEducationModalOpen}
        onClose={() => setEducationModalOpen(false)}
        educationList={educationList}
        currentEntry={currentEducation}
        setCurrentEntry={setCurrentEducation}
        entryIndex={educationIndex}
        setEntryIndex={setEducationIndex}
        onSave={handleEducationChange}
        readOnly={educationReadOnly}
      />
    </div>
  );
};

// ---------- Resume Upload Section ----------

const ResumeUploadSection: React.FC = () => {
  const { applicant, loadApplicantAction } = useNewApplicantContext();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const existingResume = (
    applicant?.attachments as
      | Array<{ type: string; filename?: string; docType?: string }>
      | undefined
  )?.find((a) => a.type === 'Resume');

  const handleFileChange = async (f: File | null) => {
    if (!f || !applicant?._id) return;
    setFile(f);
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', f);
      await OnboardingService.uploadResume(applicant._id as string, formData);

      const extension = f.name.split('.').pop() ?? 'pdf';
      const newAttachment = {
        title: 'Resume',
        type: 'Resume',
        docType: extension,
        filename: f.name,
        uploadDate: new Date().toISOString(),
      };
      await OnboardingService.addAttachment(
        applicant._id as string,
        newAttachment as Record<string, unknown>
      );

      const currentAttachments =
        (applicant.attachments as Array<Record<string, unknown>>) ?? [];
      loadApplicantAction(
        { ...applicant, attachments: [...currentAttachments, newAttachment] }
      );
      toast.success('Resume uploaded successfully!');
      setFile(null);
    } catch {
      toast.error('Failed to upload resume. Please try again.');
      setFile(null);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-700">
        Resume upload (optional)
      </h3>
      {existingResume && (
        <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
          Current resume:{' '}
          {existingResume.filename ?? `Resume.${existingResume.docType}`}
        </p>
      )}
      <FileDropzone
        value={file}
        onChange={handleFileChange}
        accept=".pdf,.doc,.docx,.rtf"
        disabled={isUploading}
      />
      {isUploading && (
        <p className="text-xs text-blue-600">Uploading resume...</p>
      )}
    </div>
  );
};

// ---------- Job History Row ----------

const JobHistoryRow: React.FC<{
  row: JobHistoryEntry;
  idx: number;
  onEdit: () => void;
  onRemove: () => void;
}> = ({ row, onEdit, onRemove }) => (
  <li
    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer text-sm"
    onClick={onEdit}
  >
    <div className="grid grid-cols-5 gap-2 flex-1 min-w-0 text-xs">
      <span className="font-medium truncate">{row.companyName}</span>
      <span className="text-gray-500 truncate">
        {row.city}
        {row.state ? `, ${row.state}` : ''}
      </span>
      <span className="text-gray-500">
        {row.fromDate ? new Date(row.fromDate).toLocaleDateString() : ''}
      </span>
      <span className="text-gray-500">
        {row.toDate ? new Date(row.toDate).toLocaleDateString() : ''}
      </span>
      <span className="text-gray-500 truncate">{row.lastTitle}</span>
    </div>
    <div className="ml-2 w-24 flex-shrink-0 flex justify-end">
      <button
        type="button"
        aria-label="Remove job history entry"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="text-red-400 hover:text-red-600"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  </li>
);

// ---------- Education Row ----------

const EducationRow: React.FC<{
  row: EducationEntry;
  idx: number;
  onEdit: () => void;
  onRemove: () => void;
}> = ({ row, onEdit, onRemove }) => (
  <li
    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer text-sm"
    onClick={onEdit}
  >
    <div className="grid grid-cols-5 gap-2 flex-1 min-w-0 text-xs">
      <span className="font-medium truncate">{row.schoolName}</span>
      <span className="text-gray-500">
        {row.city}
        {row.state ? `, ${row.state}` : ''}
      </span>
      <span className="text-gray-500">
        {row.startYear && row.endYear
          ? `${row.startYear}–${row.endYear}`
          : row.startYear || row.endYear}
      </span>
      <span className="text-gray-500 truncate">{row.degreeDiploma}</span>
      <span className="text-gray-500 truncate">{row.major}</span>
    </div>
    <div className="ml-2 w-24 flex-shrink-0 flex justify-end">
      <button
        type="button"
        aria-label="Remove education entry"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="text-red-400 hover:text-red-600"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  </li>
);

// ---------- Parsed Resume Rows (read-only) ----------

const ParsedJobHistoryRow: React.FC<{
  row: ParsedJobHistoryEntry;
  onClick: () => void;
}> = ({ row, onClick }) => (
  <li
    className="flex items-center justify-between px-4 py-3 bg-gray-50 text-sm cursor-pointer hover:bg-gray-100"
    onClick={onClick}
  >
    <div className="grid grid-cols-5 gap-2 flex-1 min-w-0 text-xs">
      <span className="font-medium truncate text-gray-600">
        {row.companyName}
      </span>
      <span className="text-gray-500 truncate">
        {row.city}
        {row.state ? `, ${row.state}` : ''}
      </span>
      <span className="text-gray-500">
        {row.fromDate ? new Date(row.fromDate).toLocaleDateString() : ''}
      </span>
      <span className="text-gray-500">
        {row.toDate ? new Date(row.toDate).toLocaleDateString() : ''}
      </span>
      <span className="text-gray-500 truncate">{row.lastTitle}</span>
    </div>
    <div className="ml-2 w-24 flex-shrink-0 flex justify-end">
      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
        From Resume
      </span>
    </div>
  </li>
);

const ParsedEducationRow: React.FC<{
  row: ParsedEducationEntry;
  onClick: () => void;
}> = ({ row, onClick }) => (
  <li
    className="flex items-center justify-between px-4 py-3 bg-gray-50 text-sm cursor-pointer hover:bg-gray-100"
    onClick={onClick}
  >
    <div className="grid grid-cols-5 gap-2 flex-1 min-w-0 text-xs">
      <span className="font-medium truncate text-gray-600">
        {row.schoolName}
      </span>
      <span className="text-gray-500">
        {row.city}
        {row.state ? `, ${row.state}` : ''}
      </span>
      <span className="text-gray-500">
        {row.startYear && row.endYear
          ? `${row.startYear}–${row.endYear}`
          : row.startYear || row.endYear}
      </span>
      <span className="text-gray-500 truncate">{row.degreeDiploma}</span>
      <span className="text-gray-500 truncate">{row.major}</span>
    </div>
    <div className="ml-2 w-24 flex-shrink-0 flex justify-end">
      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
        From Resume
      </span>
    </div>
  </li>
);

// ---------- Skills Input ----------

const SkillsInput: React.FC<{
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  resumeSkills?: string[];
}> = ({ tags, onAdd, onRemove, resumeSkills = [] }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const value = inputRef.current?.value ?? '';
      const trimmed = value.trim().replace(/,$/, '');
      if (trimmed) {
        onAdd(trimmed);
        if (inputRef.current) inputRef.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 min-h-[28px]">
        {tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs text-blue-700"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove skill ${tag}`}
              onClick={() => onRemove(tag)}
              className="hover:text-blue-900"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {resumeSkills.map((skill) => (
          <span
            key={skill}
            className="flex items-center rounded-full bg-purple-100 border border-purple-200 px-3 py-1 text-xs text-purple-700"
          >
            {skill}
          </span>
        ))}
      </div>
      <Input
        ref={inputRef}
        placeholder="Skills from Master List (press Enter or comma to add)"
        onKeyDown={handleKeyDown}
      />
    </div>
  );
};

// ---------- Job History Modal ----------

interface JobHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobHistoryList: JobHistoryEntry[];
  currentEntry: Partial<JobHistoryEntry>;
  setCurrentEntry: (e: Partial<JobHistoryEntry>) => void;
  entryIndex: number | null;
  setEntryIndex: (i: number | null) => void;
  onSave: (list: JobHistoryEntry[]) => void;
  readOnly?: boolean;
}

const JobHistoryModal: React.FC<JobHistoryModalProps> = ({
  isOpen,
  onClose,
  jobHistoryList,
  currentEntry,
  setCurrentEntry,
  entryIndex,
  setEntryIndex,
  onSave,
  readOnly = false,
}) => {
  const [errors, setErrors] = useState<
    Partial<Record<keyof JobHistoryEntry, string>>
  >({});

  const handleChange = (field: keyof JobHistoryEntry, value: string) => {
    setCurrentEntry({ ...currentEntry, [field]: value });
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof JobHistoryEntry, string>> = {};
    for (const f of REQUIRED_JOB_FIELDS) {
      if (!currentEntry[f]) newErrors[f] = `${JOB_FIELD_LABELS[f]} is required`;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    const entry = currentEntry as JobHistoryEntry;
    const updated =
      entryIndex !== null
        ? jobHistoryList.map((item, i) => (i === entryIndex ? entry : item))
        : [...jobHistoryList, entry];
    onSave(updated);
    handleClose();
  };

  const handleClose = () => {
    setErrors({});
    setCurrentEntry({});
    setEntryIndex(null);
    onClose();
  };

  const textField = (
    key: keyof JobHistoryEntry,
    label: string,
    type = 'text'
  ) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        type={type}
        value={(currentEntry[key] as string) ?? ''}
        onChange={(e) => handleChange(key, e.target.value)}
        disabled={readOnly}
      />
      {!readOnly && errors[key] && (
        <p className="text-xs text-red-500">{errors[key]}</p>
      )}
    </div>
  );

  const selectField = (
    key: keyof JobHistoryEntry,
    label: string,
    options: string[]
  ) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      {readOnly ? (
        <Input value={(currentEntry[key] as string) ?? ''} disabled />
      ) : (
        <Select
          value={(currentEntry[key] as string) ?? ''}
          onValueChange={(v) => handleChange(key, v)}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={`Select ${label}`}
              displayText={(currentEntry[key] as string) || undefined}
            />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {!readOnly && errors[key] && (
        <p className="text-xs text-red-500">{errors[key]}</p>
      )}
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {readOnly
              ? 'Job History (From Resume)'
              : entryIndex !== null
                ? 'Edit Job History'
                : 'Add Job History'}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {textField('companyName', 'Customer Name')}
          {textField('address', 'Address')}
          {textField('city', 'City')}
          {selectField('state', 'State', STATE_CODES as string[])}
          {textField('zip', 'Zip Code')}
          {textField('phone', 'Phone')}
          {textField('supervisor', 'Supervisor')}
          {textField('fromDate', 'Start Date', 'date')}
          {textField('toDate', 'End Date', 'date')}
          {textField('startingTitle', 'Hired As')}
          {textField('lastTitle', 'Last Position')}
          {textField('startingSalary', 'Starting Salary', 'number')}
          {textField('endingSalary', 'Ending Salary', 'number')}
          {selectField('salaryUnit', 'Salary Unit', SALARY_UNITS)}
          {selectField('fullPartTime', 'Employment Status', EMPLOYMENT_STATUS)}
        </div>

        <div className="space-y-1 mt-2">
          <Label>Duties &amp; Responsibilities</Label>
          <Textarea
            rows={3}
            value={currentEntry.duties ?? ''}
            onChange={(e) => handleChange('duties', e.target.value)}
            disabled={readOnly}
          />
          {!readOnly && errors.duties && (
            <p className="text-xs text-red-500">{errors.duties}</p>
          )}
        </div>

        {!readOnly && (
          <div className="space-y-1">
            <Label>Reason For Leaving</Label>
            <Textarea
              rows={3}
              value={currentEntry.reasonForLeaving ?? ''}
              onChange={(e) => handleChange('reasonForLeaving', e.target.value)}
            />
            {errors.reasonForLeaving && (
              <p className="text-xs text-red-500">{errors.reasonForLeaving}</p>
            )}
          </div>
        )}

        <DialogFooter>
          {!readOnly && (
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          )}
          <Button type="button" onClick={readOnly ? handleClose : handleSubmit}>
            {readOnly ? 'Close' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---------- Education Modal ----------

interface EducationModalProps {
  isOpen: boolean;
  onClose: () => void;
  educationList: EducationEntry[];
  currentEntry: Partial<EducationEntry>;
  setCurrentEntry: (e: Partial<EducationEntry>) => void;
  entryIndex: number | null;
  setEntryIndex: (i: number | null) => void;
  onSave: (list: EducationEntry[]) => void;
  readOnly?: boolean;
}

const EducationModal: React.FC<EducationModalProps> = ({
  isOpen,
  onClose,
  educationList,
  currentEntry,
  setCurrentEntry,
  entryIndex,
  setEntryIndex,
  onSave,
  readOnly = false,
}) => {
  const [errors, setErrors] = useState<
    Partial<Record<keyof EducationEntry, string>>
  >({});

  const handleChange = (field: keyof EducationEntry, value: string) => {
    setCurrentEntry({ ...currentEntry, [field]: value });
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof EducationEntry, string>> = {};
    for (const f of REQUIRED_EDU_FIELDS) {
      if (!currentEntry[f]) newErrors[f] = `${EDU_FIELD_LABELS[f]} is required`;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    const entry = currentEntry as EducationEntry;
    const updated =
      entryIndex !== null
        ? educationList.map((item, i) => (i === entryIndex ? entry : item))
        : [...educationList, entry];
    onSave(updated);
    handleClose();
  };

  const handleClose = () => {
    setErrors({});
    setCurrentEntry({});
    setEntryIndex(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {readOnly
              ? 'Education (From Resume)'
              : entryIndex !== null
                ? 'Edit Education'
                : 'Add Education'}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1 md:col-span-2">
            <Label>Degree / Diploma</Label>
            <Input
              value={currentEntry.degreeDiploma ?? ''}
              onChange={(e) => handleChange('degreeDiploma', e.target.value)}
              disabled={readOnly}
            />
            {!readOnly && errors.degreeDiploma && (
              <p className="text-xs text-red-500">{errors.degreeDiploma}</p>
            )}
          </div>

          <div className="space-y-1 md:col-span-2">
            <Label>School Name</Label>
            <Input
              value={currentEntry.schoolName ?? ''}
              onChange={(e) => handleChange('schoolName', e.target.value)}
              disabled={readOnly}
            />
            {!readOnly && errors.schoolName && (
              <p className="text-xs text-red-500">{errors.schoolName}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label>City</Label>
            <Input
              value={currentEntry.city ?? ''}
              onChange={(e) => handleChange('city', e.target.value)}
              disabled={readOnly}
            />
            {!readOnly && errors.city && (
              <p className="text-xs text-red-500">{errors.city}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label>State</Label>
            {readOnly ? (
              <Input value={currentEntry.state ?? ''} disabled />
            ) : (
              <Select
                value={currentEntry.state ?? ''}
                onValueChange={(v) => handleChange('state', v)}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder="Select State"
                    displayText={currentEntry.state || undefined}
                  />
                </SelectTrigger>
                <SelectContent>
                  {STATE_CODES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {!readOnly && errors.state && (
              <p className="text-xs text-red-500">{errors.state}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label>Major</Label>
            <Input
              value={currentEntry.major ?? ''}
              onChange={(e) => handleChange('major', e.target.value)}
              disabled={readOnly}
            />
          </div>

          <div className="space-y-1">
            <Label>Minor</Label>
            <Input
              value={currentEntry.minor ?? ''}
              onChange={(e) => handleChange('minor', e.target.value)}
              disabled={readOnly}
            />
          </div>

          <div className="space-y-1">
            <Label>Start Year</Label>
            <Input
              type="number"
              value={currentEntry.startYear ?? ''}
              onChange={(e) => handleChange('startYear', e.target.value)}
              disabled={readOnly}
            />
            {!readOnly && errors.startYear && (
              <p className="text-xs text-red-500">{errors.startYear}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label>End Year</Label>
            <Input
              type="number"
              value={currentEntry.endYear ?? ''}
              onChange={(e) => handleChange('endYear', e.target.value)}
              disabled={readOnly}
            />
            {!readOnly && errors.endYear && (
              <p className="text-xs text-red-500">{errors.endYear}</p>
            )}
          </div>
        </div>

        <div className="space-y-1 mt-2">
          <Label>Description</Label>
          <Textarea
            rows={3}
            value={currentEntry.description ?? ''}
            onChange={(e) => handleChange('description', e.target.value)}
            disabled={readOnly}
          />
        </div>

        <DialogFooter>
          {!readOnly && (
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          )}
          <Button type="button" onClick={readOnly ? handleClose : handleSubmit}>
            {readOnly ? 'Close' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ApplicantResumeAndJobHistory;
