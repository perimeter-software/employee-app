'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { X, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { baseInstance } from '@/lib/api/instance';
import { useCurrentUser } from '@/domains/user/hooks/use-current-user';
import { usePrimaryCompany } from '@/domains/company/hooks/use-primary-company';
import type { StaffingEmployee } from '../EmployeeViewModal/EmployeeViewModal';

// ─── Types ────────────────────────────────────────────────────────────────────

type MessageTemplate = {
  _id: string;
  name: string;
  subject?: string;
  Message?: string;
};

type SubstitutionResult = {
  success: boolean;
  messageText?: string;
  subjectText?: string;
  missingContext?: string[];
};

type EmployeeAttachment = { type: string; filename: string };

type AttachmentOption = {
  label: string;
  filename: string;
  entity: string;
  group: string;
  venueSlug?: string;
};

type Attachment = AttachmentOption;

const EMPTY_TEMPLATES: MessageTemplate[] = [];
const EMPTY_EMPLOYEE_ATTACHMENTS: EmployeeAttachment[] = [];

async function fetchMessageTemplates(): Promise<MessageTemplate[]> {
  const res = await baseInstance.get<MessageTemplate[]>('message-templates');
  if (!res.success || !res.data) return [];
  return res.data;
}

async function fetchSubstitution(
  templateName: string,
  applicantId: string,
  venueSlug?: string
): Promise<SubstitutionResult> {
  const res = await fetch('/api/template-substitution', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      selectedTemplate: templateName,
      applicantId,
      venueSlug,
    }),
  });
  return res.json().catch(() => ({ success: false }));
}

const removeHtmlTags = (html: string) => html.replace(/<[^>]*>/g, '').trim();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Rich-text editor ─────────────────────────────────────────────────────────

type ToolbarButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  title: string;
};

const ToolbarButton = ({
  active,
  title,
  children,
  ...props
}: ToolbarButtonProps) => (
  <button
    type="button"
    title={title}
    className={`px-1.5 py-0.5 rounded text-sm font-medium hover:bg-slate-200 transition-colors ${
      active ? 'bg-slate-200 text-slate-900' : 'text-slate-600'
    }`}
    {...props}
  >
    {children}
  </button>
);

const BLOCK_FORMATS = ['p', 'h1', 'h2', 'h3', 'h4'];
const BLOCK_LABELS: Record<string, string> = {
  p: 'Normal',
  h1: 'Heading 1',
  h2: 'Heading 2',
  h3: 'Heading 3',
  h4: 'Heading 4',
};

