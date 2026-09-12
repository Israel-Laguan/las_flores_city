import { adminFetch } from '@/lib/client-api';

export interface ListPlansFilters {
  limit?: number;
  offset?: number;
  status?: string;
  createdBy?: string;
  since?: string;
  q?: string;
  sortBy?: 'created_at' | 'updated_at';
  order?: 'asc' | 'desc';
}

export interface ListPlansResponse {
  success: boolean;
  data?: {
    plans: Array<{
      id: string;
      description: string;
      status: string;
      created_by?: string | null;
      created_at: string;
      updated_at: string;
      item_count: number;
    }>;
    total: number;
    limit: number;
    offset: number;
    filters?: Record<string, string>;
  };
  error?: string;
}

function buildListPlansParams(
  filtersOrLimit?: ListPlansFilters | number,
  offsetParam?: number,
): URLSearchParams {
  const params = new URLSearchParams();
  const filters: ListPlansFilters =
    typeof filtersOrLimit === 'number'
      ? { limit: filtersOrLimit, offset: offsetParam }
      : filtersOrLimit && typeof filtersOrLimit === 'object'
        ? filtersOrLimit
        : { offset: offsetParam };

  if (filters.limit != null) params.set('limit', String(filters.limit));
  if (filters.offset != null) params.set('offset', String(filters.offset));
  if (filters.status) params.set('status', filters.status);
  if (filters.createdBy) params.set('createdBy', filters.createdBy);
  if (filters.since) params.set('since', filters.since);
  if (filters.q) params.set('q', filters.q);
  if (filters.sortBy) params.set('sortBy', filters.sortBy);
  if (filters.order) params.set('order', filters.order);
  return params;
}

export async function listPlans(
  filtersOrLimit?: ListPlansFilters | number,
  offsetParam?: number,
): Promise<ListPlansResponse> {
  const qs = buildListPlansParams(filtersOrLimit, offsetParam).toString();
  return adminFetch<ListPlansResponse>(`/admin/story-builder/plans${qs ? `?${qs}` : ''}`);
}
