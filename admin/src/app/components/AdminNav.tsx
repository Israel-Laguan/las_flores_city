import Link from 'next/link';

const navLinkStyle: React.CSSProperties = { color: '#00ff00', fontFamily: 'monospace', textDecoration: 'none', fontSize: '0.9rem' };
const navSectionStyle: React.CSSProperties = { color: '#555', fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 'bold', alignSelf: 'center' };

function NavLinksRow() {
  return (
    <div style={{ backgroundColor: '#0d0d1a', padding: '0.5rem 2rem', borderBottom: '1px solid #333', display: 'flex', flexWrap: 'wrap', gap: '0.25rem 1.5rem' }}>
      <span style={navSectionStyle}>Content:</span>
      <Link href="/dialogues" style={navLinkStyle}>💬 Dialogues</Link>
      <Link href="/scenes" style={navLinkStyle}>🗺️ Scenes</Link>
      <Link href="/characters" style={navLinkStyle}>👤 Characters</Link>
      <Link href="/story-beats" style={navLinkStyle}>📖 Story Beats</Link>
      <Link href="/mysteries" style={navLinkStyle}>🔍 Mysteries</Link>
      <Link href="/overlays" style={navLinkStyle}>🔄 Overlays</Link>
      <Link href="/locations" style={navLinkStyle}>📍 Locations</Link>
      <Link href="/vault" style={navLinkStyle}>🔐 Vault</Link>
      <Link href="/gigs" style={navLinkStyle}>💼 Gigs</Link>
      <Link href="/shop" style={navLinkStyle}>🛒 Shop</Link>
      <Link href="/maps" style={navLinkStyle}>🗺️ Maps</Link>
      <span style={{ ...navSectionStyle, marginLeft: '0.75rem' }}>System:</span>
      <Link href="/migration" style={navLinkStyle}>🚀 Migration</Link>
      <Link href="/validation" style={navLinkStyle}>✅ Validation</Link>
      <Link href="/analytics" style={navLinkStyle}>📊 Analytics</Link>
    </div>
  );
}

export default function AdminNav({ user }: { user: any }) {
  return (
    <>
      <nav style={{ backgroundColor: '#0d0d1a', padding: '1rem 2rem', borderBottom: '1px solid #00ff00', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: '#00ff00', fontWeight: 'bold', fontSize: '1.2rem' }}>🎮 Las Flores 2077 Admin</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {user ? (
            <>
              <span style={{ color: '#00ff00' }}>{user.username || user.email}</span>
              <span style={{ backgroundColor: '#00ff00', color: '#000', padding: '0.25rem 0.75rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>{user.role}</span>
              <Link href="/api/auth/logout" style={{ backgroundColor: '#ff0000', color: '#000', padding: '0.5rem 1rem', borderRadius: '4px', textDecoration: 'none', fontWeight: 'bold' }}>LOGOUT</Link>
            </>
          ) : (
            <Link href="/login" style={{ backgroundColor: '#ff0000', color: '#000', padding: '0.5rem 1rem', borderRadius: '4px', textDecoration: 'none', fontWeight: 'bold' }}>LOGIN</Link>
          )}
        </div>
      </nav>
      <NavLinksRow />
    </>
  );
}
