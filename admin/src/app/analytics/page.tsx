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
  futureBadge: {
    display: 'inline-block',
    backgroundColor: '#ff6600',
    color: '#000',
    padding: '0.25rem 0.75rem',
    borderRadius: '4px',
    fontSize: '0.8rem',
    fontWeight: 'bold',
    marginBottom: '1rem',
  },
};

export default function AnalyticsPage() {
  return (
    <main style={styles.main}>
      <h1 style={styles.heading}>📊 Analytics</h1>

      <div style={styles.section}>
        <div style={styles.futureBadge}>🔮 Future Milestone</div>
        <h2 style={styles.sectionHeading}>OLAP Metrics Dashboard</h2>

        <div style={styles.muted}>
          <p style={{ marginBottom: '1rem' }}>
            This page will display OLAP metrics and analytics dashboards for monitoring game
            activity, player engagement, and content performance.
          </p>
          <p style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>
            Planned features:
          </p>
          <ul style={{ margin: '0 0 1rem 1.5rem', lineHeight: '1.8' }}>
            <li>Player activity metrics (DAU/MAU, session length)</li>
            <li>Content engagement stats (dialogue completions, mystery resolution rates)</li>
            <li>Leaderboard data visualization</li>
            <li>Time-series charts for key OLAP metrics</li>
            <li>Integration with <code style={{ color: '#aaa' }}>GET /admin/analytics/*</code> API endpoints</li>
          </ul>
          <p style={{ fontSize: '0.85rem', color: '#666' }}>
            Not yet scheduled for a specific milestone. Will be implemented when OLAP infrastructure
            is fully leveraged for admin tooling.
          </p>
        </div>

        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
          <button
            disabled
            style={{ ...styles.button, ...styles.disabledButton }}
          >
            📊 View Dashboard (Coming Soon)
          </button>
        </div>
      </div>
    </main>
  );
}