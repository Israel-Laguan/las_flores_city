import { PageHeader } from '@/components/ui';

export default function SettingsPage() {
  return (
    <div>
      <PageHeader title="Settings" description="Admin Configuration" />
      <div style={{ padding: '2rem', color: '#888' }}>
        <p>This page will provide configuration interfaces for admin settings.</p>
        <ul style={{ marginTop: '1rem', paddingLeft: '1.5rem' }}>
          <li>Content pipeline configuration (paths, validation rules)</li>
          <li>API key management for external services</li>
          <li>System preferences (theme, notifications, defaults)</li>
        </ul>
        <p style={{ marginTop: '1rem', color: '#555' }}>
          Coming soon — not yet scheduled for a specific milestone.
        </p>
      </div>
    </div>
  );
}
