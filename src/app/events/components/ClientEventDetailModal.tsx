'use client';

import React, { useState, useCallback, useRef } from 'react';
import {
  CalendarDays,
  Activity,
  FileText,
  Paperclip,
  Briefcase,
  Settings,
  MessageSquare,
  MapPin,
  X,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  Loader2,
  ImageIcon,
  AlertCircle,
} from 'lucide-react';
import { useQuery, useMutation, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
} from '@/components/ui/Dialog';
import { EventApiService } from '@/domains/event/services/event-service';
import type {
  GignologyEvent,
  EventNote,
  EventPosition,
  EventActivity,
} from '@/domains/event/types/event.types';
import { clsxm } from '@/lib/utils';
import { usePrimaryCompany } from '@/domains/company/hooks/use-primary-company';

// ─── Panel definitions ────────────────────────────────────────────────────────

type PanelId =
  | 'details'
  | 'activities'
  | 'content'
  | 'attachments'
  | 'positions'
  | 'settings'
  | 'notes'
  | 'geofencing';

const PANELS: { id: PanelId; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'details', label: 'Event Details', Icon: CalendarDays },
  { id: 'activities', label: 'Activities', Icon: Activity },
  { id: 'content', label: 'Content', Icon: FileText },
  { id: 'attachments', label: 'Attachments', Icon: Paperclip },
  { id: 'positions', label: 'Positions', Icon: Briefcase },
  { id: 'settings', label: 'Settings', Icon: Settings },
  { id: 'notes', label: 'Notes', Icon: MessageSquare },
  { id: 'geofencing', label: 'Geofencing', Icon: MapPin },
];

// ─── Shared helpers ───────────────────────────────────────────────────────────

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsxm('flex flex-col gap-1', className)}>
      <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</label>
      {children}
    </div>
  );
}

function ReadOnlyValue({ value }: { value?: string | number | null }) {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 min-h-[38px]">
      {value ?? <span className="text-gray-400">—</span>}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500 w-full"
    />
  );
}

function SelectInput({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500 w-full bg-white"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4 mt-6 first:mt-0">
      <span className="text-xs font-bold uppercase tracking-widest text-blue-600">{title}</span>
      <div className="flex-1 h-px bg-blue-100" />
    </div>
  );
}

function SaveBar({
  onSave,
  onCancel,
  isSaving,
  dirty,
}: {
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
  dirty: boolean;
}) {
  if (!dirty) return null;
  return (
    <div className="sticky bottom-0 left-0 right-0 flex items-center justify-end gap-3 border-t border-gray-100 bg-white px-6 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
      <button
        type="button"
        onClick={onCancel}
        disabled={isSaving}
        className="flex items-center gap-1.5 rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        <RotateCcw className="w-3.5 h-3.5" />
        Cancel
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={isSaving}
        className="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
        Save Changes
      </button>
    </div>
  );
}

