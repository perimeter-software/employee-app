'use client';

import Image from 'next/image';
import Layout from '@/components/layout/Layout';
import { usePageAuth } from '@/domains/shared/hooks/use-page-auth';
import {
  AuthErrorState,
  AuthLoadingState,
  UnauthenticatedState,
} from '@/components/shared/PageProtection';
import { useCurrentUser } from '@/domains/user/hooks/use-current-user';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  startOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  format,
  addDays,
  addWeeks,
  addMonths,
  parseISO,
  type Day,
} from 'date-fns';
import { useCompanyWorkWeek } from '@/domains/shared/hooks/use-company-work-week';
import { useInvoicesList } from '@/domains/invoice/hooks/use-invoices-list';
import { Table } from '@/components/ui/Table';
import type { TableColumn } from '@/components/ui/Table/types';
import { Button } from '@/components/ui/Button';
import { ChevronLeft, ChevronRight, Download, Mail } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/Dialog';
import type { InvoiceListItem } from '@/domains/invoice/types';
import type { InvoiceForPdf } from '@/components/invoices/invoice-pdf-types';
import { InvoicePreviewModal } from '@/components/invoices/InvoicePreviewModal';

type DateMode = 'day' | 'week' | 'month' | 'custom';

// TODO: Remove this filter in the future - temporary restriction to hide invoices prior to 2/23/2026
const TEMP_CUTOFF_DATE = '2026-02-23';

function getRange(
  mode: DateMode,
  base: Date,
  customStart: string,
  customEnd: string,
  weekStartsOn: number
) {
  if (mode === 'custom' && customStart && customEnd) {
    return { start: customStart, end: customEnd };
  }
  if (mode === 'day') {
    const s = startOfDay(base);
    return { start: format(s, 'yyyy-MM-dd'), end: format(s, 'yyyy-MM-dd') };
  }
  if (mode === 'week') {
    const day = weekStartsOn as Day;
    const s = startOfWeek(base, { weekStartsOn: day });
    const e = endOfWeek(base, { weekStartsOn: day });
    return { start: format(s, 'yyyy-MM-dd'), end: format(e, 'yyyy-MM-dd') };
  }
  const s = startOfMonth(base);
  const e = endOfMonth(base);
  return { start: format(s, 'yyyy-MM-dd'), end: format(e, 'yyyy-MM-dd') };
}

function rangeLabel(mode: DateMode, base: Date, weekStartsOn: number) {
  if (mode === 'day') return format(base, 'MMM d, yyyy');
  if (mode === 'week') {
    const day = weekStartsOn as Day;
    const s = startOfWeek(base, { weekStartsOn: day });
    const e = endOfWeek(base, { weekStartsOn: day });
    return `${format(s, 'MMM d')} – ${format(e, 'MMM d, yyyy')}`;
  }
  return format(base, 'MMMM yyyy');
}

