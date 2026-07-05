"use client";

export const placeholderStyles = {
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
  badge: {
    display: 'inline-block',
    padding: '0.25rem 0.75rem',
    borderRadius: '4px',
    fontSize: '0.8rem',
    fontWeight: 'bold',
    marginBottom: '1rem',
  },
};

interface PlaceholderPageProps {
  icon: string;
  title: string;
  badge: string;
  badgeColor: string;
  heading: string;
  description: string;
  features: string[];
  footnote?: string;
  buttonLabel: string;
}

export default function PlaceholderPage({
  icon,
  title,
  badge,
  badgeColor,
  heading,
  description,
  features,
  footnote,
  buttonLabel,
}: PlaceholderPageProps) {
  return (
    <main style={placeholderStyles.main}>
      <h1 style={placeholderStyles.heading}>{icon} {title}</h1>

      <div style={placeholderStyles.section}>
        <div style={{ ...placeholderStyles.badge, backgroundColor: badgeColor }}>{badge}</div>
        <h2 style={placeholderStyles.sectionHeading}>{heading}</h2>

        <div style={placeholderStyles.muted}>
          <p style={{ marginBottom: '1rem' }}>{description}</p>
          <p style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>Planned features:</p>
          <ul style={{ margin: '0 0 1rem 1.5rem', lineHeight: '1.8' }}>
            {features.map((feature, i) => (
              <li key={i}>{feature}</li>
            ))}
          </ul>
          {footnote && (
            <p style={{ fontSize: '0.85rem', color: '#666' }}>{footnote}</p>
          )}
        </div>

        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem' }}>
          <button
            disabled
            style={{ ...placeholderStyles.button, ...placeholderStyles.disabledButton }}
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    </main>
  );
}
