'use client';

import { NextPage } from 'next';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  Eye,
  EyeOff,
  FileText,
  LayoutGrid,
  Receipt,
  Search,
  Table as TableIcon,
  TrendingUp,
  X,
} from 'lucide-react';
import Layout from '@/components/layout/Layout';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePageAuth } from '@/domains/shared/hooks/use-page-auth';
import {
  AuthErrorState,
  AuthLoadingState,
  UnauthenticatedState,
} from '@/components/shared/PageProtection';
import { usePrimaryCompany } from '@/domains/company/hooks/use-primary-company';
import { useCurrentUser } from '@/domains/user';
import { usePaycheckStubs } from '@/domains/paycheck-stubs';
import { useEmployeePayrollHistory } from '@/domains/payroll';
import { clsxm } from '@/lib/utils';
import type {
  DirectDeposit,
  EmployeePayrollBatch,
  SubmittedEventApplicant,
  SubmittedJobTimecard,
} from '@/domains/payroll/types/payroll.types';
import type { PaycheckStub } from '@/domains/paycheck-stubs';

// ── Types ──────────────────────────────────────────────────────────────────────

type ViewMode = 'table' | 'card' | 'paystubs';
type StatusFilter = 'all' | 'current' | 'past' | 'custom';
type SortField =
  | 'startDate'
  | 'checkDate'
  | 'hours'
  | 'grossPay'
  | 'deductions'
  | 'netPay';
type SortDir = 'asc' | 'desc';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCurrency(val: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(val);
}

/** Sum deductions from payroll voucher when available, otherwise fall back to totalTaxes */
function getBatchDeductions(batch: EmployeePayrollBatch): number {
  if (batch.payrollVoucher?.deductions?.length) {
    return batch.payrollVoucher.deductions.reduce(
      (s, item) => s + Math.abs(item.amount),
      0
    );
  }
  return batch.totalTaxes;
}

function getNetPay(batch: EmployeePayrollBatch): number {
  if (batch.totalNetPay) return batch.totalNetPay;
  return batch.totalGrossPay - getBatchDeductions(batch);
}

