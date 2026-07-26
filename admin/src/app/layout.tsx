import type { Metadata } from 'next';
import '@las-flores/ui/styles/tokens.css';
import '@las-flores/ui/styles/global.css';
import '@las-flores/ui/styles/components.css';
import { getAdminUser } from '@/lib/api';
import Sidebar from '@/components/Sidebar';
import Breadcrumbs from '@/components/Breadcrumbs';
import styles from './layout.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Las Flores 2077 - Admin Panel',
  description: 'Admin interface for managing Las Flores 2077 game content',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const adminUser = await getAdminUser();

  return (
    <html lang="en">
      <body>
        <Sidebar user={adminUser} />
        <main className={styles.main}>
          <Breadcrumbs />
          {children}
        </main>
      </body>
    </html>
  );
}
