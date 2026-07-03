"use client";

import type { Category } from '../page';

type Props = {
  chosenBase: Category['entries'][0]['entries'][0] & { id: string };
  loading: boolean;
  onPublish: () => void;
};

export default function PublishBaseSection({ chosenBase, loading, onPublish }: Props) {
  return (
    <div style={{ border: '1px solid #444', padding: '1rem', borderRadius: '5px', maxWidth: '400px' }}>
      <img
        src={`/assets/image/${chosenBase.id}`}
        alt="chosen base"
        style={{ width: '100%', height: 'auto', marginBottom: '1rem', borderRadius: '3px' }}
      />
      <button
        onClick={onPublish}
        disabled={loading}
        style={{ padding: '0.75rem 1.5rem', background: '#00ff00', color: '#000', cursor: 'pointer', border: 'none', fontWeight: 'bold', width: '100%' }}
      >
        Publish Base to MinIO
      </button>
    </div>
  );
}
