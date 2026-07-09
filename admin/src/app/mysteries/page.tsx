export default function MysteriesPage() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'monospace', backgroundColor: '#1a1a2e', minHeight: '100vh' }}>
      <h1 style={{ color: '#00ff00' }}>Mysteries</h1>
      <p style={{ color: '#888' }}>
        Mysteries have been renamed to <strong style={{ color: '#00ff00' }}>Missions</strong>.
      </p>
      <p style={{ color: '#888', marginTop: '1rem' }}>
        Use the <a href="/missions" style={{ color: '#00ff00' }}>Missions</a> page to manage mystery quest lines.
      </p>
    </main>
  );
}
