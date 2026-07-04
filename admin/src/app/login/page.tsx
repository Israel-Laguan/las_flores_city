import type { CSSProperties } from 'react';
import Link from 'next/link';

const styles = {
  main: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    fontFamily: 'monospace',
    backgroundColor: '#1a1a2e',
    color: '#00ff00'
  },
  heading: {
    color: '#00ff00',
    marginBottom: '2rem',
    fontSize: '2rem'
  },
  form: {
    backgroundColor: '#0d0d1a',
    padding: '2rem',
    borderRadius: '8px',
    border: '1px solid #00ff00',
    width: '100%',
    maxWidth: '400px'
  },
  formGroup: {
    marginBottom: '1.5rem'
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    color: '#00ff00'
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    backgroundColor: '#1a1a2e',
    border: '1px solid #00ff00',
    borderRadius: '4px',
    color: '#00ff00',
    fontFamily: 'monospace'
  },
  button: {
    width: '100%',
    padding: '0.75rem',
    backgroundColor: '#00ff00',
    color: '#000',
    border: 'none',
    borderRadius: '4px',
    fontWeight: 'bold',
    fontFamily: 'monospace',
    cursor: 'pointer',
    fontSize: '1rem'
  },
  error: {
    color: '#ff0000',
    marginBottom: '1rem',
    textAlign: 'center' as const
  },
  backLink: {
    marginTop: '2rem',
    color: '#00ff00',
    textDecoration: 'none'
  }
} satisfies Record<string, CSSProperties>;

export default function LoginPage() {
  return (
    <main style={styles.main}>
      <h1 style={styles.heading}>Las Flores 2077 - Admin Login</h1>

      <form style={styles.form} action="/api/auth/admin-login" method="POST">
        <div style={styles.formGroup}>
          <label htmlFor="email" style={styles.label}>Email</label>
          <input 
            type="email" 
            id="email" 
            name="email" 
            style={styles.input} 
            required 
            placeholder="admin@example.com"
          />
        </div>

        <div style={styles.formGroup}>
          <label htmlFor="password" style={styles.label}>Password</label>
          <input 
            type="password" 
            id="password" 
            name="password" 
            style={styles.input} 
            required 
            placeholder="••••••••"
          />
        </div>

        <button type="submit" style={styles.button}>LOGIN</button>
      </form>

      <Link href="/" style={styles.backLink}>← Back to Home</Link>
    </main>
  );
}