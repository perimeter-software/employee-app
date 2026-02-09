'use client';

/**
 * Client component that handles PDF generation and download.
 * Separated to avoid Turbopack dynamic import issues.
 */

import { pdf } from '@react-pdf/renderer';
import { InvoicePreviewPDF, invoicePdfFilename } from './InvoicePreviewPDF';
import type { InvoiceForPdf } from './invoice-pdf-types';

export async function downloadInvoicePdf(invoice: InvoiceForPdf): Promise<void> {
  try {
    const blob = await pdf(<InvoicePreviewPDF invoice={invoice} />).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = invoicePdfFilename(invoice);
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    throw new Error((e as Error).message || 'Failed to generate PDF');
  }
}
