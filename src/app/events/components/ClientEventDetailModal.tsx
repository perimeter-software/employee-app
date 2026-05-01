'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import 'react-quill/dist/quill.snow.css';
import * as DialogPrimitive from '@radix-ui/react-dialog';
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
  Pencil,
  ChevronDown,
} from 'lucide-react';
import {
  useQuery,
  useMutation,
  useInfiniteQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';

import { VenueMap } from '@/domains/venue/components/VenueMap';
import { DialogPortal, DialogOverlay } from '@/components/ui/Dialog';
import { EventApiService } from '@/domains/event/services/event-service';
import type {
  GignologyEvent,
  EventNote,
  EventPosition,
  EventActivity,
} from '@/domains/event/types/event.types';
import { clsxm } from '@/lib/utils';
import { usePrimaryCompany } from '@/domains/company/hooks/use-primary-company';

const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });

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

const PANELS: {
  id: PanelId;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
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
      <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </label>
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
      <span className="text-xs font-bold uppercase tracking-widest text-blue-600">
        {title}
      </span>
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
        {isSaving ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Save className="w-3.5 h-3.5" />
        )}
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
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// ─── Panel: Event Details ─────────────────────────────────────────────────────

interface VenueLocationData {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  locations?: Array<{
    locationName?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    latitude?: number;
    longitude?: number;
    radius?: number;
    graceDistanceFeet?: number;
  }>;
}

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
  const [eventEndTime, setEventEndTime] = useState(
    toDatetimeLocal(event.eventEndTime)
  );
  const [reportTimeTBD, setReportTimeTBD] = useState(event.reportTimeTBD ?? '');
  const [interviewLink, setInterviewLink] = useState(event.interviewLink ?? '');
  const [address, setAddress] = useState(event.address ?? '');
  const [venueCity, setVenueCity] = useState(event.venueCity ?? '');
  const [venueState, setVenueState] = useState(event.venueState ?? '');
  const [zip, setZip] = useState(event.zip ?? '');
  const [secondaryLocName, setSecondaryLocName] = useState(
    event.secondaryLocation?.locationName ?? ''
  );

  const { data: venueData } = useQuery<VenueLocationData>({
    queryKey: ['venue-locations', event.venueSlug],
    queryFn: async () => {
      const res = await fetch(`/api/venues/${event.venueSlug}`);
      const json = (await res.json()) as { data?: VenueLocationData };
      return json.data ?? {};
    },
    enabled: !!event.venueSlug,
    staleTime: 5 * 60 * 1000,
  });

  const venueLocations = venueData?.locations ?? [];

  const handleSecLocChange = (locName: string) => {
    setSecondaryLocName(locName);
    if (!locName) {
      setAddress(venueData?.address ?? event.address ?? '');
      setVenueCity(venueData?.city ?? event.venueCity ?? '');
      setVenueState(venueData?.state ?? event.venueState ?? '');
      setZip(venueData?.zip ?? event.zip ?? '');
    } else {
      const loc = venueLocations.find((l) => l.locationName === locName);
      if (loc) {
        setAddress(loc.address ?? '');
        setVenueCity(loc.city ?? '');
        setVenueState(loc.state ?? '');
        setZip(loc.zip ?? '');
      }
    }
  };

  const initial = {
    eventName: event.eventName ?? '',
    status: event.status ?? 'Active',
    eventType: event.eventType ?? 'Event',
    eventDate: toDatetimeLocal(event.eventDate),
    eventEndTime: toDatetimeLocal(event.eventEndTime),
    reportTimeTBD: event.reportTimeTBD ?? '',
    interviewLink: event.interviewLink ?? '',
    address: event.address ?? '',
    venueCity: event.venueCity ?? '',
    venueState: event.venueState ?? '',
    zip: event.zip ?? '',
    secondaryLocName: event.secondaryLocation?.locationName ?? '',
  };

  const dirty =
    eventName !== initial.eventName ||
    status !== initial.status ||
    eventType !== initial.eventType ||
    eventDate !== initial.eventDate ||
    eventEndTime !== initial.eventEndTime ||
    reportTimeTBD !== initial.reportTimeTBD ||
    interviewLink !== initial.interviewLink ||
    address !== initial.address ||
    venueCity !== initial.venueCity ||
    venueState !== initial.venueState ||
    zip !== initial.zip ||
    secondaryLocName !== initial.secondaryLocName;

  const reset = () => {
    setEventName(initial.eventName);
    setStatus(initial.status);
    setEventType(initial.eventType);
    setEventDate(initial.eventDate);
    setEventEndTime(initial.eventEndTime);
    setReportTimeTBD(initial.reportTimeTBD);
    setInterviewLink(initial.interviewLink);
    setAddress(initial.address);
    setVenueCity(initial.venueCity);
    setVenueState(initial.venueState);
    setZip(initial.zip);
    setSecondaryLocName(initial.secondaryLocName);
  };

  const mutation = useMutation({
    mutationFn: (updates: Partial<GignologyEvent>) =>
      EventApiService.updateEvent(event._id, updates),
    onSuccess: (updated) => {
      toast.success('Event details updated.');
      onSaved(updated);
    },
    onError: (err: Error) =>
      toast.error(err.message || 'Failed to update event.'),
  });

  const handleSave = () => {
    const updates: Partial<GignologyEvent> = {};
    if (eventName !== initial.eventName) updates.eventName = eventName;
    if (status !== initial.status) updates.status = status;
    if (eventType !== initial.eventType) updates.eventType = eventType;
    if (eventDate !== initial.eventDate && eventDate)
      updates.eventDate = new Date(eventDate).toISOString();
    if (eventEndTime !== initial.eventEndTime && eventEndTime)
      updates.eventEndTime = new Date(eventEndTime).toISOString();
    if (reportTimeTBD !== initial.reportTimeTBD)
      updates.reportTimeTBD = reportTimeTBD;
    if (interviewLink !== initial.interviewLink)
      updates.interviewLink = interviewLink;
    if (address !== initial.address) updates.address = address;
    if (venueCity !== initial.venueCity) updates.venueCity = venueCity;
    if (venueState !== initial.venueState) updates.venueState = venueState;
    if (zip !== initial.zip) updates.zip = zip;
    if (secondaryLocName !== initial.secondaryLocName) {
      if (!secondaryLocName) {
        updates.secondaryLocation = undefined;
      } else {
        const loc = venueLocations.find(
          (l) => l.locationName === secondaryLocName
        );
        if (loc) updates.secondaryLocation = loc;
      }
    }
    mutation.mutate(updates);
  };

  const isInterview = eventType === 'Interview';

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        <SectionHeader title="Event Identity" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Event Name" className="sm:col-span-1">
            <TextInput
              value={eventName}
              onChange={setEventName}
              placeholder="Event name"
            />
          </Field>
          <Field label="Status">
            <SelectInput
              value={status}
              onChange={setStatus}
              options={[
                { value: 'Active', label: 'Active' },
                { value: 'Inactive', label: 'Inactive' },
                { value: 'Pending', label: 'Pending' },
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
              aria-label="Report time"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 w-full"
            />
          </Field>
          <Field label="Est. End Time">
            <input
              type="datetime-local"
              value={eventEndTime}
              onChange={(e) => setEventEndTime(e.target.value)}
              aria-label="Estimated end time"
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
              <TextInput
                value={interviewLink}
                onChange={setInterviewLink}
                placeholder="https://..."
              />
            </Field>
          </>
        )}

        <SectionHeader title="Location" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Venue Name" className="sm:col-span-2">
            <ReadOnlyValue value={event.venueName} />
          </Field>
          {venueLocations.length > 0 && (
            <Field label="Secondary Location" className="sm:col-span-2">
              <SelectInput
                value={secondaryLocName}
                onChange={handleSecLocChange}
                options={[
                  { value: '', label: 'Original Venue Location' },
                  ...venueLocations.map((l) => ({
                    value: l.locationName ?? '',
                    label: l.locationName ?? '',
                  })),
                ]}
              />
            </Field>
          )}
          <Field label="Address" className="sm:col-span-2">
            <TextInput
              value={address}
              onChange={setAddress}
              placeholder="Address"
            />
          </Field>
          <Field label="City">
            <TextInput
              value={venueCity}
              onChange={setVenueCity}
              placeholder="City"
            />
          </Field>
          <Field label="State">
            <TextInput
              value={venueState}
              onChange={setVenueState}
              placeholder="State"
            />
          </Field>
          <Field label="Zip">
            <TextInput value={zip} onChange={setZip} placeholder="Zip" />
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

      <SaveBar
        onSave={handleSave}
        onCancel={reset}
        isSaving={mutation.isPending}
        dirty={dirty}
      />
    </div>
  );
}

