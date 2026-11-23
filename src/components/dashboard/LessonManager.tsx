'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Lesson = { id: string; title: string; slug: string; content: string; status: 'draft' | 'published'; sort_order: number };

async function call(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || 'Opération impossible.');
  return data;
}

export default function LessonManager({ courseId, initial }: { courseId: string; initial: Lesson[] }) {
  const router = useRouter();
  const [lessons, setLessons] = useState(initial);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [content, setContent] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  function resetForm() {
    setEditingId(null);
    setTitle('');
    setSlug('');
    setContent('');
  }

  function edit(lesson: Lesson) {
    setEditingId(lesson.id);
    setTitle(lesson.title);
    setSlug(lesson.slug);
    setContent(lesson.content);
    setMessage('Modifiez les champs puis enregistrez la leçon.');
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (editingId) {
        await call(`/api/admin/lessons/${editingId}`, 'PATCH', { title, slug, content });
        setLessons((current) => current.map((lesson) => lesson.id === editingId ? { ...lesson, title, slug, content } : lesson));
        setMessage('Leçon mise à jour.');
      } else {
        const data = await call('/api/admin/lessons', 'POST', {
          course_id: courseId,
          title,
          slug,
          content,
          status: 'draft',
          sort_order: lessons.length,
        });
        setLessons((current) => [...current, { id: data.id, title, slug, content, status: 'draft', sort_order: current.length }]);
        setMessage('Leçon créée en brouillon.');
      }
      resetForm();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(lesson: Lesson) {
    setBusy(true);
    setMessage('');
    try {
      const status = lesson.status === 'published' ? 'draft' : 'published';
      await call(`/api/admin/lessons/${lesson.id}`, 'PATCH', { status });
      setLessons((current) => current.map((item) => item.id === lesson.id ? { ...item, status } : item));
      setMessage(`Leçon ${status === 'published' ? 'publiée' : 'dépubliée'}.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Publication impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(lesson: Lesson) {
    if (!window.confirm(`Supprimer « ${lesson.title} » et sa progression associée ?`)) return;
    setBusy(true);
    setMessage('');
    try {
      await call(`/api/admin/lessons/${lesson.id}`, 'DELETE');
      setLessons((current) => current.filter((item) => item.id !== lesson.id));
      if (editingId === lesson.id) resetForm();
      setMessage('Leçon supprimée.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Suppression impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function move(index: number, offset: -1 | 1) {
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= lessons.length) return;
    const reordered = [...lessons];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    setBusy(true);
    setMessage('');
    try {
      await Promise.all(reordered.map((lesson, position) =>
        call(`/api/admin/lessons/${lesson.id}`, 'PATCH', { sort_order: position }),
      ));
      setLessons(reordered.map((lesson, position) => ({ ...lesson, sort_order: position })));
      setMessage('Ordre des leçons enregistré.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Réordonnancement impossible. Actualisez pour vérifier l’ordre sauvegardé.');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="management-stack">
      <h2>Leçons</h2>
      {message && <p className="management-message" role="status">{message}</p>}
      <div className="management-list">
        {lessons.map((lesson, index) => (
          <article className="management-row" key={lesson.id}>
            <div><b>{index + 1}. {lesson.title}</b><small>{lesson.slug} · {lesson.status}</small></div>
            <div className="management-row__actions">
              <button className="button button--ghost button--small" type="button" disabled={busy || index === 0} aria-label={`Monter ${lesson.title}`} onClick={() => void move(index, -1)}>↑</button>
              <button className="button button--ghost button--small" type="button" disabled={busy || index === lessons.length - 1} aria-label={`Descendre ${lesson.title}`} onClick={() => void move(index, 1)}>↓</button>
              <button className="button button--secondary button--small" type="button" disabled={busy} onClick={() => edit(lesson)}>Modifier</button>
              <button className="button button--secondary button--small" type="button" disabled={busy} onClick={() => void changeStatus(lesson)}>{lesson.status === 'published' ? 'Dépublier' : 'Publier'}</button>
              <button className="button button--ghost button--small" type="button" disabled={busy} onClick={() => void remove(lesson)}>Supprimer</button>
            </div>
          </article>
        ))}
        {!lessons.length && <p className="management-muted">Aucune leçon pour ce cours.</p>}
      </div>
      <form className="management-form" onSubmit={save}>
        <h3>{editingId ? 'Modifier la leçon' : 'Ajouter une leçon'}</h3>
        <label>Titre<input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label>Slug<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={160} value={slug} onChange={(event) => setSlug(event.target.value)} /></label>
        <label>Contenu<textarea required maxLength={50000} value={content} onChange={(event) => setContent(event.target.value)} /></label>
        <div className="management-row__actions">
          <button className="button button--primary" disabled={busy}>{busy ? 'Enregistrement…' : editingId ? 'Enregistrer les modifications' : 'Créer la leçon'}</button>
          {editingId && <button className="button button--ghost" type="button" onClick={resetForm}>Annuler</button>}
        </div>
      </form>
    </div>
  );
}
