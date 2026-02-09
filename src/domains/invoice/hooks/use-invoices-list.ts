import { useQuery } from '@tanstack/react-query';
import type { InvoicesListResponse } from '../types';

function fetchInvoices(params: {
  startDate: string;
  endDate: string;
  page: number;
  limit: number;
  sort?: string;
}): Promise<InvoicesListResponse> {
  const sp = new URLSearchParams();
  sp.set('startDate', params.startDate);
  sp.set('endDate', params.endDate);
  sp.set('page', String(params.page));
  sp.set('limit', String(params.limit));
  if (params.sort) sp.set('sort', params.sort);
  return fetch(`/api/invoices?${sp.toString()}`).then((r) => {
    if (!r.ok) throw new Error(r.statusText);
    return r.json();
  });
}

export function useInvoicesList(
  startDate: string,
  endDate: string,
  page: number,
  limit: number,
  enabled: boolean
) {
  return useQuery({
    queryKey: ['invoices', startDate, endDate, page, limit],
    queryFn: () => fetchInvoices({ startDate, endDate, page, limit, sort: 'eventDate:desc' }),
    enabled: enabled && !!startDate && !!endDate,
  });
}
