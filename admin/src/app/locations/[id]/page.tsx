"use client";

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { adminStyles as styles } from '@/lib/adminStyles';

interface Location {
  id: string;
  name: string;
  description: string;
  district_id: string | null;
  image_url: string | null;
  background_url: string | null;
  ambient_sound_url: string | null;
  mood: string | null;
  available_dialogues: string[];
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

const collapsibleHeaderStyle: React.CSSProperties = {
  ...styles.secondaryButton,
  width: '100%',
  textAlign: 'left' as const,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  cursor: 'pointer',
};

export default function LocationDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [record, setRecord] = useState<Location | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [showJson, setShowJson] = useState(false);

  useEffect(() => {
    async function fetchRecord() {
      try {
        const res = await fetch(`/api/admin/locations/${id}`);
        if (res.status === 404) {
          setNotFound(true);
        } else {
          const data = await res.json();
          if (data.success) {
            setRecord(data.data);
          } else {
            setError(data.error || 'Failed to fetch location');
          }
        }
      } catch {
        setError('Failed to fetch location');
      } finally {
        setLoading(false);
      }
    }
    fetchRecord();
  }, [id]);

  const bgUrl = record?.background_url || record?.image_url;

  return (
    <main style={styles.main}>
      <Link href="/locations" style={{ color: '#00ff00' }}>← Back to Locations</Link>
      <h1 style={styles.heading}>🗺️ Location: {record?.name ?? id}</h1>

      {loading && <p style={styles.muted}>Loading...</p>}
      {!loading && notFound && <p>Not found.</p>}
      {!loading && !notFound && error && <div style={styles.errorBox}>{error}</div>}

      {!loading && !notFound && !error && record && (
        <>
          {/* Background Image */}
          {bgUrl && (
            <div style={cardStyle}>
              <div style={labelStyle}>Background</div>
              <img
                src={bgUrl}
                alt={`${record.name} background`}
                style={{ width: '100%', maxHeight: '400px', objectFit: 'cover', borderRadius: '6px' }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}

          {/* Basic Info */}
          <div style={cardStyle}>
            <div style={{ display: 'grid', gap: '1rem' }}>
              <div>
                <div style={labelStyle}>Name</div>
                <div style={valueStyle}>{record.name}</div>
              </div>
              <div>
                <div style={labelStyle}>Description</div>
                <div style={valueStyle}>{record.description}</div>
              </div>
              <div>
                <div style={labelStyle}>District ID</div>
                <div style={valueStyle}>
                  {record.district_id ? (
                    <Link href={`/districts/${record.district_id}`} style={{ color: '#00ff00' }}>
                      {record.district_id}
                    </Link>
                  ) : '—'}
                </div>
              </div>
              <div>
                <div style={labelStyle}>Mood</div>
                <div style={valueStyle}>{record.mood || '—'}</div>
              </div>
            </div>
          </div>

          {/* Audio */}
          <div style={cardStyle}>
            <div style={labelStyle}>Ambient Sound</div>
            {record.ambient_sound_url ? (
              <audio controls src={record.ambient_sound_url} style={{ width: '100%', marginTop: '0.5rem' }} />
            ) : (
              <div style={valueStyle}>None</div>
            )}
          </div>

          {/* Metadata */}
          {record.metadata && Object.keys(record.metadata).length > 0 && (
            <div style={cardStyle}>
              <div style={labelStyle}>Metadata</div>
              <div style={{ display: 'grid', gap: '0.75rem', marginTop: '0.5rem' }}>
                {Object.entries(record.metadata).map(([key, value]) => (
                  <div key={key}>
                    <div style={{ ...labelStyle, fontSize: '0.7rem' }}>{key}</div>
                    <div style={{ ...valueStyle, fontSize: '0.9rem' }}>
                      {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Linked Dialogues */}
          <div style={cardStyle}>
            <div style={labelStyle}>Linked Dialogues</div>
            {record.available_dialogues && record.available_dialogues.length > 0 ? (
              <ul style={{ margin: '0.5rem 0 0 0', padding: '0 0 0 1.25rem', listStyle: 'disc' }}>
                {record.available_dialogues.map((dlgId) => (
                  <li key={dlgId} style={{ marginBottom: '0.25rem' }}>
                    <Link href={`/dialogues/${dlgId}`} style={{ color: '#00ff00' }}>
                      {dlgId}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div style={valueStyle}>None linked</div>
            )}
          </div>

          {/* Timestamps */}
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

          {/* Raw JSON (collapsible) */}
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
        </>
      )}
    </main>
  );
}
