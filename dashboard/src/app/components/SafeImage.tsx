'use client';
import { useState } from 'react';

export default function SafeImage({ src, alt, style }: { src: string; alt: string; style?: React.CSSProperties }) {
  const [error, setError] = useState(false);
  if (error) return null;
  return <img src={src} alt={alt} style={style} onError={() => setError(true)} />;
}
