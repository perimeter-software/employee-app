'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  Pencil,
  Mail,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Download,
  MessageSquare,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { clsxm } from '@/lib/utils';
import { baseInstance } from '@/lib/api/instance';
import { usePrimaryCompany } from '@/domains/company/hooks/use-primary-company';
import {
  EmployeeViewModal,
  type StaffingEmployee,
} from '../EmployeeViewModal/EmployeeViewModal';
import { SendMessageModal } from '../SendMessageModal/SendMessageModal';
import { StaffingPoolExportModal } from '../StaffingPoolExportModal/StaffingPoolExportModal';

const IMAGE_SERVER = process.env.NEXT_PUBLIC_IMAGE_SERVER ?? '';

// ─── Types ────────────────────────────────────────────────────────────────────

export type StaffingFilter =
  | 'all'
  | 'active'
  | 'partner'
  | 'loggedIn'
  | 'noLogin'
  | 'inactive'
  | 'terminated'
  | 'dnu';

type TabCounts = Record<StaffingFilter, number>;

type StaffingPartner = {
  _id: string;
  name: string;
  slug: string;
  status: string;
};

type FilterDef = { mode: StaffingFilter; label: string };

const FILTER_DEFS: FilterDef[] = [
  { mode: 'all', label: 'All' },
  { mode: 'active', label: 'Active' },
  { mode: 'partner', label: 'Partner' },
  { mode: 'loggedIn', label: 'Logged In' },
  { mode: 'noLogin', label: 'No Login' },
  { mode: 'inactive', label: 'Inactive' },
  { mode: 'terminated', label: 'Terminated' },
  { mode: 'dnu', label: 'Do Not Use' },
];

const ZERO_COUNTS: TabCounts = {
  all: 0,
  active: 0,
  partner: 0,
  loggedIn: 0,
  noLogin: 0,
  inactive: 0,
  terminated: 0,
  dnu: 0,
};

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function fetchCounts(venueSlug: string): Promise<TabCounts> {
  const res = await baseInstance.get<TabCounts>(
    `venues/${venueSlug}/employees/counts`
  );
  if (!res.success || !res.data) return ZERO_COUNTS;
  return res.data;
}

async function fetchEmployees(venueSlug: string, filterMode: StaffingFilter) {
  const url =
    filterMode === 'all'
      ? `venues/${venueSlug}/employees`
      : `venues/${venueSlug}/employees?filterMode=${filterMode}`;
  const res = await baseInstance.get<StaffingEmployee[]>(url);
  if (!res.success || !res.data) return [];
  return res.data;
}

async function fetchPartners(venueSlug: string) {
  const res = await baseInstance.get<StaffingPartner[]>(
    `venues/${venueSlug}/partners`
  );
  if (!res.success || !res.data) return [];
  return res.data;
}

// ─── Component ────────────────────────────────────────────────────────────────

type Props = {
  venueSlug: string;
  venueName: string;
  venueAttachments?: string[];
  open: boolean;
  onClose: () => void;
};

