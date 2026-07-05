"use client";

import PlaceholderPage from '@/components/PlaceholderPage';

export default function ScenesPage() {
  return (
    <PlaceholderPage
      icon="🏙️"
      title="Scenes"
      badge="📌 Milestone 6 — Content List Views"
      badgeColor="#9900ff"
      heading="Scene Browser"
      description="This page will provide a read-only browser for all scenes, showing district, location, required story beats, and YAML preview."
      features={[
        'Table of all scenes with district, location, and required_story_beat columns',
        'Filter by district, location, or story beat',
        'Click-through to scene detail with YAML preview',
        'Integration with <code style={{ color: "#aaa" }}>GET /admin/scenes</code> API endpoint',
      ]}
      footnote="Server-side API endpoint to be implemented as part of M6."
      buttonLabel="🔍 Refresh (Coming in M6)"
    />
  );
}
