"use client";

import PlaceholderPage from '@/components/PlaceholderPage';

export default function DialoguesPage() {
  return (
    <PlaceholderPage
      icon="💬"
      title="Dialogues"
      badge="📌 Milestone 6 — Content List Views"
      badgeColor="#9900ff"
      heading="Dialogue Tree Browser"
      description="This page will provide a read-only browser for all dialogue trees, showing node counts, beat associations, character references, and YAML preview."
      features={[
        'Table of all dialogue trees with node count, character, and beat columns',
        'Filter by character, beat, or dialogue type',
        'Click-through to dialogue detail with node tree visualization',
        <>Integration with <code style={{ color: "#aaa" }}>GET /admin/dialogues</code> API endpoint</>,
      ]}
      footnote="Server-side API endpoint to be implemented as part of M6."
      buttonLabel="🔍 Refresh (Coming in M6)"
    />
  );
}
