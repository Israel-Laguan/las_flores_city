"use client";

import PlaceholderPage from '@/components/PlaceholderPage';

export default function AnalyticsPage() {
  return (
    <PlaceholderPage
      icon="📊"
      title="Analytics"
      badge="🔮 Future Milestone"
      badgeColor="#ff6600"
      heading="OLAP Metrics Dashboard"
      description="This page will display OLAP metrics and analytics dashboards for monitoring game activity, player engagement, and content performance."
      features={[
        'Player activity metrics (DAU/MAU, session length)',
        'Content engagement stats (dialogue completions, mystery resolution rates)',
        'Leaderboard data visualization',
        'Time-series charts for key OLAP metrics',
        <>Integration with <code style={{ color: "#aaa" }}>GET /admin/analytics/*</code> API endpoints</>,
      ]}
      footnote="Not yet scheduled for a specific milestone. Will be implemented when OLAP infrastructure is fully leveraged for admin tooling."
      buttonLabel="📊 View Dashboard (Coming Soon)"
    />
  );
}
