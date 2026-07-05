"use client";

import PlaceholderPage from '@/components/PlaceholderPage';

export default function CharactersPage() {
  return (
    <PlaceholderPage
      icon="📋"
      title="Characters"
      badge="📌 Milestone 6 — Content List Views"
      badgeColor="#9900ff"
      heading="Character Browser"
      description="This page will provide a read-only browser for all characters, showing portrait status, NPC type, faction affiliations, and YAML preview."
      features={[
        'Table of all characters with name, type, faction, and portrait status columns',
        'Filter by faction, type, or district',
        'Click-through to character detail with YAML preview',
        <>Integration with <code style={{ color: "#aaa" }}>GET /admin/characters</code> API endpoint</>,
      ]}
      footnote="Server-side API endpoint to be implemented as part of M6."
      buttonLabel="🔍 Refresh (Coming in M6)"
    />
  );
}
