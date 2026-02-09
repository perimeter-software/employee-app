'use client';

/**
 * Invoice preview modal – same layout as stadium-people InvoiceEditorPreviewModal.
 * Shows Invoice Preview - {number}, SUMMARY/DETAILS tabs, From/Bill To, line items table, Notes/Total, actions.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Download, Mail } from 'lucide-react';
import type { InvoiceForPdf } from './invoice-pdf-types';

const moneyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const numberFormatter = new Intl.NumberFormat('en-US');

function formatAttn(attn: string | undefined): string {
  if (!attn || !String(attn).trim()) return '-';
  return String(attn).replace(/^\s*Attn:\s*/i, '').trim() || '-';
}

type DetailRow = {
  date?: string;
  eventName?: string;
  jobName?: string;
  positionName?: string;
  position?: string;
  totalHours?: number;
  totalOvertimeHours?: number;
  billRate?: number;
  totalEmployees?: number;
  firstName?: string;
  lastName?: string;
  earningId?: string;
  [k: string]: unknown;
};

function lineAmount(d: DetailRow): number {
  const h = Number(d?.totalHours) || 0;
  const ot = Number(d?.totalOvertimeHours) || 0;
  const r = Number(d?.billRate) || 0;
  return h * r + ot * r * 1.5;
}

export type InvoicePreviewModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string | null;
  onDownloadSpreadsheet?: (invoiceId: string) => void;
  onDownloadPdf?: (invoiceId: string) => void;
  onSendEmail?: (invoiceIds: string[]) => void;
};

