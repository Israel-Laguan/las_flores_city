'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useEntityYaml } from '@/components/entity/useEntityYaml';
import EntityDetailView from '@/components/entity/EntityDetailView';
import { DISTRICT_VIEW_FIELDS } from '../field-definitions';
import styles from '../../locations/[id]/page.module.css';

export default function DistrictDetailPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { yaml, loading, error } = useEntityYaml('district', slug);

  if (loading) {
    return <div className={styles.main}><p className={styles.muted}>Loading...</p></div>;
  }
  if (error || !yaml) {
    return <div className={styles.main}><div className={styles.errorBox}>{error || 'District not found'}</div></div>;
  }

  return (
    <div className={styles.main}>
      <div className={styles.header}>
        <h1 className={styles.title}>District: {String(yaml.name ?? slug)}</h1>
        <div className={styles.headerActions}>
          <Link href={`/districts/${slug}/edit`} className="btn btn--primary">Edit</Link>
        </div>
      </div>
      <EntityDetailView fields={DISTRICT_VIEW_FIELDS} record={yaml} />
    </div>
  );
}
