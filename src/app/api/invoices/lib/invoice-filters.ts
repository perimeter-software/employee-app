/**
 * Shared MongoDB filter fragments for invoice-batches.
 * Used so "Hide Invoice if no PO" is applied consistently in list, report, and export.
 */

/**
 * Condition to exclude invoices that have "Hide Invoice if no PO" enabled and no purchase order.
 * Include an invoice if: hideInvoiceIfNoPO is not true OR purchaseOrder is non-empty.
 */
export function hideInvoiceIfNoPOFilter(): Record<string, unknown> {
  return {
    $or: [
      { 'invoiceInformation.hideInvoiceIfNoPO': { $ne: true } },
      {
        'invoiceInformation.purchaseOrder': {
          $exists: true,
          $nin: [null, ''],
        },
      },
    ],
  };
}