function formatDateTime(dateStr?: string, timeZone?: string): string {
  if (!dateStr) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone ?? undefined,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

function toDatetimeLocal(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

function stripHtml(html?: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();
}

// ─── Panel: Event Details ─────────────────────────────────────────────────────

function EventDetailsPanel({
  event,
  onSaved,
}: {
  event: GignologyEvent;
  onSaved: (updated: Partial<GignologyEvent>) => void;
}) {
  const [eventName, setEventName] = useState(event.eventName ?? '');
  const [status, setStatus] = useState(event.status ?? 'Active');
  const [eventType, setEventType] = useState(event.eventType ?? 'Event');
  const [eventDate, setEventDate] = useState(toDatetimeLocal(event.eventDate));
  const [eventEndTime, setEventEndTime] = useState(toDatetimeLocal(event.eventEndTime));
  const [reportTimeTBD, setReportTimeTBD] = useState(event.reportTimeTBD ?? '');
  const [interviewLink, setInterviewLink] = useState(event.interviewLink ?? '');

  const initial = {
    eventName: event.eventName ?? '',
    status: event.status ?? 'Active',
    eventType: event.eventType ?? 'Event',
    eventDate: toDatetimeLocal(event.eventDate),
    eventEndTime: toDatetimeLocal(event.eventEndTime),
    reportTimeTBD: event.reportTimeTBD ?? '',
    interviewLink: event.interviewLink ?? '',
  };

  const dirty =
    eventName !== initial.eventName ||
    status !== initial.status ||
    eventType !== initial.eventType ||
    eventDate !== initial.eventDate ||
    eventEndTime !== initial.eventEndTime ||
    reportTimeTBD !== initial.reportTimeTBD ||
    interviewLink !== initial.interviewLink;

  const reset = () => {
    setEventName(initial.eventName);
    setStatus(initial.status);
    setEventType(initial.eventType);
    setEventDate(initial.eventDate);
    setEventEndTime(initial.eventEndTime);
    setReportTimeTBD(initial.reportTimeTBD);
    setInterviewLink(initial.interviewLink);
  };

  const mutation = useMutation({
    mutationFn: (updates: Partial<GignologyEvent>) =>
      EventApiService.updateEvent(event._id, updates),
    onSuccess: (updated) => {
      toast.success('Event details updated.');
      onSaved(updated);
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update event.'),
  });

  const handleSave = () => {
    const updates: Partial<GignologyEvent> = {};
    if (eventName !== initial.eventName) updates.eventName = eventName;
    if (status !== initial.status) updates.status = status;
    if (eventType !== initial.eventType) updates.eventType = eventType;
    if (eventDate !== initial.eventDate && eventDate) updates.eventDate = new Date(eventDate).toISOString();
    if (eventEndTime !== initial.eventEndTime && eventEndTime) updates.eventEndTime = new Date(eventEndTime).toISOString();
    if (reportTimeTBD !== initial.reportTimeTBD) updates.reportTimeTBD = reportTimeTBD;
    if (interviewLink !== initial.interviewLink) updates.interviewLink = interviewLink;
    mutation.mutate(updates);
  };

  const isInterview = eventType === 'Interview' || eventType === 'Screening Interview';

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        <SectionHeader title="Event Identity" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Event Name" className="sm:col-span-1">
            <TextInput value={eventName} onChange={setEventName} placeholder="Event name" />
          </Field>
          <Field label="Status">
            <SelectInput
              value={status}
              onChange={setStatus}
              options={[
                { value: 'Active', label: 'Active' },
                { value: 'Inactive', label: 'Inactive' },
                { value: 'Cancelled', label: 'Cancelled' },
              ]}
            />
          </Field>
          <Field label="Event Type">
            <SelectInput
              value={eventType}
              onChange={setEventType}
              options={[
                { value: 'Event', label: 'Event' },
                { value: 'Interview', label: 'Interview' },
                { value: 'Screening Interview', label: 'Screening Interview' },
              ]}
            />
          </Field>
        </div>

        <SectionHeader title="Schedule" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Report Time">
            <input
              type="datetime-local"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 w-full"
            />
          </Field>
          <Field label="Est. End Time">
            <input
              type="datetime-local"
              value={eventEndTime}
              onChange={(e) => setEventEndTime(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 w-full"
            />
          </Field>
          <Field label="Time Zone">
            <ReadOnlyValue value={event.timeZone} />
          </Field>
          <Field label="TBD / Time Text">
            <TextInput
              value={reportTimeTBD}
              onChange={setReportTimeTBD}
              placeholder="e.g. TBD or 8:00 PM"
            />
          </Field>
        </div>

        {isInterview && (
          <>
            <SectionHeader title="Interview" />
            <Field label="Interview Link">
              <TextInput value={interviewLink} onChange={setInterviewLink} placeholder="https://..." />
            </Field>
          </>
        )}

        <SectionHeader title="Location" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Venue Name" className="sm:col-span-2">
            <ReadOnlyValue value={event.venueName} />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <ReadOnlyValue value={event.address} />
          </Field>
          <Field label="City">
            <ReadOnlyValue value={event.venueCity} />
          </Field>
          <Field label="State">
            <ReadOnlyValue value={event.venueState} />
          </Field>
          <Field label="Zip">
            <ReadOnlyValue value={event.zip} />
          </Field>
        </div>

        <SectionHeader title="Digital & Integrations" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Event ID">
            <ReadOnlyValue value={event.eventId} />
          </Field>
          <Field label="Event URL">
            <ReadOnlyValue value={event.eventUrl} />
          </Field>
        </div>
      </div>

      <SaveBar onSave={handleSave} onCancel={reset} isSaving={mutation.isPending} dirty={dirty} />
    </div>
  );
}

// ─── Panel: Activities ────────────────────────────────────────────────────────

function ActivitiesPanel({ event }: { event: GignologyEvent }) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } =
    useInfiniteQuery({
      queryKey: ['event-activities', event._id],
      queryFn: ({ pageParam }) =>
        EventApiService.fetchEventActivities(event._id, pageParam as number, 25),
      initialPageParam: 1,
      getNextPageParam: (lastPage) => lastPage.pagination?.next?.page ?? null,
    });

  const activities: EventActivity[] = data?.pages.flatMap((p) => p.data) ?? [];

  function formatActivityDate(dateStr?: string): string {
    if (!dateStr) return '—';
    try {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5">
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3 items-start">
              <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse flex-shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 rounded bg-gray-200 animate-pulse w-1/3" />
                <div className="h-3 rounded bg-gray-200 animate-pulse w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <AlertCircle className="w-8 h-8 mb-2" />
          <p className="text-sm">Failed to load activities.</p>
        </div>
      ) : activities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Activity className="w-8 h-8 mb-2 opacity-40" />
          <p className="text-sm">No activities found for this event.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {activities.map((a, i) => (
            <div key={a._id ?? i} className="flex gap-3 items-start py-3 border-b border-gray-100 last:border-0">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Activity className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {a.activityType ?? 'Activity'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {stripHtml(a.activityDetails ?? a.activityText)}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {a.createdByName ? `${a.createdByName} · ` : ''}
                  {formatActivityDate(a.activityDate)}
                </p>
              </div>
            </div>
          ))}
          {hasNextPage && (
            <div className="pt-4 text-center">
              <button
                type="button"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="text-sm text-blue-600 hover:underline disabled:opacity-50"
              >
                {isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Panel: Content ───────────────────────────────────────────────────────────

function ContentPanel({
  event,
  onSaved,
}: {
  event: GignologyEvent;
  onSaved: (updated: Partial<GignologyEvent>) => void;
}) {
  const [description, setDescription] = useState(stripHtml(event.description) ?? '');
  const [tagsInput, setTagsInput] = useState((event.tags ?? []).join(', '));

  const initial = {
    description: stripHtml(event.description) ?? '',
    tagsInput: (event.tags ?? []).join(', '),
  };

  const dirty = description !== initial.description || tagsInput !== initial.tagsInput;

  const reset = () => {
    setDescription(initial.description);
    setTagsInput(initial.tagsInput);
  };

  const mutation = useMutation({
    mutationFn: (updates: Partial<GignologyEvent>) =>
      EventApiService.updateEvent(event._id, updates),
    onSuccess: (updated) => {
      toast.success('Content updated.');
      onSaved(updated);
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update content.'),
  });

  const handleSave = () => {
    const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean);
    mutation.mutate({ description, tags });
  };

  const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        <SectionHeader title="Description" />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={12}
          placeholder="Enter event description…"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 resize-y"
        />

        <SectionHeader title="Tags" />
        <Field label="Tags (comma-separated)">
          <TextInput value={tagsInput} onChange={setTagsInput} placeholder="e.g. vip, outdoor, weekend" />
        </Field>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span key={tag} className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-medium text-blue-700">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <SaveBar onSave={handleSave} onCancel={reset} isSaving={mutation.isPending} dirty={dirty} />
    </div>
  );
}

// ─── Panel: Attachments ───────────────────────────────────────────────────────

function AttachmentsPanel({
  event,
  imageBaseUrl,
  onSaved,
}: {
  event: GignologyEvent;
  imageBaseUrl: string;
  onSaved: (updated: Partial<GignologyEvent>) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function getImageSrc(): string | null {
    if (previewUrl) return previewUrl;
    if (!event.eventImage && !event.logoUrl) return null;
    const imgFile = event.eventImage || event.logoUrl;
    if (!imgFile) return null;
    if (imgFile.startsWith('http')) return imgFile;
    return `${imageBaseUrl}/${event.venueSlug}/events/${event.eventUrl}/${imgFile}`;
  }

  const mutation = useMutation({
    mutationFn: (updates: Partial<GignologyEvent>) =>
      EventApiService.updateEvent(event._id, updates),
    onSuccess: (updated) => {
      toast.success('Attachments updated.');
      onSaved(updated);
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update attachments.'),
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    setUploading(true);
    try {
      const { filename } = await EventApiService.uploadEventImage(event._id, file);
      mutation.mutate({ eventImage: filename });
    } catch (err) {
      toast.error((err as Error).message || 'Upload failed.');
      setPreviewUrl(null);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const imgSrc = getImageSrc();

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
      <SectionHeader title="Event Image" />
      <div className="flex flex-col items-center gap-4">
        <div className="w-full max-w-md h-48 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center overflow-hidden">
          {uploading ? (
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="text-sm">Uploading…</span>
            </div>
          ) : imgSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imgSrc} alt="Event" className="w-full h-full object-contain" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <ImageIcon className="w-10 h-10 opacity-40" />
              <span className="text-sm">No image uploaded</span>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || mutation.isPending}
          className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <ImageIcon className="w-4 h-4" />
          {imgSrc ? 'Replace Image' : 'Upload Image'}
        </button>
        <p className="text-xs text-gray-400">Accepted: JPG, PNG, GIF, WebP</p>
      </div>

      {event.attachments && event.attachments.length > 0 && (
        <>
          <SectionHeader title="Other Attachments" />
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
            {event.attachments.map((att, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700">
                <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="truncate">{att.filename}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ─── Panel: Positions ─────────────────────────────────────────────────────────

interface PositionDraft {
  positionName: string;
  reportTime: string;
  endTime: string;
  numberPositions: string;
}

const EMPTY_POSITION: PositionDraft = {
  positionName: '',
  reportTime: '',
  endTime: '',
  numberPositions: '',
};

function PositionsPanel({
  event,
  onSaved,
}: {
  event: GignologyEvent;
  onSaved: (updated: Partial<GignologyEvent>) => void;
}) {
  const toPositionDraft = (p: EventPosition): PositionDraft => ({
    positionName: p.positionName ?? '',
    reportTime: p.reportTime ?? '',
    endTime: p.endTime ?? '',
    numberPositions: String(p.numberPositions ?? ''),
  });

  const [positions, setPositions] = useState<PositionDraft[]>(
    (event.positions ?? []).map(toPositionDraft)
  );
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<PositionDraft>(EMPTY_POSITION);

  const initialPositions = (event.positions ?? []).map(toPositionDraft);
  const dirty = JSON.stringify(positions) !== JSON.stringify(initialPositions);

  const reset = () => {
    setPositions(initialPositions);
    setShowAdd(false);
    setDraft(EMPTY_POSITION);
  };

  const mutation = useMutation({
    mutationFn: (updates: Partial<GignologyEvent>) =>
      EventApiService.updateEvent(event._id, updates),
    onSuccess: (updated) => {
      toast.success('Positions updated.');
      onSaved(updated);
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update positions.'),
  });

  const handleSave = () => {
    const mapped: EventPosition[] = positions.map((p) => ({
      positionName: p.positionName,
      reportTime: p.reportTime || undefined,
      endTime: p.endTime || undefined,
      numberPositions: p.numberPositions ? Number(p.numberPositions) : undefined,
    }));
    mutation.mutate({ positions: mapped });
  };

  const addPosition = () => {
    if (!draft.positionName.trim()) return;
    setPositions((prev) => [...prev, draft]);
    setDraft(EMPTY_POSITION);
    setShowAdd(false);
  };

  const removePosition = (idx: number) => {
    setPositions((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        <div className="flex items-center justify-between">
          <SectionHeader title="Additional Positions" />
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 rounded-md bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Position
          </button>
        </div>

        {showAdd && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">New Position</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Position Name" className="col-span-2">
                <TextInput value={draft.positionName} onChange={(v) => setDraft((d) => ({ ...d, positionName: v }))} placeholder="e.g. Event Staff" />
              </Field>
              <Field label="Report Time">
                <TextInput value={draft.reportTime} onChange={(v) => setDraft((d) => ({ ...d, reportTime: v }))} placeholder="e.g. 6:00 PM" />
              </Field>
              <Field label="End Time">
                <TextInput value={draft.endTime} onChange={(v) => setDraft((d) => ({ ...d, endTime: v }))} placeholder="e.g. 11:00 PM" />
              </Field>
              <Field label="# Positions">
                <TextInput value={draft.numberPositions} onChange={(v) => setDraft((d) => ({ ...d, numberPositions: v }))} placeholder="e.g. 5" />
              </Field>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => { setShowAdd(false); setDraft(EMPTY_POSITION); }} className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={addPosition} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">Add</button>
            </div>
          </div>
        )}

        {positions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Briefcase className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm">No additional positions defined.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {positions.map((pos, idx) => (
              <div key={idx} className="flex items-center gap-4 px-4 py-3">
                <Briefcase className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{pos.positionName}</p>
                  <p className="text-xs text-gray-500">
                    {[pos.reportTime && `In: ${pos.reportTime}`, pos.endTime && `Out: ${pos.endTime}`, pos.numberPositions && `× ${pos.numberPositions}`].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <button type="button" onClick={() => removePosition(idx)} className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <SaveBar onSave={handleSave} onCancel={reset} isSaving={mutation.isPending} dirty={dirty} />
    </div>
  );
}

// ─── Panel: Settings ──────────────────────────────────────────────────────────

function ToggleRow({
  label,
  sublabel,
  value,
  onChange,
}: {
  label: string;
  sublabel?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {sublabel && <p className="text-xs text-gray-500">{sublabel}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={clsxm(
          'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none',
          value ? 'bg-blue-600' : 'bg-gray-200'
        )}
      >
        <span
          className={clsxm(
            'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform duration-200',
            value ? 'translate-x-4' : 'translate-x-0'
          )}
        />
      </button>
    </div>
  );
}

function SettingsPanel({
  event,
  onSaved,
}: {
  event: GignologyEvent;
  onSaved: (updated: Partial<GignologyEvent>) => void;
}) {
  const yn = (v?: string | boolean | null): boolean =>
    v === true || v === 'Yes' || v === 'yes';

  const [positionsRequested, setPositionsRequested] = useState(
    String(event.positionsRequested ?? '')
  );
  const [billRate, setBillRate] = useState(String(event.billRate ?? ''));
  const [payRate, setPayRate] = useState(String(event.payRate ?? ''));
  const [payrollPO, setPayrollPO] = useState(event.payrollPurchaseOrder ?? '');
  const [waitListPercentage, setWaitListPercentage] = useState(
    event.waitListPercentage ?? '0'
  );
  const [makePublic, setMakePublic] = useState(yn(event.makePublicAndSendNotification));
  const [sendConfirmation, setSendConfirmation] = useState(yn(event.sendConfirmationToSignUps));
  const [allowPartners, setAllowPartners] = useState(yn(event.allowPartners));
  const [allowEarlyClockIn, setAllowEarlyClockIn] = useState(yn(event.allowEarlyClockin));
  const [enableReminders, setEnableReminders] = useState(yn(event.enableClockInReminders));
  const [notifyCallOff, setNotifyCallOff] = useState(yn(event.notifyCallOff));
  const [reminder24, setReminder24] = useState(yn(event.reminder24Hour));
  const [reminder48, setReminder48] = useState(yn(event.reminder48Hour));
  const [geoFence, setGeoFence] = useState(yn(event.geoFence));
  const [googleMap, setGoogleMap] = useState(yn(event.googleMap));

  const initial = {
    positionsRequested: String(event.positionsRequested ?? ''),
    billRate: String(event.billRate ?? ''),
    payRate: String(event.payRate ?? ''),
    payrollPO: event.payrollPurchaseOrder ?? '',
    waitListPercentage: event.waitListPercentage ?? '0',
    makePublic: yn(event.makePublicAndSendNotification),
    sendConfirmation: yn(event.sendConfirmationToSignUps),
    allowPartners: yn(event.allowPartners),
    allowEarlyClockIn: yn(event.allowEarlyClockin),
    enableReminders: yn(event.enableClockInReminders),
    notifyCallOff: yn(event.notifyCallOff),
    reminder24: yn(event.reminder24Hour),
    reminder48: yn(event.reminder48Hour),
    geoFence: yn(event.geoFence),
    googleMap: yn(event.googleMap),
  };

  const dirty =
    positionsRequested !== initial.positionsRequested ||
    billRate !== initial.billRate ||
    payRate !== initial.payRate ||
    payrollPO !== initial.payrollPO ||
    waitListPercentage !== initial.waitListPercentage ||
    makePublic !== initial.makePublic ||
    sendConfirmation !== initial.sendConfirmation ||
    allowPartners !== initial.allowPartners ||
    allowEarlyClockIn !== initial.allowEarlyClockIn ||
    enableReminders !== initial.enableReminders ||
    notifyCallOff !== initial.notifyCallOff ||
    reminder24 !== initial.reminder24 ||
    reminder48 !== initial.reminder48 ||
    geoFence !== initial.geoFence ||
    googleMap !== initial.googleMap;

  const reset = () => {
    setPositionsRequested(initial.positionsRequested);
    setBillRate(initial.billRate);
    setPayRate(initial.payRate);
    setPayrollPO(initial.payrollPO);
    setWaitListPercentage(initial.waitListPercentage);
    setMakePublic(initial.makePublic);
    setSendConfirmation(initial.sendConfirmation);
    setAllowPartners(initial.allowPartners);
    setAllowEarlyClockIn(initial.allowEarlyClockIn);
    setEnableReminders(initial.enableReminders);
    setNotifyCallOff(initial.notifyCallOff);
    setReminder24(initial.reminder24);
    setReminder48(initial.reminder48);
    setGeoFence(initial.geoFence);
    setGoogleMap(initial.googleMap);
  };

  const mutation = useMutation({
    mutationFn: (updates: Partial<GignologyEvent>) =>
      EventApiService.updateEvent(event._id, updates),
    onSuccess: (updated) => {
      toast.success('Settings updated.');
      onSaved(updated);
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update settings.'),
  });

  const toYN = (b: boolean) => (b ? 'Yes' : 'No');

  const handleSave = () => {
    mutation.mutate({
      positionsRequested: positionsRequested ? Number(positionsRequested) : undefined,
      billRate: billRate ? parseFloat(billRate) : undefined,
      payRate: payRate ? parseFloat(payRate) : undefined,
      payrollPurchaseOrder: payrollPO || undefined,
      waitListPercentage,
      makePublicAndSendNotification: toYN(makePublic),
      sendConfirmationToSignUps: toYN(sendConfirmation),
      allowPartners: allowPartners,
      allowEarlyClockin: toYN(allowEarlyClockIn),
      enableClockInReminders: toYN(enableReminders),
      notifyCallOff: toYN(notifyCallOff),
      reminder24Hour: toYN(reminder24),
      reminder48Hour: toYN(reminder48),
      geoFence: toYN(geoFence),
      googleMap: toYN(googleMap),
    });
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        <SectionHeader title="Event Configuration" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Positions Requested">
            <TextInput value={positionsRequested} onChange={setPositionsRequested} placeholder="e.g. 10" />
          </Field>
          <Field label="Bill Rate ($)">
            <TextInput value={billRate} onChange={setBillRate} placeholder="0.00" />
          </Field>
          <Field label="Pay Rate ($)">
            <TextInput value={payRate} onChange={setPayRate} placeholder="0.00" />
          </Field>
          <Field label="Payroll PO #" className="sm:col-span-2">
            <TextInput value={payrollPO} onChange={setPayrollPO} placeholder="Purchase order reference" />
          </Field>
          <Field label="Waitlist %">
            <SelectInput
              value={waitListPercentage}
              onChange={setWaitListPercentage}
              options={[
                { value: '0', label: 'None' },
                { value: '10', label: '10%' },
                { value: '25', label: '25%' },
                { value: '30', label: '30%' },
                { value: 'Infinity', label: 'Unlimited' },
              ]}
            />
          </Field>
        </div>

        <SectionHeader title="Notifications" />
        <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 px-4">
          <ToggleRow label="Make Public & Send Notification" sublabel="Notify all eligible staff" value={makePublic} onChange={setMakePublic} />
          <ToggleRow label="Send Confirmation to Sign-Ups" value={sendConfirmation} onChange={setSendConfirmation} />
          <ToggleRow label="Notify on Call-Off" value={notifyCallOff} onChange={setNotifyCallOff} />
          <ToggleRow label="24-Hour Reminder" value={reminder24} onChange={setReminder24} />
          <ToggleRow label="48-Hour Reminder" value={reminder48} onChange={setReminder48} />
          <ToggleRow label="Include Google Maps" value={googleMap} onChange={setGoogleMap} />
        </div>

        <SectionHeader title="Access & Clock-In" />
        <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 px-4">
          <ToggleRow label="Allow Partners" value={allowPartners} onChange={setAllowPartners} />
          <ToggleRow label="Allow Early Clock-In" sublabel="Staff may clock in up to 1 hour early" value={allowEarlyClockIn} onChange={setAllowEarlyClockIn} />
          <ToggleRow label="Enable Clock-In Reminders" value={enableReminders} onChange={setEnableReminders} />
          <ToggleRow label="Geofencing" sublabel="Require location check on clock-in" value={geoFence} onChange={setGeoFence} />
        </div>
      </div>
      <SaveBar onSave={handleSave} onCancel={reset} isSaving={mutation.isPending} dirty={dirty} />
    </div>
  );
}

// ─── Panel: Notes ─────────────────────────────────────────────────────────────

function NotesPanel({
  event,
  onSaved,
}: {
  event: GignologyEvent;
  onSaved: (updated: Partial<GignologyEvent>) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteType, setNoteType] = useState('General');

  const notes: EventNote[] = [...(event.notes ?? [])].sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0;
    const db = b.date ? new Date(b.date).getTime() : 0;
    return db - da;
  });

  const mutation = useMutation({
    mutationFn: (updates: Partial<GignologyEvent>) =>
      EventApiService.updateEvent(event._id, updates),
    onSuccess: (updated) => {
      toast.success('Note added.');
      onSaved(updated);
      setNoteText('');
      setNoteType('General');
      setShowAdd(false);
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to add note.'),
  });

  const handleAddNote = () => {
    if (!noteText.trim()) return;
    const newNote: EventNote = {
      type: noteType,
      date: new Date().toISOString(),
      text: noteText,
    };
    mutation.mutate({ notes: [...(event.notes ?? []), newNote] });
  };

  function formatNoteDate(dateStr?: string): string {
    if (!dateStr) return '—';
    try {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
      <div className="flex items-center justify-between">
        <SectionHeader title="Notes" />
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 rounded-md bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Note
        </button>
      </div>

      {showAdd && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">New Note</p>
          <Field label="Note Type">
            <SelectInput
              value={noteType}
              onChange={setNoteType}
              options={[
                { value: 'General', label: 'General' },
                { value: 'Important', label: 'Important' },
                { value: 'Reminder', label: 'Reminder' },
                { value: 'Follow-Up', label: 'Follow-Up' },
              ]}
            />
          </Field>
          <Field label="Note">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
              placeholder="Enter note text…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 resize-none"
            />
          </Field>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => { setShowAdd(false); setNoteText(''); }}
              className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddNote}
              disabled={!noteText.trim() || mutation.isPending}
              className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {mutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
              Save Note
            </button>
          </div>
        </div>
      )}

      {notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <MessageSquare className="w-8 h-8 mb-2 opacity-40" />
          <p className="text-sm">No notes yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map((note, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                  {note.type ?? 'General'}
                </span>
                <span className="text-xs text-gray-400">{formatNoteDate(note.date)}</span>
              </div>
              {(note.firstName || note.lastName) && (
                <p className="text-xs font-medium text-gray-600">
                  {[note.firstName, note.lastName].filter(Boolean).join(' ')}
                </p>
              )}
              <p className="text-sm text-gray-800 whitespace-pre-wrap">
                {stripHtml(note.text)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Panel: Geofencing ────────────────────────────────────────────────────────

function GeofencingPanel({ event }: { event: GignologyEvent }) {
  const loc = event.secondaryLocation;
  const locationName = loc?.locationName ?? event.venueName;
  const address = loc?.address ?? event.address;
  const city = loc?.city ?? event.venueCity;
  const state = loc?.state ?? event.venueState;
  const zip = loc?.zip ?? event.zip;

  const metersToFeet = (m?: number) =>
    m != null ? `${Math.round(m * 3.28084)} ft` : '—';

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
      <SectionHeader title="Location" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Location Name" className="sm:col-span-2">
          <ReadOnlyValue value={locationName} />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <ReadOnlyValue value={address} />
        </Field>
        <Field label="City">
          <ReadOnlyValue value={city} />
        </Field>
        <Field label="State">
          <ReadOnlyValue value={state} />
        </Field>
        <Field label="Zip">
          <ReadOnlyValue value={zip} />
        </Field>
      </div>

      {loc && (
        <>
          <SectionHeader title="Coordinates & Radius" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Latitude">
              <ReadOnlyValue value={loc.latitude} />
            </Field>
            <Field label="Longitude">
              <ReadOnlyValue value={loc.longitude} />
            </Field>
            <Field label="Radius (meters)">
              <ReadOnlyValue value={loc.radius} />
            </Field>
            <Field label="Grace Distance">
              <ReadOnlyValue value={metersToFeet(loc.graceDistanceFeet)} />
            </Field>
          </div>
        </>
      )}

      {!loc && (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <MapPin className="w-8 h-8 mb-2 opacity-40" />
          <p className="text-sm">No geofencing configuration found.</p>
          <p className="text-xs mt-1">Configure secondary location in venue settings.</p>
        </div>
      )}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export interface ClientEventDetailModalProps {
  event: GignologyEvent;
  open: boolean;
  onClose: () => void;
  onEventUpdated?: (updated: Partial<GignologyEvent>) => void;
}

export function ClientEventDetailModal({
  event: initialEvent,
  open,
  onClose,
  onEventUpdated,
}: ClientEventDetailModalProps) {
  const [activePanel, setActivePanel] = useState<PanelId>('details');
  const { data: primaryCompany } = usePrimaryCompany();
  const queryClient = useQueryClient();

  const { data: freshEvent, isLoading } = useQuery({
    queryKey: ['event-detail-modal', initialEvent._id],
    queryFn: () => EventApiService.fetchEventDetail(initialEvent._id),
    enabled: open,
    staleTime: 0,
  });

  const event = freshEvent ?? initialEvent;
  const imageBaseUrl = primaryCompany?.imageUrl ?? '';

  const handleSaved = useCallback(
    (updated: Partial<GignologyEvent>) => {
      queryClient.invalidateQueries({ queryKey: ['event-detail-modal', initialEvent._id] });
      queryClient.invalidateQueries({ queryKey: ['client-events-main'] });
      queryClient.invalidateQueries({ queryKey: ['client-events-count'] });
      onEventUpdated?.(updated);
    },
    [queryClient, initialEvent._id, onEventUpdated]
  );

  const renderPanel = () => {
    if (isLoading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      );
    }
    switch (activePanel) {
      case 'details':
        return <EventDetailsPanel event={event} onSaved={handleSaved} />;
      case 'activities':
        return <ActivitiesPanel event={event} />;
      case 'content':
        return <ContentPanel event={event} onSaved={handleSaved} />;
      case 'attachments':
        return <AttachmentsPanel event={event} imageBaseUrl={imageBaseUrl} onSaved={handleSaved} />;
      case 'positions':
        return <PositionsPanel event={event} onSaved={handleSaved} />;
      case 'settings':
        return <SettingsPanel event={event} onSaved={handleSaved} />;
      case 'notes':
        return <NotesPanel event={event} onSaved={handleSaved} />;
      case 'geofencing':
        return <GeofencingPanel event={event} />;
    }
  };

  const activePanelDef = PANELS.find((p) => p.id === activePanel)!;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl h-[90vh] p-0 flex flex-col overflow-hidden gap-0">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 leading-none">
              {event.eventName}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {activePanelDef.label} &mdash; {formatDateTime(event.eventDate, event.timeZone)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body: sidebar + content */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Sidebar */}
          <nav className="w-52 flex-shrink-0 border-r border-gray-100 bg-gray-50 overflow-y-auto py-2">
            {PANELS.map(({ id, label, Icon }) => {
              const isActive = activePanel === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActivePanel(id)}
                  className={clsxm(
                    'w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-600'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  )}
                >
                  <Icon className={clsxm('w-4 h-4 flex-shrink-0', isActive ? 'text-blue-600' : 'text-gray-400')} />
                  {label}
                </button>
              );
            })}
          </nav>

          {/* Panel content */}
          <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden">
            {renderPanel()}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
