import { ReactNode } from "react";

export interface TableColumn<T extends Record<string, unknown>> {
  key: keyof T;
  header: string;
  render?: (value: T[keyof T], row: T, index: number) => ReactNode;
  className?: string;
  headerClassName?: string;
  sortable?: boolean;
  sortFn?: (a: T, b: T) => number;
  /** If false, this column is omitted from PDF export (e.g. actions, logo). Default true. */
  pdfExport?: boolean;
  /** Optional custom value for PDF export (falls back to raw row[key]). */
  pdfValue?: (row: T, index: number) => string | number | null | undefined;
}

export interface TableProps<T extends Record<string, unknown>> {
  title?: string;
  description?: string;
  columns: TableColumn<T>[];
  data: T[];
  showPagination?: boolean;
  selectable?: boolean;
  className?: string;
  emptyMessage?: string;
  getRowClassName?: (row: T, index: number) => string;
  onRowClick?: (row: T, index: number) => void;
  loading?: boolean;
  loadingRows?: number;
  pageSize?: number;
  pageSizeOptions?: number[];
  enablePdfExport?: boolean;
  pdfFileName?: string;
}
