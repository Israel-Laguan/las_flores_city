import { adminFetch } from './client-api';

export interface PromotionStatus {
  contentPath: string;
  name: string;
  slug: string;
  stages: {
    dev?: { url: string };
    staging?: { url: string };
    production?: { url: string };
  };
}

export interface PromotionStatusResponse {
  success: boolean;
  data: PromotionStatus[];
}

export async function fetchPromotionStatus(): Promise<PromotionStatus[]> {
  const data = await adminFetch<PromotionStatusResponse>('/admin/content/assets/promotion-status');
  if (data.success) return data.data;
  throw new Error('Failed to load promotion status');
}

export async function promoteStaging(contentPath: string): Promise<void> {
  await adminFetch('/admin/content/assets/promote-staging', {
    method: 'POST',
    body: JSON.stringify({ contentPath }),
  });
}

export async function promoteProduction(contentPath: string): Promise<void> {
  await adminFetch('/admin/content/assets/promote-production', {
    method: 'POST',
    body: JSON.stringify({ contentPath }),
  });
}

export async function rollbackStaging(contentPath: string): Promise<void> {
  await adminFetch('/admin/content/assets/rollback-staging', {
    method: 'POST',
    body: JSON.stringify({ contentPath }),
  });
}