export const StaffingPoolModal = ({
  venueSlug,
  venueName,
  venueAttachments = [],
  open,
  onClose,
}: Props) => {
  const queryClient = useQueryClient();
  const { data: company } = usePrimaryCompany();
  const imageBase =
    IMAGE_SERVER && company?.uploadPath
      ? `${IMAGE_SERVER}/${company.uploadPath}`
      : null;

  const [filter, setFilter] = useState<StaffingFilter>('all');
  const [search, setSearch] = useState('');
  const [editEmployee, setEditEmployee] = useState<StaffingEmployee | null>(
    null
  );
  const [messageEmployee, setMessageEmployee] =
    useState<StaffingEmployee | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [bulkMessageOpen, setBulkMessageOpen] = useState(false);

  const isPartnerTab = filter === 'partner';

  useEffect(() => {
    if (!open || !venueSlug) return;
    // Only force-refetch on re-opens (first open fetches naturally, no cache yet).
    // setTimeout(0) makes the Strict Mode cleanup cancel the first invocation so
    // refetchQueries only fires once even in development.
    if (!queryClient.getQueryData(['venue-employees-counts', venueSlug]))
      return;
    const timer = setTimeout(() => {
      queryClient.refetchQueries({
        queryKey: ['venue-employees-counts', venueSlug],
      });
      queryClient.refetchQueries({ queryKey: ['venue-employees', venueSlug] });
      queryClient.refetchQueries({ queryKey: ['venue-partners', venueSlug] });
    }, 0);
    return () => clearTimeout(timer);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Single counts query — replaces all background "fetch all" queries.
  const { data: counts = ZERO_COUNTS } = useQuery<TabCounts>({
    queryKey: ['venue-employees-counts', venueSlug],
    queryFn: () => fetchCounts(venueSlug),
    enabled: open && !!venueSlug,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Active-filter employee list (skipped on Partner tab).
  const { data: employees = [], isLoading: isEmployeesLoading } = useQuery<
    StaffingEmployee[]
  >({
    queryKey: ['venue-employees', venueSlug, filter],
    queryFn: () => fetchEmployees(venueSlug, filter),
    enabled: open && !!venueSlug && !isPartnerTab,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Partner list (only fetched when partner tab is active).
  const { data: partners = [], isLoading: isPartnersLoading } = useQuery<
    StaffingPartner[]
  >({
    queryKey: ['venue-partners', venueSlug],
    queryFn: () => fetchPartners(venueSlug),
    enabled: open && !!venueSlug && isPartnerTab,
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const isLoading = isPartnerTab ? isPartnersLoading : isEmployeesLoading;

  // Text search is the only client-side filter remaining.
  const filteredEmployees = useMemo(() => {
    if (!search.trim()) return employees;
    const term = search.toLowerCase();
    return employees.filter(
      (e) =>
        e.firstName?.toLowerCase().includes(term) ||
        e.lastName?.toLowerCase().includes(term) ||
        e.email?.toLowerCase().includes(term)
    );
  }, [employees, search]);

  const filteredPartners = useMemo(() => {
    if (!search.trim()) return partners;
    const term = search.toLowerCase();
    return partners.filter(
      (p) =>
        p.name?.toLowerCase().includes(term) ||
        p.slug?.toLowerCase().includes(term)
    );
  }, [partners, search]);

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-5xl p-0 overflow-hidden max-h-[90vh] flex flex-col">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-slate-100 flex-shrink-0">
            <DialogTitle className="text-base font-semibold">
              Staffing Pool at: {venueName.toUpperCase()}
            </DialogTitle>
          </DialogHeader>

          {/* Filters + search */}
          <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-slate-100 flex-shrink-0">
            <div className="flex flex-wrap gap-1.5">
              {FILTER_DEFS.map(({ mode, label }) => {
                const isActive = filter === mode;
                const count = counts[mode];
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setFilter(mode);
                      setSearch('');
                    }}
                    className={clsxm(
                      'inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium border transition-colors',
                      isActive
                        ? 'bg-appPrimary text-white border-appPrimary'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    )}
                  >
                    {label}
                    <span
                      className={clsxm(
                        'inline-flex items-center justify-center rounded-full w-4 h-4 text-[10px] font-semibold',
                        isActive
                          ? 'bg-white text-appPrimary'
                          : 'bg-slate-200 text-slate-600'
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                title="Bulk Message"
                onClick={() => setBulkMessageOpen(true)}
                disabled={isPartnerTab}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Bulk Message
              </button>
              <button
                type="button"
                title={`Export ${venueName} Staffing Pool`}
                onClick={() => setExportOpen(true)}
                disabled={isPartnerTab}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                <Download className="w-3.5 h-3.5" />
                Export
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search staff…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs rounded-md border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-appPrimary/30 w-48"
              />
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
                Loading…
              </div>
            ) : isPartnerTab ? (
              filteredPartners.length === 0 ? (
                <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
                  {search
                    ? 'No results match your search.'
                    : 'No partners found.'}
                </div>
              ) : (
                <PartnerTable rows={filteredPartners} />
              )
            ) : filteredEmployees.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-slate-400 text-sm">
                {search
                  ? 'No results match your search.'
                  : 'No employees found.'}
              </div>
            ) : (
              <EmployeeTable
                rows={filteredEmployees}
                imageBase={imageBase}
                onEdit={setEditEmployee}
                onMessage={setMessageEmployee}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {editEmployee && (
        <EmployeeViewModal
          employee={editEmployee}
          venueSlug={venueSlug}
          open
          onClose={() => setEditEmployee(null)}
          onSaved={() => {
            queryClient.invalidateQueries({
              queryKey: ['venue-employees-counts', venueSlug],
            });
            queryClient.invalidateQueries({
              queryKey: ['venue-employees', venueSlug],
            });
            setEditEmployee(null);
          }}
        />
      )}

      {messageEmployee && (
        <SendMessageModal
          recipient={messageEmployee}
          venueSlug={venueSlug}
          venueAttachments={venueAttachments}
          open
          onClose={() => setMessageEmployee(null)}
        />
      )}

      <SendMessageModal
        mode="bulk"
        employees={employees}
        venueSlug={venueSlug}
        venueAttachments={venueAttachments}
        open={bulkMessageOpen}
        onClose={() => setBulkMessageOpen(false)}
      />

      <StaffingPoolExportModal
        open={exportOpen}
        venueSlug={venueSlug}
        venueName={venueName}
        filterMode={filter}
        onClose={() => setExportOpen(false)}
      />
    </>
  );
};

// ─── Sub-tables ───────────────────────────────────────────────────────────────

const TH = ({
  children,
  right,
}: {
  children: React.ReactNode;
  right?: boolean;
}) => (
  <th
    className={clsxm(
      'text-xs font-semibold text-slate-500 px-4 py-2.5',
      right ? 'text-right' : 'text-left'
    )}
  >
    {children}
  </th>
);

type SortDir = 'asc' | 'desc';

function SortableTH({
  children,
  sortKey,
  active,
  dir,
  onSort,
}: {
  children: React.ReactNode;
  sortKey: string;
  active: boolean;
  dir: SortDir;
  onSort: (key: string) => void;
}) {
  const Icon = active
    ? dir === 'asc'
      ? ChevronUp
      : ChevronDown
    : ChevronsUpDown;
  return (
    <th className="text-xs font-semibold text-slate-500 px-4 py-2.5 text-left">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 hover:text-slate-800 transition-colors"
      >
        {children}
        <Icon
          className={clsxm(
            'w-3 h-3',
            active ? 'text-appPrimary' : 'text-slate-400'
          )}
        />
      </button>
    </th>
  );
}

function EmployeeAvatar({
  firstName,
  lastName,
  imageSrc,
}: {
  firstName: string;
  lastName: string;
  imageSrc?: string;
}) {
  const [imgError, setImgError] = React.useState(false);
  const initials =
    `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();
  if (imageSrc && !imgError) {
    return (
      <img
        src={imageSrc}
        alt={`${firstName} ${lastName}`}
        className="w-8 h-8 rounded-full object-cover bg-slate-100"
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <span className="w-8 h-8 rounded-full bg-slate-200 text-slate-600 text-xs font-semibold flex items-center justify-center shrink-0">
      {initials}
    </span>
  );
}

function EmployeeTable({
  rows,
  imageBase,
  onEdit,
  onMessage,
}: {
  rows: StaffingEmployee[];
  imageBase: string | null;
  onEdit: (e: StaffingEmployee) => void;
  onMessage: (e: StaffingEmployee) => void;
}) {
  const [sortKey, setSortKey] = useState<string>('lastName');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = (key: string) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = ((a as Record<string, unknown>)[sortKey] as string) ?? '';
      const bv = ((b as Record<string, unknown>)[sortKey] as string) ?? '';
      const cmp = av.localeCompare(bv, undefined, { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir]);

  const sh = (key: string) => ({
    sortKey: key,
    active: sortKey === key,
    dir: sortDir,
    onSort: handleSort,
  });

  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
        <tr>
          <th className="w-10" aria-label="Avatar" />
          <SortableTH {...sh('lastName')}>Last Name</SortableTH>
          <SortableTH {...sh('firstName')}>First Name</SortableTH>
          <SortableTH {...sh('employmentStatus')}>Employment Status</SortableTH>
          <SortableTH {...sh('phone')}>Phone</SortableTH>
          <SortableTH {...sh('email')}>Email</SortableTH>
          <TH right>Actions</TH>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {sorted.map((emp) => (
          <tr key={emp._id} className="hover:bg-slate-50 transition-colors">
            <td className="pl-3 pr-1 py-2">
              <EmployeeAvatar
                firstName={emp.firstName}
                lastName={emp.lastName}
                imageSrc={
                  emp.profileImg?.startsWith('https')
                    ? emp.profileImg
                    : imageBase && emp.profileImg && emp.userId
                      ? `${imageBase}/users/${emp.userId}/photo/${emp.profileImg}`
                      : undefined
                }
              />
            </td>
            <td className="px-4 py-2.5 text-slate-800 font-medium">
              {emp.lastName}
            </td>
            <td className="px-4 py-2.5 text-slate-700">{emp.firstName}</td>
            <td className="px-4 py-2.5">
              <span
                className={clsxm(
                  'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                  emp.employmentStatus === 'Active'
                    ? 'bg-emerald-100 text-emerald-700'
                    : emp.employmentStatus === 'Terminated'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-slate-100 text-slate-600'
                )}
              >
                {emp.employmentStatus || '—'}
              </span>
            </td>
            <td className="px-4 py-2.5 text-slate-600">{emp.phone || '—'}</td>
            <td className="px-4 py-2.5 text-slate-600">{emp.email || '—'}</td>
            <td className="px-4 py-2.5">
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  title="Edit"
                  onClick={() => onEdit(emp)}
                  className="p-1.5 rounded hover:bg-blue-50 text-blue-600 transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  title="Send Message"
                  onClick={() => onMessage(emp)}
                  className="p-1.5 rounded hover:bg-red-50 text-red-500 transition-colors"
                >
                  <Mail className="w-4 h-4" />
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PartnerTable({ rows }: { rows: StaffingPartner[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
        <tr>
          <TH>Name</TH>
          <TH>Slug</TH>
          <TH>Status</TH>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((partner) => (
          <tr key={partner._id} className="hover:bg-slate-50 transition-colors">
            <td className="px-4 py-2.5 text-slate-800 font-medium">
              {partner.name || '—'}
            </td>
            <td className="px-4 py-2.5 text-slate-600">
              {partner.slug || '—'}
            </td>
            <td className="px-4 py-2.5">
              <span
                className={clsxm(
                  'inline-flex px-2 py-0.5 rounded-full text-xs font-medium',
                  partner.status === 'Active'
                    ? 'bg-emerald-100 text-emerald-700'
                    : partner.status === 'Inactive'
                      ? 'bg-slate-100 text-slate-600'
                      : 'bg-amber-100 text-amber-700'
                )}
              >
                {partner.status || '—'}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
