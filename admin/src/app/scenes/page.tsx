"use client";

const styles = {
  main: { padding: '2rem', fontFamily: 'monospace', backgroundColor: '#1a1a2e', minHeight: '100vh', color: '#fff' },
  heading: { color: '#00ff00', marginBottom: '2rem' },
  section: { border: '1px solid #00ff00', padding: '1.5rem', borderRadius: '5px', marginBottom: '2rem' },
  sectionHeading: { color: '#00ff00', marginBottom: '1rem', borderBottom: '1px solid #00ff00', paddingBottom: '0.5rem' },
  button: {
    padding: '0.75rem 1.5rem',
    borderRadius: '5px',
    fontWeight: 'bold',
    fontFamily: 'monospace',
    cursor: 'pointer',
    border: 'none',
    fontSize: '1rem',
  },
  disabledButton: { backgroundColor: '#555', color: '#999', cursor: 'not-allowed' },
  muted: { color: '#888' },
  milestoneBadge: {
    display: 'inline-block',
    backgroundColor: '#9900ff',
    color: '#fff',
    padding: '0.25rem 0.75rem',
    borderRadius: '4px',
    fontSize: '0.8rem',
    fontWeight: 'bold',
    marginBottom: '1rem',
  },
};

export default function ScenesPage() {
  return (
    <main style={styles.main}>
      <h1 style={styles.heading}>🏙️ Scenes</h1>

      <div style={styles.section}>
        <div style={styles.milestoneBadge}>📌 Milestone 6 — Content List Views</div>
        <h2 style={styles.sectionHeading}>Scene Browser</h2>

        <div style={styles.muted}>
          <p style={{ marginBottom: '1rem' }}>
            This page will provide a read-only browser for all scenes, showing district, location,
            required story beats, and YAML preview.
          </p>
          <p style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
            Planned features:
          </p>
          <ul style={{ margin: '0 0 1rem 1.5rem', lineHeight: '1.8' }}>
            <li>Table of all scenes with district, location, and required_story_beat columns</li>
            <li>Filter by district, location, or story beat</li>
            <li>Click-through to scene detail with YAML preview</li>
            <li>Integration with <code style={{ color: '#aaa' }}>GET /admin/scenes</code> API endpoint</li>
          </ul>
          <p style={{ fontSize: '0.85rem', color: '#666' }}>
            Server-side API endpoint to be implemented as part of M6.
          </p>
        </div>

        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
          <button
            disabled
            style={{ ...styles.button, ...styles.disabledButton }}
          >
            🔍 Refresh (Coming in M6)
          </button>
        </div>
      </div>
    </main>
  );
}