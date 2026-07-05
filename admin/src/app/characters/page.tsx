"use client";

import { useState } from 'react';

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
  primaryButton: { backgroundColor: '#00ff00', color: '#000' },
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

export default function CharactersPage() {
  const [loading] = useState(false);

  return (
    <main style={styles.main}>
      <h1 style={styles.heading}>📋 Characters</h1>

      <div style={styles.section}>
        <div style={styles.milestoneBadge}>📌 Milestone 6 — Content List Views</div>
        <h2 style={styles.sectionHeading}>Character Browser</h2>

        <div style={styles.muted}>
          <p style={{ marginBottom: '1rem' }}>
            This page will provide a read-only browser for all characters, showing portrait status,
            NPC type, faction affiliations, and YAML preview.
          </p>
          <p style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
            Planned features:
          </p>
          <ul style={{ margin: '0 0 1rem 1.5rem', lineHeight: '1.8' }}>
            <li>Table of all characters with name, type, faction, and portrait status columns</li>
            <li>Filter by faction, type, or district</li>
            <li>Click-through to character detail with YAML preview</li>
            <li>Integration with <code style={{ color: '#aaa' }}>GET /admin/characters</code> API endpoint</li>
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