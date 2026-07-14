'use client';

import Link from 'next/link';
import styles from '../mission-wizard.module.css';

interface Props {
  title: string;
  generatedLinks: string[];
  onReset: () => void;
}

export default function MissionResultView({ title, generatedLinks, onReset }: Props) {
  return (
    <main className={styles.main}>
      <h1>Mission Generated</h1>
      <div className={styles.successBox}>
        <p className={styles.successMessage}>Mission "{title}" created successfully!</p>
        <p className={styles.fileListLabel}>Files created:</p>
        <ul className={styles.fileList}>
          {generatedLinks.map(l => <li key={l}>{l}</li>)}
        </ul>
      </div>
      <div className={styles.navBar}>
        <Link href="/missions" className={styles.primaryButton}>View Missions</Link>
        <Link href="/stories" className={styles.secondaryButton}>View Stories</Link>
        <Link href="/editor" className={styles.secondaryButton}>Edit in YAML Editor</Link>
        <button className={styles.secondaryButton} onClick={onReset}>Create Another</button>
      </div>
    </main>
  );
}