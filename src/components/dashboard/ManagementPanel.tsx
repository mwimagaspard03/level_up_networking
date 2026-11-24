'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Profile = { id: string; display_name: string | null; role: 'OWNER' | 'ADMIN' | 'STUDENT'; created_at: string };
type Course = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  category: string;
  status: 'draft' | 'published';
};
type AuditEvent = { id: string; action: string; target_email: string | null; created_at: string };

const categories = [
  ['networking_fundamentals', 'Fondamentaux réseau'],
  ['ipv4_subnetting', 'IPv4 et subnetting'],
  ['ipv6', 'IPv6'],
  ['switching', 'Commutation'],
  ['routing', 'Routage'],
  ['packet_tracer', 'Packet Tracer'],
] as const;

async function send(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || 'Une erreur est survenue.');
  return data;
}

export default function ManagementPanel({ role }: { role: 'OWNER' | 'ADMIN' }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [logs, setLogs] = useState<AuditEvent[]>([]);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(true);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('networking_fundamentals');
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    try {
      const [profileData, courseData] = await Promise.all([
        send('/api/admin/profiles', 'GET'),
        send('/api/admin/courses', 'GET'),
      ]);
      setProfiles(profileData.profiles ?? []);
      setCourses(courseData.courses ?? []);
      if (role === 'OWNER') {
        const auditData = await send('/api/admin/audit-logs', 'GET');
        setLogs(auditData.events ?? []);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Chargement impossible.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function fetchInitialData() {
      try {
        const [profileData, courseData] = await Promise.all([
          send('/api/admin/profiles', 'GET'),
          send('/api/admin/courses', 'GET'),
        ]);
        if (!active) return;
        setProfiles(profileData.profiles ?? []);
        setCourses(courseData.courses ?? []);
        if (role === 'OWNER') {
          const auditData = await send('/api/admin/audit-logs', 'GET');
          if (!active) return;
          setLogs(auditData.events ?? []);
        }
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : 'Chargement impossible.');
      } finally {
        if (active) setBusy(false);
      }
    }
    void fetchInitialData();
    return () => { active = false; };
  }, [role]);

  function resetCourseForm() {
    setEditingCourseId(null);
    setTitle('');
    setSlug('');
    setDescription('');
    setCategory('networking_fundamentals');
  }

  async function saveCourse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const payload = { title, slug, description, category };
      if (editingCourseId) {
        await send(`/api/admin/courses/${editingCourseId}`, 'PATCH', payload);
        setMessage('Cours mis à jour.');
      } else {
        await send('/api/admin/courses', 'POST', { ...payload, status: 'draft' });
        setMessage('Cours créé en brouillon.');
      }
      resetCourseForm();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Enregistrement impossible.');
    } finally {
      setBusy(false);
    }
  }

  function editCourse(course: Course) {
    setEditingCourseId(course.id);
    setTitle(course.title);
    setSlug(course.slug);
    setDescription(course.description ?? '');
    setCategory(course.category);
  }

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get('email') ?? '');
    const inviteRole = String(data.get('role') ?? 'STUDENT');
    setBusy(true);
    setMessage('');
    try {
      await send('/api/admin/invitations', 'POST', { email, role: inviteRole });
      form.reset();
      setMessage('Invitation traitée. La livraison dépend de la configuration d’envoi.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Invitation impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(id: string, newRole: Profile['role']) {
    setBusy(true);
    setMessage('');
    try {
      await send('/api/admin/profiles/role', 'POST', { targetUserId: id, newRole });
      setMessage('Rôle mis à jour.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Modification impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function changeCourseStatus(course: Course, status: Course['status']) {
    setBusy(true);
    setMessage('');
    try {
      await send(`/api/admin/courses/${course.id}`, 'PATCH', { status });
      setMessage('Publication du cours mise à jour.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Modification impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function resendInvitation(userId: string) {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/invitations/resend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok && data.actionCompleted) {
        setMessage(data.message || 'Le renvoi a été traité; vérifiez le journal avant toute nouvelle tentative.');
        return;
      }
      if (!response.ok) throw new Error(data.message || 'Renvoi impossible.');
      setMessage(data.message || 'Renvoi d’invitation traité.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Renvoi impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteCourse(course: Course) {
    if (!window.confirm(`Supprimer « ${course.title} » et ses leçons, inscriptions, progressions et évaluations ?`)) return;
    setBusy(true);
    try {
      await send(`/api/admin/courses/${course.id}`, 'DELETE');
      setMessage('Cours supprimé.');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Suppression impossible.');
    } finally {
      setBusy(false);
    }
  }

  const filteredProfiles = profiles.filter((profile) =>
    (profile.display_name ?? '').toLowerCase().includes(query.toLowerCase()) || profile.id.includes(query),
  );

  return (
    <div className="management-stack">
      {message && <p className="management-message" role="status">{message}</p>}

      <section className="management-card">
        <div className="management-card__head">
          <div><p className="eyebrow">COMMUNAUTÉ</p><h2>Membres</h2></div>
          <span>{profiles.length} profils chargés</span>
        </div>
        <input aria-label="Rechercher un membre" placeholder="Nom ou identifiant…" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="management-list">
          {filteredProfiles.map((profile) => (
            <article className="management-row" key={profile.id}>
              <div><b>{profile.display_name || 'Membre sans nom'}</b><small>{profile.role} · {profile.id.slice(0, 8)}…</small></div>
              {role === 'OWNER' && <select aria-label={`Rôle de ${profile.display_name || profile.id}`} value={profile.role} disabled={busy} onChange={(event) => void changeRole(profile.id, event.target.value as Profile['role'])}>
                <option value="STUDENT">STUDENT</option><option value="ADMIN">ADMIN</option><option value="OWNER">OWNER</option>
              </select>}
              {profile.role !== 'OWNER' && <button className="button button--ghost button--small" disabled={busy} onClick={() => void resendInvitation(profile.id)}>Renvoyer l’invitation</button>}
            </article>
          ))}
          {!filteredProfiles.length && <p className="management-muted">Aucun membre correspondant.</p>}
        </div>
        <p className="management-muted">La liste est limitée aux 100 profils les plus récents.</p>
      </section>

      <section className="management-card">
        <p className="eyebrow">ACCÈS</p><h2>Inviter un membre</h2>
        <form className="management-form" onSubmit={invite}>
          <label>Adresse e-mail<input type="email" name="email" required maxLength={254} /></label>
          <label>Rôle<select name="role"><option value="STUDENT">Étudiant</option>{role === 'OWNER' && <option value="ADMIN">Administrateur</option>}</select></label>
          <button className="button button--primary" disabled={busy}>Envoyer l’invitation</button>
        </form>
      </section>

      <section className="management-card">
        <div className="management-card__head"><div><p className="eyebrow">FORMATION</p><h2>Cours</h2></div><span>{courses.length} cours</span></div>
        <form className="management-form" onSubmit={saveCourse}>
          <h3>{editingCourseId ? 'Modifier un cours' : 'Créer un cours'}</h3>
          <label>Titre<input value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={160} /></label>
          <label>Slug (URL)<input value={slug} onChange={(event) => setSlug(event.target.value)} required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={160} /></label>
          <label>Catégorie<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} /></label>
          <div className="management-row__actions">
            <button className="button button--primary" disabled={busy}>{editingCourseId ? 'Enregistrer' : 'Créer en brouillon'}</button>
            {editingCourseId && <button className="button button--ghost" type="button" onClick={resetCourseForm}>Annuler</button>}
          </div>
        </form>
        <div className="management-list">
          {courses.map((course) => (
            <article className="management-row" key={course.id}>
              <div><b>{course.title}</b><small>/{course.slug} · {course.status}</small></div>
              <div className="management-row__actions">
                <select aria-label={`Publication de ${course.title}`} disabled={busy} value={course.status} onChange={(event) => void changeCourseStatus(course, event.target.value as Course['status'])}><option value="draft">Brouillon</option><option value="published">Publié</option></select>
                <button className="button button--ghost button--small" disabled={busy} onClick={() => editCourse(course)}>Modifier</button>
                <Link className="text-link" href={`/dashboard/management/courses/${course.id}`}>Leçons et évaluations →</Link>
                <button className="button button--ghost button--small" disabled={busy} onClick={() => void deleteCourse(course)}>Supprimer</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {role === 'OWNER' && <section className="management-card">
        <p className="eyebrow">TRAÇABILITÉ</p><h2>Journal d’audit récent</h2>
        <div className="management-list">{logs.map((log) => <article className="management-row" key={log.id}><div><b>{log.action}</b><small>{log.target_email || 'Compte'} · {new Date(log.created_at).toLocaleString('fr-FR')}</small></div></article>)}{!logs.length && <p className="management-muted">Aucun événement disponible.</p>}</div>
      </section>}
    </div>
  );
}
