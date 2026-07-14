"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { adminStyles as styles } from '@/lib/adminStyles';

interface Character {
  id: string;
  name: string;
  title: string | null;
  description: string;
  avatar_url: string | null;
  portrait_urls: string[];
  atlas_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

const cardStyle: React.CSSProperties = {
  background: '#0d0d1a',
  border: '1px solid #333',
  borderRadius: '8px',
  padding: '1.5rem',
  marginBottom: '1rem',
};

const labelStyle: React.CSSProperties = {
  color: '#888',
  fontSize: '0.75rem',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
  marginBottom: '0.25rem',
};

const valueStyle: React.CSSProperties = {
  color: '#fff',
  fontSize: '1rem',
  lineHeight: 1.5,
};

const portraitContainerStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1rem',
  flexWrap: 'wrap' as const,
  marginBottom: '1.5rem',
};

const portraitStyle: React.CSSProperties = {
  width: '200px',
  height: '200px',
  objectFit: 'cover' as const,
  borderRadius: '8px',
  border: '2px solid #00ff00',
};

const collapsibleHeaderStyle: React.CSSProperties = {
  ...styles.secondaryButton,
  width: '100%',
  textAlign: 'left' as const,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  cursor: 'pointer',
};

function PortraitSection({ record }: { record: Character }) {
  const portraits = record.portrait_urls ?? [];
  const hasPortrait = portraits.length > 0 || record.avatar_url;

  if (!hasPortrait) return null;

  return (
    <div style={cardStyle}>
      <div style={labelStyle}>Portrait</div>
      <div style={portraitContainerStyle}>
        {portraits.map((url, i) => (
          <img
            key={i}
            src={url}
            alt={`${record.name} portrait ${i + 1}`}
            style={portraitStyle}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ))}
        {!portraits.length && record.avatar_url && (
          <img
            src={record.avatar_url}
            alt={`${record.name} avatar`}
            style={portraitStyle}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        )}
      </div>
    </div>
  );
}

function BasicInfoCard({ record }: { record: Character }) {
  return (
    <div style={cardStyle}>
      <div style={{ display: 'grid', gap: '1rem' }}>
        <div>
          <div style={labelStyle}>Name</div>
          <div style={valueStyle}>{record.name}</div>
        </div>
        {record.title && (
          <div>
            <div style={labelStyle}>Title</div>
            <div style={valueStyle}>{record.title}</div>
          </div>
        )}
        <div>
          <div style={labelStyle}>Description</div>
          <div style={valueStyle}>{record.description}</div>
        </div>
      </div>
    </div>
  );
}

function MetadataCard({ record }: { record: Character }) {
  const metadata = record.metadata;
  if (!metadata || Object.keys(metadata).length === 0) return null;

  return (
    <div style={cardStyle}>
      <div style={labelStyle}>Metadata</div>
      <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.5rem' }}>
        {Object.entries(metadata).map(([key, value]) => (
          <div key={key}>
            <div style={{ ...labelStyle, fontSize: '0.7rem' }}>{key}</div>
            <div style={{ ...valueStyle, fontSize: '0.9rem' }}>
              {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimestampsCard({ record }: { record: Character }) {
  return (
    <div style={cardStyle}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div>
          <div style={labelStyle}>Created</div>
          <div style={valueStyle}>{new Date(record.created_at).toLocaleString()}</div>
        </div>
        <div>
          <div style={labelStyle}>Updated</div>
          <div style={valueStyle}>{new Date(record.updated_at).toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}

function AtlasCard({ record }: { record: Character }) {
  if (!record.atlas_url) return null;

  return (
    <div style={cardStyle}>
      <div style={labelStyle}>Atlas URL</div>
      <div style={valueStyle}>
        <a href={record.atlas_url} target="_blank" rel="noopener noreferrer" style={{ color: '#00ff00' }}>
          {record.atlas_url}
        </a>
      </div>
    </div>
  );
}

function RawJson({ record }: { record: Character }) {
  const [showJson, setShowJson] = useState(false);

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <button
        onClick={() => setShowJson(!showJson)}
        style={collapsibleHeaderStyle}
      >
        <span>Raw JSON</span>
        <span>{showJson ? '▼' : '▶'}</span>
      </button>
      {showJson && (
        <pre style={{
          background: '#0d0d1a',
          border: '1px solid #333',
          borderTop: 'none',
          padding: '1rem',
          borderRadius: '0 0 5px 5px',
          overflowX: 'auto',
          color: '#aaa',
          fontSize: '0.85rem',
          marginTop: 0,
        }}>
          {JSON.stringify(record, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function CharacterDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [record, setRecord] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function fetchRecord() {
      try {
        const res = await fetch(`/api/admin/characters/${id}`);
        if (res.status === 404) {
          setNotFound(true);
        } else {
          const data = await res.json();
          if (data.success) {
            setRecord(data.data);
          } else {
            setError(data.error || 'Failed to fetch character');
          }
        }
      } catch {
        setError('Failed to fetch character');
      } finally {
        setLoading(false);
      }
    }
    fetchRecord();
  }, [id]);

  return (
    <main style={styles.main}>
      <Link href="/characters" style={{ color: '#00ff00' }}>← Back to Characters</Link>
      <h1 style={styles.heading}>👤 Character: {record?.name ?? id}</h1>

      {loading && <p style={styles.muted}>Loading...</p>}
      {!loading && notFound && <p>Not found.</p>}
      {!loading && !notFound && error && <div style={styles.errorBox}>{error}</div>}

      {!loading && !notFound && !error && record && (
        <>
          <PortraitSection record={record} />
          <BasicInfoCard record={record} />
          <MetadataCard record={record} />
          <TimestampsCard record={record} />
          <AtlasCard record={record} />
          <RawJson record={record} />
        </>
      )}
    </main>
  );
}
