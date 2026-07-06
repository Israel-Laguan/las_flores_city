import type { Components } from 'react-markdown';

export const markdownComponents: Components = {
  h1: ({ children }) => <h1 style={{ color: '#00ff00', fontSize: '1.5rem', marginTop: 0 }}>{children}</h1>,
  h2: ({ children }) => <h2 style={{ color: '#00ff00', fontSize: '1.2rem', marginTop: '1.5rem' }}>{children}</h2>,
  h3: ({ children }) => <h3 style={{ color: '#00ff00', fontSize: '1rem', marginTop: '1.2rem' }}>{children}</h3>,
  p: ({ children }) => <p style={{ color: '#ccc', lineHeight: '1.6', marginBottom: '1rem' }}>{children}</p>,
  strong: ({ children }) => <strong style={{ color: '#fff' }}>{children}</strong>,
  em: ({ children }) => <em style={{ color: '#aaa' }}>{children}</em>,
  a: ({ href, children }) => {
    const isSafe = href && /^(https?|mailto|tel):|^\//i.test(href);
    return (
      <a href={isSafe ? href : '#'} style={{ color: '#00ff00', textDecoration: 'underline' }} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
  pre: ({ children }) => (
    <pre style={{ backgroundColor: '#0d0d1a', padding: '0.75rem', borderRadius: '4px', overflowX: 'auto', fontFamily: 'monospace' }}>
      {children}
    </pre>
  ),
  code: ({ children }) => (
    <code style={{ padding: '0.15rem 0.4rem', borderRadius: '3px', fontSize: '0.85rem', color: '#ffaa00' }}>
      {children}
    </code>
  ),
  blockquote: ({ children }) => (
    <blockquote style={{ borderLeft: '3px solid #00ff00', paddingLeft: '1rem', color: '#888', fontStyle: 'italic', margin: '1rem 0' }}>
      {children}
    </blockquote>
  ),
  ul: ({ children }) => <ul style={{ color: '#ccc', paddingLeft: '1.5rem' }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ color: '#ccc', paddingLeft: '1.5rem' }}>{children}</ol>,
  li: ({ children }) => <li style={{ marginBottom: '0.25rem' }}>{children}</li>,
  hr: () => <hr style={{ border: 'none', borderTop: '1px solid #333', margin: '1.5rem 0' }} />,
};