export default function InvoicesPage() {
  const router = useRouter();
  const { data: currentUser } = useCurrentUser();
  const isClient = currentUser?.userType === 'Client';

  const {
    shouldShowContent,
    isLoading: authLoading,
    error: authError,
  } = usePageAuth({ requireAuth: true });

  useEffect(() => {
    if (!authLoading && shouldShowContent && !isClient) {
      router.replace('/dashboard');
    }
  }, [authLoading, shouldShowContent, isClient, router]);

  const { weekStartsOn = 0 } = useCompanyWorkWeek();
  const [dateMode, setDateMode] = useState<DateMode>('month');
  const [baseDate, setBaseDate] = useState(() => startOfMonth(new Date()));
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [page, setPage] = useState(1);
  const [reportType, setReportType] = useState<'summary' | 'detail'>('summary');
  const limit = 10;

  const { start, end } = useMemo(
    () => getRange(dateMode, baseDate, customStart, customEnd, weekStartsOn),
    [dateMode, baseDate, customStart, customEnd, weekStartsOn]
  );

  // TODO: Remove this effect when TEMP_CUTOFF_DATE is removed
  // Adjust baseDate if current range is before cutoff
  useEffect(() => {
    if (dateMode === 'custom') return;
    if (end < TEMP_CUTOFF_DATE) {
      // Move forward to ensure range ends at or after cutoff
      const cutoffDate = parseISO(TEMP_CUTOFF_DATE);
      if (dateMode === 'day') {
        setBaseDate(cutoffDate);
      } else if (dateMode === 'week') {
        // Keep moving forward by weeks until we find one that ends at or after cutoff
        let testDate = cutoffDate;
        let testRange = getRange(dateMode, testDate, '', '', weekStartsOn);
        while (testRange.end < TEMP_CUTOFF_DATE) {
          testDate = addWeeks(testDate, 1);
          testRange = getRange(dateMode, testDate, '', '', weekStartsOn);
        }
        setBaseDate(testDate);
      } else {
        // month mode - use the month containing the cutoff
        setBaseDate(startOfMonth(cutoffDate));
      }
    }
  }, [dateMode, end, weekStartsOn]);

  // TODO: Remove this when TEMP_CUTOFF_DATE is removed
  // Check if navigating to previous period would go before cutoff date
  const isPrevDisabled = useMemo(() => {
    if (dateMode === 'custom') return false;
    let prevDate: Date;
    if (dateMode === 'day') prevDate = addDays(baseDate, -1);
    else if (dateMode === 'week') prevDate = addWeeks(baseDate, -1);
    else prevDate = addMonths(baseDate, -1);
    
    const prevRange = getRange(dateMode, prevDate, customStart, customEnd, weekStartsOn);
    return prevRange.end < TEMP_CUTOFF_DATE;
  }, [dateMode, baseDate, customStart, customEnd, weekStartsOn]);

  const { data, isLoading } = useInvoicesList(
    start,
    end,
    page,
    limit,
    !!isClient && shouldShowContent
  );

  const handlePrev = () => {
    if (dateMode === 'day') setBaseDate((d) => addDays(d, -1));
    else if (dateMode === 'week') setBaseDate((d) => addWeeks(d, -1));
    else setBaseDate((d) => addMonths(d, -1));
    setPage(1);
  };
  const handleNext = () => {
    if (dateMode === 'day') setBaseDate((d) => addDays(d, 1));
    else if (dateMode === 'week') setBaseDate((d) => addWeeks(d, 1));
    else setBaseDate((d) => addMonths(d, 1));
    setPage(1);
  };

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailInvoiceIds, setEmailInvoiceIds] = useState<string[]>([]);
  const [emailTo, setEmailTo] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const [previewInvoiceId, setPreviewInvoiceId] = useState<string | null>(null);

  const openEmailModal = (ids: string[]) => {
    // TODO: Remove this filter when TEMP_CUTOFF_DATE is removed
    // Filter to only include invoices with endDate >= TEMP_CUTOFF_DATE
    const validIds = ids.filter((id) => {
      const invoice = (data?.data ?? []).find((inv) => inv._id === id);
      if (!invoice) return false;
      const endDate = invoice.endDate as string | undefined;
      return !endDate || endDate >= TEMP_CUTOFF_DATE;
    });
    
    if (validIds.length === 0) {
      alert('No valid invoices to email. Invoices prior to 2/23/2026 are temporarily unavailable.');
      return;
    }
    
    setEmailInvoiceIds(validIds);
    setEmailTo('');
    setEmailMessage('');
    setEmailSent(false);
    setEmailModalOpen(true);
  };

  const sendEmail = async () => {
    const toEmails = emailTo
      .split(/[\s,;]+/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (!toEmails.length) return;
    setEmailSending(true);
    try {
      const res = await fetch('/api/invoices/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceIds: emailInvoiceIds,
          toEmails,
          message: emailMessage,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setEmailSent(true);
        setTimeout(() => setEmailModalOpen(false), 1500);
      } else {
        alert(json.message || 'Failed to send');
      }
    } catch (e) {
      alert((e as Error).message || 'Failed to send');
    } finally {
      setEmailSending(false);
    }
  };

  const downloadInvoice = async (
    invoiceId: string,
    format: 'xlsx' | 'csv' | 'pdf'
  ) => {
    if (format === 'pdf') {
      try {
        const res = await fetch(`/api/invoices/${invoiceId}`);
        const json = await res.json();
        if (!json.success || !json.data) {
          alert(json.message || 'Failed to load invoice');
          return;
        }
        const inv = json.data as InvoiceForPdf;
        const { downloadInvoicePdf } = await import('@/components/invoices/InvoicePdfDownloader');
        await downloadInvoicePdf(inv);
      } catch (e) {
        alert((e as Error).message || 'Failed to generate PDF');
      }
      return;
    }
    window.open(`/api/invoices/${invoiceId}/export?format=${format}`, '_blank');
  };

  const downloadReport = (
    reportType: 'summary' | 'detail',
    format: 'xlsx' | 'csv'
  ) => {
    // TODO: Remove this date validation when TEMP_CUTOFF_DATE is removed
    if (end < TEMP_CUTOFF_DATE) {
      alert('No invoices available for the selected date range. Invoices prior to 2/23/2026 are temporarily unavailable.');
      return;
    }
    
    const adjustedStart = start < TEMP_CUTOFF_DATE ? TEMP_CUTOFF_DATE : start;
    
    const body = JSON.stringify({
      startDate: adjustedStart,
      endDate: end,
      reportType,
      format,
    });
    fetch('/api/invoices/export-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `invoice-report-${adjustedStart}-${end}-${reportType}.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch((e) => alert((e as Error).message));
  };

  const columns: TableColumn<InvoiceListItem>[] = [
    {
      key: 'logoUrl',
      header: 'Logo',
      sortable: false,
      render: (_v, row) =>
        row.logoUrl ? (
          <Image
            src={row.logoUrl}
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 object-contain rounded"
            unoptimized
          />
        ) : (
          <span className="text-gray-400 text-xs">–</span>
        ),
    },
    {
      key: 'venueSlug',
      header: 'Venue',
      sortable: true,
      render: (_v, row) =>
        row.venueName ||
        (row.venueSlug ? String(row.venueSlug).toUpperCase() : '') ||
        '–',
    },
    {
      key: 'eventName',
      header: 'Event/Job',
      sortable: true,
      render: (_v, row) => (row.eventName || row.jobName || row.title) ?? '–',
    },
    {
      key: 'jobSlug',
      header: 'Type',
      sortable: true,
      render: (_v, row) => (row.jobSlug ? 'Shift Job' : 'Event'),
    },
    {
      key: 'createdDate',
      header: 'Date Created',
      sortable: true,
      render: (_v, row) => {
        const d = row.createdDate;
        if (!d) return '–';
        try {
          return format(new Date(d), 'yyyy-MM-dd');
        } catch {
          return '–';
        }
      },
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (_v, row) => row.status ?? '–',
    },
    {
      key: 'invoiceNumber',
      header: 'Invoice #',
      sortable: true,
      render: (_v, row) =>
        (row.invoiceNumber ?? '').toString().padStart(8, '0'),
    },
    {
      key: 'totalAmount',
      header: 'Amount',
      sortable: true,
      render: (_v, row) =>
        new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
        }).format(Number(row.totalAmount ?? 0)),
    },
    {
      key: 'actions',
      header: 'Invoice Actions',
      sortable: false,
      render: (_v, row) => (
        <div
          className="flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <select
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
            onChange={(e) => {
              const v = e.target.value;
              if (v) downloadInvoice(row._id, v as 'xlsx' | 'csv' | 'pdf');
              e.target.value = '';
            }}
          >
            <option value="">Download</option>
            <option value="xlsx">Excel</option>
            <option value="csv">CSV</option>
            <option value="pdf">PDF</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => openEmailModal([row._id])}
          >
            <Mail className="h-4 w-4 mr-1" />
            Email
          </Button>
        </div>
      ),
    },
  ];

  // TODO: Remove this filter when TEMP_CUTOFF_DATE is removed
  const tableData = (data?.data ?? []).filter((invoice) => {
    const endDate = invoice.endDate as string | undefined;
    return !endDate || endDate >= TEMP_CUTOFF_DATE;
  });
  const pagination = data?.pagination ?? {
    page: 1,
    limit: 10,
    totalPages: 0,
    total: 0,
  };

  if (authLoading) return <AuthLoadingState />;
  if (authError) return <AuthErrorState error={authError.message} />;
  if (!shouldShowContent) return <UnauthenticatedState />;
  if (!isClient) return null; // redirecting

  return (
    <Layout title="Invoices">
      <div className="p-4 md:p-6 space-y-4">
        <h1 className="text-xl font-semibold text-gray-900">Invoices</h1>
        <p className="text-sm text-gray-600">
          View and download invoices for your venues. Read-only.
        </p>
        
        {/* TODO: Remove this notice when TEMP_CUTOFF_DATE is removed */}
        <div className="bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
          <p className="text-xs text-blue-800">
            Note: Invoices prior to February 23, 2026 are temporarily unavailable.
          </p>
        </div>

        {/* Period selector: filter by pay period (same concept as sp1-api / stadium-people) */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-gray-700">Period:</span>
          <Select
            value={dateMode}
            onValueChange={(v) => {
              setDateMode(v as DateMode);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue
                placeholder="Period"
                displayText={
                  dateMode === 'custom'
                    ? 'Custom'
                    : dateMode.charAt(0).toUpperCase() + dateMode.slice(1)
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Day</SelectItem>
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="month">Month</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>

          {dateMode === 'custom' ? (
            <div className="flex items-center gap-2">
              <Label className="text-sm">From</Label>
              <Input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                min={TEMP_CUTOFF_DATE}
                className="w-[140px]"
              />
              <Label className="text-sm">To</Label>
              <Input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                min={TEMP_CUTOFF_DATE}
                className="w-[140px]"
              />
            </div>
          ) : (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handlePrev}
                disabled={isPrevDisabled}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[200px] text-center font-medium text-gray-700">
                {rangeLabel(dateMode, baseDate, weekStartsOn)}
              </span>
              <Button variant="outline" size="sm" onClick={handleNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>

        {/* Report export: Summary / Detail, Excel / CSV */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-600">Export report:</span>
          <Select
            value={reportType}
            onValueChange={(v) => setReportType(v as 'summary' | 'detail')}
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue
                displayText={reportType === 'summary' ? 'Summary' : 'Detail'}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="summary">Summary</SelectItem>
              <SelectItem value="detail">Detail</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadReport(reportType, 'xlsx')}
            disabled={end < TEMP_CUTOFF_DATE}
          >
            <Download className="h-4 w-4 mr-1" />
            Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadReport(reportType, 'csv')}
            disabled={end < TEMP_CUTOFF_DATE}
          >
            <Download className="h-4 w-4 mr-1" />
            CSV
          </Button>
        </div>

        {/* Email selected (if we add row selection later) - for now single email from row */}
        {/* Table */}
        <div className="border rounded-lg bg-white">
          <Table
            title=""
            description=""
            columns={columns}
            data={tableData}
            showPagination={false}
            selectable={false}
            emptyMessage="No invoices for the selected date range."
            loading={isLoading}
            pageSize={limit}
            onRowClick={(row) => setPreviewInvoiceId(row._id)}
          />
        </div>

        {/* Simple pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span>
              Page {page} of {pagination.totalPages} ({pagination.total} total)
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Invoice preview modal (same content as stadium-people) */}
      <InvoicePreviewModal
        open={!!previewInvoiceId}
        onOpenChange={(open) => !open && setPreviewInvoiceId(null)}
        invoiceId={previewInvoiceId}
        onDownloadPdf={
          previewInvoiceId
            ? () => downloadInvoice(previewInvoiceId, 'pdf')
            : undefined
        }
        onSendEmail={
          previewInvoiceId
            ? (ids) => {
                setPreviewInvoiceId(null);
                openEmailModal(ids);
              }
            : undefined
        }
      />

      {/* Email modal */}
      <Dialog open={emailModalOpen} onOpenChange={setEmailModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Email invoice{emailInvoiceIds.length > 1 ? 's' : ''}
            </DialogTitle>
          </DialogHeader>
          {emailSent ? (
            <p className="text-green-600">Sent successfully.</p>
          ) : (
            <>
              <div className="space-y-2">
                <Label>To (comma or space separated)</Label>
                <Input
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="email1@example.com, email2@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Message (optional)</Label>
                <textarea
                  className="w-full min-h-[80px] rounded border border-gray-300 px-3 py-2 text-sm"
                  value={emailMessage}
                  onChange={(e) => setEmailMessage(e.target.value)}
                  placeholder="Optional message..."
                />
              </div>
            </>
          )}
          {!emailSent && (
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setEmailModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={sendEmail}
                disabled={emailSending || !emailTo.trim()}
              >
                {emailSending ? 'Sending…' : 'Send'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
