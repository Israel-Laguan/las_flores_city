import Link from 'next/link';
import styles from './AdminNav.module.css';

function NavLinksRow() {
  return (
    <div className={styles.navLinks}>
      <span className={styles.sectionLabel}>Content:</span>
      <Link href="/dialogues" className={styles.navLink}>Dialogues</Link>
      <Link href="/scenes" className={styles.navLink}>Scenes</Link>
      <Link href="/characters" className={styles.navLink}>Characters</Link>
      <Link href="/story-beats" className={styles.navLink}>Story Beats</Link>
      <Link href="/story-arc" className={styles.navLink}>Story Arc</Link>
      <Link href="/missions" className={styles.navLink}>Missions</Link>
      <Link href="/stories" className={styles.navLink}>Stories</Link>
      <Link href="/overlays" className={styles.navLink}>Overlays</Link>
      <Link href="/locations" className={styles.navLink}>Locations</Link>
      <Link href="/vault" className={styles.navLink}>Vault</Link>
      <Link href="/gigs" className={styles.navLink}>Gigs</Link>
      <Link href="/shop" className={styles.navLink}>Shop</Link>
      <Link href="/maps" className={styles.navLink}>Maps</Link>
      <Link href="/lore" className={styles.navLink}>Lore</Link>
      <span className={styles.sectionLabel}>Tools:</span>
      <Link href="/story-builder" className={styles.navLink}>Story Builder</Link>
      <Link href="/editor" className={styles.navLink}>Editor</Link>
      <Link href="/content-linker" className={styles.navLink}>Linker</Link>
      <span className={styles.sectionLabel}>System:</span>
      <Link href="/migration" className={styles.navLink}>Migration</Link>
      <Link href="/validation" className={styles.navLink}>Validation</Link>
      <Link href="/quality" className={styles.navLink}>Quality</Link>
      <Link href="/analytics" className={styles.navLink}>Analytics</Link>
      <Link href="/coverage" className={styles.navLink}>Coverage</Link>
      <Link href="/asset-coverage" className={styles.navLink}>Assets</Link>
    </div>
  );
}

interface AdminNavProps {
  user?: { username?: string; email?: string; role?: string } | null;
}

export default function AdminNav({ user }: AdminNavProps) {
  return (
    <>
      <nav className={styles.topBar}>
        <div className={styles.logo}>Las Flores 2077 Admin</div>
        <div className={styles.userArea}>
          {user ? (
            <>
              <span>{user.username || user.email}</span>
              <span className="badge badge--success">{user.role}</span>
              <Link href="/api/auth/logout" className="btn btn--danger">LOGOUT</Link>
            </>
          ) : (
            <Link href="/login" className="btn btn--danger">LOGIN</Link>
          )}
        </div>
      </nav>
      <NavLinksRow />
    </>
  );
}