const RichEditor = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [blockFormat, setBlockFormat] = useState('p');
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (!editorRef.current) return;
    if (editorRef.current.innerHTML !== value)
      editorRef.current.innerHTML = value || '<p><br></p>';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!editorRef.current || value !== '') return;
    editorRef.current.innerHTML = '<p><br></p>';
  }, [value]);

  const exec = useCallback(
    (cmd: string, val?: string) => {
      editorRef.current?.focus();
      document.execCommand(cmd, false, val);
      if (editorRef.current) onChange(editorRef.current.innerHTML);
      forceRender((n) => n + 1);
    },
    [onChange]
  );

  const isActive = (cmd: string) => {
    try {
      return document.queryCommandState(cmd);
    } catch {
      return false;
    }
  };

  return (
    <div className="border border-slate-200 rounded-md overflow-hidden">
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1 border-b border-slate-200 bg-white">
        <select
          aria-label="Text format"
          value={blockFormat}
          onChange={(e) => {
            exec('formatBlock', e.target.value === 'p' ? 'p' : e.target.value);
            setBlockFormat(e.target.value);
          }}
          className="text-xs border border-slate-200 rounded px-1 py-0.5 mr-1 bg-white"
        >
          {BLOCK_FORMATS.map((f) => (
            <option key={f} value={f}>
              {BLOCK_LABELS[f]}
            </option>
          ))}
        </select>
        <ToolbarButton
          title="Bold"
          active={isActive('bold')}
          onClick={() => exec('bold')}
        >
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton
          title="Italic"
          active={isActive('italic')}
          onClick={() => exec('italic')}
        >
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton
          title="Underline"
          active={isActive('underline')}
          onClick={() => exec('underline')}
        >
          <u>U</u>
        </ToolbarButton>
        <ToolbarButton
          title="Strikethrough"
          active={isActive('strikeThrough')}
          onClick={() => exec('strikeThrough')}
        >
          <s>S</s>
        </ToolbarButton>
        <ToolbarButton
          title="Blockquote"
          onClick={() => exec('formatBlock', 'blockquote')}
        >
          ❝
        </ToolbarButton>
        <span className="w-px h-4 bg-slate-200 mx-0.5" />
        <ToolbarButton title="Align Left" onClick={() => exec('justifyLeft')}>
          ≡
        </ToolbarButton>
        <ToolbarButton
          title="Align Center"
          onClick={() => exec('justifyCenter')}
        >
          ☰
        </ToolbarButton>
        <ToolbarButton title="Align Right" onClick={() => exec('justifyRight')}>
          ≣
        </ToolbarButton>
        <span className="w-px h-4 bg-slate-200 mx-0.5" />
        <ToolbarButton
          title="Ordered List"
          onClick={() => exec('insertOrderedList')}
        >
          1.
        </ToolbarButton>
        <ToolbarButton
          title="Unordered List"
          onClick={() => exec('insertUnorderedList')}
        >
          •
        </ToolbarButton>
        <span className="w-px h-4 bg-slate-200 mx-0.5" />
        <ToolbarButton
          title="Insert Link"
          onClick={() => {
            const url = window.prompt('Enter URL');
            if (url) exec('createLink', url);
          }}
        >
          🔗
        </ToolbarButton>
        <ToolbarButton
          title="Text Color"
          onClick={() => {
            const c = window.prompt('Enter color (e.g. #ff0000 or red)');
            if (c) exec('foreColor', c);
          }}
        >
          A
        </ToolbarButton>
        <ToolbarButton
          title="Background Color"
          onClick={() => {
            const c = window.prompt('Enter background color');
            if (c) exec('hiliteColor', c);
          }}
        >
          <span className="text-yellow-500 font-bold">A</span>
        </ToolbarButton>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={() => {
          if (editorRef.current) onChange(editorRef.current.innerHTML);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Tab') {
            e.preventDefault();
            exec('insertHTML', '&nbsp;&nbsp;&nbsp;&nbsp;');
          }
        }}
        className="min-h-[100px] max-h-[300px] overflow-y-auto px-3 py-2 text-sm text-slate-800 focus:outline-none leading-relaxed"
      />
    </div>
  );
};

// ─── Email chip input ──────────────────────────────────────────────────────────

const ChipInput = ({
  disabled,
  emails,
  inputValue,
  error,
  onInputChange,
  onAdd,
  onDelete,
}: {
  disabled: boolean;
  emails: string[];
  inputValue: string;
  error: string;
  onInputChange: (v: string) => void;
  onAdd: (email: string) => void;
  onDelete: (i: number) => void;
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ([';', ',', 'Enter', 'Tab'].includes(e.key)) {
      e.preventDefault();
      onAdd(inputValue.trim());
    }
  };
  return (
    <div
      className={`flex flex-wrap gap-1 items-center min-h-[34px] border rounded-md px-2 py-1 bg-white ${disabled ? 'opacity-50 pointer-events-none' : ''} ${error ? 'border-red-400' : 'border-slate-200'}`}
    >
      {emails.map((em, i) => (
        <span
          key={em}
          className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-xs rounded px-2 py-0.5"
        >
          {em}
          <button
            type="button"
            aria-label={`Remove ${em}`}
            onClick={() => onDelete(i)}
            className="hover:text-blue-600"
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </span>
      ))}
      <input
        value={inputValue}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          if (inputValue.trim()) onAdd(inputValue.trim());
        }}
        onPaste={(e) => {
          e.preventDefault();
          e.clipboardData
            .getData('Text')
            .split(/[;,]+/)
            .forEach((em) => onAdd(em.trim()));
        }}
        placeholder="Emails"
        className="flex-1 min-w-[80px] text-xs outline-none placeholder:text-slate-400"
      />
      {error && <p className="text-red-500 text-xs w-full">{error}</p>}
    </div>
  );
};

