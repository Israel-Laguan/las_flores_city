import type { Metadata } from 'next';
import '@las-flores/ui/styles/tokens.css';
import '@las-flores/ui/styles/global.css';
import '@las-flores/ui/styles/components.css';

export const metadata: Metadata = {
  title: 'Las Flores 2077 - Admin Panel',
  description: 'Admin interface for managing Las Flores 2077 game content',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
