import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { adminStyles as styles } from '@/lib/adminStyles';
import { markdownComponents } from './MarkdownComponents';

interface MarkdownViewerProps {
  selectedPath: string | null;
  content: string | null;
  contentLoading: boolean;
  contentError: string | null;
}

function extractFrontmatter(content: string): { tags: string[]; body: string } {
  const lines = content.split('\n');
  const tags: string[] = [];
  let bodyStart = 0;

  if (lines[0]?.trim() === '---') {
    const closingIndex = lines.indexOf('---', 1);
    if (closingIndex !== -1) {
      for (let i = 1; i < closingIndex; i++) {
        const line = lines[i].trim();
        if (line.startsWith('Tags:') || line.startsWith('tags:')) {
          const tagPart = line.slice(line.indexOf(':') + 1).trim();
          const matches = tagPart.match(/`#[^`]+`/g);
          if (matches) {
            for (const m of matches) {
              tags.push(m.replace(/`/g, ''));
            }
          }
        }
      }
      bodyStart = closingIndex + 1;
    }
  } else {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('Tags:') || line.startsWith('tags:')) {
        const tagPart = line.slice(line.indexOf(':') + 1).trim();
        const matches = tagPart.match(/`#[^`]+`/g);
        if (matches) {
          for (const m of matches) {
            tags.push(m.replace(/`/g, ''));
          }
        }
        bodyStart = i + 1;
      } else if (line !== '') {
        break;
      }
    }
  }

  const body = lines.slice(bodyStart).join('\n').trim();
  return { tags, body };
}

function ViewerContent({ selectedPath, content, contentLoading, contentError }: MarkdownViewerProps) {
  if (!selectedPath) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={styles.muted}>Select a file from the tree to view its content.</p>
      </div>
    );
  }

  if (contentLoading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={styles.muted}>Loading...</p>
      </div>
    );
  }

  if (contentError) {
    return (
      <div style={{ padding: '2rem' }}>
        <div style={styles.errorBox}>{contentError}</div>
      </div>
    );
  }

  if (content === null) return null;

  const { tags, body } = extractFrontmatter(content);

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {/* File header */}
      <div style={{
        padding: '0.75rem 1.5rem',
        borderBottom: '1px solid #333',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ color: '#888', fontFamily: 'monospace', fontSize: '0.8rem' }}>
          {selectedPath}
        </span>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div style={{
          padding: '0.75rem 1.5rem',
          borderBottom: '1px solid #333',
          display: 'flex',
          gap: '0.5rem',
          flexWrap: 'wrap',
        }}>
          {tags.map((tag) => (
            <span key={tag} style={{
              ...styles.badge,
              backgroundColor: '#0066ff',
              color: '#fff',
              fontSize: '0.75rem',
            }}>{tag}</span>
          ))}
        </div>
      )}

      {/* Markdown content */}
      <div style={{ padding: '1.5rem' }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {body}
        </ReactMarkdown>
      </div>
    </div>
  );
}

export default function MarkdownViewer(props: MarkdownViewerProps) {
  return (
    <div style={{
      flex: 1,
      border: '1px solid #333',
      borderRadius: '5px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <ViewerContent {...props} />
    </div>
  );
}