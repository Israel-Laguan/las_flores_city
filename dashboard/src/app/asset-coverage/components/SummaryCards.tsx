import { adminStyles as styles } from '@/lib/adminStyles';

interface SummaryCardsProps {
  charsReady: number;
  charsMissing: number;
  scenesReady: number;
  scenesMissing: number;
}

export default function SummaryCards({ charsReady, charsMissing, scenesReady, scenesMissing }: SummaryCardsProps) {
  return (
    <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '2rem' }}>
      <div style={{ ...styles.section, flex: 1, marginBottom: 0 }}>
        <div style={{ color: '#00ff00', fontWeight: 'bold', marginBottom: '0.5rem' }}>Characters</div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <span style={{ color: '#00ff00', fontSize: '0.85rem' }}>✓ {charsReady} have portraits</span>
          <span style={{ color: '#ff4444', fontSize: '0.85rem' }}>✗ {charsMissing} missing</span>
        </div>
      </div>
      <div style={{ ...styles.section, flex: 1, marginBottom: 0 }}>
        <div style={{ color: '#00ff00', fontWeight: 'bold', marginBottom: '0.5rem' }}>Scenes</div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <span style={{ color: '#00ff00', fontSize: '0.85rem' }}>✓ {scenesReady} have backgrounds</span>
          <span style={{ color: '#ff4444', fontSize: '0.85rem' }}>✗ {scenesMissing} missing</span>
        </div>
      </div>
    </div>
  );
}