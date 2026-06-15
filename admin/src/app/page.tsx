export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'monospace', backgroundColor: '#1a1a2e', minHeight: '100vh' }}>
      <h1 style={{ color: '#00ff00', marginBottom: '2rem' }}>Las Flores 2077 - Admin Panel</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
        {/* Content Management */}
        <section style={{ border: '1px solid #00ff00', padding: '1.5rem', borderRadius: '5px' }}>
          <h2 style={{ color: '#00ff00', marginBottom: '1rem', borderBottom: '1px solid #00ff00', paddingBottom: '0.5rem' }}>
            Content Management
          </h2>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            <li style={{ marginBottom: '0.5rem' }}>
              <a href="/characters" style={{ color: '#00ff00', textDecoration: 'none' }}>
                📋 Characters
              </a>
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              <a href="/dialogues" style={{ color: '#00ff00', textDecoration: 'none' }}>
                💬 Dialogues
              </a>
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              <a href="/overlays" style={{ color: '#00ff00', textDecoration: 'none' }}>
                🔄 Overlays
              </a>
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              <a href="/scenes" style={{ color: '#00ff00', textDecoration: 'none' }}>
                🏙️ Scenes
              </a>
            </li>
          </ul>
        </section>

        {/* System */}
        <section style={{ border: '1px solid #00ff00', padding: '1.5rem', borderRadius: '5px' }}>
          <h2 style={{ color: '#00ff00', marginBottom: '1rem', borderBottom: '1px solid #00ff00', paddingBottom: '0.5rem' }}>
            System
          </h2>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            <li style={{ marginBottom: '0.5rem' }}>
              <a href="/migration" style={{ color: '#00ff00', textDecoration: 'none' }}>
                🚀 Content Migration
              </a>
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              <a href="/analytics" style={{ color: '#00ff00', textDecoration: 'none' }}>
                📊 Analytics
              </a>
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              <a href="/users" style={{ color: '#00ff00', textDecoration: 'none' }}>
                👥 User Management
              </a>
            </li>
            <li style={{ marginBottom: '0.5rem' }}>
              <a href="/settings" style={{ color: '#00ff00', textDecoration: 'none' }}>
                ⚙️ Settings
              </a>
            </li>
          </ul>
        </section>

        {/* Quick Stats */}
        <section style={{ border: '1px solid #00ff00', padding: '1.5rem', borderRadius: '5px' }}>
          <h2 style={{ color: '#00ff00', marginBottom: '1rem', borderBottom: '1px solid #00ff00', paddingBottom: '0.5rem' }}>
            Quick Stats
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#0d0d1a', borderRadius: '5px' }}>
              <div style={{ fontSize: '2rem', color: '#00ff00', fontWeight: 'bold' }}>1</div>
              <div style={{ color: '#888', fontSize: '0.9rem' }}>Characters</div>
            </div>
            <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#0d0d1a', borderRadius: '5px' }}>
              <div style={{ fontSize: '2rem', color: '#00ff00', fontWeight: 'bold' }}>1</div>
              <div style={{ color: '#888', fontSize: '0.9rem' }}>Dialogues</div>
            </div>
            <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#0d0d1a', borderRadius: '5px' }}>
              <div style={{ fontSize: '2rem', color: '#00ff00', fontWeight: 'bold' }}>1</div>
              <div style={{ color: '#888', fontSize: '0.9rem' }}>Scenes</div>
            </div>
            <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#0d0d1a', borderRadius: '5px' }}>
              <div style={{ fontSize: '2rem', color: '#00ff00', fontWeight: 'bold' }}>1</div>
              <div style={{ color: '#888', fontSize: '0.9rem' }}>Overlays</div>
            </div>
          </div>
        </section>

        {/* Recent Activity */}
        <section style={{ border: '1px solid #00ff00', padding: '1.5rem', borderRadius: '5px' }}>
          <h2 style={{ color: '#00ff00', marginBottom: '1rem', borderBottom: '1px solid #00ff00', paddingBottom: '0.5rem' }}>
            Recent Activity
          </h2>
          <div style={{ color: '#888' }}>
            <p style={{ marginBottom: '0.5rem' }}>No recent activity</p>
            <p style={{ fontSize: '0.9rem' }}>Start migrating content to see activity here.</p>
          </div>
        </section>
      </div>

      {/* Quick Actions */}
      <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <a
          href="/migration"
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: '#00ff00',
            color: '#000',
            textDecoration: 'none',
            borderRadius: '5px',
            fontWeight: 'bold',
            fontFamily: 'monospace',
          }}
        >
          🚀 Run Migration
        </a>
        <a
          href="/validation"
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: 'transparent',
            color: '#00ff00',
            border: '1px solid #00ff00',
            textDecoration: 'none',
            borderRadius: '5px',
            fontWeight: 'bold',
            fontFamily: 'monospace',
          }}
        >
          ✅ Validate Content
        </a>
        <a
          href="/analytics"
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: 'transparent',
            color: '#00ff00',
            border: '1px solid #00ff00',
            textDecoration: 'none',
            borderRadius: '5px',
            fontWeight: 'bold',
            fontFamily: 'monospace',
          }}
        >
          📊 View Analytics
        </a>
      </div>
    </main>
  )
}