export function InvoicePreviewModal({
  open,
  onOpenChange,
  invoiceId,
  onDownloadSpreadsheet,
  onDownloadPdf,
  onSendEmail,
}: InvoicePreviewModalProps) {
  const [invoice, setInvoice] = useState<InvoiceForPdf | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'summary' | 'details'>('summary');

  const fetchInvoice = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${id}`);
      const json = await res.json();
      if (!json.success || !json.data) {
        setError(json.message || 'Failed to load invoice');
        setInvoice(null);
        return;
      }
      setInvoice(json.data as InvoiceForPdf);
    } catch (e) {
      setError((e as Error).message);
      setInvoice(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && invoiceId) {
      fetchInvoice(invoiceId);
    } else if (!open) {
      setInvoice(null);
      setError(null);
    }
  }, [open, invoiceId, fetchInvoice]);

  const invoiceNumber = (invoice?.invoiceNumber ?? '')
    .toString()
    .padStart(8, '0');
  const from = invoice?.from ?? {};
  const to = invoice?.to ?? {};
  const details = (invoice?.details ?? []) as DetailRow[];
  const totalAmount = invoice?.totalAmount ?? 0;
  const eventOrJobName = invoice?.jobSlug ? invoice.jobName : invoice?.eventName ?? '-';
  const isShiftJob = !!invoice?.jobSlug;

  const handleClose = () => onOpenChange(false);
  const handleDownloadSheet = () => {
    if (invoiceId) {
      onDownloadSpreadsheet?.(invoiceId);
      window.open(`/api/invoices/${invoiceId}/export?format=xlsx`, '_blank');
    }
  };
  const handleDownloadPdf = () => {
    if (invoiceId) onDownloadPdf?.(invoiceId);
  };
  const handleSendEmail = () => {
    if (invoiceId) {
      onOpenChange(false);
      onSendEmail?.([invoiceId]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="flex flex-row items-center justify-between gap-4 border-b px-6 pr-12 py-4">
          <DialogTitle className="text-lg font-semibold">
            Invoice Preview - {invoiceNumber}
          </DialogTitle>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-md bg-gray-100 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('summary')}
                className={`rounded px-3 py-1.5 text-sm font-medium ${
                  viewMode === 'summary'
                    ? 'bg-primary text-primary-foreground shadow'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Summary
              </button>
              <button
                type="button"
                onClick={() => setViewMode('details')}
                className={`rounded px-3 py-1.5 text-sm font-medium ${
                  viewMode === 'details'
                    ? 'bg-primary text-primary-foreground shadow'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Details
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="flex h-48 items-center justify-center text-gray-500">
              Loading…
            </div>
          )}
          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}
          {!loading && !error && invoice && (
            <>
              {/* Invoice header: left block + From (right) */}
              <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <h2 className="mb-3 text-xl font-bold text-gray-900">INVOICE</h2>
                  <div className="space-y-1 text-sm">
                    <p>
                      <strong>Invoice Number:</strong> {invoiceNumber}
                    </p>
                    <p>
                      <strong>Purchase Order:</strong> {invoice.purchaseOrder ?? '-'}
                    </p>
                    <p>
                      <strong>Invoice Date:</strong> {invoice.invoiceDate ?? '-'}
                    </p>
                    <p>
                      <strong>Due Date:</strong> {invoice.dueDate ?? '-'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium uppercase text-gray-500">From:</p>
                  <p className="font-medium">{from.name || '-'}</p>
                  <p className="text-sm">{from.address || '-'}</p>
                  <p className="text-sm">
                    {[from.city, from.state, from.zip].filter(Boolean).join(', ') || '-'}
                  </p>
                  <p className="text-sm">
                    <strong>Attn:</strong> {formatAttn(from.attn)}
                  </p>
                </div>
              </div>

              {/* Bill To */}
              <div className="mb-6">
                <p className="text-xs font-medium uppercase text-gray-500">Bill To:</p>
                <p className="font-medium">
                  {(to.name ?? invoice.venueName ?? (invoice.venueSlug ? String(invoice.venueSlug).toUpperCase() : '')) || '-'}
                </p>
                <p className="text-sm">{to.address || '-'}</p>
                <p className="text-sm">
                  {[to.city, to.state, to.zip].filter(Boolean).join(', ') || '-'}
                </p>
                <p className="text-sm">
                  <strong>Attn:</strong> {formatAttn(to.attn)}
                </p>
              </div>

              {/* Line items table */}
              <div className="mb-6 overflow-x-auto rounded border">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {viewMode === 'details' ? (
                        <>
                          {!isShiftJob && (
                            <th className="px-3 py-2 text-left font-medium text-gray-600">
                              Date
                            </th>
                          )}
                          <th className="px-3 py-2 text-left font-medium text-gray-600">
                            {isShiftJob ? 'Job' : 'Event'}
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">
                            Employee Name
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">
                            Position
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">
                            Paycode
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">
                            Reg Hours
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">
                            Rate
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">
                            Amount
                          </th>
                        </>
                      ) : (
                        <>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">
                            {isShiftJob ? 'Job' : 'Event'}
                          </th>
                          {!isShiftJob && (
                            <th className="px-3 py-2 text-left font-medium text-gray-600">
                              Date
                            </th>
                          )}
                          <th className="px-3 py-2 text-left font-medium text-gray-600">
                            Position
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">
                            Qty Staff
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">
                            Rate
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-600">
                            Amount
                          </th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {details.map((d, idx) => {
                      const evOrJob = d.eventName ?? d.jobName ?? eventOrJobName;
                      const date = d.date ?? invoice.startDate ?? '-';
                      const pos = (d.position ?? d.positionName ?? (d as { positionTitle?: string }).positionTitle ?? '').toString().trim() || '—';
                      const qty = d.totalEmployees ?? 1;
                      const rate = Number(d.billRate) || 0;
                      const amount = lineAmount(d);
                      const empName =
                        d.firstName != null || d.lastName != null
                          ? [d.firstName, d.lastName].filter(Boolean).join(' ').trim()
                          : '—';
                      const paycode = d.earningId ?? '—';
                      const regHours = Number(d.totalHours) ?? 0;

                      if (viewMode === 'details') {
                        return (
                          <tr key={idx} className="border-t border-gray-100">
                            {!isShiftJob && (
                              <td className="px-3 py-2">{date}</td>
                            )}
                            <td className="px-3 py-2">{evOrJob}</td>
                            <td className="px-3 py-2 font-medium">{empName}</td>
                            <td className="px-3 py-2">{pos}</td>
                            <td className="px-3 py-2">{paycode}</td>
                            <td className="px-3 py-2 text-right">{numberFormatter.format(regHours)}</td>
                            <td className="px-3 py-2 text-right">{moneyFormatter.format(rate)}</td>
                            <td className="px-3 py-2 text-right">{moneyFormatter.format(amount)}</td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={idx} className="border-t border-gray-100">
                          <td className="px-3 py-2">{evOrJob}</td>
                          {!isShiftJob && (
                            <td className="px-3 py-2">{date}</td>
                          )}
                          <td className="px-3 py-2">{pos}</td>
                          <td className="px-3 py-2 text-right">{numberFormatter.format(qty)}</td>
                          <td className="px-3 py-2 text-right">{moneyFormatter.format(rate)}</td>
                          <td className="px-3 py-2 text-right">{moneyFormatter.format(amount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Notes + Total */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-t border-gray-200 pt-4">
                <div className="max-w-md">
                  <p className="text-sm">
                    <strong>Notes:</strong> {invoice.notes ?? from.notes ?? '-'}
                  </p>
                </div>
                <div className="min-w-[200px]">
                  <div className="flex justify-between gap-4 text-base font-bold">
                    <span>Total:</span>
                    <span>{moneyFormatter.format(totalAmount)}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Action bar */}
        {!loading && invoice && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t bg-gray-50 px-6 py-4">
            <Button variant="outline" onClick={handleClose}>
              Close
            </Button>
            <Button
              variant="success"
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handleDownloadSheet}
            >
              <Download className="mr-2 h-4 w-4" />
              Download Spreadsheet
            </Button>
            <Button variant="outline" onClick={handleDownloadPdf}>
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </Button>
            <Button variant="primary" onClick={handleSendEmail}>
              <Mail className="mr-2 h-4 w-4" />
              Send Email
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
