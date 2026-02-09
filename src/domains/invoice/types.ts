export type InvoiceListItem = {
  _id: string;
  invoiceNumber?: number | string;
  startDate?: string;
  createdDate?: string | Date;
  eventName?: string;
  jobName?: string;
  jobSlug?: string;
  title?: string;
  venueSlug?: string;
  venueName?: string;
  logoUrl?: string;
  status?: string;
  totalAmount?: number;
  [k: string]: unknown;
};

export type InvoicesListResponse = {
  success: boolean;
  data: InvoiceListItem[];
  pagination: { page: number; limit: number; totalPages: number; total: number };
  count: number;
  total: number;
};
