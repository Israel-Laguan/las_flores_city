'use client';

import { useState } from 'react';
import Link from 'next/link';
import { cn } from '@las-flores/ui';
import styles from './login.module.css';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    const res = await fetch('/api/auth/admin-login', { method: 'POST', body: formData });
    if (res.redirected) {
      window.location.href = res.url;
      return;
    }
    const data = await res.json().catch(() => null);
    setError(data?.error || 'Login failed');
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

        <button type="submit" className={cn('btn', 'btn--primary')}>
          LOGIN
        </button>
      </form>

      <Link href="/" className={styles.backLink}>&larr; Back to Home</Link>
    </main>
  );
}
