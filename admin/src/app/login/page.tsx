'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@las-flores/ui';
import styles from './login.module.css';

const isDev = process.env.NODE_ENV !== 'production';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const formData = new FormData(e.currentTarget);
      const res = await fetch('/api/auth/admin-login', { method: 'POST', body: formData });

      // If the server returned a 303 redirect (legacy path), follow it
      if (res.redirected) {
        window.location.href = res.url;
        return;
      }

      const data = await res.json().catch(() => null);

      if (data?.success) {
        window.location.href = '/';
        return;
      }

      setError(data?.error || 'Login failed');
    } catch (err) {
      console.error('Login fetch error:', err);
      setError('Network error. Is the server running?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>Las Flores 2077 - Admin Login</h1>

      {error && <p className={styles.error}>{error}</p>}

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.formGroup}>
          <label htmlFor="email" className={styles.label}>Email</label>
          <input
            type="email"
            id="email"
            name="email"
            className="input"
            required
            placeholder="admin@example.com"
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="password" className={styles.label}>Password</label>
          <input
            type="password"
            id="password"
            name="password"
            className="input"
            required
            placeholder="••••••••"
          />
        </div>

        <button type="submit" className={cn('btn', 'btn--primary')} disabled={loading}>
          {loading ? 'LOGGING IN...' : 'LOGIN'}
        </button>

        {isDev && (
          <button
            type="button"
            className={cn('btn', 'btn--secondary', styles.devLoginBtn)}
            onClick={async () => {
              setError(null);
              setLoading(true);
              try {
                const res = await fetch('/api/auth/dev-login', { method: 'POST' });
                const data = await res.json().catch(() => null);
                if (data?.success) {
                  window.location.href = '/';
                } else {
                  setError(data?.error || 'Dev login failed');
                }
              } catch {
                setError('Network error. Is the server running?');
              } finally {
                setLoading(false);
              }
            }}
          >
            DEV LOGIN
          </button>
        )}

        <Link href="/" className={styles.backLink}>&larr; Back to Home</Link>
    </form>
    </main>
  );
}
