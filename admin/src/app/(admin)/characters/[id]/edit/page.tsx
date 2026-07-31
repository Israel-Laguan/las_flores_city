'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { YAMLCharacterSchema } from '@las-flores/shared';
import EntityEditPage from '@/components/entity/EntityEditPage';
import { CHARACTER_EDIT_FIELDS } from '../../field-definitions';
import styles from './page.module.css';

export default function CharacterEditPage() {
  const params = useParams();
  const id = params.id as string;

  return (
    <EntityEditPage
      type="character"
      id={id}
      schema={YAMLCharacterSchema}
      editFields={CHARACTER_EDIT_FIELDS}
      entityLabel="Character"
      routeBase="characters"
      footer={
        <div className={styles.dialogueSection}>
          <div className={styles.dialogueSectionHeader}>
            <h2>Linked Dialogues</h2>
            <Link
              href={`/content-linker?tab=characters&id=${encodeURIComponent(id)}`}
              target="_blank"
              className="btn btn--secondary"
            >
              Manage Dialogues
            </Link>
          </div>
          <p className={styles.dialogueHint}>
            Dialogue associations are managed via the Content Linker. Click &quot;Manage Dialogues&quot; to open it in a new tab.
          </p>
        </div>
      }
    />
  );
}
