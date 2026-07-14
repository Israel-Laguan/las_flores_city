'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { markdownComponents } from './MarkdownComponents';
import styles from './MarkdownViewer.module.css';

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
      <div className={styles.centerContent}>
        <p className={styles.muted}>Select a file from the tree to view its content.</p>
      </div>
    );
  }

  if (contentLoading) {
    return (
      <div className={styles.centerContent}>
        <p className={styles.muted}>Loading...</p>
      </div>
    );
  }

  if (contentError) {
    return (
      <div className={styles.centerContent}>
        <div className={styles.errorBox}>{contentError}</div>
      </div>
    );
  }

  if (content === null) return null;

  const { tags, body } = extractFrontmatter(content);

  return (
    <div className={styles.viewerScroll}>
      {/* File header */}
      <div className={styles.fileHeader}>
        <span className={styles.filePath}>{selectedPath}</span>
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className={styles.tagsContainer}>
          {tags.map((tag) => (
            <span key={tag} className={styles.tag}>{tag}</span>
          ))}
        </div>
      )}

      {/* Markdown content */}
      <div className={styles.markdownContent}>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {body}
        </ReactMarkdown>
      </div>
    </div>
  );
}

export default function MarkdownViewer(props: MarkdownViewerProps) {
  return (
    <div className={styles.container}>
      <ViewerContent {...props} />
    </div>
  );
}