/** Parse a date-only string (YYYY-MM-DD) as local midnight so date-fns formats the correct calendar day */
function parseUTC(dateStr: string): Date {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatPeriod(start: string, end: string) {
  const s = parseUTC(start);
  const e = parseUTC(end);
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear();
  return `${format(s, 'MMM d')} – ${format(e, sameYear ? 'MMM d' : 'MMM d, yyyy')}`;
}

/** Try to find a stub for a batch using voucherId OR lastBillingSync date */
function getStubId(
  batch: EmployeePayrollBatch,
  stubMap: Map<string, string>
): string | undefined {
  // Strategy 1: match via payrollVoucher.voucherId (PRISM users)
  if (batch.payrollVoucher?.voucherId) {
    const id = stubMap.get(batch.payrollVoucher.voucherId);
    if (id) return id;
  }
  // Strategy 2: match via lastBillingSync date (format "YYYY-MM-DD")
  if (batch.lastCreatedPEOBatch?.lastBillingSync) {
    const dateKey = batch.lastCreatedPEOBatch.lastBillingSync.slice(0, 10);
    const id = stubMap.get(dateKey);
    if (id) return id;
  }
  return undefined;
}

function getCheckDate(batch: EmployeePayrollBatch): string | null {
  const pd = batch.payrollVoucher?.payDate;
  if (pd) {
    try {
      return format(new Date(pd), 'MMM d, yyyy');
    } catch {
      /* fall through */
    }
  }
  try {
    return format(parseUTC(batch.endDate), 'MMM d, yyyy');
  } catch {
    return null;
  }
}

function getItemLabel(
  item: SubmittedEventApplicant | SubmittedJobTimecard,
  batch?: EmployeePayrollBatch
): string {
  if ('shiftName' in item && item.shiftName) return item.shiftName;
  if ('shiftSlug' in item && item.shiftSlug) return item.shiftSlug;
  if ('companySlug' in item && item.companySlug) return item.companySlug;
  // Prefer human-readable batch-level name
  if (batch?.eventName) return batch.eventName;
  if (batch?.jobTitle) return batch.jobTitle;
  // Fall back to slugs
  if (batch?.eventUrl) return batch.eventUrl;
  if (batch?.jobSlug) return batch.jobSlug;
  if ('jobId' in item) return item.jobId;
  if ('rowId' in item && item.rowId) return item.rowId;
  return '–';
}

function getBatchVenueName(batch: EmployeePayrollBatch): string {
  return batch.venueName || batch.eventUrl || batch.jobSlug || '–';
}

function getItemRate(
  item: SubmittedEventApplicant | SubmittedJobTimecard
): string {
  const rate = 'payRate' in item ? Number(item.payRate) : undefined;
  if (!rate) return '–';
  return `$${rate.toFixed(2)}/hr`;
}

function getItemEarnings(
  item: SubmittedEventApplicant | SubmittedJobTimecard
): number {
  if (item.taxDetails?.totalPay) return item.taxDetails.totalPay;
  return (item.totalHours ?? 0) * (item.payRate ?? 0);
}

function formatDirectDeposit(dd?: DirectDeposit): string {
  const raw = dd?.account1 || dd?.account2 || '';
  if (!raw) return '–';
  return raw.length >= 4 ? `•••• ${raw.slice(-4)}` : `•••• ${raw}`;
}

// ── Sort icon ─────────────────────────────────────────────────────────────────

const SortIcon: React.FC<{
  field: SortField;
  active: SortField;
  dir: SortDir;
}> = ({ field, active, dir }) => {
  if (active !== field)
    return <ArrowUpDown className="w-3 h-3 ml-1 text-gray-400 inline" />;
  return dir === 'asc' ? (
    <ArrowUp className="w-3 h-3 ml-1 text-blue-600 inline" />
  ) : (
    <ArrowDown className="w-3 h-3 ml-1 text-blue-600 inline" />
  );
};

// ── Stat card ─────────────────────────────────────────────────────────────────

const StatCard: React.FC<{
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  iconBg: string;
}> = ({ label, value, sub, icon, iconBg }) => (
  <div className="bg-white rounded-xl p-5 shadow-sm flex items-center gap-4">
    <div className={clsxm('p-3 rounded-xl flex-shrink-0', iconBg)}>{icon}</div>
    <div className="min-w-0">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
        {label}
      </p>
      <p className="text-2xl font-bold text-gray-900 mt-0.5 leading-none">
        {value}
      </p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  </div>
);

// ── Table row (expandable, groups all batches in a period) ───────────────────

const PayrollTableRow: React.FC<{
  batches: EmployeePayrollBatch[];
  stubMap: Map<string, string>;
  stubs: PaycheckStub[];
  detailMode: boolean;
  onViewStub: (id: string) => void;
  onSelect: (batches: EmployeePayrollBatch[]) => void;
}> = ({ batches, stubMap, stubs, detailMode, onViewStub, onSelect }) => {
  const [localExpanded, setLocalExpanded] = useState(detailMode);
  useEffect(() => {
    setLocalExpanded(detailMode);
  }, [detailMode]);
  const expanded = localExpanded;

  const firstBatch = batches[0];
  const totalHours = batches.reduce(
    (s, b) => s + b.totalRegularHours + b.totalOvertimeHours,
    0
  );
  const totalOTHours = batches.reduce((s, b) => s + b.totalOvertimeHours, 0);
  const totalGross = batches.reduce((s, b) => s + b.totalGrossPay, 0);
  const totalDeductions = getBatchDeductions(firstBatch);
  const totalNet = totalGross - totalDeductions;
  const checkDate = getCheckDate(firstBatch);

  // First stub found across all batches in this period
  const firstStubId = batches.map((b) => getStubId(b, stubMap)).find(Boolean);
  const firstStubVoucherNumber = firstStubId
    ? stubs.find((s) => s._id === firstStubId)?.voucherNumber
    : undefined;

  // Voucher # for detail mode — from first batch that has one
  const voucherNumber =
    batches
      .map(
        (b) => b.payrollVoucher?.voucherId || b.lastCreatedPEOBatch?.batchNumber
      )
      .find(Boolean) ?? null;

  // Merge all items from all batches in this period into display rows — one per event/job
  type ItemRow = {
    type: 'event' | 'job';
    label: string;
    venue: string;
    date: string;
    regHrs: number;
    otHrs: number;
    rate: string;
    earnings: number;
  };

  const itemRows = useMemo<ItemRow[]>(() => {
    const rowMap = new Map<string, ItemRow>();

    const upsert = (key: string, base: ItemRow, patch: Partial<ItemRow>) => {
      const existing = rowMap.get(key);
      if (existing) {
        existing.regHrs += patch.regHrs ?? 0;
        existing.otHrs += patch.otHrs ?? 0;
        existing.earnings += patch.earnings ?? 0;
        if (patch.rate && patch.rate !== '–' && existing.rate === '–')
          existing.rate = patch.rate;
      } else {
        rowMap.set(key, { ...base, ...patch });
      }
    };

    batches.forEach((batch) => {
      const batchDate = format(parseUTC(batch.startDate), 'MMM d, yyyy');
      const venue = getBatchVenueName(batch);

      const batchType = batch.type;

      batch.regularItems.forEach((item) => {
        const label = getItemLabel(item, batch);
        const date =
          'timeIn' in item && item.timeIn
            ? format(parseUTC(item.timeIn), 'MMM d, yyyy')
            : batchDate;
        const key = `${label}|${venue}|${date}`;
        upsert(
          key,
          {
            type: batchType,
            label,
            venue,
            date,
            regHrs: 0,
            otHrs: 0,
            rate: '–',
            earnings: 0,
          },
          {
            regHrs: item.totalHours ?? 0,
            rate: getItemRate(item),
            earnings: getItemEarnings(item),
          }
        );
      });

      batch.overtimeItems.forEach((item) => {
        const label = getItemLabel(item, batch);
        const date =
          'timeIn' in item && item.timeIn
            ? format(parseUTC(item.timeIn), 'MMM d, yyyy')
            : batchDate;
        const key = `${label}|${venue}|${date}`;
        upsert(
          key,
          {
            type: batchType,
            label,
            venue,
            date,
            regHrs: 0,
            otHrs: 0,
            rate: '–',
            earnings: 0,
          },
          {
            otHrs: item.totalHours ?? 0,
            rate: getItemRate(item),
            earnings: getItemEarnings(item),
          }
        );
      });

      // Extras: add earnings only (no hours)
      (batch.extraItems ?? []).forEach((item) => {
        const label = getItemLabel(item, batch);
        const date =
          'timeIn' in item && item.timeIn
            ? format(parseUTC(item.timeIn), 'MMM d, yyyy')
            : batchDate;
        const key = `${label}|${venue}|${date}`;
        upsert(
          key,
          {
            type: batchType,
            label,
            venue,
            date,
            regHrs: 0,
            otHrs: 0,
            rate: '–',
            earnings: 0,
          },
          {
            earnings: getItemEarnings(item),
          }
        );
      });

      const hasItems =
        batch.regularItems.length > 0 ||
        batch.overtimeItems.length > 0 ||
        (batch.extraItems ?? []).length > 0;

      if (!hasItems) {
        const label =
          batch.eventName ||
          batch.jobTitle ||
          batch.eventUrl ||
          batch.jobSlug ||
          '–';
        rowMap.set(`${label}|${venue}|${batchDate}`, {
          type: batchType,
          label,
          venue,
          date: batchDate,
          regHrs: batch.totalRegularHours,
          otHrs: batch.totalOvertimeHours,
          rate: '–',
          earnings: batch.totalGrossPay,
        });
      }
    });

    return Array.from(rowMap.values());
  }, [batches]);

  return (
    <>
      <tr
        className={clsxm(
          'border-b border-gray-100 transition-colors cursor-pointer',
          expanded ? 'bg-blue-50/20' : 'hover:bg-gray-50/60'
        )}
        onClick={() => onSelect(batches)}
      >
        {/* Expand toggle */}
        <td className="pl-4 pr-2 py-4 w-8">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLocalExpanded((p) => !p);
            }}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            {expanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        </td>

        {/* Pay Period */}
        <td className="px-4 py-4">
          <span className="text-sm font-semibold text-gray-900">
            {formatPeriod(firstBatch.startDate, firstBatch.endDate)}
          </span>
        </td>

        {/* Check Date */}
        <td className="px-4 py-4 text-sm text-gray-600">{checkDate ?? '–'}</td>

        {/* Hours */}
        <td className="px-4 py-4">
          <span className="text-sm text-gray-800 font-medium">
            {totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}
          </span>
          {totalOTHours > 0 && (
            <span className="ml-1.5 text-xs font-semibold px-1.5 py-0.5 rounded bg-orange-100 text-orange-600">
              +{totalOTHours % 1 === 0 ? totalOTHours : totalOTHours.toFixed(1)}
              OT
            </span>
          )}
        </td>

        {/* Gross Pay */}
        <td className="px-4 py-4 text-sm font-semibold text-green-600">
          {formatCurrency(totalGross)}
        </td>

        {/* Deductions */}
        <td className="px-4 py-4 text-sm font-semibold text-red-500">
          -{formatCurrency(totalDeductions)}
        </td>

        {/* Net Pay */}
        <td className="px-4 py-4 text-sm font-bold text-blue-600">
          {formatCurrency(totalNet)}
        </td>

        {/* Status */}
        <td className="px-4 py-4">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            PAID
          </span>
        </td>

        {/* Voucher # */}
        <td className="px-4 py-4 text-xs text-gray-500 font-mono">
          {firstStubVoucherNumber ?? '–'}
        </td>

        {/* Stub */}
        <td className="px-4 py-4">
          {firstStubId ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onViewStub(firstStubId);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 border border-blue-200 bg-white hover:bg-blue-50 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              View
            </button>
          ) : (
            <span className="text-xs text-gray-300">–</span>
          )}
        </td>
      </tr>

      {/* Expanded events table */}
      {expanded && (
        <tr className="bg-slate-50/60 border-b border-gray-100">
          <td colSpan={10} className="px-8 py-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
              Events / Jobs in this Pay Period
            </p>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  {[
                    'Type',
                    'Event',
                    'Venue',
                    'Date',
                    'Reg Hrs',
                    'OT Hrs',
                    'Rate',
                    'Earnings',
                  ].map((col) => (
                    <th
                      key={col}
                      className={clsxm(
                        'text-xs font-semibold text-gray-400 uppercase tracking-wider pb-2',
                        col === 'Reg Hrs' ||
                          col === 'OT Hrs' ||
                          col === 'Rate' ||
                          col === 'Earnings'
                          ? 'text-right pr-4'
                          : 'text-left pr-4'
                      )}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {itemRows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="pr-4 py-2">
                      <span
                        className={clsxm(
                          'text-xs font-semibold px-1.5 py-0.5 rounded',
                          row.type === 'event'
                            ? 'bg-purple-100 text-purple-600'
                            : 'bg-sky-100 text-sky-600'
                        )}
                      >
                        {row.type === 'event' ? 'Event' : 'Job'}
                      </span>
                    </td>
                    <td className="text-sm font-semibold text-gray-800 pr-4 py-2">
                      {row.label}
                    </td>
                    <td className="text-sm text-gray-500 pr-4 py-2">
                      {row.venue}
                    </td>
                    <td className="text-sm text-gray-500 pr-4 py-2">
                      {row.date}
                    </td>
                    <td className="text-sm text-right text-gray-700 pr-4 py-2">
                      {row.regHrs > 0 ? (
                        row.regHrs
                      ) : (
                        <span className="text-gray-300">0</span>
                      )}
                    </td>
                    <td className="text-sm text-right pr-4 py-2">
                      {row.otHrs > 0 ? (
                        <span className="text-orange-500 font-medium">
                          {row.otHrs}
                        </span>
                      ) : (
                        <span className="text-gray-300">0</span>
                      )}
                    </td>
                    <td className="text-sm text-right text-gray-600 pr-4 py-2">
                      {row.rate}
                    </td>
                    <td className="text-sm text-right font-semibold text-green-600 py-2">
                      {formatCurrency(row.earnings)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
};

// ── Paycheck Details Modal ────────────────────────────────────────────────────

const PaycheckDetailsModal: React.FC<{
  batches: EmployeePayrollBatch[];
  stubMap: Map<string, string>;
  stubs: PaycheckStub[];
  directDeposit?: DirectDeposit;
  onClose: () => void;
  onViewStub: (id: string) => void;
}> = ({ batches, stubMap, stubs, directDeposit, onClose, onViewStub }) => {
  const firstBatch = batches[0];
  const payrollVoucher = batches.map((b) => b.payrollVoucher).find(Boolean);
  const stubId = batches.map((b) => getStubId(b, stubMap)).find(Boolean);
  const stub = stubId ? stubs.find((s) => s._id === stubId) : undefined;

  const totalGross = batches.reduce((s, b) => s + b.totalGrossPay, 0);
  const totalRegHours = batches.reduce((s, b) => s + b.totalRegularHours, 0);
  const totalOTHours = batches.reduce((s, b) => s + b.totalOvertimeHours, 0);
  const totalHours = totalRegHours + totalOTHours;

  const deductionItems = payrollVoucher?.deductions ?? [];
  const totalDeductions = deductionItems.reduce(
    (s, item) => s + Math.abs(item.amount),
    0
  );
  const netPay = totalGross - totalDeductions;

  const checkDate = getCheckDate(firstBatch);
  const status = stub ? 'PAID' : 'UNPAID';
  const voucherId = payrollVoucher?.voucherId;
  const batchId = stub?.batchId;
  const ddDisplay = formatDirectDeposit(directDeposit);

  type EarningCard = {
    type: 'event' | 'job';
    label: string;
    venue: string;
    date: string;
    regHrs: number;
    regRate: string;
    regEarnings: number;
    otHrs: number;
    otRate: string;
    otEarnings: number;
    extraEarnings: number;
  };

  const earningCards = useMemo<EarningCard[]>(() => {
    const cardMap = new Map<string, EarningCard>();

    const upsert = (
      key: string,
      patch: Partial<EarningCard> & {
        type: 'event' | 'job';
        label: string;
        venue: string;
        date: string;
      }
    ) => {
      const existing = cardMap.get(key);
      if (existing) {
        if (patch.regHrs) {
          existing.regHrs += patch.regHrs;
          existing.regEarnings += patch.regEarnings ?? 0;
          existing.regRate = patch.regRate ?? existing.regRate;
        }
        if (patch.otHrs) {
          existing.otHrs += patch.otHrs;
          existing.otEarnings += patch.otEarnings ?? 0;
          existing.otRate = patch.otRate ?? existing.otRate;
        }
        if (patch.extraEarnings) {
          existing.extraEarnings += patch.extraEarnings;
        }
      } else {
        cardMap.set(key, {
          type: patch.type,
          label: patch.label,
          venue: patch.venue,
          date: patch.date,
          regHrs: patch.regHrs ?? 0,
          regRate: patch.regRate ?? '–',
          regEarnings: patch.regEarnings ?? 0,
          otHrs: patch.otHrs ?? 0,
          otRate: patch.otRate ?? '–',
          otEarnings: patch.otEarnings ?? 0,
          extraEarnings: patch.extraEarnings ?? 0,
        });
      }
    };

    batches.forEach((batch) => {
      const bDate = format(new Date(batch.startDate), 'MMM d, yyyy');
      const venue = getBatchVenueName(batch);
      const batchType = batch.type;

      batch.regularItems.forEach((item) => {
        const label = getItemLabel(item, batch);
        const date =
          'timeIn' in item && item.timeIn
            ? format(new Date(item.timeIn), 'MMM d, yyyy')
            : bDate;
        upsert(`${label}|${venue}|${date}`, {
          type: batchType,
          label,
          venue,
          date,
          regHrs: item.totalHours ?? 0,
          regRate: getItemRate(item),
          regEarnings: getItemEarnings(item),
        });
      });

      batch.overtimeItems.forEach((item) => {
        const label = getItemLabel(item, batch);
        const date =
          'timeIn' in item && item.timeIn
            ? format(new Date(item.timeIn), 'MMM d, yyyy')
            : bDate;
        upsert(`${label}|${venue}|${date}`, {
          type: batchType,
          label,
          venue,
          date,
          otHrs: item.totalHours ?? 0,
          otRate: getItemRate(item),
          otEarnings: getItemEarnings(item),
        });
      });

      (batch.extraItems ?? []).forEach((item) => {
        const label = getItemLabel(item, batch);
        const date =
          'timeIn' in item && item.timeIn
            ? format(new Date(item.timeIn), 'MMM d, yyyy')
            : bDate;
        upsert(`${label}|${venue}|${date}`, {
          type: batchType,
          label,
          venue,
          date,
          extraEarnings: getItemEarnings(item),
        });
      });

      const hasItems =
        batch.regularItems.length > 0 ||
        batch.overtimeItems.length > 0 ||
        (batch.extraItems ?? []).length > 0;

      if (!hasItems) {
        const label =
          batch.eventName ||
          batch.jobTitle ||
          batch.eventUrl ||
          batch.jobSlug ||
          '–';
        cardMap.set(`${label}|${venue}|${bDate}`, {
          type: batchType,
          label,
          venue,
          date: bDate,
          regHrs: batch.totalRegularHours,
          regRate: '–',
          regEarnings: batch.totalGrossPay,
          otHrs: batch.totalOvertimeHours,
          otRate: '–',
          otEarnings: 0,
          extraEarnings: 0,
        });
      }
    });

    return Array.from(cardMap.values());
  }, [batches]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              Paycheck Details
            </h2>
            <p className="text-sm text-gray-400 mt-0.5">
              Pay Period:{' '}
              {formatPeriod(firstBatch.startDate, firstBatch.endDate)}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-4">
            {stubId && (
              <button
                type="button"
                onClick={() => onViewStub(stubId)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-600 border border-blue-300 bg-white hover:bg-blue-50 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                View Paystub
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          {/* Stat boxes */}
          <div className="grid grid-cols-4 gap-3">
            {(
              [
                {
                  label: 'GROSS PAY',
                  value: formatCurrency(totalGross),
                  valueColor: 'text-green-600',
                  labelColor: 'text-green-500',
                },
                {
                  label: 'DEDUCTIONS',
                  value: formatCurrency(totalDeductions),
                  valueColor: 'text-red-500',
                  labelColor: 'text-red-400',
                },
                {
                  label: 'NET PAY',
                  value: formatCurrency(netPay),
                  valueColor: 'text-blue-600',
                  labelColor: 'text-blue-500',
                },
                {
                  label: 'TOTAL HOURS',
                  value:
                    totalHours % 1 === 0
                      ? String(totalHours)
                      : totalHours.toFixed(1),
                  valueColor: 'text-purple-600',
                  labelColor: 'text-purple-400',
                },
              ] as const
            ).map(({ label, value, valueColor, labelColor }) => (
              <div
                key={label}
                className="bg-gray-50 rounded-xl p-3 border border-gray-100"
              >
                <p
                  className={clsxm(
                    'text-[10px] font-semibold uppercase tracking-wider leading-tight',
                    labelColor
                  )}
                >
                  {label}
                </p>
                <p className={clsxm('text-sm font-bold mt-1', valueColor)}>
                  {value}
                </p>
              </div>
            ))}
          </div>

          {/* Details rows */}
          <div className="rounded-xl border border-gray-100 divide-y divide-gray-100 text-sm">
            {/* Check Date + Status */}
            <div className="grid grid-cols-2 divide-x divide-gray-100">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-gray-400">Check Date</span>
                <span className="font-semibold text-gray-800">
                  {checkDate ?? '–'}
                </span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-gray-400">Status</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  {status.toUpperCase()}
                </span>
              </div>
            </div>
            {/* Voucher # + Batch ID */}
            <div className="grid grid-cols-2 divide-x divide-gray-100">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-gray-400">Voucher #</span>
                <span className="font-semibold text-gray-800 font-mono">
                  {voucherId ?? '–'}
                </span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-gray-400">Batch ID</span>
                <span className="font-semibold text-gray-800 font-mono">
                  {batchId ?? '–'}
                </span>
              </div>
            </div>
            {/* Regular Hours + Overtime Hours */}
            <div className="grid grid-cols-2 divide-x divide-gray-100">
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-gray-400">Regular Hours</span>
                <span className="font-semibold text-gray-800">
                  {totalRegHours % 1 === 0
                    ? totalRegHours
                    : totalRegHours.toFixed(1)}
                </span>
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-gray-400">Overtime Hours</span>
                <span className="font-semibold text-orange-500">
                  {totalOTHours % 1 === 0
                    ? totalOTHours
                    : totalOTHours.toFixed(1)}
                </span>
              </div>
            </div>
            {/* Direct Deposit — full width */}
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-gray-400">Direct Deposit</span>
              <span className="font-semibold text-gray-800">{ddDisplay}</span>
            </div>
          </div>

          {/* Deduction Breakdown */}
          {deductionItems.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
                Deduction Breakdown
              </p>
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                {deductionItems.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50 last:border-b-0"
                  >
                    <span className="text-sm text-gray-700">
                      {item.description}
                    </span>
                    <span className="text-sm font-semibold text-red-500">
                      -{formatCurrency(Math.abs(item.amount))}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-t border-gray-200">
                  <span className="text-sm font-bold text-gray-800">
                    Total Deductions
                  </span>
                  <span className="text-sm font-bold text-red-600">
                    -{formatCurrency(totalDeductions)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Earnings by Event / Job */}
          {earningCards.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
                Earnings by Event / Job
              </p>
              <div className="space-y-2.5">
                {earningCards.map((card, i) => {
                  const total =
                    card.regEarnings + card.otEarnings + card.extraEarnings;
                  return (
                    <div
                      key={i}
                      className="rounded-xl border border-gray-100 p-4"
                    >
                      <div className="flex items-start justify-between mb-1">
                        <p className="text-sm font-bold text-gray-900">
                          {card.label}
                        </p>
                        <p className="text-sm font-bold text-green-600 flex-shrink-0 ml-2">
                          {formatCurrency(total)}
                        </p>
                      </div>
                      <p className="text-xs text-gray-400 mb-2">
                        <span
                          className={clsxm(
                            'font-semibold mr-1',
                            card.type === 'event'
                              ? 'text-purple-400'
                              : 'text-sky-400'
                          )}
                        >
                          {card.type === 'event' ? 'Event' : 'Job'} -
                        </span>
                        {card.venue} · {card.date}
                      </p>
                      {card.regHrs > 0 && (
                        <p className="text-xs text-gray-500">
                          {card.regHrs % 1 === 0
                            ? card.regHrs
                            : card.regHrs.toFixed(1)}
                          h reg @ {card.regRate} ={' '}
                          {formatCurrency(card.regEarnings)}
                        </p>
                      )}
                      {card.otHrs > 0 && (
                        <p className="text-xs font-semibold text-orange-500 mt-0.5">
                          {card.otHrs % 1 === 0
                            ? card.otHrs
                            : card.otHrs.toFixed(1)}
                          h OT @ {card.otRate} ={' '}
                          {formatCurrency(card.otEarnings)}
                        </p>
                      )}
                      {card.extraEarnings > 0 && (
                        <p className="text-xs font-semibold text-blue-500 mt-0.5">
                          Extras = {formatCurrency(card.extraEarnings)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Card view ─────────────────────────────────────────────────────────────────

const PayrollCardGrid: React.FC<{
  groups: { key: string; batches: EmployeePayrollBatch[] }[];
  stubMap: Map<string, string>;
  onViewStub: (id: string) => void;
  onSelect: (batches: EmployeePayrollBatch[]) => void;
}> = ({ groups, stubMap, onViewStub, onSelect }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
    {groups.map(({ key, batches }) => {
      const firstBatch = batches[0];
      const totalHours = batches.reduce(
        (s, b) => s + b.totalRegularHours + b.totalOvertimeHours,
        0
      );
      const totalOTHours = batches.reduce(
        (s, b) => s + b.totalOvertimeHours,
        0
      );
      const totalGross = batches.reduce((s, b) => s + b.totalGrossPay, 0);
      const totalDeductions = getBatchDeductions(firstBatch);
      const totalNet = totalGross - totalDeductions;
      const checkDate = getCheckDate(firstBatch);
      const stubId = batches.map((b) => getStubId(b, stubMap)).find(Boolean);

      const displayBatches = batches.slice(0, 4);
      const extraCount = batches.length - displayBatches.length;

      return (
        <div
          key={key}
          className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col gap-4 cursor-pointer hover:border-blue-200 transition-colors"
          onClick={() => onSelect(batches)}
        >
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-base font-bold text-gray-900">
                {formatPeriod(firstBatch.startDate, firstBatch.endDate)}
              </p>
              {checkDate && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Check Date: {checkDate}
                </p>
              )}
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200 flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              PAID
            </span>
          </div>

          {/* Gross / Deductions / Net — boxed mini-stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
                GROSS
              </p>
              <p className="text-sm font-bold text-green-600">
                {formatCurrency(totalGross)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
                DEDUCTIONS
              </p>
              <p className="text-sm font-bold text-red-500">
                -{formatCurrency(totalDeductions)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
                NET PAY
              </p>
              <p className="text-sm font-bold text-blue-600">
                {formatCurrency(totalNet)}
              </p>
            </div>
          </div>

          {/* Hours + event count */}
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>
              {totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}h total
              {totalOTHours > 0 && (
                <span className="ml-1.5 text-xs font-semibold text-orange-500">
                  {totalOTHours % 1 === 0
                    ? totalOTHours
                    : totalOTHours.toFixed(1)}
                  h OT
                </span>
              )}
            </span>
            <span>
              {batches.length} event{batches.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Event list — one row per batch */}
          <div className="space-y-1.5">
            {displayBatches.map((batch) => (
              <div
                key={batch._id}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-gray-700 font-medium truncate mr-2">
                  <span
                    className={clsxm(
                      'text-xs font-semibold mr-1',
                      batch.type === 'event'
                        ? 'text-purple-500'
                        : 'text-sky-500'
                    )}
                  >
                    [{batch.type === 'event' ? 'Event' : 'Job'}]
                  </span>
                  {batch.eventName ||
                    batch.jobTitle ||
                    batch.eventUrl ||
                    batch.jobSlug ||
                    '–'}
                </span>
                <span className="text-gray-800 font-semibold flex-shrink-0">
                  {formatCurrency(batch.totalGrossPay)}
                </span>
              </div>
            ))}
            {extraCount > 0 && (
              <p className="text-xs text-gray-400 text-center">
                +{extraCount} more
              </p>
            )}
          </div>

          {/* View Paystub button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (stubId) onViewStub(stubId);
            }}
            disabled={!stubId}
            className={clsxm(
              'w-full py-2.5 rounded-lg text-sm font-semibold border flex items-center justify-center gap-1.5 mt-auto transition-colors',
              stubId
                ? 'text-blue-600 border-blue-300 bg-white hover:bg-blue-50 cursor-pointer'
                : 'text-gray-300 border-gray-200 bg-white cursor-not-allowed'
            )}
          >
            <FileText className="w-4 h-4" />
            View Paystub
          </button>
        </div>
      );
    })}
  </div>
);

// ── Paystubs view ─────────────────────────────────────────────────────────────

const PaystubsGrid: React.FC<{ applicantId?: string }> = ({ applicantId }) => {
  const router = useRouter();
  const { data, isLoading, error } = usePaycheckStubs(applicantId);
  const stubs = data?.paycheckStubs ?? [];

  if (isLoading)
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl p-5 shadow-sm">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-8 w-12" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl p-5 shadow-sm">
              <Skeleton className="h-5 w-3/4 mb-3" />
              <Skeleton className="h-4 w-1/2 mb-4" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      </div>
    );

  if (error)
    return (
      <div className="text-center py-12 text-gray-500 text-sm">
        Failed to load paycheck stubs.
      </div>
    );

  const viewedCount = stubs.filter((s) => s.viewStatus === 'viewed').length;
  const notViewedCount = stubs.length - viewedCount;

  if (stubs.length === 0)
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Receipt className="w-12 h-12 text-gray-300 mb-3" />
        <p className="text-gray-500 text-sm font-medium">
          No paycheck stubs available yet.
        </p>
      </div>
    );

  return (
    <div className="space-y-4">
      {/* Mini-stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm flex items-center gap-3 border border-gray-100">
          <div className="p-2 rounded-lg bg-blue-50 flex-shrink-0">
            <FileText className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Total Stubs
            </p>
            <p className="text-2xl font-bold text-gray-900">{stubs.length}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm flex items-center gap-3 border border-green-200">
          <div className="p-2 rounded-lg bg-green-50 flex-shrink-0">
            <Eye className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Viewed
            </p>
            <p className="text-2xl font-bold text-gray-900">{viewedCount}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm flex items-center gap-3 border border-red-200">
          <div className="p-2 rounded-lg bg-red-50 flex-shrink-0">
            <EyeOff className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Not Viewed
            </p>
            <p className="text-2xl font-bold text-gray-900">{notViewedCount}</p>
          </div>
        </div>
      </div>

      {/* Stub cards — always 2 cols to match design */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {stubs.map((stub) => {
          const isViewed = stub.viewStatus === 'viewed';
          return (
            <div
              key={stub._id}
              className="bg-white rounded-xl shadow-sm border border-blue-200 p-5 flex flex-col gap-3"
            >
              {/* Filename + status badge */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-2 rounded-lg flex-shrink-0 bg-blue-50">
                    <FileText className="w-4 h-4 text-blue-600" />
                  </div>
                  <p className="text-xs font-semibold text-gray-900 truncate">
                    {stub.fileName}
                  </p>
                </div>
                <span
                  className={clsxm(
                    'flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border bg-white',
                    isViewed
                      ? 'border-green-400 text-green-600'
                      : 'border-red-400 text-red-500'
                  )}
                >
                  {isViewed ? (
                    <Eye className="w-3 h-3" />
                  ) : (
                    <EyeOff className="w-3 h-3" />
                  )}
                  {isViewed ? 'Viewed' : 'Not Viewed'}
                </span>
              </div>

              {/* Dates + IDs */}
              <div className="space-y-1 text-xs text-gray-500">
                <p>
                  Uploaded:{' '}
                  <span className="text-gray-700 font-medium">
                    {format(new Date(stub.uploadedAt), 'MMM d, yyyy')}
                  </span>
                </p>
                <p>
                  Check Date:{' '}
                  <span className="text-gray-700 font-medium">
                    {format(new Date(stub.checkDate), 'MMM d, yyyy')}
                  </span>
                </p>
                <div className="flex items-center gap-4 pt-1">
                  <p>
                    Batch ID:{' '}
                    <span className="font-semibold text-gray-700">
                      {stub.batchId}
                    </span>
                  </p>
                  <p>
                    Voucher:{' '}
                    <span className="font-semibold text-gray-700">
                      {stub.voucherNumber}
                    </span>
                  </p>
                </div>
              </div>

              {/* View PDF button */}
              <button
                onClick={() => router.push(`/paycheck-stubs/${stub._id}`)}
                className="w-full py-2.5 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                <FileText className="w-4 h-4" />
                View PDF
                <span className="text-blue-300">›</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Main page content ──────────────────────────────────────────────────────────

const PayrollPageContent: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (searchParams.get('view') as ViewMode) || 'table'
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortField, setSortField] = useState<SortField>('startDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [detailMode, setDetailMode] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number>(
    new Date().getFullYear()
  );
  const [selectedGroup, setSelectedGroup] = useState<{
    key: string;
    batches: EmployeePayrollBatch[];
  } | null>(null);

  // Auth
  const {
    shouldShowContent,
    isLoading: pageAuthLoading,
    error: pageAuthError,
  } = usePageAuth({ requireAuth: true });

  const { data: primaryCompany, isLoading: companyLoading } =
    usePrimaryCompany();
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const applicantId = currentUser?.applicantId;
  const isPrism = primaryCompany?.peoIntegration === 'Prism';

  // Data
  const { data: historyData, isLoading: historyLoading } =
    useEmployeePayrollHistory(!!applicantId);
  const { data: stubsData } = usePaycheckStubs(
    isPrism ? applicantId : undefined
  );

  const allBatches = useMemo(
    () => historyData?.payrollBatches ?? [],
    [historyData]
  );
  const stubs = useMemo(() => stubsData?.paycheckStubs ?? [], [stubsData]);

  // Build stubMap with TWO keys per stub for maximum match coverage:
  //   1. voucherNumber  → matches billingVoucher.voucherId (PRISM users)
  //   2. batchId date   → matches lastCreatedPEOBatch.lastBillingSync date
  //      e.g. "batch_2026_03_20" → key "2026-03-20"
  const stubMap = useMemo(() => {
    const m = new Map<string, string>();
    stubs.forEach((s) => {
      if (s.voucherNumber) m.set(s.voucherNumber, s._id);
      if (s.batchId) {
        // "batch_2026_03_20" → "2026-03-20"
        const dateKey = s.batchId.replace(/^batch_/, '').replace(/_/g, '-');
        m.set(dateKey, s._id);
      }
    });
    return m;
  }, [stubs]);

  // Available years from batch data
  const availableYears = useMemo(() => {
    const current = new Date().getFullYear();
    const years = new Set<number>([current]);
    allBatches.forEach((b) => years.add(new Date(b.startDate).getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, [allBatches]);

  // Year-filtered batches
  const yearBatches = useMemo(
    () =>
      allBatches.filter(
        (b) => new Date(b.startDate).getFullYear() === selectedYear
      ),
    [allBatches, selectedYear]
  );

  // Status filter
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const statusFiltered = useMemo(() => {
    if (statusFilter === 'all') return yearBatches;
    if (statusFilter === 'current')
      return yearBatches.filter(
        (b) => new Date(b.startDate).getMonth() === currentMonth
      );
    if (statusFilter === 'past')
      return yearBatches.filter(
        (b) => new Date(b.startDate).getMonth() < currentMonth
      );
    return yearBatches; // 'custom' - no-op for now
  }, [yearBatches, statusFilter, currentMonth]);

  // Sort
  const sorted = useMemo(() => {
    return [...statusFiltered].sort((a, b) => {
      let va: number, vb: number;
      switch (sortField) {
        case 'checkDate': {
          const ad = a.payrollVoucher?.payDate ?? a.endDate;
          const bd = b.payrollVoucher?.payDate ?? b.endDate;
          va = new Date(ad).getTime();
          vb = new Date(bd).getTime();
          break;
        }
        case 'hours':
          va = a.totalRegularHours + a.totalOvertimeHours;
          vb = b.totalRegularHours + b.totalOvertimeHours;
          break;
        case 'grossPay':
          va = a.totalGrossPay;
          vb = b.totalGrossPay;
          break;
        case 'deductions':
          va = a.totalTaxes;
          vb = b.totalTaxes;
          break;
        case 'netPay':
          va = getNetPay(a);
          vb = getNetPay(b);
          break;
        default: // startDate
          va = new Date(a.startDate).getTime();
          vb = new Date(b.startDate).getTime();
      }
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  }, [statusFiltered, sortField, sortDir]);

  // Group sorted batches by pay period (startDate|endDate) for table view
  const groupedByPeriod = useMemo(() => {
    const groups: { key: string; batches: EmployeePayrollBatch[] }[] = [];
    const indexMap = new Map<string, number>();
    sorted.forEach((batch) => {
      const batchNumber = batch.lastCreatedPEOBatch?.batchNumber;
      const key = batchNumber
        ? `${batch.startDate}|${batch.endDate}|${batchNumber}`
        : `${batch.startDate}|${batch.endDate}|`;
      const idx = indexMap.get(key);
      if (idx !== undefined) {
        groups[idx].batches.push(batch);
      } else {
        indexMap.set(key, groups.length);
        groups.push({ key, batches: [batch] });
      }
    });
    return groups;
  }, [sorted]);

  // Search filters whole groups — any batch within a group matching keeps the full group
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groupedByPeriod;
    const q = searchQuery.toLowerCase();
    return groupedByPeriod.filter(({ batches }) =>
      batches.some(
        (b) =>
          formatPeriod(b.startDate, b.endDate).toLowerCase().includes(q) ||
          (b.eventName && b.eventName.toLowerCase().includes(q)) ||
          (b.jobTitle && b.jobTitle.toLowerCase().includes(q)) ||
          (b.eventUrl && b.eventUrl.toLowerCase().includes(q)) ||
          (b.jobSlug && b.jobSlug.toLowerCase().includes(q)) ||
          (b.payrollVoucher?.voucherId &&
            b.payrollVoucher.voucherId.toLowerCase().includes(q))
      )
    );
  }, [groupedByPeriod, searchQuery]);

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDir('desc');
      }
    },
    [sortField]
  );

  // YTD stats
  const ytd = useMemo(() => {
    const totalGroups = groupedByPeriod.length;
    const paidGroups = groupedByPeriod.filter(({ batches }) =>
      batches.some((b) => getStubId(b, stubMap))
    ).length;
    return {
      gross: yearBatches.reduce((s, b) => s + b.totalGrossPay, 0),
      net: yearBatches.reduce((s, b) => s + getNetPay(b), 0),
      hours: yearBatches.reduce(
        (s, b) => s + b.totalRegularHours + b.totalOvertimeHours,
        0
      ),
      count: totalGroups,
      paidCount: paidGroups,
    };
  }, [yearBatches, groupedByPeriod, stubMap]);

  // Handle legacy stubId redirect
  const stubId = searchParams.get('stubId');
  if (stubId) {
    router.replace(`/paycheck-stubs/${stubId}`);
    return null;
  }

  if (pageAuthLoading || companyLoading || userLoading)
    return <AuthLoadingState />;
  if (pageAuthError) return <AuthErrorState error={pageAuthError.message} />;
  if (!shouldShowContent) return <UnauthenticatedState />;

  const thClass =
    'px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider select-none cursor-pointer hover:text-gray-700';

  return (
    <div className="min-h-screen bg-slate-100">
      <Layout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          {/* ── Page Header ─────────────────────────────────────────────── */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Payroll</h1>
            <p className="text-gray-500 mt-1">
              View your earnings, deductions, paycheck history, and paystubs
            </p>
          </div>

          {/* ── Stats Cards ─────────────────────────────────────────────── */}
          {historyLoading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-white rounded-xl p-5 shadow-sm">
                  <Skeleton className="h-4 w-28 mb-3" />
                  <Skeleton className="h-8 w-24 mb-2" />
                  <Skeleton className="h-3 w-20" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Total Earnings"
                value={formatCurrency(ytd.gross)}
                sub={`${selectedYear} Gross`}
                iconBg="bg-green-100"
                icon={<DollarSign className="w-6 h-6 text-green-600" />}
              />
              <StatCard
                label="Net Pay"
                value={formatCurrency(ytd.net)}
                sub={`${selectedYear} Take-Home`}
                iconBg="bg-blue-100"
                icon={<DollarSign className="w-6 h-6 text-blue-500" />}
              />
              <StatCard
                label="Total Hours"
                value={
                  ytd.hours % 1 === 0 ? String(ytd.hours) : ytd.hours.toFixed(1)
                }
                sub={`Across ${ytd.count} paycheck${ytd.count !== 1 ? 's' : ''}`}
                iconBg="bg-purple-100"
                icon={<Clock className="w-6 h-6 text-purple-500" />}
              />
              <StatCard
                label="Paychecks Paid"
                value={
                  isPrism ? `${ytd.paidCount}/${ytd.count}` : String(ytd.count)
                }
                sub={
                  isPrism
                    ? `${ytd.paidCount} of ${ytd.count} paid`
                    : `${ytd.count} period${ytd.count !== 1 ? 's' : ''}`
                }
                iconBg="bg-orange-100"
                icon={<CheckCircle2 className="w-6 h-6 text-orange-500" />}
              />
            </div>
          )}

          {/* ── Filters + View Toggle ────────────────────────────────────── */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
            {/* Year selector */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider w-10">
                Year
              </span>
              <div className="flex gap-2 flex-wrap">
                {availableYears.map((yr) => (
                  <button
                    key={yr}
                    onClick={() => setSelectedYear(yr)}
                    className={clsxm(
                      'px-4 py-1.5 rounded-full text-sm font-medium transition-colors',
                      selectedYear === yr
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-gray-500 border border-gray-200 hover:border-gray-300 hover:text-gray-700'
                    )}
                  >
                    {yr}
                    {yr === currentYear && (
                      <span className="ml-1 text-xs opacity-75">(Current)</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Status + search + view */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              {/* Status pills */}
              <div className="flex gap-1.5">
                {(
                  [
                    ['all', 'All'],
                    ['current', 'Current'],
                    ['past', 'Past'],
                    ['custom', 'Custom'],
                  ] as [StatusFilter, string][]
                ).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setStatusFilter(val)}
                    className={clsxm(
                      'px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors border',
                      statusFilter === val
                        ? 'border-blue-500 text-blue-600 bg-white'
                        : 'text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search voucher, venue, event..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50"
                />
              </div>

              {/* View toggle */}
              <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden bg-gray-50 flex-shrink-0">
                {(
                  [
                    ['table', TableIcon, 'Table'],
                    ['card', LayoutGrid, 'Card'],
                    ['paystubs', Receipt, 'Paystubs'],
                  ] as [ViewMode, React.ElementType, string][]
                ).map(([mode, Icon, label]) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={clsxm(
                      'flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium transition-colors',
                      viewMode === mode
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Content ──────────────────────────────────────────────────── */}
          {historyLoading ? (
            <div className="bg-white rounded-xl shadow-sm p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : viewMode === 'paystubs' ? (
            <PaystubsGrid applicantId={applicantId} />
          ) : (
            <>
              {/* Results header */}
              {filteredGroups.length > 0 && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">
                    Showing{' '}
                    <span className="font-semibold text-gray-700">
                      {filteredGroups.length}
                    </span>{' '}
                    paycheck{filteredGroups.length !== 1 ? 's' : ''}
                  </p>
                  <button
                    onClick={() => setDetailMode((p) => !p)}
                    className={clsxm(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                      detailMode
                        ? 'bg-blue-50 border-blue-300 text-blue-600'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
                    )}
                  >
                    {detailMode ? '● Detail Mode' : '◇ Summary Mode'}
                  </button>
                </div>
              )}

              {/* Table view */}
              {viewMode === 'table' && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                  {filteredGroups.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20">
                      <TrendingUp className="w-12 h-12 text-gray-200 mb-3" />
                      <p className="text-gray-400 text-sm font-medium">
                        No pay history for {selectedYear}.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="pl-4 pr-2 py-3 w-8" />
                            <th
                              className={thClass}
                              onClick={() => handleSort('startDate')}
                            >
                              Pay Period{' '}
                              <SortIcon
                                field="startDate"
                                active={sortField}
                                dir={sortDir}
                              />
                            </th>
                            <th
                              className={thClass}
                              onClick={() => handleSort('checkDate')}
                            >
                              Check Date{' '}
                              <SortIcon
                                field="checkDate"
                                active={sortField}
                                dir={sortDir}
                              />
                            </th>
                            <th
                              className={thClass}
                              onClick={() => handleSort('hours')}
                            >
                              Hours{' '}
                              <SortIcon
                                field="hours"
                                active={sortField}
                                dir={sortDir}
                              />
                            </th>
                            <th
                              className={thClass}
                              onClick={() => handleSort('grossPay')}
                            >
                              Gross Pay{' '}
                              <SortIcon
                                field="grossPay"
                                active={sortField}
                                dir={sortDir}
                              />
                            </th>
                            <th
                              className={thClass}
                              onClick={() => handleSort('deductions')}
                            >
                              Deductions{' '}
                              <SortIcon
                                field="deductions"
                                active={sortField}
                                dir={sortDir}
                              />
                            </th>
                            <th
                              className={thClass}
                              onClick={() => handleSort('netPay')}
                            >
                              Net Pay{' '}
                              <SortIcon
                                field="netPay"
                                active={sortField}
                                dir={sortDir}
                              />
                            </th>
                            <th className={thClass}>Status</th>
                            <th className={thClass}>Voucher #</th>
                            <th className={thClass}>Stub</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredGroups.map(
                            ({ key, batches: groupBatches }) => (
                              <PayrollTableRow
                                key={key}
                                batches={groupBatches}
                                stubMap={stubMap}
                                stubs={stubs}
                                detailMode={detailMode}
                                onViewStub={(id) =>
                                  router.push(
                                    `/paycheck-stubs/${id}?from=${viewMode}`
                                  )
                                }
                                onSelect={(b) =>
                                  setSelectedGroup({ key, batches: b })
                                }
                              />
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Card view */}
              {viewMode === 'card' && filteredGroups.length > 0 && (
                <PayrollCardGrid
                  groups={filteredGroups}
                  stubMap={stubMap}
                  onViewStub={(id) =>
                    router.push(`/paycheck-stubs/${id}?from=${viewMode}`)
                  }
                  onSelect={(b) => {
                    const group = filteredGroups.find((g) => g.batches === b);
                    setSelectedGroup({ key: group?.key ?? '', batches: b });
                  }}
                />
              )}

              {viewMode === 'card' && filteredGroups.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20">
                  <TrendingUp className="w-12 h-12 text-gray-200 mb-3" />
                  <p className="text-gray-400 text-sm font-medium">
                    No pay history for {selectedYear}.
                  </p>
                </div>
              )}
            </>
          )}

          {/* ── Paycheck Details Modal ──────────────────────────────────── */}
          {selectedGroup && (
            <PaycheckDetailsModal
              batches={selectedGroup.batches}
              stubMap={stubMap}
              stubs={stubs}
              directDeposit={historyData?.directDeposit}
              onClose={() => setSelectedGroup(null)}
              onViewStub={(id) => router.push(`/paycheck-stubs/${id}`)}
            />
          )}

          {/* ── Footer ───────────────────────────────────────────────────── */}
          <footer className="flex items-center justify-between pt-4 border-t border-gray-200 text-xs text-gray-400">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                G
              </div>
              <p>© {currentYear} gig·nology. All rights reserved.</p>
            </div>
            <div className="flex items-center gap-4">
              <button className="hover:text-gray-600 transition-colors">
                Privacy Policy
              </button>
              <button className="hover:text-gray-600 transition-colors">
                Terms of Service
              </button>
              <button className="hover:text-gray-600 transition-colors">
                Help &amp; Support
              </button>
            </div>
          </footer>
        </div>
      </Layout>
    </div>
  );
};

// ── Page export ───────────────────────────────────────────────────────────────

const PayrollPage: NextPage = () => (
  <Suspense fallback={<AuthLoadingState />}>
    <PayrollPageContent />
  </Suspense>
);

export default PayrollPage;
