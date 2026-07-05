"use client";

import PlaceholderPage from '@/components/PlaceholderPage';

export default function SettingsPage() {
  return (
    <PlaceholderPage
      icon="⚙️"
      title="Settings"
      badge="🔮 Future Milestone"
      badgeColor="#ff6600"
      heading="Admin Configuration"
      description="This page will provide configuration interfaces for admin settings, including content pipeline configuration, API keys, and system preferences."
      features={[
        'Content pipeline configuration (paths, validation rules)',
        'API key management for external services (asset generation, etc.)',
        'System preferences (theme, notifications, defaults)',
        <>Integration with <code style={{ color: "#aaa" }}>GET/PUT /admin/settings</code> API endpoints</>,
      ]}
      footnote="Not yet scheduled for a specific milestone. Will be implemented as admin tooling matures and configuration needs arise."
      buttonLabel="⚙️ Configure Settings (Coming Soon)"
    />
  );
}
