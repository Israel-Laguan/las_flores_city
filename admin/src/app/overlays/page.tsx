"use client";

import PlaceholderPage from '@/components/PlaceholderPage';

export default function OverlaysPage() {
  return (
    <PlaceholderPage
      icon="🔄"
      title="Overlays"
      badge="📌 Milestone 6 — Content List Views"
      badgeColor="#9900ff"
      heading="Dialogue Overlay Browser"
      description="This page will provide a read-only browser for all dialogue overlays, showing overlay type, associated dialogue trees, node modifications, and YAML preview."
      features={[
        'Table of all overlays with type, dialogue reference, and node count columns',
        'Filter by overlay type or associated dialogue',
        'Click-through to overlay detail with modification diff view',
        <>Integration with <code style={{ color: "#aaa" }}>GET /admin/overlays</code> API endpoint</>,
      ]}
      footnote="Server-side API endpoint to be implemented as part of M6."
      buttonLabel="🔍 Refresh (Coming in M6)"
    />
  );
}
