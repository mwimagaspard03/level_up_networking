'use client';

import { useEffect, useState } from 'react';
import type { AssessmentQuestion } from '@/src/lib/assessments/validation';

type Attempt = {
  id: string;
  score: number | null;
  feedback: string | null;
  submitted_at: string;
};

type Props = {
  assessment: {
    id: string;
    title: string;
    instructions: string;
    questions: AssessmentQuestion[];
  };
};

async function requestJson(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Opération impossible.');
  return data;
}

export default function AssessmentTaker({ assessment }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadAttempts() {
    try {
      const data = await requestJson(`/api/student/assessments/attempts?assessment_id=${assessment.id}`, 'GET');
      setAttempts(data.attempts ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Résultats indisponibles.');
    }
  }

  useEffect(() => {
    let active = true;
    async function fetchAttempts() {
      try {
        const data = await requestJson(`/api/student/assessments/attempts?assessment_id=${assessment.id}`, 'GET');
        if (active) setAttempts(data.attempts ?? []);
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : 'Résultats indisponibles.');
      }
    }
    void fetchAttempts();
    return () => { active = false; };
  }, [assessment.id]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await requestJson('/api/student/assessments/attempts', 'POST', {
        assessment_id: assessment.id,
        answers,
      });
      setAnswers({});
      setMessage('Réponses envoyées. La correction sera faite manuellement par l’équipe.');
      await loadAttempts();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Envoi impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="assessment-card" aria-labelledby={`assessment-${assessment.id}`}>
      <h3 id={`assessment-${assessment.id}`}>{assessment.title}</h3>
      {assessment.instructions && <p>{assessment.instructions}</p>}
      <form className="management-form" onSubmit={submit}>
        {assessment.questions.map((question, index) => (
          <fieldset className="assessment-question" key={question.id}>
            <legend>{index + 1}. {question.prompt}</legend>
            {question.type === 'single_choice' ? question.options?.map((option) => (
              <label className="assessment-option" key={option.id}>
                <input
                  type="radio"
                  name={`${assessment.id}-${question.id}`}
                  value={option.id}
                  required
                  checked={answers[question.id] === option.id}
                  onChange={() => setAnswers((current) => ({ ...current, [question.id]: option.id }))}
                />
                {option.text}
              </label>
            )) : (
              <label>
                Votre réponse
                <textarea
                  required
                  maxLength={1000}
                  value={answers[question.id] ?? ''}
                  onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                />
              </label>
            )}
          </fieldset>
        ))}
        <button className="button button--primary" disabled={busy}>
          {busy ? 'Envoi…' : 'Envoyer pour correction'}
        </button>
      </form>
      {message && <p className="management-message" role="status">{message}</p>}
      <div className="assessment-results">
        <h4>Mes tentatives</h4>
        {attempts.length ? attempts.map((attempt) => (
          <article className="assessment-result" key={attempt.id}>
            <b>{new Date(attempt.submitted_at).toLocaleDateString('fr-FR')} · {attempt.score === null ? 'En attente de correction' : `${attempt.score}/100`}</b>
            {attempt.feedback && <p>{attempt.feedback}</p>}
          </article>
        )) : <p className="management-muted">Aucune tentative enregistrée.</p>}
      </div>
    </section>
  );
}
