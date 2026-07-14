'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from './migration.module.css';
import { cn } from '@/lib/cn';
import { adminFetch } from '@/lib/client-api';
import MigrationResultView from './components/MigrationResultView';
import MigrationStatusView from './components/MigrationStatusView';

interface MigrationFile {
  filePath: string;
  checksum: string;
  contentType: string;
  contentId: string;
  appliedAt: string;
  appliedBy: string | null;
}

interface MigrationStatus {
  totalFiles: number;
  byType: Record<string, MigrationFile[]>;
  files: MigrationFile[];
}

interface AppliedMigration {
  filePath: string;
  contentType: string;
  contentId: string;
  action: 'created' | 'updated' | 'skipped';
}

interface MigrationResult {
  success: boolean;
  filesProcessed: number;
  filesSkipped: number;
  filesFailed: number;
  errors: string[];
  appliedMigrations: AppliedMigration[];
}

export default function MigrationPage() {
  const [status, setStatus] = useState<MigrationStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetch<{ success: boolean; data?: MigrationStatus; error?: string }>(
        '/admin/content/status',
      );
      if (data.success) {
        setStatus(data.data ?? null);
      } else {
        setError(data.error || 'Failed to fetch status');
      }
    } catch {
      setError('Failed to fetch migration status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleMigrate = async () => {
    setMigrating(true);
    setResult(null);
    setError(null);
    try {
      const data = await adminFetch<{ success: boolean; data?: MigrationResult; error?: string }>(
        '/admin/content/migrate',
        { method: 'POST' },
      );
      if (data.success) {
        setResult(data.data ?? null);
        await fetchStatus();
      } else {
        setError(data.data?.errors?.join('\n') || data.error || 'Migration failed');
      }
    } catch {
      setError('Migration request failed');
    } finally {
      setMigrating(false);
    }
  };

  return (
    <main className={styles.main}>
      <h1>Content Migration</h1>

      <div className={styles.buttonBar}>
        <button
          onClick={handleMigrate}
          disabled={migrating}
          className={cn(styles.button, migrating ? styles.disabledButton : styles.primaryButton)}
        >
          {migrating ? 'Migrating...' : 'Run Migration'}
        </button>
        <button
          onClick={fetchStatus}
          disabled={loading}
          className={cn(styles.button, loading ? styles.disabledButton : styles.secondaryButton)}
        >
          {loading ? 'Loading...' : 'Refresh Status'}
        </button>
      </div>

      {result && <MigrationResultView result={result} />}

      {error && (
        <div className={styles.errorBox}>
          <pre className={styles.errorPre}>{error}</pre>
        </div>
      )}

      <MigrationStatusView status={status} loading={loading} />
    </main>
  );
}