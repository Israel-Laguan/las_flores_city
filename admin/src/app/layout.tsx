import type { Metadata } from 'next'
import './globals.css'
import { getAdminUser } from '../lib/adminApi'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Las Flores 2077 - Admin Panel',
  description: 'Admin interface for managing Las Flores 2077 game content',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const adminUser = await getAdminUser()

  return (
    <html lang="en">
      <body>
        <AdminNav user={adminUser} />
        {children}
      </body>
    </html>
  )
}

function AdminNav({ user }: { user: any }) {
  const styles = {
    nav: {
      backgroundColor: '#0d0d1a',
      padding: '1rem 2rem',
      borderBottom: '1px solid #00ff00',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    logo: {
      color: '#00ff00',
      fontWeight: 'bold',
      fontSize: '1.2rem'
    },
    userInfo: {
      display: 'flex',
      alignItems: 'center',
      gap: '1rem'
    },
    userName: {
      color: '#00ff00'
    },
    roleBadge: {
      backgroundColor: '#00ff00',
      color: '#000',
      padding: '0.25rem 0.75rem',
      borderRadius: '4px',
      fontSize: '0.8rem',
      fontWeight: 'bold'
    },
    logoutButton: {
      backgroundColor: '#ff0000',
      color: '#000',
      padding: '0.5rem 1rem',
      borderRadius: '4px',
      textDecoration: 'none',
      fontWeight: 'bold'
    }
  }

  return (
    <nav style={styles.nav}>
      <div style={styles.logo}>🎮 Las Flores 2077 Admin</div>
      <div style={styles.userInfo}>
        {user ? (
          <>
            <span style={styles.userName}>{user.username || user.email}</span>
            <span style={styles.roleBadge}>{user.role}</span>
            <Link href="/api/auth/logout" style={styles.logoutButton}>LOGOUT</Link>
          </>
        ) : (
          <Link href="/login" style={styles.logoutButton}>LOGIN</Link>
        )}
      </div>
    </nav>
  )
}
