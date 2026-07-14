import { createPaginatedProxyHandler } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';
export const GET = createPaginatedProxyHandler('/admin/vault');