// ─── Activity: resolved references ───────────────────────────────────────────

interface ResolvedRefs {
  user?: { firstName?: string; lastName?: string };
  applicant?: { firstName?: string; lastName?: string };
  event?: { eventName?: string };
  venue?: { name?: string };
  company?: { name?: string };
  job?: { title?: string };
}

function fullName(obj?: { firstName?: string; lastName?: string }): string {
  if (!obj) return '';
  return [obj.firstName, obj.lastName].filter(Boolean).join(' ');
}

function ActivityDetailPanel({ activity }: { activity: EventActivity }) {
  const action =
    (activity.action as string | undefined) ??
    activity.activityType ??
    'Activity';
  const description =
    (activity.description as string | undefined) ??
    activity.activityDetails ??
    activity.activityText;
  const detail = (activity.detail ?? activity.details) as
    | Record<string, unknown>
    | null
    | undefined;
  const hasDetail = !!detail && Object.keys(detail).length > 0;

  const userId = activity.userId as string | undefined;
  const applicantId = activity.applicantId as string | undefined;
  const eventId = activity.eventId as string | undefined;
  const venueId = activity.venueId as string | undefined;
  const companyId = activity.companyId as string | undefined;
  const jobId = activity.jobId as string | undefined;

  // Build query string only for IDs that are valid ObjectIds
  const isMongoId = (v?: string) => !!v && /^[a-f\d]{24}$/i.test(v);
  const params = new URLSearchParams();
  if (isMongoId(userId)) params.set('userId', userId!);
  if (isMongoId(applicantId) && applicantId !== userId)
    params.set('applicantId', applicantId!);
  if (isMongoId(eventId)) params.set('eventId', eventId!);
  if (isMongoId(venueId)) params.set('venueId', venueId!);
  if (isMongoId(companyId)) params.set('companyId', companyId!);
  if (isMongoId(jobId)) params.set('jobId', jobId!);
  const hasRefs = params.toString() !== '';

  const { data: refs, isLoading: refsLoading } = useQuery<ResolvedRefs>({
    queryKey: ['activity-refs', activity._id, params.toString()],
    queryFn: async () => {
      const res = await fetch(`/api/activities/resolve?${params.toString()}`);
      const json = (await res.json()) as { data?: ResolvedRefs };
      return json.data ?? {};
    },
    enabled: hasRefs,
    staleTime: 5 * 60 * 1000,
  });

  // Resolve display name for the acting user
  const userDisplayName = (() => {
    if (activity.integration === 'Indeed') return 'Indeed';
    const agentFromDetail = (
      detail as Record<string, unknown> | null | undefined
    )?.agent as string | undefined;
    if (agentFromDetail) return agentFromDetail;
    if (refs?.user) return fullName(refs.user) || undefined;
    const userFirst = activity.userFirstName as string | undefined;
    const userLast = activity.userLastName as string | undefined;
    if (userFirst || userLast)
      return [userFirst, userLast].filter(Boolean).join(' ');
    if (activity.createdByName) return activity.createdByName as string;
    if (!userId && !applicantId) return 'Internet';
    return undefined;
  })();

  function formatDate(dateStr?: string): string {
    if (!dateStr) return '—';
    try {
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  }

  const refRows: Array<{
    label: string;
    value: string | undefined;
    loading: boolean;
  }> = [
    {
      label: 'User',
      value: userDisplayName,
      loading: hasRefs && refsLoading && !userDisplayName,
    },
    ...(refs?.applicant && fullName(refs.applicant) !== userDisplayName
      ? [
          {
            label: 'Applicant',
            value: fullName(refs.applicant),
            loading: false,
          },
        ]
      : applicantId && !refs && hasRefs && refsLoading
        ? [{ label: 'Applicant', value: undefined, loading: true }]
        : []),
    ...(refs?.event?.eventName
      ? [{ label: 'Event', value: refs.event.eventName, loading: false }]
      : eventId && !refs && hasRefs && refsLoading
        ? [{ label: 'Event', value: undefined, loading: true }]
        : []),
    ...(refs?.venue?.name
      ? [{ label: 'Venue', value: refs.venue.name, loading: false }]
      : venueId && !refs && hasRefs && refsLoading
        ? [{ label: 'Venue', value: undefined, loading: true }]
        : []),
    ...(refs?.company?.name
      ? [{ label: 'Company', value: refs.company.name, loading: false }]
      : companyId && !refs && hasRefs && refsLoading
        ? [{ label: 'Company', value: undefined, loading: true }]
        : []),
    ...(refs?.job?.title
      ? [{ label: 'Job', value: refs.job.title, loading: false }]
      : jobId && !refs && hasRefs && refsLoading
        ? [{ label: 'Job', value: undefined, loading: true }]
        : []),
  ];

  return (
    <div className="px-4 pb-4 pt-2 bg-gray-50 border-t border-gray-100">
      <div className="space-y-3">
        {/* Core fields + resolved references */}
        <div className="grid grid-cols-[130px_1fr] gap-x-2 gap-y-1 text-sm">
          <span className="font-medium text-gray-500">Action</span>
          <span className="text-gray-800">{action}</span>

          <span className="font-medium text-gray-500">Date</span>
          <span className="text-gray-800">
            {formatDate(activity.activityDate)}
          </span>

          {description && (
            <>
              <span className="font-medium text-gray-500">Description</span>
              <span className="text-gray-800 break-words">
                {stripHtml(description)}
              </span>
            </>
          )}

          {refRows.map(({ label, value, loading }) =>
            loading ? (
              <React.Fragment key={label}>
                <span className="font-medium text-gray-500">{label}</span>
                <span className="flex items-center gap-1.5 text-gray-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span className="text-xs">Loading…</span>
                </span>
              </React.Fragment>
            ) : value ? (
              <React.Fragment key={label}>
                <span className="font-medium text-gray-500">{label}</span>
                <span className="text-gray-800">{value}</span>
              </React.Fragment>
            ) : null
          )}
        </div>

        {/* Nested detail object */}
        {hasDetail && (
          <div className="pt-2 border-t border-gray-200">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-2">
              Details
            </p>
            <NestedDetail data={detail!} depth={0} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Activity detail: recursive nested renderer ───────────────────────────────

function NestedDetail({
  data,
  depth = 0,
}: {
  data: Record<string, unknown>;
  depth?: number;
}) {
  const entries = Object.entries(data).filter(
    ([, v]) => v !== null && v !== undefined && v !== ''
  );
  if (entries.length === 0) return null;
  return (
    <div
      className={clsxm(
        'space-y-1.5',
        depth > 0 && 'pl-3 border-l-2 border-blue-100 mt-1'
      )}
    >
      {entries.map(([key, val]) => {
        if (Array.isArray(val)) {
          const arr = val as unknown[];
          return (
            <div key={key} className="mt-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                {key}{' '}
                <span className="font-normal normal-case text-gray-400">
                  ({arr.length})
                </span>
              </p>
              <div className="pl-3 border-l-2 border-blue-100 space-y-2">
                {arr.map((item, i) =>
                  typeof item === 'object' && item !== null ? (
                    <div key={i} className="pt-1">
                      <span className="text-xs text-gray-400 font-medium">
                        #{i + 1}
                      </span>
                      <NestedDetail
                        data={item as Record<string, unknown>}
                        depth={depth + 1}
                      />
                    </div>
                  ) : (
                    <span key={i} className="block text-sm text-gray-800">
                      {String(item)}
                    </span>
                  )
                )}
              </div>
            </div>
          );
        }
        if (typeof val === 'object') {
          const obj = val as Record<string, unknown>;
          if (Object.keys(obj).length === 0) return null;
          return (
            <div key={key} className="mt-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                {key}
              </p>
              <NestedDetail data={obj} depth={depth + 1} />
            </div>
          );
        }
        const strVal = String(val);
        return (
          <div key={key} className="flex gap-2 text-sm leading-snug">
            <span className="font-medium text-gray-500 min-w-[130px] flex-shrink-0 pt-px">
              {key}
            </span>
            {key === 'messageBody' ? (
              <div
                className="text-gray-800 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: strVal }}
              />
            ) : (
              <span className="text-gray-800 break-all">{strVal}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Panel: Activities ────────────────────────────────────────────────────────

function ActivitiesPanel({ event }: { event: GignologyEvent }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery({
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
        <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
          {activities.map((a, i) => {
            const rowId = a._id ?? String(i);
            const isExpanded = expandedId === rowId;
            const action =
              (a.action as string | undefined) ?? a.activityType ?? 'Activity';
            const description =
              (a.description as string | undefined) ??
              a.activityDetails ??
              a.activityText;
            return (
              <div key={rowId}>
                {/* Row header — clickable */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : rowId)}
                  className="w-full flex gap-3 items-start px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Activity className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {action}
                    </p>
                    {description && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                        {stripHtml(description)}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {a.createdByName ? `${a.createdByName} · ` : ''}
                      {formatActivityDate(a.activityDate)}
                    </p>
                  </div>
                  <ChevronDown
                    className={clsxm(
                      'w-4 h-4 text-gray-400 flex-shrink-0 mt-1 transition-transform duration-200',
                      isExpanded && 'rotate-180'
                    )}
                  />
                </button>

                {/* Expanded detail */}
                {isExpanded && <ActivityDetailPanel activity={a} />}
              </div>
            );
          })}
          {hasNextPage && (
            <div className="px-4 py-3 text-center">
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

const QUILL_MODULES = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link'],
    ['clean'],
  ],
};

function ContentPanel({
  event,
  onSaved,
}: {
  event: GignologyEvent;
  onSaved: (updated: Partial<GignologyEvent>) => void;
}) {
  const [description, setDescription] = useState(event.description ?? '');
  const [tagsInput, setTagsInput] = useState((event.tags ?? []).join(', '));

  const initial = {
    description: event.description ?? '',
    tagsInput: (event.tags ?? []).join(', '),
  };

  const dirty =
    description !== initial.description || tagsInput !== initial.tagsInput;

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
    onError: (err: Error) =>
      toast.error(err.message || 'Failed to update content.'),
  });

  const handleSave = () => {
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    mutation.mutate({ description, tags });
  };

  const tags = tagsInput
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        <SectionHeader title="Description" />
        <div className="rounded-md border border-gray-300 overflow-hidden">
          <ReactQuill
            theme="snow"
            value={description}
            onChange={setDescription}
            modules={QUILL_MODULES}
            className="[&_.ql-editor]:min-h-[200px] [&_.ql-editor]:text-sm [&_.ql-toolbar]:border-0 [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-gray-200 [&_.ql-container]:border-0"
          />
        </div>

        <SectionHeader title="Tags" />
        <Field label="Tags (comma-separated)">
          <TextInput
            value={tagsInput}
            onChange={setTagsInput}
            placeholder="e.g. vip, outdoor, weekend"
          />
        </Field>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-medium text-blue-700"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <SaveBar
        onSave={handleSave}
        onCancel={reset}
        isSaving={mutation.isPending}
        dirty={dirty}
      />
    </div>
  );
}

// ─── Panel: Attachments ───────────────────────────────────────────────────────

const ATTACHMENT_TYPES = [
  'Flyer',
  'Contract',
  'Waiver',
  'Schedule',
  'Map',
  'Other',
];

function AttachmentsPanel({
  event,
  imageBaseUrl,
  onSaved,
}: {
  event: GignologyEvent;
  imageBaseUrl: string;
  onSaved: (updated: Partial<GignologyEvent>) => void;
}) {
  // — Event image —
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // — Additional attachment upload form —
  const attFileInputRef = useRef<HTMLInputElement>(null);
  const [showAttForm, setShowAttForm] = useState(false);
  const [attTitle, setAttTitle] = useState('');
  const [attType, setAttType] = useState('');
  const [attFile, setAttFile] = useState<File | null>(null);
  const [attUploading, setAttUploading] = useState(false);

  function getImageSrc(): string | null {
    if (previewUrl) return previewUrl;
    const imgFile = event.eventImage || event.logoUrl;
    if (!imgFile) return null;
    if (imgFile.startsWith('http')) return imgFile;
    return `${imageBaseUrl}/${event.venueSlug}/events/${event.eventUrl}/${imgFile}`;
  }

  const imageMutation = useMutation({
    mutationFn: (updates: Partial<GignologyEvent>) =>
      EventApiService.updateEvent(event._id, updates),
    onSuccess: (updated) => {
      toast.success('Event image updated.');
      onSaved(updated);
    },
    onError: (err: Error) =>
      toast.error(err.message || 'Failed to update image.'),
  });

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    setImageUploading(true);
    try {
      const { filename } = await EventApiService.uploadEventImage(
        event._id,
        file
      );
      imageMutation.mutate({ eventImage: filename });
    } catch (err) {
      toast.error((err as Error).message || 'Upload failed.');
      setPreviewUrl(null);
    } finally {
      setImageUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const handleAttachmentUpload = async () => {
    if (!attFile || !attType) return;
    setAttUploading(true);
    try {
      const { filename } = await EventApiService.uploadEventImage(
        event._id,
        attFile
      );
      const docType = filename.split('.').pop() ?? '';
      const newAtt = {
        filename,
        title: attTitle.trim() || filename,
        type: attType,
        docType,
        uploadDate: new Date().toISOString(),
      };
      const existing = event.attachments ?? [];
      let newAttachments;
      if (attType !== 'Other') {
        const idx = existing.findIndex((a) => a.type === attType);
        newAttachments =
          idx > -1
            ? existing.map((a, i) => (i === idx ? newAtt : a))
            : [...existing, newAtt];
      } else {
        newAttachments = [...existing, newAtt];
      }
      const updated = await EventApiService.updateEvent(event._id, {
        attachments: newAttachments,
      });
      toast.success('Attachment uploaded.');
      onSaved(updated);
      setAttTitle('');
      setAttType('');
      setAttFile(null);
      setShowAttForm(false);
    } catch (err) {
      toast.error((err as Error).message || 'Upload failed.');
    } finally {
      setAttUploading(false);
      if (attFileInputRef.current) attFileInputRef.current.value = '';
    }
  };

  const handleDeleteAttachment = async (idx: number) => {
    const newAttachments = (event.attachments ?? []).filter(
      (_, i) => i !== idx
    );
    try {
      const updated = await EventApiService.updateEvent(event._id, {
        attachments: newAttachments,
      });
      toast.success('Attachment removed.');
      onSaved(updated);
    } catch (err) {
      toast.error((err as Error).message || 'Failed to remove attachment.');
    }
  };

  const imgSrc = getImageSrc();
  const attachments = event.attachments ?? [];

  return (
    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
      {/* Event image */}
      <SectionHeader title="Event Image" />
      <div className="flex flex-col items-center gap-4">
        <div className="w-full max-w-md h-48 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center overflow-hidden">
          {imageUploading ? (
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="text-sm">Uploading…</span>
            </div>
          ) : imgSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imgSrc}
              alt="Event"
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <ImageIcon className="w-10 h-10 opacity-40" />
              <span className="text-sm">No image uploaded</span>
            </div>
          )}
        </div>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          aria-label="Upload event image"
          className="hidden"
          onChange={handleImageChange}
        />
        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          disabled={imageUploading || imageMutation.isPending}
          className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <ImageIcon className="w-4 h-4" />
          {imgSrc ? 'Replace Image' : 'Upload Image'}
        </button>
        <p className="text-xs text-gray-400">Accepted: JPG, PNG, GIF, WebP</p>
      </div>

      {/* Additional attachments — always visible */}
      <div className="flex items-center justify-between">
        <SectionHeader title="Additional Attachments" />
        <button
          type="button"
          onClick={() => setShowAttForm(true)}
          className="flex items-center gap-1.5 rounded-md bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Attachment
        </button>
      </div>

      {showAttForm && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
            Upload Attachment
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Attachment Type" className="col-span-1">
              <SelectInput
                value={attType}
                onChange={setAttType}
                options={[
                  { value: '', label: 'Select type…' },
                  ...ATTACHMENT_TYPES.map((t) => ({ value: t, label: t })),
                ]}
              />
            </Field>
            <Field label="Title (optional)">
              <TextInput
                value={attTitle}
                onChange={setAttTitle}
                placeholder="e.g. Event Flyer 2025"
              />
            </Field>
          </div>
          <Field label="File">
            <div className="flex items-center gap-3">
              <input
                ref={attFileInputRef}
                type="file"
                aria-label="Select attachment file"
                className="hidden"
                onChange={(e) => setAttFile(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => attFileInputRef.current?.click()}
                disabled={attUploading}
                className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <Paperclip className="w-4 h-4" />
                {attFile ? attFile.name : 'Choose file…'}
              </button>
              {attFile && (
                <button
                  type="button"
                  aria-label="Clear selected file"
                  onClick={() => {
                    setAttFile(null);
                    if (attFileInputRef.current)
                      attFileInputRef.current.value = '';
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </Field>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setShowAttForm(false);
                setAttTitle('');
                setAttType('');
                setAttFile(null);
              }}
              className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAttachmentUpload}
              disabled={!attFile || !attType || attUploading}
              className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {attUploading && <Loader2 className="w-3 h-3 animate-spin" />}
              Upload
            </button>
          </div>
        </div>
      )}

      {attachments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-gray-400">
          <Paperclip className="w-7 h-7 mb-2 opacity-40" />
          <p className="text-sm">No additional attachments.</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {attachments.map((att, i) => (
            <li
              key={i}
              className="flex items-center gap-3 px-4 py-3 text-sm text-gray-700"
            >
              <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium">
                  {att.title ?? att.filename}
                </p>
                {att.title && att.title !== att.filename && (
                  <p className="text-xs text-gray-400 truncate">
                    {att.filename}
                  </p>
                )}
              </div>
              {att.type && (
                <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 flex-shrink-0">
                  {att.type}
                </span>
              )}
              {att.docType && (
                <span className="text-xs text-gray-400 uppercase flex-shrink-0">
                  {att.docType}
                </span>
              )}
              <button
                type="button"
                onClick={() => handleDeleteAttachment(i)}
                aria-label={`Remove attachment ${att.title ?? att.filename}`}
                className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 flex-shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
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
  billRate: string;
  payRate: string;
  makePublic: boolean;
}

const EMPTY_POSITION: PositionDraft = {
  positionName: '',
  reportTime: '',
  endTime: '',
  numberPositions: '',
  billRate: '',
  payRate: '',
  makePublic: false,
};

function PositionForm({
  draft,
  onChange,
  onSubmit,
  onCancel,
  isEdit,
  isPending,
}: {
  draft: PositionDraft;
  onChange: (d: PositionDraft) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isEdit: boolean;
  isPending?: boolean;
}) {
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
        {isEdit ? 'Edit Position' : 'New Position'}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Position Name" className="col-span-2">
          <TextInput
            value={draft.positionName}
            onChange={(v) => onChange({ ...draft, positionName: v })}
            placeholder="e.g. Event Staff"
          />
        </Field>
        <Field label="Report Time">
          <input
            type="datetime-local"
            value={draft.reportTime}
            onChange={(e) => onChange({ ...draft, reportTime: e.target.value })}
            aria-label="Position report time"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 w-full bg-white"
          />
        </Field>
        <Field label="End Time">
          <input
            type="datetime-local"
            value={draft.endTime}
            onChange={(e) => onChange({ ...draft, endTime: e.target.value })}
            aria-label="Position end time"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 w-full bg-white"
          />
        </Field>
        <Field label="# Positions" className="col-span-2">
          <input
            type="number"
            min="0"
            value={draft.numberPositions}
            onChange={(e) =>
              onChange({ ...draft, numberPositions: e.target.value })
            }
            placeholder="e.g. 5"
            aria-label="Number of positions"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 w-full"
          />
        </Field>
        <Field label="Pay Rate ($)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={draft.payRate}
            onChange={(e) => onChange({ ...draft, payRate: e.target.value })}
            placeholder="0.00"
            aria-label="Pay rate"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 w-full"
          />
        </Field>
        <Field label="Bill Rate ($)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={draft.billRate}
            onChange={(e) => onChange({ ...draft, billRate: e.target.value })}
            placeholder="0.00"
            aria-label="Bill rate"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 w-full"
          />
        </Field>
        <div className="col-span-2 flex items-center justify-between rounded-md border border-gray-200 bg-white px-3 py-2">
          <span className="text-sm text-gray-700">Make Public for Sign-Up</span>
          <button
            type="button"
            onClick={() =>
              onChange({ ...draft, makePublic: !draft.makePublic })
            }
            aria-label="Toggle make public"
            aria-pressed={draft.makePublic}
            className={clsxm(
              'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none',
              draft.makePublic ? 'bg-blue-600' : 'bg-gray-200'
            )}
          >
            <span
              className={clsxm(
                'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow ring-0 transition-transform duration-200',
                draft.makePublic ? 'translate-x-4' : 'translate-x-0'
              )}
            />
          </button>
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!draft.positionName.trim() || isPending}
          className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isEdit ? 'Update' : 'Add'}
        </button>
      </div>
    </div>
  );
}

function PositionsPanel({
  event,
  onSaved,
}: {
  event: GignologyEvent;
  onSaved: (updated: Partial<GignologyEvent>) => void;
}) {
  const toPositionDraft = (p: EventPosition): PositionDraft => ({
    positionName: p.positionName ?? '',
    reportTime: toDatetimeLocal(p.reportTime),
    endTime: toDatetimeLocal(p.endTime),
    numberPositions: String(p.numberPositions ?? ''),
    billRate: String(p.billRate ?? ''),
    payRate: String(p.payRate ?? ''),
    makePublic: p.makePublic ?? false,
  });

  const initialPositions = (event.positions ?? []).map(toPositionDraft);
  const [positions, setPositions] = useState<PositionDraft[]>(initialPositions);
  const [showForm, setShowForm] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<PositionDraft>(EMPTY_POSITION);

  const dirty = JSON.stringify(positions) !== JSON.stringify(initialPositions);

  const reset = () => {
    setPositions(initialPositions);
    setShowForm(false);
    setEditingIndex(null);
    setDraft(EMPTY_POSITION);
  };

  const openAdd = () => {
    setEditingIndex(null);
    setDraft(EMPTY_POSITION);
    setShowForm(true);
  };

  const openEdit = (idx: number) => {
    setEditingIndex(idx);
    setDraft(positions[idx]);
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingIndex(null);
    setDraft(EMPTY_POSITION);
  };

  const submitForm = () => {
    if (!draft.positionName.trim()) return;
    if (editingIndex !== null) {
      setPositions((prev) =>
        prev.map((p, i) => (i === editingIndex ? draft : p))
      );
    } else {
      setPositions((prev) => [...prev, draft]);
    }
    cancelForm();
  };

  const removePosition = (idx: number) => {
    setPositions((prev) => prev.filter((_, i) => i !== idx));
    if (editingIndex === idx) cancelForm();
  };

  const mutation = useMutation({
    mutationFn: (updates: Partial<GignologyEvent>) =>
      EventApiService.updateEvent(event._id, updates),
    onSuccess: (updated) => {
      toast.success('Positions updated.');
      onSaved(updated);
    },
    onError: (err: Error) =>
      toast.error(err.message || 'Failed to update positions.'),
  });

  const handleSave = () => {
    const mapped: EventPosition[] = positions.map((p) => ({
      positionName: p.positionName,
      reportTime: p.reportTime
        ? new Date(p.reportTime).toISOString()
        : undefined,
      endTime: p.endTime ? new Date(p.endTime).toISOString() : undefined,
      numberPositions: p.numberPositions
        ? Number(p.numberPositions)
        : undefined,
      billRate: p.billRate ? parseFloat(p.billRate) : undefined,
      payRate: p.payRate ? parseFloat(p.payRate) : undefined,
      makePublic: p.makePublic,
    }));
    mutation.mutate({ positions: mapped });
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        <div className="flex items-center justify-between">
          <SectionHeader title="Additional Positions" />
          <button
            type="button"
            onClick={openAdd}
            className="flex items-center gap-1.5 rounded-md bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Position
          </button>
        </div>

        {showForm && (
          <PositionForm
            draft={draft}
            onChange={setDraft}
            onSubmit={submitForm}
            onCancel={cancelForm}
            isEdit={editingIndex !== null}
          />
        )}

        {positions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Briefcase className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm">No additional positions defined.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            {positions.map((pos, idx) => (
              <div
                key={idx}
                className={clsxm(
                  'flex items-center gap-4 px-4 py-3 transition-colors',
                  editingIndex === idx ? 'bg-blue-50' : 'hover:bg-gray-50'
                )}
              >
                <Briefcase className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {pos.positionName}
                  </p>
                  <p className="text-xs text-gray-500">
                    {[
                      pos.reportTime &&
                        `In: ${new Date(pos.reportTime).toLocaleString()}`,
                      pos.endTime &&
                        `Out: ${new Date(pos.endTime).toLocaleString()}`,
                      pos.numberPositions && `× ${pos.numberPositions}`,
                      pos.billRate && `Bill: $${pos.billRate}`,
                      pos.payRate && `Pay: $${pos.payRate}`,
                      pos.makePublic && 'Public',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(idx)}
                  aria-label={`Edit position ${pos.positionName}`}
                  className="p-1.5 rounded-md text-gray-400 hover:text-blue-500 hover:bg-blue-50"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => removePosition(idx)}
                  aria-label={`Remove position ${pos.positionName}`}
                  className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <SaveBar
        onSave={handleSave}
        onCancel={reset}
        isSaving={mutation.isPending}
        dirty={dirty}
      />
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
        aria-label={`Toggle ${label}`}
        aria-pressed={value}
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
  const [makePublic, setMakePublic] = useState(
    yn(event.makePublicAndSendNotification)
  );
  const [sendConfirmation, setSendConfirmation] = useState(
    yn(event.sendConfirmationToSignUps)
  );
  const [allowPartners, setAllowPartners] = useState(yn(event.allowPartners));
  const [allowEarlyClockIn, setAllowEarlyClockIn] = useState(
    yn(event.allowEarlyClockin)
  );
  const [enableReminders, setEnableReminders] = useState(
    yn(event.enableClockInReminders)
  );
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
    onError: (err: Error) =>
      toast.error(err.message || 'Failed to update settings.'),
  });

  const toYN = (b: boolean) => (b ? 'Yes' : 'No');

  const handleSave = () => {
    mutation.mutate({
      positionsRequested: positionsRequested
        ? Number(positionsRequested)
        : undefined,
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
            <input
              type="number"
              min="0"
              value={positionsRequested}
              onChange={(e) => setPositionsRequested(e.target.value)}
              placeholder="e.g. 10"
              aria-label="Positions requested"
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 w-full"
            />
          </Field>
          <Field label="Bill Rate ($)">
            <TextInput
              value={billRate}
              onChange={setBillRate}
              placeholder="0.00"
            />
          </Field>
          <Field label="Pay Rate ($)">
            <TextInput
              value={payRate}
              onChange={setPayRate}
              placeholder="0.00"
            />
          </Field>
          <Field label="Payroll PO #" className="sm:col-span-2">
            <TextInput
              value={payrollPO}
              onChange={setPayrollPO}
              placeholder="Purchase order reference"
            />
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
          <ToggleRow
            label="Make Public & Send Notification"
            sublabel="Notify all eligible staff"
            value={makePublic}
            onChange={setMakePublic}
          />
          <ToggleRow
            label="Send Confirmation to Sign-Ups"
            value={sendConfirmation}
            onChange={setSendConfirmation}
          />
          <ToggleRow
            label="Notify on Call-Off"
            value={notifyCallOff}
            onChange={setNotifyCallOff}
          />
          <ToggleRow
            label="24-Hour Reminder"
            value={reminder24}
            onChange={setReminder24}
          />
          <ToggleRow
            label="48-Hour Reminder"
            value={reminder48}
            onChange={setReminder48}
          />
          <ToggleRow
            label="Include Google Maps"
            value={googleMap}
            onChange={setGoogleMap}
          />
        </div>

        <SectionHeader title="Access & Clock-In" />
        <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 px-4">
          <ToggleRow
            label="Allow Partners"
            value={allowPartners}
            onChange={setAllowPartners}
          />
          <ToggleRow
            label="Allow Early Clock-In"
            sublabel="Staff may clock in up to 1 hour early"
            value={allowEarlyClockIn}
            onChange={setAllowEarlyClockIn}
          />
          <ToggleRow
            label="Enable Clock-In Reminders"
            value={enableReminders}
            onChange={setEnableReminders}
          />
          <ToggleRow
            label="Geofencing"
            sublabel="Require location check on clock-in"
            value={geoFence}
            onChange={setGeoFence}
          />
        </div>
      </div>
      <SaveBar
        onSave={handleSave}
        onCancel={reset}
        isSaving={mutation.isPending}
        dirty={dirty}
      />
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
    const plain = stripHtml(noteText).trim();
    if (!plain) return;
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
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
            New Note
          </p>
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
            <div className="rounded-md border border-gray-300 overflow-hidden bg-white">
              <ReactQuill
                theme="snow"
                value={noteText}
                onChange={setNoteText}
                modules={QUILL_MODULES}
                className="[&_.ql-editor]:min-h-[120px] [&_.ql-editor]:text-sm [&_.ql-toolbar]:border-0 [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-gray-200 [&_.ql-container]:border-0"
              />
            </div>
          </Field>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setShowAdd(false);
                setNoteText('');
              }}
              className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddNote}
              disabled={!stripHtml(noteText).trim() || mutation.isPending}
              className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {mutation.isPending && (
                <Loader2 className="w-3 h-3 animate-spin" />
              )}
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
            <div
              key={i}
              className="rounded-xl border border-gray-200 bg-white p-4 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                  {note.type ?? 'General'}
                </span>
                <span className="text-xs text-gray-400">
                  {formatNoteDate(note.date)}
                </span>
              </div>
              {(note.firstName || note.lastName) && (
                <p className="text-xs font-medium text-gray-600">
                  {[note.firstName, note.lastName].filter(Boolean).join(' ')}
                </p>
              )}
              <div
                className="text-sm text-gray-800 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: note.text ?? '' }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Panel: Geofencing ────────────────────────────────────────────────────────

function GeofencingPanel({ event }: { event: GignologyEvent }) {
  const [venueLocation, setVenueLocation] = useState<{
    latitude: number;
    longitude: number;
    name: string;
    address: string;
    geoFenceRadius: number;
    graceDistance?: number;
  } | null>(null);
  const [isLoadingVenue, setIsLoadingVenue] = useState(false);

  const secLoc = event.secondaryLocation;
  const secLocHasCoords =
    secLoc?.longitude != null &&
    secLoc?.latitude != null &&
    !isNaN(secLoc.longitude) &&
    !isNaN(secLoc.latitude);

  useEffect(() => {
    if (secLocHasCoords || !event.venueSlug || event.geoFence !== 'Yes') return;
    setIsLoadingVenue(true);
    fetch(`/api/venues/${event.venueSlug}/location`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.data) setVenueLocation(data.data);
      })
      .catch(() => {})
      .finally(() => setIsLoadingVenue(false));
  }, [event.venueSlug, event.geoFence, secLocHasCoords]);

  const loc = secLocHasCoords
    ? secLoc
    : venueLocation
    ? {
        locationName: venueLocation.name,
        address: venueLocation.address,
        latitude: venueLocation.latitude,
        longitude: venueLocation.longitude,
        radius: venueLocation.geoFenceRadius,
        graceDistanceFeet: venueLocation.graceDistance != null
          ? venueLocation.graceDistance / 0.3048
          : undefined,
      }
    : secLoc;

  const locationName = loc?.locationName ?? event.venueName;
  const address = loc?.address ?? event.address;
  const city = secLoc?.city ?? event.venueCity;
  const state = secLoc?.state ?? event.venueState;
  const zip = secLoc?.zip ?? event.zip;

  const hasCoords =
    loc?.longitude != null &&
    loc?.latitude != null &&
    !isNaN(loc.longitude) &&
    !isNaN(loc.latitude);

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
              <ReadOnlyValue value={loc.graceDistanceFeet != null ? `${Math.round(loc.graceDistanceFeet)} ft` : '—'} />
            </Field>
          </div>
        </>
      )}

      {hasCoords && loc ? (
        <>
          <SectionHeader title="Map Preview" />
          <div className="rounded-xl overflow-hidden border border-gray-200 h-64">
            <VenueMap
              coordinates={[loc.longitude!, loc.latitude!]}
              radius={loc.radius}
              graceDistance={loc.graceDistanceFeet != null ? loc.graceDistanceFeet * 0.3048 : undefined}
            />
          </div>
        </>
      ) : isLoadingVenue ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <MapPin className="w-8 h-8 mb-2 opacity-40" />
          <p className="text-sm">No geofencing configuration found.</p>
          <p className="text-xs mt-1">
            Configure secondary location in venue settings.
          </p>
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
      queryClient.invalidateQueries({
        queryKey: ['event-detail-modal', initialEvent._id],
      });
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
        return (
          <AttachmentsPanel
            event={event}
            imageBaseUrl={imageBaseUrl}
            onSaved={handleSaved}
          />
        );
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
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-5xl h-[90vh] translate-x-[-50%] translate-y-[-50%] flex flex-col overflow-hidden gap-0 border bg-white shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 leading-none">
                {event.eventName}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {activePanelDef.label} &mdash;{' '}
                {formatDateTime(event.eventDate, event.timeZone)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
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
                    <Icon
                      className={clsxm(
                        'w-4 h-4 flex-shrink-0',
                        isActive ? 'text-blue-600' : 'text-gray-400'
                      )}
                    />
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
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}