// ─── Preview modal ─────────────────────────────────────────────────────────────

const PreviewModal = ({
  open,
  subject,
  message,
  onClose,
}: {
  open: boolean;
  subject: string;
  message: string;
  onClose: () => void;
}) => (
  <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
    <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
      <DialogHeader>
        <DialogTitle>Preview</DialogTitle>
      </DialogHeader>
      {subject && (
        <p className="text-sm font-semibold text-slate-700 px-1">
          Subject: {subject}
        </p>
      )}
      <div
        className="flex-1 overflow-y-auto border border-slate-200 rounded-md p-3 text-sm text-slate-800"
        dangerouslySetInnerHTML={{ __html: message }}
      />
      <div className="flex justify-end pt-2">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);

// ─── Upload attachment modal ───────────────────────────────────────────────────

const UploadAttachmentModal = ({
  open,
  venueSlug,
  onUploaded,
  onClose,
}: {
  open: boolean;
  venueSlug?: string;
  onUploaded: (filename: string) => void;
  onClose: () => void;
}) => {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const reset = () => {
    setFiles([]);
    setErrors({});
    setUploading(false);
  };
  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrors({});
    const selected = Array.from(e.target.files ?? []);
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name));
      return [...prev, ...selected.filter((f) => !existing.has(f.name))];
    });
    e.target.value = '';
  };

  const removeFile = (name: string) =>
    setFiles((prev) => prev.filter((f) => f.name !== name));

  const handleUpload = async () => {
    if (!files.length || !venueSlug) return;
    setUploading(true);
    setErrors({});
    const results = await Promise.allSettled(
      files.map(async (file) => {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch(`/api/venues/${venueSlug}/upload`, {
          method: 'POST',
          body: form,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.message || 'Upload failed.');
        return file.name;
      })
    );
    setUploading(false);
    const newErrors: Record<string, string> = {};
    results.forEach((r, i) => {
      if (r.status === 'rejected')
        newErrors[files[i].name] = r.reason?.message ?? 'Upload failed.';
      else onUploaded(r.value);
    });
    if (Object.keys(newErrors).length) {
      setErrors(newErrors);
      setFiles((prev) => prev.filter((f) => newErrors[f.name]));
    } else {
      handleClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Upload Attachments</DialogTitle>
        </DialogHeader>
        <label
          htmlFor="upload-attachment-input"
          className="border-2 border-dashed border-slate-200 rounded-md px-4 py-6 text-center cursor-pointer hover:border-blue-400 transition-colors block"
        >
          <input
            id="upload-attachment-input"
            type="file"
            multiple
            aria-label="Select files to upload"
            className="sr-only"
            onChange={handleFileChange}
          />
          <p className="text-sm text-slate-400">Click to select files</p>
        </label>
        {files.length > 0 && (
          <ul className="space-y-1 max-h-40 overflow-y-auto">
            {files.map((f) => (
              <li
                key={f.name}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span
                  className={`truncate ${errors[f.name] ? 'text-red-500' : 'text-slate-700'}`}
                >
                  {f.name}
                  {errors[f.name] && (
                    <span className="ml-1 text-red-400">
                      — {errors[f.name]}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => removeFile(f.name)}
                  disabled={uploading}
                  className="shrink-0 text-slate-400 hover:text-red-500 disabled:opacity-40"
                >
                  <X className="w-3 h-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={handleClose} disabled={uploading}>
            Cancel
          </Button>
          <Button onClick={handleUpload} disabled={!files.length || uploading}>
            {uploading
              ? 'Uploading…'
              : `Upload${files.length > 1 ? ` (${files.length})` : ''}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ─── Toggle switch ─────────────────────────────────────────────────────────────

const Toggle = ({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) => (
  <label
    className={`inline-flex items-center gap-2 cursor-pointer select-none ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
  >
    <span
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-slate-300'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`}
      />
    </span>
    <span
      className={`text-sm font-medium ${checked ? 'text-blue-600' : 'text-slate-500'}`}
    >
      {label}
    </span>
  </label>
);

// ─── Recipient row (bulk mode) ─────────────────────────────────────────────────

const RecipientRow = ({
  emp,
  selected,
  onToggle,
}: {
  emp: StaffingEmployee;
  selected: boolean;
  onToggle: () => void;
}) => {
  const initials =
    `${emp.firstName?.[0] ?? ''}${emp.lastName?.[0] ?? ''}`.toUpperCase();
  return (
    <tr
      className={`hover:bg-slate-50 transition-colors cursor-pointer ${selected ? 'bg-blue-50' : ''}`}
      onClick={onToggle}
    >
      <td className="px-3 py-2">
        <input
          type="checkbox"
          aria-label="Select recipient"
          checked={selected}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          className="rounded border-slate-300"
        />
      </td>
      <td className="px-3 py-2">
        <span className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 text-xs font-semibold flex items-center justify-center">
          {initials}
        </span>
      </td>
      <td className="px-3 py-2 text-sm font-medium text-slate-800">
        {emp.lastName}
      </td>
      <td className="px-3 py-2 text-sm text-slate-700">{emp.firstName}</td>
      <td className="px-3 py-2">
        <span
          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
            emp.employmentStatus === 'Active'
              ? 'bg-emerald-100 text-emerald-700'
              : emp.employmentStatus === 'Terminated'
                ? 'bg-red-100 text-red-700'
                : 'bg-slate-100 text-slate-600'
          }`}
        >
          {emp.employmentStatus || '—'}
        </span>
      </td>
      <td className="px-3 py-2 text-xs text-slate-500">
        {emp.email ? '✓' : '—'}
      </td>
      <td className="px-3 py-2 text-xs text-slate-500">
        {emp.phone ? '✓' : '—'}
      </td>
    </tr>
  );
};

// ─── Props ────────────────────────────────────────────────────────────────────

type CommonProps = {
  venueSlug?: string;
  venueAttachments?: string[];
  open: boolean;
  onClose: () => void;
};

type SingleProps = CommonProps & {
  mode?: 'single';
  recipient: StaffingEmployee;
  employees?: never;
};

type BulkProps = CommonProps & {
  mode: 'bulk';
  employees: StaffingEmployee[];
  recipient?: never;
};

export type SendMessageModalProps = SingleProps | BulkProps;

// ─── Main component ───────────────────────────────────────────────────────────

export const SendMessageModal = (props: SendMessageModalProps) => {
  const { venueSlug, venueAttachments = [], open, onClose } = props;
  const isBulk = props.mode === 'bulk';
  const recipient = !isBulk ? (props as SingleProps).recipient : null;
  const employees = isBulk ? (props as BulkProps).employees : [];

  const { data: currentUser } = useCurrentUser();
  const { data: company } = usePrimaryCompany();

  // Employee attachments — only for single mode
  const { data: recipientAttachments = EMPTY_EMPLOYEE_ATTACHMENTS } = useQuery<
    EmployeeAttachment[]
  >({
    queryKey: ['employee-attachments', venueSlug, recipient?._id],
    queryFn: async () => {
      const res = await fetch(
        `/api/venues/${venueSlug}/employees/${recipient!._id}`
      );
      const json = await res.json().catch(() => ({}));
      return json.attachments ?? [];
    },
    enabled: !isBulk && open && !!venueSlug && !!recipient?._id,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const {
    data: messageTemplates = EMPTY_TEMPLATES,
    isLoading: templatesLoading,
  } = useQuery<MessageTemplate[]>({
    queryKey: ['message-templates'],
    queryFn: fetchMessageTemplates,
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Bulk recipient selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const allSelected =
    employees.length > 0 && selectedIds.size === employees.length;
  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(employees.map((e) => e._id)));
  };
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const firstSelectedEmployee = useMemo(
    () => employees.find((e) => selectedIds.has(e._id)) ?? null,
    [employees, selectedIds]
  );

  // Message type toggles
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [textEnabled, setTextEnabled] = useState(false);
  const [systemEnabled, setSystemEnabled] = useState(false);
  const [suppressFooter, setSuppressFooter] = useState(false);

  // Copy / CC / BCC
  const [copyToMe, setCopyToMe] = useState(false);
  const [ccEnabled, setCCEnabled] = useState(false);
  const [bccEnabled, setBCCEnabled] = useState(false);
  const [ccEmails, setCCEmails] = useState<string[]>([]);
  const [bccEmails, setBCCEmails] = useState<string[]>([]);
  const [ccInput, setCCInput] = useState('');
  const [bccInput, setBCCInput] = useState('');
  const [ccError, setCCError] = useState('');
  const [bccError, setBCCError] = useState('');

  // Template / subject / editor
  const [template, setTemplate] = useState('Custom Message');
  const [customSubject, setCustomSubject] = useState('');
  const [editorValue, setEditorValue] = useState('');
  const [editorKey, setEditorKey] = useState(0);
  const [substitutionLoading, setSubstitutionLoading] = useState(false);
  const [templateError, setTemplateError] = useState<{
    missingContext: string[];
  } | null>(null);

  // Attachments
  const [includeAttachments, setIncludeAttachments] = useState(false);
  const [selectedAttachments, setSelectedAttachments] = useState<Attachment[]>(
    []
  );
  const [uploadedFilenames, setUploadedFilenames] = useState<string[]>([]);
  const [uploadAttachOpen, setUploadAttachOpen] = useState(false);

  // Preview / send
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const companyName = company?.name ?? 'Company';

  const attachmentOptions: AttachmentOption[] = [
    ...venueAttachments.map((filename) => ({
      label: filename,
      filename,
      entity: 'Venue',
      group: 'Venue',
      venueSlug,
    })),
    ...uploadedFilenames
      .filter((f) => !venueAttachments.includes(f))
      .map((filename) => ({
        label: filename,
        filename,
        entity: 'Venue',
        group: 'Venue',
        venueSlug,
      })),
    ...(company?.attachments ?? []).map((att) => ({
      label: att.filename,
      filename: att.filename,
      entity: 'Company',
      group: companyName,
    })),
    // Employee attachments only available in single mode
    ...(!isBulk
      ? recipientAttachments.map((att) => ({
          label: att.filename,
          filename: att.filename,
          entity: 'Applicant',
          group: att.type,
        }))
      : []),
  ];

  const availableAttachments = attachmentOptions.filter(
    (opt) => !selectedAttachments.some((s) => s.filename === opt.filename)
  );

  const groupedAvailable = availableAttachments.reduce<
    Record<string, AttachmentOption[]>
  >((acc, opt) => {
    (acc[opt.group] ??= []).push(opt);
    return acc;
  }, {});

  const isInvalid =
    (isBulk && selectedIds.size === 0) ||
    (!emailEnabled && !textEnabled && !systemEnabled) ||
    !!templateError ||
    !customSubject.trim() ||
    removeHtmlTags(editorValue) === '';

  // ── Email chip helpers ─────────────────────────────────────────────────────

  const addCC = (email: string) => {
    if (!email) return;
    if (!EMAIL_RE.test(email)) {
      setCCError('Invalid email format');
      return;
    }
    if (ccEmails.includes(email)) {
      setCCInput('');
      return;
    }
    setCCEmails((p) => [...p, email]);
    setCCInput('');
    setCCError('');
  };
  const addBCC = (email: string) => {
    if (!email) return;
    if (!EMAIL_RE.test(email)) {
      setBCCError('Invalid email format');
      return;
    }
    if (bccEmails.includes(email)) {
      setBCCInput('');
      return;
    }
    setBCCEmails((p) => [...p, email]);
    setBCCInput('');
    setBCCError('');
  };

  // ── Template substitution ──────────────────────────────────────────────────

  const substitutionApplicantId = isBulk
    ? firstSelectedEmployee?._id
    : recipient?._id;

  useEffect(() => {
    setTemplateError(null);

    if (template === 'Custom Message') {
      setEditorValue('');
      setCustomSubject('');
      return;
    }

    const found = messageTemplates.find((t) => t.name === template);
    if (!found) return;

    const applyContent = (html: string, subject: string) => {
      setEditorValue(html);
      setEditorKey((k) => k + 1);
      setCustomSubject(subject);
    };

    if (substitutionApplicantId) {
      setSubstitutionLoading(true);
      fetchSubstitution(template, substitutionApplicantId, venueSlug)
        .then((result) => {
          if (!result.success) {
            setTemplateError({ missingContext: result.missingContext ?? [] });
            return;
          }
          applyContent(
            result.messageText ?? found.Message ?? '',
            result.subjectText ?? found.subject ?? ''
          );
        })
        .catch(() => applyContent(found.Message ?? '', found.subject ?? ''))
        .finally(() => setSubstitutionLoading(false));
    } else {
      applyContent(found.Message ?? '', found.subject ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template, messageTemplates, substitutionApplicantId]);

  // ── Reset on close ─────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setSelectedIds(new Set());
    setEmailEnabled(true);
    setTextEnabled(false);
    setSystemEnabled(false);
    setSuppressFooter(false);
    setCopyToMe(false);
    setCCEnabled(false);
    setBCCEnabled(false);
    setCCEmails([]);
    setBCCEmails([]);
    setCCInput('');
    setBCCInput('');
    setCCError('');
    setBCCError('');
    setTemplate('Custom Message');
    setCustomSubject('');
    setEditorValue('');
    setEditorKey((k) => k + 1);
    setIncludeAttachments(false);
    setSelectedAttachments([]);
    setUploadedFilenames([]);
    setUploadAttachOpen(false);
    setSubstitutionLoading(false);
    setTemplateError(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  // ── Send ───────────────────────────────────────────────────────────────────

  const handleSend = async () => {
    if (isInvalid) return;
    setSending(true);
    try {
      if (isBulk) {
        const payload = {
          applicantIdList: [...selectedIds],
          sendEmail: emailEnabled,
          sendText: textEnabled,
          sendSystem: systemEnabled,
          selectedTemplate: template,
          subject: customSubject,
          messageBody: editorValue,
          attachments: includeAttachments ? selectedAttachments : [],
          copySender: copyToMe,
          suppressFooter,
          ...(ccEnabled && ccEmails.length ? { ccList: ccEmails } : {}),
          ...(bccEnabled && bccEmails.length ? { bccList: bccEmails } : {}),
        };
        const res = await fetch(`/api/venues/${venueSlug}/bulk-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(json.message || 'Failed to send messages');
          return;
        }
        toast.success(
          `Bulk message sent to ${selectedIds.size} recipient${selectedIds.size !== 1 ? 's' : ''}`
        );
      } else {
        const payload = {
          sender: {
            fromEmail: currentUser?.email,
            firstName: currentUser?.firstName,
            lastName: currentUser?.lastName,
          },
          recipient: {
            firstName: recipient!.firstName,
            lastName: recipient!.lastName,
            applicantId: recipient!._id,
            toEmail: recipient!.email,
          },
          subject: customSubject,
          messageBody: editorValue,
          templateName: template,
          sendEmail: emailEnabled,
          sendText: textEnabled,
          sendSystem: systemEnabled,
          copySender: copyToMe,
          ...(ccEnabled && ccEmails.length && { ccList: ccEmails }),
          ...(bccEnabled && bccEmails.length && { bccList: bccEmails }),
          attachments: includeAttachments ? selectedAttachments : [],
          suppressFooter,
        };
        const res = await fetch('/api/send-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(json.message || 'Failed to send message');
          return;
        }
        toast.success('Message sent successfully');
      }
      onClose();
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const senderEmail = currentUser?.email ?? '';

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent
          className={`${isBulk ? 'max-w-3xl' : 'max-w-2xl'} p-0 overflow-hidden max-h-[92vh] flex flex-col`}
        >
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-slate-100">
            <DialogTitle className="text-base font-semibold">
              {isBulk
                ? 'Bulk Message'
                : `Send Message to ${recipient!.lastName} ${recipient!.firstName}`}
            </DialogTitle>
            {!isBulk && recipient!.email && (
              <p className="text-sm text-blue-600 font-medium mt-0.5">
                E-mail: {recipient!.email}
              </p>
            )}
          </DialogHeader>

          <div
            className="overflow-y-auto flex-1 px-5 py-4 space-y-3"
            onWheel={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
          >
            {/* Copy to me */}
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={copyToMe}
                onChange={(e) => setCopyToMe(e.target.checked)}
                className="rounded border-slate-300"
              />
              Send a Copy to My Email: ({senderEmail})
            </label>

            {/* CC */}
            <div className="flex items-start gap-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm pt-1.5 shrink-0">
                <input
                  type="checkbox"
                  checked={ccEnabled}
                  onChange={(e) => {
                    setCCEnabled(e.target.checked);
                    if (!e.target.checked) {
                      setCCEmails([]);
                      setCCInput('');
                      setCCError('');
                    }
                  }}
                  className="rounded border-slate-300"
                />
                CC:
              </label>
              <div className="flex-1">
                <ChipInput
                  disabled={!ccEnabled}
                  emails={ccEmails}
                  inputValue={ccInput}
                  error={ccError}
                  onInputChange={(v) => {
                    setCCInput(v);
                    if (ccError && EMAIL_RE.test(v)) setCCError('');
                  }}
                  onAdd={addCC}
                  onDelete={(i) =>
                    setCCEmails((p) => p.filter((_, idx) => idx !== i))
                  }
                />
              </div>
            </div>

            {/* BCC */}
            <div className="flex items-start gap-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm pt-1.5 shrink-0">
                <input
                  type="checkbox"
                  checked={bccEnabled}
                  onChange={(e) => {
                    setBCCEnabled(e.target.checked);
                    if (!e.target.checked) {
                      setBCCEmails([]);
                      setBCCInput('');
                      setBCCError('');
                    }
                  }}
                  className="rounded border-slate-300"
                />
                BCC:
              </label>
              <div className="flex-1">
                <ChipInput
                  disabled={!bccEnabled}
                  emails={bccEmails}
                  inputValue={bccInput}
                  error={bccError}
                  onInputChange={(v) => {
                    setBCCInput(v);
                    if (bccError && EMAIL_RE.test(v)) setBCCError('');
                  }}
                  onAdd={addBCC}
                  onDelete={(i) =>
                    setBCCEmails((p) => p.filter((_, idx) => idx !== i))
                  }
                />
              </div>
            </div>

            {/* Template selector */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">
                  Select a Message
                </label>
                <select
                  aria-label="Select a message template"
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  disabled={templatesLoading}
                  className="w-full text-sm border border-slate-200 rounded-md px-3 py-1.5 bg-white disabled:opacity-50"
                >
                  {templatesLoading ? (
                    <option value="Custom Message">Loading templates…</option>
                  ) : (
                    <>
                      <option value="Custom Message">Custom Message</option>
                      {messageTemplates.map((t) => (
                        <option key={t._id} value={t.name}>
                          {t.name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">
                  Mobile Push Notifications
                </label>
                <select
                  aria-label="Mobile push notifications"
                  disabled
                  className="w-full text-sm border border-slate-200 rounded-md px-3 py-1.5 bg-slate-50 text-slate-400"
                >
                  <option value="">—</option>
                </select>
              </div>
            </div>

            {templateError && (
              <p className="text-xs text-red-500">
                {templateError.missingContext.length > 0
                  ? `Missing data for this template: ${templateError.missingContext.join(', ')}`
                  : 'An error occurred loading the template.'}
              </p>
            )}

            {/* Subject */}
            <div>
              <label className="text-xs text-slate-500 mb-1 block">
                Enter a Subject
              </label>
              <input
                type="text"
                value={customSubject}
                onChange={(e) => setCustomSubject(e.target.value)}
                placeholder="Subject"
                className="w-full text-sm border border-slate-200 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>

            {/* Message type toggles */}
            <div className="flex flex-wrap gap-4 pt-1">
              <Toggle
                checked={systemEnabled}
                onChange={setSystemEnabled}
                label="System"
              />
              <Toggle
                checked={textEnabled}
                onChange={setTextEnabled}
                label="Text"
                disabled={!isBulk && !recipient?.phone}
              />
              <Toggle
                checked={emailEnabled}
                onChange={setEmailEnabled}
                label="Email"
                disabled={!isBulk && !recipient?.email}
              />
            </div>

            <Toggle
              checked={suppressFooter}
              onChange={setSuppressFooter}
              label="Remove Footer"
            />

            {/* Rich text editor */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  Message
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
                >
                  <Eye className="w-3 h-3" />
                  PREVIEW
                </button>
              </div>
              <div className="relative">
                {substitutionLoading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 rounded-md">
                    <span className="text-xs text-slate-500">
                      Loading template…
                    </span>
                  </div>
                )}
                <RichEditor
                  key={editorKey}
                  value={editorValue}
                  onChange={setEditorValue}
                />
              </div>
            </div>

            {/* Attachments (only for email) */}
            {emailEnabled && (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer text-sm shrink-0">
                    <input
                      type="checkbox"
                      checked={includeAttachments}
                      onChange={(e) => setIncludeAttachments(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    Include Attachments
                  </label>
                  <select
                    aria-label="Add attachment"
                    disabled={!includeAttachments}
                    value=""
                    onChange={(e) => {
                      if (e.target.value === '__upload__') {
                        setUploadAttachOpen(true);
                        return;
                      }
                      const opt = availableAttachments.find(
                        (a) => a.filename === e.target.value
                      );
                      if (opt) setSelectedAttachments((p) => [...p, opt]);
                    }}
                    className="flex-1 text-sm border border-slate-200 rounded-md px-3 py-1.5 bg-white disabled:opacity-50"
                  >
                    <option value="">Add Attachments</option>
                    <option value="__upload__">[ Upload Attachment ]</option>
                    {Object.entries(groupedAvailable).map(([group, opts]) => (
                      <optgroup key={group} label={group}>
                        {opts.map((a) => (
                          <option key={a.filename} value={a.filename}>
                            {a.filename}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                {selectedAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedAttachments.map((att) => (
                      <span
                        key={att.filename}
                        className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-xs rounded-full px-2 py-0.5"
                      >
                        {att.filename}
                        <button
                          type="button"
                          aria-label={`Remove ${att.filename}`}
                          onClick={() =>
                            setSelectedAttachments((p) =>
                              p.filter((a) => a.filename !== att.filename)
                            )
                          }
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Bulk recipient table */}
            {isBulk && (
              <div className="space-y-1 pt-1">
                <p className="text-xs text-slate-500">
                  {selectedIds.size === 0
                    ? 'No recipients selected'
                    : `${selectedIds.size} recipient${selectedIds.size !== 1 ? 's' : ''} selected`}
                </p>
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-md">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
                      <tr>
                        <th className="px-3 py-2 w-8" aria-label="Select all">
                          <input
                            type="checkbox"
                            aria-label="Select all recipients"
                            checked={allSelected}
                            onChange={toggleAll}
                            className="rounded border-slate-300"
                          />
                        </th>
                        <th className="px-3 py-2 w-8" aria-label="Avatar">
                          <span className="sr-only">Avatar</span>
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold text-slate-500 text-left">
                          Last Name
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold text-slate-500 text-left">
                          First Name
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold text-slate-500 text-left">
                          Status
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold text-slate-500 text-center">
                          Email
                        </th>
                        <th className="px-3 py-2 text-xs font-semibold text-slate-500 text-center">
                          Phone
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {employees.map((emp) => (
                        <RecipientRow
                          key={emp._id}
                          emp={emp}
                          selected={selectedIds.has(emp._id)}
                          onToggle={() => toggleOne(emp._id)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
            <Button
              variant="outline"
              className="border-red-300 text-red-600 hover:bg-red-50"
              onClick={onClose}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={sending || substitutionLoading || isInvalid}
              className="bg-blue-600 text-white hover:bg-blue-700"
            >
              {sending
                ? 'Sending…'
                : isBulk
                  ? `Send to ${selectedIds.size || 0} Recipient${selectedIds.size !== 1 ? 's' : ''}`
                  : 'Send Message'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <PreviewModal
        open={previewOpen}
        subject={customSubject}
        message={editorValue}
        onClose={() => setPreviewOpen(false)}
      />

      <UploadAttachmentModal
        open={uploadAttachOpen}
        venueSlug={venueSlug}
        onUploaded={(filename) => {
          setUploadedFilenames((p) => [...p, filename]);
          const newOpt: Attachment = {
            label: filename,
            filename,
            entity: 'Venue',
            group: 'Venue',
            venueSlug,
          };
          setSelectedAttachments((p) => [...p, newOpt]);
        }}
        onClose={() => setUploadAttachOpen(false)}
      />
    </>
  );
};
