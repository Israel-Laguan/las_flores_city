import styles from './SummaryCards.module.css';

interface SummaryCardsProps {
  charsReady: number;
  charsMissing: number;
  scenesReady: number;
  scenesMissing: number;
}

export default function SummaryCards({ charsReady, charsMissing, scenesReady, scenesMissing }: SummaryCardsProps) {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.cardTitle}>Characters</div>
        <div className={styles.cardStats}>
          <span className={styles.readyCount}>{charsReady} have portraits</span>
          <span className={styles.missingCount}>{charsMissing} missing</span>
        </div>
      </div>
      <div className={styles.card}>
        <div className={styles.cardTitle}>Scenes</div>
        <div className={styles.cardStats}>
          <span className={styles.readyCount}>{scenesReady} have backgrounds</span>
          <span className={styles.missingCount}>{scenesMissing} missing</span>
        </div>
      </div>
    </div>
  );
}
