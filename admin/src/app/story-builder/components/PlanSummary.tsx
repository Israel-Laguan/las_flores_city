'use client';

import type { ContentPlan } from '@las-flores/shared';
import styles from './PlanSummary.module.css';

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
    <div className={styles.summary}>
      <h2 className={styles.heading}>Plan Summary</h2>
      <p className={styles.description}>{plan.description}</p>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{totalItems}</span>
          <span className={styles.statLabel}>Total Items</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{createCount}</span>
          <span className={styles.statLabel}>New</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{updateCount}</span>
          <span className={styles.statLabel}>Updates</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{totalAssets}</span>
          <span className={styles.statLabel}>Assets Needed</span>
        </div>
      </div>

      <div className={styles.breakdown}>
        <div className={styles.breakdownTitle}>Items by Type:</div>
        {Object.entries(typeCounts).map(([type, count]) => (
          <span key={type} className={styles.badge}>
            {type}: {count}
          </span>
        ))}
      </div>
    </div>
  );
}
