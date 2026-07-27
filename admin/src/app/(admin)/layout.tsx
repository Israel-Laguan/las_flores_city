import { getAdminUser } from '@/lib/api';
import AdminShell from '@/components/AdminShell';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const adminUser = await getAdminUser();

  return <AdminShell user={adminUser}>{children}</AdminShell>;
}
