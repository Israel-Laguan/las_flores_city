import { createDetailProxyHandler } from '@/lib/adminApi';

export const dynamic = 'force-dynamic';
export const GET = createDetailProxyHandler('/admin/overlays');
