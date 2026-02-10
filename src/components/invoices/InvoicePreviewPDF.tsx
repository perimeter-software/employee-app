/**
 * Invoice PDF using @react-pdf/renderer – same layout and fields as stadium-people InvoiceEditorPreviewPDF.
 * Same sections: header (left: invoice info, right: From), Bill To, table, totals (Notes left, Total right).
 */

import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';
import type { InvoiceForPdf } from './invoice-pdf-types';

// Disable hyphenation so words like "Stadium" wrap to the next line instead of "Sta-dium"
Font.registerHyphenationCallback((word) => [word]);

export type { InvoiceForPdf } from './invoice-pdf-types';

// Same StyleSheet structure as stadium-people InvoiceEditorPreviewPDF
const styles = StyleSheet.create({
  page: {
    padding: 24,
    paddingTop: 48,
    fontFamily: 'Helvetica',
    fontSize: 12,
  },
  fixedHeader: {
    paddingTop: 8,
  },
  contentBelowHeader: {
    marginTop: 280,
  },
  invoiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  invoiceTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  invoiceInfo: {
    marginBottom: 4,
  },
  invoiceInfoContainer: {
    width: '45%',
  },
  companyInfo: {
    textAlign: 'right',
    marginTop: 4,
    width: '45%',
  },
  sectionTitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  customerInfo: {
    marginBottom: 20,
  },
  customerName: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  table: {
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    padding: 8,
    borderBottom: '1px solid #e0e0e0',
  },
  tableHeaderCell: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#666',
    textTransform: 'uppercase',
    paddingLeft: 4,
    paddingRight: 4,
  },
  tableRow: {
    flexDirection: 'row',
    padding: 8,
    borderBottom: '1px solid #e0e0e0',
  },
  tableCell: {
    fontSize: 10,
    paddingLeft: 4,
    paddingRight: 4,
  },
  tableCellRight: {
    fontSize: 10,
    paddingLeft: 4,
    paddingRight: 4,
    textAlign: 'right',
  },
  // Summary view column widths (same as stadium-people summaryCol*)
  summaryCol2: { width: '15%' },  // DATE
  summaryCol3: { width: '45%' },  // POSITION
  summaryCol4: { width: '12%' },  // QTY STAFF
  summaryCol5: { width: '13%' },  // RATE
  summaryCol6: { width: '15%' },  // AMOUNT
  headerCellRight: { textAlign: 'right' as const },
  totalsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 16,
    borderTop: '1px solid #e0e0e0',
  },
  totalsBox: {
    minWidth: 180,
    alignItems: 'flex-end',
  },
  notesBox: {
    flex: 1,
    maxWidth: 320,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  totalsFinal: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  notesFinal: {
    fontSize: 14,
  },
});

const moneyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatAttn(attn: string | undefined): string {
  if (!attn || !String(attn).trim()) return '-';
  return String(attn).replace(/^\s*Attn:\s*/i, '').trim() || '-';
}

type Props = {
  invoice: InvoiceForPdf;
};

