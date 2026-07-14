'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import StoryBuilder from './StoryBuilder';

function StoryBuilderInner() {
  const searchParams = useSearchParams();
  const planId = searchParams.get('planId');
  return <StoryBuilder initialPlanId={planId} />;
}

export default function StoryBuilderPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', color: 'var(--muted)' }}>Loading story builder...</div>}>
      <StoryBuilderInner />
    </Suspense>
  );
}
