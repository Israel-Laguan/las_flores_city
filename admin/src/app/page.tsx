import type { CSSProperties, ReactNode } from 'react';

type Section = {
  title: string;
  items: Array<{ href: string; label: string }>;
};

type Stat = { value: string; label: string };
type Action = { href: string; label: string; variant: 'primary' | 'secondary' };

const sections: Section[] = [
  {
    title: 'Content Management',
    items: [
      { href: '/characters', label: '📋 Characters' },
      { href: '/dialogues', label: '💬 Dialogues' },
      { href: '/overlays', label: '🔄 Overlays' },
      { href: '/scenes', label: '🏙️ Scenes' },
      { href: '/assets', label: '🎨 Asset Generation' },
    ],
  },
  {
    title: 'System',
    items: [
      { href: '/migration', label: '🚀 Content Migration' },
      { href: '/analytics', label: '📊 Analytics' },
      { href: '/users', label: '👥 User Management' },
      { href: '/settings', label: '⚙️ Settings' },
    ],
  },
];

const stats: Stat[] = [
  { value: '1', label: 'Characters' },
  { value: '1', label: 'Dialogues' },
  { value: '1', label: 'Scenes' },
  { value: '1', label: 'Overlays' },
];

const actions: Action[] = [
  { href: '/migration', label: '🚀 Run Migration', variant: 'primary' },
  { href: '/validation', label: '✅ Validate Content', variant: 'secondary' },
  { href: '/analytics', label: '📊 View Analytics', variant: 'secondary' },
];

const styles = {
  main: { padding: '2rem', fontFamily: 'monospace', backgroundColor: '#1a1a2e', minHeight: '100vh' },
  heading: { color: '#00ff00', marginBottom: '2rem' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' },
  panel: { border: '1px solid #00ff00', padding: '1.5rem', borderRadius: '5px' },
  panelHeading: { color: '#00ff00', marginBottom: '1rem', borderBottom: '1px solid #00ff00', paddingBottom: '0.5rem' },
  list: { listStyle: 'none', padding: 0 },
  listItem: { marginBottom: '0.5rem' },
  link: { color: '#00ff00', textDecoration: 'none' },
  statsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' },
  statCard: { textAlign: 'center', padding: '1rem', backgroundColor: '#0d0d1a', borderRadius: '5px' },
  statValue: { fontSize: '2rem', color: '#00ff00', fontWeight: 'bold' },
  statLabel: { color: '#888', fontSize: '0.9rem' },
  muted: { color: '#888' },
  quickActions: { marginTop: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' },
  action: { padding: '0.75rem 1.5rem', textDecoration: 'none', borderRadius: '5px', fontWeight: 'bold', fontFamily: 'monospace' },
  primaryAction: { backgroundColor: '#00ff00', color: '#000' },
  secondaryAction: { backgroundColor: 'transparent', color: '#00ff00', border: '1px solid #00ff00' },
} satisfies Record<string, CSSProperties>;

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={styles.panel}>
      <h2 style={styles.panelHeading}>{title}</h2>
      {children}
    </section>
  );
}

export default function Home() {
  return (
    <main style={styles.main}>
      <h1 style={styles.heading}>Las Flores 2077 - Admin Panel</h1>

      <div style={styles.grid}>
        {sections.map((section) => (
          <Panel key={section.title} title={section.title}>
            <ul style={styles.list}>
              {section.items.map((item) => (
                <li key={item.href} style={styles.listItem}>
                  <a href={item.href} style={styles.link}>{item.label}</a>
                </li>
              ))}
            </ul>
          </Panel>
        ))}

        <Panel title="Quick Stats">
          <div style={styles.statsGrid}>
            {stats.map((stat) => (
              <div key={stat.label} style={styles.statCard}>
                <div style={styles.statValue}>{stat.value}</div>
                <div style={styles.statLabel}>{stat.label}</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Recent Activity">
          <div style={styles.muted}>
            <p style={{ marginBottom: '0.5rem' }}>No recent activity</p>
            <p style={{ fontSize: '0.9rem' }}>Start migrating content to see activity here.</p>
          </div>
        </Panel>
      </div>

      <div style={styles.quickActions}>
        {actions.map((action) => (
          <a
            key={action.href}
            href={action.href}
            style={{ ...styles.action, ...(action.variant === 'primary' ? styles.primaryAction : styles.secondaryAction) }}
          >
            {action.label}
          </a>
        ))}
      </div>
    </main>
  );
}

