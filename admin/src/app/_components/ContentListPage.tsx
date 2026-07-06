"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { adminStyles as styles } from '@/lib/adminStyles';

interface Column<T> { key: string; label: string; render?: (item: T) => React.ReactNode }
interface ContentListPageProps<T> { title: string; heading: string; endpoint: string; detailPath: string; columns: Column<T>[] }

function ListTable<T extends Record<string, unknown>>({ items, columns, loading, onNavigate }: {
  items: T[]; columns: Column<T>[]; loading: boolean; onNavigate: (id: string) => void;
}) {
  return (
    <table style={styles.table}>
      <thead>
        <tr>{columns.map(col => <th key={col.key} style={styles.th}>{col.label}</th>)}</tr>
      </thead>
      <tbody>
        {items.map((item, idx) => (
          <tr key={(item as any).id ?? idx} onClick={() => onNavigate(String((item as any).id))} style={{ cursor: 'pointer' }} tabIndex={0} role="button"
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(String((item as any).id)); } }}>
            {columns.map(col => <td key={col.key} style={styles.td}>{col.render ? col.render(item) : String(item[col.key] ?? '—')}</td>)}
          </tr>
        ))}
        {!loading && items.length === 0 && (
          <tr><td colSpan={columns.length} style={{ ...styles.td, ...styles.muted, textAlign: 'center' }}>No items found.</td></tr>
        )}
      </tbody>
    </table>
  );
}

function Pagination({ page, total, pageSize, onPageChange }: { page: number; total: number; pageSize: number; onPageChange: (p: number) => void }) {
  const totalPages = Math.ceil(total / pageSize) || 1;
  return (
    <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
      <button onClick={() => onPageChange(page - 1)} disabled={page === 1} style={{ ...styles.button, ...(page === 1 ? styles.disabledButton : styles.secondaryButton) }}>← Prev</button>
      <span style={styles.muted}>Page {page} of {totalPages}</span>
      <button onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} style={{ ...styles.button, ...(page >= totalPages ? styles.disabledButton : styles.secondaryButton) }}>Next →</button>
    </div>
  );
}

export default function ContentListPage<T extends Record<string, unknown>>({ title, heading, endpoint, detailPath, columns }: ContentListPageProps<T>) {
  const router = useRouter();
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const fetchPage = useCallback(async (p: number) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch(`${endpoint}?page=${p}&pageSize=${pageSize}`, { signal: controller.signal });
      const data = await res.json();
      if (data.success) { setItems(data.data.items); setTotal(data.data.total); setError(null); }
      else { setError(data.error || `Failed to fetch ${heading}`); }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(`Failed to fetch ${heading}`);
    } finally { setLoading(false); }
  }, [endpoint, heading, pageSize]);

  useEffect(() => { fetchPage(page); return () => { abortRef.current?.abort(); }; }, [page, fetchPage]);

  const navigateTo = (id: string) => router.push(`${detailPath}/${id}`);

  return (
    <main style={styles.main}>
      <h1 style={styles.heading}>{title}</h1>
      {error && <div style={styles.errorBox}>{error}</div>}
      <div style={styles.section}>
        <h2 style={styles.sectionHeading}>{heading}</h2>
        {loading && items.length === 0 ? <p style={styles.muted}>Loading...</p> : <ListTable items={items} columns={columns} loading={loading} onNavigate={navigateTo} />}
        <Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />
      </div>
    </main>
  );
}
