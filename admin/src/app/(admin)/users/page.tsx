'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@las-flores/ui';
import { adminFetch } from '@/lib/client-api';
import styles from './users.module.css';

interface User {
  id: string;
  email: string;
  username: string;
  display_name: string;
  role: string;
  last_login: string | null;
  created_at: string;
}

interface UsersResponse {
  users: User[];
  total: number;
  page: number;
  pageSize: number;
}

const ROLE_BADGES: Record<string, string> = {
  player: 'badge--info',
  admin: 'badge--success',
  developer: 'badge--warning',
};

function Toolbar({
  search,
  roleFilter,
  onSearchChange,
  onRoleFilterChange,
}: {
  search: string;
  roleFilter: string;
  onSearchChange: (value: string) => void;
  onRoleFilterChange: (value: string) => void;
}) {
  return (
    <div className={styles.toolbar}>
      <input
        type="text"
        placeholder="Search by username, email, or display name..."
        value={search}
        onChange={e => onSearchChange(e.target.value)}
        aria-label="Search users by username, email, or display name"
        className={cn('input', styles.searchInput)}
      />
      <select
        value={roleFilter}
        onChange={e => onRoleFilterChange(e.target.value)}
        aria-label="Filter users by role"
        className={cn('select', styles.roleFilter)}
      >
        <option value="">All Roles</option>
        <option value="player">Player</option>
        <option value="admin">Admin</option>
        <option value="developer">Developer</option>
      </select>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (updater: (p: number) => number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className={styles.pagination}>
      <button
        className={cn('btn', 'btn--secondary')}
        onClick={() => onPageChange(p => Math.max(1, p - 1))}
        disabled={page === 1}
      >
        Previous
      </button>
      <span className="muted">
        Page {page} of {totalPages} ({total} users)
      </span>
      <button
        className={cn('btn', 'btn--secondary')}
        onClick={() => onPageChange(p => Math.min(totalPages, p + 1))}
        disabled={page >= totalPages}
      >
        Next
      </button>
    </div>
  );
}

function UserRow({ user }: { user: User }) {
  return (
    <tr>
      <td className={styles.td}>{user.username}</td>
      <td className={styles.td}>{user.email}</td>
      <td className={styles.td}>
        <span className={cn('badge', ROLE_BADGES[user.role] || 'badge--muted')}>
          {user.role}
        </span>
      </td>
      <td className={styles.td} suppressHydrationWarning>
        {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
      </td>
      <td className={styles.td} suppressHydrationWarning>
        {new Date(user.created_at).toLocaleDateString()}
      </td>
    </tr>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 50;
  const requestSeq = useRef(0);

  const fetchUsers = useCallback(async () => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search) params.set('search', search);
      if (roleFilter) params.set('role', roleFilter);

      const result = await adminFetch<{ success: boolean; data?: UsersResponse; error?: string }>(
        `/admin/users?${params}`,
      );
      if (seq !== requestSeq.current) return;
      if (result.success && result.data) {
        setUsers(result.data.users);
        setTotal(result.data.total);
      } else {
        setError(result.error || 'Failed to fetch users');
      }
    } catch {
      if (seq !== requestSeq.current) return;
      setError('Failed to fetch users');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [page, search, roleFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Reset to page 1 when search or role filter changes
  useEffect(() => {
    setPage(1);
  }, [search, roleFilter]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <main className={styles.main}>
      <h1 className={styles.heading}>User Management</h1>

      <Toolbar
        search={search}
        roleFilter={roleFilter}
        onSearchChange={setSearch}
        onRoleFilterChange={setRoleFilter}
      />

      {error && <div className="error-box">{error}</div>}

      {loading ? (
        <p className="muted">Loading users...</p>
      ) : users.length === 0 ? (
        <p className="muted">No users found.</p>
      ) : (
        <>
          <div className={styles.tableWrapper}>
            <table className="table">
              <thead>
                <tr>
                  <th className="table__th">Username</th>
                  <th className="table__th">Email</th>
                  <th className="table__th">Role</th>
                  <th className="table__th">Last Login</th>
                  <th className="table__th">Created</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <UserRow key={user.id} user={user} />
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            onPageChange={setPage}
          />
        </>
      )}
    </main>
  );
}
