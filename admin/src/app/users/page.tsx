import { PageHeader } from '@/components/ui';

export default function UsersPage() {
  return (
    <div>
      <PageHeader title="User Management" description="Admin & Player Management" />
      <div style={{ padding: '2rem', color: '#888' }}>
        <p>This page will provide admin and user management interfaces.</p>
        <ul style={{ marginTop: '1rem', paddingLeft: '1.5rem' }}>
          <li>User list with search, filter, and pagination</li>
          <li>Role management (player, admin, developer)</li>
          <li>Account status controls (ban, suspend, verify)</li>
          <li>User detail view with activity history</li>
        </ul>
        <p style={{ marginTop: '1rem', color: '#555' }}>
          Coming soon — not yet scheduled for a specific milestone.
        </p>
      </div>
    </div>
  );
}
