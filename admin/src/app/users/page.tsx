"use client";

import PlaceholderPage from '@/components/PlaceholderPage';

export default function UsersPage() {
  return (
    <PlaceholderPage
      icon="👥"
      title="User Management"
      badge="🔮 Future Milestone"
      badgeColor="#ff6600"
      heading="Admin & Player Management"
      description="This page will provide admin and user management interfaces for viewing, editing, and managing player accounts and admin roles."
      features={[
        'User list with search, filter, and pagination',
        'Role management (player, admin, developer)',
        'Account status controls (ban, suspend, verify)',
        'User detail view with activity history',
        'Integration with <code style={{ color: "#aaa" }}>GET /admin/users</code> API endpoints',
      ]}
      footnote="Not yet scheduled for a specific milestone. Will be implemented when admin tooling expands to cover user management."
      buttonLabel="👥 Manage Users (Coming Soon)"
    />
  );
}
