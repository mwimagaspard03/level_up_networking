'use client';

import { useEffect, useState } from 'react';
import type { AssessmentQuestion } from '@/src/lib/assessments/validation';

type LessonOption = { id: string; title: string };
type Assessment = {
  id: string;
  course_id: string;
  lesson_id: string | null;
  title: string;
  instructions: string;
  questions: AssessmentQuestion[];
  status: 'draft' | 'published';
};
type Attempt = {
  id: string;
  user_id: string;
  answers: Record<string, string>;
  score: number | null;
  feedback: string | null;
  submitted_at: string;
};
type EditorQuestion = {
  id: string;
  prompt: string;
  type: 'single_choice' | 'short_answer';
  optionsText: string;
  answer: string;
};

const emptyQuestion = (): EditorQuestion => ({ id: `q${Date.now().toString(36)}`, prompt: '', type: 'single_choice', optionsText: '', answer: '' });

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

export default function AssessmentManager({ courseId, lessons }: { courseId: string; lessons: LessonOption[] }) {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [answerKeys, setAnswerKeys] = useState<Record<string, Record<string, string>>>({});
  const [attempts, setAttempts] = useState<Record<string, Attempt[]>>({});
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [questions, setQuestions] = useState<EditorQuestion[]>([emptyQuestion()]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const data = await requestJson(`/api/admin/assessments?course_id=${courseId}`, 'GET');
      setAssessments(data.assessments ?? []);
      setAnswerKeys(data.answerKeys ?? {});
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Évaluations indisponibles.');
    }
  }

  useEffect(() => {
    let active = true;
    async function fetchAssessments() {
      try {
        const data = await requestJson(`/api/admin/assessments?course_id=${courseId}`, 'GET');
        if (!active) return;
        setAssessments(data.assessments ?? []);
        setAnswerKeys(data.answerKeys ?? {});
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : 'Évaluations indisponibles.');
      }
    }
    void fetchAssessments();
    return () => { active = false; };
  }, [courseId]);

  function resetForm() {
    setEditingId(null);
    setTitle('');
    setInstructions('');
    setLessonId('');
    setQuestions([emptyQuestion()]);
  }

  function updateQuestion(index: number, patch: Partial<EditorQuestion>) {
    setQuestions((current) => current.map((question, position) => position === index ? { ...question, ...patch } : question));
  }

  function beginEdit(assessment: Assessment) {
    const keys = answerKeys[assessment.id] ?? {};
    setEditingId(assessment.id);
    setTitle(assessment.title);
    setInstructions(assessment.instructions);
    setLessonId(assessment.lesson_id ?? '');
    setQuestions(assessment.questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      type: question.type,
      optionsText: question.options?.map((option) => option.text).join('\n') ?? '',
      answer: question.type === 'single_choice'
        ? question.options?.find((option) => option.id === keys[question.id])?.text ?? ''
        : keys[question.id] ?? '',
    })));
    setMessage('Modifiez les champs puis enregistrez l’évaluation.');
  }

  function buildPayload() {
    const publicQuestions: AssessmentQuestion[] = [];
    const answerKey: Record<string, string> = {};
    for (const question of questions) {
      if (question.type === 'single_choice') {
        const options = question.optionsText.split('\n').map((text) => text.trim()).filter(Boolean).map((text, index) => ({ id: `o${index + 1}`, text }));
        const expected = options.find((option) => option.text === question.answer);
        publicQuestions.push({ id: question.id, prompt: question.prompt, type: question.type, options });
        answerKey[question.id] = expected?.id ?? '';
      } else {
        publicQuestions.push({ id: question.id, prompt: question.prompt, type: question.type });
        answerKey[question.id] = question.answer;
      }
    }
    return {
      course_id: courseId,
      lesson_id: lessonId || null,
      title,
      instructions,
      questions: publicQuestions,
      answer_key: answerKey,
      status: 'draft' as const,
    };
  }

  async function saveAssessment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const payload = buildPayload();
      if (editingId) {
        await requestJson(`/api/admin/assessments/${editingId}`, 'PATCH', payload);
        setMessage('Évaluation mise à jour.');
      } else {
        await requestJson('/api/admin/assessments', 'POST', payload);
        setMessage('Évaluation créée en brouillon.');
      }
      resetForm();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(assessment: Assessment) {
    setBusy(true);
    setMessage('');
    try {
      await requestJson(`/api/admin/assessments/${assessment.id}`, 'PATCH', {
        course_id: assessment.course_id,
        lesson_id: assessment.lesson_id,
        title: assessment.title,
        instructions: assessment.instructions,
        questions: assessment.questions,
        answer_key: answerKeys[assessment.id],
        status: assessment.status === 'published' ? 'draft' : 'published',
      });
      setMessage('Publication mise à jour.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Modification impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(assessment: Assessment) {
    if (!window.confirm(`Supprimer « ${assessment.title} » et ses tentatives ?`)) return;
    setBusy(true);
    try {
      await requestJson(`/api/admin/assessments/${assessment.id}`, 'DELETE');
      setMessage('Évaluation supprimée.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Suppression impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function loadAttempts(assessmentId: string) {
    try {
      const data = await requestJson(`/api/admin/assessments/${assessmentId}/attempts`, 'GET');
      setAttempts((current) => ({ ...current, [assessmentId]: data.attempts ?? [] }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Tentatives indisponibles.');
    }
  }

  async function grade(assessmentId: string, attempt: Attempt, form: HTMLFormElement) {
    const formData = new FormData(form);
    setBusy(true);
    setMessage('');
    try {
      await requestJson(`/api/admin/assessments/${assessmentId}/attempts`, 'PATCH', {
        attempt_id: attempt.id,
        score: Number(formData.get('score')),
        feedback: String(formData.get('feedback') ?? ''),
      });
      setMessage('Correction enregistrée manuellement.');
      await loadAttempts(assessmentId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Correction impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="management-stack">
      {message && <p className="management-message" role="status">{message}</p>}
      <section className="management-card">
        <h2>Évaluations</h2>
        {assessments.map((assessment) => (
          <article className="assessment-admin-card" key={assessment.id}>
            <div className="management-row">
              <div><b>{assessment.title}</b><small>{assessment.status} · {assessment.lesson_id ? lessons.find((lesson) => lesson.id === assessment.lesson_id)?.title ?? 'Leçon liée' : 'Évaluation du cours'}</small></div>
              <div className="management-row__actions">
                <button className="button button--secondary button--small" disabled={busy} onClick={() => beginEdit(assessment)}>Modifier</button>
                <button className="button button--secondary button--small" disabled={busy} onClick={() => void changeStatus(assessment)}>{assessment.status === 'published' ? 'Dépublier' : 'Publier'}</button>
                <button className="button button--ghost button--small" disabled={busy} onClick={() => void remove(assessment)}>Supprimer</button>
                <button className="button button--ghost button--small" onClick={() => void loadAttempts(assessment.id)}>Tentatives</button>
              </div>
            </div>
            <details className="assessment-key-details">
              <summary>Clé de correction — visible uniquement au staff</summary>
              <ol>{assessment.questions.map((question, index) => <li key={question.id}>{index + 1}. {question.prompt} — <b>{question.type === 'single_choice' ? question.options?.find((option) => option.id === answerKeys[assessment.id]?.[question.id])?.text : answerKeys[assessment.id]?.[question.id]}</b></li>)}</ol>
            </details>
            {(attempts[assessment.id] ?? []).map((attempt) => (
              <article className="assessment-attempt" key={attempt.id}>
                <p><b>Étudiant {attempt.user_id.slice(0, 8)}…</b> · {new Date(attempt.submitted_at).toLocaleString('fr-FR')}</p>
                <ol>{assessment.questions.map((question) => <li key={question.id}>{question.prompt}<br /><span>{question.type === 'single_choice' ? question.options?.find((option) => option.id === attempt.answers[question.id])?.text : attempt.answers[question.id]}</span></li>)}</ol>
                <form className="management-form" onSubmit={(event) => { event.preventDefault(); void grade(assessment.id, attempt, event.currentTarget); }}>
                  <label>Note sur 100<input name="score" type="number" min="0" max="100" step="0.01" defaultValue={attempt.score ?? ''} required /></label>
                  <label>Commentaire<textarea name="feedback" maxLength={2000} defaultValue={attempt.feedback ?? ''} /></label>
                  <button className="button button--primary button--small" disabled={busy}>Enregistrer la correction</button>
                </form>
              </article>
            ))}
            {attempts[assessment.id]?.length === 0 && <p className="management-muted">Aucune tentative à corriger.</p>}
          </article>
        ))}
        {!assessments.length && <p className="management-muted">Aucune évaluation pour ce cours.</p>}
      </section>

      <section className="management-card">
        <h2>{editingId ? 'Modifier une évaluation' : 'Créer une évaluation'}</h2>
        <p className="management-muted">Les clés de correction sont stockées séparément et ne sont jamais envoyées aux étudiants. La notation reste manuelle.</p>
        <form className="management-form" onSubmit={saveAssessment}>
          <label>Titre<input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={160} /></label>
          <label>Leçon associée<select value={lessonId} onChange={(event) => setLessonId(event.target.value)}><option value="">Évaluation générale du cours</option>{lessons.map((lesson) => <option value={lesson.id} key={lesson.id}>{lesson.title}</option>)}</select></label>
          <label>Consignes<textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} maxLength={2000} /></label>
          {questions.map((question, index) => (
            <fieldset className="assessment-question" key={question.id}>
              <legend>Question {index + 1}</legend>
              <label>Énoncé<textarea value={question.prompt} onChange={(event) => updateQuestion(index, { prompt: event.target.value })} required maxLength={1000} /></label>
              <label>Type<select value={question.type} onChange={(event) => updateQuestion(index, { type: event.target.value as EditorQuestion['type'], answer: '', optionsText: '' })}><option value="single_choice">Choix unique</option><option value="short_answer">Réponse courte</option></select></label>
              {question.type === 'single_choice' ? <>
                <label>Choix proposés (un par ligne, 2 à 6)<textarea value={question.optionsText} onChange={(event) => updateQuestion(index, { optionsText: event.target.value })} required /></label>
                <label>Réponse attendue<select value={question.answer} onChange={(event) => updateQuestion(index, { answer: event.target.value })} required><option value="">Choisir une option</option>{question.optionsText.split('\n').map((text) => text.trim()).filter(Boolean).map((text, optionIndex) => <option value={text} key={`${optionIndex}-${text}`}>{text}</option>)}</select></label>
              </> : <label>Réponse attendue (privée)<textarea value={question.answer} onChange={(event) => updateQuestion(index, { answer: event.target.value })} required maxLength={1000} /></label>}
              {questions.length > 1 && <button className="button button--ghost button--small" type="button" onClick={() => setQuestions((current) => current.filter((_, position) => position !== index))}>Retirer cette question</button>}
            </fieldset>
          ))}
          <div className="management-row__actions">
            <button className="button button--secondary" type="button" disabled={questions.length >= 10} onClick={() => setQuestions((current) => [...current, emptyQuestion()])}>Ajouter une question</button>
            <button className="button button--primary" disabled={busy}>{busy ? 'Enregistrement…' : editingId ? 'Enregistrer les modifications' : 'Créer en brouillon'}</button>
            {editingId && <button className="button button--ghost" type="button" onClick={resetForm}>Annuler</button>}
          </div>
        </form>
      </section>
    </div>
  );
}
