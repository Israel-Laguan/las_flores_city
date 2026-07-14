import type { Metadata } from 'next';
import './globals.css';
import { getAdminUser } from '@/lib/api';

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
        {adminUser && (
          <nav>
            <span>{adminUser.email}</span>
          </nav>
        )}
        {children}
      </body>
    </html>
  );
}
