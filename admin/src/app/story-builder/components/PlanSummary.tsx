'use client';

import type { ContentPlan } from '@las-flores/shared';

const styles = {
  summary: {
    border: '1px solid #00ff00',
    padding: '1.5rem',
    borderRadius: '5px',
    marginBottom: '2rem',
    backgroundColor: '#0d0d1a',
  },
  heading: {
    color: '#00ff00',
    fontSize: '1.1rem',
    fontWeight: 'bold' as const,
    margin: '0 0 0.5rem 0',
  },
  description: {
    color: '#aaa',
    fontSize: '0.9rem',
    marginBottom: '1rem',
  },
  stats: {
    display: 'flex',
    gap: '1.5rem',
    flexWrap: 'wrap' as const,
  },
  stat: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  statValue: {
    fontSize: '1.5rem',
    fontWeight: 'bold' as const,
    color: '#00ff00',
  },
  statLabel: {
    fontSize: '0.8rem',
    color: '#888',
  },
  breakdown: {
    marginTop: '1rem',
    paddingTop: '1rem',
    borderTop: '1px solid #333',
  },
  breakdownTitle: {
    fontSize: '0.85rem',
    color: '#888',
    marginBottom: '0.5rem',
  },
  badge: {
    display: 'inline-block',
    backgroundColor: '#00ff0022',
    color: '#00ff00',
    padding: '0.15rem 0.5rem',
    borderRadius: '3px',
    fontSize: '0.75rem',
    marginRight: '0.5rem',
    marginBottom: '0.25rem',
  },
};

interface PlanSummaryProps {
  plan: ContentPlan;
}

export default function PlanSummary({ plan }: PlanSummaryProps) {
  const totalItems = plan.items.length;
  const createCount = plan.items.filter((i) => i.action === 'create').length;
  const updateCount = plan.items.filter((i) => i.action === 'update').length;
  const totalAssets = plan.items.reduce((sum, i) => sum + i.assetNeeds.length, 0);

  const typeCounts: Record<string, number> = {};
  for (const item of plan.items) {
    typeCounts[item.type] = (typeCounts[item.type] || 0) + 1;
  }

  return (
    <div style={styles.summary}>
      <h2 style={styles.heading}>Plan Summary</h2>
      <p style={styles.description}>{plan.description}</p>

      <div style={styles.stats}>
        <div style={styles.stat}>
          <span style={styles.statValue}>{totalItems}</span>
          <span style={styles.statLabel}>Total Items</span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statValue}>{createCount}</span>
          <span style={styles.statLabel}>New</span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statValue}>{updateCount}</span>
          <span style={styles.statLabel}>Updates</span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statValue}>{totalAssets}</span>
          <span style={styles.statLabel}>Assets Needed</span>
        </div>
      </div>

      <div style={styles.breakdown}>
        <div style={styles.breakdownTitle}>Items by Type:</div>
        {Object.entries(typeCounts).map(([type, count]) => (
          <span key={type} style={styles.badge}>
            {type}: {count}
          </span>
        ))}
      </div>
    </div>
  );
}
