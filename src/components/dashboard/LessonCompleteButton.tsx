'use client';

import { useState } from 'react';

export default function LessonCompleteButton({ lessonId, completed }: { lessonId: string; completed: boolean }) {
  const [done, setDone] = useState(completed);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function toggle() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/student/progress', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lesson_id: lessonId, completed: !done }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Progression non enregistrée.');
      setDone((current) => !current);
      setMessage('Progression enregistrée.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erreur de progression.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="assessment-action">
      <button className="button button--primary" type="button" disabled={busy} aria-pressed={done} onClick={() => void toggle()}>
        {busy ? 'Enregistrement…' : done ? 'Leçon terminée ✓' : 'Marquer comme terminée'}
      </button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
