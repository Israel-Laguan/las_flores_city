'use client';

import { useState } from 'react';
import { serverAssetUrl } from '@/lib/client-api';
import styles from './PreviewItem.module.css';

function extractFieldsFromYaml(yamlString: string): Record<string, string> {
  const fields: Record<string, string> = {};
  try {
    const lines = yamlString.split('\n');
    for (const line of lines) {
      if (line.startsWith(' ') || line.startsWith('\t')) continue;
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes(':')) {
        const [key, ...valueParts] = trimmed.split(':');
        const value = valueParts.join(':').trim();
        fields[key.trim()] = value || '(empty)';
      }
    }
  } catch {
    // If parsing fails, return empty
  }
  return fields;
}

function getImageFromYaml(yamlString: string): string | null {
  try {
    const lines = yamlString.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      if (trimmed.match(/^(image_path|image|portrait|thumbnail)\s*:/i)) {
        const match = trimmed.match(/:\s*(.+)/);
        if (match) {
          const path = match[1].trim().replace(/['"]/g, '');
          if (path && !path.startsWith('data:')) return path;
        }
      }

      if (trimmed.match(/^asset_paths\s*:/i)) {
        let j = i + 1;
        while (j < lines.length) {
          const rawLine = lines[j];
          const trimmedNext = rawLine.trim();
          if (!trimmedNext || trimmedNext.startsWith('#')) { j++; continue; }
          if (rawLine.startsWith(' ') || rawLine.startsWith('\t')) {
            const assetMatch = trimmedNext.match(/^\s*(\w+)\s*:\s*(.+)/);
            if (assetMatch) {
              const key = assetMatch[1];
              const value = assetMatch[2].trim().replace(/['"]/g, '');
              if (key.match(/image|portrait|avatar/i) && value) return value;
            }
            j++;
          } else {
            break;
          }
        }
      }
    }
  } catch {
    // If parsing fails, return null
  }
  return null;
}

interface PreviewItemProps {
  item: any;
  index: number;
}

export default function PreviewItem({ item, index }: PreviewItemProps) {
  const [imageError, setImageError] = useState(false);
  const fields = extractFieldsFromYaml(item.yamlPreview);
  const imagePath = getImageFromYaml(item.yamlPreview);

  return (
    <div key={index} className={styles.card}>
      <div className={styles.cardHeader}>
        <span className={styles.cardType}>{item.type}</span>
        <span className={styles.cardAction}>
          {item.isNew ? 'New' : 'Update'} &rarr; {item.filePath}
        </span>
      </div>

      <div>
        {fields.name && (
          <p className={styles.fieldValue} style={{ color: 'var(--accent)', fontSize: '0.9rem' }}>
            <strong>Name:</strong> {fields.name}
          </p>
        )}
        {fields.description && (
          <p className={styles.fieldDesc}>
            <strong>Description:</strong> {fields.description}
          </p>
        )}
        {fields.slug && (
          <p className={styles.fieldSlug}>
            <strong>Slug:</strong> {fields.slug}
          </p>
        )}
        {fields.id && (
          <p className={styles.fieldSlug}>
            <strong>ID:</strong> {fields.id}
          </p>
        )}

        {imagePath && !imageError && (
          <div className={styles.imageContainer}>
            <img
              src={serverAssetUrl(imagePath)}
              alt="Preview"
              className={styles.previewImage}
              onError={() => setImageError(true)}
            />
            <p className={styles.imagePath}>{imagePath}</p>
          </div>
        )}
      </div>

      <details>
        <summary className={styles.yamlSummary}>View YAML</summary>
        <pre className={styles.yamlContent}>{item.yamlPreview}</pre>
      </details>
      {item.existingYaml && (
        <details>
          <summary className={styles.existingLabel}>Current File (will be overwritten)</summary>
          <pre className={styles.existingContent}>{item.existingYaml}</pre>
        </details>
      )}
    </div>
  );
}