export function InvoicePreviewPDF({ invoice }: Props) {
  const inv = invoice;
  const invoiceNumber = (inv.invoiceNumber ?? '').toString().padStart(8, '0');
  const eventOrJobName = inv.jobSlug ? inv.jobName : inv.eventName ?? '-';
  const invoiceDateDisplay = inv.invoiceDate ?? inv.startDate ?? '-';
  const dueDateDisplay = inv.dueDate ?? invoiceDateDisplay;
  const purchaseOrderDisplay = inv.purchaseOrder ?? '-';
  const details = inv.details ?? [];
  const totalAmount =
    inv.totalAmount ??
    details.reduce(
      (sum, d) =>
        sum +
        ((Number(d?.totalHours) || 0) * (Number(d?.billRate) || 0) +
          (Number(d?.totalOvertimeHours) || 0) *
            (Number(d?.billRate) || 0) *
            1.5),
      0
    );
  const from = inv.from ?? {};
  const to = inv.to ?? {};
  const slugFallback = inv.venueSlug ? String(inv.venueSlug).toUpperCase() : '';
  const toName = (to.name ?? inv.venueName ?? slugFallback) || '-';

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Fixed header so it repeats on every page and is not cut off when table has many rows */}
        <View fixed style={styles.fixedHeader}>
          <View style={styles.invoiceHeader}>
          <View style={styles.invoiceInfoContainer}>
            <Text style={styles.invoiceTitle}>INVOICE</Text>
            <Text style={styles.invoiceInfo}>
              <Text style={{ fontWeight: 'bold' }}>Invoice Number:</Text> {invoiceNumber}
            </Text>
            <Text style={styles.invoiceInfo}>
              <Text style={{ fontWeight: 'bold' }}>Purchase Order:</Text> {purchaseOrderDisplay}
            </Text>
            <Text style={styles.invoiceInfo}>
              <Text style={{ fontWeight: 'bold' }}>Event/Job:</Text> {eventOrJobName}
            </Text>
            <Text style={styles.invoiceInfo}>
              <Text style={{ fontWeight: 'bold' }}>Invoice Date:</Text> {invoiceDateDisplay}
            </Text>
            <Text style={styles.invoiceInfo}>
              <Text style={{ fontWeight: 'bold' }}>Due Date:</Text> {dueDateDisplay}
            </Text>
          </View>
          <View style={styles.companyInfo}>
            <Text style={styles.sectionTitle}>From:</Text>
            <Text style={[styles.invoiceInfo, { fontWeight: 'bold' }]}>{(from.name && String(from.name).trim()) || 'Stadium People'}</Text>
            <Text style={styles.invoiceInfo}>{(from.address && String(from.address).trim()) || '-'}</Text>
            <Text style={styles.invoiceInfo}>
              {[from.city, from.state, from.zip].filter(Boolean).map(String).join(', ').trim() || '-'}
            </Text>
            <Text style={styles.invoiceInfo}>
              <Text style={{ fontWeight: 'bold' }}>Attn:</Text> {formatAttn(from.attn)}
            </Text>
          </View>
        </View>

        {/* Customer Information – same as stadium-people */}
        <View style={styles.customerInfo}>
          <Text style={styles.sectionTitle}>Bill To:</Text>
          <Text style={styles.customerName}>{toName}</Text>
          <Text style={styles.invoiceInfo}>{(to.address && String(to.address).trim()) || '-'}</Text>
          <Text style={styles.invoiceInfo}>
            {[to.city, to.state, to.zip].filter(Boolean).map(String).join(', ').trim() || '-'}
          </Text>
          <Text style={styles.invoiceInfo}>
            <Text style={{ fontWeight: 'bold' }}>Attn:</Text> {formatAttn(to.attn)}
          </Text>
        </View>
        </View>

        {/* Table + totals: flow below fixed header so top is never cut off */}
        <View style={styles.contentBelowHeader}>
        {/* Table – same column headers and data as modal: DATE, POSITION, QTY STAFF, RATE, AMOUNT */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.summaryCol2]}>DATE</Text>
            <Text style={[styles.tableHeaderCell, styles.summaryCol3]}>POSITION</Text>
            <Text style={[styles.tableHeaderCell, styles.summaryCol4, styles.headerCellRight]}>QTY STAFF</Text>
            <Text style={[styles.tableHeaderCell, styles.summaryCol5, styles.headerCellRight]}>RATE</Text>
            <Text style={[styles.tableHeaderCell, styles.summaryCol6, styles.headerCellRight]}>AMOUNT</Text>
          </View>
          {details.map((d, index) => {
            const rate = Number(d?.billRate) || 0;
            const hours = Number(d?.totalHours) || 0;
            const ot = Number(d?.totalOvertimeHours) || 0;
            const lineTotal = hours * rate + ot * rate * 1.5;
            const positionStr = String(d.position ?? d.positionName ?? (d as { positionTitle?: string }).positionTitle ?? '').trim() || '—';
            const qty = d.totalEmployees ?? 1;
            const rowDate = d.date ?? invoiceDateDisplay;
            return (
              <View key={index} style={styles.tableRow}>
                <Text style={[styles.tableCell, styles.summaryCol2]}>{rowDate}</Text>
                <Text style={[styles.tableCell, styles.summaryCol3]}>{positionStr}</Text>
                <Text style={[styles.tableCellRight, styles.summaryCol4]}>{qty}</Text>
                <Text style={[styles.tableCellRight, styles.summaryCol5]}>{moneyFormatter.format(rate)}</Text>
                <Text style={[styles.tableCellRight, styles.summaryCol6]}>{moneyFormatter.format(lineTotal)}</Text>
              </View>
            );
          })}
        </View>

        {/* Invoice Totals – Notes left, Total right (compact alignment) */}
        <View style={styles.totalsContainer}>
          <View style={styles.notesBox}>
            <Text style={styles.notesFinal}>
              <Text style={{ fontWeight: 'bold' }}>Notes:</Text> {inv.notes ?? from.notes ?? '-'}
            </Text>
          </View>
          <View style={styles.totalsBox}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsFinal}>Total:</Text>
              <Text style={styles.totalsFinal}>{moneyFormatter.format(totalAmount)}</Text>
            </View>
          </View>
        </View>
        </View>
      </Page>
    </Document>
  );
}

export function invoicePdfFilename(inv: InvoiceForPdf): string {
  const num = (inv.invoiceNumber ?? '').toString().padStart(8, '0');
  const name = (inv.jobSlug ? inv.jobName : inv.eventName) ?? '';
  const safe = name.replace(/\W/g, '_');
  const start = inv.startDate ?? '';
  return `${num}-${safe}-${start}.pdf`;
}
