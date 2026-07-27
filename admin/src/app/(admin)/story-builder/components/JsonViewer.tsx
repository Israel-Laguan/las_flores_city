'use client';

import { useState } from 'react';
import styles from './JsonViewer.module.css';

function syntaxHighlightJSON(json: unknown): JSX.Element {
  const stringified = JSON.stringify(json, null, 2);
  const tokenRegex = /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|[{}[\]:,]|\s+|[^"\s{}[\]:,]+)/g;

  return (
    <pre className={styles.jsonPre}>
      {stringified.split('\n').map((line, i) => {
        const tokens: JSX.Element[] = [];
        let match;
        tokenRegex.lastIndex = 0;

        while ((match = tokenRegex.exec(line)) !== null) {
          const token = match[0];
          let className = '';

          if (token.startsWith('"')) {
            const nextChar = stringified[match.index + token.length];
            if (nextChar === ':') {
              className = styles.key;
            } else {
              className = styles.string;
            }
          } else if (/^-?\d/.test(token)) {
            className = styles.number;
          } else if (/^(true|false)$/.test(token)) {
            className = styles.boolean;
          } else if (token === 'null') {
            className = styles.null;
          } else if (/^[{}\[\]]$/.test(token)) {
            className = styles.bracket;
          }

          tokens.push(
            <span key={`${i}-${match.index}`} className={className}>
              {token}
            </span>
          );
        }

        return <div key={i}>{tokens}</div>;
      })}
    </pre>
  );
}

interface JsonViewerProps {
  data: unknown;
  label?: string;
  defaultOpen?: boolean;
}

export default function JsonViewer({ data, label = 'JSON Data', defaultOpen = false }: JsonViewerProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => console.error('Copy to clipboard failed'));
  };

  return (
    <details className={styles.container} open={isOpen}>
      <summary
        className={styles.summary}
        onClick={(e) => {
          e.preventDefault();
          setIsOpen(!isOpen);
        }}
      >
        <span>{label}</span>
        <span className={styles.summaryArrow}>
          {isOpen ? '\u25B2' : '\u25BC'} {data && typeof data === 'object' && data !== null && Object.keys(data).length > 0 ? `(${Object.keys(data).length} items)` : ''}
        </span>
      </summary>
      <div className={styles.content}>
        <div className={styles.copyRow}>
          <button className={styles.copyButton} onClick={copyToClipboard}>
            {copied ? 'Copied!' : 'Copy JSON'}
          </button>
        </div>
        {syntaxHighlightJSON(data)}
      </div>
    </details>
  );
}
