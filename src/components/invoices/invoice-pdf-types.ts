/**
 * Type for invoice data passed to InvoicePreviewPDF.
 * Kept in a separate file so pages can import it without loading @react-pdf/renderer.
 */
export type InvoiceForPdf = {
  _id: string;
  invoiceNumber?: number | string;
  jobName?: string;
  eventName?: string;
  jobSlug?: string;
  startDate?: string;
  venueSlug?: string;
  venueName?: string;
  from?: {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    attn?: string;
    notes?: string;
  };
  to?: {
    name?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    attn?: string;
  };
  details?: Array<{
    position?: string;
    positionName?: string;
    date?: string;
    totalEmployees?: number;
    totalHours?: number;
    totalOvertimeHours?: number;
    billRate?: number;
    [k: string]: unknown;
  }>;
  totalAmount?: number;
  notes?: string;
  invoiceDate?: string;
  dueDate?: string;
  purchaseOrder?: string;
  [k: string]: unknown;
};
