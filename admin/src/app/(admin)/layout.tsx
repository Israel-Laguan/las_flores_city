import { redirect } from 'next/navigation';
import { getAdminUser } from '@/lib/api';
import AdminShell from '@/components/AdminShell';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const adminUser = await getAdminUser();

  if (!adminUser) {
    redirect('/login');
  }

  return <AdminShell user={adminUser}>{children}</AdminShell>;
}
