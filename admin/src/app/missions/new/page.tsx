'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function MissionNewRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/story-builder');
  }, [router]);
  return (
    <main>
      <p>Redirecting to Story Builder…</p>
    </main>
  );
}
