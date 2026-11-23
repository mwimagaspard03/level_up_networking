'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function EnrollButton({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function enroll() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/student/enrollments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ course_id: courseId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Inscription impossible.');
      setMessage('Inscription confirmée. Les leçons sont maintenant accessibles.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Inscription impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="assessment-action">
      <button className="button button--primary" disabled={busy} onClick={() => void enroll()}>
        {busy ? 'Inscription…' : 'S’inscrire au cours'}
      </button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
